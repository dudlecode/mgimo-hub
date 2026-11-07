// Общие слова интерфейса. Пример формы словаря; разделы держат свои словари рядом (messages/<раздел>.ts).
import type { Locale } from "../config";
import { defineMessages, pluralEn, pluralRu } from "../define";

export const commonMessages = defineMessages(
  {
    loading: "Загрузка",
    retry: "Попробовать снова",
    cancel: "Отмена",
    save: "Сохранить",
    close: "Закрыть",
    all: "Все",
    language: "Язык интерфейса",
    errorTitle: "Не получилось загрузить",
    errorText: "Проверьте соединение и попробуйте ещё раз.",
    days: (n: number) => `${n} ${pluralRu(n, "день", "дня", "дней")}`,
  },
  {
    loading: "Loading",
    retry: "Try again",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    all: "All",
    language: "Interface language",
    errorTitle: "Couldn't load this page",
    errorText: "Check your connection and try again.",
    days: (n) => `${n} ${pluralEn(n, "day", "days")}`,
  },
);

// ───────────── Справочные данные из БД, у которых нет английской колонки ─────────────
// Используются в разделах кабинета студента. Русский вариант возвращается без изменений.
// Кампусы и корпуса: campusInfo / buildingLabel в src/lib/academic.ts.
const WEEKDAY_ABBR_EN: Record<string, string> = { Пн: "Mon", Вт: "Tue", Ср: "Wed", Чт: "Thu", Пт: "Fri", Сб: "Sat", Вс: "Sun" };

/** Часы работы офиса из БД: «Пн-Чт 10:00-17:00, Пт 10:00-16:00, обед 13:00-14:00» → «Mon-Thu 10:00-17:00, Fri 10:00-16:00, lunch 13:00-14:00» */
export function localizeOfficeHours(hours: string, locale: Locale): string {
  if (locale !== "en") return hours;
  return hours
    .replace(/Пн|Вт|Ср|Чт|Пт|Сб|Вс/g, (m) => WEEKDAY_ABBR_EN[m] ?? m)
    .replace(/обед/gi, "lunch")
    .replace(/выходной/gi, "closed");
}

const STUDY_FORM_EN: Record<string, string> = { очная: "full-time", "очно-заочная": "part-time", заочная: "distance learning" };

/** Форма обучения из БД («очная») */
export const localizeStudyForm = (form: string, locale: Locale) => (locale === "en" ? (STUDY_FORM_EN[form] ?? form) : form);

/** Основа обучения: бюджет или договор */
export const fundingLabel = (funding: string, locale: Locale) =>
  locale === "en" ? (funding === "budget" ? "state-funded" : "fee-paying") : funding === "budget" ? "бюджет" : "договор";

const LANGUAGE_EN: Record<string, string> = {
  "Английский язык": "English",
  "Арабский язык": "Arabic",
  "Немецкий язык": "German",
  "Китайский язык": "Chinese",
  "Итальянский язык": "Italian",
  "Турецкий язык": "Turkish",
  "Испанский язык": "Spanish",
  "Французский язык": "French",
};

/** Иностранный язык студента из БД («Английский язык») */
export const localizeLanguageName = (name: string, locale: Locale) => (locale === "en" ? (LANGUAGE_EN[name] ?? name) : name);

/** Название дисциплины или факультета: при английском интерфейсе nameEn, если заполнено */
export const localizedName = (row: { name: string; nameEn?: string | null }, locale: Locale) => (locale === "en" ? (row.nameEn ?? row.name) : row.name);
