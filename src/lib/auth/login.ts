import "server-only";
// Общая логика входа для Server Action (форма) и JSON API (/api/auth/login).
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { auditStaffLogin } from "@/lib/audit";
import { getDummyHash, verifyPassword } from "./password";
import { attemptsLeft, loginBlockedFor, recordAttempt } from "./rate-limit";
import { plural } from "@/lib/time";

export type LoginResult =
  | { ok: true; user: { id: string; role: "student" | "staff" } }
  | { ok: false; status: 401 | 429; error: string; field?: "login" | "password" };

export async function attemptLogin(loginRaw: string, password: string, ip: string): Promise<LoginResult> {
  const login = loginRaw.trim().toLowerCase().slice(0, 64);
  const blocked = await loginBlockedFor(login, ip);
  if (blocked) {
    return { ok: false, status: 429, error: `Слишком много попыток входа. Попробуйте через ${blocked} ${plural(blocked, "минуту", "минуты", "минут")}.` };
  }

  const user = await db.query.users.findFirst({ where: eq(s.users.login, login) });
  // Для несуществующего логина всё равно считаем хэш, время ответа не выдаёт, есть ли такой пользователь.
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await getDummyHash(), password), false);
  await recordAttempt(login, ip, ok);
  // Журнал входов сотрудников пишем после ответа: время ответа не должно выдавать, что логин принадлежит сотруднику
  if (user?.role === "staff") {
    const userId = user.id;
    after(() => auditStaffLogin(userId, ok, ip));
  }

  if (!ok || !user) {
    const left = await attemptsLeft(login, ip);
    return {
      ok: false,
      status: 401,
      field: "password",
      error:
        left > 0
          ? `Неверный логин или пароль.${left < 5 ? ` Осталось ${left} ${plural(left, "попытка", "попытки", "попыток")}.` : ""}`
          : "Неверный логин или пароль. Вход временно заблокирован на 15 минут.",
    };
  }
  await db.update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
  return { ok: true, user: { id: user.id, role: user.role } };
}
