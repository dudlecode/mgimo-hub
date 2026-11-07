import "server-only";
// Запись на приём. Студенческие функции работают только с записями student.id из сессии,
// функции офиса: только с записями своего факультета (staff.facultyId; null = все факультеты).
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff, requireStudent } from "@/lib/auth/dal";
import type { AppointmentStatus } from "@/db/schema";
import {
  bookingDays,
  daySlots,
  isBookableSlot,
  isSlotOpen,
  MAX_ACTIVE_APPOINTMENTS,
  randomAppointmentCode,
  SLOT_MIN,
  type AppointmentTopic,
} from "@/lib/appointments";
import { addDays, dayKey, formatTime, MINUTE_MS, startOfMskDay } from "@/lib/time";

const Uuid = z.string().uuid();

export const SLOT_TAKEN_ERROR = "Это время уже заняли, выберите другое";

/** Активная запись: не отменена, не отмечена и ещё не закончилась */
function activeOf(studentId: string, now: Date): SQL {
  return and(
    eq(s.appointments.studentId, studentId),
    eq(s.appointments.status, "booked"),
    gte(s.appointments.startsAt, new Date(now.getTime() - SLOT_MIN * MINUTE_MS)),
  )!;
}

/** Код нарушения уникальности Postgres (23505) и имя ограничения; ищем и во вложенной причине (DrizzleQueryError). */
function uniqueViolation(e: unknown): string | null {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const o = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (o.code === "23505") return typeof o.constraint === "string" ? o.constraint : "";
    cur = o.cause;
  }
  return null;
}

// ───────────── Студент ─────────────

export type SlotState = "free" | "taken" | "mine" | "closed";
export type BookingDay = { key: string; iso: string; free: number; slots: { iso: string; time: string; state: SlotState }[] };

/** Дни и слоты для записи в учебный офис своего факультета. Чужие записи видны только как «занято». */
export async function getMyBookingOptions(now: Date = new Date()) {
  const { student, faculty } = await requireStudent();
  const days = bookingDays(now);
  const from = days[0] ?? startOfMskDay(now);
  const to = addDays(days[days.length - 1] ?? from, 1);
  const [taken, [{ n: active }]] = await Promise.all([
    db
      .select({ startsAt: s.appointments.startsAt, studentId: s.appointments.studentId })
      .from(s.appointments)
      .where(and(eq(s.appointments.facultyId, faculty.id), eq(s.appointments.status, "booked"), gte(s.appointments.startsAt, from), lt(s.appointments.startsAt, to))),
    db.select({ n: count() }).from(s.appointments).where(activeOf(student.id, now)),
  ]);
  const busy = new Map(taken.map((t) => [t.startsAt.getTime(), t.studentId === student.id]));
  const result: BookingDay[] = days.map((d) => {
    const slots = daySlots(d).map((t) => {
      const mine = busy.get(t.getTime());
      const state: SlotState = mine === true ? "mine" : mine === false ? "taken" : isSlotOpen(t, now) ? "free" : "closed";
      return { iso: t.toISOString(), time: formatTime(t), state };
    });
    return { key: dayKey(d), iso: d.toISOString(), free: slots.filter((x) => x.state === "free").length, slots };
  });
  return { days: result, active, limit: MAX_ACTIVE_APPOINTMENTS, faculty };
}

const myCols = {
  id: true,
  startsAt: true,
  durationMin: true,
  topic: true,
  comment: true,
  status: true,
  code: true,
  cancelReason: true,
  createdAt: true,
} as const;

export async function listMyAppointments(now: Date = new Date()) {
  const { student } = await requireStudent();
  const rows = await db.query.appointments.findMany({
    where: eq(s.appointments.studentId, student.id),
    columns: myCols,
    with: { faculty: { columns: { code: true, officeRoom: true, campus: true } } },
    orderBy: [desc(s.appointments.startsAt)],
    limit: 50,
  });
  const isUpcoming = (r: (typeof rows)[number]) => r.status === "booked" && r.startsAt.getTime() + r.durationMin * MINUTE_MS > now.getTime();
  return {
    upcoming: rows.filter(isUpcoming).reverse(),
    past: rows.filter((r) => !isUpcoming(r)),
  };
}

/** Своя запись по id из адреса; чужая или несуществующая: null. */
export async function findMyAppointment(id: string) {
  const { student } = await requireStudent();
  if (!Uuid.safeParse(id).success) return null;
  const row = await db.query.appointments.findFirst({
    where: and(eq(s.appointments.id, id), eq(s.appointments.studentId, student.id)),
    columns: myCols,
    with: { faculty: { columns: { code: true, name: true, officeRoom: true, campus: true, officeHours: true } } },
  });
  return row ?? null;
}

/** То же, но промах даёт 404 (не подтверждаем, что такая запись существует). */
export async function getMyAppointment(id: string) {
  const row = await findMyAppointment(id);
  if (!row) notFound();
  return row;
}

export type BookResult =
  | { ok: true; id: string; code: string; startsAt: Date }
  | { ok: false; reason: "slot" | "taken" | "limit"; error: string };

/**
 * Запись на приём. Время перепроверяется по часам работы, лимит считается под блокировкой строки студента
 * (параллельные запросы одного студента не обойдут лимит), а двойную запись на один слот разными студентами
 * отсекает частичный уникальный индекс appointments_slot_booked_idx.
 */
export async function bookMyAppointment(input: { topic: AppointmentTopic; startsAt: Date; comment: string | null }, now: Date = new Date()): Promise<BookResult> {
  const { student, faculty } = await requireStudent();
  if (!isBookableSlot(input.startsAt, now)) return { ok: false, reason: "slot", error: "На это время записаться нельзя, выберите другое" };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx): Promise<BookResult> => {
        await tx.execute(sql`select 1 from ${s.students} where ${s.students.id} = ${student.id} for update`);
        const [{ n }] = await tx.select({ n: count() }).from(s.appointments).where(activeOf(student.id, now));
        if (n >= MAX_ACTIVE_APPOINTMENTS) {
          return { ok: false, reason: "limit", error: `У вас уже ${n} активные записи. Отмените одну, чтобы выбрать новое время.` };
        }
        const [busy] = await tx
          .select({ id: s.appointments.id })
          .from(s.appointments)
          .where(and(eq(s.appointments.facultyId, faculty.id), eq(s.appointments.startsAt, input.startsAt), eq(s.appointments.status, "booked")))
          .limit(1);
        if (busy) return { ok: false, reason: "taken", error: SLOT_TAKEN_ERROR };
        const [row] = await tx
          .insert(s.appointments)
          .values({
            studentId: student.id,
            facultyId: faculty.id,
            startsAt: input.startsAt,
            durationMin: SLOT_MIN,
            topic: input.topic,
            comment: input.comment,
            code: randomAppointmentCode(),
          })
          .returning({ id: s.appointments.id, code: s.appointments.code, startsAt: s.appointments.startsAt });
        return { ok: true, ...row };
      });
    } catch (e) {
      const constraint = uniqueViolation(e);
      if (constraint === "appointments_code_unique") continue; // редкое совпадение кода талона: пробуем другой
      if (constraint !== null) return { ok: false, reason: "taken", error: SLOT_TAKEN_ERROR };
      throw e;
    }
  }
  return { ok: false, reason: "taken", error: "Не удалось записаться, попробуйте ещё раз" };
}

/** Отмена своей предстоящей записи. Чужая, прошедшая или уже закрытая не меняется. */
export async function cancelMyAppointment(id: string, now: Date = new Date()) {
  const { student } = await requireStudent();
  if (!Uuid.safeParse(id).success) return null;
  const [row] = await db
    .update(s.appointments)
    .set({ status: "cancelled", cancelReason: null })
    .where(and(eq(s.appointments.id, id), eq(s.appointments.studentId, student.id), eq(s.appointments.status, "booked"), gte(s.appointments.startsAt, now)))
    .returning({ id: s.appointments.id, startsAt: s.appointments.startsAt });
  return row ?? null;
}

// ───────────── Учебный офис ─────────────

function scope(facultyId: string | null): SQL | undefined {
  return facultyId ? eq(s.appointments.facultyId, facultyId) : undefined;
}

/** Записи области сотрудника на день, по времени. */
export async function listScopedAppointmentsOn(day: Date) {
  const { staff } = await requireStaff();
  const from = startOfMskDay(day);
  return db
    .select({
      id: s.appointments.id,
      startsAt: s.appointments.startsAt,
      durationMin: s.appointments.durationMin,
      topic: s.appointments.topic,
      comment: s.appointments.comment,
      status: s.appointments.status,
      code: s.appointments.code,
      cancelReason: s.appointments.cancelReason,
      studentId: s.students.id,
      lastName: s.students.lastName,
      firstName: s.students.firstName,
      middleName: s.students.middleName,
      groupCode: s.groups.code,
      course: s.groups.course,
      facultyCode: s.faculties.code,
    })
    .from(s.appointments)
    .innerJoin(s.students, eq(s.students.id, s.appointments.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.faculties, eq(s.faculties.id, s.appointments.facultyId))
    .where(and(scope(staff.facultyId), gte(s.appointments.startsAt, from), lt(s.appointments.startsAt, addDays(from, 1))))
    .orderBy(asc(s.appointments.startsAt), asc(s.faculties.code));
}

/** Число записей (кроме отменённых) по дням диапазона, для полосы дней. */
export async function countScopedAppointmentsByDay(from: Date, to: Date) {
  const { staff } = await requireStaff();
  const day = sql<string>`to_char(${s.appointments.startsAt} at time zone 'Europe/Moscow', 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, n: sql<number>`count(*)::int` })
    .from(s.appointments)
    .where(and(scope(staff.facultyId), gte(s.appointments.startsAt, from), lt(s.appointments.startsAt, to), sql`${s.appointments.status} <> 'cancelled'`))
    .groupBy(day);
  return new Map(rows.map((r) => [r.day, r.n]));
}

/** Счётчики на сегодня: всего записано, ждём, пришли, не пришли. */
export async function getScopedAppointmentStats(now: Date = new Date()) {
  const { staff } = await requireStaff();
  const from = startOfMskDay(now);
  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where ${s.appointments.status} <> 'cancelled')::int`,
      waiting: sql<number>`count(*) filter (where ${s.appointments.status} = 'booked' and ${s.appointments.startsAt} + make_interval(mins => ${s.appointments.durationMin}::int) > ${now})::int`,
      done: sql<number>`count(*) filter (where ${s.appointments.status} = 'done')::int`,
      noShow: sql<number>`count(*) filter (where ${s.appointments.status} = 'no_show')::int`,
    })
    .from(s.appointments)
    .where(and(scope(staff.facultyId), gte(s.appointments.startsAt, from), lt(s.appointments.startsAt, addDays(from, 1))));
  return row ?? { total: 0, waiting: 0, done: 0, noShow: 0 };
}

/** Запись в пределах области сотрудника; вне области: null. */
export async function getScopedAppointment(id: string) {
  const { staff } = await requireStaff();
  if (!Uuid.safeParse(id).success) return null;
  const row = await db.query.appointments.findFirst({
    where: and(eq(s.appointments.id, id), scope(staff.facultyId)),
    with: { student: { columns: { id: true, userId: true, firstName: true, lastName: true } }, faculty: { columns: { code: true, officeRoom: true } } },
  });
  return row ?? null;
}

/** Смена статуса записью офиса. Только из «booked» и только в своей области (оптимистичная блокировка по статусу). */
export async function setScopedAppointmentStatus(id: string, next: Exclude<AppointmentStatus, "booked">, cancelReason: string | null) {
  const { staff } = await requireStaff();
  if (!Uuid.safeParse(id).success) return false;
  const res = await db
    .update(s.appointments)
    .set({ status: next, cancelReason: next === "cancelled" ? cancelReason : null })
    .where(and(eq(s.appointments.id, id), eq(s.appointments.status, "booked"), scope(staff.facultyId)))
    .returning({ id: s.appointments.id });
  return res.length > 0;
}
