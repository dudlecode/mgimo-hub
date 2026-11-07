// Язык для экрана «Нет сети». Service worker берёт /offline без cookie (страница общая для всех),
// поэтому язык интерфейса запоминаем на устройстве, пока студент в кабинете, и читаем его на этом экране.
// Это удобство одного устройства: без хранилища экран остаётся на языке, который отдал сервер.
import { useSyncExternalStore } from "react";
import { useLocale } from "@/lib/i18n/client";
import { isLocale, type Locale } from "@/lib/i18n/config";

const KEY = "mh-locale";

export function rememberLocale(locale: Locale) {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* без хранилища: экран «Нет сети» покажет язык сервера */
  }
}

function readStored(): Locale | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

/** Язык экрана «Нет сети»: сохранённый на устройстве, иначе язык сервера */
export function useOfflineLocale(): Locale {
  const server = useLocale();
  return useSyncExternalStore(noopSubscribe, () => readStored() ?? server, () => server);
}
