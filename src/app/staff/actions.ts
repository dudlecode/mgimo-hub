"use server";
// Экшены сотрудника. Каждый: requireStaff() загрузка записи В ПРЕДЕЛАХ области сотрудника изменение уведомление студенту.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff } from "@/lib/auth/dal";
import { getScopedLesson, getScopedRequest } from "@/lib/data/staff";
import { notify } from "@/lib/data/notify";
import { translateAnnouncement } from "@/lib/assistant/translate";
import { lessonText, requestText, type BiText } from "@/lib/notify-text";
import { localizeOfficeHours } from "@/lib/i18n/messages/common";
import { validateRequestFields } from "@/lib/data/requests";
import { getRequestType, STATUS_META } from "@/lib/requests/catalog";
import { audit, auditMany, type AuditInput } from "@/lib/audit";
import { documentNumber, randomVerifyCode } from "@/lib/requests/codes";
import { pairNoAt, pairTimes } from "@/lib/academic";
import { dayKey, formatDayMonth, mskParts, parseDayKey, WEEKDAYS_SHORT } from "@/lib/time";
import type { RequestStatus } from "@/db/schema";

export type StaffActionState = { error?: string; ok?: string } | undefined;

const ACTIONS = ["take", "start", "ask", "ready", "complete", "reject", "comment"] as const;
type ActionKind = (typeof ACTIONS)[number];

const ALLOWED_FROM: Record<ActionKind, RequestStatus[]> = {
  take: ["submitted"],
  start: ["in_review"],
  ask: ["submitted", "in_review", "in_progress"],
  ready: ["in_review", "in_progress"],
  complete: ["ready"],
  reject: ["submitted", "in_review", "in_progress", "needs_info"],
  comment: ["submitted", "in_review", "in_progress", "needs_info", "ready"],
};

const NEXT: Partial<Record<ActionKind, RequestStatus>> = {
  take: "in_review",
  start: "in_progress",
  ask: "needs_info",
  ready: "ready",
  complete: "completed",
  reject: "rejected",
};

export async function requestAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const { staff } = await requireStaff();
  const kind = z.enum(ACTIONS).safeParse(formData.get("action"));
  const id = String(formData.get("id") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 1500);
  if (!kind.success) return { error: "Неизвестное действие" };

  const req = await getScopedRequest(id); // 404 вне области
  if (!ALLOWED_FROM[kind.data].includes(req.status)) return { error: "Статус заявки уже изменился, обновите страницу" };
  if ((kind.data === "ask" || kind.data === "reject" || kind.data === "comment") && message.length < 3) {
    return { error: kind.data === "reject" ? "Укажите причину отказа" : "Напишите сообщение студенту" };
  }

  const def = getRequestType(req.type);
  const next = NEXT[kind.data];
  const now = new Date();
  const staffName = `${staff.firstName} ${staff.lastName}`;
  const patch: Partial<typeof s.requests.$inferInsert> = { updatedAt: now, assignedStaffId: req.assignedStaffId ?? staff.id };
  if (next) patch.status = next;

  let autoMessage: string | null = null;
  let autoMessageEn: string | null = null;
  if (kind.data === "ready") {
    patch.readyAt = now;
    if (def?.category === "certificate") {
      patch.verifyCode = req.verifyCode ?? randomVerifyCode();
      patch.documentNo = req.documentNo ?? documentNumber(req.student.group.faculty.code, req.number, now);
    }
    const fac = req.student.group.faculty;
    const ready = requestText.readyMessage({
      certificate: def?.category === "certificate",
      paper: req.delivery === "paper",
      officeCode: fac.code,
      room: fac.officeRoom,
      hours: fac.officeHours,
      hoursEn: localizeOfficeHours(fac.officeHours, "en"),
    });
    autoMessage = ready.ru;
    autoMessageEn = ready.en;
  }

  // Оптимистичная блокировка: обновляем, только если статус не поменялся параллельно
  const updated = await db
    .update(s.requests)
    .set(patch)
    .where(and(eq(s.requests.id, req.id), eq(s.requests.status, req.status)))
    .returning({ id: s.requests.id });
  if (!updated.length) return { error: "Заявку только что изменил кто-то другой, обновите страницу" };

  const text = message || autoMessage;
  await db.insert(s.requestEvents).values({ requestId: req.id, status: next ?? null, message: text, actor: "staff", actorName: staffName });

  const msg = requestText.step(kind.data, def?.title ?? "Заявка", req.number, { certificate: def?.category === "certificate", paper: req.delivery === "paper", text, textEn: message || autoMessageEn });
  await notify({
    userId: req.student.user.id,
    kind: "request",
    ...msg,
    link: `/requests/${req.id}`,
    important: kind.data === "ask" || kind.data === "reject" || kind.data === "ready",
  });
  await audit(
    next
      ? { action: "request.status", entityType: "request", entityId: req.id, studentId: req.student.id, summary: `Изменён статус заявки ${req.number}: ${STATUS_META[next].label.toLowerCase()}` }
      : { action: "request.comment", entityType: "request", entityId: req.id, studentId: req.student.id, summary: `Отправлено сообщение по заявке ${req.number}` },
  );

  revalidatePath(`/staff/requests/${req.id}`);
  revalidatePath("/staff");
  return { ok: msg.title };
}

// ───────────── Объявления ─────────────

const AnnouncementSchema = z.object({
  title: z.string().trim().min(5, "Заголовок: от 5 символов").max(140),
  body: z.string().trim().min(10, "Текст: от 10 символов").max(4000),
  category: z.enum(["study", "scholarship", "events", "mobility", "campus", "office"]),
  facultyId: z.string().max(20).optional(),
  course: z.string().optional(),
  groupId: z.string().optional(),
  important: z.boolean(),
  pinned: z.boolean(),
});

export async function createAnnouncementAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const { staff } = await requireStaff();
  const parsed = AnnouncementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    category: formData.get("category"),
    facultyId: formData.get("facultyId") || undefined,
    course: formData.get("course") || undefined,
    groupId: formData.get("groupId") || undefined,
    important: formData.get("important") === "on",
    pinned: formData.get("pinned") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Сотрудник факультета публикует только для своего факультета
  const facultyId = staff.facultyId ?? d.facultyId ?? null;
  if (staff.facultyId && d.facultyId && d.facultyId !== staff.facultyId) return { error: "Можно публиковать только для своего факультета" };
  const course = d.course ? Number(d.course) : null;
  if (course !== null && (!Number.isInteger(course) || course < 1 || course > 6)) return { error: "Неверный курс" };
  let groupId: string | null = null;
  let groupCode: string | null = null;
  if (d.groupId) {
    const g = await db.query.groups.findFirst({ where: eq(s.groups.id, d.groupId) });
    if (!g || (facultyId && g.facultyId !== facultyId)) return { error: "Группа не найдена" };
    groupId = g.id;
    groupCode = g.code;
  }

  const authorName = staff.facultyId ? `Учебный офис ${(await db.query.faculties.findFirst({ where: eq(s.faculties.id, staff.facultyId) }))?.code ?? ""}`.trim() : "Студенческий офис";
  const [a] = await db
    .insert(s.announcements)
    .values({ title: d.title, body: d.body, category: d.category, important: d.important, pinned: d.pinned, facultyId, course, groupId, authorName })
    .returning();

  // Уведомления адресатам
  const recipients = await db
    .select({ userId: s.students.userId })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(
      and(
        facultyId ? eq(s.groups.facultyId, facultyId) : undefined,
        course ? eq(s.groups.course, course) : undefined,
        groupId ? eq(s.groups.id, groupId) : undefined,
      ),
    );
  await notify(
    recipients.map((r) => ({ userId: r.userId, kind: "news" as const, title: d.title, body: d.body.split("\n")[0].slice(0, 160), link: `/news/${a.id}`, important: d.important })),
  );
  const facultyCode = facultyId ? ((await db.query.faculties.findFirst({ where: eq(s.faculties.id, facultyId), columns: { code: true } }))?.code ?? null) : null;
  const audience = groupCode ?? [facultyCode ?? "все факультеты", course ? `${course} курс` : null].filter(Boolean).join(", ");
  await audit({ action: "announcement.create", entityType: "announcement", entityId: a.id, facultyId, summary: `Опубликовано объявление (${audience}), получателей: ${recipients.length}` });
  // Перевод для английского интерфейса готовит Атташе после ответа: сотрудник не ждёт модель
  after(() => translateAnnouncement(a.id, d.title, d.body));
  revalidatePath("/staff/announcements");
  return { ok: `Опубликовано. Уведомление получили ${recipients.length} студентов.` };
}

export async function deleteAnnouncementAction(formData: FormData) {
  const { staff } = await requireStaff();
  const id = z.string().uuid().parse(formData.get("id"));
  const [deleted] = await db
    .delete(s.announcements)
    // сотрудник факультета удаляет только объявления своего факультета; единый офис, любые
    .where(and(eq(s.announcements.id, id), staff.facultyId ? eq(s.announcements.facultyId, staff.facultyId) : undefined))
    .returning({ id: s.announcements.id, facultyId: s.announcements.facultyId });
  if (deleted) {
    // уведомления о новости тоже убираем: иначе в ленте студента останется ссылка на удалённую страницу
    await db.delete(s.notifications).where(and(eq(s.notifications.kind, "news"), eq(s.notifications.link, `/news/${deleted.id}`)));
    await audit({ action: "announcement.delete", entityType: "announcement", entityId: deleted.id, facultyId: deleted.facultyId, summary: "Удалено объявление" });
  }
  revalidatePath("/staff/announcements");
}

// ───────────── Изменения расписания ─────────────

export async function changeLessonAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff();
  const kind = z.enum(["cancel", "room", "move", "restore"]).safeParse(formData.get("kind"));
  if (!kind.success) return { error: "Неизвестное действие" };
  const row = await getScopedLesson(String(formData.get("lessonId") ?? ""));
  if (!row) return { error: "Занятие не найдено" };
  const l = row.lesson;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const now = new Date();
  const when = `${WEEKDAYS_SHORT[mskParts(l.startsAt).wd].toLowerCase()}, ${formatDayMonth(l.startsAt)}, ${l.pairNo}-я пара`;
  const course = { ru: row.title, en: row.titleEn };
  let text: BiText | null = null;
  let summary = "";

  if (kind.data === "cancel") {
    if (!note) return { error: "Укажите причину, студенты её увидят" };
    await db.update(s.lessons).set({ status: "cancelled", changeNote: note, changedAt: now }).where(eq(s.lessons.id, l.id));
    text = lessonText.cancelled(course, l.startsAt, l.pairNo, note);
    summary = `Отменено занятие «${row.title}», ${when}`;
  } else if (kind.data === "room") {
    const room = String(formData.get("room") ?? "").trim().slice(0, 40);
    if (!room) return { error: "Укажите новую аудиторию" };
    await db
      .update(s.lessons)
      .set({ status: "room_changed", prevRoom: l.prevRoom ?? l.room, room, changeNote: note || null, changedAt: now })
      .where(eq(s.lessons.id, l.id));
    text = lessonText.room(course, l.startsAt, l.pairNo, room, l.room);
    summary = `Изменена аудитория занятия «${row.title}», ${when}: ${room} вместо ${l.room}`;
  } else if (kind.data === "move") {
    const day = parseDayKey(String(formData.get("date") ?? ""));
    const pair = Number(formData.get("pair"));
    if (!day || !Number.isInteger(pair) || pair < 1 || pair > 6) return { error: "Укажите дату и пару" };
    const { startsAt, endsAt } = pairTimes(day, pair);
    if (startsAt < now) return { error: "Нельзя перенести в прошлое" };
    await db
      .update(s.lessons)
      .set({ status: "moved", prevStartsAt: l.prevStartsAt ?? l.startsAt, startsAt, endsAt, pairNo: pair, changeNote: note || null, changedAt: now })
      .where(eq(s.lessons.id, l.id));
    text = lessonText.moved(course, l.startsAt, l.pairNo, startsAt);
    summary = `Перенесено занятие «${row.title}» с ${when} на ${formatDayMonth(startsAt)}, ${pair}-я пара`;
  } else {
    // Отменить изменение
    const patch: Partial<typeof s.lessons.$inferInsert> = { status: "scheduled", changeNote: null, changedAt: now, substituteTeacher: null, prevTeacher: null };
    if (l.prevRoom) Object.assign(patch, { room: l.prevRoom, prevRoom: null });
    if (l.prevStartsAt) {
      const dur = l.endsAt.getTime() - l.startsAt.getTime();
      // вместе со временем возвращаем и номер пары, иначе после возврата остался бы номер перенесённой
      Object.assign(patch, { startsAt: l.prevStartsAt, endsAt: new Date(l.prevStartsAt.getTime() + dur), prevStartsAt: null, pairNo: pairNoAt(l.prevStartsAt) ?? l.pairNo });
    }
    await db.update(s.lessons).set(patch).where(eq(s.lessons.id, l.id));
    text = lessonText.restored(course, l.startsAt, l.pairNo);
    summary = `Возвращено обычное расписание занятия «${row.title}», ${when}`;
  }

  const students = await db
    .select({ userId: s.students.userId })
    .from(s.enrollments)
    .innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
    .where(eq(s.enrollments.courseId, l.courseId));
  const target = kind.data === "move" ? parseDayKey(String(formData.get("date")))! : l.startsAt;
  const t = text!;
  await notify(students.map((st) => ({ userId: st.userId, kind: "schedule" as const, ...t, link: `/schedule?day=${dayKey(target)}`, important: kind.data !== "room" })));
  await audit({ action: "schedule.change", entityType: "lesson", entityId: l.id, facultyId: row.facultyId, summary });

  revalidatePath("/staff/schedule");
  return { ok: `${t.title}. Уведомлено студентов: ${students.length}.` };
}

export async function bulkTakeAction(formData: FormData) {
  const { staff } = await requireStaff();
  const ids = formData.getAll("id").map(String).filter((x) => z.string().uuid().safeParse(x).success).slice(0, 50);
  const taken: AuditInput[] = [];
  for (const id of ids) {
    const req = await getScopedRequest(id).catch(() => null);
    if (!req || req.status !== "submitted") continue;
    const moved = await db
      .update(s.requests)
      .set({ status: "in_review", assignedStaffId: staff.id, updatedAt: new Date() })
      .where(and(eq(s.requests.id, id), inArray(s.requests.status, ["submitted"])))
      .returning({ id: s.requests.id });
    // заявку успел взять коллега: второй раз событие и уведомление не пишем
    if (!moved.length) continue;
    await db.insert(s.requestEvents).values({ requestId: id, status: "in_review", actor: "staff", actorName: `${staff.firstName} ${staff.lastName}` });
    await notify({ userId: req.student.user.id, kind: "request", ...requestText.step("take", getRequestType(req.type)?.title ?? "Заявка", req.number, { certificate: false, paper: false }), link: `/requests/${id}` });
    taken.push({ action: "request.status", entityType: "request", entityId: id, studentId: req.student.id, summary: `Изменён статус заявки ${req.number}: ${STATUS_META.in_review.label.toLowerCase()}` });
  }
  await auditMany(taken);
  revalidatePath("/staff");
}

// ───────────── Генератор справок (выдача в офисе без заявки студента) ─────────────

export async function issueCertificateAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const { staff } = await requireStaff();
  const def = getRequestType(String(formData.get("type") ?? ""));
  if (!def || def.category !== "certificate") return { error: "Выберите тип справки" };
  const studentId = z.string().uuid().safeParse(formData.get("studentId"));
  if (!studentId.success) return { error: "Выберите студента" };

  // студент должен быть в области сотрудника
  const [st] = await db
    .select({ id: s.students.id, userId: s.students.userId, firstName: s.students.firstName, facultyId: s.groups.facultyId, facultyCode: s.faculties.code })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .innerJoin(s.faculties, eq(s.faculties.id, s.groups.facultyId))
    .where(eq(s.students.id, studentId.data));
  if (!st || (staff.facultyId && st.facultyId !== staff.facultyId)) return { error: "Студент не найден" };

  const raw: Record<string, string> = {};
  for (const f of def.fields) raw[f.name] = String(formData.get(f.name) ?? "");
  const checked = validateRequestFields(def, raw, { current: new Set(), debts: new Set() });
  if (!checked.ok) return { error: Object.values(checked.errors)[0] ?? "Проверьте поля" };
  const delivery = def.delivery.includes(String(formData.get("delivery")) as "paper") ? (String(formData.get("delivery")) as "paper" | "electronic") : def.delivery[0];

  const now = new Date();
  const staffName = `${staff.firstName} ${staff.lastName}`;
  const [created] = await db
    .insert(s.requests)
    .values({
      number: sql`'АТ-' || lpad(nextval('request_number_seq')::text, 5, '0')`,
      studentId: st.id,
      type: def.slug,
      status: "ready",
      fields: checked.fields,
      delivery,
      dueAt: now,
      readyAt: now,
      verifyCode: randomVerifyCode(),
      assignedStaffId: staff.id,
      comment: "Оформлено в учебном офисе",
    })
    .returning({ id: s.requests.id, number: s.requests.number });
  await db.update(s.requests).set({ documentNo: documentNumber(st.facultyCode, created.number, now) }).where(eq(s.requests.id, created.id));
  await db.insert(s.requestEvents).values([
    { requestId: created.id, status: "submitted", actor: "staff", actorName: staffName, message: "Оформлено в учебном офисе по обращению студента", createdAt: now },
    { requestId: created.id, status: "ready", actor: "staff", actorName: staffName, message: "Справка готова", createdAt: new Date(now.getTime() + 1000) },
  ]);
  await notify({ userId: st.userId, kind: "request", ...requestText.issuedAtOffice(def.title, created.number), link: `/requests/${created.id}`, important: true });
  await audit({ action: "certificate.issue", entityType: "request", entityId: created.id, studentId: st.id, summary: `Оформлена справка ${created.number} «${def.title}»` });
  revalidatePath("/staff");
  redirect(`/staff/requests/${created.id}/document`);
}
