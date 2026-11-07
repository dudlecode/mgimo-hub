"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LessonView } from "@/lib/data/schedule";
import { formatDuration, formatTime, relativeDayLabel } from "@/lib/time";
import { formatLabel, lessonChange } from "./lesson";
import { cn } from "@/lib/utils";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { nowCardMessages } from "@/lib/i18n/messages/today";
import { personName } from "@/lib/i18n/translit";

function useNow(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

/** Главный блок дня: что идёт сейчас или что следующее. Крупное время, без украшений. */
export function NowCard({ lessons, nextLesson, serverNow }: { lessons: LessonView[]; nextLesson: LessonView | null; serverNow: number }) {
  const now = useNow(serverNow);
  const locale = useLocale();
  const t = useMessages(nowCardMessages);
  const active = lessons.filter((l) => l.status !== "cancelled" && !l.movedAway);
  const live = active.find((l) => l.startsAt.getTime() <= now && l.endsAt.getTime() > now);
  const upcoming = active.find((l) => l.startsAt.getTime() > now);
  const afterLive = live ? active.find((l) => l.startsAt.getTime() >= live.endsAt.getTime()) : null;

  const lesson = live ?? upcoming ?? null;
  let label: string;
  let hint: string | null = null;
  let progress: number | null = null;

  if (live) {
    const left = (live.endsAt.getTime() - now) / 60000;
    progress = 1 - left / ((live.endsAt.getTime() - live.startsAt.getTime()) / 60000);
    label = t.live;
    hint = t.left(formatDuration(left, locale));
  } else if (upcoming) {
    const mins = (upcoming.startsAt.getTime() - now) / 60000;
    label = active.some((l) => l.endsAt.getTime() <= now) ? t.next : t.first;
    hint = mins <= 120 ? t.in(formatDuration(mins, locale)) : null;
  } else {
    label = active.length ? t.over : t.none;
  }

  const change = lesson ? lessonChange(lesson, locale) : null;

  return (
    <section aria-label={t.aria} className="flex h-full flex-col rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-5">
        <span className={cn("inline-flex items-center gap-2 text-[13px] font-medium", live ? "text-brand-fg" : "text-ink-2")}>
          {live && <span className="live-dot size-1.5 rounded-full bg-brand text-brand" aria-hidden />}
          {label}
        </span>
        {hint && <span className="text-[13px] text-ink-3 tabular">{hint}</span>}
      </div>

      {lesson ? (
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
            <div className="font-mono leading-none tabular">
              <span className="font-sans text-[36px] font-semibold tracking-[-0.04em] sm:text-[42px]">{formatTime(lesson.startsAt, locale)}</span>
              <span className="ml-2 text-[15px] text-ink-3">{formatTime(lesson.endsAt, locale)}</span>
            </div>
            <div className="min-w-0 sm:pt-1">
              <h2 className="text-[18px] leading-snug font-semibold tracking-[-0.015em]">{lesson.title}</h2>
              <p className="mt-1 text-[14px] text-ink-3">
                {formatLabel(lesson.format, locale)}, {t.pair(lesson.pairNo)} · {t.room}{" "}
                <span className={cn("font-mono", lesson.status === "room_changed" ? "font-medium text-warning" : "text-ink")}>{lesson.room}</span>, {lesson.building} ·{" "}
                {personName(lesson.status === "teacher_changed" && lesson.substituteTeacher ? lesson.substituteTeacher : lesson.teacher, locale)}
              </p>
              {change && (
                <p className={cn("mt-2 text-[13px] font-medium", change.tone === "danger" ? "text-danger" : change.tone === "info" ? "text-brand-fg" : "text-warning")}>
                  {change.label}: {change.detail}
                  {lesson.changeNote ? `${change.detail.endsWith(".") ? "" : "."} ${lesson.changeNote}` : ""}
                </p>
              )}
            </div>
          </div>
          {progress !== null && (
            <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="bar-grow h-full bg-brand transition-[width] duration-1000" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-5 sm:px-5">
          {nextLesson ? (
            <p className="text-[14px] text-ink-2">
              {t.firstAt(relativeDayLabel(nextLesson.startsAt, new Date(now), locale).replace(/^./, (c) => c.toUpperCase()))}{" "}
              <span className="font-mono font-medium text-ink">{formatTime(nextLesson.startsAt, locale)}</span>: {nextLesson.title}, {t.room} <span className="font-mono">{nextLesson.room}</span>
            </p>
          ) : (
            <p className="text-[14px] text-ink-2">{t.noUpcoming}</p>
          )}
        </div>
      )}

      {(afterLive || lesson) && (
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-[13px] sm:px-5">
          <span className="min-w-0 truncate text-ink-3">
            {afterLive ? (
              <>
                {t.then} <span className="font-mono">{formatTime(afterLive.startsAt, locale)}</span> {afterLive.title}, {t.room} <span className="font-mono">{afterLive.room}</span>
              </>
            ) : (
              t.fullWeek
            )}
          </span>
          <Link href="/schedule" className="shrink-0 font-medium text-ink hover:text-brand-fg">
            {t.week}
          </Link>
        </div>
      )}
    </section>
  );
}
