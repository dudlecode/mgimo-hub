"use client";
// «Паучья» диаграмма: 5-6 осей 0..100, несколько серий, сетка-многоугольники.
// Основная серия в цвете бренда с лёгкой заливкой, сравнения серые, различаются штрихом.
import { useMemo, useState } from "react";
import { ChartFrame, ChartTooltip, SeriesSwatch, SrTable, useAnimatedNumbers, useMeasure } from "./shared";
import { cn } from "@/lib/utils";

export type RadarAxis = { key: string; label: string; /** разбивка подписи на строки для диаграммы */ lines?: string[] };
export type RadarSeries = { key: string; label: string; values: (number | null)[]; notes?: string[] };

const DASHES = ["5 4", "2 3", "9 3 2 3", "1 3"];
const RINGS = [0.2, 0.4, 0.6, 0.8, 1];
const FONT = 11.5;
const LINE_H = 14;
/** средняя ширина символа Geist в долях кегля */
const CHAR_EM = 0.58;

/** Подпись оси в одну-две строки по словам */
function wrapLabel(label: string, maxChars = 12): string[] {
  const words = label.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 2 ? [lines[0], lines.slice(1).join(" ")] : lines;
}

const fmt = (v: number | null) => (v === null ? "нет данных" : String(Math.round(v)));

export function RadarChart({
  axes,
  series,
  ariaLabel,
  caption,
  selectable = false,
  maxRadius = 132,
}: {
  axes: RadarAxis[];
  series: RadarSeries[];
  ariaLabel: string;
  caption: string;
  /** серии равноправны: щелчок по легенде выделяет серию */
  selectable?: boolean;
  maxRadius?: number;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [primary, setPrimary] = useState(0);
  const [pointer, setPointer] = useState<{ i: number; x: number; y: number } | null>(null);
  const hover = pointer?.i ?? null;
  const n = axes.length;
  const main = Math.min(primary, series.length - 1);

  const flat = series.flatMap((s) => s.values.map((v) => (v === null ? 0 : Math.max(0, Math.min(100, v)))));
  const anim = useAnimatedNumbers(flat, width > 0, 800);

  const geo = useMemo(() => {
    const angles = axes.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);
    const labels = axes.map((a) => (a.lines?.length ? a.lines.slice(0, 2) : wrapLabel(a.label)));
    const gap = 9;
    // радиус ограничен боковыми подписями: ширина самой длинной строки каждой оси
    const textW = (lines: string[]) => Math.max(...lines.map((l) => l.length)) * FONT * CHAR_EM + 4;
    let r = maxRadius;
    angles.forEach((a, i) => {
      const c = Math.abs(Math.cos(a));
      if (c > 0.3) r = Math.min(r, (width / 2 - gap - textW(labels[i])) / c);
    });
    r = Math.max(48, r);
    // вертикальные границы блоков подписей относительно центра
    let minY = -r;
    let maxY = r;
    angles.forEach((a, i) => {
      const lines = labels[i].length + 1; // название + значение
      const y = (r + gap) * Math.sin(a);
      const block = lines * LINE_H;
      const s = Math.sin(a);
      const top = s < -0.3 ? y - block : s > 0.3 ? y : y - block / 2;
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, top + block);
    });
    const pad = 6;
    const height = Math.ceil(maxY - minY + pad * 2);
    return { angles, labels, r, gap, cx: width / 2, cy: -minY + pad, height };
  }, [axes, n, width, maxRadius]);

  const { angles, labels, r, gap, cx, cy, height } = geo;
  const pt = (i: number, v: number) => [cx + r * (v / 100) * Math.cos(angles[i]), cy + r * (v / 100) * Math.sin(angles[i])] as const;
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  const seriesVals = (si: number) => anim.slice(si * n, si * n + n);

  const order = series.map((_, i) => i).filter((i) => i !== main);
  order.push(main);
  // штрих закреплён за серией: при выделении другой серии остальные не меняют вид
  const dashOf = (si: number) => (si === main ? undefined : DASHES[si % DASHES.length]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    const x = px - cx;
    const y = py - cy;
    if (Math.hypot(x, y) < 6) return;
    const ang = Math.atan2(y, x);
    let best = 0;
    let bestD = Infinity;
    angles.forEach((a, i) => {
      const d = Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a)));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setPointer({ i: best, x: px, y: py });
  }

  return (
    <figure className="m-0">
      <ChartFrame frameRef={ref} height={height || 240}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
            className="block max-w-full touch-pan-y select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setPointer(null)}
          >
            {/* сетка */}
            {RINGS.map((k) => (
              <polygon
                key={k}
                points={angles.map((a) => `${cx + r * k * Math.cos(a)},${cy + r * k * Math.sin(a)}`).join(" ")}
                fill="none"
                stroke={k === 1 ? "var(--line-strong)" : "var(--line)"}
                strokeWidth={1}
              />
            ))}
            {angles.map((a, i) => (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={cx + r * Math.cos(a)}
                y2={cy + r * Math.sin(a)}
                stroke={hover === i ? "var(--ink-3)" : "var(--line)"}
                strokeWidth={1}
              />
            ))}
            {(r >= 80 ? [0.5, 1] : [1]).map((k) => (
              <text key={k} x={cx + 4} y={cy - r * k + 11} fontSize={10} fill="var(--ink-3)" className="tabular">
                {k * 100}
              </text>
            ))}

            {/* серии */}
            {order.map((si) => {
              const vals = seriesVals(si);
              const isMain = si === main;
              return (
                <g key={series[si].key}>
                  <polygon
                    points={poly(vals)}
                    fill={isMain ? "var(--brand)" : "none"}
                    fillOpacity={isMain ? 0.12 : 0}
                    stroke={isMain ? "var(--brand)" : "var(--ink-3)"}
                    strokeWidth={isMain ? 2 : 1.5}
                    strokeDasharray={dashOf(si)}
                    strokeLinejoin="round"
                  />
                  {isMain &&
                    vals.map((v, i) => {
                      const [x, y] = pt(i, v);
                      return <circle key={i} cx={x} cy={y} r={hover === i ? 4 : 3} fill="var(--brand)" stroke="var(--surface)" strokeWidth={1.5} />;
                    })}
                  {!isMain &&
                    hover !== null &&
                    (() => {
                      const [x, y] = pt(hover, vals[hover]);
                      return <circle cx={x} cy={y} r={3} fill="var(--surface)" stroke="var(--ink-3)" strokeWidth={1.5} />;
                    })()}
                </g>
              );
            })}

            {/* подписи осей и значение основной серии */}
            {angles.map((a, i) => {
              const c = Math.cos(a);
              const sn = Math.sin(a);
              const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
              const x = cx + (r + gap) * c;
              const y0 = cy + (r + gap) * sn;
              const lines = labels[i];
              const block = (lines.length + 1) * LINE_H;
              const top = sn < -0.3 ? y0 - block : sn > 0.3 ? y0 : y0 - block / 2;
              const v = series[main]?.values[i] ?? null;
              return (
                <text key={axes[i].key} x={x} textAnchor={anchor} fontSize={FONT} fill={hover === i ? "var(--ink)" : "var(--ink-2)"}>
                  {lines.map((l, li) => (
                    <tspan key={li} x={x} y={top + (li + 1) * LINE_H - 3}>
                      {l}
                    </tspan>
                  ))}
                  <tspan x={x} y={top + (lines.length + 1) * LINE_H - 3} fill="var(--ink)" fontWeight={600} className="tabular">
                    {fmt(v)}
                  </tspan>
                </text>
              );
            })}
          </svg>
        )}
        {pointer && hover !== null && (
          <ChartTooltip x={pointer.x} y={pointer.y} width={width}>
            <div className="mb-1 font-semibold">{axes[hover].label}</div>
            <ul className="space-y-1">
              {series.map((s, si) => (
                <li key={s.key} className="flex items-start gap-2">
                  <span className="mt-[3px]">
                    <SeriesSwatch color={si === main ? "var(--brand)" : "var(--ink-3)"} dash={dashOf(si)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <span className="truncate text-ink-2">{s.label}</span>
                      <span className="font-semibold tabular">{fmt(s.values[hover])}</span>
                    </span>
                    {s.notes?.[hover] && <span className="block text-[11px] text-ink-3">{s.notes[hover]}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </ChartTooltip>
        )}
      </ChartFrame>

      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
        {series.map((s, si) => {
          const body = (
            <>
              <SeriesSwatch color={si === main ? "var(--brand)" : "var(--ink-3)"} dash={dashOf(si)} fill={si === main} />
              <span>{s.label}</span>
            </>
          );
          return selectable ? (
            <button
              key={s.key}
              type="button"
              aria-pressed={si === main}
              onClick={() => setPrimary(si)}
              className={cn("inline-flex items-center gap-1.5 rounded-[6px] py-0.5 transition-colors", si === main ? "font-medium text-ink" : "text-ink-3 hover:text-ink")}
            >
              {body}
            </button>
          ) : (
            <span key={s.key} className={cn("inline-flex items-center gap-1.5 py-0.5", si === main ? "font-medium text-ink" : "text-ink-3")}>
              {body}
            </span>
          );
        })}
      </figcaption>

      <SrTable
        caption={caption}
        columns={["Показатель", ...series.map((s) => s.label)]}
        rows={axes.map((a, i) => [a.label, ...series.map((s) => `${fmt(s.values[i])}${s.notes?.[i] ? `, ${s.notes[i]}` : ""}`)])}
      />
    </figure>
  );
}
