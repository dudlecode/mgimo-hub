import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { and, eq, gt, ne } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./constants";

const TOUCH_EVERY_MS = 10 * 60 * 1000;

/** В БД хранится только SHA-256 токена: утечка базы не позволяет войти. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function clientIp(h: Headers): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (h.get("x-real-ip") ?? "local").slice(0, 64);
}

async function isSecureCookie(): Promise<boolean> {
  const mode = process.env.COOKIE_SECURE ?? "auto";
  if (mode === "true") return true;
  if (mode === "false") return false;
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim();
  if (proto) return proto === "https";
  return process.env.NODE_ENV === "production" && !(h.get("host") ?? "").startsWith("localhost");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url"); // 256 бит
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(s.sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    ip: clientIp(h),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isSecureCookie(),
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export type SessionUser = { id: string; login: string; role: "student" | "staff"; lastLoginAt: Date | null };

/** Текущая сессия (кэшируется в пределах одного запроса). */
export const getCurrentSession = cache(async (): Promise<{ sessionId: string; user: SessionUser } | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length < 20 || token.length > 100) return null;
  const id = hashToken(token);
  const row = await db.query.sessions.findFirst({
    where: and(eq(s.sessions.id, id), gt(s.sessions.expiresAt, new Date())),
    with: { user: { columns: { id: true, login: true, role: true, lastLoginAt: true } } },
  });
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(s.sessions).set({ lastSeenAt: new Date() }).where(eq(s.sessions.id, id));
  }
  return { sessionId: id, user: row.user };
});

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(s.sessions).where(eq(s.sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export async function destroyOtherSessions(userId: string, currentSessionId: string): Promise<number> {
  const res = await db
    .delete(s.sessions)
    .where(and(eq(s.sessions.userId, userId), ne(s.sessions.id, currentSessionId)))
    .returning({ id: s.sessions.id });
  return res.length;
}

/** Завершить конкретный сеанс, только свой (userId из сессии). */
export async function destroySessionOf(userId: string, sessionId: string): Promise<boolean> {
  const res = await db
    .delete(s.sessions)
    .where(and(eq(s.sessions.userId, userId), eq(s.sessions.id, sessionId)))
    .returning({ id: s.sessions.id });
  return res.length > 0;
}

export async function listSessions(userId: string) {
  return db.query.sessions.findMany({
    where: and(eq(s.sessions.userId, userId), gt(s.sessions.expiresAt, new Date())),
    columns: { id: true, createdAt: true, lastSeenAt: true, userAgent: true, ip: true },
    orderBy: (t, { desc }) => [desc(t.lastSeenAt)],
  });
}
