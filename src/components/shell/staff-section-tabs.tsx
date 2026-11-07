import Link from "next/link";
import { cn } from "@/lib/utils";
import { STAFF_SECTIONS, type StaffSection } from "./staff-sections";

/**
 * Экраны внутри раздела («Заявки, Справка в офисе, Больничные»): полоса с подчёркиванием над заголовком.
 * Отличается от сегментных фильтров на самих страницах, чтобы навигацию не путали с фильтром.
 */
export function StaffSectionTabs({ section, current }: { section: StaffSection; current: string }) {
  return (
    <nav aria-label="Экраны раздела" className="scrollbar-none -mx-5 mb-8 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-6 border-b border-line">
        {STAFF_SECTIONS[section].map((i) => {
          const on = i.href === current;
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn("-mb-px block border-b-2 pb-3 text-[14px] transition-colors", on ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
