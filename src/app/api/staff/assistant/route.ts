// Атташе для деканата. Только сотрудники, только заявки своей области. Ключ ИИ на сервере.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/origin";
import { getCurrentSession } from "@/lib/auth/session";
import { reserveAssistantCall } from "@/lib/assistant/quota";
import { draftReply, queueSummary } from "@/lib/assistant/staff";
import { getScopedRequestRef } from "@/lib/data/staff";
import { audit } from "@/lib/audit";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reply"), requestId: z.string().uuid(), intent: z.enum(["ask", "status", "reject"]) }),
  z.object({ kind: z.literal("summary") }),
]);

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (session.user.role !== "staff") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  // место в лимите занимаем до вызова модели: пачка параллельных запросов не обходит лимит
  if ((await reserveAssistantCall(session.user.id, 30, 10 * 60_000)) === null) {
    return NextResponse.json({ error: "Слишком много запросов подряд, подождите пару минут." }, { status: 429 });
  }

  const result = parsed.data.kind === "reply" ? await draftReply(parsed.data.requestId, parsed.data.intent) : await queueSummary();
  if (parsed.data.kind === "reply") {
    const ref = await getScopedRequestRef(parsed.data.requestId);
    if (ref) await audit({ action: "assistant.reply_draft", entityType: "request", entityId: ref.id, studentId: ref.studentId, summary: `Подготовлен черновик ответа по заявке ${ref.number}` });
  } else {
    await audit({ action: "assistant.queue_summary", entityType: "queue", summary: "Подготовлена сводка очереди заявок" });
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
