// ИИ-ассистент «Атташе». Ключи ИИ-провайдера живут только здесь, на сервере (переменные окружения).
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/origin";
import { getCurrentSession } from "@/lib/auth/session";
import { recordAssistantTokens, reserveAssistantCall } from "@/lib/assistant/quota";
import { buildAssistantContext } from "@/lib/assistant/context";
import { askModel, offlineAnswer, type AssistantReply } from "@/lib/assistant/engine";
import { aiProvider } from "@/lib/assistant/providers";
import { getLocale } from "@/lib/i18n/server";
import { assistantMessages } from "@/lib/i18n/messages/assistant";

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(16),
});

const LIMIT = 20; // запросов
const WINDOW_MIN = 10; // за 10 минут

export async function POST(req: NextRequest) {
  // Язык ответа и сообщений об ошибках: язык интерфейса студента (cookie)
  const locale = await getLocale();
  const t = assistantMessages[locale];
  // CSRF: запрос должен прийти с нашего же сайта
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: t.apiRejected }, { status: 403 });

  const session = await getCurrentSession();
  if (!session || session.user.role !== "student") return NextResponse.json({ error: t.apiSignIn }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.apiBadRequest }, { status: 400 });
  const messages = parsed.data.messages;
  const last = messages[messages.length - 1];
  if (last.role !== "user") return NextResponse.json({ error: t.apiBadRequest }, { status: 400 });

  // место в лимите занимаем до вызова модели: пачка параллельных запросов не обходит лимит
  const usageId = await reserveAssistantCall(session.user.id, LIMIT, WINDOW_MIN * 60_000);
  if (usageId === null) {
    return NextResponse.json({ error: t.apiTooMany(LIMIT, WINDOW_MIN) }, { status: 429 });
  }

  const ctx = await buildAssistantContext(locale);
  let answer: AssistantReply;
  let fallbackReason: string | null = null;
  if (aiProvider()) {
    try {
      answer = await askModel(messages, ctx, locale);
    } catch (e) {
      fallbackReason = e instanceof Error ? e.message : "error";
      console.error("[assistant] модель недоступна, офлайн-режим:", fallbackReason);
      answer = offlineAnswer(last.content, ctx, locale);
    }
  } else {
    answer = offlineAnswer(last.content, ctx, locale);
  }

  await recordAssistantTokens(usageId, answer.tokens);
  return NextResponse.json({ ...answer, degraded: fallbackReason !== null }, { headers: { "Cache-Control": "no-store" } });
}
