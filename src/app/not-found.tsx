import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n/server";
import { shellMessages } from "@/lib/i18n/messages/shell";

export default async function NotFound() {
  const t = (await getMessages(shellMessages)).notFound;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <Logo className="mb-10" />
      <p className="font-mono text-[13px] text-ink-3">404</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.025em]">{t.title}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t.text}</p>
      <div className="mt-6">
        <Link href="/" className={buttonClass("secondary")}>
          {t.home}
        </Link>
      </div>
    </main>
  );
}
