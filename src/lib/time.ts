// Время в кабинете всегда московское (UTC+3, без перехода на летнее время с 2014 г.).
// Сервер может работать в UTC, поэтому все расчёты «какой сегодня день» идут через эти функции.

import { intlTag, type Locale } from "./i18n/config";

export const TZ = "Europe/Moscow";
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

export type MskParts = { y: number; m: number; d: number; wd: number; h: number; min: number };

/** Части даты по Москве. wd: 0 = понедельник … 6 = воскресенье. m: 0..11 */
export function mskParts(date: Date): MskParts {
  const s = new Date(date.getTime() + MSK_OFFSET_MS);
  return {
    y: s.getUTCFullYear(),
    m: s.getUTCMonth(),
    d: s.getUTCDate(),
    wd: (s.getUTCDay() + 6) % 7,
    h: s.getUTCHours(),
    min: s.getUTCMinutes(),
  };
}

/** Момент времени по московским часам. */
export function mskDate(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m, d, h, min) - MSK_OFFSET_MS);
}

export function startOfMskDay(date: Date): Date {
  const p = mskParts(date);
  return mskDate(p.y, p.m, p.d);
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * DAY_MS);
}

export function addMinutes(date: Date, n: number): Date {
  return new Date(date.getTime() + n * MINUTE_MS);
}

/** Понедельник 00:00 по Москве для недели, содержащей дату. */
export function startOfMskWeek(date: Date): Date {
  const day = startOfMskDay(date);
  return addDays(day, -mskParts(day).wd);
}

/** «2026-11-06» по Москве */
export function dayKey(date: Date): string {
  const p = mskParts(date);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Обратное к dayKey; null, если строка некорректна. */
export function parseDayKey(key: string | undefined | null): Date | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return mskDate(y, m - 1, d);
}

export function isSameMskDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function diffDays(from: Date, to: Date): number {
  return Math.round((startOfMskDay(to).getTime() - startOfMskDay(from).getTime()) / DAY_MS);
}

// ───────────── Форматирование (Intl с явной таймзоной, одинаково на сервере и в браузере) ─────────────
// Последний аргумент locale необязателен: по умолчанию русский, для английского интерфейса передайте "en".

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions, locale: Locale = "ru"): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlTag(locale), { timeZone: TZ, ...opts });
    cache.set(key, f);
  }
  return f;
}

/** 09:00 */
export const formatTime = (d: Date, locale: Locale = "ru") => fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, locale).format(d);
/** 6 ноября / 6 November */
export const formatDayMonth = (d: Date, locale: Locale = "ru") => fmt({ day: "numeric", month: "long" }, locale).format(d);
/** 6 нояб. / 6 Nov */
export const formatDayMonthShort = (d: Date, locale: Locale = "ru") => fmt({ day: "numeric", month: "short" }, locale).format(d).replace(".", "");
/** 6 ноября 2026 без «г.» / 6 November 2026 */
export const formatDateLong = (d: Date, locale: Locale = "ru") =>
  fmt({ day: "numeric", month: "long", year: "numeric" }, locale).format(d).replace(/\s?г\.$/, "");
/** 06.11.2026 / 06/11/2026 */
export const formatDateNumeric = (d: Date, locale: Locale = "ru") => fmt({ day: "2-digit", month: "2-digit", year: "numeric" }, locale).format(d);
/** пятница / Friday */
export const formatWeekday = (d: Date, locale: Locale = "ru") => fmt({ weekday: "long" }, locale).format(d);
/** 6 ноября, 14:35 */
export const formatDateTime = (d: Date, locale: Locale = "ru") => `${formatDayMonth(d, locale)}, ${formatTime(d, locale)}`;
/** ноябрь 2026 / November 2026 */
export const formatMonthYear = (d: Date, locale: Locale = "ru") => fmt({ month: "long", year: "numeric" }, locale).format(d);

export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
export const WEEKDAYS_LONG = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"] as const;
export const WEEKDAYS_SHORT_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAYS_LONG_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const WEEKDAYS_ACC = ["в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу", "в воскресенье"];

/** Короткие дни недели на нужном языке (0 = понедельник) */
export const weekdaysShort = (locale: Locale = "ru") => (locale === "en" ? WEEKDAYS_SHORT_EN : WEEKDAYS_SHORT);

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** «сегодня», «завтра», «послезавтра», «в понедельник», «12 ноября» / today, tomorrow, on Monday, 12 November */
export function relativeDayLabel(date: Date, now: Date = new Date(), locale: Locale = "ru"): string {
  const diff = diffDays(now, date);
  if (locale === "en") {
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff === -1) return "yesterday";
    if (diff > 1 && diff < 7) return `on ${WEEKDAYS_LONG_EN[mskParts(date).wd]}`;
    return formatDayMonth(date, "en");
  }
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === 2) return "послезавтра";
  if (diff === -1) return "вчера";
  if (diff > 2 && diff < 7) return WEEKDAYS_ACC[mskParts(date).wd];
  return formatDayMonth(date);
}

/** «через 25 мин», «через 3 ч», «через 4 дня», «2 ч назад» / in 25 min, 2 h ago */
export function relativeTime(date: Date, now: Date = new Date(), locale: Locale = "ru"): string {
  const diffMin = Math.round((date.getTime() - now.getTime()) / MINUTE_MS);
  const abs = Math.abs(diffMin);
  const future = diffMin >= 0;
  const en = locale === "en";
  let text: string;
  if (abs < 1) return en ? "now" : "сейчас";
  if (abs < 60) text = `${abs} ${en ? "min" : "мин"}`;
  else if (abs < 60 * 24) {
    const h = Math.round(abs / 60);
    text = `${h} ${en ? "h" : "ч"}`;
  } else {
    const d = Math.round(abs / (60 * 24));
    text = en ? `${d} ${d === 1 ? "day" : "days"}` : `${d} ${plural(d, "день", "дня", "дней")}`;
  }
  if (en) return future ? `in ${text}` : `${text} ago`;
  return future ? `через ${text}` : `${text} назад`;
}

/** Длительность «1 ч 20 мин» / «25 мин» / 1 h 20 min */
export function formatDuration(minutes: number, locale: Locale = "ru"): string {
  const m = Math.max(0, Math.round(minutes));
  const [h_, min_] = locale === "en" ? ["h", "min"] : ["ч", "мин"];
  if (m < 60) return `${m} ${min_}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} ${h_} ${rest} ${min_}` : `${h} ${h_}`;
}

/** Время приветствия по Москве */
export function greeting(now: Date = new Date(), locale: Locale = "ru"): string {
  const h = mskParts(now).h;
  if (locale === "en") {
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}
