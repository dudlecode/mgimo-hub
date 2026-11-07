import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, H, MONO, SANS, W } from "./theme";
import { camAt, camTranslate, placeSegs, resolveCam, XF, type Box, type CamKey, type PlacedSeg, type Seg } from "./footage";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ── фон: почти чёрный, мягкое пятно света и плёночное зерно ──
export const Background: React.FC<{ glowX?: number; glowY?: number; glow?: number }> = ({ glowX = 62, glowY = 50, glow = 0.09 }) => {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{ background: `radial-gradient(1100px 760px at ${glowX}% ${glowY}%, rgba(47,84,235,${glow}), rgba(10,10,10,0) 70%)` }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};

export const Grain: React.FC = () => {
  const f = useCurrentFrame();
  const ox = (f * 137) % 512;
  const oy = (f * 251) % 512;
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile("grain.png")})`,
        backgroundPosition: `${ox}px ${oy}px`,
        opacity: 0.05,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    />
  );
};

// ── появление: подъём, проявление, расфокус уходит; одинаково во всём ролике ──
export const Rise: React.FC<{ delay?: number; out?: number; y?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  delay = 0,
  out,
  y = 26,
  style,
  children,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 }, durationInFrames: 26 });
  const o = out !== undefined ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1;
  const yy = (1 - p) * y - (out !== undefined ? interpolate(f, [out, out + 10], [0, 10], clamp) : 0);
  return (
    <div style={{ ...style, opacity: p * o, transform: `translateY(${yy}px)`, filter: `blur(${(1 - p) * 7}px)` }}>{children}</div>
  );
};

export const Eyebrow: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => (
  <Rise delay={delay}>
    <div style={{ fontFamily: MONO, fontSize: 26, color: C.brandText, letterSpacing: "0.01em", marginBottom: 22 }}>{children}</div>
  </Rise>
);

export const Headline: React.FC<{ children: React.ReactNode; size?: number; delay?: number; out?: number; style?: React.CSSProperties }> = ({
  children,
  size = 74,
  delay = 4,
  out,
  style,
}) => (
  <Rise delay={delay} out={out}>
    <div
      style={{
        fontFamily: SANS,
        fontSize: size,
        lineHeight: 1.04,
        fontWeight: 620,
        letterSpacing: "-0.035em",
        color: C.ink,
        textWrap: "balance",
        ...style,
      }}
    >
      {children}
    </div>
  </Rise>
);

/** Подзаголовок, который сменяется по ходу сцены: [{at, text}] */
export const SwapLines: React.FC<{ lines: { at: number; text: string }[]; size?: number; height?: number; color?: string }> = ({
  lines,
  size = 34,
  height = 110,
  color = C.ink2,
}) => {
  const sorted = [...lines].sort((a, b) => a.at - b.at);
  return (
    <div style={{ position: "relative", height, marginTop: 26 }}>
      {sorted.map((l, i) => (
        <div key={i} style={{ position: "absolute", inset: 0 }}>
          <Rise delay={l.at} out={sorted[i + 1] ? sorted[i + 1].at - 6 : undefined} y={16}>
            <div style={{ fontFamily: SANS, fontSize: size, lineHeight: 1.32, color, letterSpacing: "-0.012em", textWrap: "balance" }}>
              {l.text}
            </div>
          </Rise>
        </div>
      ))}
    </div>
  );
};

/** Колонка текста слева в демо-сценах */
export const TextColumn: React.FC<{ children: React.ReactNode; top?: number; width?: number; left?: number }> = ({ children, top = 300, width = 400, left = 110 }) => (
  <div style={{ position: "absolute", left, top, width }}>{children}</div>
);

// ── знак продукта: строчная «m» из двух арок и точка ──
export const LogoMark: React.FC<{ size?: number; color?: string; bg?: string }> = ({ size = 64, color = C.ink, bg = C.bg }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <rect width="24" height="24" rx="6.5" fill={color} />
    <path
      d="M5.5 17.5V11.25a3.25 3.25 0 0 1 6.5 0V17.5M12 11.25a3.25 3.25 0 0 1 6.5 0V17.5"
      fill="none"
      stroke={bg}
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="18.6" cy="5.6" r="1.55" fill={bg} />
  </svg>
);

export const Wordmark: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
    <LogoMark size={size * 1.15} />
    <div style={{ fontFamily: SANS, fontSize: size, letterSpacing: "-0.03em", color: C.ink, lineHeight: 1 }}>
      <span style={{ fontWeight: 640 }}>MGIMO</span>
      <span style={{ fontWeight: 400, color: C.ink2, marginLeft: size * 0.14 }}>Hub</span>
    </div>
  </div>
);

// ── живая запись: куски клипа со склейкой, камера и подсветка ──
const SegVideo: React.FC<{ seg: PlacedSeg; fade: boolean }> = ({ seg, fade }) => {
  const f = useCurrentFrame();
  const o = fade ? interpolate(f, [0, XF], [0, 1], clamp) : 1;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <OffthreadVideo
        src={staticFile(`footage/${seg.clip}.mp4`)}
        trimBefore={Math.round(seg.from * 30)}
        playbackRate={seg.rate ?? 1}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};

/** Обводка блока: синяя, по скруглению карточки, ровно по её краю */
const RING_OUT = 5; // отступ от края карточки, CSS-пиксели записи
const RING_RADIUS = 12; // скругление карточек кабинета

type CalloutKey = { from: number; to: number; label: string; anchor: Box | null; x: number; y: number };

/** Плашка с пояснением рядом с выделенным блоком: встаёт туда, где есть место, и соединяется с блоком линией */
const Callout: React.FC<{ frame: number; k: CalloutKey; c: { s: number }; tx: number; ty: number; pxW: number }> = ({ frame, k, c, tx, ty, pxW }) => {
  const { fps } = useVideoConfig();
  if (frame < k.from - 2 || frame > k.to + 12) return null;
  const p = spring({ frame: frame - k.from, fps, config: { damping: 200 }, durationInFrames: 18 });
  const out = interpolate(frame, [k.to, k.to + 10], [1, 0], clamp);
  const pxH = pxW * 0.625;
  const a = k.anchor ?? { x: k.x - 0.01, y: k.y - 0.01, w: 0.02, h: 0.02 };
  const rx = a.x * c.s + tx;
  const ry = a.y * c.s + ty;
  const rw = a.w * c.s;
  const rh = a.h * c.s;
  const cw = (52 + k.label.length * 15.6) / pxW;
  const ch = 76 / pxH;
  const gap = 34 / pxW;
  const vx0 = Math.max(rx, 0.02);
  const vx1 = Math.min(rx + rw, 0.98);
  const vy0 = Math.max(ry, 0.03);
  const vy1 = Math.min(ry + rh, 0.97);
  let side: "right" | "left" | "below" | "above";
  if (1 - vx1 >= cw + gap + 0.02) side = "right";
  else if (vx0 >= cw + gap + 0.02) side = "left";
  else if (1 - vy1 >= ch + 0.06) side = "below";
  else side = "above";
  const cy = Math.min(0.9 - ch, Math.max(0.06, (vy0 + vy1) / 2 - ch / 2));
  const pos =
    side === "right"
      ? { left: vx1 + gap, top: cy }
      : side === "left"
        ? { left: vx0 - gap - cw, top: cy }
        : side === "below"
          ? { left: Math.min(0.97 - cw, Math.max(0.03, vx0)), top: vy1 + 0.035 }
          : { left: Math.min(0.97 - cw, Math.max(0.03, vx0)), top: Math.max(0.04, vy0 - ch - 0.035) };
  const shift = (1 - p) * 18 * (side === "right" ? -1 : side === "left" ? 1 : 0);
  const shiftY = (1 - p) * 14 * (side === "below" ? -1 : side === "above" ? 1 : 0);
  const line =
    side === "right"
      ? { left: vx1, top: cy + ch / 2, width: gap, height: 0 }
      : side === "left"
        ? { left: vx0 - gap, top: cy + ch / 2, width: gap, height: 0 }
        : null;
  return (
    <>
      {line ? (
        <div
          style={{
            position: "absolute",
            left: `${line.left * 100}%`,
            top: `${line.top * 100}%`,
            width: `${line.width * 100 * p}%`,
            height: 2,
            background: C.brand,
            opacity: out,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: `${pos.left * 100}%`,
          top: `${pos.top * 100}%`,
          padding: "16px 24px",
          borderRadius: 16,
          background: C.brand,
          color: "#fff",
          fontFamily: SANS,
          fontSize: 28,
          fontWeight: 600,
          lineHeight: 1.22,
          letterSpacing: "-0.015em",
          boxShadow: "0 18px 50px rgba(47,84,235,0.45)",
          opacity: p * out,
          transform: `translate(${shift}px, ${shiftY}px) scale(${0.92 + p * 0.08})`,
          transformOrigin: side === "left" ? "right center" : side === "right" ? "left center" : "center",
          whiteSpace: "nowrap",
        }}
      >
        {k.label}
      </div>
    </>
  );
};

/** Обводка и плашки одного куска записи */
function overlays(keys: CamKey[], segEnd: number) {
  const rings = keys
    .map((k, i) => {
      if (!k.box) return null;
      const from = k.at + (k.d ?? 40) - 4;
      const next = keys[i + 1]?.at ?? segEnd;
      const to = Math.min(next, k.until ?? 1e6, segEnd) - 8;
      return to > from + 10 ? { from, to, box: k.box } : null;
    })
    .filter((r): r is { from: number; to: number; box: Box } => !!r);
  const callouts = keys
    .map((k, i) => {
      if (!k.label) return null;
      const from = k.at + (k.d ?? 40) - 2;
      const next = keys[i + 1]?.at ?? segEnd;
      const to = Math.min(next, k.until ?? 1e6, segEnd) - 6;
      return to > from + 12 ? { from, to, label: k.label, anchor: k.anchor ?? null, x: k.x, y: k.y } : null;
    })
    .filter((x): x is CalloutKey => !!x);
  return { rings, callouts };
}

/**
 * Живая запись. У каждого куска своя камера, как у отдельного плана в монтаже:
 * на склейке старый план растворяется в своём наезде, новый начинается с общего плана.
 * Быстрые сбросы камеры (ключи s=1 короче 16 кадров) отбрасываются, чтобы ничего не дёргалось.
 */
export const Footage: React.FC<{ segs: Seg[]; cam?: CamKey[]; offset?: number; unit?: number; pxW?: number }> = ({ segs, cam = [], offset = 0, unit = 1, pxW = 1280 }) => {
  const frame = useCurrentFrame() - offset;
  const placed = placeSegs(segs);
  const keys = [...cam].filter((k) => !(k.s === 1 && (k.d ?? 40) < 16)).sort((a, b) => a.at - b.at);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#0b0b0b" }}>
      {placed.map((seg, i) => {
        // начало плана: первый кусок цепочки cont
        let first = i;
        while (first > 0 && placed[first].cont) first--;
        let last = i;
        while (last < placed.length - 1 && placed[last + 1].cont) last++;
        const start = first === 0 ? -1e6 : placed[first].start;
        const end = last === placed.length - 1 ? 1e6 : placed[last + 1].start;
        const segKeys = resolveCam(keys.filter((k) => k.at >= start && k.at < end));
        const active = frame >= seg.start - 1 && frame < seg.start + seg.d;
        const c = camAt(frame, segKeys);
        const { tx, ty } = c;
        const fade = i > 0 ? interpolate(frame, [seg.start, seg.start + XF], [0, 1], clamp) : 1;
        const { rings, callouts } = overlays(segKeys, last === placed.length - 1 ? placed[last].start + placed[last].d : placed[last + 1].start);
        return (
          <AbsoluteFill key={i} style={{ opacity: active ? fade : 0 }}>
            <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${tx * 100}%, ${ty * 100}%) scale(${c.s})` }}>
              <Sequence from={seg.start + offset} durationInFrames={seg.d} layout="none">
                <SegVideo seg={seg} fade={false} />
              </Sequence>
            </AbsoluteFill>
            {active
              ? callouts.map((k, j) => <Callout key={`c${j}`} frame={frame} k={k} c={c} tx={tx} ty={ty} pxW={pxW} />)
              : null}
            {active
              ? rings.map((r, j) => {
                  if (frame < r.from || frame > r.to + 10) return null;
                  const o = interpolate(frame, [r.from, r.from + 12, r.to, r.to + 8], [0, 1, 1, 0], clamp);
                  const ox = RING_OUT / 1280;
                  const oy = RING_OUT / 800;
                  const x = (r.box.x - ox) * c.s + tx;
                  const y = (r.box.y - oy) * c.s + ty;
                  const w = (r.box.w + ox * 2) * c.s;
                  const h = (r.box.h + oy * 2) * c.s;
                  return (
                    <div
                      key={j}
                      style={{
                        position: "absolute",
                        left: `${x * 100}%`,
                        top: `${y * 100}%`,
                        width: `${w * 100}%`,
                        height: `${h * 100}%`,
                        border: `3px solid ${C.brand}`,
                        borderRadius: (RING_RADIUS + RING_OUT) * c.s * unit,
                        opacity: o,
                        boxShadow: "0 0 0 5px rgba(47,84,235,0.16), 0 0 40px rgba(47,84,235,0.25)",
                      }}
                    />
                  );
                })
              : null}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

// ── рамки устройств ──
export const BrowserFrame: React.FC<{ x: number; y: number; w: number; children: React.ReactNode; delay?: number }> = ({ x, y, w, children, delay = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 }, durationInFrames: 30 });
  const h = (w * 800) / 1280;
  const drift = Math.sin(f / 70) * 3;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + (1 - p) * 70 + drift,
        width: w,
        opacity: p,
        transform: `perspective(2400px) rotateX(${(1 - p) * 16}deg) scale(${0.93 + p * 0.07})`,
        transformOrigin: "50% 100%",
        borderRadius: 18,
        overflow: "hidden",
        background: "#141414",
        border: `1px solid ${C.line}`,
        boxShadow: "0 50px 140px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 18px", gap: 9, borderBottom: "1px solid #1f1f1f", position: "relative" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 13, height: 13, borderRadius: 99, background: "#2c2c2c" }} />
        ))}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            height: 28,
            padding: "0 18px",
            borderRadius: 8,
            background: "#1c1c1c",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: SANS,
            fontSize: 16,
            color: "#9a9a9a",
          }}
        >
          <LogoMark size={16} color="#cfcfcf" bg="#1c1c1c" />
          MGIMO Hub
        </div>
      </div>
      <div style={{ position: "relative", width: w, height: h, overflow: "hidden" }}>{children}</div>
    </div>
  );
};

export const PhoneFrame: React.FC<{ x: number; y: number; w: number; children: React.ReactNode; delay?: number; light?: boolean; tilt?: number }> = ({
  x,
  y,
  w,
  children,
  delay = 0,
  light,
  tilt = 0,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 }, durationInFrames: 32 });
  const screenH = (w * 844) / 390;
  const bezel = 12;
  const status = 40;
  const drift = Math.sin((f + delay * 3) / 60) * 4;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + (1 - p) * 80 + drift,
        width: w + bezel * 2,
        padding: bezel,
        borderRadius: 64,
        background: "#1a1a1a",
        border: "1px solid #2e2e2e",
        boxShadow: "0 60px 140px rgba(0,0,0,0.65)",
        opacity: p,
        transform: `rotate(${tilt}deg)`,
      }}
    >
      <div style={{ borderRadius: 52, overflow: "hidden", background: light ? "#ffffff" : "#0a0a0a" }}>
        <div style={{ height: status, position: "relative", display: "flex", alignItems: "center", padding: "0 34px", fontFamily: SANS, fontSize: 17, fontWeight: 600, color: light ? "#111" : "#eee" }}>
          18:02
          <div style={{ position: "absolute", left: "50%", top: 9, transform: "translateX(-50%)", width: 112, height: 30, borderRadius: 20, background: "#000" }} />
        </div>
        <div style={{ position: "relative", width: w, height: screenH, overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
};

// ── мелочи ──
export const Chip: React.FC<{ children: React.ReactNode; delay?: number; accent?: boolean }> = ({ children, delay = 0, accent }) => (
  <Rise delay={delay} y={14}>
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 24px",
        borderRadius: 14,
        border: `1px solid ${accent ? "rgba(47,84,235,0.55)" : C.line}`,
        background: accent ? "rgba(47,84,235,0.12)" : "rgba(20,20,20,0.8)",
        fontFamily: SANS,
        fontSize: 30,
        color: C.ink,
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </div>
  </Rise>
);

/** Число, которое набегает от 0 до value */
export const CountUp: React.FC<{ value: number; delay?: number; duration?: number; format?: (n: number) => string }> = ({
  value,
  delay = 0,
  duration = 40,
  format = (n) => String(Math.round(n)),
}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [delay, delay + duration], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  return <>{format(value * p)}</>;
};

export const SceneFade: React.FC<{ children: React.ReactNode }> = ({ children }) => <AbsoluteFill>{children}</AbsoluteFill>;

export const FRAME = { x: 250, w: 1420, y: 120 };
export const CANVAS = { W, H };
