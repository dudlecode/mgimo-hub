"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMessages } from "@/lib/i18n/client";
import { offlineMessages } from "@/lib/i18n/messages/offline";
import { cachePages, isPageCached } from "./sw-client";

const Ctx = createContext<ReadonlySet<string>>(new Set());
const REFRESH_AFTER_MS = 5 * 60_000;

/**
 * Заранее сохраняет страницы для работы без сети (через service worker) и сообщает,
 * какие из них уже лежат на устройстве. Проверка через caches.match, а не по ответу SW.
 */
export function OfflineReady({ urls, children }: { urls: string[]; children: ReactNode }) {
  const key = urls.join("\n");
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const list = key ? key.split("\n") : [];
    if (!list.length || typeof window === "undefined" || !("caches" in window)) return;
    let alive = true;
    const check = async () => {
      const found = new Set<string>();
      for (const u of list) if (await isPageCached(u)) found.add(u);
      if (alive) setReady(found);
    };
    void (async () => {
      await check();
      if (!navigator.onLine) return;
      await cachePages(list, REFRESH_AFTER_MS);
      await check();
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  return <Ctx.Provider value={ready}>{children}</Ctx.Provider>;
}

/** Отметка «Доступно без сети» у строки. Место под неё занято заранее, чтобы строка не прыгала. */
export function OfflineMark({ url, className }: { url: string; className?: string }) {
  const ready = useContext(Ctx).has(url);
  const t = useMessages(offlineMessages);
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] text-ink-3 transition-opacity duration-300", ready ? "opacity-100" : "opacity-0", className)} aria-hidden={!ready}>
      <Check className="size-3.5 text-success" strokeWidth={2} aria-hidden />
      {t.available}
    </span>
  );
}
