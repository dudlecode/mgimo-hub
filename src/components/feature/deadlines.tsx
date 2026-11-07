"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { DeadlineItem } from "@/lib/data/deadlines";
import { toggleDeadlineAction } from "@/app/(student)/actions";
import { diffDays, formatDayMonth, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useLocale, useMessages } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { deadlineMessages } from "@/lib/i18n/messages/today";

function dueLabel(due: Date, now: Date, locale: Locale) {
  const t = deadlineMessages[locale];
  const d = diffDays(now, due);
  if (due < now) return { text: t.overdue, tone: "danger" as const };
  if (d === 0) return { text: t.today(formatTime(due, locale)), tone: "danger" as const };
  if (d === 1) return { text: t.tomorrow, tone: "warning" as const };
  if (d <= 3) return { text: formatDayMonth(due, locale), tone: "warning" as const };
  return { text: formatDayMonth(due, locale), tone: "neutral" as const };
}

/** limit: сколько пунктов показать сразу, остальные раскрываются кнопкой внизу списка. */
export function DeadlineList({ items, serverNow, limit }: { items: DeadlineItem[]; serverNow: number; limit?: number }) {
  const now = new Date(serverNow);
  const locale = useLocale();
  const t = useMessages(deadlineMessages);
  const [optimistic, setOptimistic] = useOptimistic(items, (state, upd: { id: string; done: boolean }) => state.map((i) => (i.id === upd.id ? { ...i, done: upd.done } : i)));
  const [, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const hidden = limit && !expanded ? Math.max(0, optimistic.length - limit) : 0;
  const shown = hidden ? optimistic.slice(0, limit) : optimistic;

  function toggle(item: DeadlineItem) {
    const done = !item.done;
    start(async () => {
      setOptimistic({ id: item.id, done });
      const res = await toggleDeadlineAction(item.id, done);
      if (!res.ok) toast.error(t.saveError);
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <ul className="divide-y divide-line stagger-rows">
        {shown.map((item) => {
          const due = dueLabel(item.dueAt, now, locale);
          const body = (
            <>
              <div className={cn("text-[14px] leading-5", item.done ? "text-ink-3 line-through" : "text-ink")}>{item.title}</div>
              <div className="mt-0.5 truncate text-[12px] text-ink-3">{item.subtitle ?? t.deanOffice}</div>
            </>
          );
          return (
            <li key={item.id} className="flex items-start gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => toggle(item)}
                role="checkbox"
                aria-checked={item.done}
                aria-label={item.done ? t.undo(item.title) : t.done(item.title)}
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors",
                  item.done ? "border-ink bg-ink text-bg" : "border-line-strong hover:border-ink-3",
                )}
              >
                {item.done && <Check className="pop size-3" strokeWidth={3} aria-hidden />}
              </button>
              {item.href ? (
                <Link href={item.href} className="min-w-0 flex-1 hover:opacity-80">
                  {body}
                </Link>
              ) : (
                <div className="min-w-0 flex-1">{body}</div>
              )}
              <span
                className={cn(
                  "shrink-0 pt-0.5 text-[12px] tabular",
                  item.done ? "text-ink-3" : due.tone === "danger" ? "font-medium text-danger" : due.tone === "warning" ? "font-medium text-warning" : "text-ink-3",
                )}
              >
                {due.text}
              </span>
            </li>
          );
        })}
      </ul>
      {limit && optimistic.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-auto w-full border-t border-line px-5 py-3 text-left text-[13px] text-ink-3 transition-colors hover:bg-surface-1 hover:text-ink"
        >
          {expanded ? t.collapse : t.showMore(hidden)}
        </button>
      )}
    </div>
  );
}
