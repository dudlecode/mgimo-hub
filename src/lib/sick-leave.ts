// Больничный: общие правила и подписи. Без обращения к БД, можно импортировать и в клиентские компоненты.
import type { SickLeaveStatus } from "@/db/schema";
import type { BadgeTone } from "@/components/ui/badge";
import { addDays, dayKey, formatDayMonth, parseDayKey } from "@/lib/time";

/** Сообщить о болезни можно не раньше чем за столько дней до сегодня */
export const SICK_MAX_PAST_DAYS = 30;
/** Дедлайны, которые попадают в период болезни или в столько дней после него */
export const SICK_DEADLINE_GRACE_DAYS = 3;
/** Справка: до 5 МБ */
export const SICK_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const SICK_FILE_ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

export const SICK_STATUS: Record<SickLeaveStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "Болеет", tone: "brand" },
  submitted: { label: "На проверке", tone: "warning" },
  approved: { label: "Засчитан", tone: "success" },
  rejected: { label: "Отклонён", tone: "danger" },
};

/** «4 ноября» из «2026-11-04» */
export function dayLabel(key: string): string {
  const d = parseDayKey(key);
  return d ? formatDayMonth(d) : key;
}

/** «с 3 по 7 ноября», «с 28 октября по 3 ноября», «3 ноября» */
export function periodLabel(startsOn: string, endsOn: string | null): string {
  if (!endsOn) return `с ${dayLabel(startsOn)}`;
  if (startsOn === endsOn) return dayLabel(startsOn);
  const [sy, sm] = startsOn.split("-");
  const [ey, em] = endsOn.split("-");
  const start = sy === ey && sm === em ? String(Number(startsOn.slice(8, 10))) : dayLabel(startsOn);
  return `с ${start} по ${dayLabel(endsOn)}`;
}

/** Сегодня по Москве, «2026-11-06» */
export function todayKeyMsk(now: Date = new Date()): string {
  return dayKey(now);
}

/** Самый ранний день, с которого можно сообщить о болезни */
export function earliestStartKey(now: Date = new Date()): string {
  return dayKey(addDays(now, -SICK_MAX_PAST_DAYS));
}

/** Сколько календарных дней в периоде, включая оба конца */
export function periodDays(startsOn: string, endsOn: string): number {
  const a = parseDayKey(startsOn);
  const b = parseDayKey(endsOn);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}
