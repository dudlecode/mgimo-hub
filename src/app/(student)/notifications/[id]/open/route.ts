// Открыть уведомление: отметить прочитанным и перейти по ссылке. Только своё уведомление.
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db/client";
import { getCurrentSession } from "@/lib/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const fallback = new URL("/notifications", req.url);
  if (!z.string().uuid().safeParse(id).success) return NextResponse.redirect(fallback);

  const [row] = await db
    .update(s.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(s.notifications.id, id), eq(s.notifications.userId, session.user.id)))
    .returning({ link: s.notifications.link });

  // только внутренние ссылки
  const link = row?.link && row.link.startsWith("/") && !row.link.startsWith("//") ? row.link : null;
  return NextResponse.redirect(link ? new URL(link, req.url) : fallback);
}
