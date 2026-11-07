import Link from "next/link";
import { requireStudent } from "@/lib/auth/dal";
import { getUnreadCount } from "@/lib/data/notifications";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui/misc";
import { BellLink, BottomNav, ProfileLink, SidebarNav } from "@/components/shell/nav";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { codeName, personName } from "@/lib/i18n/translit";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { student, group, faculty } = await requireStudent();
  const unread = await getUnreadCount();
  const t = await getMessages(shellMessages);
  const locale = await getLocale();
  const first = personName(student.firstName, locale);
  const last = personName(student.lastName, locale);
  // Время рендера: в сохранённой копии страницы по нему видно, насколько свежие данные
  const renderedAt = new Date().toISOString();

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[8px] focus:bg-surface focus:px-3 focus:py-2">
        {t.skipToContent}
      </a>

      {/* Боковая панель (десктоп) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-line bg-surface-1 px-3 py-4 lg:flex no-print">
        <Link href="/" className="mb-6 px-2.5" aria-label={t.homeAria}>
          <Logo />
        </Link>
        <SidebarNav unread={unread} contract={student.funding === "contract"} />
        <div className="mt-auto border-t border-line px-1 pt-3">
          <LanguageSwitch className="mb-2" />
          <div className="flex items-center gap-2.5">
            <ProfileLink>
              <Avatar first={first} last={last} size={30} />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px] font-medium">
                  {first} {last}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-ink-3">
                  {codeName(faculty.code, locale)}, {codeName(group.code, locale)}
                </div>
              </div>
            </ProfileLink>
            <ThemeSwitch />
          </div>
        </div>
      </aside>

      <div className="lg:pl-[240px]">
        {/* Верхняя панель (мобайл) */}
        <header className="sticky top-0 z-30 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden no-print">
          <div className="flex h-12 items-center justify-between gap-3 px-4">
            <Link href="/" aria-label={t.homeAria}>
              <Logo />
            </Link>
            <div className="flex items-center gap-1">
              <LanguageSwitch variant="compact" className="mr-1" />
              <ThemeSwitch className="size-9" />
              <BellLink unread={unread} />
              <Link href="/profile" className="rounded-[8px] p-1" aria-label={t.profile}>
                <Avatar first={first} last={last} size={28} />
              </Link>
            </div>
          </div>
        </header>

        <OfflineBanner renderedAt={renderedAt} />

        <main id="main" className="mx-auto max-w-[1180px] px-5 pt-7 pb-[calc(env(safe-area-inset-bottom)+96px)] sm:px-8 lg:px-14 lg:pt-14 lg:pb-20">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
