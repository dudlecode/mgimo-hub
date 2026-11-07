import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus, ShieldCheck } from "lucide-react";
import { getMyStudentCard, listMyWalletDocuments } from "@/lib/data/wallet";
import { formatDateNumeric } from "@/lib/time";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { LogoMark } from "@/components/logo";
import { Rise } from "@/components/motion/stagger";
import { OfflineMark, OfflineReady } from "@/components/pwa/offline-ready";
import { requireStudent } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/server";
import { documentsMessages } from "@/lib/i18n/messages/documents";
import { localizedName } from "@/lib/i18n/messages/common";
import { localizeRequestTitle } from "@/lib/requests/catalog-en";
import { codeName, personName } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: documentsMessages[await getLocale()].title };
}

export default async function DocumentsPage() {
  const [card, docs, { faculty }, locale] = await Promise.all([getMyStudentCard(), listMyWalletDocuments(), requireStudent(), getLocale()]);
  const t = documentsMessages[locale];
  // Эту страницу и бланки документов service worker сохранит на устройстве
  const offlineUrls = ["/documents", ...docs.filter((d) => d.hasBlank).map((d) => d.href)];

  return (
    <OfflineReady urls={offlineUrls}>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <ButtonLink href="/requests/new" variant="secondary" size="sm">
            <Plus className="size-4" aria-hidden />
            {t.order}
          </ButtonLink>
        }
      />

      {/* Студбилет: широкая карточка, QR крупно справа, чтобы его было удобно показать на входе */}
      <Rise i={0}>
        <section id="student-card" aria-labelledby="card-title" className="scroll-mt-24">
          <SectionTitle>
            <span id="card-title">{t.studentCard}</span>
          </SectionTitle>
          <Card className="grid grid-cols-[minmax(0,1fr)] overflow-hidden sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col p-6 sm:p-8">
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <LogoMark size={16} />
                MGIMO Hub, {t.cardKind}
              </div>
              <div className="mt-6 text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] break-words text-ink sm:text-[30px]" lang={locale === "en" ? undefined : "ru"}>
                {personName(card.lastName, locale)}
                <br />
                {personName(`${card.firstName} ${card.middleName ?? ""}`.trim(), locale)}
              </div>
              {locale === "en" && (
                <div className="mt-1.5 text-[13px] text-ink-3" lang="ru">
                  {card.lastName} {card.firstName} {card.middleName}
                </div>
              )}
              <div className="mt-2 text-[14px] text-ink-3">{locale === "en" ? localizedName(faculty, locale) : card.faculty}</div>
              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 text-[12px] sm:grid-cols-3">
                <div>
                  <dt className="text-ink-3">{t.number}</dt>
                  <dd className="mt-1 font-mono text-[14px] text-ink tabular">{card.number}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">{t.validUntil}</dt>
                  <dd className="mt-1 font-mono text-[14px] text-ink tabular">{locale === "en" ? card.validUntil.replace(/\./g, "/") : card.validUntil}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">{t.group}</dt>
                  <dd className="mt-1 text-[14px] text-ink">
                    <span className="font-mono">{codeName(card.group, locale)}</span>, {t.course(card.course)}
                  </dd>
                </div>
              </dl>
              <OfflineMark url="/documents" className="mt-6" />
            </div>
            <div className="flex flex-col items-center justify-center gap-4 border-t border-line bg-surface-1 p-6 sm:border-t-0 sm:border-l sm:p-8">
              <div className="size-[176px] rounded-[12px] bg-white p-3" role="img" aria-label={t.cardQr} dangerouslySetInnerHTML={{ __html: card.qr }} />
              <p className="max-w-[200px] text-center text-[12px] leading-relaxed text-ink-3">{t.showQr}</p>
            </div>
          </Card>
        </section>
      </Rise>

      <Rise i={1}>
        <section aria-labelledby="docs-title" className="mt-12">
          <SectionTitle count={docs.length}>
            <span id="docs-title">{t.myDocuments}</span>
          </SectionTitle>
          {docs.length ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-rows">
              {docs.map((d) => (
                <Card key={d.id} className="flex flex-col transition-colors hover:border-line-strong">
                  <Link href={d.href} className="flex flex-1 flex-col gap-5 rounded-t-card p-5 transition-colors hover:bg-surface-1">
                    <div className="flex items-start justify-between gap-3">
                      {d.qr ? (
                        <div className="size-16 shrink-0 rounded-[8px] bg-white p-1.5" aria-hidden dangerouslySetInnerHTML={{ __html: d.qr }} />
                      ) : (
                        <FileText className="size-6 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
                      )}
                      {d.hasBlank && <OfflineMark url={d.href} />}
                    </div>
                    <div className="mt-auto">
                      <div className="text-[15px] leading-snug font-medium text-ink">{localizeRequestTitle(d.title, locale)}</div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-ink-3">
                        <span className="font-mono tabular">
                          {t.numberSign} {d.number}
                        </span>
                        <span>
                          {t.issued} <span className="font-mono tabular">{formatDateNumeric(d.issuedAt, locale)}</span>
                        </span>
                      </div>
                    </div>
                  </Link>
                  {d.verifyHref && (
                    <Link href={d.verifyHref} className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-ink-3 transition-colors hover:bg-surface-1 hover:text-ink">
                      <ShieldCheck className="size-4" strokeWidth={1.8} aria-hidden />
                      {t.verify}
                    </Link>
                  )}
                </Card>
              ))}
              <Link
                href="/requests/new"
                className="flex min-h-[188px] flex-col justify-between gap-5 rounded-card border border-dashed border-line-strong p-5 text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
              >
                <Plus className="size-6" strokeWidth={1.5} aria-hidden />
                <span>
                  <span className="block text-[15px] font-medium text-ink">{t.order}</span>
                  <span className="mt-1.5 block text-[12px] leading-relaxed">{t.orderHint}</span>
                </span>
              </Link>
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={FileText}
                title={t.emptyTitle}
                text={t.emptyText}
                action={
                  <ButtonLink href="/requests/new" size="sm">
                    <Plus className="size-4" aria-hidden />
                    {t.order}
                  </ButtonLink>
                }
              />
            </Card>
          )}
        </section>
      </Rise>
    </OfflineReady>
  );
}
