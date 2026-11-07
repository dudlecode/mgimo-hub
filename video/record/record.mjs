// Запись живых клипов кабинета для ролика: Playwright ходит по кабинету как человек,
// кадры снимаются через CDP screencast (2560x1600), склеиваются ffmpeg в MP4 30 fps.
// Рядом с каждым клипом пишется JSON с метками времени и рамками карточек для наездов камеры.
// Рамки меряются после того, как анимации на странице закончились.
// Запуск из корня проекта: BASE=http://127.0.0.1:3100 node video/record/record.mjs [клип ...]
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const OUT = resolve("video/public/footage");
const TMP = resolve(process.env.REC_TMP ?? "video/.frames");
const ONLY = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const DEMO = {
  anna: { login: "student.anna", password: "Demo-Anna-26" },
  office: { login: "staff.office", password: "Demo-Office-26" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── в странице: курсор, касания и поиск рамки карточки по тексту ──
function pageOverlay(mode) {
  // Карточка, в которой лежит текст: ближайший предок с рамкой и скруглением
  window.__card = (text, minW = 220) => {
    const scope = document.querySelector("main") ? "main *" : "body *";
    const leaves = [...document.querySelectorAll(scope)].filter((el) => {
      if (!el.textContent || !el.textContent.includes(text)) return false;
      return ![...el.children].some((c) => c.textContent && c.textContent.includes(text));
    });
    for (const leaf of leaves) {
      const lr = leaf.getBoundingClientRect();
      if (!lr.width || !lr.height) continue;
      let n = leaf;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        const bordered = parseFloat(cs.borderTopWidth) >= 1 || cs.backgroundColor !== "rgba(0, 0, 0, 0)";
        if (bordered && parseFloat(cs.borderTopLeftRadius) >= 6 && r.width >= minW && r.height >= 48) {
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }
        n = n.parentElement;
      }
    }
    // Заголовок стоит над карточкой: берём блок «заголовок + карточка»
    for (const leaf of leaves) {
      let n = leaf;
      while (n && n !== document.body) {
        const r = n.getBoundingClientRect();
        if (r.width >= minW && r.height >= 140) return { x: r.x, y: r.y, width: r.width, height: r.height };
        n = n.parentElement;
      }
    }
    return null;
  };
  // Карточка под заголовком секции: первая рамка ниже заголовка
  window.__sectionCard = (title) => {
    const leaf = [...document.querySelectorAll("main *")].find(
      (el) => el.textContent && el.textContent.trim().startsWith(title) && ![...el.children].some((c) => c.textContent && c.textContent.trim().startsWith(title)),
    );
    if (!leaf) return null;
    const top = leaf.getBoundingClientRect().bottom - 2;
    let n = leaf.parentElement;
    for (let depth = 0; n && depth < 5; depth++, n = n.parentElement) {
      for (const el of n.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.top >= top && r.width >= 280 && r.height >= 60 && parseFloat(cs.borderTopWidth) >= 1 && parseFloat(cs.borderTopLeftRadius) >= 6) {
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }
      }
    }
    return null;
  };
  // Подняться от элемента к предку не меньше заданного размера
  window.__up = (el, minW, minH) => {
    let n = el;
    while (n && n !== document.body) {
      const r = n.getBoundingClientRect();
      if (r.width >= minW && r.height >= minH) return { x: r.x, y: r.y, width: r.width, height: r.height };
      n = n.parentElement;
    }
    return null;
  };
  const install = () => {
    if (document.getElementById("__rec")) return;
    const root = document.createElement("div");
    root.id = "__rec";
    Object.assign(root.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483647" });
    document.documentElement.appendChild(root);
    const accent = "47,84,235";
    const ripple = (x, y, size) => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "absolute", left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px`,
        marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px`, borderRadius: "999px",
        border: `2px solid rgba(${accent},0.95)`, background: `rgba(${accent},0.22)`,
      });
      root.appendChild(r);
      r.animate(
        [{ transform: "scale(0.35)", opacity: 1 }, { transform: "scale(1.5)", opacity: 0 }],
        { duration: 650, easing: "cubic-bezier(.2,.7,.3,1)" },
      ).onfinish = () => r.remove();
    };
    if (mode === "mouse") {
      const c = document.createElement("div");
      Object.assign(c.style, { position: "absolute", left: "0", top: "0", width: "26px", height: "26px", transform: "translate(-200px,-200px)" });
      c.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M5 3 L5 20.5 L9.4 16.4 L12.3 23 L15.4 21.7 L12.6 15.3 L18.6 15.3 Z" fill="#ffffff" stroke="#0a0a0a" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      root.appendChild(c);
      addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 5}px, ${e.clientY - 3}px)`; }, true);
      addEventListener("mousedown", (e) => ripple(e.clientX, e.clientY, 40), true);
    } else {
      addEventListener("pointerdown", (e) => ripple(e.clientX, e.clientY, 54), true);
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
}

async function newContext(browser, { phone = false, light = false, en = false, intro = false } = {}) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: phone ? PHONE : DESKTOP,
    deviceScaleFactor: 2,
    isMobile: phone,
    hasTouch: phone,
    locale: en ? "en-US" : "ru-RU",
    timezoneId: "Europe/Moscow",
    userAgent: phone
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 MGIMO-Video"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 MGIMO-Video",
    bypassCSP: true,
    colorScheme: light ? "light" : "dark",
  });
  await ctx.addInitScript(
    ([light, intro]) => {
      try {
        localStorage.setItem("theme", light ? "light" : "dark");
        if (!intro) sessionStorage.setItem("mh-intro-seen", "1");
      } catch {}
    },
    [light, intro],
  );
  await ctx.addInitScript(pageOverlay, phone ? "touch" : "mouse");
  if (en) {
    const host = new URL(BASE).hostname;
    await ctx.addCookies([{ name: "hub_locale", value: "en", domain: host, path: "/", sameSite: "Lax" }]);
  }
  return ctx;
}

async function apiLogin(page, who) {
  const { login, password } = DEMO[who];
  const res = await page.request.post("/api/auth/login", {
    data: { login, password },
    headers: { Origin: new URL(BASE).origin, "Content-Type": "application/json" },
  });
  if (res.status() !== 200) throw new Error(`вход ${login}: ${res.status()}`);
}

// ── человеческие движения ──
const cursor = new WeakMap();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function moveTo(page, x, y, ms) {
  const from = cursor.get(page) ?? { x: DESKTOP.width * 0.55, y: DESKTOP.height * 0.6 };
  const dist = Math.hypot(x - from.x, y - from.y);
  const dur = ms ?? Math.min(1200, 480 + dist * 0.9);
  const steps = Math.max(12, Math.round(dur / 16));
  const nx = -(y - from.y) / (dist || 1);
  const ny = (x - from.x) / (dist || 1);
  const arc = Math.min(44, dist * 0.09) * (from.x > x ? 1 : -1);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = ease(t);
    const a = Math.sin(Math.PI * t) * arc;
    await page.mouse.move(from.x + (x - from.x) * e + nx * a, from.y + (y - from.y) * e + ny * a);
    await sleep(14);
  }
  cursor.set(page, { x, y });
}

/** Показать курсор после перехода на новую страницу. */
async function nudge(page) {
  const p = cursor.get(page) ?? { x: 700, y: 480 };
  await page.mouse.move(p.x + 1, p.y + 1);
  await page.mouse.move(p.x, p.y);
}

async function smoothScroll(page, dy, ms = 1400) {
  await page.evaluate(
    ([dy, ms]) =>
      new Promise((res) => {
        const y0 = window.scrollY;
        const t0 = performance.now();
        const f = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          window.scrollTo({ top: y0 + dy * f(t), behavior: "instant" });
          if (t < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      }),
    [dy, ms],
  );
}

async function scrollTop(page, ms = 1200) {
  const y = await page.evaluate(() => window.scrollY);
  if (y > 0) await smoothScroll(page, -y, ms);
}

/** Прокрутить так, чтобы элемент оказался в комфортной зоне экрана. */
async function bringIntoView(page, loc, phone = false) {
  const vh = (phone ? PHONE : DESKTOP).height;
  const box = await loc.boundingBox();
  if (!box) return;
  const top = vh * 0.14;
  const bottom = vh * (phone ? 0.72 : 0.86);
  if (box.y < top || box.y + box.height > bottom) {
    const target = box.y - Math.max(top, (vh - box.height) / 2.4);
    await smoothScroll(page, target, 1100);
    await sleep(300);
  }
}

async function hover(page, loc, wait = 400) {
  await loc.waitFor({ state: "visible", timeout: 15_000 });
  await bringIntoView(page, loc);
  const b = await loc.boundingBox();
  await moveTo(page, b.x + b.width * 0.5, b.y + Math.min(b.height * 0.5, 24));
  await sleep(wait);
}

async function click(page, loc, { wait = 300 } = {}) {
  await loc.waitFor({ state: "visible", timeout: 20_000 });
  await bringIntoView(page, loc);
  const b = await loc.boundingBox();
  await moveTo(page, b.x + b.width * 0.5, b.y + b.height * 0.5);
  await sleep(wait);
  await page.mouse.down();
  await sleep(100);
  await page.mouse.up();
}

/** Перетащить ползунок input[type=range] к доле toFrac от максимума. */
async function dragSlider(page, loc, toFrac) {
  await loc.waitFor({ state: "visible" });
  const b = await loc.boundingBox();
  const { value, max } = await loc.evaluate((el) => ({ value: Number(el.value), max: Number(el.max) || 1 }));
  const fx = (f) => b.x + 8 + (b.width - 16) * f;
  const y = b.y + b.height / 2;
  const from = value / max;
  await moveTo(page, fx(from), y);
  await sleep(350);
  await page.mouse.down();
  const steps = 70;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fx(from + (toFrac - from) * ease(i / steps)), y);
    await sleep(22);
  }
  await sleep(150);
  await page.mouse.up();
  cursor.set(page, { x: fx(toFrac), y });
}

async function tap(page, loc) {
  await loc.waitFor({ state: "visible", timeout: 20_000 });
  await bringIntoView(page, loc, true);
  const b = await loc.boundingBox();
  await sleep(350);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}

async function type(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(ch === " " ? 140 + Math.random() * 60 : 70 + Math.random() * 80);
  }
}

/** Дождаться загрузки и конца анимаций (бесконечные, вроде пульсации точки, не ждём). */
async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .evaluate(async () => {
      const anims = document.getAnimations().filter((a) => {
        const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
        return t && t.iterations !== Infinity;
      });
      await Promise.race([Promise.all(anims.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 2500))]);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    })
    .catch(() => {});
  await sleep(ms);
}

const card = (page, text, minW) => page.evaluate(([t, w]) => window.__card(t, w), [text, minW ?? 220]);
const sectionCard = (page, title) => page.evaluate((t) => window.__sectionCard(t), title);
const boxUp = (loc, minW, minH = 40) => loc.evaluate((el, [w, h]) => window.__up(el, w, h), [minW, minH]).catch(() => null);
const boxOf = async (loc) => {
  const b = await loc.boundingBox().catch(() => null);
  return b && { x: b.x, y: b.y, width: b.width, height: b.height };
};

// ── запись экрана ──
async function startRec(page, name, view) {
  const cdp = await page.context().newCDPSession(page);
  const dir = join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const marks = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(6, "0")}.jpg`);
    frames.push({ file, ts: metadata.timestamp });
    writeFileSync(file, Buffer.from(data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: view.width * 2,
    maxHeight: view.height * 2,
    everyNthFrame: 1,
  });
  await sleep(400);
  const norm = (b) => b && { x: b.x / view.width, y: b.y / view.height, w: b.width / view.width, h: b.height / view.height };
  return {
    /** Метка времени; box: рамка в CSS-пикселях (из card() или boxOf()) */
    async mark(label, box = null) {
      marks.push({ name: label, wall: Date.now() / 1000, box: norm(box) });
      console.log(`  · ${name}: ${label}${box ? "" : " (без рамки)"}`);
    },
    async stop() {
      await sleep(500);
      await cdp.send("Page.stopScreencast");
      const end = Date.now() / 1000;
      await sleep(300);
      if (!frames.length) throw new Error(`${name}: нет кадров`);
      const t0 = frames[0].ts;
      const list = frames
        .map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.ts ?? end) - f.ts).toFixed(4)}`)
        .join("\n");
      writeFileSync(join(dir, "list.txt"), `${list}\nfile '${frames.at(-1).file}'\n`);
      const out = join(OUT, `${name}.mp4`);
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
        "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
        "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-movflags", "+faststart", out,
      ]);
      const duration = end - t0;
      const meta = {
        name,
        width: view.width,
        height: view.height,
        duration,
        frames: frames.length,
        fps: frames.length / duration,
        marks: marks.map((m) => ({ name: m.name, t: Math.max(0, m.wall - t0), box: m.box })),
      };
      writeFileSync(join(OUT, `${name}.json`), JSON.stringify(meta, null, 2));
      rmSync(dir, { recursive: true, force: true });
      console.log(`✓ ${name}: ${duration.toFixed(1)} с, ${meta.fps.toFixed(1)} кадр/с`);
      return meta;
    },
  };
}

// ── клипы ──
const nav = (page, href) => page.locator(`nav a[href="${href}"]:visible`).first();

async function go(page, href) {
  await click(page, nav(page, href));
  await page.waitForURL((u) => u.pathname === href || u.pathname.startsWith(`${href}/`) || u.pathname.startsWith(href), { timeout: 20_000 });
  await nudge(page);
  await settle(page);
}

async function clipIntro(browser) {
  const ctx = await newContext(browser, { intro: true });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const rec = await startRec(page, "intro", DESKTOP);
  await rec.mark("start");
  await sleep(10_000);
  await rec.mark("end");
  await rec.stop();
  await ctx.close();
}

async function clipStudent(browser, state) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  state.studentCtx = ctx;
  await page.goto("/login");
  await settle(page, 1200);
  const rec = await startRec(page, "student", DESKTOP);
  await moveTo(page, 980, 300, 10);

  // Вход: тестовые аккаунты в одно касание
  await rec.mark("login");
  await sleep(2200);
  const demo = page.locator("section[aria-label]").filter({ has: page.getByRole("button", { name: /Анна/ }) }).first();
  await hover(page, demo, 600);
  await rec.mark("login-demo", await boxOf(demo));
  await sleep(2600);
  await click(page, page.getByRole("button", { name: /Анна/ }).first(), { wait: 500 });
  await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
  await nudge(page);
  await settle(page, 600);
  await rec.mark("today");
  await sleep(2600);

  // Сейчас идёт
  const nowText = (await page.getByText("Сейчас идёт").count()) ? "Сейчас идёт" : "Следующая пара";
  await hover(page, page.getByText(nowText).first(), 300);
  await rec.mark("now", await card(page, nowText));
  await sleep(4200);

  // Изменения в расписании
  const changesTitle = page.getByText(/Изменения на неделе/).first();
  if (await changesTitle.count()) {
    await hover(page, page.getByText(/вместо/).first(), 300);
    await rec.mark("changes", (await card(page, "вместо", 300)) ?? (await card(page, "Изменения на неделе")));
    await sleep(4200);
  }

  // Дедлайны и заявки ниже
  await smoothScroll(page, 470, 1800);
  await sleep(700);
  await rec.mark("deadlines", (await sectionCard(page, "Дедлайны")) ?? (await card(page, "Дедлайны")));
  await sleep(3400);
  await rec.mark("my-requests", (await sectionCard(page, "Мои заявки")) ?? (await card(page, "Мои заявки")));
  await sleep(2600);
  await scrollTop(page, 1100);
  await sleep(500);

  // Расписание: неделя
  await go(page, "/schedule");
  await rec.mark("schedule");
  await sleep(2200);
  const week = page.locator('main a[href*="view=week"]').first();
  if (await week.count()) {
    await click(page, week);
    await page.waitForURL(/view=week/);
    await nudge(page);
    await settle(page, 500);
  }
  await rec.mark("week");
  await sleep(3800);

  // Учёба
  await go(page, "/grades");
  await rec.mark("grades", await card(page, "стипендия", 500));
  await sleep(4200);
  const courses = page.locator('main a[href^="/grades/"]:not([href*="retakes"])');
  const examCourse = courses.filter({ hasText: /Экзамен/ }).first();
  await click(page, (await examCourse.count()) ? examCourse : courses.first());
  await page.waitForURL(/\/grades\/[0-9a-f-]{36}$/);
  await nudge(page);
  await settle(page, 700);
  await rec.mark("course");
  const calc = page.locator("section[aria-labelledby=calc-title]");
  await bringIntoView(page, calc);
  await settle(page, 300);
  await rec.mark("calc", await card(page, "Калькулятор"));
  await sleep(1800);
  const exam = page.locator("#calc-exam");
  await dragSlider(page, exam, 0.42);
  await sleep(2400);
  await rec.mark("calc-low", await card(page, "Калькулятор"));
  await dragSlider(page, exam, 0.8);
  await sleep(800);
  await rec.mark("calc-result", await card(page, "Калькулятор"));
  await sleep(3000);

  // Атташе: фраза превращается в черновик заявки
  await go(page, "/assistant");
  await rec.mark("assistant");
  await sleep(2800);
  const suggestion = page.getByRole("button", { name: /Нужна справка для визы в Италию/ }).first();
  await hover(page, suggestion, 700);
  await click(page, suggestion, { wait: 200 });
  await rec.mark("ask");
  const action = page.locator("main [aria-live='polite'] a[href^='/requests/new']").first();
  const typing = page.locator("[aria-label='Атташе печатает']");
  await page.locator("main [aria-live='polite'] > div").nth(1).waitFor({ timeout: 120_000 });
  await typing.waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
  if (!(await action.count())) {
    await click(page, page.locator("#ask"));
    await type(page, "Туризм, с 20 по 30 декабря. Подготовьте черновик.");
    await page.keyboard.press("Enter");
    await action.waitFor({ timeout: 120_000 });
    await typing.waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
  }
  await settle(page, 300);
  const answerBox = await action.evaluate((el) => {
    let n = el;
    while (n.parentElement && !n.parentElement.hasAttribute("aria-live")) n = n.parentElement;
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await rec.mark("answer", answerBox);
  await sleep(4200);
  await hover(page, action, 900);
  await rec.mark("draft-button", await boxOf(action));
  await sleep(1600);
  await click(page, action, { wait: 200 });
  await page.waitForURL(/\/requests\/new\//);
  await nudge(page);
  await settle(page, 600);
  await rec.mark("form", await boxOf(page.locator("main form").first()));
  await sleep(3600);

  // Дозаполнить то, что модель не подставила
  const country = page.locator('input[name="country"]');
  if (await country.count()) {
    if (!(await country.inputValue())) {
      await click(page, country);
      await type(page, "Италия");
    }
    const from = page.locator('input[name="travelFrom"]');
    const to = page.locator('input[name="travelTo"]');
    if (!(await from.inputValue())) await from.fill("2026-12-20");
    if (!(await to.inputValue())) await to.fill("2026-12-30");
    const purpose = page.locator('select[name="purpose"]');
    if (!(await purpose.inputValue())) await purpose.selectOption("tourism");
  }
  await sleep(800);
  const submit = page.locator('form:has(input[name="type"]) button[type="submit"]');
  await hover(page, submit, 500);
  await rec.mark("submit", await boxOf(submit));
  await sleep(1500);
  await click(page, submit, { wait: 200 });
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await nudge(page);
  await settle(page, 700);
  await rec.mark("submitted", await card(page, "Отозвать", 400));
  await sleep(4600);
  state.requestId = new URL(page.url()).pathname.split("/")[2];
  await rec.stop();
  state.studentPage = page;
}

async function clipStaff(browser, state) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await apiLogin(page, "office");
  await page.goto("/staff");
  await settle(page, 1000);
  const rec = await startRec(page, "staff", DESKTOP);
  await moveTo(page, 820, 420, 10);
  await rec.mark("queue");
  await sleep(3200);
  const link = page.locator(`main a[href="/staff/requests/${state.requestId}"]`).first();
  if (await link.count()) {
    await hover(page, link, 700);
    await rec.mark("queue-item", await boxUp(link, 400, 44));
    await sleep(2400);
    await click(page, link, { wait: 200 });
  } else {
    await page.goto(`/staff/requests/${state.requestId}`);
  }
  await page.waitForURL(new RegExp(state.requestId));
  await nudge(page);
  await settle(page, 700);
  await rec.mark("request");
  await sleep(3600);

  const act = async (button, status, label) => {
    const b = page.getByRole("button", { name: button, exact: true });
    await hover(page, b, 500);
    await rec.mark(`${label}-click`, await boxOf(b));
    await sleep(1700);
    await click(page, b, { wait: 200 });
    await page.locator("main").getByText(status, { exact: true }).first().waitFor({ timeout: 20_000 });
    await settle(page, 300);
    await rec.mark(label, await card(page, "Следующий шаг"));
  };
  await act("Взять в работу", "На рассмотрении", "taken");
  await sleep(2600);

  // Атташе пишет черновик ответа студенту
  const draftBtn = page.getByRole("button", { name: "Статус", exact: true });
  if (await draftBtn.count()) {
    await hover(page, draftBtn, 600);
    await click(page, draftBtn);
    await rec.mark("draft-ask", await card(page, "Сообщение студенту"));
    await page
      .waitForFunction(() => {
        const el = document.querySelector("textarea");
        return !!el && el.value.trim().length > 20;
      }, null, { timeout: 60_000 })
      .catch(() => {});
    await settle(page, 300);
    await rec.mark("draft", await boxOf(page.locator("main textarea").first()));
    await sleep(4200);
    await click(page, page.getByRole("button", { name: "Отправить", exact: true }));
    await page.getByText("Сообщение от учебного офиса").first().waitFor({ timeout: 20_000 }).catch(() => {});
    await sleep(1600);
  }
  await act("Начать подготовку", "Готовится", "preparing");
  await sleep(2000);
  await act("Сформировать справку с QR", "Готова", "ready");
  await sleep(4200);

  await page.goto("/staff/analytics");
  await nudge(page);
  await settle(page, 300);
  await rec.mark("analytics");
  await sleep(4200);
  await smoothScroll(page, 420, 2000);
  await sleep(2400);
  await rec.stop();
  await ctx.close();
}

async function clipResult(browser, state) {
  const page = state.studentPage ?? (await (state.studentCtx ?? (await newContext(browser))).newPage());
  if (!state.studentPage) await apiLogin(page, "anna");
  await page.goto("/");
  await settle(page, 1000);
  const rec = await startRec(page, "result", DESKTOP);
  await nudge(page);
  await rec.mark("today");
  await sleep(1600);
  const bell = page.locator('a[href="/notifications"]:visible').first();
  await hover(page, bell, 900);
  await rec.mark("bell", await boxOf(bell));
  await click(page, bell, { wait: 200 });
  await page.waitForURL(/\/notifications/);
  await nudge(page);
  await settle(page, 600);
  await rec.mark("notifications", await boxUp(page.getByText("Справка готова").first(), 500, 50));
  await sleep(4400);

  await go(page, "/documents");
  await rec.mark("documents");
  await sleep(1800);
  const sc = page.locator("#student-card");
  if (await sc.count()) {
    await hover(page, sc, 400);
    await rec.mark("student-card", await boxOf(sc));
    await sleep(3200);
  }
  const verify = page.locator('main a[href^="/verify/"]').first();
  await hover(page, verify, 700);
  await rec.mark("doc-tile", await card(page, "Справка для посольства"));
  await sleep(2600);
  const href = await verify.getAttribute("href");
  await click(page, verify, { wait: 200 });
  await page.waitForURL(/\/verify\//, { timeout: 15_000 }).catch(async () => {
    await page.goto(href);
  });
  await nudge(page);
  await settle(page, 700);
  await rec.mark("verify", await card(page, "Документ подлинный", 300));
  await sleep(5000);
  await rec.stop();
}

async function clipPhone(browser) {
  const ctx = await newContext(browser, { phone: true });
  const page = await ctx.newPage();
  await apiLogin(page, "anna");
  await page.goto("/schedule");
  await settle(page, 600);
  await page.goto("/");
  await settle(page, 1000);
  await page.evaluate(() => navigator.serviceWorker?.ready).catch(() => {});
  const rec = await startRec(page, "phone", PHONE);
  await rec.mark("today");
  await sleep(3000);
  await smoothScroll(page, 620, 3000);
  await sleep(1400);
  await smoothScroll(page, 560, 2600);
  await sleep(1200);
  await scrollTop(page, 1400);
  await sleep(700);
  await tap(page, nav(page, "/schedule"));
  await page.waitForURL(/\/schedule/);
  await settle(page, 600);
  await rec.mark("schedule");
  await sleep(3000);
  // Без сети: страница открывается из кэша телефона
  await ctx.setOffline(true);
  await rec.mark("offline");
  await page.reload().catch(() => {});
  await sleep(3200);
  await rec.mark("offline-loaded");
  await sleep(2400);
  await ctx.setOffline(false);
  await rec.stop();
  await ctx.close();
}

async function clipPhoneEn(browser) {
  const ctx = await newContext(browser, { phone: true, light: true, en: true });
  const page = await ctx.newPage();
  await apiLogin(page, "anna");
  await page.goto("/");
  await settle(page, 1000);
  const rec = await startRec(page, "phone-en", PHONE);
  await rec.mark("today");
  await sleep(3400);
  await smoothScroll(page, 600, 3200);
  await sleep(1800);
  await scrollTop(page, 1400);
  await sleep(600);
  await tap(page, nav(page, "/schedule"));
  await page.waitForURL(/\/schedule/);
  await settle(page, 600);
  await rec.mark("schedule");
  await sleep(3400);
  await rec.stop();
  await ctx.close();
}


async function clipServices(browser) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await apiLogin(page, "anna");
  await page.goto("/");
  await settle(page, 900);
  const rec = await startRec(page, "services", DESKTOP);
  await nudge(page);
  await rec.mark("start");
  await sleep(1200);

  // Запись на приём вместо живой очереди
  await go(page, "/appointments");
  await rec.mark("appointments");
  await sleep(2600);
  const topics = page.getByRole("group", { name: "Тема обращения" });
  const topic = topics.getByRole("button").first();
  await hover(page, topic, 500);
  await rec.mark("topic", await boxOf(topics));
  await sleep(1400);
  await click(page, topic, { wait: 200 });
  await settle(page, 400);
  const slot = page.locator("button[aria-pressed]:not([disabled])").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
  await hover(page, slot, 500);
  await rec.mark("slot", await boxUp(slot, 520, 120));
  await sleep(1600);
  await click(page, slot, { wait: 200 });
  await sleep(900);
  const book = page.getByRole("button", { name: "Записаться", exact: true });
  await hover(page, book, 500);
  await rec.mark("book", await boxOf(book));
  await sleep(1500);
  await click(page, book, { wait: 200 });
  await page.waitForURL(/\/appointments\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await nudge(page);
  await settle(page, 700);
  await rec.mark("ticket", await card(page, "Вы записаны", 400));
  await sleep(4600);

  // Заболел: учебный офис в курсе, Атташе пишет письмо преподавателю
  await go(page, "/sick-leave");
  await rec.mark("sick");
  await sleep(2400);
  const until = page.getByLabel("Примерно до какого");
  await until.fill(new Date(Date.now() + 14 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" }));
  await sleep(500);
  const report = page.getByRole("button", { name: "Сообщить о болезни" });
  await hover(page, report, 500);
  await rec.mark("report", await boxOf(report));
  await sleep(1500);
  await click(page, report, { wait: 200 });
  await page.getByRole("heading", { name: /Вы на больничном с/ }).waitFor({ timeout: 30_000 });
  await settle(page, 700);
  await rec.mark("on-leave", await card(page, "Вы на больничном", 400));
  await sleep(3600);
  const affects = (await sectionCard(page, "Что это затрагивает")) ?? (await card(page, "Что это затрагивает", 400));
  const letterBtn = page.getByRole("button", { name: "Письмо преподавателю" }).first();
  if (await letterBtn.count()) {
    await bringIntoView(page, letterBtn);
    await settle(page, 200);
    await rec.mark("affects", (await sectionCard(page, "Что это затрагивает")) ?? affects);
    await sleep(2600);
    await hover(page, letterBtn, 500);
    await rec.mark("letter-btn", await boxOf(letterBtn));
    await sleep(1500);
    await click(page, letterBtn, { wait: 200 });
    await rec.mark("letter-ask");
    await page
      .waitForFunction(() => {
        const el = [...document.querySelectorAll("textarea")].find((t) => t.value.trim().length > 40);
        return !!el;
      }, null, { timeout: 60_000 })
      .catch(() => {});
    await settle(page, 400);
    const letter = page.locator("textarea").filter({ hasText: /\S/ }).first();
    await bringIntoView(page, letter);
    await settle(page, 200);
    await rec.mark("letter", await boxUp(letter, 500, 160));
    await sleep(5200);
  } else {
    await rec.mark("affects", affects);
    await sleep(4000);
  }
  await rec.stop();
  await ctx.close();
}

const CLIPS = { intro: clipIntro, student: clipStudent, staff: clipStaff, result: clipResult, phone: clipPhone, "phone-en": clipPhoneEn, services: clipServices };

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-color-profile=srgb", "--force-device-scale-factor=2"] });
const state = {};
try {
  for (const [name, fn] of Object.entries(CLIPS)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log(`▶ ${name}`);
    await fn(browser, state);
  }
} finally {
  await browser.close();
}
