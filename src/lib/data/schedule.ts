import "server-only";
import { and, asc, eq, gte, lt, ne, or } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";
import type { LessonFormat, LessonStatus } from "@/db/schema";
import { addDays, startOfMskDay } from "@/lib/time";
import { buildingLabel } from "@/lib/academic";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { CHANGE_NOTE_EN, roomEn } from "@/lib/i18n/messages/schedule";

export type LessonView = {
  id: string;
  courseId: string;
  title: string;
  teacher: string;
  format: LessonFormat;
  startsAt: Date;
  endsAt: Date;
  pairNo: number;
  room: string;
  building: string;
  status: LessonStatus;
  changeNote: string | null;
  prevStartsAt: Date | null;
  prevRoom: string | null;
  prevTeacher: string | null;
  substituteTeacher: string | null;
  changedAt: Date | null;
  isLanguage: boolean;
  langGroup: string | null;
  /** «призрак»: занятие перенесено С этого дня на другой */
  movedAway?: boolean;
  /** для «призрака», куда перенесено */
  movedTo?: Date;
};

const lessonColumns = {
  id: s.lessons.id,
  courseId: s.lessons.courseId,
  title: s.disciplines.name,
  titleEn: s.disciplines.nameEn,
  tLast: s.teachers.lastName,
  tFirst: s.teachers.firstName,
  tMiddle: s.teachers.middleName,
  format: s.lessons.format,
  startsAt: s.lessons.startsAt,
  endsAt: s.lessons.endsAt,
  pairNo: s.lessons.pairNo,
  room: s.lessons.room,
  building: s.lessons.building,
  status: s.lessons.status,
  changeNote: s.lessons.changeNote,
  prevStartsAt: s.lessons.prevStartsAt,
  prevRoom: s.lessons.prevRoom,
  prevTeacher: s.lessons.prevTeacher,
  substituteTeacher: s.lessons.substituteTeacher,
  changedAt: s.lessons.changedAt,
  isLanguage: s.courses.isLanguage,
  langGroup: s.courses.langGroup,
};

type Row = { [K in keyof typeof lessonColumns]: unknown } & Record<string, unknown>;

/** Название дисциплины, корпус и пояснения на языке интерфейса; ФИО, группы и номера аудиторий не переводим. */
function toView(r: Row, locale: Locale): LessonView {
  const { tLast, tFirst, tMiddle, titleEn, ...rest } = r as Row & { tLast: string; tFirst: string; tMiddle: string | null; titleEn: string | null };
  const v = { ...(rest as unknown as Omit<LessonView, "teacher">), teacher: `${tLast} ${tFirst[0]}.${tMiddle ? ` ${tMiddle[0]}.` : ""}` };
  if (locale !== "en") return v;
  return {
    ...v,
    title: titleEn ?? v.title,
    building: buildingLabel(v.building, "en"),
    room: roomEn(v.room),
    prevRoom: v.prevRoom && roomEn(v.prevRoom),
    changeNote: v.changeNote && (CHANGE_NOTE_EN[v.changeNote] ?? v.changeNote),
  };
}

/** Занятия студента в интервале [from, to), только по курсам, на которые он записан. locale по умолчанию: язык запроса. */
export async function getMyLessons(from: Date, to: Date, locale?: Locale): Promise<LessonView[]> {
  const { student } = await requireStudent();
  const lang = locale ?? (await getLocale());
  const rows = await db
    .select(lessonColumns)
    .from(s.lessons)
    .innerJoin(s.enrollments, and(eq(s.enrollments.courseId, s.lessons.courseId), eq(s.enrollments.studentId, student.id)))
    .innerJoin(s.courses, eq(s.courses.id, s.lessons.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
    .where(
      or(
        and(gte(s.lessons.startsAt, from), lt(s.lessons.startsAt, to)),
        and(eq(s.lessons.status, "moved"), gte(s.lessons.prevStartsAt, from), lt(s.lessons.prevStartsAt, to)),
      ),
    )
    .orderBy(asc(s.lessons.startsAt));

  const out: LessonView[] = [];
  for (const r of rows) {
    const v = toView(r as Row, lang);
    const inRange = v.startsAt >= from && v.startsAt < to;
    if (inRange) out.push(v);
    // перенос с этого периода, показываем «призрак» на исходном месте
    if (v.status === "moved" && v.prevStartsAt && v.prevStartsAt >= from && v.prevStartsAt < to) {
      const dur = v.endsAt.getTime() - v.startsAt.getTime();
      out.push({ ...v, movedAway: true, movedTo: v.startsAt, id: `${v.id}:from`, startsAt: v.prevStartsAt, endsAt: new Date(v.prevStartsAt.getTime() + dur) });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || Number(!!a.movedAway) - Number(!!b.movedAway));
}

/** Ближайшие изменения в расписании (переносы, отмены, замены) */
export async function getUpcomingChanges(days = 7, locale?: Locale): Promise<LessonView[]> {
  const { student } = await requireStudent();
  const lang = locale ?? (await getLocale());
  const from = startOfMskDay(new Date());
  const to = addDays(from, days + 1);
  const rows = await db
    .select(lessonColumns)
    .from(s.lessons)
    .innerJoin(s.enrollments, and(eq(s.enrollments.courseId, s.lessons.courseId), eq(s.enrollments.studentId, student.id)))
    .innerJoin(s.courses, eq(s.courses.id, s.lessons.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
    .where(and(ne(s.lessons.status, "scheduled"), gte(s.lessons.startsAt, from), lt(s.lessons.startsAt, to)))
    .orderBy(asc(s.lessons.startsAt));
  return rows.map((r) => toView(r as Row, lang));
}

/** Следующее занятие после момента (для «на сегодня всё» и выходных) */
export async function getNextLessonAfter(after: Date, locale?: Locale): Promise<LessonView | null> {
  const lessons = await getMyLessons(after, addDays(after, 10), locale);
  return lessons.find((l) => l.status !== "cancelled" && !l.movedAway && l.startsAt > after) ?? null;
}
