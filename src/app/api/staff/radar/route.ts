// Черновик сообщения студенту из радара рисков. Только сотрудники, только студенты своей области. Ключ ИИ на сервере.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { reserveAssistantCall } from "@/lib/assistant/quota";
import { draftOutreach } from "@/lib/assistant/radar";
import { audit } from "@/lib/audit";

const Body = z.object({ studentId: z.string().uuid() });

const LIMIT = 30;
const WINDOW_MS = 10 * 60_000;

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let sameOrigin = false;
  try {
    sameOrigin = !!origin && !!host && new URL(origin).host === host;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });

  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (session.user.role !== "staff") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  // Место в лимите занимаем до вызова модели. Промах тоже засчитан: перебор чужих id упирается в ограничение
  if ((await reserveAssistantCall(session.user.id, LIMIT, WINDOW_MS)) === null) {
    return NextResponse.json({ error: "Слишком много запросов подряд, подождите пару минут." }, { status: 429 });
  }

  // Область проверяется в слое данных: студент другого факультета даст null, как и несуществующий
  const result = await draftOutreach(parsed.data.studentId);
  if (!result) return NextResponse.json({ error: "Студент не найден" }, { status: 404 });
  await audit({
    action: "radar.draft",
    entityType: "student",
    entityId: parsed.data.studentId,
    studentId: parsed.data.studentId,
    summary: result.mode === "ai" ? "Подготовлен черновик сообщения студенту в радаре рисков (Атташе)" : "Подготовлен черновик сообщения студенту в радаре рисков (шаблон)",
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
