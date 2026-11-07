// Демо-записи на приём в учебный офис: «массовка» студентов МО и МЭО на ближайшие рабочие дни
// (сегодня часть приёмов уже прошла) и одна предстоящая запись у демо-студента Тимура.
// Вызывается из src/db/seed/index.ts после создания студентов. Повторный запуск заменяет все записи.
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "../client";
import * as s from "../schema";
import { APPOINTMENT_TOPICS, bookingDays, daySlots, isOfficeDay, randomAppointmentCode, SLOT_MIN, type AppointmentTopic } from "@/lib/appointments";
import { addDays, formatTime, MINUTE_MS, startOfMskDay } from "@/lib/time";
import { appointmentText } from "@/lib/notify-text";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMENTS: Record<AppointmentTopic, string[]> = {
  certificate: ["Нужна справка с печатью для военкомата", "Архивная справка за первый курс", "Справка для визы, нужна на английском"],
  documents: ["Направление на пересдачу по макроэкономике", "Подпись декана на заявлении о переводе", "Заверить копию зачётной книжки"],
  plan: ["Хочу перезачесть курс из летней школы", "Вопрос по выбору дисциплин на весну", "Индивидуальный план из-за спортивных сборов"],
  scholarship: ["Документы на повышенную стипендию", "Материальная помощь, принесу справки", "Не пришла стипендия за октябрь"],
  mobility: ["Документы для семестра по обмену", "Learning agreement, нужна подпись", "Справка для стажировки в посольстве"],
  other: ["Потерял студенческий билет", "Смена фамилии в документах", "Вопрос по общежитию"],
};

const OFFICE_CANCEL = "Специалист на совещании в ректорате, пожалуйста, выберите другое время";

export async function seedAppointments(now: Date = new Date()) {
  const rand = mulberry32(20261107);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  await db.delete(s.appointments);

  const crowd = await db
    .select({ id: s.students.id, facultyId: s.groups.facultyId })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.users, eq(s.users.id, s.students.userId))
    .where(and(inArray(s.groups.facultyId, ["mo", "meo"]), notInArray(s.users.login, ["student.anna", "student.timur", "student.leyla"])))
    .orderBy(asc(s.students.recordBook));
  const pool: Record<string, string[]> = { mo: [], meo: [] };
  for (const c of crowd) pool[c.facultyId]?.push(c.id);
  for (const k of Object.keys(pool)) pool[k].sort(() => rand() - 0.5);

  const used = new Set<string>();
  const rows: (typeof s.appointments.$inferInsert)[] = [];

  function add(facultyId: string, startsAt: Date, status: s.AppointmentStatus, studentId?: string, extra: Partial<typeof s.appointments.$inferInsert> = {}) {
    const sid = studentId ?? pool[facultyId].shift();
    if (!sid) return null;
    const key = `${facultyId}:${startsAt.getTime()}`;
    if (status === "booked") used.add(key);
    const topic = extra.topic ?? pick(APPOINTMENT_TOPICS).value;
    const lead = Math.min(72, Math.max(2, (startsAt.getTime() - now.getTime()) / 3_600_000 + 24 + rand() * 48));
    const row = {
      studentId: sid,
      facultyId,
      startsAt,
      durationMin: SLOT_MIN,
      topic,
      comment: rand() < 0.65 ? pick(COMMENTS[topic as AppointmentTopic]) : null,
      status,
      code: randomAppointmentCode(),
      createdAt: new Date(Math.min(now.getTime(), startsAt.getTime()) - lead * 3_600_000),
      ...extra,
    };
    rows.push(row);
    return row;
  }

  /** Случайный незанятый слот дня: past = уже закончился, иначе ещё впереди */
  function slot(facultyId: string, day: Date, when: "past" | "future"): Date | null {
    const free = daySlots(day).filter((t) => {
      if (used.has(`${facultyId}:${t.getTime()}`)) return false;
      const end = t.getTime() + SLOT_MIN * MINUTE_MS;
      return when === "past" ? end <= now.getTime() : t.getTime() > now.getTime();
    });
    return free.length ? pick(free) : null;
  }

  const today = startOfMskDay(now);
  const upcoming: Date[] = [];
  for (let d = addDays(today, 1); upcoming.length < 4; d = addDays(d, 1)) if (isOfficeDay(d)) upcoming.push(d);

  for (const fac of ["mo", "meo"]) {
    // Сегодня: двое уже были (один не пришёл), двое ещё придут
    if (isOfficeDay(today)) {
      const p1 = slot(fac, today, "past");
      if (p1) add(fac, p1, "done");
      const p2 = slot(fac, today, "past");
      if (p2) add(fac, p2, fac === "mo" ? "no_show" : "done");
      for (let i = 0; i < 2; i++) {
        const f = slot(fac, today, "future");
        if (f) add(fac, f, "booked");
      }
    }
    // Ближайшие дни: по 2-3 записи
    upcoming.forEach((d, i) => {
      for (let k = 0; k < (i === 0 ? 3 : 2); k++) {
        const f = slot(fac, d, "future");
        if (f) add(fac, f, "booked");
      }
    });
    // Отменённые: одну отменил студент, одну учебный офис
    const c1 = slot(fac, upcoming[1], "future");
    if (c1) add(fac, c1, "cancelled", undefined, fac === "meo" ? { cancelReason: OFFICE_CANCEL } : {});
  }

  // Демо-студент Тимур (МЭО): предстоящая запись «Пересдача и документы»
  const [timur] = await db
    .select({ id: s.students.id, userId: s.students.userId, facultyId: s.groups.facultyId })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.users, eq(s.users.id, s.students.userId))
    .where(eq(s.users.login, "student.timur"));
  let timurRow: (typeof rows)[number] | null = null;
  if (timur) {
    const days = bookingDays(now);
    const day = days[1] ?? days[0];
    const preferred = daySlots(day).find((t) => formatTime(t) === "11:30" && !used.has(`${timur.facultyId}:${t.getTime()}`));
    const at = preferred ?? slot(timur.facultyId, day, "future");
    if (at) {
      timurRow = add(timur.facultyId, at, "booked", timur.id, {
        topic: "documents",
        comment: "Нужно направление на пересдачу по эконометрике и подпись на заявлении",
        createdAt: new Date(now.getTime() - 26 * 3_600_000),
      });
    }
  }

  const inserted = rows.length ? await db.insert(s.appointments).values(rows).returning({ id: s.appointments.id, studentId: s.appointments.studentId }) : [];

  if (timur && timurRow) {
    const id = inserted.find((r) => r.studentId === timur.id)?.id;
    const [fac] = await db.select({ code: s.faculties.code, room: s.faculties.officeRoom }).from(s.faculties).where(eq(s.faculties.id, timur.facultyId));
    const at = timurRow.startsAt as Date;
    await db.insert(s.notifications).values({
      userId: timur.userId,
      kind: "request",
      ...appointmentText.booked(timurRow.topic as string, at, fac?.code ?? "МЭО", fac?.room ?? "", timurRow.code as string),
      link: id ? `/appointments/${id}` : "/appointments",
      createdAt: timurRow.createdAt as Date,
      readAt: new Date(now.getTime() - 25 * 3_600_000),
    });
  }

  console.log(`✓ Записи на приём: ${inserted.length}`);
  return inserted.length;
}
