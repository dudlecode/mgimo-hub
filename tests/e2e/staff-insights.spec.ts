// Деканат: радар рисков, аналитика, пересдачи и направление у студента.
// Тесты перезапускаемы на той же базе: цели выбираются по странице, созданное откатывается через БД.
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { attachConsoleGuard, expectCleanText, expectNoHorizontalOverflow, loginAs, setLocale } from "./helpers";

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

const toast = (page: Page) => page.locator("[data-sonner-toast]");

/** Строка долга с кнопкой «Назначить» по её якорю: после щелчка подпись кнопки меняется на «Свернуть». */
async function debtWithoutDate(page: Page, button: RegExp) {
  const first = page.locator("[id^='d-']").filter({ has: page.getByRole("button", { name: button }) }).first();
  if (!(await first.count())) return null;
  return page.locator(`[id="${await first.getAttribute("id")}"]`);
}

test.describe("радар рисков", () => {
  test("уровни и группа фильтруют список", async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await loginAs(page, "office");
    await page.goto("/staff/radar");
    await expect(page.getByRole("heading", { name: "Радар рисков" })).toBeVisible();
    const all = await page.getByRole("button", { name: "Написать" }).count();
    expect(all).toBeGreaterThan(0);
    await expectCleanText(page);
    await expectNoHorizontalOverflow(page);

    await page.getByRole("tab", { name: /^Высокий/ }).click();
    await page.waitForURL(/level=high/);
    await expect(page.getByRole("tab", { name: /^Высокий/ })).toHaveAttribute("aria-selected", "true");
    const high = await page.getByRole("button", { name: "Написать" }).count();
    expect(high).toBeLessThanOrEqual(all);

    // группа сохраняет выбранный уровень
    await page.getByLabel("Группа").selectOption({ index: 1 });
    await page.waitForURL((u) => u.searchParams.has("group") && u.searchParams.get("level") === "high");
    await expect(page.getByRole("tab", { name: /^Высокий/ })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: /^Все/ }).click();
    await page.waitForURL((u) => !u.searchParams.has("level"));
    await page.getByLabel("Группа").selectOption("");
    await page.waitForURL((u) => !u.searchParams.has("group"));
    await expect(page.getByRole("button", { name: "Написать" })).toHaveCount(all);
    guard.expectClean();
  });

  test("Написать, черновик Атташе и отправка студенту", async ({ page }, info) => {
    const started = new Date();
    const guard = attachConsoleGuard(page);
    await loginAs(page, "office");
    await page.goto("/staff/radar");
    // последний в списке: самый низкий риск, чтобы не засорять демо-уведомления главных героев
    await page.getByRole("button", { name: "Написать" }).last().click();
    const message = page.locator("textarea[name=message]");
    await expect(message).toBeFocused();
    const send = page.getByRole("button", { name: "Отправить" });
    await expect(send).toBeDisabled();

    if (info.project.name === "desktop") {
      // один вызов ИИ на прогон: без ключа ответит шаблон, тоже годится
      await page.getByRole("button", { name: "Черновик Атташе" }).click();
      await expect(message).not.toHaveValue("", { timeout: 45_000 });
      await expect(page.getByText(/^Черновик (Атташе|по шаблону), проверьте перед отправкой$/)).toBeVisible();
      expect(await message.inputValue()).not.toMatch(/[—→←]/);
    } else {
      await message.fill("Добрый день! Учебный офис готов помочь с учёбой, запишитесь, пожалуйста, на приём.");
    }

    try {
      await send.click();
      await expect(toast(page).filter({ hasText: "Сообщение отправлено" })).toBeVisible();
      await expect(message).toHaveCount(0);
      guard.expectClean();
    } finally {
      // только сообщения радара: у них ссылка на «Учёбу», у ответов по заявкам ссылка на заявку
      await sql("delete from notifications where title like 'Сообщение от%' and link = '/grades' and created_at >= $1", [started]);
    }
  });
});

test("аналитика: периоды, подсказки диаграмм, пояснение осей", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "office");
  await page.goto("/staff/analytics");
  await expect(page.getByRole("heading", { name: "Аналитика" })).toBeVisible();
  const subtitle = page.getByText(/^Заявки с \d+ \S+ по \d+ \S+, успеваемость за/);
  const initial = await subtitle.innerText();

  await page.getByRole("tab", { name: "4 недели" }).click();
  await page.waitForURL(/period=4w/);
  await expect(page.getByRole("tab", { name: "4 недели" })).toHaveAttribute("aria-selected", "true");
  await expect(subtitle).not.toHaveText(initial);
  await page.getByRole("tab", { name: "Семестр" }).click();
  await page.waitForURL(/period=sem/);
  await expect(page.getByRole("tab", { name: "Семестр" })).toHaveAttribute("aria-selected", "true");
  await expectCleanText(page);
  await expectNoHorizontalOverflow(page);

  // подсказка появляется при наведении на каждую диаграмму с осями
  const tip = page.locator("div.pointer-events-none.absolute.z-10");
  for (const label of [/^Качество работы офиса/, /^Успеваемость групп/, /^Заявки по неделям/, /^Подача заявок по дням недели/]) {
    const svg = page.getByRole("img", { name: label });
    // по центру экрана: на 360 px нижнее меню перекрывает край окна
    await svg.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const box = (await svg.boundingBox())!;
    // чуть выше центра: в самом центре «паучьей» диаграммы мёртвая зона
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
    await expect(tip.first(), `подсказка: ${label}`).toBeVisible();
    await page.mouse.move(0, 0);
  }

  const how = page.locator("summary", { hasText: "Как считаются оси" }).first();
  await how.click();
  await expect(page.getByText("доля готовых заявок, закрытых не позже срока")).toBeVisible();
  guard.expectClean();
});

test.describe("пересдачи", () => {
  test("Назначить: Предложить дату, черновик в графике, удаление черновика", async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await loginAs(page, "meo");
    await page.goto("/staff/retakes");
    await expect(page.getByRole("heading", { name: "Пересдачи" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const row = await debtWithoutDate(page, /^Назначить/);
    test.skip(!row, "все долги области уже с датой");
    if (!row) return;
    const discipline = (await row.locator("span.font-semibold").first().innerText()).trim();

    await row.getByRole("button", { name: /^Назначить/ }).click();
    await row.getByRole("button", { name: "Предложить дату" }).click();
    await expect(row.locator("input[type=date]")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(row.locator("input[name=room]")).not.toHaveValue("");
    await expect(row.locator("p[aria-live]")).toContainText("не занята");
    await expectNoHorizontalOverflow(page);

    await row.getByRole("button", { name: "Добавить в график" }).click();
    await expect(toast(page).filter({ hasText: "Пересдача в графике" })).toBeVisible();
    const session = page.locator("[id^='s-']").filter({ hasText: discipline }).filter({ hasText: "Черновик" });
    await expect(session).toBeVisible();
    await expect(row.getByText(/^Черновик на/)).toBeVisible();

    await session.getByRole("button", { name: "Удалить черновик" }).click();
    await expect(toast(page).filter({ hasText: "Черновик удалён" })).toBeVisible();
    await expect(session).toHaveCount(0);
    await expect(row.getByText("Без даты")).toBeVisible();
    guard.expectClean();
  });

  test("выпуск направлений в два касания, студенты получают направления", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "выпуск меняет данные, достаточно одного проекта");
    const started = new Date();
    const guard = attachConsoleGuard(page);
    await loginAs(page, "meo");
    await page.goto("/staff/retakes");
    const row = await debtWithoutDate(page, /^Назначить$/);
    test.skip(!row, "нет долга без даты");
    if (!row) return;
    const discipline = (await row.locator("span.font-semibold").first().innerText()).trim();

    try {
      await row.getByRole("button", { name: "Назначить" }).click();
      await row.getByRole("button", { name: "Предложить дату" }).click();
      await expect(row.locator("input[type=date]")).toHaveValue(/^\d{4}-/);
      await row.getByRole("button", { name: "Добавить в график" }).click();
      const session = page.locator("[id^='s-']").filter({ hasText: discipline });
      await expect(session.getByText("Черновик", { exact: true })).toBeVisible();

      await session.getByRole("button", { name: "Выпустить направления" }).click();
      await session.getByRole("button", { name: "Отмена" }).click();
      await session.getByRole("button", { name: "Выпустить направления" }).click();
      await session.getByRole("button", { name: /^Отправить \d+ студент/ }).click();
      await expect(toast(page).filter({ hasText: /выпущено направлений \d+/ })).toBeVisible();
      await expect(session.getByText("Направления выпущены")).toBeVisible();
      await expect(session.getByText(/№ П-\d{4}-\d{4}/).first()).toBeVisible();
      guard.expectClean();
    } finally {
      // откат: направления, уведомления о них, дата в зачётке, сама пересдача
      const ids = (await sql("select id from retake_sessions where created_at >= $1", [started])).map((r) => r.id as string);
      if (ids.length) {
        await sql("delete from notifications where link in (select '/grades/retakes/' || id from retake_referrals where retake_session_id = any($1))", [ids]);
        await sql("update final_grades set retake_at = null, retake_room = null where id in (select final_grade_id from retake_referrals where retake_session_id = any($1))", [ids]);
        await sql("delete from retake_referrals where retake_session_id = any($1)", [ids]);
        await sql("delete from retake_sessions where id = any($1)", [ids]);
      }
    }
  });

  test("результат: проверка баллов на сервере", async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await loginAs(page, "office");
    await page.goto("/staff/retakes#results");
    const select = page.getByLabel(/^Результат: /).first();
    test.skip((await select.count()) === 0, "нет прошедших пересдач без результата");
    const form = page.locator("form").filter({ has: select });
    await expect(form.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    const pass = (await select.locator("option").allInnerTexts()).find((t) => t.startsWith("Сдал"))!;
    await select.selectOption({ label: pass });
    // 10 баллов не дают положительную оценку: сервер отклоняет, ничего не сохраняется
    await form.getByLabel(/^Баллы/).fill("10");
    await form.getByRole("button", { name: "Сохранить" }).click();
    await expect(toast(page).filter({ hasText: "баллы не подходят" })).toBeVisible();
    await expect(select).toBeVisible();
    guard.expectClean();
  });
});

test("Тимур: направление на пересдачу из Учёбы, ru и en", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "timur");
  for (const [locale, title] of [
    ["ru", "Направление на пересдачу"],
    ["en", "Retake referral"],
  ] as const) {
    await setLocale(page, locale);
    await page.goto("/grades?tab=session");
    await page.locator("a[href^='/grades/retakes/']").first().click();
    await page.waitForURL(/\/grades\/retakes\/[0-9a-f-]{36}$/);
    await expect(page).toHaveTitle(new RegExp(`^${title}`));
    await expect(page.getByRole("heading", { name: "Направление на пересдачу" })).toBeVisible();
    await expect(page.getByText("Галиев Тимур Ренатович")).toBeVisible();
    await expectCleanText(page);
    await expectNoHorizontalOverflow(page);
  }
  // чужое или несуществующее направление: 404
  const res = await page.goto("/grades/retakes/00000000-0000-4000-8000-000000000000");
  expect(res?.status()).toBe(404);
  const [foreign] = await sql("select r.id from retake_referrals r join students s on s.id = r.student_id where not (s.last_name = 'Галиев' and s.first_name = 'Тимур') limit 1");
  if (foreign) expect((await page.goto(`/grades/retakes/${foreign.id}`))?.status()).toBe(404);
  guard.clear();
  guard.expectClean();
});
