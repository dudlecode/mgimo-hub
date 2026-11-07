import "server-only";
// Студенты для кабинета деканата: справочник и карточка «всё о студенте на одном экране».
// Область видимости: staff.facultyId (null = все факультеты). Студент вне области или несуществующий: 404.
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff } from "@/lib/auth/dal";
import { getRiskRadar, getScopedRiskProfile, type RiskLevel } from "@/lib/data/radar";
import { getSemester, semesterNumber } from "@/lib/academic";
import { courseProgress } from "@/lib/grades";
import { paymentState } from "@/lib/payments";
import { MINUTE_MS } from "@/lib/time";

const Uuid = z.string().uuid();

/** Вход списка студентов из адреса: поиск и группа */
export const StudentDirectoryQuery = z.object({
  q: z.string().trim().max(60).catch(""),
  group: z.string().uuid().optional().catch(undefined),
});

function scope(facultyId: string | null): SQL | undefined {
  return facultyId ? eq(s.groups.facultyId, facultyId) : undefined;
}

/** % и _ из запроса ищутся как обычные символы */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// ───────────── Справочник ─────────────

/** Студенты области: поиск по ФИО, номеру зачётки и группе, фильтр группы. Отметки риска, болезни и долга по оплате. */
export async function listScopedStudentDirectory(opts: { q?: string; groupId?: string } = {}) {
  const { staff } = await requireStaff();
  const q = (opts.q ?? "").trim().slice(0, 60);
  const groupId = opts.groupId && Uuid.safeParse(opts.groupId).success ? opts.groupId : undefined;
  const conds: (SQL | undefined)[] = [scope(staff.facultyId), groupId ? eq(s.groups.id, groupId) : undefined];
  if (q) {
    const p = likePattern(q);
    conds.push(
      or(
        ilike(sql`concat_ws(' ', ${s.students.lastName}, ${s.students.firstName}, ${s.students.middleName})`, p),
        ilike(sql`concat_ws(' ', ${s.students.firstName}, ${s.students.lastName})`, p),
        ilike(s.students.recordBook, p),
        ilike(s.groups.code, p),
      ),
    );
  }

  const [rows, radar] = await Promise.all([
    db
      .select({
        id: s.students.id,
        lastName: s.students.lastName,
        firstName: s.students.firstName,
        middleName: s.students.middleName,
        recordBook: s.students.recordBook,
        funding: s.students.funding,
        groupCode: s.groups.code,
        course: s.groups.course,
        facultyCode: s.faculties.code,
        sick: sql<boolean>`exists (select 1 from ${s.sickLeaves} sl where sl.student_id = ${s.students.id} and sl.status = 'open')`.mapWith(Boolean),
        paymentDebt: sql<boolean>`exists (select 1 from ${s.tuitionPayments} tp where tp.student_id = ${s.students.id} and tp.paid_at is null and tp.due_at < now())`.mapWith(Boolean),
      })
      .from(s.students)
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId))
      .where(and(...conds))
      .orderBy(asc(s.groups.code), asc(s.students.lastName), asc(s.students.firstName))
      .limit(300),
    getRiskRadar({ groupId }),
  ]);
  const riskOf = new Map<string, RiskLevel>(radar.entries.map((e) => [e.studentId, e.level]));
  return rows.map((r) => ({ ...r, paymentDebt: r.funding === "contract" && r.paymentDebt, risk: riskOf.get(r.id) ?? null }));
}

export type DirectoryStudent = Awaited<ReturnType<typeof listScopedStudentDirectory>>[number];

// ───────────── Карточка ─────────────

/** Всё о студенте области на одном экране. Вне области или несуществующий: 404. */
export async function getScopedStudentCard(id: string) {
  const { staff, user } = await requireStaff();
  if (!Uuid.safeParse(id).success) notFound();
  const student = await db.query.students.findFirst({
    where: eq(s.students.id, id),
    columns: { id: true, lastName: true, firstName: true, middleName: true, recordBook: true, studyForm: true, funding: true, email: true, phone: true, enrollmentYear: true },
    with: { group: { with: { faculty: { columns: { id: true, code: true, name: true } } } } },
  });
  if (!student) notFound();
  if (staff.facultyId && student.group.facultyId !== staff.facultyId) notFound();

  const now = new Date();
  const semester = getSemester(now);
  const semesterNo = semesterNumber(student.group.course, semester.kind);
  const journalScope = staff.facultyId ? or(eq(s.auditLog.facultyId, staff.facultyId), eq(s.auditLog.actorUserId, user.id)) : undefined;

  const [risk, courses, debts, referrals, requests, [{ requestsTotal }], sickLeaves, payments, appointments, journal] = await Promise.all([
    getScopedRiskProfile(id),

    // Текущий семестр: набрано и «можно было набрать» по проверенным точкам (как в data/grades.ts)
    db
      .select({
        id: s.courses.id,
        title: s.disciplines.name,
        controlType: s.courses.controlType,
        isLanguage: s.courses.isLanguage,
        tLast: s.teachers.lastName,
        tFirst: s.teachers.firstName,
        tMiddle: s.teachers.middleName,
        earned: sql<number>`coalesce(sum(${s.scores.points}), 0)::float8`.mapWith(Number),
        possible: sql<number>`coalesce(sum(${s.assessments.maxPoints}) filter (where ${s.scores.points} is not null), 0)::int`.mapWith(Number),
      })
      .from(s.enrollments)
      .innerJoin(s.courses, and(eq(s.courses.id, s.enrollments.courseId), eq(s.courses.semester, semesterNo)))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
      .leftJoin(s.assessments, eq(s.assessments.courseId, s.courses.id))
      .leftJoin(s.scores, and(eq(s.scores.assessmentId, s.assessments.id), eq(s.scores.studentId, id)))
      .where(eq(s.enrollments.studentId, id))
      .groupBy(s.courses.id, s.disciplines.id, s.teachers.id)
      .orderBy(asc(s.courses.isLanguage), asc(s.disciplines.name)),

    // Академические долги: итоговая «2» или «не зачтено»
    db
      .select({
        id: s.finalGrades.id,
        courseId: s.courses.id,
        title: s.disciplines.name,
        semester: s.courses.semester,
        controlType: s.courses.controlType,
        mark: s.finalGrades.mark,
        attempt: s.finalGrades.attempt,
      })
      .from(s.finalGrades)
      .innerJoin(s.courses, eq(s.courses.id, s.finalGrades.courseId))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .where(and(eq(s.finalGrades.studentId, id), inArray(s.finalGrades.mark, ["2", "fail"])))
      .orderBy(asc(s.courses.semester), asc(s.disciplines.name)),

    // Направления на пересдачу (только выпущенные графики)
    db
      .select({
        id: s.retakeReferrals.id,
        number: s.retakeReferrals.number,
        status: s.retakeReferrals.status,
        resultMark: s.retakeReferrals.resultMark,
        courseId: s.retakeSessions.courseId,
        title: s.disciplines.name,
        attempt: s.retakeSessions.attempt,
        startsAt: s.retakeSessions.startsAt,
        room: s.retakeSessions.room,
      })
      .from(s.retakeReferrals)
      .innerJoin(s.retakeSessions, eq(s.retakeSessions.id, s.retakeReferrals.retakeSessionId))
      .innerJoin(s.courses, eq(s.courses.id, s.retakeSessions.courseId))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .where(and(eq(s.retakeReferrals.studentId, id), isNotNull(s.retakeSessions.publishedAt)))
      .orderBy(desc(s.retakeSessions.startsAt))
      .limit(12),

    db
      .select({ id: s.requests.id, number: s.requests.number, type: s.requests.type, status: s.requests.status, createdAt: s.requests.createdAt, dueAt: s.requests.dueAt })
      .from(s.requests)
      .where(eq(s.requests.studentId, id))
      .orderBy(desc(s.requests.createdAt))
      .limit(5),
    db.select({ requestsTotal: count() }).from(s.requests).where(eq(s.requests.studentId, id)),

    // Больничные: открытый первым
    db
      .select({ id: s.sickLeaves.id, startsOn: s.sickLeaves.startsOn, endsOn: s.sickLeaves.endsOn, status: s.sickLeaves.status, reviewedAt: s.sickLeaves.reviewedAt })
      .from(s.sickLeaves)
      .where(eq(s.sickLeaves.studentId, id))
      .orderBy(sql`(${s.sickLeaves.status} = 'open') desc`, desc(s.sickLeaves.startsOn))
      .limit(5),

    student.funding === "contract"
      ? db
          .select({ id: s.tuitionPayments.id, period: s.tuitionPayments.period, amount: s.tuitionPayments.amount, dueAt: s.tuitionPayments.dueAt, paidAt: s.tuitionPayments.paidAt, contractNo: s.tuitionPayments.contractNo })
          .from(s.tuitionPayments)
          .where(eq(s.tuitionPayments.studentId, id))
          .orderBy(asc(s.tuitionPayments.dueAt))
      : Promise.resolve([]),

    db
      .select({ id: s.appointments.id, startsAt: s.appointments.startsAt, durationMin: s.appointments.durationMin, topic: s.appointments.topic, status: s.appointments.status, code: s.appointments.code })
      .from(s.appointments)
      .where(eq(s.appointments.studentId, id))
      .orderBy(desc(s.appointments.startsAt))
      .limit(20),

    // Последние действия сотрудников по этому студенту (та же область, что у журнала)
    db
      .select({ id: s.auditLog.id, createdAt: s.auditLog.createdAt, action: s.auditLog.action, summary: s.auditLog.summary, actorName: s.auditLog.actorName, position: s.staff.position })
      .from(s.auditLog)
      .leftJoin(s.staff, eq(s.staff.userId, s.auditLog.actorUserId))
      .where(and(eq(s.auditLog.studentId, id), journalScope))
      .orderBy(desc(s.auditLog.id))
      .limit(8),
  ]);

  const isUpcoming = (a: (typeof appointments)[number]) => a.status === "booked" && a.startsAt.getTime() + a.durationMin * MINUTE_MS > now.getTime();
  const paymentRows = payments.map((p) => ({ ...p, state: paymentState(p, now) }));

  return {
    student,
    group: student.group,
    faculty: student.group.faculty,
    semester: { label: semester.label, number: semesterNo },
    risk,
    courses: courses.map((c) => ({
      ...c,
      teacher: `${c.tLast} ${c.tFirst[0]}.${c.tMiddle ? ` ${c.tMiddle[0]}.` : ""}`,
      ...courseProgress(c.earned, c.possible),
    })),
    debts,
    referrals,
    requests,
    requestsTotal,
    sickLeaves,
    payments: {
      contractNo: paymentRows.at(-1)?.contractNo ?? null,
      overdue: paymentRows.filter((p) => p.state === "overdue"),
      next: paymentRows.find((p) => p.state === "soon" || p.state === "upcoming") ?? null,
      lastPaid: paymentRows.filter((p) => p.paidAt).at(-1) ?? null,
      total: paymentRows.length,
    },
    appointments: {
      next: appointments.filter(isUpcoming).at(-1) ?? null,
      past: appointments.filter((a) => !isUpcoming(a)).slice(0, 3),
    },
    journal,
  };
}

export type StudentCard = Awaited<ReturnType<typeof getScopedStudentCard>>;
