"use client";
// Тепловая карта день недели × час. Пять ступеней одного цвета (бренд разной плотности),
// пунктирная рамка, часы работы офиса.
import { useState } from "react";
import { ChartFrame, ChartTooltip, SrTable, useAppear, useMeasure } from "./shared";
import { plural } from "@/lib/time";

const LEVELS = [0, 0.2, 0.42, 0.68, 0.95];
const LEFT = 26;
const BOTTOM = 18;
const GAP = 2;

export function Heatmap({
  rows,
  rowsLong,
  values,
  ariaLabel,
  caption,
  office,
  unit = ["заявка", "заявки", "заявок"],
}: {
  /** короткие подписи строк: Пн, Вт… */
  rows: string[];
  /** полные названия строк для подсказки и таблицы */
  rowsLong: string[];
  /** values[row][hour], 24 колонки */
  values: number[][];
  ariaLabel: string;
  caption: string;
  /** рамка часов работы: строки [from, to] и часы [from, to) */
  office?: { rows: [number, number]; hours: [number, number]; label: string };
  unit?: [string, string, string];
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const t = useAppear(width > 0, 900);
  const cols = 24;
  const max = Math.max(1, ...values.flat());
  const cw = Math.max(6, (width - LEFT) / cols);
  const ch = Math.min(26, Math.max(16, cw * 0.9));
  const height = rows.length * ch + BOTTOM;
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((4 * v) / max)));
  const labelEvery = cw >= 22 ? 2 : 3;
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const word = (n: number) => plural(n, unit[0], unit[1], unit[2]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const c = Math.floor((e.clientX - box.left - LEFT) / cw);
    const r = Math.floor((e.clientY - box.top) / ch);
    if (c < 0 || c >= cols || r < 0 || r >= rows.length) setHover(null);
    else setHover({ r, c });
  }

  return (
    <figure className="m-0">
      <ChartFrame frameRef={ref} height={width > 0 ? undefined : rows.length * 20 + BOTTOM}>
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
            onPointerLeave={() => setHover(null)}
          >
            {rows.map((label, r) => (
              <text key={label} x={0} y={r * ch + ch / 2 + 4} fontSize={11} fill={hover?.r === r ? "var(--ink)" : "var(--ink-3)"}>
                {label}
              </text>
            ))}
            {values.map((row, r) =>
              row.map((v, c) => {
                const x = LEFT + c * cw;
                const y = r * ch;
                const appear = Math.max(0, Math.min(1, t * 1.6 - (c / cols) * 0.6));
                const lv = level(v);
                const active = hover?.r === r && hover?.c === c;
                return (
                  <g key={`${r}-${c}`} opacity={appear}>
                    <rect x={x + GAP / 2} y={y + GAP / 2} width={cw - GAP} height={ch - GAP} rx={2} fill="var(--surface-2)" />
                    {lv > 0 && <rect x={x + GAP / 2} y={y + GAP / 2} width={cw - GAP} height={ch - GAP} rx={2} fill="var(--brand)" fillOpacity={LEVELS[lv]} />}
                    {active && <rect x={x + GAP / 2} y={y + GAP / 2} width={cw - GAP} height={ch - GAP} rx={2} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
                  </g>
                );
              }),
            )}
            {office && (
              <rect
                x={LEFT + office.hours[0] * cw}
                y={office.rows[0] * ch}
                width={(office.hours[1] - office.hours[0]) * cw}
                height={(office.rows[1] - office.rows[0] + 1) * ch}
                fill="none"
                stroke="var(--ink-2)"
                strokeWidth={1}
                strokeDasharray="3 3"
                rx={3}
                pointerEvents="none"
              />
            )}
            {Array.from({ length: cols / labelEvery }, (_, i) => i * labelEvery).map((h) => (
              <text key={h} x={LEFT + h * cw + 1} y={height - 4} fontSize={10.5} fill="var(--ink-3)" className="tabular">
                {String(h).padStart(2, "0")}
              </text>
            ))}
          </svg>
        )}
        {hover && (
          <ChartTooltip x={LEFT + hover.c * cw + cw / 2} y={hover.r * ch} width={width}>
            <div className="font-semibold">
              {rowsLong[hover.r]}, {hh(hover.c)}-{hh((hover.c + 1) % 24)}
            </div>
            <div className="text-ink-2 tabular">
              {values[hover.r][hover.c]} {word(values[hover.r][hover.c])}
            </div>
          </ChartTooltip>
        )}
      </ChartFrame>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          меньше
          <svg width={5 * 12 + 4 * 2} height={10} aria-hidden>
            {LEVELS.map((o, i) => (
              <g key={i}>
                <rect x={i * 14} y={0} width={12} height={10} rx={2} fill="var(--surface-2)" />
                {o > 0 && <rect x={i * 14} y={0} width={12} height={10} rx={2} fill="var(--brand)" fillOpacity={o} />}
              </g>
            ))}
          </svg>
          больше
        </span>
        {office && (
          <span className="inline-flex items-center gap-1.5">
            <svg width={14} height={10} aria-hidden>
              <rect x={0.5} y={0.5} width={13} height={9} rx={2} fill="none" stroke="var(--ink-2)" strokeDasharray="3 3" />
            </svg>
            {office.label}
          </span>
        )}
      </figcaption>
      <SrTable
        caption={caption}
        columns={["День", ...Array.from({ length: 24 }, (_, h) => hh(h))]}
        rows={values.map((row, r) => [rowsLong[r], ...row])}
      />
    </figure>
  );
}
