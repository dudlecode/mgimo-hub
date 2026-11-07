import type { Metadata } from "next";
import Link from "next/link";
import { SegmentedLinks } from "@/components/motion/segmented-links";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Coffee, GraduationCap } from "lucide-react";
import { getMyLessons } from "@/lib/data/schedule";
import { getMyOpenSickLeave } from "@/lib/data/sick-leave";
import { getSemester, parityLabel, semesterLabel, weekOfSemester } from "@/lib/academic";
import { addDays, dayKey, formatDayMonth, mskParts, parseDayKey, startOfMskDay, startOfMskWeek, WEEKDAYS_LONG, WEEKDAYS_LONG_EN, weekdaysShort, isSameMskDay } from "@/lib/time";
import { LessonCard } from "@/components/feature/lesson";
import { SwipeNav } from "@/components/feature/swipe-nav";
import { PageHeader } from "@/components/ui/card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { scheduleMessages } from "@/lib/i18n/messages/schedule";
import type { Locale } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(scheduleMessages)).title };
}

const weekdayLong = (d: Date, locale: Locale) => (locale === "en" ? WEEKDAYS_LONG_EN : WEEKDAYS_LONG)[mskParts(d).wd];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ day?: string; view?: string }> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getMessages(scheduleMessages);
  const now = new Date();
  const today = startOfMskDay(now);
  let selected = parseDayKey(sp.day) ?? today;
  // по воскресеньям по умолчанию показываем понедельник
  if (!sp.day && mskParts(today).wd === 6) selected = addDays(today, 1);
  const view = sp.view === "week" ? "week" : "day";

  const weekStart = startOfMskWeek(selected);
  const weekEnd = addDays(weekStart, 7);
  const [lessons, sick] = await Promise.all([getMyLessons(weekStart, weekEnd), getMyOpenSickLeave()]);

  const sem = getSemester(selected);
  const wk = weekOfSemester(selected, sem);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const visibleDays = days.filter((d, i) => i < 6 || lessons.some((l) => isSameMskDay(l.startsAt, d)));
  const byDay = (d: Date) => lessons.filter((l) => isSameMskDay(l.startsAt, d));

  const href = (d: Date, v = view) => `/schedule?day=${dayKey(d)}${v === "week" ? "&view=week" : ""}`;
  const prevDay = addDays(selected, mskParts(selected).wd === 0 ? -2 : -1);
  const nextDay = addDays(selected, mskParts(selected).wd === 5 ? 2 : 1);
  const isThisWeek = isSameMskDay(weekStart, startOfMskWeek(today));
  const dayLessons = byDay(selected);

  const weekHasChanges = visibleDays.some((d) => byDay(d).some((l) => l.status !== "scheduled"));

  return (
    <div>
      <PageHeader
        title={t.title}
        subtitle={wk.inSemester ? t.weekLine(wk.week, parityLabel(wk.parity, locale)) : semesterLabel(sem, locale)}
        actions={
          <ButtonLink href="/api/calendar" variant="outline" size="sm" prefetch={false} aria-label={t.calendarAria}>
            <CalendarPlus className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t.calendar}</span>
            <span className="sm:hidden">.ics</span>
          </ButtonLink>
        }
      />

      {sick && (
        <p className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-ctl border border-line bg-surface-1 px-4 py-2.5 text-[13px] text-ink-2">
          {t.sick(sickStart(sick.startsOn, locale))}
          <Link href="/sick-leave" className="font-medium text-brand-fg hover:underline">
            {t.closeSick}
          </Link>
        </p>
      )}

      {/* Неделя + режим */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="flex items-center gap-0.5">
          <Link href={href(addDays(weekStart, -7))} className="grid size-9 place-items-center rounded-[8px] text-ink-2 transition-colors hover:bg-surface-2" aria-label={t.prevWeek}>
            <ChevronLeft className="size-5" strokeWidth={1.8} />
          </Link>
          <div className="min-w-[104px] text-center text-[15px] font-semibold tabular">
            {formatDayMonth(weekStart, locale).split(" ")[0]}-{formatDayMonth(addDays(weekStart, 5), locale)}
          </div>
          <Link href={href(addDays(weekStart, 7))} className="grid size-9 place-items-center rounded-[8px] text-ink-2 transition-colors hover:bg-surface-2" aria-label={t.nextWeek}>
            <ChevronRight className="size-5" strokeWidth={1.8} />
          </Link>
          {!isThisWeek && (
            <Link href={href(today)} className="ml-1 rounded-[7px] border border-line px-2.5 py-1 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              {t.today}
            </Link>
          )}
        </div>
        <SegmentedLinks id="schedule-view" items={(["day", "week"] as const).map((v) => ({ href: href(selected, v), label: v === "day" ? t.day : t.week, active: view === v }))} />
      </div>

      {/* Полоса дней */}
      <div className={cn("scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0", weekHasChanges ? "mb-2.5" : "mb-5", view === "week" && "hidden")}>
        {visibleDays.map((d) => {
          const isSel = isSameMskDay(d, selected);
          const isToday = isSameMskDay(d, today);
          const dl = byDay(d);
          const count = dl.filter((l) => l.status !== "cancelled" && !l.movedAway).length;
          const hasChange = dl.some((l) => l.status !== "scheduled");
          return (
            <Link
              key={d.toISOString()}
              href={href(d)}
              scroll={false}
              aria-current={isSel ? "date" : undefined}
              className={cn(
                "relative flex min-w-[52px] flex-1 flex-col items-center rounded-[10px] border px-2 py-2.5 transition-colors",
                isSel ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <span className={cn("text-[12px] font-medium", isSel ? "text-brand-ink/75" : isToday ? "text-brand-fg" : "text-ink-3")}>{weekdaysShort(locale)[mskParts(d).wd]}</span>
              <span className="mt-0.5 text-[18px] font-semibold tabular">{mskParts(d).d}</span>
              <span className="mt-1 flex h-1.5 items-center gap-0.5">
                {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
                  <span key={i} className={cn("size-1 rounded-full", isSel ? "bg-brand-ink/70" : "bg-ink-3/50")} />
                ))}
              </span>
              {/* на синем выбранном дне оранжевая точка теряется: белая обводка держит её на виду */}
              {hasChange && (
                <span className={cn("absolute top-1.5 right-1.5 size-2.5 rounded-full border-2 bg-warning", isSel ? "border-brand-ink" : "border-surface")} title={t.hasChanges}>
                  <span className="sr-only">{t.hasChanges}</span>
                </span>
              )}
              {isToday && !isSel && <span className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-brand" aria-hidden />}
            </Link>
          );
        })}
      </div>

      {weekHasChanges && view === "day" && (
        <p className="mb-5 flex items-center gap-1.5 text-[12px] text-ink-3">
          <span className="size-2 rounded-full bg-warning" aria-hidden />
          {t.changesLegend}
        </p>
      )}

      {view === "day" ? (
        <SwipeNav prevHref={href(prevDay)} nextHref={href(nextDay)}>
          <h2 className="mb-3 text-[15px] font-semibold text-ink-2">
            <span className="capitalize">{weekdayLong(selected, locale)}</span>, {formatDayMonth(selected, locale)}
            {isSameMskDay(selected, today) && <span className="ml-2 text-brand-fg">{t.todayInline}</span>}
          </h2>
          {dayLessons.length ? (
            <Card className="divide-y divide-line stagger-rows">
              {dayLessons.map((l) => (
                <LessonCard key={l.id} lesson={l} now={now} locale={locale} />
              ))}
            </Card>
          ) : (
            <Card>
              <DayEmpty date={selected} inSemester={wk.inSemester} t={t} />
            </Card>
          )}
          <p className="mt-3 text-[12px] text-ink-3 lg:hidden">{t.swipeHint}</p>
        </SwipeNav>
      ) : (
        <div className="space-y-10">
          {visibleDays.map((d) => {
            const dl = byDay(d);
            return (
              <section key={d.toISOString()} id={dayKey(d)}>
                <h2 className={cn("sticky top-14 z-10 -mx-4 mb-2.5 bg-bg/90 px-4 py-1.5 text-[15px] font-semibold backdrop-blur lg:top-0", isSameMskDay(d, today) ? "text-brand-fg" : "text-ink-2")}>
                  <span className="capitalize">{weekdayLong(d, locale)}</span>, {formatDayMonth(d, locale)}
                  {isSameMskDay(d, today) && ` · ${t.todayInline}`}
                </h2>
                {dl.length ? (
                  <Card className="divide-y divide-line stagger-rows">
                    {dl.map((l) => (
                      <LessonCard key={l.id} lesson={l} now={now} locale={locale} />
                    ))}
                  </Card>
                ) : (
                  <p className="rounded-[10px] border border-dashed border-line px-5 py-4 text-[14px] text-ink-3">{t.noLessons}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Начало больничного «3 ноября» / «3 November» (ключ дня «2026-11-03») */
function sickStart(key: string, locale: Locale) {
  const d = parseDayKey(key);
  return d ? formatDayMonth(d, locale) : key;
}

function DayEmpty({ date, inSemester, t }: { date: Date; inSemester: boolean; t: (typeof scheduleMessages)["ru"] }) {
  if (!inSemester) {
    return (
      <EmptyState
        icon={GraduationCap}
        title={t.offSemester}
        text={t.offSemesterText}
        action={
          <ButtonLink href="/grades?tab=session" variant="secondary" size="sm">
            {t.openSession}
          </ButtonLink>
        }
      />
    );
  }
  const wd = mskParts(date).wd;
  return <EmptyState icon={wd >= 5 ? Coffee : CalendarDays} title={wd >= 5 ? t.weekend : t.noLessons} text={wd >= 5 ? t.weekendText : t.freeDayText} />;
}
