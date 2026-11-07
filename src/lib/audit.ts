import "server-only";
// Журнал действий: кто из сотрудников что открывал и менял. Только INSERT: UPDATE и DELETE запрещены триггером в БД.
//
// Исполнитель всегда берётся из текущей сессии (не из аргументов), ФИО и роль из БД на момент действия.
// facultyId считается по группе студента: по нему журнал ограничен областью сотрудника.
// В summary только что сделано, без телефонов, email, дат рождения, оценок и текста сообщений.
// Ошибка записи журнала не ломает действие пользователя: пишем в console.error без персональных данных.
import { headers } from "next/headers";
import { cache } from "react";
import { and, eq, gt, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { clientIp, getCurrentSession } from "@/lib/auth/session";
import { AUDIT_VIEW_DEDUPE_MIN, type AuditAction } from "@/lib/audit-actions";
import { MINUTE_MS } from "@/lib/time";
import { fullName } from "@/lib/utils";

export { AUDIT_ACTIONS, auditActionLabel, type AuditAction } from "@/lib/audit-actions";

export type AuditInput = {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** чьи данные затронуты: по нему студент видит «кто обращался к моим данным» */
  studentId?: string | null;
  /**
   * Факультет записи, когда действие не про одного студента (объявление, расписание).
   * Если есть studentId, не нужен: факультет берётся по группе студента. Не задан: факультет сотрудника.
   */
  facultyId?: string | null;
  summary: string;
};

type Actor = { userId: string; role: "student" | "staff"; name: string; facultyId: string | null };

const actorOf = cache(async (userId: string, role: "student" | "staff"): Promise<Actor | null> => {
  if (role === "staff") {
    const [m] = await db
      .select({ lastName: s.staff.lastName, firstName: s.staff.firstName, middleName: s.staff.middleName, facultyId: s.staff.facultyId })
      .from(s.staff)
      .where(eq(s.staff.userId, userId))
      .limit(1);
    return m ? { userId, role, name: fullName(m), facultyId: m.facultyId } : null;
  }
  const [st] = await db
    .select({ lastName: s.students.lastName, firstName: s.students.firstName, middleName: s.students.middleName, facultyId: s.groups.facultyId })
    .from(s.students)
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .where(eq(s.students.userId, userId))
    .limit(1);
  return st ? { userId, role, name: fullName(st), facultyId: st.facultyId } : null;
});

async function currentActor(): Promise<Actor | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  return actorOf(session.user.id, session.user.role);
}

async function requestIp(): Promise<string | null> {
  try {
    return clientIp(await headers());
  } catch {
    return null;
  }
}

/** Без длинных тире и стрелок, одной строкой, не длиннее 300 символов */
function cleanSummary(text: string): string {
  return text
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, "-")
    .replace(/\s*(?:→|⟶|⇒|->|=>)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Код ошибки без текста: в тексте ошибки драйвера могут оказаться значения из запроса */
function errorCode(e: unknown): string {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const o = cur as { code?: unknown; cause?: unknown };
    if (typeof o.code === "string") return o.code;
    cur = o.cause;
  }
  return e instanceof Error ? e.name : "unknown";
}

async function write(actor: Actor, items: AuditInput[], ip: string | null): Promise<void> {
  if (!items.length) return;
  const studentIds = [...new Set(items.map((i) => i.studentId).filter((x): x is string => !!x))];
  const facultyBy = new Map<string, string>();
  if (studentIds.length) {
    const rows = await db
      .select({ id: s.students.id, facultyId: s.groups.facultyId })
      .from(s.students)
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .where(inArray(s.students.id, studentIds));
    for (const r of rows) facultyBy.set(r.id, r.facultyId);
  }
  await db.insert(s.auditLog).values(
    items.map((i) => ({
      actorUserId: actor.userId,
      actorRole: actor.role,
      actorName: actor.name,
      action: i.action,
      entityType: i.entityType,
      entityId: i.entityId ?? null,
      studentId: i.studentId ?? null,
      facultyId: i.studentId ? (facultyBy.get(i.studentId) ?? null) : i.facultyId !== undefined ? i.facultyId : actor.facultyId,
      summary: cleanSummary(i.summary),
      ip,
    })),
  );
}

/** Записать действие текущего пользователя. Никогда не бросает исключение. */
export async function audit(input: AuditInput): Promise<void> {
  await auditMany([input]);
}

/** Несколько записей одного действия (например, напоминание об оплате нескольким студентам) одним INSERT. */
export async function auditMany(items: AuditInput[]): Promise<void> {
  if (!items.length) return;
  try {
    const actor = await currentActor();
    if (!actor) return;
    await write(actor, items, await requestIp());
  } catch (e) {
    console.error(`[audit] не удалось записать ${items[0].action}: ${errorCode(e)}`);
  }
}

/**
 * Просмотр (карточка студента, файл справки, печать справки): не чаще одной записи
 * на сотрудника, студента и вид просмотра за AUDIT_VIEW_DEDUPE_MIN минут, чтобы журнал не засорялся.
 */
export async function auditView(input: AuditInput & { studentId: string }): Promise<void> {
  try {
    const actor = await currentActor();
    if (!actor) return;
    const since = new Date(Date.now() - AUDIT_VIEW_DEDUPE_MIN * MINUTE_MS);
    const [recent] = await db
      .select({ id: s.auditLog.id })
      .from(s.auditLog)
      .where(and(eq(s.auditLog.actorUserId, actor.userId), eq(s.auditLog.action, input.action), eq(s.auditLog.studentId, input.studentId), gt(s.auditLog.createdAt, since)))
      .limit(1);
    if (recent) return;
    await write(actor, [input], await requestIp());
  } catch (e) {
    console.error(`[audit] не удалось записать ${input.action}: ${errorCode(e)}`);
  }
}

/**
 * Вход сотрудника и неудачная попытка входа в учётную запись сотрудника.
 * Сессии ещё нет, поэтому исполнитель: учётная запись, найденная по логину на сервере.
 * Для студентов и несуществующих логинов ничего не пишет.
 */
export async function auditStaffLogin(userId: string, ok: boolean, ip: string): Promise<void> {
  try {
    const actor = await actorOf(userId, "staff");
    if (!actor) return;
    await write(
      actor,
      [
        ok
          ? { action: "auth.login", entityType: "user", entityId: userId, summary: "Вход в кабинет сотрудника" }
          : { action: "auth.login_failed", entityType: "user", entityId: userId, summary: "Неверный пароль при входе в учётную запись" },
      ],
      ip,
    );
  } catch (e) {
    console.error(`[audit] не удалось записать вход: ${errorCode(e)}`);
  }
}
