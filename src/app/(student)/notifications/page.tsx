import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, CalendarClock, CheckCheck, FileText, GraduationCap, HeartPulse, Info, Megaphone, NotebookPen, Pin, Wallet } from "lucide-react";
import { listMyAnnouncements, listMyNotifications } from "@/lib/data/notifications";
import { markAllReadAction } from "@/app/(student)/actions";
import { diffDays, formatDayMonth, formatTime, relativeTime } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SegmentedLinks } from "@/components/motion/segmented-links";
import { cn } from "@/lib/utils";
import type { NotificationKind } from "@/db/schema";
import { vapidPublicKey } from "@/lib/push";
import { PushCard } from "@/components/pwa/push-card";
import { getLocale } from "@/lib/i18n/server";
import { notificationsMessages } from "@/lib/i18n/messages/notifications";

export async function generateMetadata(): Promise<Metadata> {
  return { title: notificationsMessages[await getLocale()].title };
}

// Подписи типов берутся из словаря notificationsMessages.kind
const KIND: Record<NotificationKind, { icon: typeof Info; cls: string }> = {
  schedule: { icon: CalendarClock, cls: "bg-warning-soft text-warning" },
  request: { icon: FileText, cls: "bg-brand-soft text-brand-fg" },
  grade: { icon: GraduationCap, cls: "bg-success-soft text-success" },
  deadline: { icon: NotebookPen, cls: "bg-danger-soft text-danger" },
  news: { icon: Megaphone, cls: "bg-accent-soft text-accent" },
  system: { icon: Info, cls: "bg-surface-2 text-ink-2" },
  payment: { icon: Wallet, cls: "bg-surface-2 text-ink-2" },
  health: { icon: HeartPulse, cls: "bg-surface-2 text-ink-2" },
};

type DayGroup = "today" | "yesterday" | "week" | "earlier";

function dayGroup(d: Date, now: Date): DayGroup {
  const diff = diffDays(d, now);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return "week";
  return "earlier";
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string }> }) {
  const { tab, kind } = await searchParams;
  const locale = await getLocale();
  const t = notificationsMessages[locale];
  const groupLabel: Record<DayGroup, string> = { today: t.groupToday, yesterday: t.groupYesterday, week: t.groupWeek, earlier: t.groupEarlier };
  const isNews = tab === "news";
  const now = new Date();
  const [items, news] = await Promise.all([listMyNotifications(60, locale), isNews ? listMyAnnouncements(30, locale) : Promise.resolve([])]);
  const unread = items.filter((n) => !n.readAt).length;
  const filtered = kind && kind in KIND ? items.filter((n) => n.kind === kind) : items;
  const groups = new Map<DayGroup, typeof items>();
  for (const n of filtered) {
    const g = dayGroup(n.createdAt, now);
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }
  const kinds = [...new Set(items.map((n) => n.kind))];

  return (
    <div>
      <PageHeader
        title={t.title}
        subtitle={unread ? t.unread(unread) : t.allRead}
        actions={
          !isNews && unread > 0 ? (
            <form action={markAllReadAction}>
              <Button type="submit" variant="secondary" size="sm">
                <CheckCheck className="size-4" aria-hidden />
                {t.markAll}
              </Button>
            </form>
          ) : null
        }
      />

      <PushCard vapidKey={vapidPublicKey()} />

      <SegmentedLinks
        id="notifications"
        className="mb-6"
        items={[
          { href: "/notifications", label: t.tabMine, active: !isNews, dot: unread > 0 },
          { href: "/notifications?tab=news", label: t.tabNews, active: isNews },
        ]}
      />

      {isNews ? (
        news.length ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            {news.map((n) => (
              <Link key={n.id} href={`/news/${n.id}`} className="rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {n.pinned && (
                    <Badge tone="accent">
                      <Pin className="size-3" aria-hidden />
                      {t.pinned}
                    </Badge>
                  )}
                  {n.important && <Badge tone="danger">{t.important}</Badge>}
                  <Badge tone="neutral">{t.category[n.category] ?? n.category}</Badge>
                </div>
                <h2 className="text-[16px] leading-snug font-semibold" lang={n.ruOnly ? "ru" : undefined}>
                  {n.title}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-ink-2" lang={n.ruOnly ? "ru" : undefined}>
                  {n.body.split("\n")[0]}
                </p>
                <div className="mt-3 text-[12px] text-ink-3">
                  <span>{n.authorName}</span> · {relativeTime(n.publishedAt, now, locale)}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={Megaphone} title={t.newsEmptyTitle} text={t.newsEmptyText} />
          </Card>
        )
      ) : items.length ? (
        <>
          {kinds.length > 1 && (
            <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <Link
                href="/notifications"
                className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium", !kind ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink-2")}
              >
                {t.all}
              </Link>
              {kinds.map((k) => (
                <Link
                  key={k}
                  href={`/notifications?kind=${k}`}
                  className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium", kind === k ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink-2")}
                >
                  {t.kind[k]}
                </Link>
              ))}
            </div>
          )}
          <div className="space-y-10">
            {[...groups.entries()].map(([g, list]) => (
              <section key={g}>
                <h2 className="mb-2 text-[13px] font-bold tracking-wide text-ink-3 uppercase">{groupLabel[g]}</h2>
                <Card className="divide-y divide-line stagger-rows">
                  {list.map((n) => {
                    return (
                      <Link
                        key={n.id}
                        href={`/notifications/${n.id}/open`}
                        prefetch={false}
                        className={cn("flex gap-3 px-5 py-4 transition-colors hover:bg-surface-2/60", !n.readAt && "bg-brand-soft/25")}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className={cn("text-[14px] leading-snug", n.readAt ? "font-medium" : "font-semibold")}>
                              {n.important && !n.readAt && <span className="mr-1 text-danger">●</span>}
                              <span lang={n.ru && locale === "en" ? "ru" : undefined}>{n.title}</span>
                            </div>
                            <time className="shrink-0 text-[12px] text-ink-3">{g === "today" || g === "yesterday" ? formatTime(n.createdAt, locale) : formatDayMonth(n.createdAt, locale)}</time>
                          </div>
                          <p className="mt-0.5 text-[13px] leading-snug text-ink-2" lang={n.ru && locale === "en" ? "ru" : undefined}>
                            {n.body}
                          </p>
                        </div>
                        {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label={t.unreadMark} />}
                      </Link>
                    );
                  })}
                </Card>
              </section>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <EmptyState icon={BellOff} title={t.emptyTitle} text={t.emptyText} />
        </Card>
      )}
    </div>
  );
}
