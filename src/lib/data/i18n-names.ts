import "server-only";
// Английские названия дисциплин для английского интерфейса кабинета студента.
// Только курсы, на которые записан студент из сессии. Вызывается, только когда язык интерфейса английский.
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";

export type CourseNameEn = { nameEn: string | null; semester: number };

/** courseId → английское название дисциплины (null, если не заполнено) и семестр курса */
export const getMyCourseNamesEn = cache(async (): Promise<Map<string, CourseNameEn>> => {
  const { student } = await requireStudent();
  const rows = await db
    .select({ id: s.courses.id, nameEn: s.disciplines.nameEn, semester: s.courses.semester })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .where(eq(s.enrollments.studentId, student.id));
  return new Map(rows.map((r) => [r.id, { nameEn: r.nameEn, semester: r.semester }]));
});

/** Название дисциплины по id курса: английское, если есть, иначе русское из данных */
export async function courseTitleEn(courseId: string, fallback: string): Promise<string> {
  return (await getMyCourseNamesEn()).get(courseId)?.nameEn ?? fallback;
}
