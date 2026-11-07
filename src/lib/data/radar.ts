import "server-only";
// Радар рисков: студенты области сотрудника, которым нужна помощь в текущем семестре.
// Область видимости: staff.facultyId (null = все факультеты). Все расчёты набором запросов-агрегатов, без N+1.
import { and, asc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff } from "@/lib/auth/dal";
import { getSemester } from "@/lib/academic";
import { courseProgress, type CourseStanding } from "@/lib/grades";
import { ACTIVE_STATUSES, getRequestType } from "@/lib/requests/catalog";
import type { RequestStatus } from "@/db/schema";
import { DAY_MS, formatDayMonth, plural } from "@/lib/time";
import { formatPoints } from "@/lib/utils";

/** Демо-правила радара: веса и пороги в одном месте, легко поменять. */
export const RADAR_RULES = {
  /** заявка в «Нужно уточнение» без ответа студента дольше N дней */
  staleDays: 2,
  /** средний результат по проверенным точкам семестра */
  lowAverage: 0.65,
  veryLowAverage: 0.6,
  minGradedForAverage: 3,
  weight: { debt: 40, critical: 30, risk: 10, veryLowAverage: 20, lowAverage: 10, staleRequest: 10 },
  /** дисциплины «ниже 60 %» в балле учитываем не больше N, чтобы много слабых точек не перевешивало долг */
  riskCounted: 3,
  highFrom: 50,
  mediumFrom: 20,
  /** сколько дисциплин «ниже 60 %» перечислять поимённо */
  riskListed: 3,
} as const;

export type RiskLevel = "high" | "medium" | "low";
export type RiskReasonKind = "debt" | "critical" | "risk" | "average" | "request";
export type RiskReason = { kind: RiskReasonKind; text: string };

export const RISK_LEVEL_META: Record<RiskLevel, { label: string; tone: "danger" | "warning" | "neutral" }> = {
  high: { label: "Высокий", tone: "danger" },
  medium: { label: "Средний", tone: "warning" },
  low: { label: "Низкий", tone: "neutral" },
};

export type RadarEntry = {
  studentId: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  groupId: string;
  groupCode: string;
  facultyCode: string;
  course: number;
  level: RiskLevel;
  score: number;
  reasons: RiskReason[];
};

/** Подробности для черновика сообщения: только факты из БД, без чужих данных. */
export type RiskProfile = RadarEntry & {
  office: { room: string; hours: string; code: string };
  debts: { title: string; semester: number; retakeAt: Date | null; retakeRoom: string | null }[];
  weakCourses: { title: string; earned: number; possible: number; standing: CourseStanding; teacher: string }[];
  staleRequests: { number: string; title: string; days: number }[];
  /** открытые заявки на пересдачу (только для профиля одного студента) */
  retakeRequests: { number: string; status: RequestStatus }[];
  averagePercent: number | null;
};

const Id = z.string().uuid();

function scope(facultyId: string | null): SQL | undefined {
  return facultyId ? eq(s.groups.facultyId, facultyId) : undefined;
}

type Filter = { facultyId: string | null; groupId?: string; studentId?: string };

async function collect(f: Filter, now: Date): Promise<RiskProfile[]> {
  const where = (...extra: (SQL | undefined)[]) =>
    and(scope(f.facultyId), f.groupId ? eq(s.groups.id, f.groupId) : undefined, f.studentId ? eq(s.students.id, f.studentId) : undefined, ...extra);
  // Номер текущего семестра студента: (курс - 1) * 2 + 1 осенью, + 2 весной (как semesterNumber в academic.ts)
  const semOffset = getSemester(now).kind === "autumn" ? 1 : 2;
  const staleCutoff = new Date(now.getTime() - RADAR_RULES.staleDays * DAY_MS);
  const askedAt = sql<Date>`coalesce((select max(e.created_at) from ${s.requestEvents} e where e.request_id = ${s.requests.id} and e.status = 'needs_info'), ${s.requests.updatedAt})`;

  const [students, courses, debts, stale, retakes] = await Promise.all([
    db
      .select({
        id: s.students.id,
        lastName: s.students.lastName,
        firstName: s.students.firstName,
        middleName: s.students.middleName,
        groupId: s.groups.id,
        groupCode: s.groups.code,
        course: s.groups.course,
        facultyCode: s.faculties.code,
        officeRoom: s.faculties.officeRoom,
        officeHours: s.faculties.officeHours,
      })
      .from(s.students)
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId))
      .where(where()),

    // Баллы по дисциплинам текущего семестра: набрано и «можно было набрать» по проверенным точкам (как в data/grades.ts)
    db
      .select({
        studentId: s.enrollments.studentId,
        title: s.disciplines.name,
        tLast: s.teachers.lastName,
        tFirst: s.teachers.firstName,
        tMiddle: s.teachers.middleName,
        earned: sql<number>`coalesce(sum(${s.scores.points}), 0)::float8`.mapWith(Number),
        possible: sql<number>`coalesce(sum(${s.assessments.maxPoints}) filter (where ${s.scores.points} is not null), 0)::int`.mapWith(Number),
      })
      .from(s.enrollments)
      .innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .innerJoin(s.courses, and(eq(s.courses.id, s.enrollments.courseId), sql`${s.courses.semester} = (${s.groups.course} - 1) * 2 + ${semOffset}`))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
      .innerJoin(s.assessments, eq(s.assessments.courseId, s.courses.id))
      .leftJoin(s.scores, and(eq(s.scores.assessmentId, s.assessments.id), eq(s.scores.studentId, s.enrollments.studentId)))
      .where(where())
      .groupBy(s.enrollments.studentId, s.courses.id, s.disciplines.id, s.teachers.id),

    // Академические долги: итоговая «2» или «не зачтено» (после пересдачи строка обновляется)
    db
      .select({
        studentId: s.finalGrades.studentId,
        title: s.disciplines.name,
        semester: s.courses.semester,
        retakeAt: s.finalGrades.retakeAt,
        retakeRoom: s.finalGrades.retakeRoom,
      })
      .from(s.finalGrades)
      .innerJoin(s.students, eq(s.students.id, s.finalGrades.studentId))
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .innerJoin(s.courses, eq(s.courses.id, s.finalGrades.courseId))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .where(where(inArray(s.finalGrades.mark, ["2", "fail"])))
      .orderBy(asc(s.courses.semester), asc(s.disciplines.name)),

    // Заявки «Нужно уточнение», на которые студент не ответил дольше staleDays
    db
      .select({ studentId: s.requests.studentId, number: s.requests.number, type: s.requests.type, askedAt: askedAt.mapWith(s.requests.updatedAt) })
      .from(s.requests)
      .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .where(
        where(
          eq(s.requests.status, "needs_info"),
          lt(askedAt, staleCutoff),
          sql`not exists (select 1 from ${s.requestEvents} e2 where e2.request_id = ${s.requests.id} and e2.actor = 'student' and e2.created_at > ${askedAt})`,
        ),
      )
      .orderBy(asc(askedAt)),

    // Открытые заявки на пересдачу: чтобы черновик не предлагал подать заявление повторно
    f.studentId
      ? db
          .select({ studentId: s.requests.studentId, number: s.requests.number, status: s.requests.status })
          .from(s.requests)
          .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
          .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
          .where(where(eq(s.requests.type, "retake"), inArray(s.requests.status, ACTIVE_STATUSES)))
          .orderBy(asc(s.requests.createdAt))
      : Promise.resolve([]),
  ]);

  const byStudent = <T extends { studentId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.studentId);
      if (list) list.push(r);
      else m.set(r.studentId, [r]);
    }
    return m;
  };
  const coursesBy = byStudent(courses);
  const debtsBy = byStudent(debts);
  const staleBy = byStudent(stale);
  const retakesBy = byStudent(retakes);
  const W = RADAR_RULES.weight;

  const out: RiskProfile[] = [];
  for (const st of students) {
    const graded = (coursesBy.get(st.id) ?? [])
      .filter((c) => c.possible > 0)
      .map((c) => ({ ...c, ...courseProgress(c.earned, c.possible) }))
      .sort((a, b) => a.ratio - b.ratio);
    const critical = graded.filter((c) => c.standing === "critical");
    const risk = graded.filter((c) => c.standing === "risk");
    const myDebts = debtsBy.get(st.id) ?? [];
    const myStale = (staleBy.get(st.id) ?? []).map((r) => ({
      number: r.number,
      title: getRequestType(r.type)?.title ?? "Заявка",
      days: Math.max(RADAR_RULES.staleDays, Math.floor((now.getTime() - r.askedAt.getTime()) / DAY_MS)),
    }));
    const avg = graded.length >= RADAR_RULES.minGradedForAverage ? graded.reduce((a, c) => a + c.ratio, 0) / graded.length : null;
    // процент вниз, чтобы «ниже 65 %» не показывалось как «65 %»
    const avgPercent = avg === null ? null : Math.floor(avg * 100);

    let score = myDebts.length * W.debt + critical.length * W.critical + Math.min(risk.length, RADAR_RULES.riskCounted) * W.risk + myStale.length * W.staleRequest;
    const reasons: RiskReason[] = [];
    for (const d of myDebts) {
      const retake = d.retakeAt && d.retakeAt > now ? `, пересдача ${formatDayMonth(d.retakeAt)}` : "";
      reasons.push({ kind: "debt", text: `Долг: ${d.title}${retake}` });
    }
    for (const c of critical) reasons.push({ kind: "critical", text: `${c.title}: ${formatPoints(c.earned)} из ${c.possible}, допуск под угрозой` });
    const listed = risk.length > RADAR_RULES.riskListed ? risk.slice(0, RADAR_RULES.riskListed - 1) : risk;
    for (const c of listed) reasons.push({ kind: "risk", text: `${c.title}: ${formatPoints(c.earned)} из ${c.possible}, ниже 60 %` });
    const rest = risk.length - listed.length;
    if (rest > 0) reasons.push({ kind: "risk", text: `Ещё ${rest} ${plural(rest, "дисциплина", "дисциплины", "дисциплин")} ниже 60 %` });
    if (avg !== null && avg < RADAR_RULES.lowAverage) {
      score += avg < RADAR_RULES.veryLowAverage ? W.veryLowAverage : W.lowAverage;
      reasons.push({ kind: "average", text: `Средний результат за семестр ${avgPercent} %` });
    }
    for (const r of myStale) reasons.push({ kind: "request", text: `Заявка ${r.number} «${r.title}» ждёт ответа студента ${r.days} ${plural(r.days, "день", "дня", "дней")}` });

    if (score <= 0) continue;
    const level: RiskLevel = myDebts.length || critical.length || score >= RADAR_RULES.highFrom ? "high" : score >= RADAR_RULES.mediumFrom ? "medium" : "low";
    out.push({
      studentId: st.id,
      lastName: st.lastName,
      firstName: st.firstName,
      middleName: st.middleName,
      groupId: st.groupId,
      groupCode: st.groupCode,
      facultyCode: st.facultyCode,
      course: st.course,
      level,
      score,
      reasons,
      office: { room: st.officeRoom, hours: st.officeHours, code: st.facultyCode },
      debts: myDebts.map((d) => ({ title: d.title, semester: d.semester, retakeAt: d.retakeAt && d.retakeAt > now ? d.retakeAt : null, retakeRoom: d.retakeRoom })),
      weakCourses: [...critical, ...risk].map((c) => ({
        title: c.title,
        earned: c.earned,
        possible: c.possible,
        standing: c.standing,
        teacher: `${c.tLast} ${c.tFirst[0]}.${c.tMiddle ? ` ${c.tMiddle[0]}.` : ""}`,
      })),
      staleRequests: myStale,
      retakeRequests: (retakesBy.get(st.id) ?? []).map((r) => ({ number: r.number, status: r.status })),
      averagePercent: avgPercent,
    });
  }

  const avgOf = (p: RiskProfile) => p.averagePercent ?? 100;
  return out.sort((a, b) => b.score - a.score || avgOf(a) - avgOf(b) || a.lastName.localeCompare(b.lastName, "ru"));
}

function toEntry(p: RiskProfile): RadarEntry {
  return {
    studentId: p.studentId,
    lastName: p.lastName,
    firstName: p.firstName,
    middleName: p.middleName,
    groupId: p.groupId,
    groupCode: p.groupCode,
    facultyCode: p.facultyCode,
    course: p.course,
    level: p.level,
    score: p.score,
    reasons: p.reasons,
  };
}

/** Радар по области сотрудника (опционально по одной группе). Группа вне области даст пустой список. */
export async function getRiskRadar(opts: { groupId?: string } = {}) {
  const { staff } = await requireStaff();
  const now = new Date();
  const groupId = opts.groupId && Id.safeParse(opts.groupId).success ? opts.groupId : undefined;
  const [profiles, [{ total }]] = await Promise.all([
    collect({ facultyId: staff.facultyId, groupId }, now),
    db
      .select({ total: sql<number>`count(*)::int`.mapWith(Number) })
      .from(s.students)
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .where(and(scope(staff.facultyId), groupId ? eq(s.groups.id, groupId) : undefined)),
  ]);
  const entries = profiles.map(toEntry);
  const counts: Record<RiskLevel, number> = { high: 0, medium: 0, low: 0 };
  for (const e of entries) counts[e.level]++;
  return { entries, counts, total };
}

/** Профиль риска одного студента. null, если студент вне области сотрудника или рисков нет. */
export async function getScopedRiskProfile(studentId: string): Promise<RiskProfile | null> {
  const { staff } = await requireStaff();
  if (!Id.safeParse(studentId).success) return null;
  const [p] = await collect({ facultyId: staff.facultyId, studentId }, new Date());
  return p ?? null;
}

/** Получатель сообщения: студент в области сотрудника. null вне области. */
export async function getScopedStudentRecipient(studentId: string) {
  const { staff } = await requireStaff();
  if (!Id.safeParse(studentId).success) return null;
  const [row] = await db
    .select({ userId: s.students.userId, firstName: s.students.firstName, lastName: s.students.lastName })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(and(eq(s.students.id, studentId), scope(staff.facultyId)));
  return row ?? null;
}
