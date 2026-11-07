"use server";
// Решение по больничному: requireStaff, проверка входа zod, запись только в области сотрудника, уведомление студенту.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/dal";
import { reviewScopedSickLeave } from "@/lib/data/sick-leave";
import { notify } from "@/lib/data/notify";
import { periodLabel } from "@/lib/sick-leave";
import { audit } from "@/lib/audit";
import { sickText } from "@/lib/notify-text";

export type SickReviewState = { ok?: string; error?: string } | undefined;

const Approve = z.object({ id: z.string().uuid() });
const Reject = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "Напишите причину, студент её увидит").max(300, "Не больше 300 символов"),
});

export async function approveSickLeaveAction(_prev: SickReviewState, formData: FormData): Promise<SickReviewState> {
  await requireStaff();
  const parsed = Approve.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Больничный не найден" };

  const res = await reviewScopedSickLeave(parsed.data.id, "approved", null);
  if (!res.ok) return { error: res.error };
  await notify({ userId: res.studentUserId, kind: "health", ...sickText.approved(res.startsOn, res.endsOn ?? res.startsOn), link: "/sick-leave" });
  await audit({ action: "sick_leave.approve", entityType: "sick_leave", entityId: parsed.data.id, studentId: res.studentId, summary: `Засчитан больничный ${periodLabel(res.startsOn, res.endsOn)}` });
  revalidatePath("/staff/sick-leaves");
  return { ok: "Засчитано, студент получил уведомление" };
}

export async function rejectSickLeaveAction(_prev: SickReviewState, formData: FormData): Promise<SickReviewState> {
  await requireStaff();
  const parsed = Reject.safeParse({ id: formData.get("id"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте данные" };

  const reason = parsed.data.reason.replace(/\s+/g, " ");
  const res = await reviewScopedSickLeave(parsed.data.id, "rejected", reason);
  if (!res.ok) return { error: res.error };
  await notify({
    userId: res.studentUserId,
    kind: "health",
    ...sickText.rejected(res.startsOn, res.endsOn, reason.replace(/[.!\s]+$/, "")),
    link: "/sick-leave",
    important: true,
  });
  await audit({ action: "sick_leave.reject", entityType: "sick_leave", entityId: parsed.data.id, studentId: res.studentId, summary: `Не принята справка по больничному ${periodLabel(res.startsOn, res.endsOn)}` });
  revalidatePath("/staff/sick-leaves");
  return { ok: "Отклонено, студент получил уведомление с причиной" };
}
