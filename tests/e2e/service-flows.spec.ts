// Запись на приём, больничный и оплата: главные сценарии студента и учебного офиса.
// Тесты меняют данные, поэтому всё созданное откатывают через psql (docker compose, база attache).
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { attachConsoleGuard, expectCleanText, expectNoHorizontalOverflow, loginAs } from "./helpers";

const MARK = "e2e-autotest";
const UUID = /^[0-9a-f-]{36}$/;

function sql(query: string): string {
  return execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "attache", "-d", "attache", "-At", "-c", query], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function uuid(v: string | null | undefined): string {
  expect(v ?? "", "id из страницы").toMatch(UUID);
  return v as string;
}

/** Студенты демо-аккаунтов: их записи и платежи тесты сотрудника не трогают. */
const demoStudentIds = () => new Set(sql("select s.id from students s join users u on u.id = s.user_id where u.login like 'student.%'").split("\n"));

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

test.describe.configure({ mode: "serial" });

test("Лейла записывается на приём, видит талон и отменяет запись", async ({ page }) => {
  sql(`delete from appointments where comment = '${MARK}'`);
  const guard = attachConsoleGuard(page);
  await loginAs(page, "leyla");
  await page.goto("/appointments");

  await page.getByRole("group", { name: "Тема обращения" }).getByRole("button").first().click();
  // Первый день со свободными слотами выбран сам, берём первый свободный слот
  const slot = page.locator("button[aria-pressed]:not([disabled])").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
  await slot.click();
  await expect(slot).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Комментарий для специалиста").fill(MARK);
  await page.getByRole("button", { name: "Записаться" }).click();

  await page.waitForURL(/\/appointments\/[0-9a-f-]{36}\?booked=1/);
  await expect(page.getByRole("heading", { name: "Вы записаны" })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR/ })).toBeVisible();
  const ics = page.getByRole("link", { name: "Добавить в календарь" });
  const icsRes = await page.request.get((await ics.getAttribute("href")) ?? "");
  expect(icsRes.status()).toBe(200);
  expect(await icsRes.text()).toContain("BEGIN:VCALENDAR");
  await expectCleanText(page);
  if (isMobile(page)) await expectNoHorizontalOverflow(page);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Отменить запись" }).click();
  await page.waitForURL(/\/appointments\?cancelled=1/);
  await expect(page.getByRole("status")).toContainText("Запись отменена");
  guard.expectClean();
  sql(`delete from appointments where comment = '${MARK}'`);
});

test("сотрудник отмечает явку или отменяет запись студента из массовки", async ({ page }) => {
  const started = new Date().toISOString();
  const demo = demoStudentIds();
  await loginAs(page, "office");

  // Сегодня можно отметить явку; если сегодня записей нет, отменяем запись ближайшего дня с записями
  type Target = { id: string; kind: "done" | "cancel" };
  let target: Target | null = null;
  await page.goto("/staff/appointments");
  for (let i = 0; i < 6 && !target; i++) {
    for (const row of await page.locator("form:has(input[name=id])").all()) {
      const id = await row.locator("input[name=id]").getAttribute("value");
      if (!id || !UUID.test(id)) continue;
      const owner = sql(`select student_id from appointments where id = '${id}'`);
      if (demo.has(owner)) continue;
      if (await row.getByRole("button", { name: "Пришёл", exact: true }).count()) target = { id, kind: "done" };
      else if (await row.getByRole("button", { name: "Отменить", exact: true }).count()) target = { id, kind: "cancel" };
      if (target) break;
    }
    if (!target) {
      await page.getByRole("link", { name: "Следующий рабочий день" }).click();
      await page.waitForLoadState("networkidle");
    }
  }
  expect(target, "в ближайшие дни есть запись студента из массовки").not.toBeNull();
  const { id, kind } = target as Target;
  const row = page.locator(`form:has(input[name=id][value="${id}"])`);
  try {
    if (kind === "done") {
      await row.getByRole("button", { name: "Пришёл", exact: true }).click();
      await expect(toast(page, "Отмечено: пришёл")).toBeVisible();
    } else {
      await row.getByRole("button", { name: "Отменить", exact: true }).click();
      const form = page.locator(`form:has(input[name=id][value="${id}"])`);
      await form.getByPlaceholder("Причина, студент её увидит").fill("Специалист заболел");
      await form.getByRole("button", { name: "Отменить запись" }).click();
      await expect(toast(page, "Запись отменена")).toBeVisible();
    }
    expect(sql(`select status from appointments where id = '${id}'`)).toBe(kind === "done" ? "done" : "cancelled");
  } finally {
    sql(`update appointments set status = 'booked', cancel_reason = null where id = '${uuid(id)}'`);
    sql(`delete from notifications where title = 'Запись на приём отменена' and created_at >= '${started}'`);
  }
});

test("Анна открывает больничный, готовит письмо, закрывает со справкой, сотрудник засчитывает", async ({ page, browser }) => {
  test.setTimeout(120_000);
  sql(`delete from sick_leaves where comment = '${MARK}'`);
  const started = new Date().toISOString();
  const guard = attachConsoleGuard(page);
  await loginAs(page, "anna");
  await page.goto("/sick-leave");
  try {
    // Примерно две недели: в период почти наверняка попадёт контрольная, к ней есть письмо
    const until = new Date(Date.now() + 14 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
    await page.getByLabel("Примерно до какого").fill(until);
    await page.getByLabel("Комментарий для учебного офиса").fill(MARK);
    await page.getByRole("button", { name: "Сообщить о болезни" }).click();
    await expect(page.getByRole("heading", { name: /Вы на больничном с/ })).toBeVisible();

    const letterBtn = page.getByRole("button", { name: "Письмо преподавателю" }).first();
    if (await letterBtn.count()) {
      await letterBtn.click();
      await expect(page.getByLabel("Тема", { exact: true }).first()).not.toHaveValue("", { timeout: 45_000 });
      await expect(page.getByLabel("Письмо", { exact: true }).first()).toHaveValue(/\S{10,}/);
    } else {
      test.info().annotations.push({ type: "note", description: "в период больничного нет контрольных, письмо не проверено" });
    }
    if (isMobile(page)) await expectNoHorizontalOverflow(page);
    await expectCleanText(page);

    // Минимальный PNG 1x1: сервер проверяет сигнатуру
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await page.locator("#sl-file").setInputFiles({ name: "spravka.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("spravka.png")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть больничный" }).click();
    await expect(toast(page, "Справка отправлена")).toBeVisible();
    await expect(page.getByRole("button", { name: "Сообщить о болезни" })).toBeVisible();
    await expect(page.getByText("На проверке").first()).toBeVisible();
    guard.expectClean();

    const staff = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
    await loginAs(staff, "office");
    await staff.goto("/staff/sick-leaves");
    const row = staff.locator("div.px-5.py-4").filter({ has: staff.getByRole("link", { name: /Орлова Анна/ }) }).filter({ hasText: MARK });
    await expect(row.getByRole("link", { name: "Открыть справку" })).toBeVisible();
    await row.getByRole("button", { name: "Засчитать" }).click();
    await expect(toast(staff, "Засчитано")).toBeVisible();
    expect(sql(`select status from sick_leaves where comment = '${MARK}'`)).toBe("approved");
    await staff.close();
  } finally {
    sql(`delete from sick_leaves where comment = '${MARK}'`);
    sql(`delete from notifications where title in ('Больничный засчитан', 'Справка на проверке') and created_at >= '${started}'`);
  }
});

test("оплата: Тимур видит платёж и квитанцию, у Анны на бюджете пустое состояние", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "timur");
  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Ближайший платёж" })).toBeVisible();
  await expect(page.getByText(/₽/).first()).toBeVisible();
  await page.getByRole("link", { name: "Квитанция" }).first().click();
  await page.waitForURL(/\/payments\/[0-9a-f-]{36}\/receipt/);
  await expect(page.getByText("Квитанция на оплату", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Галиев Тимур").first()).toBeVisible();
  if (isMobile(page)) await expectNoHorizontalOverflow(page);
  guard.expectClean();

  await page.context().clearCookies();
  await loginAs(page, "anna");
  await page.goto("/payments");
  await expect(page.getByText("Вы учитесь на бюджетном месте")).toBeVisible();
});

test("сотрудник напоминает об оплате и отмечает оплату студенту из массовки", async ({ page }) => {
  const started = new Date().toISOString();
  const demo = demoStudentIds();
  await loginAs(page, "office");
  await page.goto("/staff/payments?filter=all");

  const rows = page.locator("div.px-5.py-4:has(form input[name=id])");
  let remindId: string | null = null;
  let paidId: string | null = null;
  for (const r of await rows.all()) {
    const id = await r.locator("input[name=id]").first().getAttribute("value");
    if (!id || !UUID.test(id) || demo.has(sql(`select student_id from tuition_payments where id = '${id}'`))) continue;
    const remindBtn = r.getByRole("button", { name: "Напомнить", exact: true });
    if (!remindId && (await remindBtn.count()) && (await remindBtn.isEnabled())) remindId = id;
    else if (!paidId) paidId = id;
    if (remindId && paidId) break;
  }
  expect(remindId, "есть платёж без недавнего напоминания").not.toBeNull();
  expect(paidId, "есть ещё один неоплаченный платёж").not.toBeNull();
  const prevReminded = sql(`select coalesce(reminded_at::text, '') from tuition_payments where id = '${uuid(remindId)}'`);

  try {
    const remindRow = page.locator(`div.px-5.py-4:has(input[name=id][value="${remindId}"])`);
    await remindRow.getByRole("button", { name: "Напомнить", exact: true }).click();
    await expect(toast(page, "Напоминание отправлено")).toBeVisible();
    await expect(remindRow.getByRole("button", { name: "Напомнили" })).toBeDisabled();

    const paidRow = page.locator(`div.px-5.py-4:has(input[name=id][value="${paidId}"])`);
    await paidRow.getByRole("button", { name: "Отметить оплату" }).click();
    await paidRow.getByLabel(/Номер платёжного документа/).fill("E2E-518204");
    await paidRow.getByRole("button", { name: "Сохранить" }).click();
    await expect(toast(page, "Оплата отмечена")).toBeVisible();
    expect(sql(`select receipt_no from tuition_payments where id = '${uuid(paidId)}'`)).toBe("E2E-518204");
  } finally {
    sql(`update tuition_payments set reminded_at = ${prevReminded ? `'${prevReminded}'` : "null"} where id = '${uuid(remindId)}'`);
    sql(`update tuition_payments set paid_at = null, receipt_no = null where id = '${uuid(paidId)}' and receipt_no = 'E2E-518204'`);
    sql(`delete from notifications where kind = 'payment' and created_at >= '${started}'`);
  }
});
