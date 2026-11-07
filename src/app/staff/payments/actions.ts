"use server";
// Экшены учебного офиса по оплате обучения. Каждый: requireStaff(), zod, платёж ищется только в области сотрудника.
// Сами изменения и уведомления делает слой данных (src/lib/data/payments.ts), он повторно проверяет область.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/dal";
import { getScopedPayment, listReminderTargets, recordPayment, sendPaymentReminders } from "@/lib/data/payments";
import { canRemind, REMIND_COOLDOWN_MS } from "@/lib/payments";
import { addDays, dayKey, mskDate, parseDayKey, plural, relativeTime } from "@/lib/time";

export type PaymentActionState = { ok?: string; error?: string } | undefined;

const IdSchema = z.object({ id: z.string().uuid("Платёж не найден") });

const MarkPaidSchema = z.object({
  id: z.string().uuid("Платёж не найден"),
  receiptNo: z
    .string()
    .trim()
    .min(3, "Укажите номер платёжного документа")
    .max(40, "Номер: не больше 40 символов")
    .regex(/^[0-9A-Za-zА-Яа-яЁё№/.\- ]+$/, "Номер: цифры, буквы, дефис или косая черта"),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату оплаты"),
});

const RemindAllSchema = z.object({ filter: z.enum(["overdue", "soon"]) });

function refresh() {
  revalidatePath("/staff/payments");
  revalidatePath("/payments");
}

export async function remindPaymentAction(_prev: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  await requireStaff();
  const parsed = IdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Платёж не найден" };
  const row = await getScopedPayment(parsed.data.id); // null вне области сотрудника
  if (!row) return { error: "Платёж не найден" };
  if (row.paidAt) return { error: "Этот платёж уже оплачен" };
  if (row.remindedAt && !canRemind(row.remindedAt)) {
    const next = new Date(row.remindedAt.getTime() + REMIND_COOLDOWN_MS);
    const ago = relativeTime(row.remindedAt);
    return { error: `Уже напоминали ${ago === "сейчас" ? "только что" : ago}. Повторить можно ${relativeTime(next)}.` };
  }
  const sent = await sendPaymentReminders([row.id]);
  if (!sent) return { error: "Напоминание уже отправили, обновите страницу" };
  refresh();
  return { ok: `Напоминание отправлено: ${row.lastName} ${row.firstName}` };
}

export async function remindAllAction(_prev: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  await requireStaff();
  const parsed = RemindAllSchema.safeParse({ filter: formData.get("filter") });
  if (!parsed.success) return { error: "Выберите список: просрочено или скоро срок" };
  const ids = await listReminderTargets(parsed.data.filter);
  if (!ids.length) return { error: "Всем из этого списка уже напоминали за последние сутки" };
  const sent = await sendPaymentReminders(ids);
  refresh();
  if (!sent) return { error: "Всем из этого списка уже напоминали за последние сутки" };
  return { ok: `Отправлено ${sent} ${plural(sent, "напоминание", "напоминания", "напоминаний")}` };
}

export async function markPaidAction(_prev: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  await requireStaff();
  const parsed = MarkPaidSchema.safeParse({ id: formData.get("id"), receiptNo: formData.get("receiptNo"), paidOn: formData.get("paidOn") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const { id, receiptNo, paidOn } = parsed.data;

  const day = parseDayKey(paidOn);
  if (!day) return { error: "Укажите дату оплаты" };
  const now = new Date();
  if (paidOn > dayKey(now)) return { error: "Дата оплаты не может быть в будущем" };
  if (paidOn < dayKey(addDays(now, -730))) return { error: "Дата оплаты слишком давняя, проверьте год" };
  const [y, m, d] = paidOn.split("-").map(Number);
  const noon = mskDate(y, m - 1, d, 12, 0);
  const paidAt = noon > now ? now : noon;

  const result = await recordPayment(id, receiptNo.replace(/\s+/g, " "), paidAt);
  if (result === "not_found") return { error: "Платёж не найден" };
  if (result === "already_paid") return { error: "Оплату по этому платежу уже отметили" };
  refresh();
  return { ok: "Оплата отмечена, студент получил уведомление" };
}
