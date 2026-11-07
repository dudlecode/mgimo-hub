"use client";
// Линии и площади по точкам (недели). Основная серия: линия и плоская заливка цвета бренда,
// сравнение: серая пунктирная линия. Кривая монотонная, без «выбросов» между точками.
import { useState } from "react";
import { ChartFrame, ChartTooltip, SeriesSwatch, SrTable, useAnimatedNumbers, useMeasure } from "./shared";

export type AreaPoint = { label: string; title: string; values: number[]; inPeriod?: boolean };
export type AreaSeries = { key: string; label: string; tone: "brand" | "muted"; area?: boolean };

const PAD = { top: 14, right: 10, bottom: 26, left: 30 };

/** Монотонная кубическая кривая (Fritsch-Carlson), как curveMonotoneX */
function monotone(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  t.push(m[n - 2]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const k = raw / p;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 5 ? 5 : 10) * p;
}

export function AreaChart({
  points,
  series,
  ariaLabel,
  caption,
  height = 220,
  periodLabel = "период",
}: {
  points: AreaPoint[];
  series: AreaSeries[];
  ariaLabel: string;
  caption: string;
  height?: number;
  periodLabel?: string;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const flat = series.flatMap((_, si) => points.map((p) => p.values[si] ?? 0));
  const anim = useAnimatedNumbers(flat, width > 0, 800);

  const max = Math.max(1, ...flat);
  const step = niceStep(max / 3);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const base = y(0);

  const every = Math.max(1, Math.ceil((n * 62) / innerW));
  const firstIn = points.findIndex((p) => p.inPeriod);
  const showBand = firstIn > 0;
  const bandX = showBand ? (x(firstIn - 1) + x(firstIn)) / 2 : 0;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = Math.round(((px - PAD.left) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <figure className="m-0">
      <ChartFrame frameRef={ref} height={height}>
        {width > 0 && n > 0 && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
            className="block max-w-full touch-pan-y select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {showBand && (
              <g>
                <rect x={bandX} y={PAD.top - 6} width={width - PAD.right - bandX} height={innerH + 6} fill="var(--surface-2)" opacity={0.7} />
                <text x={bandX + 6} y={PAD.top + 6} fontSize={10} fill="var(--ink-3)">
                  {periodLabel}
                </text>
              </g>
            )}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line-strong)" : "var(--line)"} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t) + 3.5} fontSize={10.5} textAnchor="end" fill="var(--ink-3)" className="tabular">
                  {t}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              (n - 1 - i) % every === 0 ? (
                <text key={i} x={x(i)} y={height - 8} fontSize={10.5} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"} fill={hover === i ? "var(--ink)" : "var(--ink-3)"}>
                  {p.label}
                </text>
              ) : null,
            )}

            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top - 4} y2={base} stroke="var(--line-strong)" strokeWidth={1} />}

            {series.map((s, si) => {
              const vals = anim.slice(si * n, si * n + n);
              const pts = vals.map((v, i) => [x(i), y(v)] as [number, number]);
              const line = monotone(pts);
              const brand = s.tone === "brand";
              return (
                <g key={s.key}>
                  {s.area && pts.length > 1 && <path d={`${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`} fill={brand ? "var(--brand)" : "var(--ink-3)"} fillOpacity={brand ? 0.1 : 0.06} />}
                  <path d={line} fill="none" stroke={brand ? "var(--brand)" : "var(--ink-3)"} strokeWidth={brand ? 2 : 1.5} strokeDasharray={brand ? undefined : "4 4"} strokeLinecap="round" strokeLinejoin="round" />
                  {hover !== null && pts[hover] && (
                    <circle cx={pts[hover][0]} cy={pts[hover][1]} r={brand ? 4 : 3} fill={brand ? "var(--brand)" : "var(--surface)"} stroke={brand ? "var(--surface)" : "var(--ink-3)"} strokeWidth={1.5} />
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && points[hover] && (
          <ChartTooltip x={x(hover)} y={Math.min(...series.map((_, si) => y(points[hover].values[si] ?? 0)))} width={width}>
            <div className="mb-1 font-semibold">{points[hover].title}</div>
            <ul className="space-y-0.5">
              {series.map((s, si) => (
                <li key={s.key} className="flex items-center gap-2">
                  <SeriesSwatch color={s.tone === "brand" ? "var(--brand)" : "var(--ink-3)"} dash={s.tone === "brand" ? undefined : "4 4"} />
                  <span className="flex-1 text-ink-2">{s.label}</span>
                  <span className="font-semibold tabular">{points[hover].values[si] ?? 0}</span>
                </li>
              ))}
            </ul>
          </ChartTooltip>
        )}
      </ChartFrame>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <SeriesSwatch color={s.tone === "brand" ? "var(--brand)" : "var(--ink-3)"} dash={s.tone === "brand" ? undefined : "4 4"} fill={s.area && s.tone === "brand"} />
            {s.label}
          </span>
        ))}
      </figcaption>
      <SrTable caption={caption} columns={["Неделя", ...series.map((s) => s.label)]} rows={points.map((p) => [p.title, ...series.map((_, si) => p.values[si] ?? 0)])} />
    </figure>
  );
}
