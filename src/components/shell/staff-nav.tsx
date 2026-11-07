"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAFF_NAV as ITEMS, isStaffNavActive as active } from "./staff-sections";

export function StaffSidebarNav() {
  const p = usePathname();
  return (
    <nav className="space-y-px" aria-label="Меню сотрудника">
      {ITEMS.map((it) => {
        const on = active(p, it);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={cn("flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] transition-colors", on ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
          >
            <Icon className={cn("size-4", on ? "text-ink" : "text-ink-3")} strokeWidth={1.8} aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Внизу на телефоне: четыре главных раздела и «Ещё» с остальными. */
const MAIN = 4;

export function StaffBottomNav() {
  const p = usePathname();
  // панель открыта только для того адреса, на котором её открыли: переход по ссылке или «назад» закрывает её без эффекта
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === p;
  const main = ITEMS.slice(0, MAIN);
  const rest = ITEMS.slice(MAIN);
  const restActive = rest.find((it) => active(p, it));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenFor(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const item = "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]";
  return (
    <>
      {open && <button type="button" aria-label="Закрыть меню" className="fixed inset-0 z-40 bg-ink/20 lg:hidden" onClick={() => setOpenFor(null)} />}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 backdrop-blur-md lg:hidden" aria-label="Меню сотрудника">
        {open && (
          <ul id="staff-more" className="mx-auto grid max-w-lg grid-cols-4 gap-1 border-b border-line px-3 py-3">
            {rest.map((it) => {
              const on = active(p, it);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    onClick={() => setOpenFor(null)}
                    className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-ctl text-[12px]", on ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2")}
                  >
                    <Icon className="size-5" strokeWidth={on ? 2 : 1.7} aria-hidden />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <ul className="mx-auto flex h-14 max-w-lg">
          {main.map((it) => {
            const on = active(p, it);
            const Icon = it.icon;
            return (
              <li key={it.href} className="flex flex-1">
                <Link href={it.href} aria-current={on ? "page" : undefined} className={cn(item, on ? "font-medium text-ink" : "text-ink-3")}>
                  <Icon className="size-5" strokeWidth={on ? 2 : 1.7} aria-hidden />
                  {it.label}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" aria-expanded={open} aria-controls="staff-more" onClick={() => setOpenFor(open ? null : p)} className={cn(item, open || restActive ? "font-medium text-ink" : "text-ink-3")}>
              <Ellipsis className="size-5" strokeWidth={open || restActive ? 2 : 1.7} aria-hidden />
              {restActive && !open ? restActive.label : "Ещё"}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
