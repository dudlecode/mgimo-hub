// Новости деканата на языке интерфейса. Тексты берутся из колонок title_en / body_en объявления,
// авторы-подразделения переводятся по словарю, имена сотрудников пишутся латиницей.
import type { Locale } from "./config";
import { latin } from "./translit";

const AUTHOR_EN: Record<string, string> = {
  "Студенческий офис": "Student Office",
  "Стипендиальная комиссия": "Scholarship Committee",
  "Управление международного сотрудничества": "International Cooperation Office",
  "Центр карьеры": "Career Centre",
  "Учебно-методическое управление": "Academic Affairs Office",
  "Кафедра иностранных языков": "Department of Foreign Languages",
  "Кампус Одинцово": "Odintsovo Campus",
};

export function newsAuthor(name: string, locale: Locale): string {
  if (locale !== "en") return name;
  if (AUTHOR_EN[name]) return AUTHOR_EN[name];
  const office = name.match(/^Учебный офис\s+(.+)$/);
  if (office) return `${latin(office[1])} student office`;
  return latin(name);
}

type NewsRow = { title: string; body: string; titleEn: string | null; bodyEn: string | null; authorName: string };

/** Объявление для показа. ruOnly: перевода ещё нет, текст русский (для атрибута lang и подписи). */
export function localizeNews<T extends NewsRow>(row: T, locale: Locale): T & { ruOnly: boolean } {
  if (locale !== "en") return { ...row, ruOnly: false };
  const has = !!(row.titleEn && row.bodyEn);
  return { ...row, title: has ? row.titleEn! : row.title, body: has ? row.bodyEn! : row.body, authorName: newsAuthor(row.authorName, locale), ruOnly: !has };
}
