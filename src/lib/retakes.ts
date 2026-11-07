// Правила пересдач (демо, настраиваются здесь). Модуль без обращений к БД:
// им пользуются и серверный слой данных, и клиентские формы кабинета сотрудника.
import type { ControlType, RetakeStatus } from "@/db/schema";
import { GRADE_RULES, MARK_LABEL, markFromPoints, type Mark } from "@/lib/grades";

export const RETAKE_RULES = {
  /** длительность пересдачи, минут: столько же, сколько пара */
  durationMin: 90,
  /** самое раннее и самое позднее время начала по Москве */
  earliestStart: "09:00",
  latestStart: "18:00",
  /** время по умолчанию в форме: после занятий большинства групп */
  defaultTime: "16:15",
  /** окно подбора даты: через 7-14 дней от сегодня */
  suggestFromDays: 7,
  suggestToDays: 14,
  /** 2: у преподавателя, 3: комиссия; дальше попыток нет */
  maxAttempt: 3,
  commissionMin: { 2: 1, 3: 3 } as Record<number, number>,
  commissionMax: 5,
  noteMax: 300,
} as const;

export type RetakeAttempt = 2 | 3;

export const ATTEMPT_LABEL: Record<RetakeAttempt, string> = {
  2: "вторая, у преподавателя",
  3: "третья, комиссия",
};

export const ATTEMPT_SHORT: Record<RetakeAttempt, string> = {
  2: "попытка 2",
  3: "попытка 3, комиссия",
};

export const RETAKE_STATUS_META: Record<RetakeStatus, { label: string; tone: "brand" | "success" | "danger" | "warning" }> = {
  issued: { label: "Направление выдано", tone: "brand" },
  passed: { label: "Сдал", tone: "success" },
  failed: { label: "Не сдал", tone: "danger" },
  absent: { label: "Не явился", tone: "warning" },
};

/** Итог пересдачи, который вносит сотрудник: оценка при «сдал», «не сдал» или «не явился». */
export type RetakeResult = "5" | "4" | "3" | "pass" | "fail" | "absent";
export const RETAKE_RESULTS = ["5", "4", "3", "pass", "fail", "absent"] as const;

export function resultOptions(control: ControlType): { value: RetakeResult; label: string }[] {
  const passed: { value: RetakeResult; label: string }[] =
    control === "credit"
      ? [{ value: "pass", label: "Сдал: зачтено" }]
      : [
          { value: "5", label: "Сдал: отлично" },
          { value: "4", label: "Сдал: хорошо" },
          { value: "3", label: "Сдал: удовл." },
        ];
  return [...passed, { value: "fail", label: "Не сдал" }, { value: "absent", label: "Не явился" }];
}

/** Нижняя граница баллов для оценки: подставляется, если сотрудник не указал баллы. */
export const PASS_MIN_POINTS: Record<"5" | "4" | "3" | "pass", number> = {
  "5": GRADE_RULES.excellent,
  "4": GRADE_RULES.good,
  "3": GRADE_RULES.satisfactory,
  pass: GRADE_RULES.passMin,
};

export const isPassResult = (r: RetakeResult): r is "5" | "4" | "3" | "pass" => r === "5" || r === "4" || r === "3" || r === "pass";

/** Оценка «не сдал» в зачётке для формы контроля. */
export const failMark = (control: ControlType): Mark => (control === "credit" ? "fail" : "2");

/** Проверка баллов к выбранной оценке. null, если всё сходится. */
export function pointsError(result: RetakeResult, points: number | null, control: ControlType): string | null {
  if (points === null || result === "absent") return null;
  if (isPassResult(result)) {
    if (markFromPoints(points, control) !== result) return `Для «${MARK_LABEL[result]}» баллы не подходят: проверьте оценку или баллы`;
    return null;
  }
  if (points >= GRADE_RULES.passMin) return `При «не сдал» баллов меньше ${GRADE_RULES.passMin}`;
  return null;
}

/** «16:15» в минуты от полуночи; null, если формат неверный. */
export function timeToMinutes(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function referralNumber(year: number, n: number) {
  return `П-${year}-${String(n).padStart(4, "0")}`;
}
