// Сервисы кабинета студента: заявки, готовая справка и её проверка по QR, уведомления, помощник, /offline.
// Тесты перезапускаемые на той же базе: созданную заявку отзываем и удаляем из БД (отозванная тоже
// попадает в лимит 15 заявок в час), цели выбираем по DOM, id из БД не хардкодим.
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { attachConsoleGuard, expectCleanText, expectNoHorizontalOverflow, loginAs, setLocale } from "./helpers";

const SHOTS = "test-results/shots";
const MARK = "Проверка E2E";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = readFileSync(".env", "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL не найден");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

async function sql(text: string, params: unknown[] = []) {
  const c = new Client({ connectionString: databaseUrl() });
  await c.connect();
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}

/** Удаляет заявки Анны, созданные этой спекой (по метке в комментарии), вместе с уведомлениями о них. */
async function purgeTestRequests(id?: string) {
  const rows = (await sql(
    `select r.id from requests r join students s on s.id = r.student_id join users u on u.id = s.user_id
      where u.login = 'student.anna' and (r.id = $1 or r.comment in ($2, 'E2E проверка'))`,
    [id ?? "", MARK],
  )) as { id: string }[];
  for (const r of rows) {
    await sql(`delete from notifications where link in ($1, $2)`, [`/requests/${r.id}`, `/staff/requests/${r.id}`]);
    await sql(`delete from requests where id = $1`, [r.id]);
  }
}

// Остатки прошлых прогонов не должны упираться в лимит заявок
test.beforeAll(async () => {
  await purgeTestRequests();
});

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("справка об обучении: валидация, отправка, трекер и отзыв", async ({ page }, info) => {
  let createdId: string | undefined;
  try {
    await certificateFlow(page, info.project.name, (id) => (createdId = id));
  } finally {
    await purgeTestRequests(createdId);
  }
});

async function certificateFlow(page: Page, project: string, onCreated: (id: string) => void) {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "anna");
  await page.goto("/requests/new/study-certificate");
  await expectNoHorizontalOverflow(page);

  // Пустая форма: сервер возвращает ошибку обязательного поля, форма не уходит
  await page.getByRole("button", { name: "Заказать справку" }).click();
  await expect(page.getByText("Проверьте выделенные поля")).toBeVisible();
  await expect(page.locator("#f-purpose")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/requests\/new\/study-certificate$/);

  // Заполняем: цель, бумажный вариант, два экземпляра, комментарий
  await page.locator("#f-purpose").selectOption("в банк");
  await page.getByText("На бумаге, с печатью").click();
  await page.getByRole("button", { name: "Больше" }).click();
  await page.locator("#f-comment").fill(MARK);
  await page.getByRole("button", { name: "Заказать справку" }).click();

  await page.waitForURL(/\/requests\/[0-9a-f-]{36}\?created=1$/);
  onCreated(new URL(page.url()).pathname.split("/")[2]);
  const banner = page.getByRole("status").filter({ hasText: /Заявка АТ-\d+ подана/ });
  await expect(banner).toBeVisible();
  const number = (await banner.innerText()).match(/АТ-\d+/)![0];
  await expect(page.getByRole("list", { name: "Этапы заявки" })).toBeVisible();
  await expect(page.getByText("На бумаге, с печатью, 2 экз.")).toBeVisible();
  await expect(page.getByText("В банк")).toBeVisible();
  await expectCleanText(page);
  await expectNoHorizontalOverflow(page);
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/svc-request-created-${project}.png`, fullPage: true });

  // Откат: отзываем созданную заявку, она уходит в архив
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Отозвать" }).click();
  await expect(page.getByText("Вы отозвали заявку.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отозвать" })).toHaveCount(0);

  await page.goto("/requests?tab=archive");
  await expect(page.locator("main").getByText(number)).toBeVisible();
  guard.expectClean();
}

test("готовая справка открывается, QR-код проверяется без входа", async ({ page, browser }, info) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "anna");
  await page.goto("/documents");
  await expectNoHorizontalOverflow(page);
  await expectCleanText(page);
  await page.locator("main a[href$='/document']").first().click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}\/document$/);
  const qr = page.locator("#qr");
  await expect(qr.locator("svg")).toBeVisible();
  await expect(page.getByRole("button", { name: /PDF|печать/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const code = (await qr.innerText()).match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)![0];
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/svc-document-${info.project.name}.png`, fullPage: true });

  // Проверяющий (посольство, работодатель) открывает ссылку из QR в чистом браузере
  const anon = await browser.newContext();
  try {
    const p = await anon.newPage();
    await p.goto(`/verify/${code}`);
    await expect(p.getByText("Документ подлинный")).toBeVisible();
    await expect(p.getByText(code).first()).toBeVisible();
    // Показываем только инициалы
    await expect(p.getByText("Орлова А. Д.")).toBeVisible();
    await expect(p.getByText("Анна Дмитриевна")).toHaveCount(0);
    await expectCleanText(p);
    await expectNoHorizontalOverflow(p);
    await p.goto("/verify/AAAA-BBBB-CCCC");
    await expect(p.getByRole("heading", { name: "Документ не найден" })).toBeVisible();
    // Сама справка без входа недоступна
    await p.goto(page.url());
    await expect(p).toHaveURL(/\/login/);
  } finally {
    await anon.close();
  }
  guard.expectClean();
});

test("уведомления: прочитать все, фильтр, открыть; новости деканата", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "anna");
  await page.goto("/notifications");
  await expectNoHorizontalOverflow(page);
  await expectCleanText(page);

  // После заказа справки в первом тесте непрочитанное есть; при одиночном прогоне его может не быть
  const markAll = page.getByRole("button", { name: "Прочитать все" });
  if (await markAll.count()) {
    await markAll.click();
    await expect(markAll).toHaveCount(0);
  }
  await expect(page.getByText("Всё прочитано")).toBeVisible();

  // Фильтр по типу «Заявки», затем открываем уведомление: ведёт на страницу заявки
  const chip = page.locator("main a[href='/notifications?kind=request']");
  await chip.click();
  await expect(page).toHaveURL(/kind=request/);
  const item = page.locator("main a[href$='/open']").first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);

  // Вкладка новостей и сама новость
  await page.goto("/notifications?tab=news");
  const news = page.locator("main a[href^='/news/']").first();
  await expect(news).toBeVisible();
  await news.click();
  await expect(page).toHaveURL(/\/news\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.locator("main a[href='/notifications?tab=news']").first().click();
  await expect(page).toHaveURL(/tab=news/);
  guard.expectClean();
});

test("помощник: вопрос, ответ и кнопка действия ведёт в форму", async ({ page }, info) => {
  test.setTimeout(150_000);
  const guard = attachConsoleGuard(page);
  await loginAs(page, "anna");
  await page.goto("/assistant");
  // Чистый диалог: история вкладки живёт в sessionStorage
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: /Нужна справка для визы в Италию/ }).click();
  await expect(page.locator("main").getByText("Нужна справка для визы в Италию")).toBeVisible();

  // Ответ модели (или офлайн-режим) и подготовленное действие
  const action = page.locator("main [aria-live='polite'] a[href^='/']").first();
  const send = page.getByRole("button", { name: "Отправить" });
  // Ответ пришёл: индикатор «Атташе печатает» пропал, в ленте вопрос и ответ
  const typing = page.locator("[aria-label='Атташе печатает']");
  await expect(page.locator("main [aria-live='polite'] > div").nth(1)).toBeVisible({ timeout: 120_000 });
  await expect(typing).toHaveCount(0, { timeout: 120_000 });
  if (!(await action.count())) {
    // Модель недетерминирована: если черновик не предложен, просим его явно
    await page.locator("#ask").fill("Туризм, с 20 по 30 декабря. Подготовьте черновик заявки.");
    await send.click();
  }
  await expect(action).toBeVisible({ timeout: 120_000 });
  await expectCleanText(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SHOTS}/svc-assistant-${info.project.name}.png`, fullPage: true });
  const href = (await action.getAttribute("href"))!;
  await action.click();
  await page.waitForURL((u) => u.pathname === href.split("?")[0]);
  await expect(page.locator("main")).toBeVisible();
  guard.expectClean();
});

test("английский интерфейс и экран «Нет сети»", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await setLocale(page, "en");
  await loginAs(page, "anna");
  const checks: [string, RegExp][] = [
    ["/requests", /Requests/],
    ["/requests/new", /What do you need/i],
    ["/requests/new/study-certificate", /Order certificate/i],
    ["/notifications", /Notifications/],
    ["/documents", /Documents/],
    ["/assistant", /How can I help/],
  ];
  for (const [url, text] of checks) {
    await page.goto(url);
    await expect(page.locator("main").getByText(text).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectCleanText(page);
  }

  // /offline открывается и без входа: это запасной экран service worker
  const anon = await page.context().browser()!.newContext();
  try {
    const p = await anon.newPage();
    await p.goto("/offline");
    await expect(p.getByRole("heading", { name: "Нет сети" })).toBeVisible();
    await expect(p.getByRole("button", { name: "Попробовать снова" })).toBeVisible();
    await expectNoHorizontalOverflow(p);
  } finally {
    await anon.close();
  }
  guard.expectClean();
});
