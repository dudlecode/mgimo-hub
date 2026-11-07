"use client";

import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/define";

/**
 * Словарь для общих компонентов, которые стоят и в кабинете сотрудника (тема, скелетон, печать).
 * Кабинет сотрудника всегда на русском, даже если в браузере остался выбранный студентом английский.
 */
export function useSharedMessages<T>(ns: Messages<T>): T {
  const locale = useLocale();
  const pathname = usePathname() ?? "";
  const staff = pathname === "/staff" || pathname.startsWith("/staff/");
  return ns[staff ? "ru" : locale];
}
