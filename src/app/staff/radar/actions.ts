"use server";
// Сообщение студенту из радара рисков: requireStaff, проверка области, уведомление студенту.

import { z } from "zod";
import { requireStaff } from "@/lib/auth/dal";
import { getScopedStudentRecipient } from "@/lib/data/radar";
import { notify } from "@/lib/data/notify";
import { audit } from "@/lib/audit";
import { systemText } from "@/lib/notify-text";

export type RadarMessageState = { ok?: string; error?: string } | undefined;

const MessageSchema = z.object({
  studentId: z.string().uuid("Студент не найден"),
  message: z.string().trim().min(10, "Напишите сообщение, хотя бы одно предложение").max(1500, "Сообщение длиннее 1500 символов"),
});

export async function sendRadarMessageAction(_prev: RadarMessageState, formData: FormData): Promise<RadarMessageState> {
  const { staff } = await requireStaff();
  const parsed = MessageSchema.safeParse({ studentId: String(formData.get("studentId") ?? ""), message: String(formData.get("message") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // studentId пришёл из формы: перепроверяем, что студент в области сотрудника
  const recipient = await getScopedStudentRecipient(parsed.data.studentId);
  if (!recipient) return { error: "Студент не найден" };

  await notify({
    userId: recipient.userId,
    kind: "system",
    ...systemText.fromOffice(staff.faculty?.code ?? null, parsed.data.message),
    link: "/grades",
    important: true,
  });
  await audit({ action: "radar.message", entityType: "student", entityId: parsed.data.studentId, studentId: parsed.data.studentId, summary: "Отправлено сообщение студенту из радара рисков" });
  return { ok: `Сообщение отправлено: ${recipient.lastName} ${recipient.firstName}` };
}
