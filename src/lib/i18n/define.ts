// Словари по разделам. Русский словарь задаёт форму, английский обязан ей соответствовать:
// пропущенный или лишний ключ, это ошибка типов. Значения: строки или функции (для чисел и подстановок).
import type { Locale } from "./config";

export type Messages<T> = Record<Locale, T>;

/**
 * defineMessages({ title: "Сегодня", lessons: (n: number) => `${n} пар` }, { title: "Today", lessons: (n) => `${n} classes` })
 */
export function defineMessages<T extends object>(ru: T, en: NoInfer<T>): Messages<T> {
  return { ru, en };
}

/** Русское склонение для словарей: plural(5, "пара", "пары", "пар") */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Английское: pluralEn(1, "class", "classes") */
export const pluralEn = (n: number, one: string, many: string) => (Math.abs(n) === 1 ? one : many);
