import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("skeleton rounded-[8px]", className)} aria-hidden {...props} />;
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-start", compact ? "px-4 py-6" : "px-5 py-10", className)}>
      {Icon && <Icon className="mb-3 size-5 text-ink-3" strokeWidth={1.6} aria-hidden />}
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-3">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = "brand",
  className,
  marker,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "success" | "warning" | "danger" | "accent" | "neutral";
  className?: string;
  marker?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colors = { brand: "bg-brand", success: "bg-success", warning: "bg-warning", danger: "bg-danger", accent: "bg-ink-2", neutral: "bg-ink-3" };
  return (
    <div className={cn("relative h-1 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={cn("bar-grow h-full rounded-full transition-[width] duration-500 ease-out", colors[tone])} style={{ width: `${pct}%` }} />
      {marker !== undefined && <div className="absolute top-0 h-full w-px bg-ink/50" style={{ left: `${(marker / max) * 100}%` }} aria-hidden />}
    </div>
  );
}

export function Ring({
  value,
  max = 100,
  size = 56,
  stroke = 4,
  tone = "brand",
  children,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  tone?: "brand" | "success" | "warning" | "danger" | "accent" | "white";
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const color = { brand: "var(--brand)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", accent: "var(--ink-2)", white: "#fff" }[tone];
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .6s ease-out" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Инициалы в скруглённом квадрате, нейтральный тон */
export function Avatar({ first, last, size = 32, className }: { first: string; last: string; hue?: number; size?: number; className?: string }) {
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-[8px] bg-surface-3 font-medium text-ink-2 select-none", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {`${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()}
    </div>
  );
}


export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] border border-line bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">{children}</kbd>;
}
