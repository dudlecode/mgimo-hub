import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import QRCode from "qrcode";
import { C, FPS, MONO, SANS, SITE_URL } from "./theme";
import { frameOf, focus, hasMark, home, mb, mt, segsFrames, segStart, type CamKey, type ClipName, type Seg } from "./footage";
import { Background, BrowserFrame, Chip, CountUp, Footage, FRAME, Grain, LogoMark, PhoneFrame, Rise, Wordmark } from "./ui";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => Math.round(s * FPS);

export type Scene = { id: string; frames: number; Component: React.FC; demo?: boolean };
/** Текст новой сцены появляется после склейки */
const TEXT_IN = 12;
/** Пауза перед первым кадром записи, кадров: запись проявляется, когда склейка сцен уже закончилась */
const LEAD = 14;

/** Для проверки: где в сценах показываются обводки */
export const RING_DEBUG: { id: string; keys: { at: number; d?: number; box: boolean; until?: number }[] }[] = [];
export const CAM_DEBUG: { id: string; segs: Seg[]; cam: CamKey[] }[] = [];

/** Надпись над заголовком: номер и название главы */
const Label: React.FC<{ children: React.ReactNode; delay?: number; out?: number }> = ({ children, delay = TEXT_IN, out }) => (
  <Rise delay={delay} out={out} y={14}>
    <div style={{ fontFamily: MONO, fontSize: 24, color: C.brandText, letterSpacing: "0.02em" }}>{children}</div>
  </Rise>
);

type Title = { at: number; text: string };

/** Заголовок главы над окном: по центру. Заголовков может быть несколько, они сменяют друг друга на своих кадрах */
const ChapterTag: React.FC<{ chapter: string; titles: Title[] }> = ({ chapter, titles }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top: 58, textAlign: "center" }}>
    <Label>{chapter}</Label>
    <div style={{ position: "relative", height: 80, marginTop: 12 }}>
      {titles.map((t, i) => (
        <div key={t.text} style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
          <Rise delay={i === 0 ? TEXT_IN + 4 : t.at} out={titles[i + 1] ? titles[i + 1].at - 10 : undefined} y={18}>
            <div style={{ fontFamily: SANS, fontSize: 66, fontWeight: 620, color: C.ink, letterSpacing: "-0.04em", lineHeight: 1.06 }}>{t.text}</div>
          </Rise>
        </div>
      ))}
    </div>
  </div>
);

/** Сцена с живой записью: крупное окно по центру, пояснения плашками у блоков */
function demoScene(opts: { id: string; segs: Seg[]; chapter: string; title: string | Title[]; cam?: CamKey[]; chain?: boolean }): Scene {
  const frames = segsFrames(opts.segs) + LEAD;
  const titles = typeof opts.title === "string" ? [{ at: 0, text: opts.title }] : opts.title.map((t) => ({ ...t, at: t.at + LEAD }));
  const cam = (opts.cam ?? []).map((k) => ({ ...k, at: k.at + LEAD, until: k.until !== undefined ? k.until + LEAD : undefined }));
  CAM_DEBUG.push({ id: opts.id, segs: opts.segs, cam });
  RING_DEBUG.push({ id: opts.id, keys: cam.map((k) => ({ at: k.at, d: k.d, box: !!k.box, until: k.until })) });
  const Component: React.FC = () => {
    const f = useCurrentFrame();
    const exit = interpolate(f, [frames - 18, frames - 6], [1, 0], clamp);
    return (
      <AbsoluteFill>
        <Background glowX={50} glowY={46} />
        <div style={{ opacity: exit }}>
          <ChapterTag chapter={opts.chapter} titles={titles} />
        </div>
        <BrowserFrame x={FRAME.x} y={FRAME.y} w={FRAME.w} delay={opts.chain ? -300 : 0}>
          <Footage segs={opts.segs} cam={cam} offset={LEAD} unit={FRAME.w / 1280} pxW={FRAME.w} />
        </BrowserFrame>
        <Grain />
      </AbsoluteFill>
    );
  };
  return { id: opts.id, frames, Component, demo: true };
}

/** Кадр метки с поправкой; если метки нет, запасное значение */
const fo = (segs: Seg[], clip: ClipName, mark: string, offset = 0, fallback = 0) => (hasMark(clip, mark) ? frameOf(segs, clip, mark, offset) : fallback);

// ─────────────────────────────────────────────────────────────
// Вступление и проблема одной сценой: знак, затем пять мест,
// где сейчас живёт учёба, собираются в одно окно
// ─────────────────────────────────────────────────────────────
const INTRO = sec(2.6);
const PROBLEM_LEN = INTRO + sec(10.6);
const CARDS = [
  { t: "Расписание", s: "сайт и чат группы", x: 110, y: 540, r: -4 },
  { t: "Баллы", s: "у каждого преподавателя", x: 470, y: 720, r: 3 },
  { t: "Справки", s: "очередь в деканате", x: 775, y: 520, r: -2 },
  { t: "Новости", s: "почта и каналы", x: 1100, y: 730, r: 4 },
  { t: "Вопросы", s: "староста и знакомые", x: 1430, y: 550, r: -3 },
];
const CARD_W = 380;
const MERGE = INTRO + sec(5.7);
const Problem: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoIn = spring({ frame: f - 6, fps, config: { damping: 200 }, durationInFrames: 34 });
  const logoOut = interpolate(f, [INTRO - 20, INTRO - 2], [0, 1], { ...clamp, easing: (t) => t * t });
  const m = spring({ frame: f - MERGE, fps, config: { damping: 200 }, durationInFrames: 36 });
  const win = spring({ frame: f - MERGE - 14, fps, config: { damping: 200 }, durationInFrames: 36 });
  const headline = (label: string, title: React.ReactNode, sub: string, at: number, out?: number) => (
    <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center" }}>
      <Label delay={at} out={out}>
        {label}
      </Label>
      <Rise delay={at + 4} out={out} y={30}>
        <div style={{ fontFamily: SANS, fontSize: 104, fontWeight: 620, color: C.ink, letterSpacing: "-0.048em", lineHeight: 1.03, marginTop: 20 }}>{title}</div>
      </Rise>
      <Rise delay={at + 22} out={out}>
        <div style={{ fontFamily: SANS, fontSize: 36, color: C.ink2, marginTop: 28, letterSpacing: "-0.015em" }}>{sub}</div>
      </Rise>
    </div>
  );
  return (
    <AbsoluteFill>
      <Background glowX={50} glowY={44} />
      {/* знак */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: logoIn * (1 - logoOut) }}>
        <div style={{ transform: `scale(${0.92 + logoIn * 0.08 - logoOut * 0.05})`, filter: `blur(${(1 - logoIn) * 10 + logoOut * 8}px)` }}>
          <Wordmark size={96} />
        </div>
      </AbsoluteFill>
      {headline("Проблема", "Учёба разбросана по пяти местам", "А за каждой справкой нужно идти в очередь", INTRO, MERGE - 8)}
      {CARDS.map((c, i) => {
        const p = spring({ frame: f - INTRO - 16 - i * 7, fps, config: { damping: 200 }, durationInFrames: 30 });
        const fx = Math.sin((f + i * 40) / 38) * 9;
        const fy = Math.cos((f + i * 25) / 44) * 7;
        const tx = 960 - CARD_W / 2;
        const ty = 690;
        const x = c.x + fx * (1 - m) + (tx - c.x) * m;
        const y = c.y + fy * (1 - m) + (ty - c.y) * m;
        return (
          <div
            key={c.t}
            style={{
              position: "absolute",
              left: x,
              top: y + (1 - p) * 50,
              width: CARD_W,
              padding: "30px 34px",
              borderRadius: 22,
              background: C.card,
              border: `1px solid ${C.line}`,
              opacity: p * (1 - m),
              transform: `rotate(${c.r * (1 - m)}deg) scale(${1 - m * 0.35})`,
              boxShadow: C.shadowSoft,
            }}
          >
            <div style={{ fontFamily: SANS, fontSize: 44, fontWeight: 600, color: C.ink, letterSpacing: "-0.035em" }}>{c.t}</div>
            <div style={{ fontFamily: SANS, fontSize: 27, color: C.ink3, marginTop: 8 }}>{c.s}</div>
          </div>
        );
      })}
      {/* одно окно */}
      <div
        style={{
          position: "absolute",
          left: 960 - 430,
          top: 560,
          width: 860,
          height: 330,
          borderRadius: 28,
          border: "1px solid rgba(10,10,10,0.10)",
          background: C.card,
          opacity: win,
          transform: `scale(${0.88 + win * 0.12})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          boxShadow: C.shadow,
        }}
      >
        <Wordmark size={64} />
        <div style={{ display: "flex", gap: 12 }}>
          {["Расписание", "Баллы", "Справки", "Новости", "Атташе"].map((t, i) => (
            <Rise key={t} delay={MERGE + 30 + i * 5} y={10}>
              <div style={{ fontFamily: SANS, fontSize: 26, color: i === 4 ? C.brand : C.ink2, padding: "9px 18px", borderRadius: 12, border: `1px solid ${i === 4 ? "rgba(47,84,235,0.4)" : C.line}`, background: i === 4 ? "rgba(47,84,235,0.06)" : "transparent" }}>{t}</div>
            </Rise>
          ))}
        </div>
      </div>
      {headline("Решение", "Одно окно для всей учёбы", "Кабинет студента, рабочее место учебного офиса и ИИ-ассистент", MERGE + 6)}
      <Grain />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// Титр главы во весь кадр: как было (зачёркивается) и как стало
// ─────────────────────────────────────────────────────────────
const CARD_LEN = sec(5.4);
function chapterCard(id: string, chapter: string, was: string, line1: string, line2: string, sub: string): Scene {
  const Component: React.FC = () => {
    const f = useCurrentFrame();
    const WAS_AT = 14;
    const STRIKE_AT = 38;
    const L1_AT = 46;
    const L2_AT = 58;
    const SUB_AT = 78;
    const strike = interpolate(f, [STRIKE_AT, STRIKE_AT + 14], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
    const dim = interpolate(f, [STRIKE_AT + 4, STRIKE_AT + 22], [1, 0.62], clamp);
    const exit = interpolate(f, [CARD_LEN - 16, CARD_LEN - 4], [1, 0], clamp);
    const zoom = interpolate(f, [0, CARD_LEN], [1, 1.035], clamp);
    return (
      <AbsoluteFill>
        <Background glowX={50} glowY={46} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", opacity: exit, transform: `scale(${zoom})` }}>
          <Label>{chapter}</Label>
          <Rise delay={WAS_AT} y={16} style={{ marginTop: 42 }}>
            <div style={{ position: "relative", display: "inline-block", fontFamily: SANS, fontSize: 40, color: C.ink3, letterSpacing: "-0.02em", opacity: dim }}>
              {was}
              <div style={{ position: "absolute", left: -12, top: "54%", height: 3, borderRadius: 2, background: C.brand, width: `calc(${strike * 100}% + ${strike * 24}px)` }} />
            </div>
          </Rise>
          <div style={{ marginTop: 36, fontFamily: SANS, fontSize: 132, lineHeight: 1.03, fontWeight: 620, letterSpacing: "-0.05em" }}>
            <Rise delay={L1_AT} y={44}>
              <div style={{ color: C.ink }}>{line1}</div>
            </Rise>
            <Rise delay={L2_AT} y={44}>
              <div style={{ color: C.brand }}>{line2}</div>
            </Rise>
          </div>
          <Rise delay={SUB_AT} y={16} style={{ marginTop: 44 }}>
            <div style={{ fontFamily: SANS, fontSize: 34, color: C.ink2, letterSpacing: "-0.015em" }}>{sub}</div>
          </Rise>
        </AbsoluteFill>
        <Grain />
      </AbsoluteFill>
    );
  };
  return { id, frames: CARD_LEN, Component };
}

// ─────────────────────────────────────────────────────────────
// 01 День
// ─────────────────────────────────────────────────────────────
function dayScene(): Scene {
  const deadlines = hasMark("student", "deadlines");
  const segs: Seg[] = [{ clip: "student", from: mt("student", "login-demo") - 0.8, to: deadlines ? mt("student", "deadlines") + 3.2 : mt("student", "changes") + 3.4 }];
  const fDemo = frameOf(segs, "student", "login-demo", -0.5);
  const fToday = frameOf(segs, "student", "today", -1.0);
  const fNow = frameOf(segs, "student", "now", -0.5);
  const fChanges = frameOf(segs, "student", "changes", -0.5);
  return demoScene({
    id: "day",
    segs,
    chapter: "01 · День",
    // вход и главный экран идут одной записью без склейки, меняется только заголовок
    title: [
      { at: 0, text: "Один вход для всей учёбы" },
      { at: frameOf(segs, "student", "today", -0.4), text: "Весь день на одном экране" },
    ],
    cam: [
      focus(fDemo, mb("student", "login-demo"), { max: 1.5, until: frameOf(segs, "student", "today", -2.0), label: "Для жюри: вход в одно касание" }),
      home(fToday - 14, 30),
      focus(fNow, mb("student", "now"), { label: "Пара идёт: аудитория и время до конца" }),
      focus(fChanges, mb("student", "changes"), { label: "Переносы и отмены видны сразу" }),
      ...(deadlines ? [focus(frameOf(segs, "student", "deadlines", -0.4), mb("student", "deadlines"), { max: 1.45, label: "Дедлайны на две недели вперёд" })] : []),
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// 02 Справка: студент просит, учебный офис оформляет, студент получает документ
// ─────────────────────────────────────────────────────────────
function attacheScene(): Scene {
  const ask = mt("student", "ask");
  const answer = mt("student", "answer");
  const wait = Math.max(0.5, answer - ask - 1.2);
  const segs: Seg[] = [
    // сразу к делу: курсор уже идёт к готовому вопросу
    { clip: "student", from: ask - 2.2, to: ask + 1.0 },
    { clip: "student", from: ask + 1.0, to: answer - 0.2, rate: Math.max(1, wait / 1.6), cont: true },
    { clip: "student", from: answer - 0.2, to: answer + 3.4, cont: true },
    { clip: "student", from: mt("student", "draft-button") - 1.5, to: mt("student", "draft-button") + 2.1 },
    { clip: "student", from: mt("student", "form") - 0.3, to: mt("student", "form-profile") + 2.9 },
    { clip: "student", from: mt("student", "dates-start") - 0.4, to: mt("student", "dates") + 2.7 },
    { clip: "student", from: mt("student", "submit") - 1.0, to: mt("student", "submitted") + 3.2 },
  ];
  const fAnswer = segStart(segs, 2);
  const fDraft = segStart(segs, 3);
  const fForm = segStart(segs, 4);
  const fProfile = frameOf(segs, "student", "form-profile", -0.5);
  const fDates = segStart(segs, 5);
  const fSubmit = segStart(segs, 6);
  const fSubmitted = frameOf(segs, "student", "submitted", -0.3);
  return demoScene({
    id: "attache",
    segs,
    chapter: "02 · Справка",
    title: "Справку готовит Атташе",
    cam: [
      focus(fAnswer + 4, mb("student", "answer"), { max: 1.45, label: "Понял запрос и назвал нужную справку" }),
      home(fDraft - 6, 6),
      focus(fDraft + 2, mb("student", "draft-button"), { max: 1.5, until: frameOf(segs, "student", "draft-button", 2.0), label: "Готовит черновик заявки" }),
      home(fForm - 6, 6),
      focus(fProfile, mb("student", "form-profile"), { max: 1.4, label: "Данные из профиля уже в заявке" }),
      home(fDates - 6, 6),
      focus(fDates + 4, mb("student", "dates"), { max: 1.5, fill: 0.6, label: "Остаётся указать даты и цель" }),
      home(fSubmit - 6, 6),
      focus(fSubmit + 4, mb("student", "submit"), { max: 1.45, until: frameOf(segs, "student", "submit", 1.9), label: "Отправляет заявку сам студент" }),
      home(fSubmitted - 20, 18),
      focus(fSubmitted + 8, mb("student", "submitted"), { max: 1.5, label: "Статус и срок видны сразу" }),
    ],
  });
}

function staffScene(): Scene {
  const draftAsk = mt("staff", "draft-ask", mt("staff", "taken") + 2);
  const draft = mt("staff", "draft", draftAsk + 2);
  const item = mt("staff", "queue-item", mt("staff", "queue") + 2);
  const segs: Seg[] = [
    { clip: "staff", from: item - 1.2, to: item + 2.4 },
    { clip: "staff", from: mt("staff", "taken-click") - 0.5, to: mt("staff", "taken") + 0.6 },
    { clip: "staff", from: draftAsk - 0.2, to: draftAsk + 0.5 },
    { clip: "staff", from: draftAsk + 0.5, to: draft - 0.1, rate: Math.max(1, (draft - draftAsk - 0.6) / 1.2), cont: true },
    { clip: "staff", from: draft - 0.1, to: draft + 2.8, cont: true },
    { clip: "staff", from: mt("staff", "ready-click") - 0.6, to: mt("staff", "ready") + 3.0 },
  ];
  const fTaken = segStart(segs, 1);
  const fDraft = segStart(segs, 2);
  const fReady = segStart(segs, 5);
  const fToast = frameOf(segs, "staff", "ready", 0.1);
  const btn = (mark: string, f: number, untilOffset: number, label: string) =>
    focus(f, mb("staff", mark), { max: 1.5, fill: 0.5, until: frameOf(segs, "staff", mark, untilOffset), label });
  return demoScene({
    id: "staff",
    chain: true,
    segs,
    chapter: "02 · Справка",
    title: "Учебный офис не теряет заявки",
    cam: [
      focus(6, mb("staff", "queue-item"), { max: 1.5, until: frameOf(segs, "staff", "queue-item", 2.2), label: "Заявка Анны уже в очереди офиса" }),
      home(fTaken - 6, 6),
      btn("taken-click", fTaken + 2, 1.9, "В работу одним нажатием"),
      home(fDraft - 6, 6),
      focus(fDraft + 2, mb("staff", "draft"), { max: 1.7, fill: 0.7, label: "Ответ студенту готовит Атташе" }),
      home(fReady - 6, 6),
      btn("ready-click", fReady + 2, 1.9, "Справка с номером и QR за одно нажатие"),
      // уведомление наверху страницы: студент узнаёт о готовности сразу
      hasMark("staff", "ready-toast") && mb("staff", "ready-toast")
        ? focus(fToast, mb("staff", "ready-toast"), { max: 1.5, fill: 0.36 })
        : { at: fToast, s: 1.2, x: 0.6, y: 0.26, d: 26 },
    ],
  });
}

function resultScene(): Scene {
  const segs: Seg[] = [
    { clip: "result", from: mt("result", "bell") - 0.8, to: mt("result", "notifications") + 3.2 },
    { clip: "result", from: mt("result", "doc-tile") - 1.6, to: mt("result", "doc-tile") + 2.3 },
    // справка одним планом: сначала текст, затем камера уходит вниз к подписи, печати и QR
    { clip: "result", from: mt("result", "certificate") - 0.4, to: mt("result", "certificate-qr") + 3.6 },
    { clip: "result", from: mt("result", "verify") - 0.3, to: mt("result", "verify") + 3.6 },
  ];
  const fNotif = frameOf(segs, "result", "notifications", -0.2);
  const fTile = frameOf(segs, "result", "doc-tile", -1.2);
  const fCert = segStart(segs, 2);
  const fQr = frameOf(segs, "result", "certificate-qr", -1.0);
  const fVerify = segStart(segs, 3);
  return demoScene({
    id: "result",
    chain: true,
    segs,
    chapter: "02 · Справка",
    title: "Готовая справка в кабинете",
    cam: [
      focus(fNotif + 4, mb("result", "notifications"), { max: 1.5, fill: 0.8, label: "Уведомление пришло сразу" }),
      focus(fTile, mb("result", "doc-tile"), { max: 1.5, until: frameOf(segs, "result", "doc-tile", 2.1), label: "Справка лежит в «Документах»" }),
      focus(fCert + 8, mb("result", "certificate"), { max: 1.4, fill: 0.9, until: fQr - 4, label: "Справка для консульства на английском" }),
      focus(fQr, mb("result", "certificate-qr"), { max: 1.5, fill: 0.8, label: "Подпись, печать и QR для проверки" }),
      focus(fVerify + 10, mb("result", "verify"), { max: 1.5, label: "Подлинность проверяется по коду" }),
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// 03 Приём и 04 Больничный
// ─────────────────────────────────────────────────────────────
function appointmentScene(): Scene {
  const segs: Seg[] = [
    { clip: "services", from: mt("services", "topic") - 1.0, to: mt("services", "topic") + 2.6 },
    { clip: "services", from: mt("services", "slot") - 1.3, to: mt("services", "slot") + 2.4 },
    { clip: "services", from: mt("services", "book") - 1.3, to: mt("services", "book") + 2.1 },
    { clip: "services", from: mt("services", "ticket") - 0.2, to: mt("services", "ticket") + 3.4 },
  ];
  const fTopic = frameOf(segs, "services", "topic", -0.7);
  const fSlot = segStart(segs, 1);
  const fBook = segStart(segs, 2);
  const fTicket = segStart(segs, 3);
  return demoScene({
    id: "appointment",
    segs,
    chapter: "03 · Приём",
    title: "Приём без живой очереди",
    cam: [
      focus(fTopic, mb("services", "topic"), { max: 1.45, until: frameOf(segs, "services", "topic", 2.3), label: "Тема заранее: офис подготовит документы" }),
      focus(fSlot + 2, mb("services", "slot"), { max: 1.45, until: frameOf(segs, "services", "slot", 2.2), label: "Свободное время видно сразу" }),
      focus(fBook + 2, mb("services", "book"), { max: 1.5, fill: 0.5, until: frameOf(segs, "services", "book", 1.9), label: "Запись в одно нажатие" }),
      home(fTicket - 8, 8),
      focus(fTicket + 4, mb("services", "ticket"), { max: 1.4, label: "Талон с кодом вместо живой очереди" }),
    ],
  });
}

function sickScene(): Scene {
  const hasLetter = hasMark("services", "letter");
  const ask = mt("services", "letter-ask", mt("services", "affects") + 3);
  const letter = mt("services", "letter", ask + 2);
  const segs: Seg[] = [
    { clip: "services", from: mt("services", "report") - 2.2, to: mt("services", "report") + 2.1 },
    { clip: "services", from: mt("services", "affects") - 0.6, to: mt("services", "affects") + 2.6 },
    ...(hasLetter
      ? [
          { clip: "services" as const, from: mt("services", "letter-btn") - 0.8, to: ask + 0.5 },
          { clip: "services" as const, from: ask + 0.5, to: letter - 0.5, rate: Math.max(1, (letter - ask - 1.0) / 1.6), cont: true },
          // письмо появляется со сдвигом страницы, поэтому это новый план, а не продолжение
          { clip: "services" as const, from: letter - 0.1, to: letter + 4.0 },
        ]
      : []),
  ];
  const fReport = frameOf(segs, "services", "report", -1.7);
  const fAffects = segStart(segs, 1);
  const fLetterBtn = hasLetter ? segStart(segs, 2) : fAffects + 60;
  const fLetter = hasLetter ? segStart(segs, 4) : fAffects + 90;
  return demoScene({
    id: "sick",
    segs,
    chapter: "04 · Больничный",
    title: "Одно нажатие вместо беготни",
    cam: [
      focus(fReport, mb("services", "report"), { max: 1.5, fill: 0.5, until: frameOf(segs, "services", "report", 1.9), label: "Сообщить в день болезни" }),
      home(fAffects - 8, 8),
      // блок «Что это затрагивает» выше окна, поэтому рамка задана вручную: заголовок, сводка и первая дисциплина
      focus(fAffects, { x: 0.225, y: 0.125, w: 0.725, h: 0.36 }, { max: 1.08, ring: false, label: "Видно, какие пары и дедлайны затронуты" }),
      ...(hasLetter
        ? [
            home(fLetterBtn - 6, 6),
            focus(fLetterBtn + 2, mb("services", "letter-btn"), { max: 1.5, fill: 0.5, until: frameOf(segs, "services", "letter-btn", 1.9), label: "Письмо преподавателю пишет Атташе" }),
            home(fLetter - 6, 6),
            focus(fLetter + 8, mb("services", "letter"), { max: 1.4, label: "Остаётся проверить и отправить" }),
          ]
        : []),
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// 05 Телефон: два телефона, пояснения рядом с ними
// ─────────────────────────────────────────────────────────────
/** Плашка у края телефона: side="left" заканчивается у anchorX, side="right" начинается от него */
const PhoneNote: React.FC<{ from: number; to: number; text: string; anchorX: number; y: number; side: "left" | "right" }> = ({ from, to, text, anchorX, y, side }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < from - 2 || f > to + 12) return null;
  const p = spring({ frame: f - from, fps, config: { damping: 200 }, durationInFrames: 18 });
  const o = interpolate(f, [to, to + 10], [1, 0], clamp);
  const pos: React.CSSProperties = side === "left" ? { right: 1920 - anchorX } : { left: anchorX };
  return (
    <div style={{ position: "absolute", ...pos, top: y, display: "flex", alignItems: "center", flexDirection: side === "left" ? "row" : "row-reverse", opacity: p * o }}>
      <div
        style={{
          padding: "19px 28px",
          borderRadius: 18,
          background: C.brand,
          color: "#fff",
          fontFamily: SANS,
          fontSize: 30,
          fontWeight: 560,
          letterSpacing: "-0.02em",
          boxShadow: "0 22px 56px rgba(47,84,235,0.40)",
          transform: `translateX(${(1 - p) * (side === "left" ? -16 : 16)}px)`,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <div style={{ width: 44 * p, height: 3, background: C.brand }} />
    </div>
  );
};

function phoneScene(): Scene {
  const segsRu: Seg[] = [{ clip: "phone", from: mt("phone", "today") - 0.3, to: mt("phone", "offline-loaded") + 2.0, rate: 1.8 }];
  const ruSecs = segsFrames(segsRu) / FPS + 1;
  const enFrom = mt("phone-en", "today") - 0.3;
  const enTo = mt("phone-en", "schedule") + 3.0;
  const segsEn: Seg[] = [{ clip: "phone-en", from: enFrom, to: enTo, rate: Math.min(1.4, (enTo - enFrom) / ruSecs) }];
  // сцена кончается вместе с записью левого телефона (она сдвинута на 4 кадра): иначе в конце его экран пустел бы
  const frames = segsFrames(segsRu) + 4;
  const fSchedule = frameOf(segsRu, "phone", "schedule", -0.3) + 4;
  const fOffline = frameOf(segsRu, "phone", "offline", 0.2) + 4;
  const Component: React.FC = () => {
    const f = useCurrentFrame();
    const exit = interpolate(f, [frames - 18, frames - 6], [1, 0], clamp);
    return (
      <AbsoluteFill>
        <Background glowX={50} glowY={52} />
        <div style={{ opacity: exit }}>
          <ChapterTag chapter="05 · Телефон" titles={[{ at: 0, text: "Кабинет в телефоне" }]} />
          <PhoneNote from={24} to={fSchedule - 4} text="Ставится как приложение" anchorX={672} y={560} side="left" />
          <PhoneNote from={fSchedule} to={fOffline - 4} text="Расписание за секунду" anchorX={672} y={560} side="left" />
          <PhoneNote from={fOffline} to={frames} text="Без сети откроется сохранённое" anchorX={672} y={430} side="left" />
          <PhoneNote from={40} to={frames} text="English и тёмная тема" anchorX={1500} y={760} side="right" />
        </div>
        {/* английский телефон снят в тёмной теме: в кадре видны обе */}
        <PhoneFrame x={1110} y={310} w={360} delay={14} tilt={4}>
          <Footage segs={segsEn} offset={14} />
        </PhoneFrame>
        <PhoneFrame x={690} y={246} w={380} delay={4} light tilt={-2}>
          <Footage segs={segsRu} offset={4} />
        </PhoneFrame>
        <Grain />
      </AbsoluteFill>
    );
  };
  return { id: "phone", frames, Component };
}

// ─────────────────────────────────────────────────────────────
// Финал 1: цифры по одной, крупно, потом строкой
// ─────────────────────────────────────────────────────────────
const STATS: { big: string; label: string; count?: [number, (n: number) => string] }[] = [
  { big: "1 окно", label: "вместо пяти мест, где жила учёба" },
  { big: "0", label: "походов в деканат за справкой" },
  { big: "7", label: "сценариев ИИ-ассистента", count: [7, (n) => String(Math.round(n))] },
  { big: "46 / 46", label: "проверок безопасности", count: [46, (n) => `${Math.round(n)} / 46`] },
];
const STAT_LEN = 44;
const NUMBERS_LEN = 16 + STATS.length * STAT_LEN + 76;
const Numbers: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rowAt = 16 + STATS.length * STAT_LEN;
  return (
    <AbsoluteFill>
      <Background glowX={50} glowY={48} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 96, textAlign: "center" }}>
        <Label>Что получилось</Label>
      </div>
      {STATS.map((st, i) => {
        const at = 16 + i * STAT_LEN;
        if (f < at - 2 || f > at + STAT_LEN + 8) return null;
        const p = spring({ frame: f - at, fps, config: { damping: 200 }, durationInFrames: 20 });
        const o = interpolate(f, [at + STAT_LEN - 6, at + STAT_LEN + 4], [1, 0], clamp);
        const up = interpolate(f, [at + STAT_LEN - 6, at + STAT_LEN + 4], [0, -40], clamp);
        return (
          <AbsoluteFill key={i} style={{ alignItems: "center", justifyContent: "center", opacity: p * o }}>
            <div style={{ transform: `translateY(${up}px) scale(${1.16 - p * 0.16})`, filter: `blur(${(1 - p) * 14}px)`, textAlign: "center" }}>
              <div style={{ fontFamily: SANS, fontSize: 250, fontWeight: 640, color: i % 2 ? C.brand : C.ink, letterSpacing: "-0.06em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {st.count ? <CountUp value={st.count[0]} delay={at} duration={26} format={st.count[1]} /> : st.big}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 48, color: C.ink2, marginTop: 30, letterSpacing: "-0.02em" }}>{st.label}</div>
            </div>
          </AbsoluteFill>
        );
      })}
      <div style={{ position: "absolute", left: 160, right: 160, top: 400, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28 }}>
        {STATS.map((st, i) => (
          <Rise key={i} delay={rowAt + i * 5}>
            <div style={{ borderTop: `2px solid ${i === 0 ? C.brand : C.ink}`, paddingTop: 28 }}>
              <div style={{ fontFamily: SANS, fontSize: 96, fontWeight: 640, color: C.ink, letterSpacing: "-0.05em", lineHeight: 1 }}>{st.big}</div>
              <div style={{ fontFamily: SANS, fontSize: 30, color: C.ink2, marginTop: 18, lineHeight: 1.3 }}>{st.label}</div>
            </div>
          </Rise>
        ))}
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// Финал 2: стена из настоящих экранов в 3D
// ─────────────────────────────────────────────────────────────
export const SHOTS = [
  "today", "staff-queue", "assistant", "documents", "schedule",
  "staff-analytics", "requests", "sick-leave", "notifications", "staff-requests",
  "appointments", "grades", "profile", "staff-students", "payments",
  "staff-retakes", "staff-schedule", "staff-announcements", "staff-radar", "staff-appointments",
];
const WALL_LEN = sec(7);
const Wall: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cols = 5;
  const w = 520;
  const h = 325;
  const gap = 28;
  const scroll = interpolate(f, [0, WALL_LEN], [80, -320], clamp);
  const appear = spring({ frame: f, fps, config: { damping: 200 }, durationInFrames: 40 });
  const lines = ["11 разделов для студента", "8 для учебного офиса", "Светлая и тёмная тема, русский и английский"];
  return (
    <AbsoluteFill style={{ background: "#dededa", overflow: "hidden" }}>
      <AbsoluteFill style={{ perspective: 2200, opacity: appear }}>
        <div
          style={{
            position: "absolute",
            left: 960 - (cols * (w + gap)) / 2,
            top: 40,
            width: cols * (w + gap),
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, ${w}px)`,
            gap,
            transform: `translateY(${scroll}px) rotateX(28deg) rotateZ(-12deg) scale(${1.25 - appear * 0.1})`,
            transformOrigin: "50% 40%",
          }}
        >
          {SHOTS.map((s, i) => {
            const p = spring({ frame: f - 4 - (i % cols) * 3 - Math.floor(i / cols) * 4, fps, config: { damping: 200 }, durationInFrames: 30 });
            return (
              <Img
                key={s}
                src={staticFile(`shots-light/${s}.jpg`)}
                style={{ width: w, height: h, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(10,10,10,0.14)", opacity: p, transform: `translateY(${(1 - p) * 60}px)`, boxShadow: "0 30px 70px rgba(22,34,80,0.20)" }}
              />
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(860px 430px at 50% 50%, rgba(241,241,238,0.97) 30%, rgba(241,241,238,0.7) 62%, rgba(241,241,238,0) 100%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          {lines.map((l, i) => (
            <Rise key={l} delay={18 + i * 26}>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: i === 2 ? 42 : 100,
                  fontWeight: i === 2 ? 450 : 630,
                  color: i === 2 ? C.ink2 : i === 1 ? C.brand : C.ink,
                  letterSpacing: i === 2 ? "-0.02em" : "-0.05em",
                  lineHeight: 1.08,
                  marginTop: i === 2 ? 34 : 0,
                }}
              >
                {l}
              </div>
            </Rise>
          ))}
        </div>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// Финал 3: как сделано
// ─────────────────────────────────────────────────────────────
const BUILT_LEN = sec(7.6);
const AGENTS = 37;
const Built: React.FC = () => {
  const f = useCurrentFrame();
  const agents = Array.from({ length: AGENTS }, (_, i) => i);
  const kind = (i: number) => (i < 2 ? "research" : i < 12 ? "dev" : i < 34 ? "qa" : "review");
  const facts: [React.ReactNode, string][] = [
    [<CountUp key="a" value={AGENTS} delay={50} />, "ИИ-агентов в работе"],
    [
      <>
        ~<CountUp key="b" value={16} delay={56} /> ч
      </>,
      "от ТЗ до сайта по ссылке",
    ],
    [
      <>
        <CountUp key="c" value={29} delay={62} /> тыс.
      </>,
      "строк кода, написал ИИ",
    ],
    [<CountUp key="d" value={79} delay={68} />, "e2e-проверок пройдено"],
  ];
  const groups: [string, string][] = [
    ["2", "исследователя"],
    ["10", "разработчиков разделов"],
    ["22", "в проверке качества"],
    ["3", "проверяющих перед сдачей"],
  ];
  return (
    <AbsoluteFill>
      <Background glowX={40} glowY={42} />
      <div style={{ position: "absolute", left: 160, top: 130, width: 1600 }}>
        <Label>Как сделано</Label>
        <Rise delay={TEXT_IN + 4} y={30}>
          <div style={{ fontFamily: SANS, fontSize: 104, fontWeight: 620, color: C.ink, letterSpacing: "-0.048em", lineHeight: 1.03, marginTop: 20 }}>
            Собрано командой <span style={{ color: C.brand }}>ИИ-агентов</span>
          </div>
        </Rise>
        <Rise delay={TEXT_IN + 12}>
          <div style={{ fontFamily: SANS, fontSize: 34, color: C.ink2, marginTop: 26, letterSpacing: "-0.015em" }}>Claude Code писал код, человек ставил задачи и принимал решения</div>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 160, top: 420, display: "flex", gap: 12 }}>
        {["Claude Code", "Субагенты и Workflow", "Playwright", "DeepSeek V3.2"].map((t, i) => (
          <Chip key={t} delay={TEXT_IN + 16 + i * 4}>
            {t}
          </Chip>
        ))}
      </div>
      <div style={{ position: "absolute", left: 160, top: 540, display: "grid", gridTemplateColumns: "repeat(19, 50px)", gap: 14 }}>
        {agents.map((i) => {
          const on = interpolate(f, [24 + i * 1.4, 32 + i * 1.4], [0, 1], clamp);
          const k = kind(i);
          const fill = k === "research" ? `rgba(10,10,10,${on})` : k === "dev" ? `rgba(47,84,235,${on})` : k === "qa" ? `rgba(47,84,235,${on * 0.32})` : "rgba(47,84,235,0)";
          const edge = on > 0.5 ? (k === "research" ? C.ink : C.brand) : C.line;
          return <div key={i} style={{ width: 50, height: 50, borderRadius: 12, border: `${k === "review" ? 2.5 : 1}px solid ${edge}`, background: fill, transform: `scale(${0.7 + on * 0.3})` }} />;
        })}
      </div>
      <div style={{ position: "absolute", left: 160, top: 690, display: "flex", gap: 38, fontFamily: SANS, fontSize: 26, color: C.ink2 }}>
        {groups.map(([n, t], i) => (
          <Rise key={t} delay={44 + i * 4}>
            <span>
              <span style={{ color: C.ink, fontWeight: 600 }}>{n}</span> {t}
            </span>
          </Rise>
        ))}
      </div>
      <div style={{ position: "absolute", left: 160, top: 790, width: 1600, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28 }}>
        {facts.map(([n, l], i) => (
          <Rise key={i} delay={48 + i * 6}>
            <div style={{ borderTop: `2px solid ${C.ink}`, paddingTop: 24 }}>
              <div style={{ fontFamily: SANS, fontSize: 84, fontWeight: 620, color: C.ink, letterSpacing: "-0.045em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{n}</div>
              <div style={{ fontFamily: SANS, fontSize: 28, color: C.ink2, marginTop: 16 }}>{l}</div>
            </div>
          </Rise>
        ))}
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// Финал 4: знак, слоган и QR по центру
// ─────────────────────────────────────────────────────────────
const FINAL_LEN = sec(7.6);
const QR = (() => {
  const q = QRCode.create(SITE_URL, { errorCorrectionLevel: "M" });
  const n = q.modules.size;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
  return { n, d };
})();
const Final: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f - 6, fps, config: { damping: 16, stiffness: 110 }, durationInFrames: 40 });
  const q = spring({ frame: f - 50, fps, config: { damping: 200 }, durationInFrames: 30 });
  return (
    <AbsoluteFill>
      <Background glowX={50} glowY={40} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ marginTop: 120, transform: `scale(${0.6 + logo * 0.4})`, opacity: Math.min(1, logo * 1.3) }}>
          <LogoMark size={140} />
        </div>
        <Rise delay={20} y={30}>
          <div style={{ marginTop: 46, fontFamily: SANS, fontSize: 112, fontWeight: 620, letterSpacing: "-0.05em", color: C.ink, textAlign: "center", lineHeight: 1.02 }}>
            Вся учёба <span style={{ color: C.brand }}>в одном окне</span>
          </div>
        </Rise>
        <Rise delay={30}>
          <div style={{ marginTop: 22, fontFamily: SANS, fontSize: 40, letterSpacing: "-0.03em", color: C.ink2, textAlign: "center" }}>
            <span style={{ fontWeight: 640, color: C.ink }}>MGIMO</span> Hub
          </div>
        </Rise>
        <div style={{ marginTop: 64, display: "flex", alignItems: "center", gap: 48, opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
          <div style={{ width: 230, height: 230, padding: 20, borderRadius: 24, background: "#fff", border: "1px solid rgba(10,10,10,0.10)", boxShadow: C.shadowSoft }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${QR.n} ${QR.n}`} shapeRendering="crispEdges">
              <path d={QR.d} fill="#0a0a0a" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 44, color: C.ink, fontWeight: 620, letterSpacing: "-0.03em" }}>Попробуйте сами</div>
            <div style={{ fontFamily: SANS, fontSize: 30, color: C.ink2, marginTop: 14 }}>Наведите камеру телефона на QR</div>
            <div style={{ fontFamily: SANS, fontSize: 28, color: C.ink2, marginTop: 18 }}>
              Вход в одно касание: <span style={{ fontFamily: MONO, color: C.ink }}>student.anna</span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
};

export function buildScenes(): Scene[] {
  return [
    { id: "problem", frames: PROBLEM_LEN, Component: Problem },
    chapterCard("ba-day", "01 · День", "Расписание в чате, о переносе узнаёшь последним", "Где пара", "и что изменилось.", "Главный экран показывает пару, аудиторию и все изменения"),
    dayScene(),
    chapterCard("ba-cert", "02 · Справка", "Очередь в деканат и «приходите завтра»", "Заявка за минуту.", "Статус на каждом шаге.", "Заявку заполняет Атташе, учебный офис ведёт её в своей очереди"),
    attacheScene(),
    staffScene(),
    resultScene(),
    chapterCard("ba-appointment", "03 · Приём", "Живая очередь у кабинета", "Запись на время.", "Талон в телефоне.", "Тема, день, свободное время и напоминание в календаре"),
    appointmentScene(),
    chapterCard("ba-sick", "04 · Больничный", "Писать каждому преподавателю и нести справку", "Заболели?", "Офис уже в курсе.", "Письмо о переносе контрольной напишет Атташе"),
    sickScene(),
    chapterCard("ba-phone", "05 · Телефон", "Нет сети, и расписание не открыть", "Всё в кармане.", "Даже без сети.", "Ставится как приложение, есть английский интерфейс"),
    phoneScene(),
    { id: "numbers", frames: NUMBERS_LEN, Component: Numbers },
    { id: "wall", frames: WALL_LEN, Component: Wall },
    { id: "built", frames: BUILT_LEN, Component: Built },
    { id: "final", frames: FINAL_LEN, Component: Final },
  ];
}
