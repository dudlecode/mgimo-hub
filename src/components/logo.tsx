import { cn } from "@/lib/utils";

/**
 * Знак MGIMO Hub: строчная геометрическая «m» из двух арок и точка-узел («hub»).
 * Монохром, цвет текста. Собственная разработка, с гербом и логотипом МГИМО не связан.
 */
export function LogoMark({ size = 24, className, inverted }: { size?: number; className?: string; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0", inverted ? "text-white" : "text-ink", className)} aria-hidden>
      <rect width="24" height="24" rx="6.5" fill="currentColor" />
      <path d="M5.5 17.5V11.25a3.25 3.25 0 0 1 6.5 0V17.5M12 11.25a3.25 3.25 0 0 1 6.5 0V17.5" fill="none" stroke="var(--bg)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.6" cy="5.6" r="1.55" fill="var(--bg)" />
    </svg>
  );
}

export function Logo({ className, compact, inverted }: { className?: string; compact?: boolean; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark size={compact ? 20 : 22} inverted={inverted} />
      <span className={cn("text-[15px] leading-none tracking-[-0.02em]", inverted ? "text-white" : "text-ink")}>
        <span className="font-semibold">MGIMO</span>
        <span className="ml-[3px] font-normal text-ink-2">Hub</span>
      </span>
          </div>
  );
}
