// Атташе для деканата. Только сотрудники, только заявки своей области. Ключ ИИ на сервере.
import { NextResponse, type NextRequest } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { getCurrentSession } from "@/lib/auth/session";
import { draftReply, queueSummary } from "@/lib/assistant/staff";
import { getScopedRequestRef } from "@/lib/data/staff";
import { audit } from "@/lib/audit";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reply"), requestId: z.string().uuid(), intent: z.enum(["ask", "status", "reject"]) }),
  z.object({ kind: z.literal("summary") }),
]);

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (session.user.role !== "staff") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const [{ n }] = await db
    .select({ n: count() })
    .from(s.assistantUsage)
    .where(and(eq(s.assistantUsage.userId, session.user.id), gte(s.assistantUsage.createdAt, new Date(Date.now() - 10 * 60_000))));
  if (n >= 30) return NextResponse.json({ error: "Слишком много запросов подряд, подождите пару минут." }, { status: 429 });

  const result = parsed.data.kind === "reply" ? await draftReply(parsed.data.requestId, parsed.data.intent) : await queueSummary();
  await db.insert(s.assistantUsage).values({ userId: session.user.id });
  if (parsed.data.kind === "reply") {
    const ref = await getScopedRequestRef(parsed.data.requestId);
    if (ref) await audit({ action: "assistant.reply_draft", entityType: "request", entityId: ref.id, studentId: ref.studentId, summary: `Подготовлен черновик ответа по заявке ${ref.number}` });
  } else {
    await audit({ action: "assistant.queue_summary", entityType: "queue", summary: "Подготовлена сводка очереди заявок" });
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
