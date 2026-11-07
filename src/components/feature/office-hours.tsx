import { mskParts } from "@/lib/time";
import type { Locale } from "@/lib/i18n/config";
import { defineMessages } from "@/lib/i18n/define";
import { localizeOfficeHours } from "@/lib/i18n/messages/common";
import { cn } from "@/lib/utils";

const DAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const messages = defineMessages(
  {
    lunch: "Обед",
    openUntil: (t: string) => `Открыто до ${t}`,
    lunchUntil: (t: string) => `Обед до ${t}`,
    opensToday: (t: string) => `Закрыто, откроется в ${t}`,
    opensTomorrow: (t: string) => `Закрыто, откроется завтра в ${t}`,
    opensOn: (day: number, t: string) => `Закрыто, откроется ${["в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу", "в воскресенье"][day]} в ${t}`,
    today: "сегодня",
  },
  {
    lunch: "Lunch",
    openUntil: (t) => `Open until ${t}`,
    lunchUntil: (t) => `Lunch break until ${t}`,
    opensToday: (t) => `Closed, opens at ${t}`,
    opensTomorrow: (t) => `Closed, opens tomorrow at ${t}`,
    opensOn: (day, t) => `Closed, opens on ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day]} at ${t}`,
    today: "today",
  },
);

type Range = { from: number; to: number };
type Row = { label: string; days: number[]; range: Range; text: string };
type Parsed = { rows: Row[]; lunch: (Range & { text: string }) | null };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** «Пн-Чт 10:00-17:00, Пт 10:00-16:00, обед 13:00-14:00» в строки по дням. Непонятный формат: null, тогда показываем как есть. */
export function parseOfficeHours(raw: string): Parsed | null {
  const rows: Row[] = [];
  let lunch: Parsed["lunch"] = null;
  for (const part of raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const m = part.match(/^(.+?)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const [, who, a, b] = m;
    const range = { from: toMin(a), to: toMin(b), text: `${a}-${b}` };
    if (/^обед$/i.test(who)) {
      lunch = range;
      continue;
    }
    const span = who.match(/^(Пн|Вт|Ср|Чт|Пт|Сб|Вс)(?:\s*[-–]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс))?$/);
    if (!span) return null;
    const start = DAYS_RU.indexOf(span[1]);
    const end = span[2] ? DAYS_RU.indexOf(span[2]) : start;
    if (end < start) return null;
    rows.push({ label: who, days: Array.from({ length: end - start + 1 }, (_, i) => start + i), range, text: range.text });
  }
  return rows.length ? { rows, lunch } : null;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function status(p: Parsed, now: Date, locale: Locale): { text: string; tone: "open" | "pause" | "closed" } {
  const t = messages[locale];
  const { wd, h, min } = mskParts(now);
  const cur = h * 60 + min;
  const rowFor = (day: number) => p.rows.find((r) => r.days.includes(day));
  const today = rowFor(wd);
  if (today && cur >= today.range.from && cur < today.range.to) {
    if (p.lunch && cur >= p.lunch.from && cur < p.lunch.to) return { text: t.lunchUntil(hhmm(p.lunch.to)), tone: "pause" };
    return { text: t.openUntil(hhmm(today.range.to)), tone: "open" };
  }
  if (today && cur < today.range.from) return { text: t.opensToday(hhmm(today.range.from)), tone: "closed" };
  for (let i = 1; i <= 7; i++) {
    const day = (wd + i) % 7;
    const next = rowFor(day);
    if (next) return { text: i === 1 ? t.opensTomorrow(hhmm(next.range.from)) : t.opensOn(day, hhmm(next.range.from)), tone: "closed" };
  }
  return { text: "", tone: "closed" };
}

/** Часы работы офиса: строки по дням, сегодняшняя выделена, сверху «Открыто до 17:00» по московскому времени. */
export function OfficeHours({ value, locale, now = new Date(), className }: { value: string; locale: Locale; now?: Date; className?: string }) {
  const parsed = parseOfficeHours(value);
  if (!parsed) return <span className={className}>{localizeOfficeHours(value, locale)}</span>;
  const t = messages[locale];
  const st = status(parsed, now, locale);
  const wd = mskParts(now).wd;
  const dayLabel = (r: Row) => (locale === "en" ? (r.days.length > 1 ? `${DAYS_EN[r.days[0]]}-${DAYS_EN[r.days[r.days.length - 1]]}` : DAYS_EN[r.days[0]]) : r.label);

  return (
    <div className={className}>
      {st.text && (
        <div className={cn("mb-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium", st.tone === "open" ? "text-success" : st.tone === "pause" ? "text-warning" : "text-ink-3")}>
          <span className={cn("size-1.5 rounded-full bg-current", st.tone === "open" && "live-dot")} aria-hidden />
          {st.text}
        </div>
      )}
      <dl className="space-y-1 text-[14px]">
        {parsed.rows.map((r) => {
          const isToday = r.days.includes(wd);
          return (
            <div key={r.label} className="flex items-baseline justify-between gap-4">
              <dt className={cn(isToday ? "font-medium text-ink" : "text-ink-2")}>
                {dayLabel(r)}
                {isToday && <span className="ml-1.5 text-[12px] font-normal text-ink-3">{t.today}</span>}
              </dt>
              <dd className={cn("font-mono tabular", isToday ? "text-ink" : "text-ink-2")}>{r.text}</dd>
            </div>
          );
        })}
        {parsed.lunch && (
          <div className="flex items-baseline justify-between gap-4 text-ink-3">
            <dt>{t.lunch}</dt>
            <dd className="font-mono tabular">{parsed.lunch.text}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
