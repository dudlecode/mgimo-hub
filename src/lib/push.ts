import "server-only";
// Web Push: отправка уведомлений на телефон. Внутренний helper, как и notify(): вызывается только
// ПОСЛЕ проверки прав и сам ничего не проверяет. Ошибки отправки никогда не роняют вызывающий код.
// Приватный VAPID-ключ живёт только в env сервера, в браузер уходит лишь публичный.
import webpush, { WebPushError } from "web-push";
import { inArray } from "drizzle-orm";
import { db, schema as s } from "@/db/client";

export type PushPayload = {
  title: string;
  body: string;
  /** Внутренний путь, например «/requests/…». Внешние ссылки отбрасываются. */
  url?: string | null;
  /** Одинаковый tag заменяет предыдущее уведомление, а не копит стопку. */
  tag?: string;
};

export type PushMessage = { userId: string; payload: PushPayload };
export type PushResult = { sent: number; failed: number; removed: number };

const SEND_TIMEOUT_MS = 8000;
const CONCURRENCY = 16;
const TTL_SECONDS = 24 * 60 * 60;

type VapidConfig = { publicKey: string; privateKey: string; subject: string };

function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:office@mgimo-hub.local";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/** Публичный ключ для подписки в браузере; null, если push на сервере не настроен. */
export function vapidPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

export function pushEnabled(): boolean {
  return vapidConfig() !== null;
}

/** Только относительный путь нашего сайта. */
export function safePushPath(link: string | null | undefined): string | null {
  if (!link || link.length > 300 || !link.startsWith("/") || link.startsWith("//") || link.startsWith("/\\")) return null;
  return link;
}

function clip(text: string, max: number) {
  // Правило интерфейса: без длинных тире и стрелок, в том числе в уведомлениях
  const clean = text
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*[→←⟶]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function serialize(p: PushPayload) {
  return JSON.stringify({
    title: clip(p.title, 80) || "MGIMO Hub",
    body: clip(p.body, 160),
    url: safePushPath(p.url) ?? "/notifications",
    ...(p.tag ? { tag: p.tag.slice(0, 64) } : {}),
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("push timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.allSettled(workers);
}

/**
 * Разослать сообщения. Каждое сообщение уходит на все устройства получателя
 * (или только на `onlyEndpoint`, если указан). Подписки, которые push-сервис считает
 * удалёнными (404/410), стираются; удачным ставится lastSuccessAt.
 */
export async function sendPushMessages(messages: PushMessage[], opts: { onlyEndpoint?: string } = {}): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, removed: 0 };
  const cfg = vapidConfig();
  if (!cfg || !messages.length) return result;

  try {
    const userIds = [...new Set(messages.map((m) => m.userId))];
    const subsByUser = new Map<string, (typeof s.pushSubscriptions.$inferSelect)[]>();
    for (let i = 0; i < userIds.length; i += 500) {
      const rows = await db.select().from(s.pushSubscriptions).where(inArray(s.pushSubscriptions.userId, userIds.slice(i, i + 500)));
      for (const row of rows) {
        if (opts.onlyEndpoint && row.endpoint !== opts.onlyEndpoint) continue;
        subsByUser.set(row.userId, [...(subsByUser.get(row.userId) ?? []), row]);
      }
    }
    // Каждое сообщение на каждое устройство его получателя
    const jobs = messages.flatMap((m) => {
      const body = serialize(m.payload);
      return (subsByUser.get(m.userId) ?? []).map((sub) => ({ sub, body }));
    });
    if (!jobs.length) return result;

    const ok = new Set<string>();
    const gone = new Set<string>();
    await runPool(jobs, CONCURRENCY, async ({ sub, body }) => {
      if (gone.has(sub.id)) return;
      try {
        await withTimeout(
          webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
            vapidDetails: cfg,
            TTL: TTL_SECONDS,
            timeout: SEND_TIMEOUT_MS,
            urgency: "normal",
          }),
          SEND_TIMEOUT_MS + 1000,
        );
        ok.add(sub.id);
        result.sent++;
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
          gone.add(sub.id);
        } else {
          result.failed++;
          // В лог только код ответа: адрес подписки и ключи не пишем
          const code = e instanceof WebPushError ? e.statusCode : e instanceof Error ? e.message : "error";
          console.warn("[push] не доставлено:", code);
        }
      }
    });

    for (const id of gone) ok.delete(id);
    if (ok.size) await db.update(s.pushSubscriptions).set({ lastSuccessAt: new Date() }).where(inArray(s.pushSubscriptions.id, [...ok]));
    if (gone.size) await db.delete(s.pushSubscriptions).where(inArray(s.pushSubscriptions.id, [...gone]));
    result.removed = gone.size;
  } catch (e) {
    console.warn("[push] ошибка рассылки:", e instanceof Error ? e.message : e);
  }
  return result;
}

/** Одно и то же сообщение нескольким пользователям. */
export function sendPush(userIds: string[], payload: PushPayload, opts: { onlyEndpoint?: string } = {}): Promise<PushResult> {
  return sendPushMessages(
    [...new Set(userIds)].map((userId) => ({ userId, payload })),
    opts,
  );
}
