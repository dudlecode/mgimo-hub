// Кабинет деканата: главные сценарии. Тесты перезапускаемы на одной базе:
// заявки для обработки создаёт сам тест (от имени студента), после теста они удаляются через psql
// (иначе студент упирается в лимит 15 заявок в час и повторный прогон падает).
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { attachConsoleGuard, loginAs, type DemoKey } from "./helpers";

const UUID = /^[0-9a-f-]{36}$/;
const created: string[] = [];

function sql(query: string) {
  execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "attache", "-d", "attache", "-At", "-c", query], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

/** Удаляет созданные тестом заявки (события удаляются каскадом) и уведомления со ссылкой на них. */
test.afterEach(() => {
  const ids = created.splice(0).filter((id) => UUID.test(id));
  if (!ids.length) return;
  const list = ids.map((id) => `'${id}'`).join(",");
  const links = ids.map((id) => `link like '%${id}%'`).join(" or ");
  sql(`delete from notifications where ${links}; delete from requests where id in (${list});`);
});

/** Студент подаёт справку об обучении через свой кабинет. Возвращает id заявки. */
async function studentSubmitsCertificate(page: Page, who: DemoKey): Promise<string> {
  await loginAs(page, who);
  await page.goto("/requests/new/study-certificate");
  await page.locator('select[name="purpose"]').selectOption({ index: 1 });
  await page.locator('form:has(input[name="type"]) button[type="submit"]').click();
  // ошибка формы (например, лимит заявок в час) должна падать сразу и с понятным текстом
  const formError = page.locator('form [aria-live="polite"] .text-danger, form [role="alert"]').first();
  await Promise.race([page.waitForURL(/\/requests\/[0-9a-f-]{36}/), formError.waitFor({ state: "visible" })]);
  if (!/\/requests\/[0-9a-f-]{36}/.test(page.url())) {
    throw new Error(`заявка ${who} не создана: ${(await formError.innerText()).trim()}`);
  }
  const id = new URL(page.url()).pathname.split("/")[2];
  created.push(id);
  return id;
}

/** Нажимает кнопку панели действий и ждёт новый статус заявки. */
async function act(page: Page, button: string, status: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(page.locator("main").getByText(status, { exact: true }).first()).toBeVisible();
}

test("очередь: плитки ведут в отфильтрованный список, поиск без результатов показывает пустое состояние", async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, "office");
  await page.goto("/staff");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ирина");
  await expect(page.getByText("Требуют внимания")).toBeVisible();
  await page.getByRole("link", { name: /^Новые/ }).click();
  await expect(page).toHaveURL(/filter=new/);
  await expect(page.getByRole("link", { name: "Новые", exact: true })).toHaveClass(/bg-brand/);
  await page.getByRole("searchbox", { name: "Поиск заявок" }).or(page.getByLabel("Поиск заявок")).fill("нет-такой-заявки");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  guard.expectClean();
});

test("заявка: взять в работу, черновик Атташе, подготовить справку с QR, выдать", async ({ page }, info) => {
  const id = await studentSubmitsCertificate(page, "timur");
  await loginAs(page, "office");
  await page.goto(`/staff/requests/${id}`);
  await act(page, "Взять в работу", "На рассмотрении");

  // Черновик ИИ: один вызов модели на весь прогон, только в desktop-проекте
  const msg = page.getByLabel("Сообщение студенту");
  if (info.project.name === "desktop") {
    await page.getByRole("button", { name: "Статус", exact: true }).click();
    await expect(msg).not.toHaveValue("", { timeout: 30_000 });
  } else {
    await msg.fill("Заявка в работе, справка будет готова сегодня.");
  }
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.getByText("Сообщение от учебного офиса")).toBeVisible();

  await act(page, "Начать подготовку", "Готовится");
  await act(page, "Сформировать справку с QR", "Готова");
  await page.getByRole("link", { name: "Справка для печати" }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/requests/${id}/document`));
  await expect(page.getByText(/МГИМО|Справка/).first()).toBeVisible();
  await page.goto(`/staff/requests/${id}`);
  await act(page, "Выдано, закрыть", "Получена");
  await expect(page.getByRole("main").getByText("Заявка закрыта", { exact: true })).toBeVisible();
});

test("заявка: запрос уточнения у студента, отказ с причиной; staff.meo не видит заявку ФЛМК", async ({ page }) => {
  const id = await studentSubmitsCertificate(page, "leyla");
  await loginAs(page, "meo");
  expect((await page.goto(`/staff/requests/${id}`))?.status()).toBe(404);

  await loginAs(page, "office");
  await page.goto(`/staff/requests/${id}`);
  await act(page, "Взять в работу", "На рассмотрении");
  // без текста запрос не уходит
  await page.getByRole("button", { name: "Запросить данные" }).click();
  await expect(page.getByText("Напишите сообщение студенту")).toBeVisible();
  await page.getByLabel("Сообщение студенту").fill("Уточните, пожалуйста, название организации.");
  await act(page, "Запросить данные", "Нужно уточнение");
  await expect(page.getByText("Ждём ответа студента.")).toBeVisible();
  await page.getByLabel("Сообщение студенту").fill("Заявка закрыта по итогам проверки, подайте новую с названием организации.");
  await act(page, "Отклонить", "Отклонена");
});

test("генератор справок: выбрать студента, оформить, открыть бланк, выдать", async ({ page }) => {
  await loginAs(page, "office");
  await page.goto("/staff/certificates");
  await page.getByRole("button", { name: "Сформировать справку" }).click();
  await expect(page.getByText("Выберите студента", { exact: true })).toBeVisible();

  await page.getByLabel("Поиск студента").fill("Тимур");
  await page.getByRole("button", { name: /Тимур/ }).first().click();
  await expect(page.getByText(/^Для: .*Тимур/)).toBeVisible();
  await page.getByLabel("Тип").selectOption("study-certificate");
  await page.locator('select[name="purpose"]').selectOption({ index: 1 });
  await page.getByRole("button", { name: "Сформировать справку" }).click();
  await page.waitForURL(/\/staff\/requests\/[0-9a-f-]{36}\/document/);
  const id = new URL(page.url()).pathname.split("/")[3];
  created.push(id);
  await page.goto(`/staff/requests/${id}`);
  await expect(page.getByText("Оформлено в учебном офисе").first()).toBeVisible();
  await act(page, "Выдано, закрыть", "Получена");
});

test("объявление: опубликовать для одной группы и удалить", async ({ page }) => {
  await loginAs(page, "office");
  await page.goto("/staff/announcements");
  const title = `Проверка объявления ${Date.now()}`;
  await page.getByLabel("Заголовок").fill(title);
  await page.getByLabel("Текст").fill("Консультация переносится на пятницу, аудитория прежняя.");
  await page.getByLabel("Группа").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText(/Опубликовано\. Уведомление получили \d+/)).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Удалить «${title}»` }).click();
  await expect(page.getByText("Объявление удалено")).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
});

test("расписание: сменить аудиторию и вернуть как было", async ({ page }) => {
  const startedAt = new Date().toISOString();
  await loginAs(page, "office");
  await page.goto("/staff/schedule");
  // ищем ближайший день с занятием по расписанию, которое ещё не прошло
  for (let i = 0; i < 14 && !(await page.getByRole("button", { name: "Аудитория" }).count()); i++) {
    await page.getByRole("link", { name: "Следующий день" }).click();
    await page.waitForLoadState("networkidle");
  }
  const first = page.locator("div.p-4", { has: page.getByRole("button", { name: "Аудитория" }) }).first();
  const title = (await first.locator("span.font-semibold").first().innerText()).trim();
  const time = (await first.locator(".tabular .font-semibold").innerText()).trim();
  // карточку фиксируем по названию и времени: после клика кнопки «Аудитория» в ней уже нет
  const card = page.locator("div.p-4", { hasText: title }).filter({ hasText: time }).first();
  await card.getByRole("button", { name: "Аудитория" }).click();
  await card.getByPlaceholder(/Новая аудитория/).fill("E2E-101");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(/Другая аудитория\. Уведомлено студентов: \d+/)).toBeVisible();

  await expect(card.getByText("Другая аудитория", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Вернуть как было" }).click();
  await expect(page.getByText(/Занятие по расписанию\. Уведомлено студентов/)).toBeVisible();
  await expect(page.getByText("E2E-101")).toHaveCount(0);
  // уведомления студентам о тестовой смене аудитории и её отмене не оставляем в демо-данных
  sql(`delete from notifications where kind = 'schedule' and created_at >= '${startedAt}' and body like '${title.replace(/'/g, "''")}%'`);
});

test("студенты: поиск, карточка студента и запись о просмотре в журнале с фильтром", async ({ page }) => {
  await loginAs(page, "office");
  await page.goto("/staff/students");
  await page.getByLabel("Поиск студентов").fill("Борисова");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=/);
  await page.getByRole("link", { name: /Борисова София/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Борисова");
  await expect(page.locator("main").getByText("Успеваемость", { exact: false }).first()).toBeVisible();

  await page.goto("/staff/audit");
  await page.getByLabel("Тип действия").selectOption("student.view");
  await expect(page).toHaveURL(/action=/);
  await expect(page.getByText(/Борисова/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Сегодня" }).click();
  await expect(page).toHaveURL(/period=/);
});

test("staff.meo видит только МЭО: нет МО в списках, карточка и заявка МО отдают 404", async ({ page }) => {
  await loginAs(page, "office");
  await page.goto("/staff/students?q=Борисова");
  const moStudent = await page.getByRole("link", { name: /Борисова София/ }).getAttribute("href");
  await page.goto("/staff/requests?q=МО-");
  const moRequest = await page.locator("a[href^='/staff/requests/']").first().getAttribute("href");

  await loginAs(page, "meo");
  await page.goto("/staff/students");
  // ждём, пока вместо скелетона появится список (innerText не ждёт сам)
  await expect(page.locator("main")).toContainText("МЭО-");
  const students = await page.locator("main").innerText();
  expect(students).toContain("МЭО-");
  expect(students).not.toMatch(/МО-\d/);
  await page.goto("/staff/requests?filter=closed");
  await expect(page.locator("main")).toContainText(/\d+ в списке/);
  expect(await page.locator("main").innerText()).not.toMatch(/· МО(\s|$)/m);
  expect((await page.goto(moStudent!))?.status()).toBe(404);
  expect((await page.goto(moRequest!))?.status()).toBe(404);
});
