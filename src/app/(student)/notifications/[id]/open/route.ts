// Открыть уведомление: отметить прочитанным и перейти по ссылке. Только своё уведомление.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { getCurrentSession } from "@/lib/auth/session";

/**
 * Переход относительным адресом. За обратным прокси и в Docker req.url содержит внутренний адрес
 * сервера (localhost:3000), поэтому абсолютный адрес из него увёл бы студента на несуществующую страницу.
 */
function go(path: string) {
  return new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return go("/login");
  if (!z.string().uuid().safeParse(id).success) return go("/notifications");

  const [row] = await db
    .update(s.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(s.notifications.id, id), eq(s.notifications.userId, session.user.id)))
    .returning({ link: s.notifications.link });

  // только внутренние ссылки: путь от корня без управляющих символов и обратных слэшей
  const link = row?.link && /^\/(?![/\\])[^\u0000-\u001f\u007f\\]*$/.test(row.link) ? row.link : null;
  return go(link ?? "/notifications");
}
