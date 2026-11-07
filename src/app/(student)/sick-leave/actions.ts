"use server";
// Сообщить о болезни. Студент берётся только из сессии, даты и комментарий проверяются здесь.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/dal";
import { openMySickLeave } from "@/lib/data/sick-leave";
import { earliestStartKey, todayKeyMsk } from "@/lib/sick-leave";
import { addDays, dayKey, parseDayKey } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import { localizeSickError, sickLeaveMessages } from "@/lib/i18n/messages/sick-leave";

const date = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату")
  .refine((v) => parseDayKey(v) !== null, "Укажите дату");

const OpenSchema = z.object({
  startsOn: date,
  expectedEnd: z.union([z.literal(""), date]),
  comment: z.string().trim().max(500, "Не больше 500 символов"),
});

export type OpenSickState = {
  ok?: boolean;
  error?: string;
  errors?: Partial<Record<"startsOn" | "expectedEnd" | "comment", string>>;
  values?: { startsOn: string; expectedEnd: string; comment: string };
} | undefined;

export async function openSickLeaveAction(_prev: OpenSickState, formData: FormData): Promise<OpenSickState> {
  await requireStudent();
  const locale = await getLocale();
  const t = sickLeaveMessages[locale];
  const raw = {
    startsOn: String(formData.get("startsOn") ?? ""),
    expectedEnd: String(formData.get("expectedEnd") ?? ""),
    comment: String(formData.get("comment") ?? ""),
  };
  const parsed = OpenSchema.safeParse(raw);
  const errors: NonNullable<OpenSickState>["errors"] = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof typeof errors;
      errors[key] ??= locale === "en" ? (key === "comment" ? t.errComment500 : t.errEnterDate) : issue.message;
    }
    return { errors, error: t.errCheckFields, values: raw };
  }

  const { startsOn, expectedEnd, comment } = parsed.data;
  const today = todayKeyMsk();
  if (startsOn > today) errors.startsOn = t.errNotYet;
  else if (startsOn < earliestStartKey()) errors.startsOn = t.errTooEarly;
  if (expectedEnd && expectedEnd < startsOn) errors.expectedEnd = t.errBeforeStart;
  else if (expectedEnd && expectedEnd > dayKey(addDays(new Date(), 60))) errors.expectedEnd = t.errWithinTwoMonths;
  if (Object.keys(errors).length) return { errors, error: t.errCheckFields, values: raw };

  const res = await openMySickLeave({ startsOn, expectedEnd: expectedEnd || null, comment: comment || null });
  if (!res.ok) {
    const error = localizeSickError(res.error, locale);
    return res.field ? { error: t.errCheckFields, errors: { [res.field]: error }, values: raw } : { error, values: raw };
  }

  revalidatePath("/sick-leave");
  revalidatePath("/schedule");
  return { ok: true };
}
