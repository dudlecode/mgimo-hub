import "server-only";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, count } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";
import type { FieldDef, RequestTypeDef } from "@/lib/requests/catalog";
import { dayKey } from "@/lib/time";

export async function listMyRequests() {
  const { student } = await requireStudent();
  return db.query.requests.findMany({
    where: eq(s.requests.studentId, student.id),
    orderBy: [desc(s.requests.updatedAt)],
    columns: { id: true, number: true, type: true, status: true, createdAt: true, updatedAt: true, dueAt: true, readyAt: true, delivery: true, fields: true },
  });
}

/** Заявка по id из адреса, только своя. Иначе 404 (не подтверждаем, что такая существует). */
export async function getMyRequest(id: string) {
  const { student } = await requireStudent();
  if (!z.string().uuid().safeParse(id).success) notFound();
  const row = await db.query.requests.findFirst({
    where: and(eq(s.requests.id, id), eq(s.requests.studentId, student.id)),
    with: { events: { orderBy: [asc(s.requestEvents.createdAt)] }, assignedStaff: { columns: { firstName: true, lastName: true, position: true } } },
  });
  if (!row) notFound();
  return row;
}

export async function countMyRecentRequests(minutes: number) {
  const { student } = await requireStudent();
  const [{ n }] = await db
    .select({ n: count() })
    .from(s.requests)
    .where(and(eq(s.requests.studentId, student.id), gte(s.requests.createdAt, new Date(Date.now() - minutes * 60_000))));
  return n;
}

// ───────────── Валидация полей формы по описанию из каталога ─────────────

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function fieldSchema(f: FieldDef, allowed: { current: Set<string>; debts: Set<string> }) {
  const req = (zs: z.ZodString) => (f.required ? zs.min(1, "Заполните это поле") : zs);
  switch (f.type) {
    case "select": {
      const values = (f.options ?? []).map((o) => o.value);
      return f.required
        ? z.string().refine((v) => values.includes(v), "Выберите вариант из списка")
        : z.string().refine((v) => v === "" || values.includes(v), "Выберите вариант из списка");
    }
    case "date":
      return req(z.string().trim()).refine((v) => v === "" || dateRe.test(v), "Укажите дату");
    case "number":
      return req(z.string().trim()).refine((v) => v === "" || (!Number.isNaN(Number(v)) && (f.min === undefined || Number(v) >= f.min) && (f.max === undefined || Number(v) <= f.max)), "Укажите число");
    case "myCourse":
      return z.string().refine((v) => allowed.current.has(v), "Выберите дисциплину из своего списка");
    case "myDebt":
      return z.string().refine((v) => allowed.debts.has(v), "Выберите дисциплину с задолженностью");
    case "textarea":
      return req(z.string().trim().max(f.maxLength ?? 1000, `Не больше ${f.maxLength ?? 1000} символов`));
    default:
      return req(z.string().trim().max(f.maxLength ?? 200, `Не больше ${f.maxLength ?? 200} символов`));
  }
}

export function validateRequestFields(
  def: RequestTypeDef,
  raw: Record<string, string>,
  allowed: { current: Set<string>; debts: Set<string> },
): { ok: true; fields: Record<string, string> } | { ok: false; errors: Record<string, string> } {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const f of def.fields) shape[f.name] = fieldSchema(f, allowed);
  const parsed = z.object(shape).safeParse(raw);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      errors[key] ??= issue.message;
    }
  }
  const values = parsed.success ? (parsed.data as Record<string, string>) : raw;
  // перекрёстные проверки
  if (def.slug === "embassy-certificate") {
    const today = dayKey(new Date());
    if (values.travelFrom && values.travelFrom < today) errors.travelFrom ??= "Дата поездки уже прошла";
    if (values.travelFrom && values.travelTo && values.travelTo < values.travelFrom) errors.travelTo ??= "Окончание раньше начала";
  }
  if (def.slug === "academic-leave" && values.startDate && values.startDate < dayKey(new Date())) {
    errors.startDate ??= "Дата уже прошла";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, fields: values };
}
