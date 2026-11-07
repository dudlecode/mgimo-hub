import React from "react";
import { AbsoluteFill, Img, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import QRCode from "qrcode";
import { C, FPS, MONO, SANS, SITE_URL } from "./theme";
import { frameOf, focus, hasMark, home, mb, mt, segsFrames, segStart, type CamKey, type ClipName, type Seg } from "./footage";
import { Background, BrowserFrame, Chip, CountUp, Eyebrow, Footage, FRAME, Grain, Headline, LogoMark, PhoneFrame, Rise, Wordmark } from "./ui";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => Math.round(s * FPS);

export type Scene = { id: string; frames: number; Component: React.FC; demo?: boolean };
/** Текст новой сцены появляется после склейки */
const TEXT_IN = 12;
/** Пауза перед первым кадром записи, кадров */
const LEAD = 10;

/** Для проверки: где в сценах показываются обводки */
export const RING_DEBUG: { id: string; keys: { at: number; d?: number; box: boolean; until?: number }[] }[] = [];
export const CAM_DEBUG: { id: string; segs: Seg[]; cam: CamKey[] }[] = [];

/** Глава сверху: номер и название, не меняются по ходу сцены */
const ChapterTag: React.FC<{ chapter: string; title: string; left?: number; top?: number }> = ({ chapter, title, left = FRAME.x, top = 50 }) => (
  <div style={{ position: "absolute", left, top, display: "flex", alignItems: "baseline", gap: 22 }}>
    <Rise delay={TEXT_IN} y={14}>
      <div style={{ fontFamily: MONO, fontSize: 26, color: C.brandText }}>{chapter}</div>
    </Rise>
    <Rise delay={TEXT_IN + 4} y={14}>
      <div style={{ fontFamily: SANS, fontSize: 40, fontWeight: 620, color: C.ink, letterSpacing: "-0.03em" }}>{title}</div>
    </Rise>
  </div>
);

/** Сцена с живой записью: крупный браузер по центру, пояснения плашками у блоков */
function demoScene(opts: { id: string; segs: Seg[]; chapter: string; title: string; cam?: CamKey[]; chain?: boolean }): Scene {
  const frames = segsFrames(opts.segs) + LEAD;
  CAM_DEBUG.push({ id: opts.id, segs: opts.segs, cam: (opts.cam ?? []).map((k) => ({ ...k, at: k.at + LEAD, until: k.until !== undefined ? k.until + LEAD : undefined })) });
  RING_DEBUG.push({ id: opts.id, keys: (opts.cam ?? []).map((k) => ({ at: k.at + LEAD, d: k.d, box: !!k.box, until: k.until !== undefined ? k.until + LEAD : undefined })) });
  const Component: React.FC = () => {
    const f = useCurrentFrame();
    const exit = interpolate(f, [frames - 18, frames - 6], [1, 0], clamp);
    return (
      <AbsoluteFill>
        <Background glowX={50} glowY={60} />
        <div style={{ opacity: exit }}>
          <ChapterTag chapter={opts.chapter} title={opts.title} />
        </div>
        <BrowserFrame x={FRAME.x} y={FRAME.y} w={FRAME.w} delay={opts.chain ? -300 : 0}>
          <Footage
            segs={opts.segs}
            cam={(opts.cam ?? []).map((k) => ({ ...k, at: k.at + LEAD, until: k.until !== undefined ? k.until + LEAD : undefined }))}
            offset={LEAD}
            unit={FRAME.w / 1280}
            pxW={FRAME.w}
          />
        </BrowserFrame>
        <Grain />
      </AbsoluteFill>
    );
  };
  return { id: opts.id, frames, Component, demo: true };
}

/** Кадр метки с поправкой; если метки нет, запасное значение */
const fo = (segs: Seg[], clip: ClipName, mark: string, offset = 0, fallback = 0) => (hasMark(clip, mark) ? frameOf(segs, clip, mark, offset) : fallback);

/** Живые чернила со страницы входа как фон */
const InkBackdrop: React.FC<{ dim?: number; from?: number }> = ({ dim = 0.5, from = 2.4 }) => {
  const s = 1 / 0.56;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(-0.4%, ${((1 - s) / 2) * 100}%) scale(${s})` }}>
        <OffthreadVideo
          src={staticFile("footage/intro.mp4")}
          trimBefore={sec(from)}
          playbackRate={0.6}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(2px) contrast(1.05)" }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(10,10,10,${dim})` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(10,10,10,0) 35%, rgba(10,10,10,0.92) 100%)" }} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// Вступление и проблема одной сценой на общем фоне с чернилами:
// знак проявляется и уходит, следом пять мест сливаются в одно окно
// ─────────────────────────────────────────────────────────────
const INTRO = sec(2.7);
const PROBLEM_LEN = INTRO + sec(10.6);
const CARDS = [
  { t: "Расписание", s: "сайт и чат группы", x: 1060, y: 240, r: -4 },
  { t: "Баллы", s: "у каждого преподавателя", x: 1440, y: 330, r: 3 },
  { t: "Справки", s: "очередь в деканате", x: 1120, y: 530, r: 2 },
  { t: "Новости", s: "почта и каналы", x: 1480, y: 630, r: -3 },
  { t: "Вопросы", s: "староста и знакомые", x: 1170, y: 790, r: -2 },
];
const MERGE = INTRO + sec(5.7);
const Problem: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // знак в начале
  const logoIn = spring({ frame: f - 6, fps, config: { damping: 200 }, durationInFrames: 36 });
  const logoOut = interpolate(f, [INTRO - 22, INTRO - 2], [0, 1], { ...clamp, easing: (t) => t * t });
  const dimIn = interpolate(f, [0, 20], [1, 0], clamp);
  const darker = interpolate(f, [INTRO - 20, INTRO + 10], [0, 1], clamp);
  const m = spring({ frame: f - MERGE, fps, config: { damping: 200 }, durationInFrames: 36 });
  const win = spring({ frame: f - MERGE - 14, fps, config: { damping: 200 }, durationInFrames: 36 });
  return (
    <AbsoluteFill>
      <InkBackdrop dim={0.32} />
      <AbsoluteFill style={{ background: `rgba(10,10,10,${darker * 0.2})` }} />
      <AbsoluteFill style={{ background: C.bg, opacity: dimIn }} />
      {/* знак */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: logoIn * (1 - logoOut) }}>
        <div style={{ transform: `scale(${0.92 + logoIn * 0.08 - logoOut * 0.06})`, filter: `blur(${(1 - logoIn) * 10 + logoOut * 8}px)` }}>
          <Wordmark size={86} />
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 120, top: 330, width: 820 }}>
        <Rise delay={INTRO + 4} out={MERGE - 8}>
          <div style={{ fontFamily: MONO, fontSize: 26, color: C.brandText, marginBottom: 22 }}>Проблема</div>
        </Rise>
        <Headline size={84} delay={INTRO + 8} out={MERGE - 8}>
          Учёба разбросана по&nbsp;пяти местам
        </Headline>
        <Rise delay={INTRO + sec(1.6)} out={MERGE - 8}>
          <div style={{ fontFamily: SANS, fontSize: 36, color: C.ink2, marginTop: 30, lineHeight: 1.3, width: 720 }}>А за каждой справкой нужно идти в очередь</div>
        </Rise>
      </div>
      {CARDS.map((c, i) => {
        const p = spring({ frame: f - INTRO - 14 - i * 8, fps, config: { damping: 200 }, durationInFrames: 30 });
        const fx = Math.sin((f + i * 40) / 38) * 10;
        const fy = Math.cos((f + i * 25) / 44) * 8;
        const tx = 1340 - 185;
        const ty = 560 - 60;
        const x = c.x + fx + (tx - c.x) * m;
        const y = c.y + fy + (ty - c.y) * m;
        return (
          <div
            key={c.t}
            style={{
              position: "absolute",
              left: x,
              top: y + (1 - p) * 40,
              width: 370,
              padding: "24px 28px",
              borderRadius: 18,
              background: "rgba(19,19,19,0.92)",
              border: `1px solid ${C.line}`,
              opacity: p * (1 - m),
              transform: `rotate(${c.r * (1 - m)}deg) scale(${1 - m * 0.4})`,
              boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontFamily: SANS, fontSize: 36, fontWeight: 600, color: C.ink, letterSpacing: "-0.02em" }}>{c.t}</div>
            <div style={{ fontFamily: SANS, fontSize: 26, color: C.ink3, marginTop: 6 }}>{c.s}</div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 1340 - 330,
          top: 560 - 210,
          width: 660,
          height: 420,
          borderRadius: 26,
          border: "1px solid #333",
          background: "rgba(16,16,16,0.94)",
          opacity: win,
          transform: `scale(${0.86 + win * 0.14})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 30,
          boxShadow: "0 60px 160px rgba(0,0,0,0.6), 0 0 120px rgba(47,84,235,0.14)",
        }}
      >
        <Wordmark size={60} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", width: 560 }}>
          {["Расписание", "Баллы", "Справки", "Новости", "Атташе"].map((t, i) => (
            <Rise key={t} delay={MERGE + 30 + i * 5} y={10}>
              <div style={{ fontFamily: SANS, fontSize: 26, color: C.ink2, padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.line}` }}>{t}</div>
            </Rise>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: 120, top: 330, width: 760 }}>
        <Rise delay={MERGE + 6}>
          <div style={{ fontFamily: MONO, fontSize: 26, color: C.brandText, marginBottom: 22 }}>Решение</div>
        </Rise>
        <Headline size={84} delay={MERGE + 10}>
          Одно окно для всей учёбы
        </Headline>
        <Rise delay={MERGE + 26}>
          <div style={{ fontFamily: SANS, fontSize: 36, color: C.ink2, marginTop: 30, lineHeight: 1.3 }}>Кабинет студента, рабочее место деканата и ИИ-ассистент</div>
        </Rise>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// Карточки глав «Было / Стало»: зачёркивание, 3D-въезд и блик
// ─────────────────────────────────────────────────────────────
const BA_LEN = sec(5.8);
function beforeAfter(id: string, chapter: string, title: string, before: string, after: string, how: string): Scene {
  const Component: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    const AFTER_AT = 54;
    const b = spring({ frame: f - 14, fps, config: { damping: 200 }, durationInFrames: 28 });
    const a = spring({ frame: f - AFTER_AT, fps, config: { damping: 18, stiffness: 120, mass: 0.9 }, durationInFrames: 40 });
    const strike = interpolate(f, [AFTER_AT - 16, AFTER_AT + 4], [0, 1], clamp);
    const dim = interpolate(f, [AFTER_AT, AFTER_AT + 22], [1, 0.4], clamp);
    const sweep = interpolate(f, [AFTER_AT + 16, AFTER_AT + 48], [-0.6, 1.6], clamp);
    const exit = interpolate(f, [BA_LEN - 16, BA_LEN - 4], [1, 0], clamp);
    const zoom = interpolate(f, [BA_LEN - 18, BA_LEN], [1, 1.06], clamp);
    const drift = Math.sin(f / 50) * 4;
    return (
      <AbsoluteFill>
        <InkBackdrop dim={0.8} />
        <AbsoluteFill style={{ opacity: exit, transform: `scale(${zoom})` }}>
          <div style={{ position: "absolute", left: 160, top: 150, width: 1500 }}>
            <Eyebrow delay={TEXT_IN}>{chapter}</Eyebrow>
            <Headline size={80} delay={TEXT_IN + 4}>
              {title}
            </Headline>
          </div>
          <div
            style={{
              position: "absolute",
              left: 160,
              top: 400 + (1 - b) * 50 + drift,
              width: 760,
              padding: "40px 48px",
              borderRadius: 26,
              background: "rgba(18,18,18,0.92)",
              border: `1px solid ${C.line}`,
              opacity: b * dim,
              transform: `rotate(${-2.2 * b}deg) scale(${1 - (1 - dim) * 0.08})`,
              transformOrigin: "left center",
              boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 24, color: C.ink3, letterSpacing: "0.02em" }}>Было</div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 44,
                color: C.ink2,
                marginTop: 18,
                lineHeight: 1.22,
                letterSpacing: "-0.02em",
                textDecorationLine: "line-through",
                textDecorationThickness: 3,
                textDecorationColor: `rgba(230,90,90,${strike * 0.9})`,
              }}
            >
              {before}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 820,
              top: 520 + (1 - a) * 80 - drift,
              width: 940,
              padding: "44px 52px",
              borderRadius: 28,
              overflow: "hidden",
              background: "linear-gradient(180deg, rgba(26,34,66,0.96), rgba(16,19,32,0.96))",
              border: "1px solid rgba(47,84,235,0.65)",
              opacity: Math.min(1, a * 1.4),
              transform: `perspective(1800px) rotateY(${(1 - a) * -22}deg) rotateX(${(1 - a) * 8}deg) scale(${0.92 + a * 0.08})`,
              transformOrigin: "left center",
              boxShadow: "0 50px 140px rgba(0,0,0,0.6), 0 0 90px rgba(47,84,235,0.28)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${sweep * 100}%`,
                width: "35%",
                background: "linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.13), rgba(255,255,255,0))",
                pointerEvents: "none",
              }}
            />
            <div style={{ fontFamily: MONO, fontSize: 24, color: C.brandText, letterSpacing: "0.02em" }}>Стало</div>
            <div style={{ fontFamily: SANS, fontSize: 50, color: C.ink, marginTop: 18, lineHeight: 1.16, fontWeight: 600, letterSpacing: "-0.03em" }}>{after}</div>
            <Rise delay={AFTER_AT + 18} y={12}>
              <div style={{ fontFamily: SANS, fontSize: 30, color: "#aeb8dd", marginTop: 22, lineHeight: 1.3 }}>{how}</div>
            </Rise>
          </div>
        </AbsoluteFill>
        <Grain />
      </AbsoluteFill>
    );
  };
  return { id, frames: BA_LEN, Component };
}

// ─────────────────────────────────────────────────────────────
// 01 День
// ─────────────────────────────────────────────────────────────
function loginScene(): Scene {
  const segs: Seg[] = [{ clip: "student", from: mt("student", "login-demo") - 1.0, to: mt("student", "today") + 0.2 }];
  const fDemo = frameOf(segs, "student", "login-demo", -0.7);
  const fToday = frameOf(segs, "student", "today", -1.0);
  return demoScene({
    id: "login",
    segs,
    chapter: "01 · День",
    title: "Один вход для всей учёбы",
    cam: [
      focus(fDemo, mb("student", "login-demo"), { max: 1.6, until: frameOf(segs, "student", "today", -2.0), label: "Для жюри: вход в одно касание" }),
      home(fToday - 14, 30),
    ],
  });
}

function todayScene(): Scene {
  const changes = hasMark("student", "changes");
  const segs: Seg[] = [{ clip: "student", from: mt("student", "today") + 0.4, to: mt("student", changes ? "changes" : "now") + 3.4 }];
  const fNow = frameOf(segs, "student", "now", -0.5);
  const fChanges = fo(segs, "student", "changes", -0.5, fNow + sec(4));
  return demoScene({
    id: "today",
    chain: true,
    segs,
    chapter: "01 · День",
    title: "Весь день на одном экране",
    cam: [
      focus(fNow, mb("student", "now"), { label: "Пара идёт: где и сколько до конца" }),
      ...(changes ? [focus(fChanges, mb("student", "changes"), { label: "Переносы и замены подсвечены" })] : []),
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// 02 Справка: студент, деканат, результат
// ─────────────────────────────────────────────────────────────
function attacheScene(): Scene {
  const ask = mt("student", "ask");
  const answer = mt("student", "answer");
  const wait = Math.max(0.5, answer - ask - 1.2);
  const segs: Seg[] = [
    { clip: "student", from: mt("student", "assistant") + 0.9, to: ask + 1.2 },
    { clip: "student", from: ask + 1.2, to: answer - 0.2, rate: Math.max(1, wait / 2.0), cont: true },
    { clip: "student", from: answer - 0.2, to: answer + 3.0, cont: true },
    { clip: "student", from: mt("student", "draft-button") - 1.7, to: mt("student", "draft-button") + 1.9 },
    { clip: "student", from: mt("student", "form") - 0.3, to: mt("student", "form") + 1.8 },
    { clip: "student", from: mt("student", "submit") - 1.0, to: mt("student", "submitted") + 2.8 },
  ];
  const fAnswer = segStart(segs, 2);
  const fDraft = segStart(segs, 3);
  const fForm = segStart(segs, 4);
  const fSubmit = segStart(segs, 5);
  const fSubmitted = frameOf(segs, "student", "submitted", -0.3);
  return demoScene({
    id: "attache",
    segs,
    chapter: "02 · Справка",
    title: "Справку готовит Атташе",
    cam: [
      focus(fAnswer + 4, mb("student", "answer"), { max: 1.5, label: "Отвечает по вашим данным" }),
      home(fDraft - 6, 6),
      focus(fDraft + 4, mb("student", "draft-button"), { max: 1.6, until: frameOf(segs, "student", "draft-button", 1.7), label: "Черновик заявки готов" }),
      home(fForm - 6, 6),
      focus(fForm + 4, mb("student", "form"), { max: 1.3, label: "Поля уже заполнены" }),
      home(fSubmit - 6, 6),
      focus(fSubmit + 4, mb("student", "submit"), { max: 1.5, until: frameOf(segs, "student", "submit", 1.9), label: "Отправляете вы сами" }),
      home(fSubmitted - 20, 18),
      focus(fSubmitted + 8, mb("student", "submitted"), { max: 1.55, label: "Статус как у посылки" }),
    ],
  });
}

function staffScene(): Scene {
  const draftAsk = mt("staff", "draft-ask", mt("staff", "taken") + 2);
  const draft = mt("staff", "draft", draftAsk + 2);
  const item = mt("staff", "queue-item", mt("staff", "queue") + 2);
  const segs: Seg[] = [
    { clip: "staff", from: item - 1.2, to: item + 2.5 },
    { clip: "staff", from: mt("staff", "taken-click") - 0.5, to: mt("staff", "taken") + 0.3 },
    { clip: "staff", from: draftAsk - 0.2, to: draftAsk + 0.5 },
    { clip: "staff", from: draftAsk + 0.5, to: draft - 0.1, rate: Math.max(1, (draft - draftAsk - 0.6) / 1.2), cont: true },
    { clip: "staff", from: draft - 0.1, to: draft + 2.2, cont: true },
    { clip: "staff", from: mt("staff", "ready-click") - 0.5, to: mt("staff", "ready") + 1.8 },
  ];
  const fTaken = segStart(segs, 1);
  const fDraft = segStart(segs, 2);
  const fReady = segStart(segs, 5);
  const fToast = frameOf(segs, "staff", "ready", -0.3);
  const btn = (mark: string, f: number, untilOffset: number, label: string) =>
    focus(f, mb("staff", mark), { max: 1.6, fill: 0.5, until: frameOf(segs, "staff", mark, untilOffset), label });
  return demoScene({
    id: "staff",
    chain: true,
    segs,
    chapter: "02 · Справка",
    title: "Деканат не теряет заявки",
    cam: [
      focus(6, mb("staff", "queue-item"), { max: 1.6, until: frameOf(segs, "staff", "queue-item", 2.3), label: "Заявка Анны уже в очереди" }),
      home(fTaken - 6, 6),
      btn("taken-click", fTaken + 2, 1.9, "В работу одним нажатием"),
      home(fDraft - 6, 6),
      focus(fDraft + 2, mb("staff", "draft"), { max: 1.6, fill: 0.62, label: "Ответ студенту пишет Атташе" }),
      home(fReady - 6, 6),
      btn("ready-click", fReady + 2, 1.9, "Справка с QR в одно нажатие"),
      { at: fToast, s: 1.25, x: 0.6, y: 0.3, d: 26 },
    ],
  });
}

function resultScene(): Scene {
  const segs: Seg[] = [
    { clip: "result", from: mt("result", "bell") - 1.0, to: mt("result", "notifications") + 3.4 },
    { clip: "result", from: mt("result", "doc-tile") - 2.2, to: mt("result", "doc-tile") + 2.0 },
    { clip: "result", from: mt("result", "verify") - 0.3, to: mt("result", "verify") + 3.2 },
  ];
  const fNotif = frameOf(segs, "result", "notifications", -0.2);
  const fDocs = segStart(segs, 1);
  const fTile = frameOf(segs, "result", "doc-tile", -1.6);
  const fVerify = segStart(segs, 2);
  return demoScene({
    id: "result",
    chain: true,
    segs,
    chapter: "02 · Справка",
    title: "Справка уже у студента",
    cam: [
      focus(fNotif + 4, mb("result", "notifications"), { max: 1.6, fill: 0.8, label: "Уведомление пришло сразу" }),
      home(fDocs - 8, 8),
      focus(fTile, mb("result", "doc-tile"), { max: 1.6, until: frameOf(segs, "result", "doc-tile", 1.9), label: "Справка с QR без похода в деканат" }),
      home(fVerify - 8, 8),
      focus(fVerify + 10, mb("result", "verify"), { max: 1.55, label: "Посольство проверит её по QR" }),
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// 03 Приём и 04 Больничный
// ─────────────────────────────────────────────────────────────
function appointmentScene(): Scene {
  const segs: Seg[] = [
    { clip: "services", from: mt("services", "topic") - 1.0, to: mt("services", "topic") + 2.2 },
    { clip: "services", from: mt("services", "slot") - 1.3, to: mt("services", "slot") + 2.3 },
    { clip: "services", from: mt("services", "book") - 1.3, to: mt("services", "book") + 2.1 },
    { clip: "services", from: mt("services", "ticket") - 0.2, to: mt("services", "ticket") + 3.0 },
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
      focus(fTopic, mb("services", "topic"), { max: 1.5, until: frameOf(segs, "services", "topic", 1.9), label: "Тема обращения" }),
      focus(fSlot + 2, mb("services", "slot"), { max: 1.5, until: frameOf(segs, "services", "slot", 2.1), label: "Свободное время" }),
      focus(fBook + 2, mb("services", "book"), { max: 1.6, fill: 0.5, until: frameOf(segs, "services", "book", 1.9), label: "Одно нажатие" }),
      home(fTicket - 8, 8),
      focus(fTicket + 4, mb("services", "ticket"), { max: 1.45, label: "Талон с QR вместо очереди" }),
    ],
  });
}

function sickScene(): Scene {
  const hasLetter = hasMark("services", "letter");
  const ask = mt("services", "letter-ask", mt("services", "affects") + 3);
  const letter = mt("services", "letter", ask + 2);
  const segs: Seg[] = [
    { clip: "services", from: mt("services", "report") - 2.2, to: mt("services", "report") + 2.2 },
    { clip: "services", from: mt("services", "on-leave") - 0.3, to: mt("services", "on-leave") + 3.4 },
    { clip: "services", from: mt("services", "affects") - 0.3, to: mt("services", "affects") + 1.8 },
    ...(hasLetter
      ? [
          { clip: "services" as const, from: mt("services", "letter-btn") - 0.8, to: ask + 0.5 },
          { clip: "services" as const, from: ask + 0.5, to: letter - 0.1, rate: Math.max(1, (letter - ask - 0.6) / 1.8), cont: true },
          { clip: "services" as const, from: letter - 0.1, to: letter + 3.6, cont: true },
        ]
      : []),
  ];
  const fReport = frameOf(segs, "services", "report", -1.7);
  const fOnLeave = segStart(segs, 1);
  const fAffects = segStart(segs, 2);
  const fLetterBtn = hasLetter ? segStart(segs, 3) : fAffects + 60;
  const fLetter = hasLetter ? segStart(segs, 5) : fAffects + 90;
  return demoScene({
    id: "sick",
    segs,
    chapter: "04 · Больничный",
    title: "Заболели? Одно нажатие",
    cam: [
      focus(fReport, mb("services", "report"), { max: 1.6, fill: 0.5, until: frameOf(segs, "services", "report", 1.9), label: "Офис узнает сразу" }),
      home(fOnLeave - 8, 8),
      focus(fOnLeave + 4, mb("services", "on-leave"), { max: 1.45, label: "Учебный офис уже в курсе" }),
      home(fAffects - 8, 8),
      focus(fAffects + 4, mb("services", "affects"), { max: 1.35, label: "Затронутые пары и дедлайны" }),
      ...(hasLetter
        ? [
            home(fLetterBtn - 6, 6),
            focus(fLetterBtn + 2, mb("services", "letter-btn"), { max: 1.6, fill: 0.5, until: frameOf(segs, "services", "letter-btn", 1.9), label: "Атташе напишет письмо" }),
            home(fLetter - 6, 6),
            focus(fLetter + 2, mb("services", "letter"), { max: 1.45, label: "Письмо о переносе готово" }),
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
          padding: "16px 24px",
          borderRadius: 16,
          background: C.brand,
          color: "#fff",
          fontFamily: SANS,
          fontSize: 30,
          fontWeight: 600,
          boxShadow: "0 18px 50px rgba(47,84,235,0.45)",
          transform: `translateX(${(1 - p) * (side === "left" ? -16 : 16)}px)`,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <div style={{ width: 44 * p, height: 2, background: C.brand }} />
    </div>
  );
};

function phoneScene(): Scene {
  const segsRu: Seg[] = [{ clip: "phone", from: mt("phone", "today") - 0.3, to: mt("phone", "offline-loaded") + 2.0, rate: 1.8 }];
  const ruSecs = segsFrames(segsRu) / FPS + 1;
  const enFrom = mt("phone-en", "today") - 0.3;
  const enTo = mt("phone-en", "schedule") + 3.0;
  const segsEn: Seg[] = [{ clip: "phone-en", from: enFrom, to: enTo, rate: Math.min(1.4, (enTo - enFrom) / ruSecs) }];
  const frames = segsFrames(segsRu) + 16;
  const fSchedule = frameOf(segsRu, "phone", "schedule", -0.3) + 4;
  const fOffline = frameOf(segsRu, "phone", "offline", 0.2) + 4;
  const Component: React.FC = () => {
    const f = useCurrentFrame();
    const exit = interpolate(f, [frames - 18, frames - 6], [1, 0], clamp);
    return (
      <AbsoluteFill>
        <Background glowX={55} glowY={50} />
        <div style={{ opacity: exit }}>
          <ChapterTag chapter="05 · Телефон" title="Всё в кармане" left={160} />
          <PhoneNote from={24} to={fSchedule - 4} text="Ставится как приложение" anchorX={672} y={430} side="left" />
          <PhoneNote from={fSchedule} to={fOffline - 4} text="Расписание за секунду" anchorX={672} y={430} side="left" />
          <PhoneNote from={fOffline} to={frames} text="Без сети откроется сохранённое" anchorX={672} y={300} side="left" />
          <PhoneNote from={40} to={frames} text="English-интерфейс" anchorX={1500} y={660} side="right" />
        </div>
        <PhoneFrame x={1110} y={150} w={360} delay={14} light tilt={4}>
          <Footage segs={segsEn} offset={14} />
        </PhoneFrame>
        <PhoneFrame x={690} y={86} w={380} delay={4} tilt={-2}>
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
      <InkBackdrop dim={0.86} />
      <div style={{ position: "absolute", left: 160, top: 90 }}>
        <Eyebrow delay={TEXT_IN}>Что получилось</Eyebrow>
      </div>
      {STATS.map((st, i) => {
        const at = 16 + i * STAT_LEN;
        if (f < at - 2 || f > at + STAT_LEN + 8) return null;
        const p = spring({ frame: f - at, fps, config: { damping: 200 }, durationInFrames: 20 });
        const o = interpolate(f, [at + STAT_LEN - 6, at + STAT_LEN + 4], [1, 0], clamp);
        const up = interpolate(f, [at + STAT_LEN - 6, at + STAT_LEN + 4], [0, -40], clamp);
        const glow = interpolate(f, [at, at + 16, at + STAT_LEN], [0, 0.35, 0.12], clamp);
        return (
          <AbsoluteFill key={i} style={{ alignItems: "center", justifyContent: "center", opacity: p * o }}>
            <AbsoluteFill style={{ background: `radial-gradient(700px 420px at 50% 48%, rgba(47,84,235,${glow}), rgba(10,10,10,0) 70%)` }} />
            <div style={{ transform: `translateY(${up}px) scale(${1.18 - p * 0.18})`, filter: `blur(${(1 - p) * 14}px)`, textAlign: "center" }}>
              <div style={{ fontFamily: SANS, fontSize: 230, fontWeight: 650, color: C.ink, letterSpacing: "-0.055em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {st.count ? <CountUp value={st.count[0]} delay={at} duration={26} format={st.count[1]} /> : st.big}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 48, color: C.ink2, marginTop: 28, letterSpacing: "-0.02em" }}>{st.label}</div>
            </div>
          </AbsoluteFill>
        );
      })}
      <div style={{ position: "absolute", left: 160, right: 160, top: 400, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
        {STATS.map((st, i) => (
          <Rise key={i} delay={rowAt + i * 5}>
            <div style={{ borderTop: `2px solid ${i === 0 ? C.brand : "#2a2a2a"}`, paddingTop: 28 }}>
              <div style={{ fontFamily: SANS, fontSize: 92, fontWeight: 650, color: C.ink, letterSpacing: "-0.05em", lineHeight: 1 }}>{st.big}</div>
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
const SHOTS = [
  "today-desktop", "staff-queue", "assistant-desktop", "documents-desktop", "schedule-desktop",
  "staff-analytics", "request-status-desktop", "sick-leave-desktop", "notifications-desktop", "staff-request",
  "appointments-desktop", "today-light", "verify-desktop", "staff-student-card", "grades-desktop",
  "today-en", "certificate-desktop", "staff-retakes", "payments-desktop", "staff-schedule",
];
const WALL_LEN = sec(7);
const Wall: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cols = 5;
  const w = 520;
  const h = 325;
  const gap = 26;
  const scroll = interpolate(f, [0, WALL_LEN], [80, -320], clamp);
  const appear = spring({ frame: f, fps, config: { damping: 200 }, durationInFrames: 40 });
  const lines = ["11 разделов для студента", "8 для учебного офиса", "Светлая и тёмная тема, RU и EN"];
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
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
                src={staticFile(`shots/${s}.jpg`)}
                style={{ width: w, height: h, objectFit: "cover", borderRadius: 14, border: "1px solid #262626", opacity: p, transform: `translateY(${(1 - p) * 60}px)`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }}
              />
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(900px 520px at 50% 50%, rgba(10,10,10,0.88), rgba(10,10,10,0.35) 70%, rgba(10,10,10,0.15))" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          {lines.map((l, i) => (
            <Rise key={l} delay={18 + i * 26}>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: i === 2 ? 44 : 92,
                  fontWeight: i === 2 ? 500 : 650,
                  color: i === 2 ? C.ink2 : C.ink,
                  letterSpacing: "-0.045em",
                  lineHeight: 1.1,
                  marginTop: i === 2 ? 30 : 0,
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
const BUILT_LEN = sec(7.4);
const Built: React.FC = () => {
  const f = useCurrentFrame();
  const agents = Array.from({ length: 34 }, (_, i) => i);
  const kind = (i: number) => (i < 2 ? "research" : i < 12 ? "dev" : "qa");
  const facts: [React.ReactNode, string][] = [
    [<CountUp key="a" value={34} delay={50} />, "ИИ-агента в работе"],
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
    [<CountUp key="d" value={79} delay={68} />, "e2e-тестов пройдено"],
  ];
  return (
    <AbsoluteFill>
      <Background glowX={30} glowY={45} glow={0.08} />
      <div style={{ position: "absolute", left: 160, top: 170, width: 1600 }}>
        <Eyebrow delay={TEXT_IN}>Как сделано</Eyebrow>
        <Headline size={84} delay={TEXT_IN + 4}>
          Собрано командой ИИ-агентов
        </Headline>
        <Rise delay={TEXT_IN + 12}>
          <div style={{ fontFamily: SANS, fontSize: 34, color: C.ink2, marginTop: 26 }}>Claude Code писал код, человек ставил задачи и принимал решения</div>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 160, top: 400, display: "flex", gap: 12 }}>
        {["Claude Code", "Субагенты и Workflow", "Playwright", "DeepSeek V3.2"].map((t, i) => (
          <Chip key={t} delay={TEXT_IN + 16 + i * 4}>
            {t}
          </Chip>
        ))}
      </div>
      <div style={{ position: "absolute", left: 160, top: 520, display: "grid", gridTemplateColumns: "repeat(17, 52px)", gap: 14 }}>
        {agents.map((i) => {
          const on = interpolate(f, [24 + i * 1.5, 32 + i * 1.5], [0, 1], clamp);
          const k = kind(i);
          const color = k === "research" ? "#e8e8e8" : k === "dev" ? C.brand : "#5d76e8";
          return (
            <div
              key={i}
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                border: `1px solid ${on > 0.5 ? color : "#2a2a2a"}`,
                background: `rgba(${k === "research" ? "232,232,232" : "47,84,235"},${on * (k === "qa" ? 0.35 : 0.85)})`,
                transform: `scale(${0.7 + on * 0.3})`,
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 160, top: 660, display: "flex", gap: 34, fontFamily: SANS, fontSize: 26, color: C.ink3 }}>
        <Rise delay={44}>
          <span>
            <span style={{ color: C.ink }}>2</span> исследователя
          </span>
        </Rise>
        <Rise delay={48}>
          <span>
            <span style={{ color: C.ink }}>10</span> разработчиков разделов
          </span>
        </Rise>
        <Rise delay={52}>
          <span>
            <span style={{ color: C.ink }}>22</span> агента проверки качества
          </span>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 160, top: 770, width: 1600, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28 }}>
        {facts.map(([n, l], i) => (
          <Rise key={i} delay={48 + i * 6}>
            <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 26 }}>
              <div style={{ fontFamily: SANS, fontSize: 80, fontWeight: 600, color: C.ink, letterSpacing: "-0.045em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{n}</div>
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
  const glow = interpolate(f, [6, 30, 90], [0, 0.5, 0.22], clamp);
  const q = spring({ frame: f - 50, fps, config: { damping: 200 }, durationInFrames: 30 });
  return (
    <AbsoluteFill>
      <InkBackdrop dim={0.72} />
      <AbsoluteFill style={{ background: `radial-gradient(600px 420px at 50% 34%, rgba(47,84,235,${glow}), rgba(10,10,10,0) 70%)` }} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ marginTop: 150, transform: `scale(${0.6 + logo * 0.4})`, opacity: Math.min(1, logo * 1.3) }}>
          <LogoMark size={150} />
        </div>
        <Rise delay={20}>
          <div style={{ marginTop: 44, fontFamily: SANS, fontSize: 64, letterSpacing: "-0.03em", color: C.ink, textAlign: "center" }}>
            <span style={{ fontWeight: 650 }}>MGIMO</span>
            <span style={{ fontWeight: 400, color: C.ink2, marginLeft: 12 }}>Hub</span>
          </div>
        </Rise>
        <Rise delay={30}>
          <div style={{ marginTop: 18, fontFamily: SANS, fontSize: 40, color: C.ink2, textAlign: "center", letterSpacing: "-0.02em" }}>Вся учёба в одном окне</div>
        </Rise>
        <div style={{ marginTop: 70, display: "flex", alignItems: "center", gap: 48, opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
          <div style={{ width: 230, height: 230, padding: 20, borderRadius: 22, background: "#fff", boxShadow: "0 30px 90px rgba(0,0,0,0.6)" }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${QR.n} ${QR.n}`} shapeRendering="crispEdges">
              <path d={QR.d} fill="#0a0a0a" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 40, color: C.ink, fontWeight: 620, letterSpacing: "-0.02em" }}>Попробуйте сами</div>
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
    beforeAfter(
      "ba-day",
      "01 · День",
      "Где пара и что изменилось",
      "Расписание в чате группы, о переносе узнаёшь последним",
      "Главный экран показывает пару, аудиторию и все изменения",
      "И push на телефон, как только деканат что-то поменял",
    ),
    loginScene(),
    todayScene(),
    beforeAfter(
      "ba-cert",
      "02 · Справка",
      "Справки и заявления",
      "Очередь в деканат и непонятно, когда будет готово",
      "Заявка за минуту, статус на каждом шаге, справка с QR",
      "Атташе сам заполнит заявку, деканат обработает её в своей очереди",
    ),
    attacheScene(),
    staffScene(),
    resultScene(),
    beforeAfter(
      "ba-appointment",
      "03 · Приём",
      "Учебный офис",
      "Живая очередь у кабинета и «приходите завтра»",
      "Запись на удобное время и талон в телефоне",
      "Тема, день, свободное время и напоминание в календаре",
    ),
    appointmentScene(),
    beforeAfter(
      "ba-sick",
      "04 · Больничный",
      "Если заболели",
      "Пишешь каждому преподавателю и несёшь справку в деканат",
      "Одно нажатие: офис в курсе, письмо о переносе пишет Атташе",
      "Сразу видно, какие пары и контрольные затронуты",
    ),
    sickScene(),
    beforeAfter(
      "ba-phone",
      "05 · Телефон",
      "В метро и за границей",
      "Нет сети, расписание не открыть, интерфейс только по-русски",
      "Приложение на экране телефона, работает без сети",
      "Русский и английский интерфейс для иностранных студентов",
    ),
    phoneScene(),
    { id: "numbers", frames: NUMBERS_LEN, Component: Numbers },
    { id: "wall", frames: WALL_LEN, Component: Wall },
    { id: "built", frames: BUILT_LEN, Component: Built },
    { id: "final", frames: FINAL_LEN, Component: Final },
  ];
}
