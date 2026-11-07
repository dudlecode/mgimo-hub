import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";
import { getSemester, semesterNumber } from "@/lib/academic";
import { addDays } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { DEADLINE_EN } from "@/lib/i18n/messages/today";
import { assessmentTitle } from "@/lib/i18n/messages/grades";

export type DeadlineItem = {
  id: string;
  title: string;
  subtitle: string | null;
  dueAt: Date;
  kind: "study" | "admin" | "finance" | "mobility" | "assessment";
  href: string | null;
  done: boolean;
};

const ASSESSMENT_DEADLINE_KINDS = ["essay", "project", "test", "oral"];

/** Мои дедлайны: задания по моим курсам + дедлайны деканата для моей аудитории. locale по умолчанию: язык запроса. */
export async function getMyDeadlines(daysAhead = 14, includePastDays = 0, locale?: Locale): Promise<DeadlineItem[]> {
  const { student, group, faculty } = await requireStudent();
  const en = (locale ?? (await getLocale())) === "en";
  const tr = (v: string) => (en ? (DEADLINE_EN[v] ?? v) : v);
  const now = new Date();
  const from = addDays(now, -includePastDays);
  const to = addDays(now, daysAhead);
  const semNo = semesterNumber(group.course, getSemester().kind);

  const [assessRows, adminRows, doneRows] = await Promise.all([
    db
      .select({ id: s.assessments.id, title: s.assessments.title, kind: s.assessments.kind, dueAt: s.assessments.dueAt, courseId: s.courses.id, course: s.disciplines.name, courseEn: s.disciplines.nameEn })
      .from(s.assessments)
      .innerJoin(s.courses, eq(s.courses.id, s.assessments.courseId))
      .innerJoin(s.enrollments, and(eq(s.enrollments.courseId, s.courses.id), eq(s.enrollments.studentId, student.id)))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
      .where(and(eq(s.courses.semester, semNo), gte(s.assessments.dueAt, from), lt(s.assessments.dueAt, to), inArray(s.assessments.kind, ASSESSMENT_DEADLINE_KINDS)))
      .orderBy(asc(s.assessments.dueAt)),
    db
      .select()
      .from(s.deadlines)
      .where(
        and(
          gte(s.deadlines.dueAt, from),
          lt(s.deadlines.dueAt, to),
          or(isNull(s.deadlines.facultyId), eq(s.deadlines.facultyId, faculty.id)),
          or(isNull(s.deadlines.course), eq(s.deadlines.course, group.course)),
          or(isNull(s.deadlines.groupId), eq(s.deadlines.groupId, group.id)),
          or(isNull(s.deadlines.funding), eq(s.deadlines.funding, student.funding)),
        ),
      ),
    db.select({ itemId: s.deadlineDone.itemId }).from(s.deadlineDone).where(eq(s.deadlineDone.studentId, student.id)),
  ]);
  const done = new Set(doneRows.map((d) => d.itemId));

  const items: DeadlineItem[] = [
    ...assessRows.map((a) => ({
      id: a.id,
      title: en ? assessmentTitle(a.title, "en") : a.title,
      subtitle: en ? (a.courseEn ?? a.course) : a.course,
      dueAt: a.dueAt,
      kind: "assessment" as const,
      href: `/grades/${a.courseId}`,
      done: done.has(a.id),
    })),
    ...adminRows.map((d) => ({
      id: d.id,
      title: tr(d.title),
      subtitle: d.description && tr(d.description),
      dueAt: d.dueAt,
      kind: d.kind as DeadlineItem["kind"],
      href: d.link,
      done: done.has(d.id),
    })),
  ];
  return items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/** Отметка «сделано», только для дедлайна, который действительно виден этому студенту. */
export async function toggleMyDeadline(itemId: string, value: boolean) {
  const { student } = await requireStudent();
  const visible = await getMyDeadlines(120, 60);
  if (!visible.some((d) => d.id === itemId)) return false;
  if (value) await db.insert(s.deadlineDone).values({ studentId: student.id, itemId }).onConflictDoNothing();
  else await db.delete(s.deadlineDone).where(and(eq(s.deadlineDone.studentId, student.id), eq(s.deadlineDone.itemId, itemId)));
  return true;
}
