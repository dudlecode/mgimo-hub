"use client";
// Общие части диаграмм: измерение ширины, анимация значений, подсказка, таблица для скринридеров.
// Диаграммы рисуются в пикселях контейнера (viewBox = реальная ширина), поэтому подписи
// остаются читаемыми на 360 px и не растягиваются на широком экране.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Ширина контейнера; 0 до первого измерения. */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Числа плавно «доезжают» до новых значений: при первом показе от нуля, при смене периода
 * от прежних. При prefers-reduced-motion сразу конечные значения.
 */
export function useAnimatedNumbers(target: number[], active: boolean, durationMs = 700): number[] {
  const reduce = useReducedMotion();
  const sig = target.map((v) => (Number.isFinite(v) ? v : 0)).join(",");
  const [shown, setShown] = useState<number[]>(() => target.map(() => 0));
  const last = useRef<number[]>(shown);
  useEffect(() => {
    if (!active) return;
    const to = sig ? sig.split(",").map(Number) : [];
    const from = last.current;
    const apply = (vals: number[]) => {
      last.current = vals;
      setShown(vals);
    };
    let raf = 0;
    if (reduce) {
      raf = requestAnimationFrame(() => apply(to));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const e = 1 - Math.pow(1 - p, 3);
      apply(to.map((v, i) => (from[i] ?? 0) + (v - (from[i] ?? 0)) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sig, active, reduce, durationMs]);
  return shown;
}

/** Прогресс появления 0..1 (один раз после первого измерения). */
export function useAppear(active: boolean, durationMs = 700): number {
  const [t] = useAnimatedNumbers([1], active, durationMs);
  return t ?? 0;
}

/** Всплывающая подсказка у курсора, не выходит за края контейнера. */
export function ChartTooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const w = Math.min(240, Math.max(160, width - 16));
  const left = Math.max(4, Math.min(width - w - 4, x - w / 2));
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-[8px] border border-line bg-surface px-3 py-2 text-[12px] leading-snug text-ink shadow-pop"
      style={{ left, top: y, width: w, transform: "translateY(calc(-100% - 10px))" }}
      aria-hidden
    >
      {children}
    </div>
  );
}

/** Образец линии серии для легенды и подсказок. */
export function SeriesSwatch({ color, dash, fill }: { color: string; dash?: string; fill?: boolean }) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" className="shrink-0" aria-hidden>
      {fill && <rect x="0" y="1" width="18" height="8" rx="2" fill={color} fillOpacity={0.14} />}
      <line x1="1" y1="5" x2="17" y2="5" stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
}

/** Скрытая таблица с теми же данными, для скринридеров. Обёртка-div: у table sr-only не ограничивает ширину. */
export function SrTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={j}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Пустое место под диаграмму до первого измерения, чтобы страница не прыгала. */
export function ChartFrame({ className, height, children, frameRef }: { className?: string; height?: number; children: ReactNode; frameRef: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={frameRef} className={cn("relative w-full", className)} style={height ? { minHeight: height } : undefined}>
      {children}
    </div>
  );
}

/** Целое с пробелами-разделителями тысяч, как в русской типографике. */
export function formatInt(n: number) {
  return Math.round(n).toLocaleString("ru-RU");
}
