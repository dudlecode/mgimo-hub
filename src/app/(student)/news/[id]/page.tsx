import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Megaphone, Sparkles } from "lucide-react";
import { z } from "zod";
import { getMyAnnouncement } from "@/lib/data/notifications";
import { formatDateLong, formatTime } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLocale } from "@/lib/i18n/server";
import { notificationsMessages } from "@/lib/i18n/messages/notifications";

export async function generateMetadata(): Promise<Metadata> {
  return { title: notificationsMessages[await getLocale()].newsTitle };
}

export default async function NewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const locale = await getLocale();
  const n = await getMyAnnouncement(id, locale);
  const ru = n.ruOnly ? "ru" : undefined;
  const t = notificationsMessages[locale];
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/notifications?tab=news" className="mb-4 inline-block text-[13px] text-ink-3 hover:text-ink">
        {t.newsBack}
      </Link>
      <Card className="p-5 sm:p-7">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {n.important && <Badge tone="danger">{t.important}</Badge>}
          <Badge tone="neutral">{t.category[n.category] ?? n.category}</Badge>
        </div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]" lang={ru}>
          {n.title}
        </h1>
        <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-3">
          <Megaphone className="size-4" aria-hidden />
          <span>{n.authorName}</span> · {formatDateLong(n.publishedAt, locale)}, {formatTime(n.publishedAt, locale)}
        </div>
        <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-ink" lang={ru}>
          {n.body
            .split("\n")
            .filter(Boolean)
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
        </div>
        <Link
          href={`/assistant?q=${encodeURIComponent(t.askAboutNews(n.title))}`}
          className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-[14px] font-semibold text-ink hover:bg-surface-3"
        >
          <Sparkles className="size-4 text-accent" aria-hidden />
          {t.whatToDo}
        </Link>
      </Card>
    </div>
  );
}
