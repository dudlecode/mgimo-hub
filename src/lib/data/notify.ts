import "server-only";
// Внутренний helper для создания уведомлений. Вызывается только из серверных экшенов
// ПОСЛЕ проверки прав, сам ничего не проверяет.
import { after } from "next/server";
import { db, schema as s } from "@/db/client";
import type { NotificationKind } from "@/db/schema";
import { pushEnabled, sendPushMessages, type PushMessage } from "@/lib/push";

export type NewNotification = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** английская версия, см. src/lib/notify-text.ts */
  titleEn?: string | null;
  bodyEn?: string | null;
  link?: string | null;
  important?: boolean;
};

/** Оценки, здоровье, оплата и сообщения офиса на экран блокировки не выводим: в push только заголовок. */
const PRIVATE_PUSH_KINDS = new Set<NotificationKind>(["grade", "health", "payment", "system"]);
const PRIVATE_PUSH_BODY = "Откройте MGIMO Hub, чтобы прочитать.";

export async function notify(items: NewNotification | NewNotification[]) {
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return;
  const push: PushMessage[] = [];
  const withPush = pushEnabled();
  for (let i = 0; i < list.length; i += 500) {
    const rows = await db
      .insert(s.notifications)
      .values(list.slice(i, i + 500).map((n) => ({ ...n, link: n.link ?? null, important: n.important ?? false })))
      .returning({ id: s.notifications.id, userId: s.notifications.userId, kind: s.notifications.kind, title: s.notifications.title, body: s.notifications.body });
    // В push только заголовок, короткий текст и путь: открытие отметит уведомление прочитанным
    if (withPush) {
      for (const r of rows) {
        const body = PRIVATE_PUSH_KINDS.has(r.kind) ? PRIVATE_PUSH_BODY : r.body;
        push.push({ userId: r.userId, payload: { title: r.title, body, url: `/notifications/${r.id}/open`, tag: r.id } });
      }
    }
  }
  if (push.length) schedulePush(push);
}

/** Push на телефон после ответа (fire-and-forget): ошибки и задержки push-сервиса не мешают экшену. */
function schedulePush(messages: PushMessage[]) {
  const run = () => sendPushMessages(messages).then(() => undefined, () => undefined);
  try {
    after(run);
  } catch {
    // вне запроса (скрипты, фоновые задачи): просто не ждём
    void run();
  }
}
