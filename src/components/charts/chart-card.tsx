import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Карточка диаграммы: заголовок, пояснение одной строкой, содержимое, сноска. */
export function ChartCard({
  title,
  description,
  aside,
  footer,
  className,
  children,
}: {
  title: string;
  description: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("flex h-full min-w-0 flex-col p-5", className)}>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>
        </div>
        {aside && <div className="shrink-0 text-right text-[13px] text-ink-3 tabular">{aside}</div>}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
      {footer && <div className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">{footer}</div>}
    </Card>
  );
}
