import { NextResponse } from "next/server";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { getCurrentSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const [{ n }] = await db
    .select({ n: count() })
    .from(s.notifications)
    .where(and(eq(s.notifications.userId, session.user.id), isNull(s.notifications.readAt)));
  return NextResponse.json({ count: n }, { headers: { "Cache-Control": "no-store" } });
}
