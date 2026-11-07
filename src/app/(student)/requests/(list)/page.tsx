import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Inbox, Plus } from "lucide-react";
import { listMyRequests } from "@/lib/data/requests";
import { ACTIVE_STATUSES } from "@/lib/requests/catalog";
import { localizedRequestTypes } from "@/lib/requests/catalog-en";
import { getLocale } from "@/lib/i18n/server";
import { requestsMessages } from "@/lib/i18n/messages/requests";
import { RequestRow } from "@/components/feature/request-bits";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";

import { SegmentedLinks } from "@/components/motion/segmented-links";

export async function generateMetadata(): Promise<Metadata> {
  return { title: requestsMessages[await getLocale()].title };
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const locale = await getLocale();
  const t = requestsMessages[locale];
  const all = await listMyRequests();
  const now = new Date();
  const active = all.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const archive = all.filter((r) => !ACTIVE_STATUSES.includes(r.status));
  const showArchive = tab === "archive";
  const list = showArchive ? archive : active;
  const popular = localizedRequestTypes(locale).filter((d) => d.popular);

  return (
    <div >
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <ButtonLink href="/requests/new" className="hidden sm:inline-flex">
            <Plus className="size-4.5" aria-hidden />
            {t.newRequest}
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <section>
          <SegmentedLinks id="requests" className="mb-4" items={[{ href: "/requests", label: t.tabActive, active: !showArchive, count: active.length }, { href: "/requests?tab=archive", label: t.tabArchive, active: showArchive, count: archive.length }]} />

          <Card className="p-1.5">
            {list.length ? (
              list.map((r) => <RequestRow key={r.id} r={r} now={now} locale={locale} />)
            ) : showArchive ? (
              <EmptyState icon={Archive} title={t.archiveEmptyTitle} text={t.archiveEmptyText} />
            ) : (
              <EmptyState
                icon={Inbox}
                title={t.activeEmptyTitle}
                text={t.activeEmptyText}
                action={
                  <ButtonLink href="/requests/new">
                    <Plus className="size-4.5" aria-hidden />
                    {t.newRequest}
                  </ButtonLink>
                }
              />
            )}
          </Card>
        </section>

        <aside>
          <SectionTitle action={t.seeAll} href="/requests/new">
            {t.popularTitle}
          </SectionTitle>
          <div className="space-y-2.5">
            {popular.map((d) => {
              return (
                <Link key={d.slug} href={`/requests/new/${d.slug}`} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{d.title}</div>
                    <div className="truncate text-[12px] text-ink-3">{d.short}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-1 text-[11px] font-semibold text-ink-2">{t.slaShort(d.slaDays)}</span>
                </Link>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Мобильная кнопка */}
      <Link
        href="/requests/new"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-30 inline-flex h-13 items-center gap-2 rounded-full bg-brand px-5 font-semibold text-brand-ink shadow-pop active:scale-95 sm:hidden"
      >
        <Plus className="size-5" aria-hidden />
        {t.newRequest}
      </Link>
    </div>
  );
}
