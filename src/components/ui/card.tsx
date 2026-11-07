import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Контейнер-группа: тонкая рамка, без тени. Используется для списков, а не для каждого элемента. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-line bg-surface", className)} {...props} />;
}

export function CardLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn("block rounded-card border border-line bg-surface transition-colors hover:border-line-strong hover:bg-surface-1", className)} {...props} />;
}

export function SectionTitle({
  children,
  action,
  href,
  className,
  count,
}: {
  children: ReactNode;
  action?: string;
  href?: string;
  className?: string;
  count?: number;
}) {
  return (
    <div className={cn("mb-3.5 flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
        {children}
        {count !== undefined && count > 0 && <span className="ml-1.5 font-normal text-ink-3 tabular">{count}</span>}
      </h2>
      {action && href && (
        <Link href={href} className="text-[13px] text-ink-3 transition-colors hover:text-ink">
          {action}
        </Link>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] text-ink-3">{eyebrow}</div>}
        <h1 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-ink lg:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Хлебные крошки вместо стрелок «назад» */
export function Crumbs({ items, label = "Навигация" }: { items: { href?: string; label: string }[]; label?: string }) {
  return (
    <nav aria-label={label} className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-3">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>/</span>}
          {it.href ? (
            <Link href={it.href} className="transition-colors hover:text-ink">
              {it.label}
            </Link>
          ) : (
            <span className="text-ink-2">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
