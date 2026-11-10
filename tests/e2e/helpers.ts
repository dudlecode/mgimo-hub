import { readFileSync } from "node:fs";
import { expect, test as base, type Page } from "@playwright/test";
import { Client } from "pg";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

/** Демо-аккаунты из сида. Все данные вымышлены. */
export const DEMO = {
  anna: { login: "student.anna", password: "Demo-Anna-26", role: "student" },
  timur: { login: "student.timur", password: "Demo-Timur-26", role: "student" },
  leyla: { login: "student.leyla", password: "Demo-Leyla-26", role: "student" },
  office: { login: "staff.office", password: "Demo-Office-26", role: "staff" },
  meo: { login: "staff.meo", password: "Demo-Meo-26", role: "staff" },
} as const;

/**
 * При первой загрузке React присылает готовое содержимое Suspense-границы в скрытом
 * <div hidden id="S:n"> и убирает его примерно через 300 мс после показа. В это окно элементы
 * страницы есть в DOM дважды (видимый и скрытый), и строгие локаторы падают с «resolved to 2 elements».
 * Пользователь дубля не видит, поэтому ждём его исчезновения в тестах, а не правим продукт.
 */
export async function waitForStreamedHtml(page: Page) {
  await page
    .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), undefined, { timeout: 10_000 })
    .catch(() => {});
}

/** test со страницей, у которой goto дожидается конца потоковой отдачи HTML. */
export const test = base.extend({
  page: async ({ page }, run) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const res = await goto(url, options);
      await waitForStreamedHtml(page);
      return res;
    };
    await run(page);
  },
});

export type DemoKey = keyof typeof DEMO;
export type Locale = "ru" | "en";

/** Вход через JSON-эндпоинт: cookie сессии попадает в контекст страницы. */
export async function loginAs(page: Page, who: DemoKey) {
  const { login, password } = DEMO[who];
  const res = await page.request.post("/api/auth/login", {
    data: { login, password },
    headers: { Origin: new URL(BASE_URL).origin, "Content-Type": "application/json" },
  });
  expect(res.status(), `вход ${login}`).toBe(200);
  return (await res.json()) as { ok: true; role: "student" | "staff" };
}

/** Язык кабинета студента: cookie hub_locale. */
export async function setLocale(page: Page, locale: Locale) {
  const url = new URL(BASE_URL);
  await page.context().addCookies([{ name: "hub_locale", value: locale, domain: url.hostname, path: "/", sameSite: "Lax" }]);
}

/** Нет горизонтальной прокрутки страницы (вёрстка с 360 px). */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, `горизонтальная прокрутка на ${page.url()}`).toBeLessThanOrEqual(client + 1);
}

// Шум dev-режима Next/Turbopack и браузера, который не является ошибкой приложения.
const NOISE = [
  /Download the React DevTools/i,
  /\[HMR\]/,
  /\[Fast Refresh\]/,
  /webpack-hmr|turbopack-hmr|_next\/webpack/i,
  /WebSocket connection to .* failed/i,
  /favicon\.ico/i,
  /net::ERR_ABORTED/i,
  /Failed to load resource: net::ERR_NETWORK_CHANGED/i,
  /service worker/i,
];

/** Собирает ошибки консоли и pageerror. Вызывайте до навигации, проверяйте через errors(). */
export function attachConsoleGuard(page: Page) {
  const list: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (NOISE.some((r) => r.test(text))) return;
    list.push(`console: ${text}`);
  });
  page.on("pageerror", (err) => list.push(`pageerror: ${err.message}`));
  return {
    errors: () => [...list],
    clear: () => {
      list.length = 0;
    },
    expectClean: (where = page.url()) => expect(list, `ошибки консоли на ${where}`).toEqual([]),
  };
}

/** Длинное тире и стрелки в видимом тексте запрещены правилами интерфейса. */
export const FORBIDDEN_CHARS = /[—←-⇿⟵-⟿⬅-⬇]/;

export async function expectCleanText(page: Page) {
  const text = await page.locator("body").innerText();
  const m = text.match(new RegExp(`.{0,30}${FORBIDDEN_CHARS.source}.{0,30}`));
  expect(m?.[0] ?? null, `длинное тире или стрелка на ${page.url()}`).toBeNull();
}

/** Строка подключения к тестовой базе: из env или из .env в корне проекта. */
export function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = readFileSync(".env", "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL не найден");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/** Параметризованный запрос к базе для подготовки и отката тестовых данных. Возвращает строки
 * (тот же тип, что у локальных копий в спеках, чтобы их можно было просто заменить импортом). */
export async function sql(text: string, params: unknown[] = []) {
  const c = new Client({ connectionString: databaseUrl() });
  await c.connect();
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}
