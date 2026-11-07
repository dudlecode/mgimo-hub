// Разделы кабинета сотрудника. В меню 8 пунктов; родственные экраны собраны вкладками внутри раздела.
import { CalendarClock, CalendarCog, ChartNoAxesCombined, Inbox, LayoutDashboard, Megaphone, RotateCcw, Users, type LucideIcon } from "lucide-react";

export type StaffNavItem = { href: string; label: string; icon: LucideIcon; /** адреса, при которых пункт тоже активен */ also?: string[] };

export const STAFF_NAV: StaffNavItem[] = [
  { href: "/staff", label: "Очередь", icon: LayoutDashboard },
  { href: "/staff/requests", label: "Заявки", icon: Inbox, also: ["/staff/certificates", "/staff/sick-leaves"] },
  { href: "/staff/students", label: "Студенты", icon: Users, also: ["/staff/payments", "/staff/radar"] },
  { href: "/staff/appointments", label: "Приём", icon: CalendarClock },
  { href: "/staff/retakes", label: "Пересдачи", icon: RotateCcw },
  { href: "/staff/schedule", label: "Расписание", icon: CalendarCog },
  { href: "/staff/announcements", label: "Объявления", icon: Megaphone },
  { href: "/staff/analytics", label: "Аналитика", icon: ChartNoAxesCombined, also: ["/staff/audit"] },
];

/** Вкладки внутри раздела */
export const STAFF_SECTIONS = {
  requests: [
    { href: "/staff/requests", label: "Заявки" },
    { href: "/staff/certificates", label: "Справка в офисе" },
    { href: "/staff/sick-leaves", label: "Больничные" },
  ],
  students: [
    { href: "/staff/students", label: "Студенты" },
    { href: "/staff/payments", label: "Оплата" },
  ],
  analytics: [
    { href: "/staff/analytics", label: "Аналитика" },
    { href: "/staff/audit", label: "Журнал действий" },
  ],
} as const;

export type StaffSection = keyof typeof STAFF_SECTIONS;

const matches = (p: string, h: string) => (h === "/staff" ? p === "/staff" : p === h || p.startsWith(`${h}/`));

export function isStaffNavActive(pathname: string, item: StaffNavItem) {
  return matches(pathname, item.href) || (item.also ?? []).some((h) => matches(pathname, h));
}
