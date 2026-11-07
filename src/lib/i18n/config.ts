// Языки интерфейса кабинета студента. Кабинет сотрудника всегда на русском.
// Язык хранится в cookie (не в адресе): кабинет персональный, индексировать нечего.

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "hub_locale";

export const isLocale = (v: unknown): v is Locale => v === "ru" || v === "en";

/** Тег для Intl: en-GB даёт «6 November» и 24-часовое время, как привычно иностранным студентам в Европе */
export const intlTag = (l: Locale) => (l === "en" ? "en-GB" : "ru-RU");

export const LOCALE_LABEL: Record<Locale, string> = { ru: "Русский", en: "English" };
