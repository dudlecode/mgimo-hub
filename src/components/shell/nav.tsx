"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CalendarClock, CalendarDays, FileText, FolderLock, GraduationCap, HeartPulse, House, MessageSquare, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMessages } from "@/lib/i18n/client";
import { shellMessages } from "@/lib/i18n/messages/shell";

type NavKey = keyof (typeof shellMessages)["ru"]["nav"];
type Item = { href: string; key: NavKey; icon: LucideIcon };

export const STUDENT_NAV: Item[] = [
  { href: "/", key: "today", icon: House },
  { href: "/schedule", key: "schedule", icon: CalendarDays },
  { href: "/assistant", key: "assistant", icon: MessageSquare },
  { href: "/grades", key: "grades", icon: GraduationCap },
  { href: "/requests", key: "requests", icon: FileText },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Счётчик непрочитанных: стартует с серверного значения, обновляется раз в минуту, после переходов и при возврате во вкладку. */
export function useUnread(initial: number) {
  const [count, setCount] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const pathname = usePathname();
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setCount(initial);
  }
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications/count", { cache: "no-store" });
        if (res.ok && alive) setCount((await res.json()).count);
      } catch {
        /* офлайн: оставляем как есть */
      }
    };
    const id = setInterval(load, 60_000);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    const first = setTimeout(load, 300);
    return () => {
      alive = false;
      clearInterval(id);
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [pathname]);
  return count;
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <span className={cn("grid h-[18px] min-w-[18px] place-items-center rounded-[5px] bg-brand px-1 text-[11px] leading-none font-semibold text-white tabular", className)}>{count > 99 ? "99+" : count}</span>;
}

export function SidebarNav({ unread, contract = false }: { unread: number; contract?: boolean }) {
  const pathname = usePathname();
  const count = useUnread(unread);
  const t = useMessages(shellMessages);
  const items: (Item & { badge?: number })[] = [
    ...STUDENT_NAV,
    { href: "/notifications", key: "notifications", icon: Bell, badge: count },
    { href: "/appointments", key: "appointments", icon: CalendarClock },
    { href: "/documents", key: "documents", icon: FolderLock },
    { href: "/sick-leave", key: "sickLeave", icon: HeartPulse },
    ...(contract ? [{ href: "/payments", key: "payments" as const, icon: Wallet }] : []),
  ];
  return (
    <nav className="space-y-px" aria-label={t.mainMenu}>
      {items.map(({ href, key, icon: Icon, badge }, i) => {
        const active = isActive(pathname, href);
        return (
          <div key={href}>
            {i === STUDENT_NAV.length && <div className="my-2 h-px bg-line" aria-hidden />}
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] transition-colors", active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
            >
              <Icon className={cn("size-4", active ? "text-ink" : "text-ink-3")} strokeWidth={1.8} aria-hidden />
              <span className="flex-1">{t.nav[key]}</span>
              {badge ? <CountBadge count={badge} /> : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useMessages(shellMessages);
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur-md lg:hidden no-print" aria-label={t.mainMenu}>
      <ul className="mx-auto grid h-14 max-w-lg grid-cols-5">
        {STUDENT_NAV.map(({ href, key, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="contents">
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1 text-[11px]", active ? "font-medium text-ink" : "text-ink-3")}>
                <Icon className="size-5" strokeWidth={active ? 2 : 1.7} aria-hidden />
                {t.nav[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BellLink({ unread }: { unread: number }) {
  const count = useUnread(unread);
  const pathname = usePathname();
  const t = useMessages(shellMessages);
  return (
    <Link
      href="/notifications"
      className={cn("relative grid size-9 place-items-center rounded-[8px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", pathname.startsWith("/notifications") && "bg-surface-2 text-ink")}
      aria-label={count ? t.notificationsUnread(count) : t.nav.notifications}
    >
      <Bell className="size-[18px]" strokeWidth={1.8} aria-hidden />
      {count > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand ring-2 ring-bg" aria-hidden />}
    </Link>
  );
}

/** Нижний блок сайдбара со студентом: ссылка в профиль, подсвечена на странице профиля. */
export function ProfileLink({ children }: { children: React.ReactNode }) {
  const active = usePathname().startsWith("/profile");
  return (
    <Link
      href="/profile"
      aria-current={active ? "page" : undefined}
      className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 transition-colors", active ? "bg-surface-3" : "hover:bg-surface-2")}
    >
      {children}
    </Link>
  );
}
