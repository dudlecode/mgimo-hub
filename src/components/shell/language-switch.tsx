"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/lib/i18n/actions";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { LOCALE_LABEL, LOCALES, type Locale } from "@/lib/i18n/config";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { cn } from "@/lib/utils";

const SHORT: Record<Locale, string> = { ru: "RU", en: "EN" };

/**
 * Язык интерфейса: две кнопки в одной подложке, как у переключателя темы.
 * block: на всю ширину (сайдбар), inline: по содержимому (страница входа), compact: «RU» / «EN» (мобильная шапка).
 * Названия языков всегда на своём языке, чтобы их узнал тот, кто не читает текущий.
 */
export function LanguageSwitch({ variant = "block", className }: { variant?: "block" | "inline" | "compact"; className?: string }) {
  const locale = useLocale();
  const t = useMessages(shellMessages);
  const router = useRouter();
  const [pending, start] = useTransition();
  const compact = variant === "compact";

  function choose(next: Locale) {
    if (next === locale || pending) return;
    start(async () => {
      const res = await setLocaleAction(next);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label={t.language}
      aria-busy={pending || undefined}
      className={cn("inline-flex shrink-0 rounded-[7px] bg-surface-2 p-0.5", variant === "block" && "flex w-full", className)}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            lang={l}
            title={compact ? LOCALE_LABEL[l] : undefined}
            onClick={() => choose(l)}
            disabled={pending}
            className={cn(
              "flex h-7 items-center justify-center rounded-[5px] font-medium transition-colors disabled:cursor-default",
              compact ? "min-w-8 px-1.5 text-[12px] tracking-[0.02em]" : "px-2.5 text-[13px]",
              variant === "block" && "flex-1",
              active ? "bg-surface text-ink ring-1 ring-line" : "text-ink-3 hover:text-ink",
              pending && !active && "opacity-60",
            )}
          >
            {compact ? SHORT[l] : LOCALE_LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}
