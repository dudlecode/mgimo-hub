// Клиентские помощники для service worker (public/sw.js). Без "use client": импортируется из клиентских компонентов.

export const PAGES_CACHE_PREFIX = "mgimo-pages-";

export function swSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && window.isSecureContext;
}

/** Активный service worker, если он уже управляет вкладкой или появится за timeoutMs. */
export async function activeWorker(timeoutMs = 4000): Promise<ServiceWorker | null> {
  if (!swSupported()) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  const ready = navigator.serviceWorker.ready.then((r) => r.active);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([ready, timeout]);
}

/** Сообщение в SW с ответом через MessageChannel. */
export async function askWorker<T>(message: Record<string, unknown>, timeoutMs = 30000): Promise<T | null> {
  const sw = await activeWorker();
  if (!sw) return null;
  return new Promise<T | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (e: MessageEvent<T>) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    try {
      sw.postMessage(message, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export type CacheResult = { type: "cached"; saved: string[]; failed: string[] };

/** Попросить SW сохранить страницы для работы без сети. maxAgeMs: не перекачивать свежие копии. */
export function cachePages(urls: string[], maxAgeMs = 0) {
  return askWorker<CacheResult>({ type: "cache-pages", urls, maxAgeMs });
}

/** Стереть сохранённые персональные страницы: напрямую через Cache API и сообщением в SW. */
export async function clearPageCaches() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PAGES_CACHE_PREFIX)).map((k) => caches.delete(k)));
    }
  } catch {}
  await askWorker({ type: "clear-pages" }, 3000).catch(() => null);
}

/** Есть ли сохранённая копия страницы (точно по адресу). */
export async function isPageCached(url: string) {
  try {
    if (!("caches" in window)) return false;
    const keys = (await caches.keys()).filter((k) => k.startsWith(PAGES_CACHE_PREFIX));
    for (const k of keys) {
      const cache = await caches.open(k);
      if (await cache.match(new URL(url, location.origin).href)) return true;
    }
  } catch {}
  return false;
}

export type SavedPage = { url: string; title: string; savedAt: number };

/** Список сохранённых страниц (для экрана «Нет сети»). */
export async function listSavedPages(): Promise<SavedPage[]> {
  const out: SavedPage[] = [];
  try {
    if (!("caches" in window)) return out;
    const keys = (await caches.keys()).filter((k) => k.startsWith(PAGES_CACHE_PREFIX));
    for (const k of keys) {
      const cache = await caches.open(k);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        if (!res) continue;
        const html = await res.text();
        const raw = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
        const title = decodeEntities(raw).replace(/\s*·\s*MGIMO Hub\s*$/, "").trim() || "MGIMO Hub";
        const u = new URL(req.url);
        out.push({ url: u.pathname + u.search, title, savedAt: Number(res.headers.get("X-SW-Cached-At")) || 0 });
      }
    }
  } catch {}
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
}
