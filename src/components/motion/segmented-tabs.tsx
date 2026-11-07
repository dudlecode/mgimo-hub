"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SPRING } from "./presets";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; href: string; label: string; dot?: boolean };

/**
 * Вкладки, которые переключаются на месте, без запроса к серверу: все панели уже отрисованы,
 * скрытые лежат с атрибутом hidden. Адрес обновляется через history.replaceState, поэтому
 * ссылкой на вкладку можно поделиться, а без JS ссылки работают как обычные.
 */
export function SegmentedTabs({ id, items, initial, panels, className }: { id: string; items: TabItem[]; initial: string; panels: Record<string, React.ReactNode>; className?: string }) {
  const [active, setActive] = useState(initial);
  const reduce = useReducedMotion();

  function select(item: TabItem) {
    if (item.key === active) return;
    setActive(item.key);
    window.history.replaceState(null, "", item.href);
  }

  return (
    <>
      <div className={cn("inline-flex rounded-[9px] bg-surface-2 p-0.5", className)} role="tablist">
        {items.map((t, i) => {
          const on = t.key === active;
          return (
            <a
              key={t.key}
              id={`${id}-tab-${t.key}`}
              href={t.href}
              role="tab"
              aria-selected={on}
              aria-controls={`${id}-panel-${t.key}`}
              tabIndex={on ? 0 : -1}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                select(t);
              }}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
                select(next);
                document.getElementById(`${id}-tab-${next.key}`)?.focus();
              }}
              className={cn("relative rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-colors", on ? "text-ink" : "text-ink-3 hover:text-ink")}
            >
              {on && <motion.span layoutId={reduce ? undefined : `seg-${id}`} className="absolute inset-0 rounded-[7px] bg-surface ring-1 ring-line" transition={SPRING.snappy} aria-hidden />}
              <span className="relative">
                {t.label}
                {t.dot && <span className="ml-1.5 inline-block size-1.5 -translate-y-0.5 rounded-full bg-danger" />}
              </span>
            </a>
          );
        })}
      </div>
      {items.map((t) => (
        <div key={t.key} id={`${id}-panel-${t.key}`} role="tabpanel" aria-labelledby={`${id}-tab-${t.key}`} hidden={t.key !== active}>
          {panels[t.key]}
        </div>
      ))}
    </>
  );
}
