"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { SPRING } from "./presets";
import { cn } from "@/lib/utils";

export type SegmentItem = { href: string; label: string; active: boolean; dot?: boolean; count?: number };

/** Вкладки-ссылки со скользящей подложкой активного пункта. */
export function SegmentedLinks({ id, items, className }: { id: string; items: SegmentItem[]; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("inline-flex rounded-[9px] bg-surface-2 p-0.5", className)} role="tablist">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={t.active}
          scroll={false}
          className={cn("relative rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-colors", t.active ? "text-ink" : "text-ink-3 hover:text-ink")}
        >
          {t.active && (
            <motion.span
              layoutId={reduce ? undefined : `seg-${id}`}
              className="absolute inset-0 rounded-[7px] bg-surface ring-1 ring-line"
              transition={SPRING.snappy}
              aria-hidden
            />
          )}
          <span className="relative">
            {t.label}
            {t.count ? <span className="ml-1.5 text-ink-3 tabular">{t.count}</span> : null}
            {t.dot && <span className="ml-1.5 inline-block size-1.5 -translate-y-0.5 rounded-full bg-danger" />}
          </span>
        </Link>
      ))}
    </div>
  );
}
