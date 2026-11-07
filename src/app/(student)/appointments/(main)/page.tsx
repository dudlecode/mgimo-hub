import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireStudent } from "@/lib/auth/dal";
import { getMyBookingOptions, listMyAppointments } from "@/lib/data/appointments";
import { slotRange } from "@/lib/appointments";
import { campusInfo } from "@/lib/academic";
import { formatDayMonth, mskParts, relativeDayLabel, weekdaysShort } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { appointmentsMessages, appointmentStatusLabel, topicLabelFor } from "@/lib/i18n/messages/appointments";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { StatusText, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { BookingWizard } from "../booking-wizard";
import { CancelAppointmentButton } from "../cancel-button";
import { OfficeHours } from "@/components/feature/office-hours";
import { codeName } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: appointmentsMessages[await getLocale()].title };
}

const PAST_TONE: Record<string, BadgeTone> = { done: "success", no_show: "warning", cancelled: "neutral", booked: "neutral" };

function DateCell({ d, locale }: { d: Date; locale: Locale }) {
  const p = mskParts(d);
  return (
    <div className="w-11 shrink-0 text-center leading-tight">
      <div className="text-[12px] text-ink-3">{weekdaysShort(locale)[p.wd]}</div>
      <div className="text-[18px] font-semibold tabular">{p.d}</div>
    </div>
  );
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ cancelled?: string | string[] }> }) {
  const sp = await searchParams;
  const now = new Date();
  const { faculty } = await requireStudent();
  const locale = await getLocale();
  const t = appointmentsMessages[locale];
  const [options, mine] = await Promise.all([getMyBookingOptions(now), listMyAppointments(now)]);
  const limitReached = options.active >= options.limit;
  const campus = campusInfo(faculty.campus, locale);

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle(codeName(faculty.code, locale), faculty.officeRoom)} />

      {sp.cancelled === "1" && (
        <p className="mb-6 rounded-ctl bg-surface-2 px-4 py-3 text-[14px] text-ink-2" role="status">
          {t.cancelled}
        </p>
      )}

      {/* Учебный офис: три равные ячейки в одну строку */}
      <Card className="mb-12 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-3">
        {(
          [
            [
              t.where,
              <>
                {t.roomStart} <span className="font-mono">{faculty.officeRoom}</span>, {campus.building}
                <span className="block text-[13px] text-ink-3">{campus.address}</span>
              </>,
            ],
            [t.hours, <OfficeHours key="hours" value={faculty.officeHours} locale={locale} now={now} />],
            [
              t.how,
              <span key="how" className="text-[13px] leading-relaxed text-ink-2">
                {t.howText(options.days.length)}{" "}
                <Link href="/requests/new" className="text-brand-fg hover:underline">
                  {t.howLink}
                </Link>
                .
              </span>,
            ],
          ] as [string, React.ReactNode][]
        ).map(([label, value]) => (
          <div key={label} className="border-line px-5 py-4 sm:px-6 sm:py-5 [&:not(:last-child)]:border-b lg:[&:not(:last-child)]:border-r lg:[&:not(:last-child)]:border-b-0">
            <div className="text-[12px] text-ink-3">{label}</div>
            <div className="mt-1.5 text-[14px]">{value}</div>
          </div>
        ))}
      </Card>

      {mine.upcoming.length > 0 && (
        <section className="mb-12">
          <SectionTitle count={mine.upcoming.length}>{t.upcoming}</SectionTitle>
          <Card className="divide-y divide-line stagger-rows">
            {mine.upcoming.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <DateCell d={a.startsAt} locale={locale} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">
                      <span className="font-mono tabular">{slotRange(a.startsAt, a.durationMin)}</span>
                      <span className="text-ink-3">, {relativeDayLabel(a.startsAt, now, locale)}</span>
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-3">
                      {topicLabelFor(a.topic, locale)}, {t.room} <span className="font-mono">{a.faculty.officeRoom}</span>, {t.ticketWord} <span className="font-mono text-ink-2">{a.code}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 pl-12 sm:pl-0">
                  <Link href={`/appointments/${a.id}`} className={buttonClass("ghost", "sm")}>
                    {t.ticket}
                  </Link>
                  <CancelAppointmentButton id={a.id} />
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>{t.book}</SectionTitle>
        {limitReached ? (
          <Card>
            <EmptyState icon={CalendarClock} title={t.limitTitle(options.active)} text={t.limitText} />
          </Card>
        ) : (
          <BookingWizard days={options.days} officeCode={codeName(faculty.code, locale)} officeRoom={faculty.officeRoom} />
        )}
      </section>

      {mine.past.length > 0 && (
        <section className="mt-12">
          <SectionTitle count={mine.past.length}>{t.past}</SectionTitle>
          <Card className="divide-y divide-line stagger-rows">
            {mine.past.map((a) => (
              <div key={a.id} className="flex items-start gap-4 px-5 py-4">
                <DateCell d={a.startsAt} locale={locale} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[14px]">
                      <span className="font-mono tabular">{slotRange(a.startsAt, a.durationMin)}</span>
                      <span className="text-ink-3">, {formatDayMonth(a.startsAt, locale)}</span>
                    </span>
                    <StatusText tone={PAST_TONE[a.status]}>{a.status === "booked" ? t.pastBooked : appointmentStatusLabel(a.status, locale)}</StatusText>
                  </div>
                  <div className="mt-0.5 text-[13px] text-ink-3">{topicLabelFor(a.topic, locale)}</div>
                  {a.status === "cancelled" && <div className="mt-1 text-[13px] text-ink-2">{a.cancelReason ? t.cancelledByOffice(a.cancelReason) : t.cancelledByYou}</div>}
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
