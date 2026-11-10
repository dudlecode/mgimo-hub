// Смоук: каждый аккаунт открывает все пункты своего меню.
// Страница: статус < 400, без ошибок консоли, без горизонтальной прокрутки на mobile, без длинных тире и стрелок.
import { expect, type Page } from "@playwright/test";
import { attachConsoleGuard, expectCleanText, expectNoHorizontalOverflow, loginAs, setLocale, test, type DemoKey, type Locale } from "./helpers";

/** Ссылки всех меню на странице (боковое и нижнее), включая скрытые на текущей ширине. */
async function menuLinks(page: Page): Promise<string[]> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>("nav a[href]"))
      .map((a) => new URL(a.href).pathname)
      .filter((p) => p.startsWith("/")),
  );
  return [...new Set(hrefs)];
}

async function visitAll(page: Page, who: DemoKey, home: string, extra: string[]) {
  const guard = attachConsoleGuard(page);
  await loginAs(page, who);
  await page.goto(home);
  const links = [...new Set([home, ...(await menuLinks(page)), ...extra])];
  expect(links.length, "в меню есть пункты").toBeGreaterThan(3);
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  const failures: string[] = [];
  for (const path of links) {
    guard.clear();
    const res = await page.goto(path, { waitUntil: "load" });
    const status = res?.status() ?? 0;
    if (status >= 400) {
      failures.push(`${path}: HTTP ${status}`);
      continue;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    try {
      await expectCleanText(page);
      if (isMobile) await expectNoHorizontalOverflow(page);
    } catch (e) {
      failures.push(`${path}: ${(e as Error).message.split("\n")[0]}`);
    }
    const errs = guard.errors();
    if (errs.length) failures.push(`${path}: ${errs.join(" | ").slice(0, 300)}`);
  }
  expect(failures, `проблемы для ${who}`).toEqual([]);
}

const STUDENTS: DemoKey[] = ["anna", "timur", "leyla"];
const LOCALES: Locale[] = ["ru", "en"];

for (const who of STUDENTS) {
  for (const locale of LOCALES) {
    test(`студент ${who} (${locale}): все пункты меню открываются`, async ({ page }) => {
      await setLocale(page, locale);
      await visitAll(page, who, "/", ["/profile"]);
      if (locale === "en") {
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
      }
    });
  }
}

for (const who of ["office", "meo"] as DemoKey[]) {
  test(`сотрудник ${who}: все пункты меню открываются`, async ({ page }) => {
    await visitAll(page, who, "/staff", []);
  });
}

test("без входа кабинет перенаправляет на /login", async ({ page }) => {
  await page.goto("/grades");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login/);
});
