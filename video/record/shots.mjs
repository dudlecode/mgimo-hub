// Снимки экранов кабинета в светлой теме для «стены экранов» в финале ролика.
// Запуск из корня проекта при запущенном сервере: BASE=http://127.0.0.1:3100 node video/record/shots.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const OUT = resolve("video/public/shots-light");
const TIME_SHIFT_MS = Number(process.env.TIME_SHIFT_MS || 0);
mkdirSync(OUT, { recursive: true });

// Демо-аккаунты из сида (src/db/seed), данные вымышлены
const WHO = {
  anna: ["student.anna", "Demo-Anna-26"],
  timur: ["student.timur", "Demo-Timur-26"],
  office: ["staff.office", "Demo-Office-26"],
};
const PAGES = {
  anna: { today: "/", assistant: "/assistant", documents: "/documents", schedule: "/schedule", requests: "/requests", "sick-leave": "/sick-leave", notifications: "/notifications", appointments: "/appointments", grades: "/grades", profile: "/profile" },
  timur: { payments: "/payments" },
  office: {
    "staff-queue": "/staff", "staff-analytics": "/staff/analytics", "staff-requests": "/staff/requests", "staff-students": "/staff/students", "staff-retakes": "/staff/retakes",
    "staff-schedule": "/staff/schedule", "staff-announcements": "/staff/announcements", "staff-radar": "/staff/radar", "staff-appointments": "/staff/appointments",
  },
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [who, pages] of Object.entries(PAGES)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: "ru-RU", timezoneId: "Europe/Moscow", colorScheme: "light" });
    await ctx.addInitScript((off) => {
      try {
        localStorage.setItem("theme", "light");
      } catch {
        /* без хранилища тема останется по умолчанию */
      }
      if (off) {
        const Real = Date;
        window.Date = new Proxy(Real, {
          construct: (target, args, newTarget) => (args.length ? Reflect.construct(target, args, newTarget) : Reflect.construct(target, [Real.now() + off], newTarget)),
          apply: () => new Real(Real.now() + off).toString(),
          get: (target, prop, receiver) => (prop === "now" ? () => Real.now() + off : Reflect.get(target, prop, receiver)),
        });
      }
    }, TIME_SHIFT_MS);
    const page = await ctx.newPage();
    const [login, password] = WHO[who];
    const res = await page.request.post(`${BASE}/api/auth/login`, { data: { login, password }, headers: { Origin: new URL(BASE).origin, "Content-Type": "application/json" } });
    if (res.status() !== 200) throw new Error(`вход ${login}: ${res.status()}`);
    for (const [name, url] of Object.entries(pages)) {
      await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1300); // входные анимации
      await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 84 });
      console.log("ok", name);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
