import "server-only";
// Лимит обращений к модели. Место в лимите занимается ДО вызова модели, поэтому пачка
// параллельных запросов не может пройти проверку разом и потратить бюджет сверх лимита.
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, schema as s } from "@/db/client";

/**
 * Проверяет лимит и сразу записывает обращение. userId берётся только из проверенной сессии.
 * Возвращает id записи или null, если лимит исчерпан.
 */
export async function reserveAssistantCall(userId: string, limit: number, windowMs: number): Promise<number | null> {
  return db.transaction(async (tx) => {
    // блокировка на пользователя до конца транзакции: проверка и вставка идут строго по очереди
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`assistant:${userId}`}))`);
    const [{ n }] = await tx
      .select({ n: count() })
      .from(s.assistantUsage)
      .where(and(eq(s.assistantUsage.userId, userId), gte(s.assistantUsage.createdAt, new Date(Date.now() - windowMs))));
    if (n >= limit) return null;
    const [row] = await tx.insert(s.assistantUsage).values({ userId }).returning({ id: s.assistantUsage.id });
    return row.id;
  });
}

/** Дописывает расход токенов к уже занятому обращению. */
export async function recordAssistantTokens(usageId: number, tokens: number | undefined) {
  if (!tokens) return;
  await db.update(s.assistantUsage).set({ tokens }).where(eq(s.assistantUsage.id, usageId));
}
