import type { LessonView } from "@/lib/data/schedule";
import type { BadgeTone } from "@/components/ui/badge";
import type { Locale } from "@/lib/i18n/config";
import { lessonMessages } from "@/lib/i18n/messages/schedule";
import { formatDayMonth, formatTime, mskParts, weekdaysShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { codeName, personName } from "@/lib/i18n/translit";

/** Подписи форматов на русском (для совместимости); на языке интерфейса: formatLabel(format, locale) */
export const FORMAT_LABEL = lessonMessages.ru.format;

export const formatLabel = (format: LessonView["format"], locale: Locale = "ru") => lessonMessages[locale].format[format];

/** «пн 9 ноября, 12:55» / «Mon 9 November, 12:55» */
export function shortWhen(d: Date, locale: Locale = "ru") {
  const wd = weekdaysShort(locale)[mskParts(d).wd];
  return `${locale === "en" ? wd : wd.toLowerCase()} ${formatDayMonth(d, locale)}, ${formatTime(d, locale)}`;
}

export type LessonChange = { tone: BadgeTone; label: string; detail: string };

export function lessonChange(l: LessonView, locale: Locale = "ru"): LessonChange | null {
  const t = lessonMessages[locale];
  if (l.movedAway) return { tone: "warning", label: t.moved, detail: l.movedTo ? t.movedTo(shortWhen(l.movedTo, locale)) : t.movedElsewhere };
  switch (l.status) {
    case "cancelled":
      return { tone: "danger", label: t.cancelled, detail: t.noClass };
    case "moved":
      return { tone: "warning", label: t.moved, detail: l.prevStartsAt ? t.movedFrom(shortWhen(l.prevStartsAt, locale)) : t.newTime };
    case "room_changed":
      return { tone: "warning", label: t.roomChanged, detail: t.roomInstead(l.room, l.prevRoom ?? "") };
    case "teacher_changed":
      return { tone: "info", label: t.substitute, detail: t.taughtBy(personName(l.substituteTeacher ?? "", locale)) };
    default:
      return null;
  }
}

const toneText: Record<string, string> = { danger: "text-danger", warning: "text-warning", info: "text-brand-fg", neutral: "text-ink-3" };

/** Строка занятия для расписания (внутри общего списка с разделителями) */
export function LessonCard({ lesson: l, now, locale = "ru" }: { lesson: LessonView; now: Date; locale?: Locale }) {
  const t = lessonMessages[locale];
  const change = lessonChange(l, locale);
  const live = l.startsAt <= now && l.endsAt > now && l.status !== "cancelled" && !l.movedAway;
  const past = l.endsAt < now && !live;
  const muted = l.status === "cancelled" || l.movedAway;
  const teacher = personName(l.status === "teacher_changed" && l.substituteTeacher ? l.substituteTeacher : l.teacher, locale);

  return (
    <article className={cn("relative flex gap-4 px-5 py-4", past && "opacity-55")}>
      {live && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand" aria-hidden />}
      <div className="w-12 shrink-0 font-mono text-[13px] leading-5 tabular">
        <div className={cn("font-medium", live ? "text-brand-fg" : "text-ink", muted && "text-ink-3 line-through")}>{formatTime(l.startsAt, locale)}</div>
        <div className="text-ink-3">{formatTime(l.endsAt, locale)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className={cn("text-[14px] leading-5 font-medium text-ink", muted && "text-ink-3 line-through")}>{l.title}</h3>
          {live && <span className="shrink-0 text-[12px] font-medium text-brand-fg">{t.liveNow}</span>}
          {!live && change && <span className={cn("shrink-0 text-[12px] font-medium", toneText[change.tone])}>{change.label}</span>}
        </div>
        <p className="mt-0.5 text-[13px] leading-5 text-ink-3">
          {t.format[l.format]} · {t.room} <span className={cn("font-mono", l.status === "room_changed" && "font-medium text-warning")}>{l.room}</span>, {l.building} · {teacher}
          {l.langGroup && <> · {codeName(l.langGroup, locale)}</>}
        </p>
        {change && (
          <p className={cn("mt-1 text-[13px] leading-5", toneText[change.tone])}>
            {change.detail.charAt(0).toUpperCase() + change.detail.slice(1)}
            {l.changeNote ? `${change.detail.endsWith(".") ? "" : "."} ${l.changeNote}` : ""}
          </p>
        )}
      </div>
    </article>
  );
}

/** Компактная строка изменения для главного экрана */
export function ChangeRow({ lesson: l, locale = "ru" }: { lesson: LessonView; locale?: Locale }) {
  const c = lessonChange(l, locale);
  if (!c) return null;
  return (
    <div className="flex gap-4 px-5 py-4">
      <span className={cn("w-[74px] shrink-0 text-[13px] font-medium", toneText[c.tone])}>{c.label}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-5 font-medium">{l.title}</div>
        <div className="mt-0.5 text-[13px] leading-5 text-ink-3">
          {shortWhen(l.startsAt, locale)}, {c.detail}
        </div>
      </div>
    </div>
  );
}
