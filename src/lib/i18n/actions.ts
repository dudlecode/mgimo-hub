"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSecureCookie } from "@/lib/auth/session";
import { isLocale, LOCALE_COOKIE } from "./config";

/** Переключение языка. Не требует входа: язык можно выбрать и на странице входа. */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return { ok: false as const };
  (await cookies()).set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: "lax",
    // как у cookie сеанса: по обычному http без прокси браузер не принял бы Secure, и язык бы не переключался
    secure: await isSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
