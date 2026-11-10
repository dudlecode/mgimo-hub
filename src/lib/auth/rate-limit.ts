import "server-only";
// Лимит попыток входа хранится в БД, поэтому работает и при нескольких экземплярах приложения.
//
// Блокировка считается по паре «логин + адрес клиента». Если блокировать логин целиком, любой
// посетитель пятью неверными паролями закрывал бы чужой аккаунт для всех (логины демо-аккаунтов
// видны на странице входа). От распределённого перебора страхуют общий предел по логину и предел по адресу.
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { IP_MAX_FAILS, LOGIN_GLOBAL_MAX_FAILS, LOGIN_MAX_FAILS, LOGIN_WINDOW_MIN } from "./constants";

const windowStart = () => new Date(Date.now() - LOGIN_WINDOW_MIN * 60 * 1000);

/** Сколько подряд неудачных попыток по логину с этого адреса в окне (до последней успешной). */
async function consecutiveFails(login: string, ip: string) {
  const rows = await db
    .select({ success: s.loginAttempts.success, createdAt: s.loginAttempts.createdAt })
    .from(s.loginAttempts)
    .where(and(eq(s.loginAttempts.login, login), eq(s.loginAttempts.ip, ip), gte(s.loginAttempts.createdAt, windowStart())))
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
  const fails = await consecutiveFails(login, ip);
  if (fails.length >= LOGIN_MAX_FAILS) {
    const oldest = fails[LOGIN_MAX_FAILS - 1];
    const unlock = oldest.getTime() + LOGIN_WINDOW_MIN * 60 * 1000;
    return Math.max(1, Math.ceil((unlock - Date.now()) / 60000));
  }
  const [{ byIp, byLogin }] = await db
    .select({
      byIp: sql<number>`count(*) filter (where ${s.loginAttempts.ip} = ${ip})::int`,
      byLogin: sql<number>`count(*) filter (where ${s.loginAttempts.login} = ${login})::int`,
    })
    .from(s.loginAttempts)
    .where(
      and(
        eq(s.loginAttempts.success, false),
        gte(s.loginAttempts.createdAt, windowStart()),
        or(eq(s.loginAttempts.ip, ip), eq(s.loginAttempts.login, login)),
      ),
    );
  if (byIp >= IP_MAX_FAILS || byLogin >= LOGIN_GLOBAL_MAX_FAILS) return LOGIN_WINDOW_MIN;
  return null;
}

export async function attemptsLeft(login: string, ip: string): Promise<number> {
  const fails = await consecutiveFails(login, ip);
  return Math.max(0, LOGIN_MAX_FAILS - fails.length);
}

export async function recordAttempt(login: string, ip: string, success: boolean) {
  await db.insert(s.loginAttempts).values({ login, ip, success });
}
