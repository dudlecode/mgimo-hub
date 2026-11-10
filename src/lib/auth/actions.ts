"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { attemptLogin } from "./login";
import { clientIp, createSession, destroyCurrentSession, destroyOtherSessions, destroySessionOf } from "./session";
import { requireUser } from "./dal";

const LoginSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Введите логин").max(64),
  password: z.string().min(1, "Введите пароль").max(128),
  next: z.string().max(300).optional(),
});

export type LoginState = { error?: string; login?: string; field?: "login" | "password" } | undefined;

/** Разрешаем только относительные пути внутри своего раздела (защита от open redirect). */
function safeNext(next: string | undefined, role: "student" | "staff") {
  const home = role === "staff" ? "/staff" : "/";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return home;
  // Табуляцию и переводы строк парсер адресов выбрасывает, а «\» читает как «/»:
  // путь вида «/<TAB>/evil.example» увёл бы после входа на чужой сайт.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return home;
  if (next.startsWith("/login")) return home;
  const isStaffPath = next === "/staff" || next.startsWith("/staff/");
  if (role === "staff" ? !isStaffPath : isStaffPath) return home;
  return next;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, login: String(formData.get("login") ?? ""), field: issue.path[0] === "password" ? "password" : "login" };
  }
  const { login, password, next } = parsed.data;
  const ip = clientIp(await headers());
  const result = await attemptLogin(login, password, ip);
  if (!result.ok) return { error: result.error, login, field: result.field };
  await createSession(result.user.id);
  redirect(safeNext(next, result.user.role));
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/login");
}

export async function terminateSessionAction(formData: FormData) {
  const { user, sessionId } = await requireUser();
  const id = String(formData.get("sessionId") ?? "");
  if (id && id !== sessionId) await destroySessionOf(user.id, id);
  revalidatePath("/profile");
}

export async function terminateOtherSessionsAction() {
  const { user, sessionId } = await requireUser();
  await destroyOtherSessions(user.id, sessionId);
  revalidatePath("/profile");
}
