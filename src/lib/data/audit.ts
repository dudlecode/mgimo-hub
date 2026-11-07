import "server-only";
// Чтение журнала действий. Запись: только src/lib/audit.ts (INSERT), изменить или удалить запись не даёт БД.
// Сотрудник единого окна (facultyId null) видит всё; сотрудник факультета: записи своего факультета и свои собственные.
// Студент видит только записи о своих данных (studentId из сессии).
import { and, asc, desc, eq, gte, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { requireStaff } from "@/lib/auth/dal";
import { AUDIT_ACTION_CODES } from "@/lib/audit-actions";
import { addDays, startOfMskDay } from "@/lib/time";

export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_PERIODS = [
  { value: "today", label: "Сегодня" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number]["value"];

/** Фильтры журнала из адреса. Всё неизвестное отбрасывается. */
export const AuditQuery = z.object({
  action: z.enum(AUDIT_ACTION_CODES).optional().catch(undefined),
  actor: z.string().uuid().optional().catch(undefined),
  period: z.enum(["today", "7d", "30d"]).optional().catch(undefined),
  before: z.coerce.number().int().positive().max(2_147_483_647).optional().catch(undefined),
});
export type AuditFilter = z.infer<typeof AuditQuery>;

function since(period: AuditPeriod | undefined, now: Date): Date | null {
  if (period === "today") return startOfMskDay(now);
  if (period === "7d") return addDays(now, -7);
  if (period === "30d") return addDays(now, -30);
  return null;
}

/** Журнал в области сотрудника, по 50 записей, курсором по id (новые сверху). */
export async function listScopedAudit(filter: AuditFilter) {
  const { staff, user } = await requireStaff();
  const scope: SQL | undefined = staff.facultyId ? or(eq(s.auditLog.facultyId, staff.facultyId), eq(s.auditLog.actorUserId, user.id)) : undefined;
  const from = since(filter.period, new Date());

  const where = and(
    scope,
    filter.action ? eq(s.auditLog.action, filter.action) : undefined,
    filter.actor ? eq(s.auditLog.actorUserId, filter.actor) : undefined,
    from ? gte(s.auditLog.createdAt, from) : undefined,
    filter.before ? lt(s.auditLog.id, filter.before) : undefined,
  );

  const [rows, actors] = await Promise.all([
    db
      .select({
        id: s.auditLog.id,
        createdAt: s.auditLog.createdAt,
        action: s.auditLog.action,
        summary: s.auditLog.summary,
        actorName: s.auditLog.actorName,
        position: s.staff.position,
        studentId: s.auditLog.studentId,
        studentLast: s.students.lastName,
        studentFirst: s.students.firstName,
        studentMiddle: s.students.middleName,
        groupCode: s.groups.code,
      })
      .from(s.auditLog)
      .leftJoin(s.staff, eq(s.staff.userId, s.auditLog.actorUserId))
      .leftJoin(s.students, eq(s.students.id, s.auditLog.studentId))
      .leftJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .where(where)
      .orderBy(desc(s.auditLog.id))
      .limit(AUDIT_PAGE_SIZE + 1),

    // Для фильтра «Сотрудник»: все, чьи записи видны в области
    db
      .select({ userId: s.auditLog.actorUserId, name: sql<string>`max(${s.auditLog.actorName})`, position: sql<string | null>`max(${s.staff.position})` })
      .from(s.auditLog)
      .leftJoin(s.staff, eq(s.staff.userId, s.auditLog.actorUserId))
      .where(and(scope, isNotNull(s.auditLog.actorUserId)))
      .groupBy(s.auditLog.actorUserId)
      .orderBy(asc(sql`max(${s.auditLog.actorName})`)),
  ]);

  const more = rows.length > AUDIT_PAGE_SIZE;
  const page = more ? rows.slice(0, AUDIT_PAGE_SIZE) : rows;
  return {
    rows: page,
    nextBefore: more ? page[page.length - 1].id : null,
    actors: actors.filter((a): a is typeof a & { userId: string } => !!a.userId),
  };
}

export type ScopedAuditRow = Awaited<ReturnType<typeof listScopedAudit>>["rows"][number];
