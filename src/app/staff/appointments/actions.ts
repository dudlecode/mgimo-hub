"use server";
// Приём студентов: экшены учебного офиса. Каждый: requireStaff(), запись только в области сотрудника,
// смена статуса только из «booked» (оптимистичная блокировка), при отмене уведомление студенту.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/dal";
import { getScopedAppointment, setScopedAppointmentStatus } from "@/lib/data/appointments";
import { notify } from "@/lib/data/notify";
import { addDays, formatDayMonth, formatTime, startOfMskDay } from "@/lib/time";
import { audit } from "@/lib/audit";
import { appointmentText } from "@/lib/notify-text";

export type AppointmentActionState = { ok?: string; error?: string } | undefined;

const Schema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["done", "no_show", "cancel"]),
  reason: z.string().trim().max(300, "Причина: не больше 300 символов"),
});

export async function appointmentAction(_prev: AppointmentActionState, formData: FormData): Promise<AppointmentActionState> {
  await requireStaff();
  const parsed = Schema.safeParse({ id: formData.get("id"), kind: formData.get("kind"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, kind, reason } = parsed.data;

  const a = await getScopedAppointment(id); // вне области сотрудника: null
  if (!a) return { error: "Запись не найдена" };
  if (a.status !== "booked") return { error: "Запись уже обработана, обновите страницу" };

  const now = new Date();
  if (kind !== "cancel" && a.startsAt >= addDays(startOfMskDay(now), 1)) return { error: "Отметить явку можно в день приёма" };
  if (kind === "cancel") {
    if (reason.length < 3) return { error: "Укажите причину отмены, студент её увидит" };
    if (a.startsAt.getTime() + a.durationMin * 60_000 < now.getTime()) return { error: "Приём уже прошёл, отметьте явку" };
  }

  const next = kind === "cancel" ? "cancelled" : kind;
  const ok = await setScopedAppointmentStatus(a.id, next, kind === "cancel" ? reason : null);
  if (!ok) return { error: "Запись только что изменили, обновите страницу" };
  const slot = `${formatDayMonth(a.startsAt)}, ${formatTime(a.startsAt)}`;
  await audit({
    action: kind === "cancel" ? "appointment.cancel" : "appointment.mark",
    entityType: "appointment",
    entityId: a.id,
    studentId: a.student.id,
    summary:
      kind === "cancel"
        ? `Отменена запись на приём ${slot}, талон ${a.code}`
        : `Приём ${slot}, талон ${a.code}: отмечено «${kind === "done" ? "пришёл" : "не пришёл"}»`,
  });

  if (kind === "cancel") {
    await notify({
      userId: a.student.userId,
      kind: "request",
      ...appointmentText.cancelled(a.topic, a.startsAt, a.durationMin, reason),
      link: "/appointments",
      important: true,
    });
  }

  revalidatePath("/staff/appointments");
  return { ok: kind === "done" ? "Отмечено: пришёл" : kind === "no_show" ? "Отмечено: не пришёл" : "Запись отменена, студент получил уведомление" };
}
