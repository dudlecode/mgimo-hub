// Картинки для README: снимает живой кабинет и кладёт экраны в рамку браузера и телефона.
// Нужен запущенный сервер с демо-данными и установленный Google Chrome.
//
//   BASE_URL=http://localhost:3000 node scripts/readme-images.mjs
//
// Главная картинка (hero) снимается заново в двух темах, остальные экраны берутся из docs/report/img.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = process.cwd();
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(ROOT, "docs/readme");
const REPORT = path.join(ROOT, "docs/report/img");
const TMP = mkdtempSync(path.join(tmpdir(), "readme-"));
const FONTS = path.join(ROOT, "node_modules/@fontsource-variable/geist/files");
mkdirSync(OUT, { recursive: true });

// Демо-аккаунт из сида (src/db/seed), данные вымышлены
const ANNA = { login: "student.anna", password: "Demo-Anna-26" };

const THEMES = {
  dark: { canvas: "#0a0a0a", edge: "#262626", bar: "#111111", line: "#222222", dot: "#333333", ink: "#a3a3a3", bezel: "#050505", bezelEdge: "#3a3a3a", grid: "rgba(255,255,255,0.055)" },
  light: { canvas: "#f4f4f5", edge: "#dcdcde", bar: "#f7f7f7", line: "#e0e0e0", dot: "#cfcfcf", ink: "#666666", bezel: "#0a0a0a", bezelEdge: "#0a0a0a", grid: "rgba(0,0,0,0.07)" },
};

const css = (t) => `
@font-face { font-family: Geist; src: url("file://${FONTS}/geist-cyrillic-wght-normal.woff2") format("woff2"); font-weight: 100 900; unicode-range: U+0400-04FF, U+2116; }
@font-face { font-family: Geist; src: url("file://${FONTS}/geist-latin-wght-normal.woff2") format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { background: transparent; }
body { font-family: Geist, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.canvas { position: relative; overflow: hidden; border-radius: 28px; background-color: ${t.canvas}; border: 1px solid ${t.edge};
  background-image: radial-gradient(${t.grid} 1px, transparent 1.2px); background-size: 22px 22px; background-position: 11px 11px; }
.browser { position: absolute; border-radius: 14px; overflow: hidden; border: 1px solid ${t.edge}; background: ${t.bar}; }
.browser .bar { height: 38px; display: flex; align-items: center; gap: 7px; padding: 0 14px; border-bottom: 1px solid ${t.line}; position: relative; }
.browser .bar i { width: 10px; height: 10px; border-radius: 50%; background: ${t.dot}; display: block; }
.browser .bar span { position: absolute; left: 50%; transform: translateX(-50%); font-size: 12.5px; color: ${t.ink}; letter-spacing: -0.01em; display: flex; align-items: center; gap: 7px; }
.browser img { display: block; width: 100%; }
.phone { position: absolute; border-radius: 40px; padding: 9px; background: ${t.bezel}; border: 1px solid ${t.bezelEdge}; }
.phone img { display: block; width: 100%; border-radius: 31px; }
`;

const mark = (t) =>
  `<svg width="14" height="14" viewBox="0 0 24 24"><rect width="24" height="24" rx="6.5" fill="${t.ink}"/><path d="M5.5 17.5V11.25a3.25 3.25 0 0 1 6.5 0V17.5M12 11.25a3.25 3.25 0 0 1 6.5 0V17.5" fill="none" stroke="${t.bar}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18.6" cy="5.6" r="1.55" fill="${t.bar}"/></svg>`;
const browserEl = (t, src, style) =>
  `<div class="browser" style="${style}"><div class="bar"><i></i><i></i><i></i><span>${mark(t)}MGIMO Hub</span></div><img src="file://${src}"/></div>`;
const phoneEl = (src, style) => `<div class="phone" style="${style}"><img src="file://${src}"/></div>`;

/** Главная картинка: окно браузера и телефон поверх него. */
function hero(theme) {
  const t = THEMES[theme];
  const W = 1240;
  const H = 700;
  return {
    name: `hero-${theme}`, W, H, theme,
    html: `<div class="canvas" style="width:${W}px;height:${H}px">${browserEl(t, `${TMP}/today-${theme}.png`, "left:64px;top:64px;width:900px")}${phoneEl(`${TMP}/today-mobile-${theme}.png`, "right:64px;top:108px;width:268px")}</div>`,
  };
}

/** Один экран в рамке браузера. */
function screen(name, src) {
  const t = THEMES.dark;
  const W = 1040;
  const pad = 36;
  const bw = W - pad * 2;
  const H = Math.round(pad * 2 + 38 + (bw * 1600) / 2560) + 2;
  return { name, W, H, theme: "dark", html: `<div class="canvas" style="width:${W}px;height:${H}px">${browserEl(t, src, `left:${pad}px;top:${pad}px;width:${bw}px`)}</div>` };
}

/** Ряд телефонов. */
function phones(name, list) {
  const pw = 236;
  const gap = 44;
  const pad = 56;
  const W = pad * 2 + list.length * pw + (list.length - 1) * gap;
  const H = Math.round(((pw - 20) * 1688) / 780) + 20 + pad * 2;
  return { name, W, H, theme: "dark", html: `<div class="canvas" style="width:${W}px;height:${H}px">${list.map((src, i) => phoneEl(src, `left:${pad + i * (pw + gap)}px;top:${pad}px;width:${pw}px`)).join("")}</div>` };
}

async function capture(browser, { theme, mobile, url, name }) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    colorScheme: theme,
    hasTouch: !!mobile,
  });
  await context.addInitScript((value) => {
    try {
      localStorage.setItem("theme", value);
    } catch {
      /* без хранилища тема останется по умолчанию */
    }
  }, theme);
  const page = await context.newPage();
  const res = await page.request.post(`${BASE}/api/auth/login`, { data: ANNA, headers: { Origin: BASE, "Content-Type": "application/json" } });
  if (res.status() !== 200) throw new Error(`вход не удался: ${res.status()}`);
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // входные анимации
  await page.screenshot({ path: `${TMP}/${name}.png` });
  await context.close();
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const theme of ["dark", "light"]) {
    await capture(browser, { theme, url: "/", name: `today-${theme}` });
    await capture(browser, { theme, mobile: true, url: "/", name: `today-mobile-${theme}` });
  }
  // день с изменениями в расписании: завтра по демо-данным
  const tomorrow = new Date(Date.now() + 27 * 3600 * 1000).toISOString().slice(0, 10);
  await capture(browser, { theme: "dark", url: `/schedule?day=${tomorrow}`, name: "schedule-day" });

  const jobs = [
    hero("dark"),
    hero("light"),
    screen("schedule", `${TMP}/schedule-day.png`),
    ...["grades", "request-status", "assistant", "documents", "verify"].map((n) => screen(n.replace("-status", ""), `${REPORT}/${n}-desktop.jpg`)),
    ...["queue", "request", "analytics", "retakes"].map((n) => screen(`staff-${n}`, `${REPORT}/staff-${n}.jpg`)),
    phones("mobile", ["today", "schedule", "request-status", "assistant"].map((n) => `${REPORT}/${n}-mobile.jpg`)),
  ];
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.W, height: job.H }, deviceScaleFactor: 2 });
    const file = `${TMP}/${job.name}.html`;
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css(THEMES[job.theme])}</style>${job.html}`);
    await page.goto(`file://${file}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((done) => { im.onload = done; im.onerror = done; }))));
    });
    const png = await page.screenshot({ omitBackground: true });
    await page.close();
    const info = await sharp(png).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(`${OUT}/${job.name}.webp`);
    console.log(job.name, `${Math.round(info.size / 1024)} КБ`);
  }
} finally {
  await browser.close();
}
