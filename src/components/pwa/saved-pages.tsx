"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatDayMonth, formatTime, isSameMskDay } from "@/lib/time";
import type { Locale } from "@/lib/i18n/config";
import { offlineMessages } from "@/lib/i18n/messages/offline";
import { listSavedPages, type SavedPage } from "./sw-client";
import { useOfflineLocale } from "./offline-locale";

function savedLabel(ms: number, locale: Locale) {
  if (!ms) return "";
  const d = new Date(ms);
  const t = offlineMessages[locale];
  return isSameMskDay(d, new Date()) ? t.savedAt(formatTime(d, locale)) : t.savedOn(formatDayMonth(d, locale), formatTime(d, locale));
}

/** Заголовок и текст экрана «Нет сети» на языке, запомненном на устройстве */
export function OfflineIntro() {
  const t = offlineMessages[useOfflineLocale()];
  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-ink">{t.title}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t.text}</p>
    </>
  );
}

/**
 * Страницы, сохранённые на устройстве: их можно открыть без сети.
 * Пока список не прочитан из кэша браузера (это миллисекунды), блока нет совсем: без скриптов
 * или при упавшем сервере вечный скелетон выглядел бы как поломка.
 */
export function SavedPages({ titleClassName }: { titleClassName?: string }) {
  const locale = useOfflineLocale();
  const t = offlineMessages[locale];
  const [pages, setPages] = useState<SavedPage[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listSavedPages().then((list) => {
      if (alive) setPages(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (pages === null) return null;

  const title = <h2 className={titleClassName}>{t.saved}</h2>;

  if (!pages.length) {
    return (
      <>
        {title}
        <Card className="px-5 py-4">
          <p className="text-[13px] leading-relaxed text-ink-3">{t.nothingSaved}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      {title}
      <Card className="divide-y divide-line stagger-rows">
        {pages.map((p) => (
          // Обычная ссылка, а не next/link: без сети нужен полный переход, его обслужит service worker
          <a key={p.url} href={p.url} className="block px-5 py-4 transition-colors hover:bg-surface-1">
            <div className="truncate text-[14px] font-medium text-ink">{p.title}</div>
            <div className="mt-0.5 text-[12px] text-ink-3">{savedLabel(p.savedAt, locale)}</div>
          </a>
        ))}
      </Card>
    </>
  );
}

export function RetryButton({ className }: { className?: string }) {
  const t = offlineMessages[useOfflineLocale()];
  return (
    <button type="button" onClick={() => location.reload()} className={className}>
      {t.retry}
    </button>
  );
}
