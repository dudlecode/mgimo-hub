"use server";
// Запись на приём: экшены студента. Каждый заново проверяет сессию (requireStudent),
// student.id берётся только из сессии, время слота перепроверяется на сервере.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/dal";
import { bookMyAppointment, cancelMyAppointment } from "@/lib/data/appointments";
import { notify } from "@/lib/data/notify";
import { COMMENT_MAX, TOPIC_VALUES } from "@/lib/appointments";
import { getLocale } from "@/lib/i18n/server";
import { appointmentsMessages, bookingError } from "@/lib/i18n/messages/appointments";
import { appointmentText } from "@/lib/notify-text";

/** comment возвращается при ошибке: React сбрасывает поля формы после экшена, текст не должен теряться */
export type BookState = { error?: string; reason?: "input" | "slot" | "taken" | "limit"; comment?: string } | undefined;

const BookSchema = z.object({
  topic: z.enum(TOPIC_VALUES, { message: "Выберите тему обращения" }),
  startsAt: z.iso.datetime({ message: "Выберите день и время" }),
  comment: z.string().trim().max(COMMENT_MAX, `Комментарий: не больше ${COMMENT_MAX} символов`),
});

export async function bookAppointmentAction(_prev: BookState, formData: FormData): Promise<BookState> {
  const { user, faculty } = await requireStudent();
  const parsed = BookSchema.safeParse({
    topic: formData.get("topic"),
    startsAt: formData.get("startsAt"),
    comment: formData.get("comment") ?? "",
  });
  const typed = String(formData.get("comment") ?? "").slice(0, COMMENT_MAX);
  const locale = await getLocale();
  const t = appointmentsMessages[locale];
  if (!parsed.success) {
    const field = parsed.error.issues[0].path[0];
    const error = locale === "en" ? (field === "topic" ? t.errTopic : field === "startsAt" ? t.errTime : t.errComment(COMMENT_MAX)) : parsed.error.issues[0].message;
    return { error, reason: "input", comment: typed };
  }

  const res = await bookMyAppointment({ topic: parsed.data.topic, startsAt: new Date(parsed.data.startsAt), comment: parsed.data.comment || null });
  if (!res.ok) {
    revalidatePath("/appointments");
    return { error: bookingError(res.reason, res.error, locale), reason: res.reason, comment: typed };
  }

  await notify({
    userId: user.id,
    kind: "request",
    ...appointmentText.booked(parsed.data.topic, res.startsAt, faculty.code, faculty.officeRoom, res.code),
    link: `/appointments/${res.id}`,
  });

  revalidatePath("/appointments", "layout");
  redirect(`/appointments/${res.id}?booked=1`);
}

/** Отмена своей записи. Условие where student_id = id из сессии стоит в cancelMyAppointment. */
export async function cancelAppointmentAction(formData: FormData) {
  await requireStudent();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/appointments");
  const row = await cancelMyAppointment(id.data);
  revalidatePath("/appointments", "layout");
  redirect(row ? "/appointments?cancelled=1" : "/appointments");
}
