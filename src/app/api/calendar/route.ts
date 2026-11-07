// Экспорт расписания в формате iCalendar (.ics), импорт в Календарь iPhone, Google, Яндекс.
// Доступно только самому студенту: сессия проверяется, занятия берутся по его записям на курсы.
import { NextResponse } from "next/server";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { getCurrentSession } from "@/lib/auth/session";
import { addDays } from "@/lib/time";
import { buildingLabel, getSemester } from "@/lib/academic";
import { getLocale } from "@/lib/i18n/server";
import { calendarMessages, CHANGE_NOTE_EN, lessonMessages, roomEn } from "@/lib/i18n/messages/schedule";

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET() {
  const locale = await getLocale();
  const t = calendarMessages[locale];
  const format = lessonMessages[locale].format;
  const en = locale === "en";
  const session = await getCurrentSession();
  if (!session || session.user.role !== "student") return NextResponse.json({ error: t.signIn }, { status: 401 });
  const student = await db.query.students.findFirst({ where: eq(s.students.userId, session.user.id), columns: { id: true } });
  if (!student) return NextResponse.json({ error: t.forbidden }, { status: 403 });

  const from = addDays(new Date(), -7);
  const to = addDays(getSemester().end, 1);
  const rows = await db
    .select({
      id: s.lessons.id,
      startsAt: s.lessons.startsAt,
      endsAt: s.lessons.endsAt,
      room: s.lessons.room,
      building: s.lessons.building,
      format: s.lessons.format,
      status: s.lessons.status,
      note: s.lessons.changeNote,
      title: s.disciplines.name,
      titleEn: s.disciplines.nameEn,
      tLast: s.teachers.lastName,
      tFirst: s.teachers.firstName,
    })
    .from(s.lessons)
    .innerJoin(s.enrollments, and(eq(s.enrollments.courseId, s.lessons.courseId), eq(s.enrollments.studentId, student.id)))
    .innerJoin(s.courses, eq(s.courses.id, s.lessons.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
    .where(and(gte(s.lessons.startsAt, from), lt(s.lessons.startsAt, to)))
    .orderBy(asc(s.lessons.startsAt));

  const stamp = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MGIMO Hub//Schedule//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${t.calName}`,
    "X-WR-TIMEZONE:Europe/Moscow",
  ];
  for (const r of rows) {
    const title = en ? (r.titleEn ?? r.title) : r.title;
    const room = en ? roomEn(r.room) : r.room;
    const note = en && r.note ? (CHANGE_NOTE_EN[r.note] ?? r.note) : r.note;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@attache.demo`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(r.startsAt)}`,
      `DTEND:${icsDate(r.endsAt)}`,
      `SUMMARY:${esc(`${r.status === "cancelled" ? t.cancelled : ""}${title} (${format[r.format]})`)}`,
      `LOCATION:${esc(t.room(room, buildingLabel(r.building, locale)))}`,
      `DESCRIPTION:${esc(`${t.teacher}: ${r.tLast} ${r.tFirst[0]}.${note ? `\n${note}` : ""}`)}`,
      `STATUS:${r.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="attache-schedule.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
