import "server-only";
// Пересдачи. Студент видит только свои направления (studentId из сессии).
// Сотрудник работает в своей области: staff.facultyId (null = все факультеты); все id из форм перепроверяются здесь.
// Доска собирается набором запросов без N+1: долги, пересдачи области, направления этих пересдач.
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff, requireStudent } from "@/lib/auth/dal";
import type { ControlType, RetakeStatus } from "@/db/schema";
import { isHoliday } from "@/lib/academic";
import { MARK_LABEL, type Mark } from "@/lib/grades";
import { ACTIVE_STATUSES } from "@/lib/requests/catalog";
import {
  failMark,
  isPassResult,
  PASS_MIN_POINTS,
  pointsError,
  referralNumber,
  RETAKE_RULES,
  timeToMinutes,
  type RetakeResult,
} from "@/lib/retakes";
import { addDays, addMinutes, dayKey, diffDays, formatDateTime, formatDayMonth, formatTime, mskDate, mskParts, plural, startOfMskDay, WEEKDAYS_SHORT } from "@/lib/time";
import { fullName, shortName } from "@/lib/utils";
import { notify } from "./notify";
import { audit, auditMany } from "@/lib/audit";
import { gradeText } from "@/lib/notify-text";

const Id = z.string().uuid();
const FAILING = ["2", "fail"];

function scope(facultyId: string | null): SQL | undefined {
  return facultyId ? eq(s.groups.facultyId, facultyId) : undefined;
}

const overlaps = (a0: Date, a1: Date, b0: Date, b1: Date) => a0 < b1 && b0 < a1;
const retakeEnd = (startsAt: Date) => addMinutes(startsAt, RETAKE_RULES.durationMin);
/** «пт, 20 ноября, 16:15» */
const whenText = (d: Date) => `${WEEKDAYS_SHORT[mskParts(d).wd].toLowerCase()}, ${formatDateTime(d)}`;

export type ActionResult = { ok: string; error?: undefined } | { error: string; ok?: undefined };

// ───────────────────────── Студент ─────────────────────────

export type MyRetake = {
  id: string;
  number: string;
  status: RetakeStatus;
  courseId: string;
  attempt: number;
  startsAt: Date;
  room: string;
  commission: string[];
};

/** Мои направления на пересдачу (только выпущенные), новые сверху. */
export async function listMyRetakeReferrals(): Promise<MyRetake[]> {
  const { student } = await requireStudent();
  return db
    .select({
      id: s.retakeReferrals.id,
      number: s.retakeReferrals.number,
      status: s.retakeReferrals.status,
      courseId: s.retakeSessions.courseId,
      attempt: s.retakeSessions.attempt,
      startsAt: s.retakeSessions.startsAt,
      room: s.retakeSessions.room,
      commission: s.retakeSessions.commission,
    })
    .from(s.retakeReferrals)
    .innerJoin(s.retakeSessions, eq(s.retakeSessions.id, s.retakeReferrals.retakeSessionId))
    .where(and(eq(s.retakeReferrals.studentId, student.id), isNotNull(s.retakeSessions.publishedAt)))
    .orderBy(desc(s.retakeSessions.startsAt));
}

/** Направление для печати. Чужое, несуществующее или невыпущенное 404. */
export async function getMyRetakeReferral(id: string) {
  const { student, group, faculty } = await requireStudent();
  if (!Id.safeParse(id).success) notFound();
  const [row] = await db
    .select({
      id: s.retakeReferrals.id,
      number: s.retakeReferrals.number,
      status: s.retakeReferrals.status,
      resultMark: s.retakeReferrals.resultMark,
      issuedAt: s.retakeReferrals.createdAt,
      attempt: s.retakeSessions.attempt,
      startsAt: s.retakeSessions.startsAt,
      room: s.retakeSessions.room,
      commission: s.retakeSessions.commission,
      note: s.retakeSessions.note,
      courseId: s.courses.id,
      semester: s.courses.semester,
      controlType: s.courses.controlType,
      discipline: s.disciplines.name,
      signerFirst: s.staff.firstName,
      signerLast: s.staff.lastName,
      signerPosition: s.staff.position,
    })
    .from(s.retakeReferrals)
    .innerJoin(s.retakeSessions, eq(s.retakeSessions.id, s.retakeReferrals.retakeSessionId))
    .innerJoin(s.courses, eq(s.courses.id, s.retakeSessions.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .leftJoin(s.staff, eq(s.staff.id, s.retakeSessions.createdByStaffId))
    .where(and(eq(s.retakeReferrals.id, id), eq(s.retakeReferrals.studentId, student.id), isNotNull(s.retakeSessions.publishedAt)));
  if (!row) notFound();
  return { referral: row, student, group, faculty };
}

// ───────────────────────── Сотрудник: доска ─────────────────────────

export type BoardStudent = { studentId: string; name: string; short: string; points: number };

export type DebtGroup = {
  key: string;
  courseId: string;
  groupCode: string;
  facultyCode: string;
  discipline: string;
  semester: number;
  controlType: ControlType;
  langGroup: string | null;
  teacher: string;
  /** номер следующей попытки: 2, 3; больше 3, попытки исчерпаны */
  attempt: number;
  students: BoardStudent[];
  session: { id: string; startsAt: Date; room: string; state: "draft" | "published" | "awaiting" } | null;
};

export type BoardReferral = {
  id: string;
  number: string;
  studentId: string;
  name: string;
  short: string;
  status: RetakeStatus;
  resultMark: string | null;
  resultPoints: number | null;
};

export type BoardSession = {
  id: string;
  courseId: string;
  discipline: string;
  groupCode: string;
  facultyCode: string;
  controlType: ControlType;
  semester: number;
  attempt: number;
  startsAt: Date;
  room: string;
  commission: string[];
  note: string | null;
  publishedAt: Date | null;
  referrals: BoardReferral[];
  /** должники без направления: у черновика им уйдут направления, у выпущенной пересдачи это новые должники */
  pending: BoardStudent[];
};

export type RetakeBoard = {
  stats: { debts: number; students: number; scheduled: number; noDate: number; inDrafts: number; awaiting: number };
  groups: DebtGroup[];
  /** будущие пересдачи и черновики (в том числе с прошедшей датой) */
  upcoming: BoardSession[];
  /** прошедшие выпущенные пересдачи: здесь вносят результат */
  results: BoardSession[];
};

export async function getRetakeBoard(): Promise<RetakeBoard> {
  const { staff } = await requireStaff();
  const now = new Date();
  const cutoff = addDays(now, -60);

  const [debts, sessions] = await Promise.all([
    db
      .select({
        fgId: s.finalGrades.id,
        studentId: s.students.id,
        lastName: s.students.lastName,
        firstName: s.students.firstName,
        middleName: s.students.middleName,
        attempt: s.finalGrades.attempt,
        points: s.finalGrades.points,
        courseId: s.courses.id,
        groupCode: s.groups.code,
        facultyCode: s.faculties.code,
        discipline: s.disciplines.name,
        semester: s.courses.semester,
        controlType: s.courses.controlType,
        langGroup: s.courses.langGroup,
        tLast: s.teachers.lastName,
        tFirst: s.teachers.firstName,
        tMiddle: s.teachers.middleName,
      })
      .from(s.finalGrades)
      .innerJoin(s.students, eq(s.students.id, s.finalGrades.studentId))
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId))
      .innerJoin(s.courses, eq(s.courses.id, s.finalGrades.courseId))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
      .where(and(scope(staff.facultyId), inArray(s.finalGrades.mark, FAILING)))
      .orderBy(asc(s.groups.code), asc(s.disciplines.name), asc(s.students.lastName), asc(s.students.firstName)),
    db
      .select({
        id: s.retakeSessions.id,
        courseId: s.retakeSessions.courseId,
        attempt: s.retakeSessions.attempt,
        startsAt: s.retakeSessions.startsAt,
        room: s.retakeSessions.room,
        commission: s.retakeSessions.commission,
        note: s.retakeSessions.note,
        publishedAt: s.retakeSessions.publishedAt,
        discipline: s.disciplines.name,
        groupCode: s.groups.code,
        facultyCode: s.faculties.code,
        controlType: s.courses.controlType,
        semester: s.courses.semester,
      })
      .from(s.retakeSessions)
      .innerJoin(s.courses, eq(s.courses.id, s.retakeSessions.courseId))
      .innerJoin(s.groups, eq(s.groups.id, s.courses.groupId))
      .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .where(
        and(
          scope(staff.facultyId),
          or(
            gte(s.retakeSessions.startsAt, cutoff),
            isNull(s.retakeSessions.publishedAt),
            sql`exists (select 1 from ${s.retakeReferrals} r where r.retake_session_id = ${s.retakeSessions.id} and r.status = 'issued')`,
          ),
        ),
      )
      .orderBy(asc(s.retakeSessions.startsAt)),
  ]);

  const referrals = sessions.length
    ? await db
        .select({
          id: s.retakeReferrals.id,
          sessionId: s.retakeReferrals.retakeSessionId,
          number: s.retakeReferrals.number,
          studentId: s.retakeReferrals.studentId,
          status: s.retakeReferrals.status,
          resultMark: s.retakeReferrals.resultMark,
          resultPoints: s.retakeReferrals.resultPoints,
          lastName: s.students.lastName,
          firstName: s.students.firstName,
          middleName: s.students.middleName,
        })
        .from(s.retakeReferrals)
        .innerJoin(s.students, eq(s.students.id, s.retakeReferrals.studentId))
        .where(inArray(s.retakeReferrals.retakeSessionId, sessions.map((x) => x.id)))
        .orderBy(asc(s.students.lastName), asc(s.students.firstName))
    : [];

  const sessionById = new Map(sessions.map((x) => [x.id, x]));
  const refsBySession = new Map<string, BoardReferral[]>();
  /** `${studentId}:${courseId}` с действующим направлением (ещё без результата) */
  const issued = new Set<string>();
  for (const r of referrals) {
    const sess = sessionById.get(r.sessionId)!;
    const item: BoardReferral = { id: r.id, number: r.number, studentId: r.studentId, name: fullName(r), short: shortName(r), status: r.status, resultMark: r.resultMark, resultPoints: r.resultPoints };
    const list = refsBySession.get(r.sessionId);
    if (list) list.push(item);
    else refsBySession.set(r.sessionId, [item]);
    if (r.status === "issued") issued.add(`${r.studentId}:${sess.courseId}`);
  }

  // Должники по дисциплине и следующей попытке
  const groupMap = new Map<string, DebtGroup>();
  for (const d of debts) {
    const attempt = d.attempt + 1;
    const key = `${d.courseId}-${attempt}`;
    let g = groupMap.get(key);
    if (!g) {
      g = {
        key,
        courseId: d.courseId,
        groupCode: d.groupCode,
        facultyCode: d.facultyCode,
        discipline: d.discipline,
        semester: d.semester,
        controlType: d.controlType,
        langGroup: d.langGroup,
        teacher: shortName({ lastName: d.tLast, firstName: d.tFirst, middleName: d.tMiddle }),
        attempt,
        students: [],
        session: null,
      };
      groupMap.set(key, g);
    }
    g.students.push({ studentId: d.studentId, name: fullName(d), short: shortName(d), points: d.points });
  }

  const debtorsFor = (courseId: string, attempt: number) => groupMap.get(`${courseId}-${attempt}`)?.students ?? [];

  const board: BoardSession[] = sessions.map((x) => {
    const refs = refsBySession.get(x.id) ?? [];
    const has = new Set(refs.map((r) => r.studentId));
    const pending = debtorsFor(x.courseId, x.attempt).filter((st) => !has.has(st.studentId) && !issued.has(`${st.studentId}:${x.courseId}`));
    return { ...x, referrals: refs, pending };
  });

  for (const g of groupMap.values()) {
    const own = board.filter((x) => x.courseId === g.courseId && x.attempt === g.attempt);
    const next = own.find((x) => x.startsAt > now);
    if (next) {
      g.session = { id: next.id, startsAt: next.startsAt, room: next.room, state: next.publishedAt ? "published" : "draft" };
      continue;
    }
    const ids = new Set(g.students.map((st) => st.studentId));
    const waiting = [...own].reverse().find((x) => x.publishedAt && x.referrals.some((r) => r.status === "issued" && ids.has(r.studentId)));
    if (waiting) g.session = { id: waiting.id, startsAt: waiting.startsAt, room: waiting.room, state: "awaiting" };
  }

  const order = (g: DebtGroup) => (g.attempt > RETAKE_RULES.maxAttempt ? 9 : g.session === null ? 0 : g.session.state === "awaiting" ? 1 : g.session.state === "draft" ? 2 : 3);
  const groups = [...groupMap.values()].sort(
    (a, b) => order(a) - order(b) || a.groupCode.localeCompare(b.groupCode, "ru") || a.discipline.localeCompare(b.discipline, "ru") || a.attempt - b.attempt,
  );

  const scheduled = debts.filter((d) => issued.has(`${d.studentId}:${d.courseId}`)).length;
  const inDrafts = groups.filter((g) => g.session?.state === "draft").reduce((a, g) => a + g.students.length, 0);
  const results = board.filter((x) => x.publishedAt && x.startsAt <= now).reverse();
  const awaiting = results.reduce((a, x) => a + x.referrals.filter((r) => r.status === "issued").length, 0);

  return {
    stats: { debts: debts.length, students: new Set(debts.map((d) => d.studentId)).size, scheduled, noDate: debts.length - scheduled, inDrafts, awaiting },
    groups,
    upcoming: board.filter((x) => x.startsAt > now || !x.publishedAt),
    results,
  };
}

// ───────────────────────── Сотрудник: подбор даты и проверка занятости ─────────────────────────

type ScopedCourse = NonNullable<Awaited<ReturnType<typeof scopedCourse>>>;

async function scopedCourse(facultyId: string | null, courseId: string) {
  if (!Id.safeParse(courseId).success) return null;
  const [row] = await db
    .select({
      id: s.courses.id,
      groupId: s.groups.id,
      groupCode: s.groups.code,
      teacherId: s.teachers.id,
      tLast: s.teachers.lastName,
      tFirst: s.teachers.firstName,
      tMiddle: s.teachers.middleName,
      discipline: s.disciplines.name,
      controlType: s.courses.controlType,
      facultyId: s.groups.facultyId,
    })
    .from(s.courses)
    .innerJoin(s.groups, eq(s.groups.id, s.courses.groupId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
    .where(and(eq(s.courses.id, courseId), scope(facultyId)));
  return row ? { ...row, teacher: shortName({ lastName: row.tLast, firstName: row.tFirst, middleName: row.tMiddle }) } : null;
}

/** Аудитории, где занимается группа: сначала семинарские, потом языковые, потом лекционные; чаще используемые раньше. */
async function groupRooms(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ room: s.lessons.room, format: s.lessons.format, n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(s.lessons)
    .innerJoin(s.courses, eq(s.courses.id, s.lessons.courseId))
    .where(eq(s.courses.groupId, groupId))
    .groupBy(s.lessons.room, s.lessons.format);
  const kind = (f: string) => (f === "lecture" ? 2 : f === "lang" ? 1 : 0);
  const rank = new Map<string, { kind: number; n: number }>();
  for (const r of rows) {
    const cur = rank.get(r.room) ?? { kind: 2, n: 0 };
    rank.set(r.room, { kind: Math.min(cur.kind, kind(r.format)), n: cur.n + r.n });
  }
  return [...rank.entries()].sort((a, b) => a[1].kind - b[1].kind || b[1].n - a[1].n || a[0].localeCompare(b[0])).map(([room]) => room);
}

type Busy = {
  lessons: { startsAt: Date; endsAt: Date; room: string; groupId: string | null; teacherId: string; title: string }[];
  retakes: { id: string; startsAt: Date; room: string; groupId: string | null; teacherId: string; title: string }[];
};

/** Занятия и пересдачи в окне: группы, преподавателя и нужных аудиторий (по всему университету, аудитории общие). */
async function loadBusy(course: ScopedCourse, from: Date, to: Date, rooms: string[]): Promise<Busy> {
  const who = (extra: SQL | undefined) => or(eq(s.courses.groupId, course.groupId), eq(s.courses.teacherId, course.teacherId), extra);
  const [lessons, retakes] = await Promise.all([
    db
      .select({ startsAt: s.lessons.startsAt, endsAt: s.lessons.endsAt, room: s.lessons.room, groupId: s.courses.groupId, teacherId: s.courses.teacherId, title: s.disciplines.name })
      .from(s.lessons)
      .innerJoin(s.courses, eq(s.courses.id, s.lessons.courseId))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .where(and(gte(s.lessons.startsAt, addDays(from, -1)), lt(s.lessons.startsAt, to), ne(s.lessons.status, "cancelled"), who(rooms.length ? inArray(s.lessons.room, rooms) : undefined))),
    db
      .select({ id: s.retakeSessions.id, startsAt: s.retakeSessions.startsAt, room: s.retakeSessions.room, groupId: s.courses.groupId, teacherId: s.courses.teacherId, title: s.disciplines.name })
      .from(s.retakeSessions)
      .innerJoin(s.courses, eq(s.courses.id, s.retakeSessions.courseId))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .where(and(gte(s.retakeSessions.startsAt, addMinutes(from, -RETAKE_RULES.durationMin)), lt(s.retakeSessions.startsAt, to), who(rooms.length ? inArray(s.retakeSessions.room, rooms) : undefined))),
  ]);
  return { lessons, retakes };
}

/** Почему время не подходит группе или преподавателю; null, если свободно. */
function peopleConflict(course: ScopedCourse, busy: Busy, startsAt: Date, excludeId?: string): string | null {
  const endsAt = retakeEnd(startsAt);
  const lesson = busy.lessons.find((l) => l.groupId === course.groupId && overlaps(l.startsAt, l.endsAt, startsAt, endsAt));
  if (lesson) return `У группы ${course.groupCode} в это время занятие: ${lesson.title}, ${formatTime(lesson.startsAt)}`;
  const retake = busy.retakes.find((r) => r.id !== excludeId && r.groupId === course.groupId && overlaps(r.startsAt, retakeEnd(r.startsAt), startsAt, endsAt));
  if (retake) return `У группы ${course.groupCode} в это время другая пересдача: ${retake.title}`;
  const teaching = busy.lessons.find((l) => l.teacherId === course.teacherId && overlaps(l.startsAt, l.endsAt, startsAt, endsAt));
  if (teaching) return `У преподавателя ${course.teacher} в это время занятие`;
  const examining = busy.retakes.find((r) => r.id !== excludeId && r.teacherId === course.teacherId && overlaps(r.startsAt, retakeEnd(r.startsAt), startsAt, endsAt));
  if (examining) return `У преподавателя ${course.teacher} в это время другая пересдача`;
  return null;
}

function roomBusy(busy: Busy, room: string, startsAt: Date, excludeId?: string): boolean {
  const endsAt = retakeEnd(startsAt);
  const norm = room.trim().toLowerCase();
  return (
    busy.lessons.some((l) => l.room.toLowerCase() === norm && overlaps(l.startsAt, l.endsAt, startsAt, endsAt)) ||
    busy.retakes.some((r) => r.id !== excludeId && r.room.toLowerCase() === norm && overlaps(r.startsAt, retakeEnd(r.startsAt), startsAt, endsAt))
  );
}

const isWorkingDay = (d: Date) => mskParts(d).wd < 5 && !isHoliday(d);

function joinDays(days: Date[]) {
  const labels = days.map((d) => formatDayMonth(d));
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} и ${labels.at(-1)}` : labels[0];
}

export type SlotSuggestion = { ok: true; date: string; time: string; room: string; reason: string } | { ok: false; error: string };

/**
 * Ближайший рабочий день через 7-14 дней, когда у группы и у преподавателя дисциплины нет пар в выбранное время,
 * и аудитория группы, свободная в это время (по занятиям и другим пересдачам).
 */
export async function suggestRetakeSlot(courseId: string, time: string): Promise<SlotSuggestion> {
  const { staff } = await requireStaff();
  const course = await scopedCourse(staff.facultyId, courseId);
  if (!course) return { ok: false, error: "Дисциплина не найдена" };
  const minutes = timeToMinutes(time);
  if (minutes === null || minutes < timeToMinutes(RETAKE_RULES.earliestStart)! || minutes > timeToMinutes(RETAKE_RULES.latestStart)!) {
    return { ok: false, error: `Выберите время начала с ${RETAKE_RULES.earliestStart} до ${RETAKE_RULES.latestStart}` };
  }

  const today = startOfMskDay(new Date());
  const days: Date[] = [];
  for (let i = RETAKE_RULES.suggestFromDays; i <= RETAKE_RULES.suggestToDays; i++) {
    const d = addDays(today, i);
    if (isWorkingDay(d)) days.push(d);
  }
  if (!days.length) return { ok: false, error: "В ближайшие две недели нет рабочих дней" };

  const rooms = await groupRooms(course.groupId);
  const busy = await loadBusy(course, days[0], addDays(days[days.length - 1], 1), rooms);
  const skipped: Date[] = [];
  for (const d of days) {
    const p = mskParts(d);
    const startsAt = mskDate(p.y, p.m, p.d, Math.floor(minutes / 60), minutes % 60);
    if (peopleConflict(course, busy, startsAt)) {
      skipped.push(d);
      continue;
    }
    const room = rooms.find((r) => !roomBusy(busy, r, startsAt));
    if (rooms.length && !room) {
      skipped.push(d);
      continue;
    }
    const n = diffDays(today, d);
    const head = `${WEEKDAYS_SHORT[p.wd]}, ${formatDayMonth(d)}, через ${n} ${plural(n, "день", "дня", "дней")}`;
    const why = `в ${time} у группы ${course.groupCode} нет пар, преподаватель ${course.teacher} свободен, ${room ? `ауд. ${room} не занята` : "аудиторию укажите сами"}`;
    const tail = skipped.length ? `. ${joinDays(skipped)} в это время заняты` : "";
    return { ok: true, date: dayKey(d), time, room: room ?? "", reason: `${head}: ${why}${tail}.` };
  }
  return { ok: false, error: `Через 7-14 дней в ${time} нет окна без пар у группы и преподавателя. Попробуйте другое время.` };
}

// ───────────────────────── Сотрудник: изменения ─────────────────────────

export type NewRetakeSession = { courseId: string; attempt: number; date: string; time: string; room: string; commission: string[]; note: string | null };

/** Черновик пересдачи в графике. Направления не выпускаются, студенты пока ничего не получают. */
export async function createRetakeSession(input: NewRetakeSession): Promise<ActionResult> {
  const { staff } = await requireStaff();
  const course = await scopedCourse(staff.facultyId, input.courseId);
  if (!course) return { error: "Дисциплина не найдена" };
  if (input.attempt !== 2 && input.attempt !== 3) return { error: "Попытка: 2 или 3" };

  const minutes = timeToMinutes(input.time);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date.split("-").map(Number) : null;
  if (!day || minutes === null) return { error: "Укажите дату и время" };
  const startsAt = mskDate(day[0], day[1] - 1, day[2], Math.floor(minutes / 60), minutes % 60);
  if (Number.isNaN(startsAt.getTime()) || dayKey(startsAt) !== input.date) return { error: "Такой даты нет" };
  const now = new Date();
  if (startsAt <= now) return { error: "Дата уже прошла" };
  if (!isWorkingDay(startsAt)) return { error: "Выберите рабочий день: понедельник-пятница, не праздник" };
  if (minutes < timeToMinutes(RETAKE_RULES.earliestStart)! || minutes > timeToMinutes(RETAKE_RULES.latestStart)!) {
    return { error: `Начало пересдачи с ${RETAKE_RULES.earliestStart} до ${RETAKE_RULES.latestStart}` };
  }

  const commission = [...new Set(input.commission.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];
  const min = RETAKE_RULES.commissionMin[input.attempt] ?? 1;
  if (commission.length < min) return { error: input.attempt === 3 ? `Для третьей попытки нужна комиссия: не меньше ${min} человек` : "Укажите преподавателя" };
  if (commission.length > RETAKE_RULES.commissionMax) return { error: `В комиссии не больше ${RETAKE_RULES.commissionMax} человек` };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(s.finalGrades)
    .innerJoin(s.students, eq(s.students.id, s.finalGrades.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(and(eq(s.finalGrades.courseId, course.id), inArray(s.finalGrades.mark, FAILING), eq(s.finalGrades.attempt, input.attempt - 1), scope(staff.facultyId)));
  if (!n) return { error: input.attempt === 3 ? "Нет студентов, которым нужна третья попытка" : "Нет студентов с долгом для второй попытки" };

  const [existing] = await db
    .select({ startsAt: s.retakeSessions.startsAt })
    .from(s.retakeSessions)
    .where(and(eq(s.retakeSessions.courseId, course.id), eq(s.retakeSessions.attempt, input.attempt), gte(s.retakeSessions.startsAt, now)))
    .limit(1);
  if (existing) return { error: `Пересдача уже в графике: ${whenText(existing.startsAt)}` };

  const room = input.room.trim();
  const busy = await loadBusy(course, startOfMskDay(startsAt), addDays(startOfMskDay(startsAt), 1), [room]);
  const conflict = peopleConflict(course, busy, startsAt);
  if (conflict) return { error: `${conflict}. Выберите другое время или нажмите «Предложить дату».` };
  if (roomBusy(busy, room, startsAt)) return { error: `Ауд. ${room} в это время занята. Выберите другую или нажмите «Предложить дату».` };

  const [created] = await db
    .insert(s.retakeSessions)
    .values({ courseId: course.id, attempt: input.attempt, startsAt, room, commission, note: input.note, createdByStaffId: staff.id })
    .returning({ id: s.retakeSessions.id });
  await audit({
    action: "retake.schedule",
    entityType: "retake_session",
    entityId: created.id,
    facultyId: course.facultyId,
    summary: `Пересдача «${course.discipline}», ${course.groupCode}: черновик на ${whenText(startsAt)}`,
  });
  return { ok: `${course.discipline}, ${course.groupCode}: черновик на ${whenText(startsAt)}. Проверьте и выпустите направления.` };
}

async function scopedSession(facultyId: string | null, sessionId: string) {
  if (!Id.safeParse(sessionId).success) return null;
  const [row] = await db
    .select({
      id: s.retakeSessions.id,
      courseId: s.retakeSessions.courseId,
      attempt: s.retakeSessions.attempt,
      startsAt: s.retakeSessions.startsAt,
      room: s.retakeSessions.room,
      commission: s.retakeSessions.commission,
      publishedAt: s.retakeSessions.publishedAt,
      discipline: s.disciplines.name,
      disciplineEn: s.disciplines.nameEn,
      groupCode: s.groups.code,
      facultyId: s.groups.facultyId,
    })
    .from(s.retakeSessions)
    .innerJoin(s.courses, eq(s.courses.id, s.retakeSessions.courseId))
    .innerJoin(s.groups, eq(s.groups.id, s.courses.groupId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .where(and(eq(s.retakeSessions.id, sessionId), scope(facultyId)));
  return row ?? null;
}

/**
 * Выпуск направлений одним действием, в одной транзакции: направления всем должникам дисциплины (номер по порядку за год),
 * дата и аудитория в зачётке, отметка о выпуске, закрытие заявлений «Пересдача» по этой дисциплине.
 * Повторный вызов ничего не дублирует: строка пересдачи блокируется, у кого направление уже есть, пропускается.
 * Уведомления уходят после фиксации транзакции и только тем, кому направление создано сейчас.
 */
export async function publishRetakeSession(sessionId: string): Promise<ActionResult> {
  const { staff } = await requireStaff();
  const sess = await scopedSession(staff.facultyId, sessionId);
  if (!sess) return { error: "Пересдача не найдена" };
  const now = new Date();
  if (sess.startsAt <= now) return { error: "Дата пересдачи уже прошла. Удалите черновик и назначьте новую дату." };

  const year = mskParts(now).y;
  const prefix = referralNumber(year, 0).slice(0, -4);
  const staffName = `${staff.firstName} ${staff.lastName}`;
  const when = whenText(sess.startsAt);

  const { created, wasPublished } = await db.transaction(async (tx) => {
    // Блокируем строку пересдачи: параллельное нажатие дождётся и увидит уже выпущенные направления
    const [locked] = await tx.select({ publishedAt: s.retakeSessions.publishedAt }).from(s.retakeSessions).where(eq(s.retakeSessions.id, sess.id)).for("update");
    // номера направлений сквозные за год: выдаём под общей блокировкой, параллельный выпуск подождёт
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('retake_referral_number'))`);

    const debtors = await tx
      .select({ fgId: s.finalGrades.id, studentId: s.students.id, userId: s.students.userId })
      .from(s.finalGrades)
      .innerJoin(s.students, eq(s.students.id, s.finalGrades.studentId))
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .where(
        and(
          eq(s.finalGrades.courseId, sess.courseId),
          inArray(s.finalGrades.mark, FAILING),
          eq(s.finalGrades.attempt, sess.attempt - 1),
          scope(staff.facultyId),
          // у кого уже есть направление по этой дисциплине без результата (в этой или другой пересдаче), пропускаем
          sql`not exists (select 1 from ${s.retakeReferrals} r join ${s.retakeSessions} rs on rs.id = r.retake_session_id
                where r.student_id = ${s.finalGrades.studentId} and rs.course_id = ${sess.courseId} and (r.retake_session_id = ${sess.id} or r.status = 'issued'))`,
        ),
      )
      .orderBy(asc(s.students.lastName), asc(s.students.firstName));

    let rows: { id: string; studentId: string; finalGradeId: string | null; number: string }[] = [];
    if (debtors.length) {
      const [{ last }] = await tx
        .select({ last: sql<number>`coalesce(max(split_part(${s.retakeReferrals.number}, '-', 3)::int), 0)`.mapWith(Number) })
        .from(s.retakeReferrals)
        .where(like(s.retakeReferrals.number, `${prefix}%`));
      rows = await tx
        .insert(s.retakeReferrals)
        .values(debtors.map((d, i) => ({ retakeSessionId: sess.id, studentId: d.studentId, finalGradeId: d.fgId, number: referralNumber(year, last + i + 1) })))
        .onConflictDoNothing({ target: [s.retakeReferrals.retakeSessionId, s.retakeReferrals.studentId] })
        .returning({ id: s.retakeReferrals.id, studentId: s.retakeReferrals.studentId, finalGradeId: s.retakeReferrals.finalGradeId, number: s.retakeReferrals.number });
    }

    if (rows.length) {
      await tx
        .update(s.finalGrades)
        .set({ retakeAt: sess.startsAt, retakeRoom: sess.room })
        .where(inArray(s.finalGrades.id, rows.map((r) => r.finalGradeId).filter((x): x is string => !!x)));

      // Заявления «Пересдача» по этой дисциплине больше не нужны: дата назначена
      const numberOf = new Map(rows.map((r) => [r.studentId, r.number]));
      const reqs = await tx
        .select({ id: s.requests.id, studentId: s.requests.studentId })
        .from(s.requests)
        .where(
          and(
            inArray(s.requests.studentId, rows.map((r) => r.studentId)),
            eq(s.requests.type, "retake"),
            inArray(s.requests.status, ACTIVE_STATUSES),
            sql`${s.requests.fields}->>'course' = ${sess.courseId}`,
          ),
        );
      if (reqs.length) {
        await tx
          .update(s.requests)
          .set({ status: "completed", updatedAt: now, assignedStaffId: sql`coalesce(${s.requests.assignedStaffId}, ${staff.id})` })
          .where(inArray(s.requests.id, reqs.map((r) => r.id)));
        await tx.insert(s.requestEvents).values(
          reqs.map((r) => ({
            requestId: r.id,
            status: "completed" as const,
            message: `Направление на пересдачу № ${numberOf.get(r.studentId)} выпущено: ${when}, ауд. ${sess.room}. Оно в разделе «Учёба», вкладка «Сессия».`,
            actor: "staff" as const,
            actorName: staffName,
            createdAt: now,
          })),
        );
      }
    }

    // Пустой черновик не выпускаем: отметка о выпуске появляется вместе с первыми направлениями
    if (rows.length) {
      await tx
        .update(s.retakeSessions)
        .set({ publishedAt: sql`coalesce(${s.retakeSessions.publishedAt}, now())` })
        .where(eq(s.retakeSessions.id, sess.id));
    }

    const userOf = new Map(debtors.map((d) => [d.studentId, d.userId]));
    return { created: rows.map((r) => ({ ...r, userId: userOf.get(r.studentId)! })), wasPublished: !!locked?.publishedAt };
  });

  await notify(
    created.map((r) => ({
      userId: r.userId,
      kind: "grade" as const,
      ...gradeText.referral({ ru: sess.discipline, en: sess.disciplineEn }, sess.startsAt, sess.room, r.number, sess.commission),
      link: `/grades/retakes/${r.id}`,
      important: true,
    })),
  );

  await auditMany(
    created.map((r) => ({
      action: "retake.publish" as const,
      entityType: "retake_referral",
      entityId: r.id,
      studentId: r.studentId,
      summary: `Выдано направление ${r.number} на пересдачу «${sess.discipline}», ${when}`,
    })),
  );

  if (!created.length) {
    return wasPublished ? { ok: "Направления уже выпущены, повторно ничего не отправлено" } : { error: "Студентов без направления нет: долги по этой дисциплине уже закрыты или назначены" };
  }
  return { ok: `${sess.discipline}, ${sess.groupCode}: выпущено направлений ${created.length}, студенты получили уведомления` };
}

/** Удалить черновик. Выпущенную пересдачу удалить нельзя: у студентов уже есть направления. */
export async function deleteRetakeDraft(sessionId: string): Promise<ActionResult> {
  const { staff } = await requireStaff();
  const sess = await scopedSession(staff.facultyId, sessionId);
  if (!sess) return { error: "Пересдача не найдена" };
  if (sess.publishedAt) return { error: "Направления уже выпущены, удалить пересдачу нельзя" };
  const gone = await db
    .delete(s.retakeSessions)
    .where(and(eq(s.retakeSessions.id, sess.id), isNull(s.retakeSessions.publishedAt)))
    .returning({ id: s.retakeSessions.id });
  if (!gone.length) return { error: "Черновик уже выпущен или удалён, обновите страницу" };
  await audit({
    action: "retake.delete_draft",
    entityType: "retake_session",
    entityId: sess.id,
    facultyId: sess.facultyId,
    summary: `Удалён черновик пересдачи «${sess.discipline}», ${sess.groupCode}`,
  });
  return { ok: `Черновик удалён: ${sess.discipline}, ${sess.groupCode}` };
}

/** Результат пересдачи. «Сдал»: оценка в зачётку, долг закрыт. «Не сдал»: попытка израсходована. «Не явился»: попытка сохраняется. */
export async function recordRetakeResult(input: { referralId: string; result: RetakeResult; points: number | null }): Promise<ActionResult & { commission?: boolean }> {
  const { staff } = await requireStaff();
  if (!Id.safeParse(input.referralId).success) return { error: "Направление не найдено" };
  const [row] = await db
    .select({
      id: s.retakeReferrals.id,
      status: s.retakeReferrals.status,
      finalGradeId: s.retakeReferrals.finalGradeId,
      attempt: s.retakeSessions.attempt,
      startsAt: s.retakeSessions.startsAt,
      publishedAt: s.retakeSessions.publishedAt,
      controlType: s.courses.controlType,
      discipline: s.disciplines.name,
      disciplineEn: s.disciplines.nameEn,
      userId: s.students.userId,
      studentId: s.students.id,
      lastName: s.students.lastName,
      firstName: s.students.firstName,
    })
    .from(s.retakeReferrals)
    .innerJoin(s.retakeSessions, eq(s.retakeSessions.id, s.retakeReferrals.retakeSessionId))
    .innerJoin(s.courses, eq(s.courses.id, s.retakeSessions.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .innerJoin(s.students, eq(s.students.id, s.retakeReferrals.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(and(eq(s.retakeReferrals.id, input.referralId), scope(staff.facultyId)));
  if (!row || !row.publishedAt) return { error: "Направление не найдено" };
  const now = new Date();
  if (row.startsAt > now) return { error: "Пересдача ещё не прошла" };
  if (row.status !== "issued") return { error: "Результат уже внесён, обновите страницу" };

  const allowed: RetakeResult[] = row.controlType === "credit" ? ["pass", "fail", "absent"] : ["5", "4", "3", "fail", "absent"];
  if (!allowed.includes(input.result)) return { error: "Оценка не подходит к форме контроля" };
  const pErr = pointsError(input.result, input.points, row.controlType);
  if (pErr) return { error: pErr };

  const result = input.result;
  const passMark = isPassResult(result) ? result : null;
  const passed = passMark !== null;
  const status: RetakeStatus = passed ? "passed" : result === "fail" ? "failed" : "absent";
  const mark: Mark | null = passMark ?? (result === "fail" ? failMark(row.controlType) : null);
  const points = passMark ? (input.points ?? PASS_MIN_POINTS[passMark]) : result === "fail" ? input.points : null;

  const done = await db.transaction(async (tx) => {
    const upd = await tx
      .update(s.retakeReferrals)
      .set({ status, resultMark: mark, resultPoints: points, updatedAt: now })
      .where(and(eq(s.retakeReferrals.id, row.id), eq(s.retakeReferrals.status, "issued")))
      .returning({ id: s.retakeReferrals.id });
    if (!upd.length) return false;
    if (row.finalGradeId) {
      const patch: Partial<typeof s.finalGrades.$inferInsert> = { retakeAt: null, retakeRoom: null };
      if (passed) Object.assign(patch, { mark, points: points!, attempt: row.attempt, gradedAt: row.startsAt });
      else if (status === "failed") Object.assign(patch, { mark, attempt: row.attempt, ...(points !== null ? { points } : {}) });
      await tx.update(s.finalGrades).set(patch).where(eq(s.finalGrades.id, row.finalGradeId));
    }
    return true;
  });
  if (!done) return { error: "Результат уже внесён, обновите страницу" };
  // оценку в журнал не пишем: только факт внесения результата
  await audit({ action: "retake.result", entityType: "retake_referral", entityId: row.id, studentId: row.studentId, summary: `Внесён результат пересдачи «${row.discipline}»` });

  const last = row.attempt >= RETAKE_RULES.maxAttempt;
  const course = { ru: row.discipline, en: row.disciplineEn };
  await notify(
    passed
      ? {
          userId: row.userId,
          kind: "grade",
          ...gradeText.passed(course, mark!, points!),
          link: "/grades?tab=record",
          important: true,
        }
      : status === "failed"
        ? {
            userId: row.userId,
            kind: "grade",
            ...gradeText.failed(course, mark!, last),
            link: "/grades?tab=session",
            important: true,
          }
        : {
            userId: row.userId,
            kind: "grade",
            ...gradeText.absent(course, row.startsAt),
            link: "/grades?tab=session",
            important: true,
          },
  );

  const who = `${row.lastName} ${row.firstName}`;
  if (passed) return { ok: `${who}: сдал, «${MARK_LABEL[mark!]}»` };
  if (status === "failed") return { ok: `${who}: не сдал${last ? ", попытки исчерпаны" : ". Назначьте пересдачу комиссии"}`, commission: !last };
  return { ok: `${who}: не явился, попытка сохраняется` };
}
