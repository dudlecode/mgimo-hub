import "server-only";
// Подписки на push текущего пользователя. Пользователь берётся только из сессии,
// адрес подписки из запроса лишь говорит «какую из моих».
import { and, desc, eq, ne, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";

export const MAX_SUBSCRIPTIONS_PER_USER = 10;

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string; userAgent: string | null };

/**
 * Сохранить подписку этого устройства за текущим пользователем (upsert по endpoint).
 * Если устройство раньше было привязано к другому пользователю, оно переходит к текущему:
 * на одном телефоне уведомления получает тот, кто вошёл последним.
 * Больше MAX_SUBSCRIPTIONS_PER_USER устройств не храним: самые старые удаляются.
 */
export async function saveMyPushSubscription(input: PushSubscriptionInput) {
  const { user } = await requireStudent();
  await db
    .insert(s.pushSubscriptions)
    .values({ userId: user.id, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent })
    .onConflictDoUpdate({
      target: s.pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, createdAt: new Date() },
    });

  const others = await db
    .select({ id: s.pushSubscriptions.id })
    .from(s.pushSubscriptions)
    .where(and(eq(s.pushSubscriptions.userId, user.id), ne(s.pushSubscriptions.endpoint, input.endpoint)))
    .orderBy(desc(s.pushSubscriptions.createdAt));
  const extra = others.slice(MAX_SUBSCRIPTIONS_PER_USER - 1).map((r) => r.id);
  if (extra.length) await db.delete(s.pushSubscriptions).where(inArray(s.pushSubscriptions.id, extra));
}

/** Удалить подписку этого устройства, только свою. */
export async function deleteMyPushSubscription(endpoint: string) {
  const { user } = await requireStudent();
  const rows = await db
    .delete(s.pushSubscriptions)
    .where(and(eq(s.pushSubscriptions.endpoint, endpoint), eq(s.pushSubscriptions.userId, user.id)))
    .returning({ id: s.pushSubscriptions.id });
  return rows.length > 0;
}

/** Есть ли у меня такая подписка (для пробного уведомления на это устройство). */
export async function hasMyPushSubscription(endpoint?: string) {
  const { user } = await requireStudent();
  const where = endpoint
    ? and(eq(s.pushSubscriptions.userId, user.id), eq(s.pushSubscriptions.endpoint, endpoint))
    : eq(s.pushSubscriptions.userId, user.id);
  const row = await db.query.pushSubscriptions.findFirst({ where, columns: { id: true } });
  return !!row;
}
