import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import type { Messages } from "./define";

/** Язык текущего запроса (cookie), один раз на запрос */
export const getLocale = cache(async (): Promise<Locale> => {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
});

/** Словарь раздела на языке запроса: const t = await getMessages(todayMessages) */
export async function getMessages<T>(ns: Messages<T>): Promise<T> {
  return ns[await getLocale()];
}
