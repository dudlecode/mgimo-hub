// Одна страница для жюри: ссылка на прототип, тестовые аккаунты и маршрут на пять минут.
// Запуск: npm run access  (нужен установленный Google Chrome, как и для отчёта)
// Собирает docs/access/index.html и docs/MGIMO-Hub-access.pdf.
import { chromium } from "@playwright/test";
import QRCode from "qrcode";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SITE = "https://34-88-153-35.sslip.io";
const REPO = "github.com/dudlecode/mgimo-hub";
const CHECKED = "10.11.2026";

// Демо-аккаунты из сида (src/db/seed), данные вымышлены
const STUDENTS = [
  ["Анна", "МО, 3 курс, бюджет", "student.anna", "Demo-Anna-26", "идущая пара, переносы, справка с QR"],
  ["Тимур", "МЭО, 2 курс, договор", "student.timur", "Demo-Timur-26", "долг, пересдача, оплата обучения"],
  ["Лейла", "ФЛМК, 1 курс", "student.leyla", "Demo-Leyla-26", "пустые состояния кабинета"],
];
const STAFF = [
  ["Студенческий офис", "", "staff.office", "Demo-Office-26", "очередь всех факультетов, справки"],
  ["Учебный офис МЭО", "", "staff.meo", "Demo-Meo-26", "видит только свой факультет"],
];
const STEPS = [
  ["Войдите как <code>student.anna</code>", "«Сегодня»: идущая пара, изменения, дедлайны."],
  ["Откройте «Помощник»", "«Нужна справка для визы в Италию»: готов черновик."],
  ["Отправьте справку из «Заявок»", "Форма заполнена из профиля, видны статус и срок."],
  ["Войдите как <code>staff.office</code>", "Возьмите заявку в работу, сформируйте справку."],
  ["Вернитесь к <code>student.anna</code>", "Уведомление пришло, справка с QR в «Документах»."],
  ["Подставьте в адрес чужой номер заявки", "«Страница не найдена»: чужое не открывается."],
];

const qr = (() => {
  const q = QRCode.create(SITE, { errorCorrectionLevel: "M" });
  const n = q.modules.size;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${d}" fill="#0a0a0a"/></svg>`;
})();

const mark = (fill, cut) =>
  `<svg width="26" height="26" viewBox="0 0 24 24"><rect width="24" height="24" rx="6.5" fill="${fill}"/><path d="M5.5 17.5V11.25a3.25 3.25 0 0 1 6.5 0V17.5M12 11.25a3.25 3.25 0 0 1 6.5 0V17.5" fill="none" stroke="${cut}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18.6" cy="5.6" r="1.55" fill="${cut}"/></svg>`;

const row = ([who, about, login, password, look]) =>
  `<tr><td><b>${who}</b>${about ? `<span>${about}</span>` : ""}</td><td class="mono">${login}</td><td class="mono">${password}</td><td class="look">${look}</td></tr>`;

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>MGIMO Hub: доступ для жюри</title>
<style>
  @font-face { font-family: "Geist"; src: url("../report/fonts/geist-cyrillic-wght-normal.woff2") format("woff2"); font-weight: 100 900; unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: "Geist"; src: url("../report/fonts/geist-latin-wght-normal.woff2") format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "Geist Mono"; src: url("../report/fonts/geist-mono-cyrillic-wght-normal.woff2") format("woff2"); font-weight: 100 900; unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: "Geist Mono"; src: url("../report/fonts/geist-mono-latin-wght-normal.woff2") format("woff2"); font-weight: 100 900; }
  :root { --ink: #0a0a0a; --ink-2: #3d3d3d; --ink-3: #6b6b6b; --line: #e3e3e3; --soft: #f5f5f5; --brand: #2f54eb; --brand-soft: #eef2fe; }
  @page { size: A4; margin: 13mm 15mm 11mm; }
  * { box-sizing: border-box; margin: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Geist", system-ui, sans-serif; font-size: 9.4pt; line-height: 1.45; color: var(--ink); width: 180mm; }
  .mono, code { font-family: "Geist Mono", ui-monospace, monospace; }
  code { font-size: 0.9em; background: var(--soft); border-radius: 4px; padding: 0.05em 0.35em; }
  a { color: inherit; text-decoration: none; }

  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 9px; font-size: 14pt; letter-spacing: -0.03em; }
  .brand b { font-weight: 650; } .brand span { color: var(--ink-3); }
  .tag { font-family: "Geist Mono"; font-size: 8pt; color: var(--brand); }
  h1 { margin-top: 7mm; font-size: 28pt; line-height: 1.04; letter-spacing: -0.045em; font-weight: 650; }
  .lead { margin-top: 2.5mm; font-size: 11pt; color: var(--ink-2); line-height: 1.4; }

  .link { margin-top: 5.5mm; display: flex; align-items: center; justify-content: space-between; gap: 8mm; background: #0a0a0a; color: #ededed; border-radius: 14px; padding: 5.5mm 7mm; }
  .link .eyebrow { font-family: "Geist Mono"; font-size: 8pt; color: #9db1ff; }
  .link .url { display: block; margin-top: 2mm; font-family: "Geist Mono"; font-size: 16.5pt; font-weight: 500; letter-spacing: -0.02em; color: #ffffff; }
  .link p { margin-top: 2.2mm; font-size: 9pt; color: #b5b5b5; max-width: 118mm; }
  .qr { flex: none; width: 27mm; height: 27mm; padding: 2.1mm; border-radius: 9px; background: #ffffff; }
  .qr svg { display: block; width: 100%; height: 100%; }

  h2 { margin-top: 6mm; font-size: 13pt; font-weight: 650; letter-spacing: -0.02em; }
  .hint { margin-top: 1.2mm; color: var(--ink-3); font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 3mm; }
  th { text-align: left; font-family: "Geist Mono"; font-weight: 500; font-size: 7.6pt; color: var(--ink-3); padding: 0 3mm 1.6mm 0; border-bottom: 1px solid var(--ink); }
  td { padding: 1.9mm 3mm 1.9mm 0; border-bottom: 1px solid var(--line); vertical-align: baseline; }
  td b { font-weight: 600; } td span { font-size: 8.4pt; color: var(--ink-3); margin-left: 2mm; }
  td.mono { font-size: 9.4pt; white-space: nowrap; }
  td.look { color: var(--ink-2); font-size: 9pt; padding-right: 0; }
  tr.group td { padding: 2.6mm 0 0.6mm; border-bottom: 0; font-family: "Geist Mono"; font-size: 7.6pt; color: var(--brand); }

  .steps { margin-top: 2.6mm; display: grid; grid-template-columns: 1fr 1fr; gap: 2.2mm 7mm; }
  .step { display: flex; gap: 3mm; break-inside: avoid; }
  .step i { flex: none; width: 6mm; height: 6mm; border-radius: 50%; background: var(--brand-soft); color: var(--brand); font-style: normal; font-family: "Geist Mono"; font-size: 8pt; display: grid; place-items: center; margin-top: 0.3mm; }
  .step b { display: block; font-weight: 600; } .step span { display: block; color: var(--ink-2); font-size: 8.9pt; line-height: 1.42; }

  .facts { margin-top: 6mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; border-top: 1px solid var(--ink); padding-top: 3.5mm; }
  .facts b { display: block; font-weight: 600; font-size: 9.4pt; } .facts span { display: block; color: var(--ink-3); font-size: 8.4pt; line-height: 1.4; }
  .foot { margin-top: 4mm; display: flex; justify-content: space-between; gap: 8mm; font-size: 8pt; color: var(--ink-3); }
  .foot .mono { color: var(--ink-2); white-space: nowrap; }
</style>
</head>
<body>
  <div class="top">
    <div class="brand">${mark("#0a0a0a", "#ffffff")}<div><b>MGIMO</b> <span>Hub</span></div></div>
    <div class="tag">Доступ для жюри · хакатон «Цифровой деканат будущего»</div>
  </div>

  <h1>Ссылка и тестовые аккаунты</h1>
  <p class="lead">Личный кабинет студента, рабочее место учебного офиса и ИИ-ассистент «Атташе».</p>

  <div class="link">
    <div>
      <div class="eyebrow">Прототип</div>
      <a class="url" href="${SITE}">${SITE.replace("https://", "")}</a>
      <p>Открывается из России и СНГ без VPN, с компьютера и с телефона. На странице входа любой аккаунт открывается одним касанием, пароль вводить не нужно.</p>
    </div>
    <div class="qr">${qr}</div>
  </div>

  <h2>Тестовые аккаунты</h2>
  <p class="hint">Три студента с разными данными и два сотрудника с разной областью видимости. Все люди, оценки и документы вымышлены.</p>
  <table>
    <tr><th style="width:32%">Кто</th><th style="width:17%">Логин</th><th style="width:18%">Пароль</th><th>Что посмотреть</th></tr>
    <tr class="group"><td colspan="4">Студенты</td></tr>
    ${STUDENTS.map(row).join("\n    ")}
    <tr class="group"><td colspan="4">Учебный офис</td></tr>
    ${STAFF.map(row).join("\n    ")}
  </table>

  <h2>Маршрут на пять минут</h2>
  <div class="steps">
    ${STEPS.map(([t, s], i) => `<div class="step"><i>${i + 1}</i><div><b>${t}</b><span>${s}</span></div></div>`).join("\n    ")}
  </div>

  <div class="facts">
    <div><b>Ссылка проверена ${CHECKED}</b><span>Отвечает из России и Казахстана, HTTPS до февраля 2027.</span></div>
    <div><b>Все пять аккаунтов действуют</b><span>Пароли сверены с базой сервера, блокировок нет.</span></div>
    <div><b>Данные можно менять</b><span>Это демо-данные, реальных людей они не затрагивают.</span></div>
  </div>
  <div class="foot">
    <span>Это не официальный сервис МГИМО: логотип университета не используется, у продукта свой знак.</span>
    <span class="mono">Код: ${REPO}</span>
  </div>
</body>
</html>
`;

mkdirSync(resolve("docs/access"), { recursive: true });
const src = resolve("docs/access/index.html");
const out = resolve("docs/MGIMO-Hub-access.pdf");
writeFileSync(src, html);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
// высота содержимого: страница одна, пока оно помещается в 273 мм печатной области
const heightMm = await page.evaluate(() => (document.body.getBoundingClientRect().height * 25.4) / 96);
await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
if (process.env.PREVIEW) {
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.addStyleTag({ content: "html { background: #fff; } body { margin: 13mm 15mm 11mm; }" });
  await page.screenshot({ path: process.env.PREVIEW, fullPage: true });
}
await browser.close();
console.log(`✓ ${out} (${Math.round(statSync(out).size / 1024)} КБ), высота содержимого ${heightMm.toFixed(0)} мм из 273`);
