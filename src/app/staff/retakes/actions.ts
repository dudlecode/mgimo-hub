"use server";
// Экшены пересдач. Каждый: requireStaff, разбор входа zod, вызов слоя данных (там проверка области
// сотрудника для каждого id из формы), revalidatePath. В БД экшены сами не ходят.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/dal";
import { createRetakeSession, deleteRetakeDraft, publishRetakeSession, recordRetakeResult, suggestRetakeSlot, type SlotSuggestion } from "@/lib/data/retakes";
import { RETAKE_RESULTS, RETAKE_RULES } from "@/lib/retakes";

export type RetakeActionState = { ok?: string; error?: string; commission?: boolean } | undefined;

const PATH = "/staff/retakes";
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время");

const SessionSchema = z.object({
  courseId: z.string().uuid("Дисциплина не найдена"),
  attempt: z.coerce.number().int().refine((v) => v === 2 || v === 3, "Попытка: 2 или 3"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату"),
  time: Time,
  room: z
    .string()
    .trim()
    .min(1, "Укажите аудиторию")
    .max(20, "Аудитория: до 20 символов")
    .regex(/^[0-9A-Za-zА-Яа-яЁё. -]+$/u, "Аудитория: цифры и буквы"),
  commission: z
    .array(
      z
        .string()
        .trim()
        .max(80, "ФИО: до 80 символов")
        .regex(/^[A-Za-zА-Яа-яЁё.' -]*$/u, "ФИО: только буквы, точки и дефис"),
    )
    .max(RETAKE_RULES.commissionMax + 3, `В комиссии не больше ${RETAKE_RULES.commissionMax} человек`),
  note: z.string().trim().max(RETAKE_RULES.noteMax, `Примечание: до ${RETAKE_RULES.noteMax} символов`),
});

export async function createRetakeSessionAction(_prev: RetakeActionState, formData: FormData): Promise<RetakeActionState> {
  await requireStaff();
  const parsed = SessionSchema.safeParse({
    courseId: String(formData.get("courseId") ?? ""),
    attempt: formData.get("attempt"),
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
    room: String(formData.get("room") ?? ""),
    commission: formData.getAll("commission").map(String),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const res = await createRetakeSession({ ...d, note: d.note || null });
  if (res.ok) revalidatePath(PATH);
  return res;
}

const SessionId = z.object({ sessionId: z.string().uuid("Пересдача не найдена") });

export async function publishRetakeSessionAction(_prev: RetakeActionState, formData: FormData): Promise<RetakeActionState> {
  await requireStaff();
  const parsed = SessionId.safeParse({ sessionId: String(formData.get("sessionId") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const res = await publishRetakeSession(parsed.data.sessionId);
  if (res.ok) {
    revalidatePath(PATH);
    revalidatePath("/staff/radar");
  }
  return res;
}

export async function deleteRetakeDraftAction(_prev: RetakeActionState, formData: FormData): Promise<RetakeActionState> {
  await requireStaff();
  const parsed = SessionId.safeParse({ sessionId: String(formData.get("sessionId") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const res = await deleteRetakeDraft(parsed.data.sessionId);
  if (res.ok) revalidatePath(PATH);
  return res;
}

const ResultSchema = z.object({
  referralId: z.string().uuid("Направление не найдено"),
  result: z.enum(RETAKE_RESULTS, "Выберите результат"),
  points: z
    .string()
    .trim()
    .regex(/^\d{0,3}$/, "Баллы: целое число от 0 до 100")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || v <= 100, "Баллы: целое число от 0 до 100"),
});

export async function recordRetakeResultAction(_prev: RetakeActionState, formData: FormData): Promise<RetakeActionState> {
  await requireStaff();
  const parsed = ResultSchema.safeParse({
    referralId: String(formData.get("referralId") ?? ""),
    result: String(formData.get("result") ?? ""),
    points: String(formData.get("points") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const res = await recordRetakeResult(parsed.data);
  if (res.ok) {
    revalidatePath(PATH);
    revalidatePath("/staff/radar");
  }
  return res;
}

const SuggestSchema = z.object({ courseId: z.string().uuid(), time: Time });

/** Подбор даты и аудитории для формы «Назначить». Только чтение, ничего не сохраняет. */
export async function suggestRetakeSlotAction(courseId: string, time: string): Promise<SlotSuggestion> {
  await requireStaff();
  const parsed = SuggestSchema.safeParse({ courseId, time });
  if (!parsed.success) return { ok: false, error: "Выберите время начала" };
  return suggestRetakeSlot(parsed.data.courseId, parsed.data.time);
}
