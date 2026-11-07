import "server-only";
// Общее для маршрутов /api/push/*: проверка Origin (CSRF), сессии и формата подписки.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/server";
import { notificationsMessages } from "@/lib/i18n/messages/notifications";

const MAX_BODY = 4096;

/** Запрос должен прийти с нашего же сайта. Иначе 403. */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Origin, затем сессия студента. Возвращает ответ с ошибкой или сессию. */
export async function guard(req: NextRequest) {
  const t = await getMessages(notificationsMessages);
  if (!sameOrigin(req)) return { error: json({ error: t.apiRejected }, 403) } as const;
  const session = await getCurrentSession();
  if (!session || session.user.role !== "student") return { error: json({ error: t.apiSignIn }, 401) } as const;
  return { session, t } as const;
}

/** Тело запроса как JSON, не больше MAX_BODY байт. */
export async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Push-сервисы браузеров. Сервер сам ходит по адресу подписки, поэтому произвольные адреса
// не принимаем (иначе через подписку можно заставить сервер слать запросы куда угодно, SSRF).
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Android, Яндекс Браузер, Opera
  "android.googleapis.com",
  "updates.push.services.mozilla.com", // Firefox
  "push.services.mozilla.com",
  "web.push.apple.com", // Safari, iOS 16.4+
  "push.apple.com",
  "notify.windows.com", // Edge
];

function allowedEndpoint(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
    const host = u.hostname.toLowerCase();
    return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export const Endpoint = z.string().trim().min(10).max(2000).refine(allowedEndpoint, "Неизвестный push-сервис");

export const SubscriptionBody = z.object({
  endpoint: Endpoint,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    // P-256, 65 байт в base64url: 87 символов (88 с выравниванием)
    p256dh: z.string().min(80).max(100).regex(B64URL),
    // 16 байт: 22 символа (24 с выравниванием)
    auth: z.string().min(16).max(32).regex(B64URL),
  }),
});

export const EndpointBody = z.object({ endpoint: Endpoint });
