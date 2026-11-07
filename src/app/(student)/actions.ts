"use server";
// Серверные экшены кабинета студента. Каждый сам заново проверяет сессию (requireStudent)
// и работает только с записями, где student_id = id из сессии.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";
import { getRequestType } from "@/lib/requests/catalog";
import { countMyRecentRequests, validateRequestFields } from "@/lib/data/requests";
import { getMyCourseOptions } from "@/lib/data/grades";
import { toggleMyDeadline } from "@/lib/data/deadlines";
import { notify } from "@/lib/data/notify";
import { addWorkingDays } from "@/lib/academic";
import { fullName } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { requestsMessages } from "@/lib/i18n/messages/requests";
import { localizeFieldError } from "@/lib/requests/catalog-en";
import { requestText } from "@/lib/notify-text";

export type CreateRequestState = { errors?: Record<string, string>; error?: string; values?: Record<string, string> } | undefined;

export async function createRequestAction(_prev: CreateRequestState, formData: FormData): Promise<CreateRequestState> {
  const { student, user, group } = await requireStudent();
  const locale = await getLocale();
  const t = requestsMessages[locale];
  const def = getRequestType(String(formData.get("type") ?? ""));
  if (!def) return { error: t.errUnknownType };

  if ((await countMyRecentRequests(60)) >= 15) {
    return { error: t.errTooMany };
  }

  const raw: Record<string, string> = {};
  for (const f of def.fields) raw[f.name] = String(formData.get(f.name) ?? "");

  const options = await getMyCourseOptions();
  const allowed = { current: new Set(options.current.map((o) => o.value)), debts: new Set(options.debts.map((o) => o.value)) };
  const result = validateRequestFields(def, raw, allowed);

  const delivery = String(formData.get("delivery") ?? def.delivery[0]);
  const errors: Record<string, string> = result.ok ? {} : Object.fromEntries(Object.entries(result.errors).map(([k, v]) => [k, localizeFieldError(v, locale)]));
  if (!def.delivery.includes(delivery as "electronic" | "paper")) errors.delivery = t.errDelivery;
  const copies = def.copies ? Number(formData.get("copies") ?? 1) : 1;
  if (!Number.isInteger(copies) || copies < 1 || copies > 5) errors.copies = t.errCopies;
  const comment = String(formData.get("comment") ?? "").trim();
  if (comment.length > 500) errors.comment = t.errComment500;
  if (Object.keys(errors).length || !result.ok) return { errors, error: t.errCheckFields, values: { ...raw, comment, delivery } };

  // Снимок названия дисциплины, чтобы сотруднику не нужно было искать курс
  const fields = { ...result.fields };
  for (const f of def.fields) {
    if (f.type === "myCourse" || f.type === "myDebt") {
      const label = [...options.current, ...options.debts].find((o) => o.value === fields[f.name])?.label;
      if (label) fields[`${f.name}Title`] = label;
    }
  }

  const now = new Date();
  const dueAt = addWorkingDays(now, def.slaDays);
  const [created] = await db
    .insert(s.requests)
    .values({
      number: sql`'АТ-' || lpad(nextval('request_number_seq')::text, 5, '0')`,
      studentId: student.id,
      type: def.slug,
      status: "submitted",
      fields,
      delivery: delivery as "electronic" | "paper",
      copies,
      comment: comment || null,
      dueAt,
    })
    .returning({ id: s.requests.id, number: s.requests.number });

  await db.insert(s.requestEvents).values({
    requestId: created.id,
    status: "submitted",
    actor: "student",
    actorName: fullName(student),
    message: comment || null,
  });
  await notify({
    userId: user.id,
    kind: "request",
    ...requestText.submitted(def.title, created.number, dueAt),
    link: `/requests/${created.id}`,
  });

  // уведомим сотрудников, отвечающих за факультет
  const staffUsers = await db
    .select({ userId: s.staff.userId })
    .from(s.staff)
    .where(sql`${s.staff.facultyId} is null or ${s.staff.facultyId} = ${group.facultyId}`);
  await notify(
    staffUsers.map((u) => ({
      userId: u.userId,
      kind: "request" as const,
      title: "Новая заявка",
      body: `${def.title} ${created.number}, ${student.lastName} ${student.firstName[0]}., ${group.code}`,
      link: `/staff/requests/${created.id}`,
    })),
  );

  revalidatePath("/requests");
  redirect(`/requests/${created.id}?created=1`);
}

const IdSchema = z.string().uuid();

export async function cancelRequestAction(formData: FormData) {
  const { student } = await requireStudent();
  const id = IdSchema.parse(formData.get("id"));
  const res = await db
    .update(s.requests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(s.requests.id, id), eq(s.requests.studentId, student.id), inArray(s.requests.status, ["submitted", "in_review", "needs_info"])))
    .returning({ id: s.requests.id });
  if (res.length) {
    await db.insert(s.requestEvents).values({ requestId: id, status: "cancelled", actor: "student", actorName: fullName(student), message: "Заявка отозвана студентом" });
  }
  revalidatePath(`/requests/${id}`);
  revalidatePath("/requests");
}

export async function confirmReceivedAction(formData: FormData) {
  const { student } = await requireStudent();
  const id = IdSchema.parse(formData.get("id"));
  const res = await db
    .update(s.requests)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(s.requests.id, id), eq(s.requests.studentId, student.id), eq(s.requests.status, "ready")))
    .returning({ id: s.requests.id });
  if (res.length) {
    await db.insert(s.requestEvents).values({ requestId: id, status: "completed", actor: "student", actorName: fullName(student), message: "Получение подтверждено" });
  }
  revalidatePath(`/requests/${id}`);
}

export type ReplyState = { error?: string; ok?: boolean } | undefined;

export async function replyRequestAction(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const { student } = await requireStudent();
  const t = requestsMessages[await getLocale()];
  const id = IdSchema.safeParse(formData.get("id"));
  const message = String(formData.get("message") ?? "").trim();
  if (!id.success) return { error: t.errNotFound };
  if (message.length < 2) return { error: t.errWriteReply };
  if (message.length > 1000) return { error: t.errReply1000 };

  const req = await db.query.requests.findFirst({
    where: and(eq(s.requests.id, id.data), eq(s.requests.studentId, student.id)),
    with: { assignedStaff: { columns: { userId: true } } },
  });
  if (!req || ["completed", "rejected", "cancelled"].includes(req.status)) return { error: t.errClosed };

  const nextStatus = req.status === "needs_info" ? "in_review" : req.status;
  await db.update(s.requests).set({ status: nextStatus, updatedAt: new Date() }).where(eq(s.requests.id, req.id));
  await db.insert(s.requestEvents).values({
    requestId: req.id,
    status: req.status === "needs_info" ? "in_review" : null,
    actor: "student",
    actorName: fullName(student),
    message,
  });
  if (req.assignedStaff) {
    await notify({ userId: req.assignedStaff.userId, kind: "request", title: "Ответ студента", body: `${req.number}: ${message.slice(0, 120)}`, link: `/staff/requests/${req.id}` });
  }
  revalidatePath(`/requests/${req.id}`);
  return { ok: true };
}

export async function toggleDeadlineAction(itemId: string, done: boolean) {
  await requireStudent();
  if (!z.string().uuid().safeParse(itemId).success) return { ok: false };
  const ok = await toggleMyDeadline(itemId, done);
  revalidatePath("/");
  return { ok };
}

export async function markNotificationReadAction(id: string) {
  const { user } = await requireStudent();
  if (!z.string().uuid().safeParse(id).success) return;
  await db
    .update(s.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(s.notifications.id, id), eq(s.notifications.userId, user.id), isNull(s.notifications.readAt)));
  revalidatePath("/notifications");
}

export async function markAllReadAction() {
  const { user } = await requireStudent();
  await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt)));
  revalidatePath("/", "layout");
}
