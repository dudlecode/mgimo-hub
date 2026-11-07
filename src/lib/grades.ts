// Балльно-рейтинговая система, ДЕМО-правила.
// Полный текст положения МГИМО об академическом рейтинге публично недоступен
// (docs/research/mgimo-facts.md, п. 4), поэтому правила вынесены сюда и легко меняются под реальные.

import type { ControlType } from "@/db/schema";
import type { Locale } from "@/lib/i18n/config";

export const GRADE_RULES = {
  semesterMax: 60,
  examMax: 40,
  /** допуск к экзамену/зачёту */
  admissionMin: 30,
  /** «автомат», можно получить итог без экзамена */
  autoMin: 54,
  excellent: 90,
  good: 75,
  satisfactory: 60,
  passMin: 60,
  activityBonusMax: 5,
} as const;

export type Mark = "5" | "4" | "3" | "2" | "pass" | "fail";

export const CONTROL_LABEL: Record<ControlType, string> = {
  exam: "Экзамен",
  credit: "Зачёт",
  diff_credit: "Диф. зачёт",
};

// Английские подписи наложением: русские константы читает кабинет сотрудника, они не меняются.
export const CONTROL_LABEL_EN: Record<ControlType, string> = {
  exam: "Exam",
  credit: "Credit",
  diff_credit: "Graded credit",
};

export const controlLabel = (control: ControlType, locale: Locale = "ru") => (locale === "en" ? CONTROL_LABEL_EN : CONTROL_LABEL)[control];

export function markFromPoints(points: number, control: ControlType): Mark {
  if (control === "credit") return points >= GRADE_RULES.passMin ? "pass" : "fail";
  if (points >= GRADE_RULES.excellent) return "5";
  if (points >= GRADE_RULES.good) return "4";
  if (points >= GRADE_RULES.satisfactory) return "3";
  return "2";
}

export const MARK_LABEL: Record<Mark, string> = {
  "5": "отлично",
  "4": "хорошо",
  "3": "удовл.",
  "2": "неуд.",
  pass: "зачтено",
  fail: "не зачтено",
};

export const MARK_LABEL_EN: Record<Mark, string> = {
  "5": "excellent",
  "4": "good",
  "3": "satisfactory",
  "2": "fail",
  pass: "pass",
  fail: "fail",
};

export const markLabel = (mark: Mark, locale: Locale = "ru") => (locale === "en" ? MARK_LABEL_EN : MARK_LABEL)[mark];

export function isFailing(mark: string) {
  return mark === "2" || mark === "fail";
}

/** Числовое значение для среднего балла (зачёты не учитываются). */
export function markValue(mark: string): number | null {
  if (mark === "5" || mark === "4" || mark === "3" || mark === "2") return Number(mark);
  return null;
}

export type CourseStanding = "excellent" | "good" | "ok" | "risk" | "critical";

export const STANDING_META: Record<CourseStanding, { label: string; tone: "success" | "brand" | "neutral" | "warning" | "danger" }> = {
  excellent: { label: "Идёт на «отлично»", tone: "success" },
  good: { label: "Идёт на «хорошо»", tone: "brand" },
  ok: { label: "Идёт на «удовл.»", tone: "neutral" },
  risk: { label: "Есть риск", tone: "warning" },
  critical: { label: "Под угрозой допуск", tone: "danger" },
};

const STANDING_EN: Record<CourseStanding, { label: string; short: string }> = {
  excellent: { label: "On track for excellent", short: "Excellent" },
  good: { label: "On track for good", short: "Good" },
  ok: { label: "On track for satisfactory", short: "Satisfactory" },
  risk: { label: "At risk", short: "At risk" },
  critical: { label: "Admission at risk", short: "Admission at risk" },
};

/** Состояние дисциплины на языке интерфейса. short: для колонки «Прогноз» («отлично» вместо «Идёт на «отлично»»). */
export function standingMeta(standing: CourseStanding, locale: Locale = "ru") {
  const ru = STANDING_META[standing];
  if (locale === "en") return { ...ru, ...STANDING_EN[standing] };
  return { ...ru, short: ru.label.replace("Идёт на ", "") };
}

/**
 * Состояние дисциплины в текущем семестре.
 * earned, набрано; possible, сколько можно было набрать к сегодняшнему дню (по прошедшим и проверенным точкам).
 */
export function courseProgress(earned: number, possible: number) {
  const ratio = possible > 0 ? earned / possible : 0;
  const projectedSemester = Math.round(ratio * GRADE_RULES.semesterMax);
  const projectedTotal = Math.round(ratio * 100);
  let standing: CourseStanding;
  if (possible === 0) standing = "good";
  else if (projectedSemester < GRADE_RULES.admissionMin) standing = "critical";
  else if (ratio < 0.6) standing = "risk";
  else if (ratio >= 0.9) standing = "excellent";
  else if (ratio >= 0.75) standing = "good";
  else standing = "ok";
  return { ratio, projectedSemester, projectedTotal, standing };
}

/** Сколько нужно набрать на экзамене (из 40), чтобы получить порог. null, недостижимо. */
export function neededOnExam(semesterPoints: number, threshold: number): number | null {
  const need = Math.max(0, Math.ceil(threshold - semesterPoints));
  return need > GRADE_RULES.examMax ? null : need;
}

/** Академический рейтинг в % (демо): средний итоговый балл + надбавка за активность (≤ 5 %). */
export function ratingPercent(avgPoints: number, bonus: number): number {
  return Math.min(100, Math.round((avgPoints + Math.min(bonus, GRADE_RULES.activityBonusMax)) * 10) / 10);
}
