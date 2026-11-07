// Черновик письма преподавателю о переносе контрольной на время больничного.
// Только студент, только его открытый больничный и его дисциплина. Ключ ИИ на сервере.
import { NextResponse, type NextRequest } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { getCurrentSession } from "@/lib/auth/session";
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

  const [{ n }] = await db
    .select({ n: count() })
    .from(s.assistantUsage)
    .where(and(eq(s.assistantUsage.userId, session.user.id), gte(s.assistantUsage.createdAt, new Date(Date.now() - WINDOW_MIN * 60_000))));
  if (n >= LIMIT) {
    return NextResponse.json({ error: t.apiTooMany(LIMIT, WINDOW_MIN) }, { status: 429 });
  }

  const letter = await draftSickLetter(parsed.data.courseId);
  if (!letter) return NextResponse.json({ error: t.apiNotFound }, { status: 404 });

  await db.insert(s.assistantUsage).values({ userId: session.user.id });
  return NextResponse.json(letter, { headers: { "Cache-Control": "private, no-store" } });
}
