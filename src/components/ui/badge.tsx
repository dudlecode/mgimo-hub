import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger" | "accent";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand-soft text-brand-fg",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-surface-2 text-ink-2",
};

const dots: Record<BadgeTone, string> = {
  neutral: "bg-ink-3",
  brand: "bg-brand",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-ink-3",
};

/** Метка статуса: прямоугольная, компактная, не «таблетка». */
export function Badge({ tone = "neutral", dot, className, children, ...props }: ComponentProps<"span"> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-[12px] leading-none font-medium whitespace-nowrap", tones[tone], className)}
      {...props}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** Статус текстом с точкой, для плотных списков */
export function StatusText({ tone = "neutral", children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  const text: Record<BadgeTone, string> = {
    neutral: "text-ink-3",
    brand: "text-brand-fg",
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    accent: "text-ink-3",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap", text[tone], className)}>
      <span className={cn("size-1.5 rounded-full", dots[tone])} aria-hidden />
      {children}
    </span>
  );
}
