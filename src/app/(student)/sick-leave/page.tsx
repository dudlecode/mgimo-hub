import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { getMyOpenSickLeave, getMySickImpact, listMySickLeaves, type MySickLeave, type SickImpact } from "@/lib/data/sick-leave";
import { earliestStartKey, periodDays, SICK_DEADLINE_GRACE_DAYS, todayKeyMsk } from "@/lib/sick-leave";
import { formatDayMonthShort, mskParts } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { dayLabelFor, periodLabelFor, sickLeaveMessages, sickStatus } from "@/lib/i18n/messages/sick-leave";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { OpenSickForm } from "./open-form";
import { CloseSickForm } from "./close-form";
import { ImpactRow, type ImpactRowData } from "./impact-row";
import { personName } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: sickLeaveMessages[await getLocale()].title };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Две колонки одной высоты: слева действие, справа пояснение */
const ROW = "grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-6";

/** «4, 5 и 6 нояб» или «4 нояб и ещё 7» / 4, 5, 6 Nov */
function lessonDays(dates: Date[], locale: Locale): string | null {
  if (!dates.length) return null;
  const days: string[] = [];
  for (const d of dates) {
    const label = formatDayMonthShort(d, locale);
    if (days[days.length - 1] !== label) days.push(label);
  }
  const shown = days.slice(0, 6);
  // одинаковый месяц пишем один раз: «4, 5, 6 нояб»
  const sameMonth = new Set(dates.map((d) => mskParts(d).m)).size === 1;
  const text = sameMonth && shown.length > 1 ? `${shown.map((s) => s.split(" ")[0]).join(", ")} ${shown[0].split(" ").slice(1).join(" ")}` : shown.join(", ");
  return days.length > shown.length ? `${text}${sickLeaveMessages[locale].andMore(days.length - shown.length)}` : text;
}

export default async function SickLeavePage() {
  const now = new Date();
  const today = todayKeyMsk(now);
  const locale = await getLocale();
  const t = sickLeaveMessages[locale];
  const [open, history] = await Promise.all([getMyOpenSickLeave(), listMySickLeaves()]);
  // Названия дисциплин на языке интерфейса; письмо преподавателю слой данных всегда готовит по-русски
  const impact = open ? await getMySickImpact(open, locale) : null;
  const past = history.filter((h) => h.status !== "open");

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {open && impact ? (
        <>
          {/* Ряд: текущий больничный и закрытие, одной высоты */}
          <div className={ROW}>
            <section className="flex flex-col">
              <SectionTitle>{t.now}</SectionTitle>
              <Card className="flex flex-1 flex-col p-6 sm:p-7">
                <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">{t.onLeaveSince(dayLabelFor(open.startsOn, locale))}</h2>
                <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-ink-2">
                  {open.endsOn ? t.expectedUntil(dayLabelFor(open.endsOn, locale)) : ""}
                  {t.officeKnows}
                </p>
                <ButtonLink href="#close" size="sm" variant="secondary" className="mt-5 self-start lg:hidden">
                  {t.recoveredClose}
                </ButtonLink>
              </Card>
            </section>
            <section id="close" className="flex scroll-mt-20 flex-col">
              <SectionTitle>{t.recovered}</SectionTitle>
              <Card className="flex-1 p-6 sm:p-7">
                <p className="mb-5 text-[13px] leading-relaxed text-ink-3">{t.closeText}</p>
                <CloseSickForm id={open.id} startsOn={open.startsOn} today={today} />
              </Card>
            </section>
          </div>
          <div className="mt-12">
            <ImpactSection startsOn={open.startsOn} impact={impact} locale={locale} />
          </div>
        </>
      ) : (
        <div className={ROW}>
          <section className="flex flex-col">
            <SectionTitle>{t.gotSick}</SectionTitle>
            <Card className="flex-1 p-6 sm:p-8">
              <OpenSickForm today={today} earliest={earliestStartKey(now)} />
            </Card>
          </section>
          <HowItWorks locale={locale} />
        </div>
      )}

      <History items={past} locale={locale} />
    </div>
  );
}

function ImpactSection({ startsOn, impact, locale }: { startsOn: string; impact: SickImpact; locale: Locale }) {
  const t = sickLeaveMessages[locale];
  const rows: ImpactRowData[] = impact.courses.map((c) => ({
    courseId: c.courseId,
    title: c.title,
    teacher: personName(c.teacher, locale),
    lessonsCount: c.lessons.length,
    lessonsLabel: lessonDays(
      c.lessons.map((l) => l.startsAt),
      locale,
    ),
    assessments: c.assessments.map((a) => ({ id: a.id, title: a.title, due: formatDayMonthShort(a.dueAt, locale) })),
  }));
  const works = impact.courses.reduce((n, c) => n + c.assessments.length, 0) + impact.deadlines.length;
  const period = periodLabelFor(startsOn, impact.untilKey, locale);

  return (
    <section>
      <SectionTitle>{t.affects}</SectionTitle>
      <p className="-mt-1.5 mb-4 text-[13px] leading-relaxed text-ink-3">{t.impact(cap(period), impact.lessonsCount, works, SICK_DEADLINE_GRACE_DAYS)}</p>
      {rows.length ? (
        <Card className="divide-y divide-line stagger-rows">
          {rows.map((r) => (
            <ImpactRow key={r.courseId} row={r} />
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState icon={CalendarCheck} title={t.noImpactTitle} text={t.noImpactText} />
        </Card>
      )}

      {impact.deadlines.length > 0 && (
        <div className="mt-8">
          <SectionTitle count={impact.deadlines.length}>{t.deanDeadlines}</SectionTitle>
          <Card className="divide-y divide-line stagger-rows">
            {impact.deadlines.map((d) => (
              <div key={d.id} className="flex items-baseline gap-3 px-5 py-4">
                <span className="w-[68px] shrink-0 font-mono text-[12px] font-medium text-warning tabular">{formatDayMonthShort(d.dueAt, locale)}</span>
                <div className="min-w-0" lang="ru">
                  <div className="text-[14px] leading-5">{d.title}</div>
                  {d.subtitle && <div className="mt-0.5 text-[12px] text-ink-3">{d.subtitle}</div>}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </section>
  );
}

function HowItWorks({ locale }: { locale: Locale }) {
  const { steps, how } = sickLeaveMessages[locale];
  return (
    <section className="flex flex-col">
      <SectionTitle>{how}</SectionTitle>
      <Card className="flex flex-1 flex-col divide-y divide-line">
        {steps.map((s, i) => (
          <div key={s.t} className="flex flex-1 gap-3 px-6 py-5">
            <span className="w-4 shrink-0 font-mono text-[13px] leading-5 text-ink-3 tabular">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-[14px] leading-5 font-medium">{s.t}</div>
              <div className="mt-0.5 text-[13px] leading-5 text-ink-3">{s.d}</div>
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

function History({ items, locale }: { items: MySickLeave[]; locale: Locale }) {
  if (!items.length) return null;
  const t = sickLeaveMessages[locale];
  return (
    <section className="mt-12">
      <SectionTitle count={items.length}>{t.past}</SectionTitle>
      <Card className="divide-y divide-line stagger-rows">
        {items.map((h) => {
          const meta = sickStatus(h.status, locale);
          const days = h.endsOn ? periodDays(h.startsOn, h.endsOn) : 0;
          const file = h.files[0];
          return (
            <div key={h.id} className="px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[14px] font-medium">{cap(periodLabelFor(h.startsOn, h.endsOn, locale))}</span>
                <StatusText tone={meta.tone}>{meta.label}</StatusText>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-ink-3">
                {days > 0 && <span className="tabular">{t.days(days)}</span>}
                {file ? (
                  <a href={`/api/sick-leave/files/${file.id}`} target="_blank" rel="noopener noreferrer" className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink">
                    {t.certificate}
                  </a>
                ) : (
                  <span>{t.noCertificate}</span>
                )}
                {h.status === "submitted" && <span>{t.checking}</span>}
              </div>
              {h.status === "rejected" && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                  {h.reviewNote ? <span lang="ru">{t.reason(h.reviewNote.replace(/[.!\s]+$/, ""))}</span> : ""}
                  {t.reopen}
                </p>
              )}
            </div>
          );
        })}
      </Card>
    </section>
  );
}
