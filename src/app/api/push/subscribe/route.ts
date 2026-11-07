// Подписка этого устройства на push. Пользователь только из сессии, studentId от клиента не принимаем.
import type { NextRequest } from "next/server";
import { deleteMyPushSubscription, saveMyPushSubscription } from "@/lib/data/push";
import { pushEnabled } from "@/lib/push";
import { EndpointBody, SubscriptionBody, guard, json, readJson } from "../_shared";

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  if (!pushEnabled()) return json({ error: g.t.apiNotConfigured }, 503);

  const parsed = SubscriptionBody.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: g.t.apiBadSubscription }, 400);
  const { endpoint, keys } = parsed.data;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  await saveMyPushSubscription({ endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent });
  return json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const parsed = EndpointBody.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: g.t.apiBadRequest }, 400);
  const removed = await deleteMyPushSubscription(parsed.data.endpoint);
  return json({ ok: true, removed });
}
