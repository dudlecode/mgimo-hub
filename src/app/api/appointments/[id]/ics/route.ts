// Запись на приём в формате iCalendar (.ics). Только своя запись: чужая или несуществующая даёт 404.
import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getMyAppointment } from "@/lib/data/appointments";
import { campusInfo } from "@/lib/academic";
import { MINUTE_MS } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import { appointmentsMessages, topicLabelFor } from "@/lib/i18n/messages/appointments";

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const t = appointmentsMessages[locale];
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: t.signIn }, { status: 401 });
  if (session.user.role !== "student") notFound();

  const { id } = await params;
  const a = await getMyAppointment(id); // where id = :id and student_id = я, иначе 404

  const end = new Date(a.startsAt.getTime() + a.durationMin * MINUTE_MS);
  const where = t.icsWhere(a.faculty.code, a.faculty.officeRoom, campusInfo(a.faculty.campus, locale).building);
  const cancelled = a.status === "cancelled";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MGIMO Hub//Appointments//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:appointment-${a.id}@attache.demo`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(a.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(`${cancelled ? t.icsCancelled : ""}${t.icsSummary(a.faculty.code, topicLabelFor(a.topic, locale))}`)}`,
    `LOCATION:${esc(where)}`,
    `DESCRIPTION:${esc(`${t.icsDescription(a.code)}${a.comment ? t.icsComment(a.comment) : ""}`)}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(t.icsAlarm(a.faculty.officeRoom))}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointment-${a.code}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
