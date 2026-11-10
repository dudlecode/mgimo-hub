// Метки живых записей кабинета (video/record/record.mjs): время в секундах от начала клипа
// и рамки элементов в долях экрана. Из них считаются длины сцен, наезды камеры и смена титров.
import { Easing } from "remotion";
import intro from "../public/footage/intro.json";
import student from "../public/footage/student.json";
import staff from "../public/footage/staff.json";
import result from "../public/footage/result.json";
import phone from "../public/footage/phone.json";
import phoneEn from "../public/footage/phone-en.json";
import services from "../public/footage/services.json";
import { FPS } from "./theme";

export type ClipName = "intro" | "student" | "staff" | "result" | "phone" | "phone-en" | "services";
export type Box = { x: number; y: number; w: number; h: number };
type Meta = { name: string; width: number; height: number; duration: number; marks: { name: string; t: number; box: Box | null }[] };

const CLIPS = { intro, student, staff, result, phone, "phone-en": phoneEn, services } as unknown as Record<ClipName, Meta>;

export function mt(clip: ClipName, name: string, fallback?: number): number {
  const m = CLIPS[clip].marks.find((x) => x.name === name);
  if (m) return m.t;
  if (fallback !== undefined) return fallback;
  throw new Error(`Нет метки ${clip}:${name}`);
}

export function hasMark(clip: ClipName, name: string) {
  return CLIPS[clip].marks.some((x) => x.name === name);
}

export function mb(clip: ClipName, name: string): Box | null {
  return CLIPS[clip].marks.find((x) => x.name === name)?.box ?? null;
}

export function clipDuration(clip: ClipName) {
  return CLIPS[clip].duration;
}

// ── куски записи внутри сцены ──
/** cont: продолжение того же плана (например, сжатое ожидание), камера не сбрасывается */
export type Seg = { clip: ClipName; from: number; to: number; rate?: number; cont?: boolean };
export type PlacedSeg = Seg & { start: number; d: number };
/** Перекрытие соседних кусков, кадров (мягкая склейка внутри рамки) */
export const XF = 12;

export function placeSegs(segs: Seg[]): PlacedSeg[] {
  let end = 0;
  return segs.map((s, i) => {
    const d = Math.round(((s.to - s.from) / (s.rate ?? 1)) * FPS);
    const start = i === 0 ? 0 : end - XF;
    end = start + d;
    return { ...s, start, d };
  });
}

export function segsFrames(segs: Seg[]) {
  const p = placeSegs(segs);
  const last = p[p.length - 1];
  return last.start + last.d;
}

/** Кадр сцены, на котором в записи стоит метка (с поправкой в секундах). */
export function frameOf(segs: Seg[], clip: ClipName, mark: string, offset = 0): number {
  const t = mt(clip, mark) + offset;
  for (const s of placeSegs(segs)) {
    if (s.clip === clip && t >= s.from - 0.01 && t <= s.to + 0.01) {
      return Math.round(s.start + ((t - s.from) / (s.rate ?? 1)) * FPS);
    }
  }
  throw new Error(`Метка ${clip}:${mark} вне кусков сцены`);
}

/** Начало куска с номером i, кадр сцены */
export function segStart(segs: Seg[], i: number) {
  return placeSegs(segs)[i].start;
}

// ── камера: наезды на элементы ──
/** Ключ камеры. box: рамка блока для синей обводки, until: кадр, после которого обводку убрать (например, переход на другую страницу) */
export type CamKey = { at: number; s: number; x: number; y: number; d?: number; box?: Box | null; until?: number; label?: string; anchor?: Box | null };
export type CamState = { s: number; x: number; y: number };

/** Мягкая кривая для камеры: пик скорости около 1,6 средней */
const ease = Easing.inOut(Easing.sin);

export type CamView = { s: number; tx: number; ty: number };

/**
 * Камера в координатах кадра: масштаб и сдвиг меняются плавно и одновременно.
 * Каждый ключ ведёт камеру из того положения, где она была в момент его начала. Если следующий
 * ключ начался раньше, чем закончился этот, он подхватывает камеру с полпути, без скачка.
 */
export function camAt(frame: number, keys: CamKey[]): CamView {
  let cur: CamView = { s: 1, tx: 0, ty: 0 };
  const sorted = [...keys].sort((a, b) => a.at - b.at);
  for (let i = 0; i < sorted.length; i++) {
    const k = sorted[i];
    if (frame <= k.at) break;
    const next = sorted[i + 1];
    const until = next && next.at < frame ? next.at : frame;
    const p = ease(Math.min(1, (until - k.at) / (k.d ?? 40)));
    const t = camTranslate(k);
    cur = { s: cur.s + (k.s - cur.s) * p, tx: cur.tx + (t.tx - cur.tx) * p, ty: cur.ty + (t.ty - cur.ty) * p };
  }
  return cur;
}

/**
 * Длительность каждого движения камеры от расстояния: скорость не выше MAX_SPEED за кадр
 * (с запасом на пик плавной кривой), чтобы наезды и отъезды не дёргались.
 */
const MAX_SPEED = 0.024;
export function resolveCam(keys: CamKey[]): CamKey[] {
  const out: CamKey[] = [];
  let cur: CamView = { s: 1, tx: 0, ty: 0 };
  for (const k of [...keys].sort((a, b) => a.at - b.at)) {
    const b = camTranslate(k);
    const delta = Math.max(Math.abs(k.s - cur.s), Math.abs(b.tx - cur.tx), Math.abs(b.ty - cur.ty));
    const d = Math.max(k.d ?? 40, Math.ceil((delta * 1.6) / MAX_SPEED));
    out.push({ ...k, d });
    cur = { s: k.s, tx: b.tx, ty: b.ty };
  }
  return out;
}

/**
 * Доля высоты записи, видимая в окне браузера. Окно шире и выше кадра и уходит за его нижний край,
 * поэтому камера считает центром и нижней границей не всю запись, а видимую полосу.
 */
export const VIEW_H = 0.81;

/** Сдвиг контента: точка фокуса тянется к центру видимой полосы, края не открываются. */
export function camTranslate(c: CamState) {
  const tx = Math.min(0, Math.max(1 - c.s, 0.5 - c.x * c.s));
  const ty = Math.min(0, Math.max(VIEW_H - c.s, VIEW_H / 2 - c.y * c.s));
  return { tx, ty };
}

/** Ключ камеры на рамку элемента */
export function focus(at: number, box: Box | null, opts: { max?: number; fill?: number; d?: number; fallback?: CamState; until?: number; ring?: boolean; label?: string } = {}): CamKey {
  if (!box) {
    const f = opts.fallback ?? { s: 1, x: 0.5, y: VIEW_H / 2 };
    return { at, ...f, d: opts.d, label: opts.label, until: opts.until };
  }
  // Блок целиком в кадре с полями: по ширине и по высоте
  const fill = opts.fill ?? 0.86;
  const s = Math.max(1, Math.min(opts.max ?? 1.6, fill / box.w, (fill * VIEW_H) / box.h));
  // Обводка у блока, который виден сверху и с боков. Блок может уходить за нижний край окна:
  // окно само уходит за кадр, и низ рамки скрывается вместе с низом блока.
  const whole = box.y >= 0.01 && box.x >= 0 && box.x + box.w <= 1;
  return { at, s, x: box.x + box.w / 2, y: box.y + box.h / 2, d: opts.d, box: opts.ring === false || !whole ? null : box, until: opts.until, label: opts.label, anchor: box };
}

export const home = (at: number, d?: number): CamKey => ({ at, s: 1, x: 0.5, y: VIEW_H / 2, d });
