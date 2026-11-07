import "server-only";
// Данные кабинета сотрудника. Область видимости: staff.facultyId (null = все факультеты).
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff } from "@/lib/auth/dal";
import type { RequestStatus } from "@/db/schema";
import { addDays, startOfMskDay } from "@/lib/time";

function scope(facultyId: string | null): SQL | undefined {
  return facultyId ? eq(s.groups.facultyId, facultyId) : undefined;
}

const requestCols = {
  id: s.requests.id,
  studentId: s.requests.studentId,
  number: s.requests.number,
  type: s.requests.type,
  status: s.requests.status,
  createdAt: s.requests.createdAt,
  updatedAt: s.requests.updatedAt,
  dueAt: s.requests.dueAt,
  delivery: s.requests.delivery,
  assignedStaffId: s.requests.assignedStaffId,
  lastName: s.students.lastName,
  firstName: s.students.firstName,
  middleName: s.students.middleName,
  groupCode: s.groups.code,
  facultyCode: s.faculties.code,
};

function baseQuery() {
  return db
    .select(requestCols)
    .from(s.requests)
    .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId));
}

export async function getQueueStats() {
  const { staff } = await requireStaff();
  const rows = await db
    .select({ status: s.requests.status, n: sql<number>`count(*)::int`, overdue: sql<number>`count(*) filter (where ${s.requests.dueAt} < now() and ${s.requests.status} in ('submitted','in_review','in_progress'))::int` })
    .from(s.requests)
    .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(scope(staff.facultyId))
    .groupBy(s.requests.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<RequestStatus, number>>;
  const overdue = rows.reduce((a, r) => a + r.overdue, 0);
  const [{ readyToday }] = await db
    .select({ readyToday: sql<number>`count(*)::int` })
    .from(s.requests)
    .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(and(scope(staff.facultyId), gte(s.requests.readyAt, startOfMskDay(new Date()))));
  return { by, overdue, readyToday };
}

export const STAFF_FILTERS: Record<string, RequestStatus[]> = {
  new: ["submitted"],
  work: ["in_review", "in_progress"],
  waiting: ["needs_info"],
  ready: ["ready"],
  closed: ["completed", "rejected", "cancelled"],
};

export async function listScopedRequests(opts: { filter?: string; q?: string; limit?: number } = {}) {
  const { staff } = await requireStaff();
  const conds: (SQL | undefined)[] = [scope(staff.facultyId)];
  const statuses = opts.filter ? STAFF_FILTERS[opts.filter] : undefined;
  if (statuses) conds.push(inArray(s.requests.status, statuses));
  else if (opts.filter === "overdue") conds.push(and(lt(s.requests.dueAt, new Date()), inArray(s.requests.status, ["submitted", "in_review", "in_progress"])));
  else if (!opts.q) conds.push(inArray(s.requests.status, ["submitted", "in_review", "in_progress", "needs_info", "ready"]));
  const q = opts.q?.trim().slice(0, 60);
  if (q) conds.push(or(ilike(s.requests.number, `%${q}%`), ilike(s.students.lastName, `%${q}%`), ilike(s.groups.code, `%${q}%`)));
  return baseQuery()
    .where(and(...conds))
    .orderBy(sql`case ${s.requests.status} when 'submitted' then 0 when 'in_review' then 1 when 'in_progress' then 2 when 'needs_info' then 3 when 'ready' then 4 else 5 end`, asc(s.requests.dueAt))
    .limit(opts.limit ?? 100);
}

/** Заявка в пределах области сотрудника; вне области 404 */
export async function getScopedRequest(id: string) {
  const { staff } = await requireStaff();
  if (!z.string().uuid().safeParse(id).success) notFound();
  const row = await db.query.requests.findFirst({
    where: eq(s.requests.id, id),
    with: {
      events: { orderBy: [asc(s.requestEvents.createdAt)] },
      student: { with: { group: { with: { faculty: true } }, user: { columns: { id: true } } } },
      assignedStaff: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!row) notFound();
  if (staff.facultyId && row.student.group.facultyId !== staff.facultyId) notFound();
  return row;
}

/** Номер заявки и чья она, для журнала действий. Вне области сотрудника null. */
export async function getScopedRequestRef(id: string) {
  const { staff } = await requireStaff();
  if (!z.string().uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({ id: s.requests.id, number: s.requests.number, studentId: s.requests.studentId })
    .from(s.requests)
    .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(and(eq(s.requests.id, id), scope(staff.facultyId)))
    .limit(1);
  return row ?? null;
}

// ───────────── Объявления ─────────────

export async function listScopedAnnouncements() {
  const { staff } = await requireStaff();
  return db.query.announcements.findMany({
    where: staff.facultyId ? or(eq(s.announcements.facultyId, staff.facultyId), sql`${s.announcements.facultyId} is null`) : undefined,
    orderBy: [desc(s.announcements.publishedAt)],
    limit: 50,
    with: { faculty: { columns: { code: true } }, group: { columns: { code: true } } },
  });
}

export async function listScopedGroups() {
  const { staff } = await requireStaff();
  return db.query.groups.findMany({
    where: staff.facultyId ? eq(s.groups.facultyId, staff.facultyId) : undefined,
    with: { faculty: { columns: { code: true, name: true } } },
    orderBy: [asc(s.groups.code)],
  });
}

export async function listScopedFaculties() {
  const { staff } = await requireStaff();
  return db.query.faculties.findMany({ where: staff.facultyId ? eq(s.faculties.id, staff.facultyId) : undefined, orderBy: [asc(s.faculties.code)] });
}

// ───────────── Расписание группы ─────────────

export async function getGroupLessonsOn(groupId: string, day: Date) {
  const groups = await listScopedGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;
  const from = startOfMskDay(day);
  const rows = await db
    .select({
      id: s.lessons.id,
      startsAt: s.lessons.startsAt,
      endsAt: s.lessons.endsAt,
      pairNo: s.lessons.pairNo,
      room: s.lessons.room,
      format: s.lessons.format,
      status: s.lessons.status,
      changeNote: s.lessons.changeNote,
      prevRoom: s.lessons.prevRoom,
      prevStartsAt: s.lessons.prevStartsAt,
      title: s.disciplines.name,
      langGroup: s.courses.langGroup,
      tLast: s.teachers.lastName,
    })
    .from(s.lessons)
    .innerJoin(s.courses, eq(s.courses.id, s.lessons.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
    .where(and(eq(s.courses.groupId, groupId), gte(s.lessons.startsAt, from), lt(s.lessons.startsAt, addDays(from, 1))))
    .orderBy(asc(s.lessons.startsAt));
  return { group, lessons: rows };
}

/** Занятие в группах области сотрудника (для изменения). */
export async function getScopedLesson(lessonId: string) {
  const { staff } = await requireStaff();
  if (!z.string().uuid().safeParse(lessonId).success) return null;
  const [row] = await db
    .select({ lesson: s.lessons, title: s.disciplines.name, titleEn: s.disciplines.nameEn, facultyId: s.groups.facultyId, groupId: s.groups.id, teacher: s.teachers.lastName })
    .from(s.lessons)
    .innerJoin(s.courses, eq(s.courses.id, s.lessons.courseId))
    .innerJoin(s.groups, eq(s.groups.id, s.courses.groupId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
    .where(eq(s.lessons.id, lessonId));
  if (!row) return null;
  if (staff.facultyId && row.facultyId !== staff.facultyId) return null;
  return row;
}

/** Зачётка студента для выписки: только через заявку в области сотрудника. */
export async function getScopedTranscript(requestId: string) {
  const req = await getScopedRequest(requestId);
  return db
    .select({
      id: s.finalGrades.id,
      courseId: s.courses.id,
      title: s.disciplines.name,
      semester: s.courses.semester,
      controlType: s.courses.controlType,
      credits: s.courses.credits,
      points: s.finalGrades.points,
      mark: s.finalGrades.mark,
      attempt: s.finalGrades.attempt,
      gradedAt: s.finalGrades.gradedAt,
      retakeAt: s.finalGrades.retakeAt,
      retakeRoom: s.finalGrades.retakeRoom,
    })
    .from(s.finalGrades)
    .innerJoin(s.courses, eq(s.courses.id, s.finalGrades.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .where(eq(s.finalGrades.studentId, req.student.id))
    .orderBy(asc(s.courses.semester), asc(s.disciplines.name));
}

/** Студенты области сотрудника, для генератора справок. */
export async function listScopedStudents() {
  const { staff } = await requireStaff();
  return db
    .select({ id: s.students.id, lastName: s.students.lastName, firstName: s.students.firstName, middleName: s.students.middleName, groupCode: s.groups.code, facultyCode: s.faculties.code })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId))
    .where(scope(staff.facultyId))
    .orderBy(asc(s.groups.code), asc(s.students.lastName))
    .limit(500);
}
