import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/dal";
import { logoutAction } from "@/lib/auth/actions";
import { Logo } from "@/components/logo";
import { StaffBottomNav, StaffSidebarNav } from "@/components/shell/staff-nav";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { LocaleProvider } from "@/lib/i18n/client";

export const metadata: Metadata = {
  title: {
    default: "Кабинет сотрудника",
    template: "%s · MGIMO Hub для деканата",
  },
};

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaff();
  const scope = staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Все факультеты";

  // Кабинет сотрудника всегда на русском, даже если в браузере выбран английский для кабинета студента
  return (
    <LocaleProvider locale="ru">
      <div className="min-h-dvh" lang="ru">
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-line bg-surface-1 px-3 py-4 lg:flex">
          <Link href="/staff" className="mb-1 px-2.5">
            <Logo compact />
          </Link>
          <div className="mb-6 px-2.5 text-[12px] text-ink-3">кабинет деканата</div>
          <StaffSidebarNav />
          <div className="mt-auto space-y-3 px-2">
            <div className="leading-tight">
              <div className="text-[13px] font-medium">
                {staff.firstName} {staff.lastName}
              </div>
              <div className="mt-0.5 text-[12px] text-ink-3">{scope}</div>
            </div>
            <div className="flex items-center justify-between">
              <form action={logoutAction}>
                <button type="submit" className="text-[13px] text-ink-3 hover:text-ink">
                  Выйти
                </button>
              </form>
              <ThemeSwitch />
            </div>
          </div>
        </aside>

        <div className="lg:pl-[240px]">
          <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
            <div className="flex h-12 items-center justify-between px-4">
              <Link href="/staff" className="flex items-center gap-2">
                <Logo compact />
                <span className="text-[12px] text-ink-3">деканат</span>
              </Link>
              <div className="flex items-center gap-2">
                <ThemeSwitch />
                <form action={logoutAction}>
                  <button type="submit" className="text-[13px] text-ink-3 hover:text-ink">
                    Выйти
                  </button>
                </form>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1180px] px-5 pt-7 pb-[calc(env(safe-area-inset-bottom)+96px)] sm:px-8 lg:px-14 lg:pt-14 lg:pb-20">{children}</main>
        </div>
        <StaffBottomNav />
      </div>
    </LocaleProvider>
  );
}
