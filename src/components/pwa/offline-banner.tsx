"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { formatDayMonth, formatTime, isSameMskDay } from "@/lib/time";
import { useLocale } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { offlineMessages } from "@/lib/i18n/messages/offline";
import { cachePages } from "./sw-client";
import { rememberLocale } from "./offline-locale";

// Страницы, которые SW хранит для работы без сети (совпадает со списком в public/sw.js)
const CACHEABLE = [/^\/$/, /^\/schedule$/, /^\/grades$/, /^\/grades\/[^/]+$/, /^\/profile$/, /^\/documents$/, /^\/documents\/[^/]+$/, /^\/requests\/[^/]+\/document$/];
const CORE_PAGES = ["/", "/schedule", "/documents", "/grades", "/profile"];
const REFRESH_AFTER_MS = 5 * 60_000;
const CORE_REFRESH_AFTER_MS = 30 * 60_000;

/* Внешнее состояние: сеть, «показана сохранённая копия», время свежих данных. */
type NetState = { online: boolean; copy: boolean; freshAt: number };
let state: NetState = { online: true, copy: false, freshAt: 0 };
const SERVER_STATE: NetState = { online: true, copy: false, freshAt: 0 };
const listeners = new Set<() => void>();
let started = false;

function set(patch: Partial<NetState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  state = { online: navigator.onLine, copy: document.documentElement.hasAttribute("data-offline-copy"), freshAt: 0 };
  window.addEventListener("online", () => set({ online: true }));
  window.addEventListener("offline", () => set({ online: false }));
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getState = () => state;
const getServerState = () => SERVER_STATE;

function stamp(ms: number, locale: Locale) {
  const d = new Date(ms);
  return isSameMskDay(d, new Date()) ? formatTime(d, locale) : `${formatDayMonth(d, locale)}, ${formatTime(d, locale)}`;
}

/**
 * Плашка «Нет сети» для кабинета студента и фоновое сохранение открытых страниц.
 * renderedAt: время серверного рендера макета. В сохранённой копии это время, когда копия была снята.
 */
export function OfflineBanner({ renderedAt }: { renderedAt: string }) {
  const pathname = usePathname();
  const net = useSyncExternalStore(subscribe, getState, getServerState);
  const locale = useLocale();
  const t = offlineMessages[locale];

  // Запоминаем язык для экрана «Нет сети» (его service worker берёт без cookie)
  useEffect(() => rememberLocale(locale), [locale]);

  const lastPath = useRef<string | null>(null);

  // Мягкая навигация прошла по сети: данные на экране свежие, плашка «сохранённая копия» больше не нужна.
  // Заодно просим SW сохранить эту страницу (если копия старше 5 минут), а при первом входе и основные разделы.
  useEffect(() => {
    const prev = lastPath.current;
    lastPath.current = pathname;
    if (prev === pathname || !navigator.onLine) return; // повторный запуск эффекта в StrictMode или нет сети
    const root = document.documentElement;
    if (prev !== null) {
      root.removeAttribute("data-offline-copy");
      set({ copy: false, freshAt: Date.now() });
    }
    if (root.hasAttribute("data-offline-copy")) return;
    const urls = CACHEABLE.some((re) => re.test(location.pathname)) ? [location.pathname + location.search] : [];
    void cachePages(urls, REFRESH_AFTER_MS).then(() => (prev === null ? cachePages(CORE_PAGES, CORE_REFRESH_AFTER_MS) : null));
  }, [pathname]);

  if (net.online && !net.copy) return null;

  const base = Date.parse(renderedAt) || net.freshAt;
  const at = stamp(net.copy ? base : Math.max(base, net.freshAt), locale);

  return (
    <div role="status" className="no-print border-b border-line bg-surface-1">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-[13px] sm:px-8 lg:px-14">
        <p className="text-ink-2">
          {net.online ? t.bannerCopy : t.bannerOffline} {t.bannerFrom} <span className="font-mono tabular text-ink">{at}</span>
        </p>
        {net.online && (
          <button type="button" onClick={() => location.reload()} className="font-medium text-brand-fg hover:underline">
            {t.refresh}
          </button>
        )}
      </div>
    </div>
  );
}
