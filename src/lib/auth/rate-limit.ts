import "server-only";
// Лимит попыток входа хранится в БД, поэтому работает и при нескольких экземплярах приложения.
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { IP_MAX_FAILS, LOGIN_MAX_FAILS, LOGIN_WINDOW_MIN } from "./constants";

const windowStart = () => new Date(Date.now() - LOGIN_WINDOW_MIN * 60 * 1000);

/** Сколько подряд неудачных попыток по логину в окне (до последней успешной). */
async function consecutiveFails(login: string) {
  const rows = await db
    .select({ success: s.loginAttempts.success, createdAt: s.loginAttempts.createdAt })
    .from(s.loginAttempts)
    .where(and(eq(s.loginAttempts.login, login), gte(s.loginAttempts.createdAt, windowStart())))
    .orderBy(desc(s.loginAttempts.createdAt))
    .limit(LOGIN_MAX_FAILS + 1);
  const fails: Date[] = [];
  for (const r of rows) {
    if (r.success) break;
    fails.push(r.createdAt);
  }
  return fails;
}

/** null, можно входить; число, сколько минут ждать. */
export async function loginBlockedFor(login: string, ip: string): Promise<number | null> {
  const fails = await consecutiveFails(login);
  if (fails.length >= LOGIN_MAX_FAILS) {
    const oldest = fails[LOGIN_MAX_FAILS - 1];
    const unlock = oldest.getTime() + LOGIN_WINDOW_MIN * 60 * 1000;
    return Math.max(1, Math.ceil((unlock - Date.now()) / 60000));
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.loginAttempts)
    .where(and(eq(s.loginAttempts.ip, ip), eq(s.loginAttempts.success, false), gte(s.loginAttempts.createdAt, windowStart())));
  if (n >= IP_MAX_FAILS) return LOGIN_WINDOW_MIN;
  return null;
}

export async function attemptsLeft(login: string): Promise<number> {
  const fails = await consecutiveFails(login);
  return Math.max(0, LOGIN_MAX_FAILS - fails.length);
}

export async function recordAttempt(login: string, ip: string, success: boolean) {
  await db.insert(s.loginAttempts).values({ login, ip, success });
}
