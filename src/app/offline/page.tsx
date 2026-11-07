import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui/button";
import { OfflineIntro, RetryButton, SavedPages } from "@/components/pwa/saved-pages";
import { getLocale } from "@/lib/i18n/server";
import { offlineMessages } from "@/lib/i18n/messages/offline";

export async function generateMetadata(): Promise<Metadata> {
  return { title: offlineMessages[await getLocale()].title };
}

// Статическая страница без персональных данных. Service worker хранит её заранее и показывает,
// когда сети нет, а нужной страницы в кэше устройства нет.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <Logo className="mb-10" />
      <OfflineIntro />
      <div className="mt-6">
        <RetryButton className={buttonClass("primary")} />
      </div>

      <SavedPages titleClassName="mt-10 mb-3 text-[14px] font-semibold tracking-[-0.01em] text-ink" />
    </main>
  );
}
