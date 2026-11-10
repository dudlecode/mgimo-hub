// Черновик письма преподавателю о переносе контрольной на время больничного.
// Только студент, только его открытый больничный и его дисциплина. Ключ ИИ на сервере.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { reserveAssistantCall } from "@/lib/assistant/quota";
import { draftSickLetter } from "@/lib/assistant/sick-letter";
import { getMessages } from "@/lib/i18n/server";
import { sickLeaveMessages } from "@/lib/i18n/messages/sick-leave";

const Body = z.object({ courseId: z.string().uuid() });

const LIMIT = 20; // запросов
const WINDOW_MIN = 10; // за 10 минут

/** CSRF: запрос должен прийти с нашего же сайта */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Письмо всегда по-русски (преподаватели русскоязычные); на языке интерфейса только сообщения об ошибках
export async function POST(req: NextRequest) {
  const t = await getMessages(sickLeaveMessages);
  if (!sameOrigin(req)) return NextResponse.json({ error: t.apiRejected }, { status: 403 });

  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: t.apiSignIn }, { status: 401 });
  if (session.user.role !== "student") return NextResponse.json({ error: t.apiNoAccess }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t.apiBadRequest }, { status: 400 });

  // место в лимите занимаем до вызова модели: пачка параллельных запросов не обходит лимит
  if ((await reserveAssistantCall(session.user.id, LIMIT, WINDOW_MIN * 60_000)) === null) {
    return NextResponse.json({ error: t.apiTooMany(LIMIT, WINDOW_MIN) }, { status: 429 });
  }

  const letter = await draftSickLetter(parsed.data.courseId);
  if (!letter) return NextResponse.json({ error: t.apiNotFound }, { status: 404 });

  return NextResponse.json(letter, { headers: { "Cache-Control": "private, no-store" } });
}
