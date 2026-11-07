import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Wallet } from "lucide-react";
import { getMyPayments, type MyPayment } from "@/lib/data/payments";
import { getSemester } from "@/lib/academic";
import { REQUEST_TYPES } from "@/lib/requests/catalog";
import { academicYearLabel, formatRub, overdueDays, paymentState, periodAcademicYear } from "@/lib/payments";
import { diffDays, formatDateLong } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { dueHintFor, formatRubFor, localizePeriod, paymentsMessages, paymentStateMeta } from "@/lib/i18n/messages/payments";
import { localizeOfficeHours } from "@/lib/i18n/messages/common";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import { Stagger } from "@/components/motion/stagger";
import { cn } from "@/lib/utils";
import { codeName } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: paymentsMessages[await getLocale()].title };
}

const HINT_TONE = { overdue: "text-danger", soon: "text-warning", upcoming: "text-ink", paid: "text-success" } as const;

/** Справка для налогового вычета: отдельный тип из каталога, иначе справка об обучении с целью «в налоговую», иначе каталог */
function taxCertificateHref() {
  const dedicated = REQUEST_TYPES.find((t) => !t.hidden && t.category === "certificate" && [t.title, ...t.keywords].some((k) => /налог|вычет/i.test(k)));
  if (dedicated) return `/requests/new/${dedicated.slug}`;
  const study = REQUEST_TYPES.find((t) => t.slug === "study-certificate");
  const purpose = study?.fields.find((f) => f.name === "purpose")?.options?.find((o) => /налог/i.test(o.value));
  if (study && purpose) return `/requests/new/${study.slug}?prefill=${Buffer.from(JSON.stringify({ purpose: purpose.value }), "utf8").toString("base64url")}`;
  return "/requests/new";
}

export default async function PaymentsPage() {
  const { funding, office, payments, contractNo } = await getMyPayments();
  const now = new Date();
  const locale = await getLocale();
  const t = paymentsMessages[locale];
  const rub = (n: number) => formatRubFor(n, locale, formatRub);
  const hours = localizeOfficeHours(office.hours, locale);

  if (funding === "budget") {
    return (
      <div>
        <PageHeader title={t.title} />
        <Card>
          <EmptyState icon={CircleCheck} title={t.budgetTitle} text={t.budgetText} />
        </Card>
      </div>
    );
  }

  if (!payments.length) {
    return (
      <div>
        <PageHeader title={t.title} />
        <Card>
          <EmptyState
            icon={Wallet}
            title={t.noScheduleTitle}
            text={t.noScheduleText(codeName(office.code, locale), office.room, hours)}
          />
        </Card>
      </div>
    );
  }

  const next = payments.find((p) => !p.paidAt) ?? null;
  const ay = getSemester(now).academicYear;
  const yearRows = payments.filter((p) => periodAcademicYear(p.period) === ay);
  const yearTotal = yearRows.reduce((a, p) => a + p.amount, 0);
  const yearPaid = yearRows.reduce((a, p) => a + (p.paidAt ? p.amount : 0), 0);

  const years = [...new Set(payments.map((p) => periodAcademicYear(p.period) ?? 0))].sort((a, b) => b - a);

  return (
    <div>
      <PageHeader title={t.title} subtitle={contractNo ? t.contract(contractNo) : undefined} />

      <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="space-y-10">
          <NextPayment next={next} now={now} ay={ay} yearPaid={yearPaid} yearTotal={yearTotal} locale={locale} />

          {years.map((y) => {
            const rows = payments.filter((p) => (periodAcademicYear(p.period) ?? 0) === y);
            const total = rows.reduce((a, p) => a + p.amount, 0);
            const paid = rows.reduce((a, p) => a + (p.paidAt ? p.amount : 0), 0);
            return (
              <section key={y} aria-labelledby={`year-${y}`}>
                <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 id={`year-${y}`} className="text-[14px] font-semibold tracking-[-0.01em]">
                    {y ? t.yearTitle(academicYearLabel(y)) : t.otherPayments}
                  </h2>
                  {y !== ay && (
                    <span className="text-[13px] text-ink-3 tabular">
                      {t.paidPrefix}
                      {rub(paid)}
                      {t.paidMid}
                      {rub(total)}
                      {t.paidSuffix}
                    </span>
                  )}
                </div>
                <Card className="divide-y divide-line stagger-rows">
                  {rows.map((p) => (
                    <ScheduleRow key={p.id} p={p} now={now} locale={locale} />
                  ))}
                </Card>
              </section>
            );
          })}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold">{t.howToPay}</h2>
            <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-ink-2">
              {t.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-3 shrink-0 font-mono text-ink-3 tabular">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-3">
              {t.deferral(codeName(office.code, locale), office.room, hours)}{" "}
              <a href={`tel:${office.phone.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap text-ink-2 hover:text-ink">
                {office.phone}
              </a>
              .
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold">{t.taxTitle}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{t.taxText}</p>
            <ButtonLink href={taxCertificateHref()} variant="secondary" size="sm" className="mt-4">
              {t.orderCertificate}
            </ButtonLink>
          </Card>
        </aside>
      </Stagger>
    </div>
  );
}

function NextPayment({ next, now, ay, yearPaid, yearTotal, locale }: { next: MyPayment | null; now: Date; ay: number; yearPaid: number; yearTotal: number; locale: Locale }) {
  const t = paymentsMessages[locale];
  const rub = (n: number) => formatRubFor(n, locale, formatRub);
  const yearSummary = yearTotal > 0 && (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px]">
        <span className="text-ink-3">{t.yearTitle(academicYearLabel(ay))}</span>
        <span className="text-ink-2 tabular">
          {t.paidPrefix}
          <span className="font-medium text-ink">{rub(yearPaid)}</span>
          {t.paidMid}
          {rub(yearTotal)}
          {t.paidSuffix}
        </span>
      </div>
      <ProgressBar value={yearPaid} max={yearTotal} tone={yearPaid >= yearTotal ? "success" : "brand"} />
    </div>
  );

  if (!next) {
    return (
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] text-ink-3">{t.nextPayment}</h2>
          <StatusText tone="success">{t.paid}</StatusText>
        </div>
        <p className="mt-4 text-[20px] leading-tight font-semibold tracking-[-0.02em]">{t.noDebt}</p>
        <p className="mt-1.5 text-[13px] text-ink-3">{t.allPaid}</p>
        {yearSummary}
      </Card>
    );
  }

  const state = paymentState(next, now);
  const meta = paymentStateMeta(state, locale);
  const days = state === "overdue" ? Math.max(1, overdueDays(next.dueAt, now)) : diffDays(now, next.dueAt);
  return (
    <Card className={cn("p-5 sm:p-6", state === "overdue" && "border-danger/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] text-ink-3">{t.nextPayment}</h2>
        <StatusText tone={meta.tone}>{meta.label}</StatusText>
      </div>
      <div className="mt-4 text-[34px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap tabular sm:text-[44px]">{rub(next.amount)}</div>
      <div className="mt-2 text-[14px] text-ink-2">{localizePeriod(next.period, locale)}</div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-[13px]">
        <div>
          <dt className="text-ink-3">{t.dueDate}</dt>
          <dd className="mt-0.5 font-medium text-ink tabular">{t.dueBy(formatDateLong(next.dueAt, locale))}</dd>
        </div>
        <div>
          <dt className="text-ink-3">{state === "overdue" ? t.overdue : t.untilDue}</dt>
          <dd className={cn("mt-0.5 font-medium tabular", HINT_TONE[state])}>{days > 0 ? t.days(days) : t.lastDay}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href={`/payments/${next.id}/receipt`}>{t.receipt}</ButtonLink>
      </div>
      {yearSummary}
    </Card>
  );
}

function ScheduleRow({ p, now, locale }: { p: MyPayment; now: Date; locale: Locale }) {
  const t = paymentsMessages[locale];
  const state = paymentState(p, now);
  const meta = paymentStateMeta(state, locale);
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{localizePeriod(p.period, locale)}</div>
        <div className="mt-0.5 text-[13px] text-ink-3 tabular">{t.rowDue(formatDateLong(p.dueAt, locale))}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <StatusText tone={meta.tone}>{p.paidAt ? t.paidOn(formatDateLong(p.paidAt, locale)) : meta.label}</StatusText>
          {p.paidAt && p.receiptNo ? (
            <span className="font-mono text-[12px] text-ink-3">{t.documentNo(p.receiptNo)}</span>
          ) : (
            <span className={cn("text-[12px]", state === "overdue" ? "text-danger" : "text-ink-3")}>{dueHintFor(p, now, locale)}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
        <div className="font-mono text-[14px] font-medium tabular">{formatRubFor(p.amount, locale, formatRub)}</div>
        <Link href={`/payments/${p.id}/receipt`} className="text-[13px] text-brand-fg hover:underline">
          {t.receipt}
        </Link>
      </div>
    </div>
  );
}
