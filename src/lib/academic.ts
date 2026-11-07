// Академический календарь (демо-допущения: публично расписание звонков МГИМО не найдено,
// см. docs/research/mgimo-facts.md, п. 5). Всё настраивается здесь.
import { addDays, DAY_MS, mskDate, mskParts, startOfMskDay, startOfMskWeek } from "./time";
import type { Locale } from "./i18n/config";

export const PAIRS = [
  { no: 1, start: [9, 0], end: [10, 30] },
  { no: 2, start: [10, 40], end: [12, 10] },
  { no: 3, start: [12, 55], end: [14, 25] },
  { no: 4, start: [14, 35], end: [16, 5] },
  { no: 5, start: [16, 15], end: [17, 45] },
  { no: 6, start: [17, 55], end: [19, 25] },
] as const;

export type PairNo = (typeof PAIRS)[number]["no"];

export function pairTimes(day: Date, no: number): { startsAt: Date; endsAt: Date } {
  const p = PAIRS.find((x) => x.no === no) ?? PAIRS[0];
  const d = mskParts(day);
  return {
    startsAt: mskDate(d.y, d.m, d.d, p.start[0], p.start[1]),
    endsAt: mskDate(d.y, d.m, d.d, p.end[0], p.end[1]),
  };
}

/** Праздники без занятий (ММ-ДД) */
export const HOLIDAYS = ["11-04", "01-07", "02-23", "03-08", "05-01", "05-09", "06-12"];

export function isHoliday(date: Date): boolean {
  const p = mskParts(date);
  return HOLIDAYS.includes(`${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`);
}

export const CAMPUSES = {
  vernadsky: { label: "Вернадского", address: "пр. Вернадского, 76", building: "Главный корпус" },
  odintsovo: { label: "Одинцово", address: "Одинцово, ул. Новоспортивная, 3", building: "Кампус Одинцово" },
} as const;

export type Campus = keyof typeof CAMPUSES;

/** Подписи кампусов для английского интерфейса (адреса не переводим, только транслитерация) */
export const CAMPUSES_EN: Record<Campus, { label: string; address: string; building: string }> = {
  vernadsky: { label: "Vernadsky", address: "76 Vernadsky Prospekt", building: "Main building" },
  odintsovo: { label: "Odintsovo", address: "3 Novosportivnaya St, Odintsovo", building: "Odintsovo campus" },
};

export const campusInfo = (campus: Campus, locale: Locale = "ru") => (locale === "en" ? CAMPUSES_EN[campus] : CAMPUSES[campus]);

/** Название корпуса из расписания на языке интерфейса: «Главный корпус», «Main building» */
export function buildingLabel(building: string, locale: Locale = "ru"): string {
  if (locale !== "en") return building;
  const key = (Object.keys(CAMPUSES) as Campus[]).find((k) => CAMPUSES[k].building === building);
  return key ? CAMPUSES_EN[key].building : building;
}

export type SemesterInfo = {
  kind: "autumn" | "spring";
  /** год начала учебного года: 2026 для 2026/27 */
  academicYear: number;
  label: string;
  /** понедельник первой учебной недели */
  firstMonday: Date;
  start: Date;
  end: Date;
  creditWeekStart: Date;
  sessionStart: Date;
  sessionEnd: Date;
};

/** Текущий (или ближайший) семестр для даты. Январь относится к осеннему семестру (сессия). */
export function getSemester(now: Date = new Date()): SemesterInfo {
  const { y, m } = mskParts(now);
  if (m >= 7 || m === 0) {
    const ay = m === 0 ? y - 1 : y;
    const start = mskDate(ay, 8, 1);
    return {
      kind: "autumn",
      academicYear: ay,
      label: `Осенний семестр ${ay}/${String(ay + 1).slice(2)}`,
      firstMonday: startOfMskWeek(start),
      start,
      end: mskDate(ay, 11, 26, 23, 59),
      creditWeekStart: mskDate(ay, 11, 21),
      sessionStart: mskDate(ay + 1, 0, 11),
      sessionEnd: mskDate(ay + 1, 0, 31, 23, 59),
    };
  }
  const ay = y - 1;
  const start = mskDate(y, 1, 9);
  return {
    kind: "spring",
    academicYear: ay,
    label: `Весенний семестр ${ay}/${String(y).slice(2)}`,
    firstMonday: startOfMskWeek(start),
    start,
    end: mskDate(y, 4, 30, 23, 59),
    creditWeekStart: mskDate(y, 4, 25),
    sessionStart: mskDate(y, 5, 8),
    sessionEnd: mskDate(y, 5, 30, 23, 59),
  };
}

/** Номер семестра студента (1..8) */
export function semesterNumber(course: number, kind: SemesterInfo["kind"]): number {
  return (course - 1) * 2 + (kind === "autumn" ? 1 : 2);
}

/** Номер учебной недели (1-based) и её чётность. null, вне семестра. */
export function weekOfSemester(date: Date, sem: SemesterInfo = getSemester(date)) {
  const w = Math.floor((startOfMskWeek(date).getTime() - sem.firstMonday.getTime()) / (7 * DAY_MS)) + 1;
  const inSemester = date.getTime() >= sem.firstMonday.getTime() && date.getTime() <= sem.end.getTime();
  return { week: w, parity: w % 2 === 1 ? ("odd" as const) : ("even" as const), inSemester };
}

export function parityLabel(parity: "odd" | "even", locale: Locale = "ru") {
  if (locale === "en") return parity === "odd" ? "odd" : "even";
  return parity === "odd" ? "нечётная" : "чётная";
}

/** Подпись семестра на языке интерфейса: sem.label всегда русский (его читает кабинет сотрудника) */
export function semesterLabel(sem: SemesterInfo, locale: Locale = "ru") {
  if (locale !== "en") return sem.label;
  return `${sem.kind === "autumn" ? "Autumn" : "Spring"} semester ${sem.academicYear}/${String(sem.academicYear + 1).slice(2)}`;
}

/** Понедельник N-й учебной недели */
export function mondayOfWeek(sem: SemesterInfo, week: number): Date {
  return addDays(sem.firstMonday, (week - 1) * 7);
}

/** Рабочие дни (пн-пт без праздников) */
export function addWorkingDays(from: Date, days: number): Date {
  let d = startOfMskDay(from);
  let left = days;
  while (left > 0) {
    d = addDays(d, 1);
    const wd = mskParts(d).wd;
    if (wd < 5 && !isHoliday(d)) left--;
  }
  const p = mskParts(d);
  return mskDate(p.y, p.m, p.d, 18, 0);
}
