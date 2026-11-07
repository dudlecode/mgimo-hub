/* MGIMO Hub: service worker. Обычный JS без сборщика.
 *
 * Стратегии:
 *   /_next/static/*, шрифты, иконки   cache-first (в dev: network-first, чтобы не мешать HMR)
 *   страницы студента (навигации)      network-first с таймаутом, без сети сохранённая копия или /offline
 *   RSC-запросы мягкой навигации       сеть с таймаутом; без сети ошибка, и Next.js сам делает обычный
 *                                      переход, который уже обслуживается из кэша страниц
 *   /api/*, /staff/*, /login, /verify/*, не-GET, Server Actions, редиректы    никогда не кэшируются
 *
 * Кэш страниц персональный: он очищается при выходе, на странице входа и при любом ответе,
 * который привёл на /login (сессия закончилась).
 */

const VERSION = "v1";
const PREFIX = "mgimo-";
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const PAGES_PREFIX = `${PREFIX}pages-`;
const PAGES_CACHE = `${PAGES_PREFIX}${VERSION}`;

const DEV = new URL(self.location.href).searchParams.get("dev") === "1";
const OFFLINE_URL = "/offline";
const NAV_TIMEOUT_MS = 3000;
const NAV_TIMEOUT_AFTER_FAIL_MS = 1200;
const RSC_TIMEOUT_MS = 4000;
const MAX_PAGES = 40;
const MAX_STATIC = 400;
const MAX_PRECACHE = 30;

/** Страницы, которые можно сохранить для работы без сети. Только чтение, только свои данные. */
const CACHEABLE_PAGES = [
  /^\/$/,
  /^\/schedule$/,
  /^\/grades$/,
  /^\/grades\/[^/]+$/,
  /^\/profile$/,
  /^\/documents$/,
  /^\/documents\/[^/]+$/,
  /^\/requests\/[^/]+\/document$/,
];

/** Никогда не кэшируем и не подменяем. */
const NEVER = [/^\/api(\/|$)/, /^\/staff(\/|$)/, /^\/login(\/|$)/, /^\/verify(\/|$)/];

/** Статические файлы из public и метаданные (иконки, манифест). */
const ASSET_RE = /^\/(?:icon(?:\.svg)?|apple-icon(?:\.png)?|favicon\.ico|[^/]+\.(?:svg|png|jpe?g|webp|ico|woff2?))$/;

/** Признак серверного редиректа на вход внутри потоковой HTML-страницы. */
const LOGIN_REDIRECT_RE = /__next-page-redirect[^>]*url=\/login|NEXT_REDIRECT;[^;"]*;\/login/;

const isCacheablePage = (path) => CACHEABLE_PAGES.some((re) => re.test(path));
const isNever = (path) => NEVER.some((re) => re.test(path));
const isLoginPath = (path) => path === "/login" || path.startsWith("/login/");
const isPrefetch = (req) => req.headers.has("Next-Router-Prefetch") || req.headers.has("Next-Router-Segment-Prefetch");

// Эпоха кэша страниц: растёт при каждой очистке. Фоновая запись, начатая до очистки, не сохранится.
let pagesEpoch = 0;
// Когда сеть последний раз подвела: следующая навигация ждёт сеть меньше.
let lastNetFail = 0;
const markNetOk = () => {
  lastNetFail = 0;
};
const markNetFail = () => {
  lastNetFail = Date.now();
};
const isOffline = () => self.navigator && self.navigator.onLine === false;

/* ───────────── Жизненный цикл ───────────── */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precacheShell().catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, SHELL_CACHE, PAGES_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && !keep.has(k)).map((k) => caches.delete(k)));
      // Если при установке не было сети, страница /offline подтянется сейчас
      const shell = await caches.open(SHELL_CACHE);
      if (!(await shell.match(OFFLINE_URL))) await precacheShell().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  // /offline публичная и одинаковая для всех: запрашиваем без cookie
  const res = await fetch(OFFLINE_URL, { credentials: "omit", cache: "no-store" });
  if (res.ok && !res.redirected && (res.headers.get("Content-Type") || "").includes("text/html")) {
    const html = await res.clone().text();
    await shell.put(OFFLINE_URL, res);
    await cacheSubresources(html);
  }
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(
    ["/icon.svg", "/apple-icon", "/manifest.webmanifest"].map(async (u) => {
      try {
        const r = await fetch(u, { credentials: "omit" });
        if (r.ok && !r.redirected) await statics.put(u, r);
      } catch {}
    }),
  );
}

/* ───────────── Перехват запросов ───────────── */

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // формы, Server Actions, API: только сеть
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  // Служебные пути dev-сервера (HMR, Turbopack, оверлей ошибок): не трогаем
  if (path.startsWith("/__") || (path.startsWith("/_next/") && !path.startsWith("/_next/static/"))) return;
  if (path.startsWith("/_next/static/webpack/") || url.searchParams.has("_hmr")) return;
  if (req.headers.has("Next-Action") || req.headers.has("Next-HMR-Refresh")) return;
  if (req.headers.has("Range")) return;

  // Страница входа: на устройстве больше никто не вошёл, чужие страницы стираем
  if (isLoginPath(path) && (req.mode === "navigate" || (req.headers.get("RSC") === "1" && !isPrefetch(req)))) {
    event.waitUntil(clearPages());
  }

  if (req.mode === "navigate") {
    if (path.startsWith("/api/")) return; // скачивание .ics и т. п.
    if (isCacheablePage(path) && !isNever(path)) {
      event.respondWith(handlePageNavigation(event, url));
    } else {
      // Без кэширования: только запасная страница /offline, если сети нет
      event.respondWith(fetch(req).catch(() => offlineFallback()));
    }
    return;
  }

  if (req.headers.get("RSC") === "1") {
    if (!isPrefetch(req) && isCacheablePage(path) && !isNever(path)) {
      event.respondWith(handleRscNavigation(event, url));
    }
    return;
  }

  if (path.startsWith("/_next/static/")) {
    event.respondWith(DEV ? networkFirstStatic(event) : cacheFirst(event, STATIC_CACHE));
    return;
  }

  if (path === "/manifest.webmanifest") {
    event.respondWith(networkFirstStatic(event));
    return;
  }

  if (ASSET_RE.test(path)) {
    event.respondWith(cacheFirst(event, STATIC_CACHE, true));
  }
});

/* ───────────── Страницы ───────────── */

/** Ключ кэша: путь и параметры, без хэша и служебного _rsc. */
function pageKey(url) {
  const u = new URL(url.href);
  u.hash = "";
  u.searchParams.delete("_rsc");
  return u.origin + u.pathname + u.search;
}

async function matchPage(url) {
  const cache = await caches.open(PAGES_CACHE);
  const exact = await cache.match(pageKey(url));
  if (exact) return exact;
  // Та же страница с другими параметрами (например, расписание другого дня)
  return cache.match(url.origin + url.pathname, { ignoreSearch: true });
}

function isStorableHtml(res) {
  return (
    res &&
    res.status === 200 &&
    res.type === "basic" &&
    !res.redirected &&
    (res.headers.get("Content-Type") || "").includes("text/html")
  );
}

/** Сохранить HTML страницы. Если внутри серверный редирект на вход, не сохраняем и чистим кэш. */
async function storePage(url, res, epoch) {
  const text = await res.text();
  if (LOGIN_REDIRECT_RE.test(text)) {
    await clearPages();
    return null;
  }
  if (epoch !== pagesEpoch) return null;
  const headers = new Headers(res.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("X-SW-Cached-At", String(Date.now()));
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(pageKey(url), new Response(text, { status: 200, statusText: "OK", headers }));
  await trimCache(PAGES_CACHE, MAX_PAGES);
  return text;
}

/** Копия из кэша помечается атрибутом на <html>, чтобы интерфейс показал плашку «нет сети». */
async function asOfflineCopy(res) {
  const text = await res.text();
  const cachedAt = res.headers.get("X-SW-Cached-At") || "1";
  const html = text.replace(/<html(\s|>)/i, `<html data-offline-copy="${cachedAt.replace(/\D/g, "")}"$1`);
  const headers = new Headers(res.headers);
  headers.delete("Content-Length");
  return new Response(html, { status: 200, statusText: "OK", headers });
}

async function cachedPageOrOffline(url) {
  const cached = await matchPage(url);
  return cached ? asOfflineCopy(cached) : offlineFallback();
}

async function handlePageNavigation(event, url) {
  const req = event.request;
  if (isOffline()) return cachedPageOrOffline(url);

  const epoch = pagesEpoch;
  let stored = Promise.resolve();
  // Навигация идёт с redirect: "manual": редирект (например, на /login) вернётся как opaqueredirect,
  // браузер сам перейдёт по нему, а мы его не сохраним.
  const network = fetch(req).then(
    (res) => {
      markNetOk();
      if (isStorableHtml(res)) stored = storePage(url, res.clone(), epoch).catch(() => {});
      return res;
    },
    (err) => {
      markNetFail();
      throw err;
    },
  );
  event.waitUntil(network.then(() => stored).catch(() => {}));

  const wait = lastNetFail && Date.now() - lastNetFail < 15000 ? NAV_TIMEOUT_AFTER_FAIL_MS : NAV_TIMEOUT_MS;
  try {
    return await raceWithTimeout(network, wait, async () => {
      const cached = await matchPage(url);
      if (!cached) return null; // копии нет: ждём сеть дальше
      markNetFail();
      return asOfflineCopy(cached);
    });
  } catch {
    return cachedPageOrOffline(url);
  }
}

/**
 * Мягкая навигация App Router (RSC-запрос). Без experimental.useOffline Next.js при ошибке сети
 * делает обычный переход по адресу, а его мы уже отдаём из кэша. Поэтому здесь достаточно
 * не ждать бесконечно: без сети или по таймауту (если есть сохранённая копия) отвечаем ошибкой.
 */
async function handleRscNavigation(event, url) {
  const network = fetch(event.request).then(
    (res) => {
      markNetOk();
      if (res.redirected && isLoginPath(new URL(res.url).pathname)) event.waitUntil(clearPages());
      return res;
    },
    (err) => {
      markNetFail();
      throw err;
    },
  );
  if (isOffline()) {
    network.catch(() => {});
    return Response.error();
  }
  try {
    return await raceWithTimeout(network, RSC_TIMEOUT_MS, async () => {
      const cached = await matchPage(url);
      if (!cached) return null;
      markNetFail();
      return Response.error();
    });
  } catch {
    return Response.error();
  }
}

/** Ответ сети, а если она молчит дольше ms, то запасной ответ (если fallback его вернул). */
function raceWithTimeout(networkPromise, ms, fallback) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(async () => {
      try {
        const alt = await fallback();
        if (alt && !done) {
          done = true;
          resolve(alt);
        }
      } catch {}
    }, ms);
    networkPromise.then(
      (res) => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          resolve(res);
        }
      },
      (err) => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          reject(err);
        }
      },
    );
  });
}

const FALLBACK_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нет сети · MGIMO Hub</title>
<style>body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#fff;color:#0a0a0a}main{max-width:420px;margin:0 auto;padding:64px 20px}h1{font-size:24px;font-weight:600;letter-spacing:-.02em;margin:0 0 8px}p{color:#4d4d4d;margin:0 0 20px}button{height:36px;padding:0 14px;border:0;border-radius:8px;background:#2f54eb;color:#fff;font:inherit;font-weight:500}@media (prefers-color-scheme:dark){body{background:#0a0a0a;color:#ededed}p{color:#a3a3a3}button{background:#3d63f5}}</style></head>
<body><main><h1>Нет сети</h1><p>Эта страница ещё не сохранена на устройстве. Подключитесь к интернету и попробуйте снова.</p><button onclick="location.reload()">Попробовать снова</button></main></body></html>`;

async function offlineFallback() {
  const shell = await caches.open(SHELL_CACHE);
  const res = await shell.match(OFFLINE_URL);
  if (res) return res;
  return new Response(FALLBACK_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* ───────────── Статика ───────────── */

async function cacheFirst(event, cacheName, ignoreSearch = false) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch, ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic" && !res.redirected) {
    const copy = res.clone();
    event.waitUntil(cache.put(req, copy).then(() => trimCache(cacheName, MAX_STATIC)).catch(() => {}));
  }
  return res;
}

async function networkFirstStatic(event) {
  const req = event.request;
  const cache = await caches.open(STATIC_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic" && !res.redirected) {
      const copy = res.clone();
      event.waitUntil(cache.put(req, copy).then(() => trimCache(STATIC_CACHE, MAX_STATIC)).catch(() => {}));
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

/** Скрипты и стили, на которые ссылается сохранённая страница: без них она не оживёт офлайн. */
async function cacheSubresources(html) {
  const found = new Set();
  const re = /\/_next\/static\/[^"'\s)<>\\]+/g;
  let m;
  while ((m = re.exec(html)) && found.size < 200) found.add(m[0].replace(/&amp;/g, "&"));
  if (!found.size) return;
  const cache = await caches.open(STATIC_CACHE);
  for (const u of found) {
    try {
      if (await cache.match(u, { ignoreVary: true })) continue;
      const res = await fetch(u, { credentials: "omit" });
      if (res.ok && res.type === "basic" && !res.redirected) await cache.put(u, res);
    } catch {}
  }
  await trimCache(STATIC_CACHE, MAX_STATIC);
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // keys() идёт в порядке записи: удаляем самые старые
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function clearPages() {
  pagesEpoch++;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(PAGES_PREFIX)).map((k) => caches.delete(k)));
}

/* ───────────── Сообщения от страниц ───────────── */

/** Заранее сохранить страницы (например, все документы из кошелька). */
async function precachePages(rawUrls, maxAgeMs) {
  const saved = [];
  const failed = [];
  if (!Array.isArray(rawUrls)) return { saved, failed };
  const urls = [];
  for (const raw of rawUrls.slice(0, MAX_PRECACHE)) {
    if (typeof raw !== "string" || raw.length > 300) continue;
    let u;
    try {
      u = new URL(raw, self.location.origin);
    } catch {
      continue;
    }
    if (u.origin !== self.location.origin || !isCacheablePage(u.pathname) || isNever(u.pathname)) continue;
    urls.push(u);
  }
  const maxAge = typeof maxAgeMs === "number" && maxAgeMs > 0 ? maxAgeMs : 0;
  const epoch = pagesEpoch;
  const cache = await caches.open(PAGES_CACHE);

  for (const u of urls) {
    const key = pageKey(u);
    if (maxAge) {
      const hit = await cache.match(key);
      const at = hit ? Number(hit.headers.get("X-SW-Cached-At")) : 0;
      if (at && Date.now() - at < maxAge) {
        saved.push(u.pathname + u.search);
        continue;
      }
    }
    try {
      const res = await fetch(key, { credentials: "same-origin", redirect: "follow", cache: "no-store", headers: { Accept: "text/html" } });
      if (res.redirected && isLoginPath(new URL(res.url).pathname)) {
        // Сессии больше нет: всё сохранённое стираем и дальше не идём
        await clearPages();
        return { saved: [], failed: urls.map((x) => x.pathname + x.search) };
      }
      if (!isStorableHtml(res)) {
        failed.push(u.pathname + u.search);
        continue;
      }
      const html = await storePage(u, res, epoch);
      if (html === null) {
        failed.push(u.pathname + u.search);
        if (epoch !== pagesEpoch) break;
        continue;
      }
      await cacheSubresources(html);
      saved.push(u.pathname + u.search);
    } catch {
      failed.push(u.pathname + u.search);
    }
  }
  return { saved, failed };
}

self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const port = event.ports && event.ports[0];
  const reply = (msg) => {
    try {
      if (port) port.postMessage(msg);
    } catch {}
  };
  if (data.type === "clear-pages") {
    event.waitUntil(clearPages().then(() => reply({ type: "cleared" })));
  } else if (data.type === "cache-pages") {
    event.waitUntil(
      precachePages(data.urls, data.maxAgeMs)
        .then((r) => reply({ type: "cached", ...r }))
        .catch(() => reply({ type: "cached", saved: [], failed: [] })),
    );
  }
});

/* ───────────── Push ───────────── */

/** Только относительный путь нашего сайта: «/requests/…», не «//evil» и не «https://…». */
function safePath(raw) {
  if (typeof raw !== "string" || raw.length > 300 || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  try {
    const u = new URL(raw, self.location.origin);
    return u.origin === self.location.origin ? u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title.trim() ? data.title.slice(0, 120) : "MGIMO Hub";
  const body = typeof data.body === "string" ? data.body.slice(0, 240) : "";
  const url = safePath(data.url) || "/notifications";
  const options = { body, icon: "/apple-icon", lang: "ru", data: { url } };
  if (typeof data.tag === "string" && data.tag.length <= 64) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url) || "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const ours = windows.filter((c) => new URL(c.url).origin === self.location.origin);
      const same = ours.find((c) => c.url === target);
      if (same) return same.focus();
      const tab = ours.find((c) => c.visibilityState === "visible") || ours[0];
      if (tab) {
        try {
          const focused = await tab.focus();
          if (focused && "navigate" in focused) {
            const moved = await focused.navigate(target);
            if (moved) return moved;
          }
        } catch {}
      }
      return self.clients.openWindow(target);
    })(),
  );
});

/** Браузер сменил подписку сам: переподписываемся с тем же ключом и сообщаем серверу. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = old && old.options && old.options.applicationServerKey;
      const sub = event.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      if (!sub) return;
      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (old && old.endpoint !== sub.endpoint) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: old.endpoint }),
        });
      }
    })().catch(() => {}),
  );
});
