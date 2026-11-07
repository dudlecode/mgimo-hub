// Кабинет студента: вход, оболочка, Сегодня, расписание, учёба, профиль.
// Только главные сценарии. Тесты, меняющие данные, откатывают изменения и не зависят от точных счётчиков.
import { expect, request as pwRequest, test, type Page } from "@playwright/test";
import { attachConsoleGuard, BASE_URL, DEMO, expectCleanText, expectNoHorizontalOverflow, loginAs } from "./helpers";

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

// Chrome иногда сам запрашивает /favicon.ico, хотя в разметке есть icon.svg. Этот 404 не ошибка приложения,
// а в тексте консольного сообщения нет адреса, и фильтр шума его не отсекает.
test.beforeEach(async ({ page }) => {
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
});

test("вход: ошибка пароля, показ пароля, язык и быстрый вход жюри", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  // заставку пропускаем: она уже «просмотрена» в этой вкладке
  await page.addInitScript(() => sessionStorage.setItem("mh-intro-seen", "1"));
  await page.goto("/login");

  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.locator("h1")).toHaveText("Sign in");
  await page.getByRole("radio", { name: "Русский" }).click();
  await expect(page.locator("h1")).toHaveText("Вход");

  await page.locator("#login").fill(DEMO.leyla.login);
  await page.locator("#password").fill("wrong-password-e2e");
  await page.getByRole("button", { name: /Показать пароль/ }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator("#login-error")).toContainText("Неверный логин или пароль");
  await expect(page).toHaveURL(/\/login/);

  // быстрый вход сбрасывает счётчик неудачных попыток для этого логина
  await page.getByRole("button", { name: /Лейла/ }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.locator("main h1")).toBeVisible();
  if (isMobile(page)) await expectNoHorizontalOverflow(page);
  guard.expectClean();
});

test("оболочка: тема, язык, колокольчик и профиль", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "timur");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const mobile = isMobile(page);
  const shell = mobile ? page.locator("header").first() : page.locator("aside").first();

  const html = page.locator("html");
  const wasDark = ((await html.getAttribute("class")) ?? "").includes("dark");
  await shell.getByRole("button", { name: wasDark ? "Включить светлую тему" : "Включить тёмную тему" }).click();
  await expect(html).toHaveClass(wasDark ? /light/ : /dark/);

  await shell.getByRole("radio", { name: mobile ? "EN" : "English" }).click();
  await expect(html).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "Main menu" }).first()).toBeVisible();
  await expectCleanText(page);
  await shell.getByRole("radio", { name: mobile ? "RU" : "Русский" }).click();
  await expect(html).toHaveAttribute("lang", "ru");

  if (mobile) {
    await shell.getByRole("link", { name: /Уведомления/ }).click();
    await page.waitForURL(/\/notifications/);
    await shell.getByRole("link", { name: "Профиль" }).click();
    await page.waitForURL(/\/profile/);
    const bottom = page.getByRole("navigation", { name: "Основное меню" }).last();
    for (const [name, path] of [["Расписание", "/schedule"], ["Учёба", "/grades"], ["Сегодня", "/"]] as const) {
      await bottom.getByRole("link", { name, exact: true }).click();
      await page.waitForURL((u) => u.pathname === path);
    }
  } else {
    await shell.getByRole("link", { name: /Уведомления/ }).click();
    await page.waitForURL(/\/notifications/);
    await shell.getByRole("link", { name: /Тимур/ }).click();
    await page.waitForURL(/\/profile/);
    await shell.getByRole("link", { name: "Оплата обучения" }).click();
    await page.waitForURL(/\/payments/);
  }
  guard.expectClean();
});

test("Сегодня: кнопки шапки и отметка дедлайна", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "anna");
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const quick = page.locator("main header a");
  await expect(quick).toHaveCount(4);
  for (const href of await quick.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))) {
    expect((await page.request.get(href)).status(), href).toBeLessThan(400);
  }
  await quick.filter({ hasText: "Студбилет" }).click();
  await page.waitForURL(/\/documents/);
  await expect(page.locator("#student-card")).toBeInViewport();

  await page.goto("/");
  const box = page.getByRole("checkbox").first();
  test.skip((await box.count()) === 0, "у студента нет дедлайнов");
  const label = (await box.getAttribute("aria-label")) ?? "";
  const title = label.split(": ").slice(1).join(": ");
  const before = await box.getAttribute("aria-checked");
  const after = before === "true" ? "false" : "true";
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", after);
  await page.waitForTimeout(800);
  await page.reload();
  const same = page.getByRole("checkbox", { name: new RegExp(`: ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first();
  await expect(same).toHaveAttribute("aria-checked", after);
  // откат
  await same.click();
  await expect(same).toHaveAttribute("aria-checked", before ?? "false");
  await page.waitForTimeout(800);
  guard.expectClean();
});

test("расписание: недели, день и неделя, экспорт в календарь", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "anna");
  await page.goto("/schedule");
  const main = page.locator("main");

  await main.getByRole("link", { name: "Следующая неделя" }).click();
  await page.waitForURL(/day=/);
  await main.getByRole("link", { name: "Сегодня", exact: true }).click();
  await expect(main.getByRole("link", { name: "Сегодня", exact: true })).toHaveCount(0);

  await main.getByRole("tab", { name: "Неделя" }).click();
  await page.waitForURL(/view=week/);
  await expect(main.locator("section h2").first()).toBeVisible();
  await main.getByRole("tab", { name: "День" }).click();
  await page.waitForURL((u) => !u.search.includes("view=week"));
  await expect(main.locator("[aria-current=date]")).toHaveCount(1);
  if (isMobile(page)) await expectNoHorizontalOverflow(page);

  const ics = await page.request.get("/api/calendar");
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VEVENT");
  guard.expectClean();
});

test("учёба: вкладки, дисциплина и калькулятор", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "anna");
  await page.goto("/grades");
  const main = page.locator("main");

  for (const [tab, url] of [["Сессия", /tab=session/], ["Зачётка", /tab=record/], ["Семестр", /\/grades$/]] as const) {
    await main.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    await page.waitForURL(url);
    await expect(main.getByRole("tab", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-selected", "true");
  }

  await main.locator('a[href^="/grades/"]').first().click();
  await page.waitForURL(/\/grades\/[0-9a-f-]{36}$/);
  const calc = page.locator("section[aria-labelledby=calc-title]");
  await page.locator("#calc-sem").fill("10");
  await expect(calc).toContainText("нет допуска");
  await page.locator("#calc-sem").fill("60");
  await page.locator("#calc-exam").fill("40");
  await expect(calc).toContainText("100");
  await expect(calc).not.toContainText("нет допуска");
  if (isMobile(page)) await expectNoHorizontalOverflow(page);

  await main.getByRole("link", { name: "Учёба", exact: true }).click();
  await page.waitForURL(/\/grades$/);
  guard.expectClean();

  // чужая или несуществующая дисциплина: 404, без подтверждения существования
  expect((await page.goto("/grades/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
});

test("профиль: зачётка, завершение сеанса и выход", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "leyla");

  // второй «телефон» с узнаваемым браузером: его сеанс и будем завершать
  const phone = await pwRequest.newContext({
    baseURL: BASE_URL,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Firefox/130.0 MGIMO-E2E",
  });
  const res = await phone.post("/api/auth/login", {
    data: { login: DEMO.leyla.login, password: DEMO.leyla.password },
    headers: { Origin: new URL(BASE_URL).origin },
  });
  expect(res.status()).toBe(200);

  await page.goto("/profile");
  const reveal = page.getByRole("button", { name: "Показать полностью" }).first();
  const masked = await reveal.innerText();
  await reveal.click();
  const shown = page.getByRole("button", { name: "Скрыть" }).first();
  await expect(shown).not.toHaveText(masked);
  expect(await shown.innerText()).not.toContain("•");

  const rows = page.locator("li").filter({ hasText: "Firefox, iOS" });
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  // самый свежий сеанс идёт первым: это только что созданный «телефон»
  await rows.first().getByRole("button", { name: "Завершить" }).click();
  await expect(rows).toHaveCount(n - 1);
  const after = await phone.get("/api/notifications/count", { maxRedirects: 0 });
  expect(after.status(), "завершённый сеанс больше не пускает").not.toBe(200);
  await phone.dispose();

  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL(/\/login/);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/);
  guard.expectClean();
});
