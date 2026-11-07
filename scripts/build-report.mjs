// Собирает описание процесса для жюри: docs/report/index.html в PDF формата A4.
// Запуск: npm run report  (нужен установленный Google Chrome, как и для e2e-тестов)
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { statSync } from "node:fs";

const src = resolve("docs/report/index.html");
const out = resolve("docs/MGIMO-Hub-process.pdf");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:#8a8a8a;padding:0 15mm;display:flex;justify-content:space-between">
    <span>MGIMO Hub · описание процесса</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log(`✓ ${out} (${Math.round(statSync(out).size / 1024)} КБ)`);
