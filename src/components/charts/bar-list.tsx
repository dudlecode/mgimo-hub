"use client";
// Горизонтальные бары: подпись и число над полосой, пояснение мелко под ней.
import { ChartFrame, SrTable, useAnimatedNumbers, useMeasure } from "./shared";

export type BarItem = { key: string; label: string; value: number; meta?: string; detail?: string[] };

export function BarList({
  items,
  ariaLabel,
  caption,
  valueLabel,
  labelHeader = "Название",
  detailLabels = [],
  formatValue = (v) => String(Math.round(v)),
}: {
  items: BarItem[];
  ariaLabel: string;
  caption: string;
  valueLabel: string;
  labelHeader?: string;
  /** заголовки дополнительных колонок скрытой таблицы (по detail) */
  detailLabels?: string[];
  formatValue?: (v: number) => string;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const max = Math.max(1, ...items.map((i) => i.value));
  const widths = useAnimatedNumbers(
    items.map((i) => (100 * i.value) / max),
    width > 0,
    800,
  );

  return (
    <figure className="m-0">
      <ChartFrame frameRef={ref}>
        <div role="img" aria-label={ariaLabel}>
          <ul className="space-y-3">
            {items.map((it, i) => (
              <li key={it.key}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-ink">{it.label}</span>
                  <span className="shrink-0 font-medium tabular">{formatValue(it.value)}</span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-[3px] bg-surface-2">
                  <div className="h-full rounded-[3px] bg-brand" style={{ width: `${Math.max(it.value > 0 ? 1.5 : 0, widths[i] ?? 0)}%` }} />
                </div>
                {it.meta && <div className="mt-1 text-[12px] text-ink-3 tabular">{it.meta}</div>}
              </li>
            ))}
          </ul>
        </div>
      </ChartFrame>
      <SrTable caption={caption} columns={[labelHeader, valueLabel, ...detailLabels]} rows={items.map((it) => [it.label, formatValue(it.value), ...(it.detail ?? [])])} />
    </figure>
  );
}
