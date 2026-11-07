import "server-only";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { assessmentTitle } from "@/lib/i18n/messages/grades";
// Больничный: данные студента (только свои записи по student.id из сессии) и очередь проверки
// для сотрудника (только студенты его области: staff.facultyId, null = все факультеты).
//
// Поле ends_on: пока статус open, это ориентировочная дата выздоровления (может быть пустой);
// после закрытия (submitted и дальше) это фактический последний день болезни.
import { and, asc, desc, eq, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff, requireStudent, requireUser } from "@/lib/auth/dal";
import type { SickLeaveStatus } from "@/db/schema";
import { getMyLessons } from "@/lib/data/schedule";
import { getMyDeadlines } from "@/lib/data/deadlines";
import { SICK_DEADLINE_GRACE_DAYS } from "@/lib/sick-leave";
import { addDays, DAY_MS, dayKey, parseDayKey } from "@/lib/time";

const Uuid = z.string().uuid();
/** Контрольные точки, которые можно перенести (а не накопительная работа на семинарах) */
const MOVABLE_KINDS = ["test", "essay", "project", "oral"];

export type SickFileMeta = { id: string; fileName: string; mimeType: string; size: number };

// ───────────── Студент ─────────────

export async function listMySickLeaves() {
  const { student } = await requireStudent();
  return db.query.sickLeaves.findMany({
    where: eq(s.sickLeaves.studentId, student.id),
    orderBy: [desc(s.sickLeaves.startsOn), desc(s.sickLeaves.createdAt)],
    columns: { id: true, startsOn: true, endsOn: true, comment: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true, updatedAt: true },
    with: { files: { columns: { id: true, fileName: true, mimeType: true, size: true } } },
    limit: 30,
  });
}

export type MySickLeave = Awaited<ReturnType<typeof listMySickLeaves>>[number];

/** Открытый больничный студента (у студента одновременно не больше одного). */
export async function getMyOpenSickLeave() {
  const { student } = await requireStudent();
  const row = await db.query.sickLeaves.findFirst({
    where: and(eq(s.sickLeaves.studentId, student.id), eq(s.sickLeaves.status, "open")),
    orderBy: [desc(s.sickLeaves.createdAt)],
    columns: { id: true, startsOn: true, endsOn: true, comment: true, createdAt: true },
  });
  return row ?? null;
}

export type ImpactCourse = {
  courseId: string;
  title: string;
  teacher: string;
  lessons: { id: string; startsAt: Date }[];
  assessments: { id: string; title: string; kind: string; dueAt: Date }[];
};

export type SickImpact = {
  /** по какой день считаем пары: ожидаемая дата или сегодня, что позже */
  untilKey: string;
  lessonsCount: number;
  courses: ImpactCourse[];
  /** дедлайны деканата (не по дисциплинам) */
  deadlines: { id: string; title: string; subtitle: string | null; dueAt: Date }[];
};

/** Что затрагивает больничный: пары в периоде и дедлайны в периоде или в 3 дня после. */
/** locale: язык названий дисциплин. Страница берёт язык интерфейса, письмо преподавателю всегда русский. */
export async function getMySickImpact(leave: { startsOn: string; endsOn: string | null }, locale?: Locale): Promise<SickImpact> {
  const { student } = await requireStudent();
  const lang = locale ?? (await getLocale());
  const now = new Date();
  const todayKey = dayKey(now);
  const untilKey = leave.endsOn && leave.endsOn > todayKey ? leave.endsOn : todayKey;
  const from = parseDayKey(leave.startsOn) ?? now;
  const lessonsTo = addDays(parseDayKey(untilKey) ?? now, 1);
  const deadlinesTo = addDays(lessonsTo, SICK_DEADLINE_GRACE_DAYS);

  const pastDays = Math.ceil((now.getTime() - from.getTime()) / DAY_MS) + 1;
  const aheadDays = Math.ceil((deadlinesTo.getTime() - now.getTime()) / DAY_MS) + 1;

  const [lessons, assessRows, deadlines] = await Promise.all([
    getMyLessons(from, lessonsTo, lang),
    db
      .select({
        id: s.assessments.id,
        title: s.assessments.title,
        kind: s.assessments.kind,
        dueAt: s.assessments.dueAt,
        courseId: s.courses.id,
        course: s.disciplines.name,
        courseEn: s.disciplines.nameEn,
        tLast: s.teachers.lastName,
        tFirst: s.teachers.firstName,
        tMiddle: s.teachers.middleName,
      })
      .from(s.assessments)
      .innerJoin(s.courses, eq(s.courses.id, s.assessments.courseId))
      .innerJoin(s.enrollments, and(eq(s.enrollments.courseId, s.courses.id), eq(s.enrollments.studentId, student.id)))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
      .where(and(gte(s.assessments.dueAt, from), lt(s.assessments.dueAt, deadlinesTo), inArray(s.assessments.kind, MOVABLE_KINDS)))
      .orderBy(asc(s.assessments.dueAt)),
    getMyDeadlines(aheadDays, pastDays, lang),
  ]);

  const real = lessons.filter((l) => l.status !== "cancelled" && !l.movedAway);
  const byCourse = new Map<string, ImpactCourse>();
  for (const l of real) {
    let c = byCourse.get(l.courseId);
    if (!c) byCourse.set(l.courseId, (c = { courseId: l.courseId, title: l.title, teacher: l.teacher, lessons: [], assessments: [] }));
    c.lessons.push({ id: l.id, startsAt: l.startsAt });
  }
  for (const a of assessRows) {
    let c = byCourse.get(a.courseId);
    if (!c) {
      const teacher = `${a.tLast} ${a.tFirst[0]}.${a.tMiddle ? ` ${a.tMiddle[0]}.` : ""}`;
      byCourse.set(a.courseId, (c = { courseId: a.courseId, title: lang === "en" ? (a.courseEn ?? a.course) : a.course, teacher, lessons: [], assessments: [] }));
    }
    c.assessments.push({ id: a.id, title: assessmentTitle(a.title, lang), kind: a.kind, dueAt: a.dueAt });
  }

  const courses = [...byCourse.values()].sort((a, b) => {
    const da = a.assessments[0]?.dueAt.getTime() ?? Infinity;
    const dbb = b.assessments[0]?.dueAt.getTime() ?? Infinity;
    return da - dbb || b.lessons.length - a.lessons.length || a.title.localeCompare(b.title, "ru");
  });

  return {
    untilKey,
    lessonsCount: real.length,
    courses,
    deadlines: deadlines
      .filter((d) => d.kind !== "assessment" && !d.done && d.dueAt >= from && d.dueAt < deadlinesTo)
      .map((d) => ({ id: d.id, title: d.title, subtitle: d.subtitle, dueAt: d.dueAt })),
  };
}

export type OpenSickResult = { ok: true; id: string } | { ok: false; error: string; field?: "startsOn" };

/** Сообщить о болезни. Даты уже проверены по формату и границам в экшене. */
export async function openMySickLeave(input: { startsOn: string; expectedEnd: string | null; comment: string | null }): Promise<OpenSickResult> {
  const { student } = await requireStudent();
  return db.transaction(async (tx) => {
    // защита от двух одновременных отправок формы
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sick:${student.id}`}))`);
    const existing = await tx
      .select({ id: s.sickLeaves.id, status: s.sickLeaves.status, startsOn: s.sickLeaves.startsOn, endsOn: s.sickLeaves.endsOn })
      .from(s.sickLeaves)
      .where(and(eq(s.sickLeaves.studentId, student.id), ne(s.sickLeaves.status, "rejected")));
    if (existing.some((e) => e.status === "open")) return { ok: false as const, error: "Больничный уже открыт. Обновите страницу" };
    const overlap = existing.find((e) => e.endsOn && e.startsOn <= input.startsOn && e.endsOn >= input.startsOn);
    if (overlap) return { ok: false as const, error: "Этот день уже входит в другой ваш больничный", field: "startsOn" as const };

    const [row] = await tx
      .insert(s.sickLeaves)
      .values({ studentId: student.id, startsOn: input.startsOn, endsOn: input.expectedEnd, comment: input.comment, status: "open" })
      .returning({ id: s.sickLeaves.id });
    return { ok: true as const, id: row.id };
  });
}

export type CloseSickResult =
  | { ok: true; startsOn: string; endsOn: string; staffUserIds: string[]; who: string }
  | { ok: false; status: 400 | 404; error: string };

/** Закрыть свой открытый больничный справкой. Чужой, закрытый или несуществующий: 404. */
export async function closeMySickLeave(
  id: string,
  endsOn: string,
  file: { fileName: string; mimeType: string; size: number; sha256: string; data: Buffer },
): Promise<CloseSickResult> {
  const { student, group } = await requireStudent();
  if (!Uuid.safeParse(id).success) return { ok: false, status: 404, error: "Больничный не найден" };
  const todayKey = dayKey(new Date());

  const result = await db.transaction(async (tx) => {
    const [leave] = await tx
      .select({ id: s.sickLeaves.id, startsOn: s.sickLeaves.startsOn })
      .from(s.sickLeaves)
      .where(and(eq(s.sickLeaves.id, id), eq(s.sickLeaves.studentId, student.id), eq(s.sickLeaves.status, "open")))
      .for("update");
    if (!leave) return { ok: false as const, status: 404 as const, error: "Больничный не найден" };
    if (endsOn < leave.startsOn) return { ok: false as const, status: 400 as const, error: "Последний день болезни раньше первого" };
    if (endsOn > todayKey) return { ok: false as const, status: 400 as const, error: "Дата окончания ещё не наступила" };

    await tx.update(s.sickLeaves).set({ status: "submitted", endsOn, updatedAt: new Date() }).where(and(eq(s.sickLeaves.id, id), eq(s.sickLeaves.studentId, student.id)));
    await tx.insert(s.sickLeaveFiles).values({ sickLeaveId: id, ...file });
    return { ok: true as const, startsOn: leave.startsOn, endsOn };
  });

  if (!result.ok) return result;
  // кому из сотрудников сообщить: офис факультета и единый студенческий офис
  const staffUsers = await db
    .select({ userId: s.staff.userId })
    .from(s.staff)
    .where(sql`${s.staff.facultyId} is null or ${s.staff.facultyId} = ${group.facultyId}`);
  return { ...result, staffUserIds: staffUsers.map((u) => u.userId), who: `${student.lastName} ${student.firstName[0]}., ${group.code}` };
}

/** Данные для письма преподавателю: только мой открытый больничный и моя дисциплина с контрольной в периоде. */
export async function getMySickLetterContext(courseId: string) {
  const { student, group } = await requireStudent();
  if (!Uuid.safeParse(courseId).success) return null;
  const leave = await getMyOpenSickLeave();
  if (!leave) return null;
  // письмо уходит русскоязычному преподавателю: названия дисциплин по-русски при любом языке интерфейса
  const impact = await getMySickImpact(leave, "ru");
  const course = impact.courses.find((c) => c.courseId === courseId && c.assessments.length > 0);
  if (!course) return null;
  const [teacher] = await db
    .select({ lastName: s.teachers.lastName, firstName: s.teachers.firstName, middleName: s.teachers.middleName })
    .from(s.courses)
    .innerJoin(s.enrollments, and(eq(s.enrollments.courseId, s.courses.id), eq(s.enrollments.studentId, student.id)))
    .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
    .where(eq(s.courses.id, courseId));
  if (!teacher) return null;
  return {
    student: { firstName: student.firstName, lastName: student.lastName, group: group.code },
    leave: { startsOn: leave.startsOn, expectedEnd: leave.endsOn },
    course: { title: course.title, lessons: course.lessons.map((l) => l.startsAt), assessments: course.assessments },
    teacher,
  };
}

// ───────────── Файл справки ─────────────

/** Файл справки для просмотра: владельцу и сотруднику, в чьей области студент. Иначе null (ответ 404). */
export async function getSickFileForViewer(fileId: string) {
  const { user } = await requireUser();
  if (!Uuid.safeParse(fileId).success) return null;
  const cols = {
    fileName: s.sickLeaveFiles.fileName,
    mimeType: s.sickLeaveFiles.mimeType,
    size: s.sickLeaveFiles.size,
    data: s.sickLeaveFiles.data,
    // чей файл: для журнала просмотров сотрудниками
    studentId: s.sickLeaves.studentId,
    startsOn: s.sickLeaves.startsOn,
    endsOn: s.sickLeaves.endsOn,
  };

  if (user.role === "student") {
    const { student } = await requireStudent();
    const [row] = await db
      .select(cols)
      .from(s.sickLeaveFiles)
      .innerJoin(s.sickLeaves, eq(s.sickLeaves.id, s.sickLeaveFiles.sickLeaveId))
      .where(and(eq(s.sickLeaveFiles.id, fileId), eq(s.sickLeaves.studentId, student.id)));
    return row ?? null;
  }

  const { staff } = await requireStaff();
  const [row] = await db
    .select(cols)
    .from(s.sickLeaveFiles)
    .innerJoin(s.sickLeaves, eq(s.sickLeaves.id, s.sickLeaveFiles.sickLeaveId))
    .innerJoin(s.students, eq(s.students.id, s.sickLeaves.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(and(eq(s.sickLeaveFiles.id, fileId), staff.facultyId ? eq(s.groups.facultyId, staff.facultyId) : undefined));
  return row ?? null;
}

// ───────────── Сотрудник ─────────────

function scope(facultyId: string | null): SQL | undefined {
  return facultyId ? eq(s.groups.facultyId, facultyId) : undefined;
}

export async function getSickLeaveStats() {
  const { staff } = await requireStaff();
  const [row] = await db
    .select({
      review: sql<number>`count(*) filter (where ${s.sickLeaves.status} = 'submitted')::int`,
      open: sql<number>`count(*) filter (where ${s.sickLeaves.status} = 'open')::int`,
      approved30: sql<number>`count(*) filter (where ${s.sickLeaves.status} = 'approved' and ${s.sickLeaves.reviewedAt} >= now() - interval '30 days')::int`,
    })
    .from(s.sickLeaves)
    .innerJoin(s.students, eq(s.students.id, s.sickLeaves.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(scope(staff.facultyId));
  return row ?? { review: 0, open: 0, approved30: 0 };
}

export const SICK_FILTERS = { review: ["submitted"], open: ["open"], all: null } as const satisfies Record<string, SickLeaveStatus[] | null>;
export type SickFilter = keyof typeof SICK_FILTERS;

/** Сколько пар студент пропустил: по день окончания, а пока болеет, по сегодня. */
const missedLessons = sql<number>`(
  select count(*)::int from ${s.lessons} l
  join ${s.enrollments} e on e.course_id = l.course_id
  where e.student_id = ${s.sickLeaves.studentId}
    and l.status <> 'cancelled'
    and l.starts_at >= (${s.sickLeaves.startsOn}::timestamp at time zone 'Europe/Moscow')
    and l.starts_at < (((case when ${s.sickLeaves.status} = 'open' or ${s.sickLeaves.endsOn} is null
      then (now() at time zone 'Europe/Moscow')::date else ${s.sickLeaves.endsOn} end) + 1)::timestamp at time zone 'Europe/Moscow')
)`;

export async function listScopedSickLeaves(filter: SickFilter) {
  const { staff } = await requireStaff();
  const statuses = SICK_FILTERS[filter];
  const order =
    filter === "review" ? [asc(s.sickLeaves.updatedAt)] : filter === "open" ? [asc(s.sickLeaves.startsOn)] : [desc(s.sickLeaves.updatedAt)];
  const rows = await db
    .select({
      id: s.sickLeaves.id,
      startsOn: s.sickLeaves.startsOn,
      endsOn: s.sickLeaves.endsOn,
      status: s.sickLeaves.status,
      comment: s.sickLeaves.comment,
      reviewNote: s.sickLeaves.reviewNote,
      reviewedAt: s.sickLeaves.reviewedAt,
      createdAt: s.sickLeaves.createdAt,
      updatedAt: s.sickLeaves.updatedAt,
      studentId: s.students.id,
      lastName: s.students.lastName,
      firstName: s.students.firstName,
      middleName: s.students.middleName,
      groupCode: s.groups.code,
      facultyCode: s.faculties.code,
      reviewerLast: s.staff.lastName,
      reviewerFirst: s.staff.firstName,
      missed: missedLessons,
    })
    .from(s.sickLeaves)
    .innerJoin(s.students, eq(s.students.id, s.sickLeaves.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId))
    .leftJoin(s.staff, eq(s.staff.id, s.sickLeaves.reviewerId))
    .where(and(scope(staff.facultyId), statuses ? inArray(s.sickLeaves.status, [...statuses]) : undefined))
    .orderBy(...order)
    .limit(100);

  const ids = rows.map((r) => r.id);
  const files = ids.length
    ? await db
        .select({ id: s.sickLeaveFiles.id, sickLeaveId: s.sickLeaveFiles.sickLeaveId, fileName: s.sickLeaveFiles.fileName, mimeType: s.sickLeaveFiles.mimeType, size: s.sickLeaveFiles.size })
        .from(s.sickLeaveFiles)
        .where(inArray(s.sickLeaveFiles.sickLeaveId, ids))
        .orderBy(asc(s.sickLeaveFiles.createdAt))
    : [];
  return rows.map((r) => ({ ...r, files: files.filter((f) => f.sickLeaveId === r.id) as SickFileMeta[] }));
}

export type ScopedSickLeave = Awaited<ReturnType<typeof listScopedSickLeaves>>[number];

export type ReviewResult =
  | { ok: true; studentId: string; studentUserId: string; startsOn: string; endsOn: string }
  | { ok: false; error: string };

/** Решение по больничному на проверке: только в области сотрудника и только из статуса submitted. */
export async function reviewScopedSickLeave(id: string, decision: "approved" | "rejected", note: string | null): Promise<ReviewResult> {
  const { staff } = await requireStaff();
  if (!Uuid.safeParse(id).success) return { ok: false, error: "Больничный не найден" };
  const [row] = await db
    .select({ id: s.sickLeaves.id, status: s.sickLeaves.status, startsOn: s.sickLeaves.startsOn, endsOn: s.sickLeaves.endsOn, studentId: s.students.id, userId: s.students.userId, facultyId: s.groups.facultyId })
    .from(s.sickLeaves)
    .innerJoin(s.students, eq(s.students.id, s.sickLeaves.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(eq(s.sickLeaves.id, id));
  if (!row || (staff.facultyId && row.facultyId !== staff.facultyId)) return { ok: false, error: "Больничный не найден" };
  if (row.status !== "submitted" || !row.endsOn) return { ok: false, error: "Статус уже изменился, обновите страницу" };

  const now = new Date();
  // оптимистичная блокировка: решение принимается один раз, даже если два сотрудника нажали одновременно
  const updated = await db
    .update(s.sickLeaves)
    .set({ status: decision, reviewerId: staff.id, reviewNote: note, reviewedAt: now, updatedAt: now })
    .where(and(eq(s.sickLeaves.id, id), eq(s.sickLeaves.status, "submitted")))
    .returning({ id: s.sickLeaves.id });
  if (!updated.length) return { ok: false, error: "Статус уже изменился, обновите страницу" };
  return { ok: true, studentId: row.studentId, studentUserId: row.userId, startsOn: row.startsOn, endsOn: row.endsOn };
}
