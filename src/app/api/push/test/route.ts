// Пробное уведомление себе. Лимит: 3 за 10 минут на пользователя.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { hasMyPushSubscription } from "@/lib/data/push";
import { pushEnabled, sendPush } from "@/lib/push";
import { Endpoint, guard, json, readJson } from "../_shared";

const LIMIT = 3;
const WINDOW_MS = 10 * 60_000;

// Лимит в памяти процесса: пробное уведомление уходит только самому себе, поэтому
// отдельная таблица не нужна. При нескольких экземплярах лимит считается на каждом.
const globalForPush = globalThis as unknown as { __pushTestHits?: Map<string, number[]> };
const hits = (globalForPush.__pushTestHits ??= new Map<string, number[]>());

function allow(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(userId, recent);
    return Math.ceil((WINDOW_MS - (now - recent[0])) / 60_000);
  }
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return 0;
}

const Body = z.object({ endpoint: Endpoint.optional() });

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { t } = g;
  if (!pushEnabled()) return json({ error: t.apiNotConfigured }, 503);

  const parsed = Body.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return json({ error: t.apiBadRequest }, 400);
  const endpoint = parsed.data.endpoint;
  if (!(await hasMyPushSubscription(endpoint))) return json({ error: t.apiEnableFirst }, 409);

  const wait = allow(g.session.user.id);
  if (wait) return json({ error: t.apiTestLimit(wait) }, 429);

  const r = await sendPush(
    [g.session.user.id],
    { title: t.testPushTitle, body: t.testPushBody, url: "/notifications", tag: "push-test" },
    { onlyEndpoint: endpoint },
  );
  if (!r.sent) {
    return json({ error: r.removed ? t.apiExpired : t.apiDeliveryFailed }, 502);
  }
  return json({ ok: true, sent: r.sent });
}
