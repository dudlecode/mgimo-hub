// Запись на приём в учебный офис: часы работы, темы и расчёт слотов.
// Чистые функции без БД: используются сервером (проверка записи), сидом и подписями в интерфейсе.
// Часы совпадают с faculties.officeHours: Пн-Чт 10:00-17:00, Пт 10:00-16:00, обед 13:00-14:00.
import { isHoliday } from "./academic";
import { addDays, dayKey, formatTime, mskDate, mskParts, MINUTE_MS, startOfMskDay } from "./time";

export const SLOT_MIN = 15;
/** Сколько рабочих дней вперёд открыта запись */
export const BOOKING_DAYS = 10;
/** Записаться можно не раньше чем за час до начала */
export const LEAD_MIN = 60;
/** Активных записей у студента одновременно */
export const MAX_ACTIVE_APPOINTMENTS = 2;
export const COMMENT_MAX = 300;

/** Часы работы по дням недели (0 = понедельник), минуты от полуночи по Москве. null, офис закрыт. */
const OPEN: Record<number, [number, number] | null> = {
  0: [600, 1020],
  1: [600, 1020],
  2: [600, 1020],
  3: [600, 1020],
  4: [600, 960],
  5: null,
  6: null,
};
const LUNCH: [number, number] = [780, 840];

export const APPOINTMENT_TOPICS = [
  { value: "certificate", label: "Справка или выписка", hint: "Бумажная справка с печатью, архивная справка, выписка оценок" },
  { value: "documents", label: "Пересдача и документы", hint: "Направление на пересдачу, заявления, подписи и копии" },
  { value: "plan", label: "Учебный план", hint: "Индивидуальный план, перезачёт, выбор дисциплин" },
  { value: "scholarship", label: "Стипендия и выплаты", hint: "Повышенная стипендия, материальная помощь, компенсации" },
  { value: "mobility", label: "Обмен и стажировки", hint: "Академическая мобильность, практика, документы для поездки" },
  { value: "other", label: "Другой вопрос", hint: "Коротко опишите его в комментарии" },
] as const;

export type AppointmentTopic = (typeof APPOINTMENT_TOPICS)[number]["value"];
export const TOPIC_VALUES = APPOINTMENT_TOPICS.map((t) => t.value) as [AppointmentTopic, ...AppointmentTopic[]];

export function topicLabel(value: string): string {
  return APPOINTMENT_TOPICS.find((t) => t.value === value)?.label ?? "Другой вопрос";
}

export const APPOINTMENT_STATUS_LABEL = {
  booked: "Записаны",
  done: "Приём состоялся",
  no_show: "Неявка",
  cancelled: "Отменена",
} as const;

export function isOfficeDay(day: Date): boolean {
  return OPEN[mskParts(day).wd] !== null && !isHoliday(day);
}

/** Все слоты дня по часам работы офиса (без учёта занятости и текущего времени). */
export function daySlots(day: Date): Date[] {
  if (!isOfficeDay(day)) return [];
  const hours = OPEN[mskParts(day).wd];
  if (!hours) return [];
  const p = mskParts(day);
  const out: Date[] = [];
  for (let m = hours[0]; m + SLOT_MIN <= hours[1]; m += SLOT_MIN) {
    if (m + SLOT_MIN > LUNCH[0] && m < LUNCH[1]) continue;
    out.push(mskDate(p.y, p.m, p.d, Math.floor(m / 60), m % 60));
  }
  return out;
}

/** Слот ещё можно занять по времени: начинается не раньше чем через LEAD_MIN минут. */
export function isSlotOpen(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() >= now.getTime() + LEAD_MIN * MINUTE_MS;
}

/** Ближайшие рабочие дни офиса, на которые открыта запись. Сегодня входит, если в нём ещё остались слоты. */
export function bookingDays(now: Date, n = BOOKING_DAYS): Date[] {
  const out: Date[] = [];
  let d = startOfMskDay(now);
  for (let guard = 0; out.length < n && guard < 60; guard++, d = addDays(d, 1)) {
    if (!isOfficeDay(d)) continue;
    if (out.length === 0 && dayKey(d) === dayKey(now) && !daySlots(d).some((t) => isSlotOpen(t, now))) continue;
    out.push(d);
  }
  return out;
}

/** Строгая проверка времени, пришедшего от клиента: рабочий день из окна записи, ровно начало слота, не раньше чем через час. */
export function isBookableSlot(startsAt: Date, now: Date): boolean {
  if (Number.isNaN(startsAt.getTime()) || !isSlotOpen(startsAt, now)) return false;
  const key = dayKey(startsAt);
  const day = bookingDays(now).find((d) => dayKey(d) === key);
  if (!day) return false;
  return daySlots(day).some((t) => t.getTime() === startsAt.getTime());
}

/** 10:15-10:30 */
export function slotRange(startsAt: Date, durationMin = SLOT_MIN): string {
  return `${formatTime(startsAt)}-${formatTime(new Date(startsAt.getTime() + durationMin * MINUTE_MS))}`;
}

/** Слоты до и после обеда, для подписи в сетке */
export function isBeforeLunch(startsAt: Date): boolean {
  const p = mskParts(startsAt);
  return p.h * 60 + p.min < LUNCH[0];
}

// Без похожих символов (0/O, 1/I/L), чтобы код талона можно было продиктовать.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Код талона: 6 символов, формат K7P-3QX. Уникальность гарантирует индекс в БД. */
export function randomAppointmentCode(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 2) out += "-";
  }
  return out;
}
