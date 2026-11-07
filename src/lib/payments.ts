// Оплата обучения: статусы платежа, суммы и сумма прописью. Чистые функции, работают и на сервере, и в браузере.
import type { BadgeTone } from "@/components/ui/badge";
import { DAY_MS, diffDays, plural } from "./time";

/** «Скоро срок»: до срока осталось не больше стольких дней */
export const SOON_DAYS = 14;
/** Напоминать об одном платеже не чаще раза в сутки */
export const REMIND_COOLDOWN_MS = DAY_MS;

export type PaymentState = "paid" | "overdue" | "soon" | "upcoming";

export const PAYMENT_STATE_META: Record<PaymentState, { label: string; tone: BadgeTone }> = {
  paid: { label: "Оплачено", tone: "success" },
  overdue: { label: "Просрочено", tone: "danger" },
  soon: { label: "Скоро срок", tone: "warning" },
  upcoming: { label: "К оплате", tone: "neutral" },
};

export function paymentState(p: { dueAt: Date; paidAt: Date | null }, now: Date = new Date()): PaymentState {
  if (p.paidAt) return "paid";
  const left = p.dueAt.getTime() - now.getTime();
  if (left < 0) return "overdue";
  if (left <= SOON_DAYS * DAY_MS) return "soon";
  return "upcoming";
}

/** Сколько календарных дней просрочки (по Москве); 0, если срок не прошёл */
export function overdueDays(dueAt: Date, now: Date = new Date()): number {
  return Math.max(0, diffDays(dueAt, now));
}

/** «сегодня последний день», «остался 1 день», «осталось 9 дней», «просрочено на 4 дня» */
export function dueHint(p: { dueAt: Date; paidAt: Date | null }, now: Date = new Date()): string | null {
  if (p.paidAt) return null;
  if (p.dueAt.getTime() < now.getTime()) {
    const d = Math.max(1, overdueDays(p.dueAt, now));
    return `просрочено на ${d} ${plural(d, "день", "дня", "дней")}`;
  }
  const d = diffDays(now, p.dueAt);
  if (d <= 0) return "сегодня последний день";
  return `${plural(d, "остался", "осталось", "осталось")} ${d} ${plural(d, "день", "дня", "дней")}`;
}

export function canRemind(remindedAt: Date | null, now: Date = new Date()): boolean {
  return !remindedAt || now.getTime() - remindedAt.getTime() >= REMIND_COOLDOWN_MS;
}

// ───────────── Периоды ─────────────

export type SemesterKind = "autumn" | "spring";

/** «Осенний семестр 2026/27»: тот же формат, что у getSemester().label */
export function periodLabel(kind: SemesterKind, academicYear: number): string {
  return `${kind === "autumn" ? "Осенний" : "Весенний"} семестр ${academicYear}/${String(academicYear + 1).slice(2)}`;
}

/** Год начала учебного года из подписи периода: 2026 для «… 2026/27» */
export function periodAcademicYear(period: string): number | null {
  const m = /(\d{4})\/\d{2}\s*$/.exec(period);
  return m ? Number(m[1]) : null;
}

/** «2026/27» */
export function academicYearLabel(academicYear: number): string {
  return `${academicYear}/${String(academicYear + 1).slice(2)}`;
}

/** «за осенний семестр 2026/27» для назначения платежа */
export function periodForPurpose(period: string): string {
  return period.charAt(0).toLowerCase() + period.slice(1);
}

// ───────────── Деньги ─────────────

const NBSP = " ";
const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/** 350 000 ₽ с неразрывными пробелами */
export function formatRub(amount: number): string {
  return `${rub.format(amount).replace(/\s/g, NBSP)}${NBSP}₽`;
}

/** 350 000,00 для бланка квитанции */
export function formatRubPlain(amount: number): string {
  return `${rub.format(amount).replace(/\s/g, NBSP)},00`;
}

const UNITS_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const UNITS_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function triad(n: number, female: boolean): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  if (h) out.push(HUNDREDS[h]);
  if (t === 1) out.push(TEENS[u]);
  else {
    if (t) out.push(TENS[t]);
    if (u) out.push((female ? UNITS_F : UNITS_M)[u]);
  }
  return out;
}

/** «Триста сорок шесть тысяч рублей 00 копеек» */
export function rublesInWords(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  const words: string[] = [];
  const scales: { div: number; forms: [string, string, string]; female: boolean }[] = [
    { div: 1_000_000_000, forms: ["миллиард", "миллиарда", "миллиардов"], female: false },
    { div: 1_000_000, forms: ["миллион", "миллиона", "миллионов"], female: false },
    { div: 1_000, forms: ["тысяча", "тысячи", "тысяч"], female: true },
  ];
  let rest = n;
  for (const sc of scales) {
    const part = Math.floor(rest / sc.div);
    rest %= sc.div;
    if (part) words.push(...triad(part, sc.female), plural(part, ...sc.forms));
  }
  if (rest) words.push(...triad(rest, false));
  const rubles = plural(n, "рубль", "рубля", "рублей");
  const text = words.length ? `${words.join(" ")} ${rubles}` : `ноль ${rubles}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} 00 копеек`;
}
