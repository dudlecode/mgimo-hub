import { CalendarPlus } from "lucide-react";
import type { AppointmentStatus } from "@/db/schema";
import { slotRange } from "@/lib/appointments";
import { campusInfo, type Campus } from "@/lib/academic";
import { formatDayMonth, formatWeekday } from "@/lib/time";
import type { Locale } from "@/lib/i18n/config";
import { appointmentsMessages, appointmentStatusLabel, topicLabelFor } from "@/lib/i18n/messages/appointments";
import { Card } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CancelAppointmentButton } from "./cancel-button";
import { codeName } from "@/lib/i18n/translit";

type TicketData = {
  id: string;
  code: string;
  startsAt: Date;
  durationMin: number;
  topic: string;
  comment: string | null;
  status: AppointmentStatus;
  cancelReason: string | null;
  faculty: { code: string; officeRoom: string; campus: Campus };
};

/** Талон на приём: код, время, место и QR. Показывается сразу после записи и по ссылке из уведомления. */
export function Ticket({ a, qr, now, locale = "ru" }: { a: TicketData; qr: string; now: Date; locale?: Locale }) {
  const t = appointmentsMessages[locale];
  const active = a.status === "booked" && a.startsAt.getTime() > now.getTime();
  const weekday = formatWeekday(a.startsAt, locale);
  const building = campusInfo(a.faculty.campus, locale).building;
  return (
    <Card>
      <div className="flex items-start justify-between gap-5 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
            <span>{t.ticketTitle}</span>
            {a.status !== "booked" && <StatusText tone={a.status === "done" ? "success" : a.status === "no_show" ? "warning" : "neutral"}>{appointmentStatusLabel(a.status, locale)}</StatusText>}
          </div>
          <div className="mt-2 font-mono text-[36px] leading-none font-semibold tracking-[0.02em] tabular sm:text-[44px]">{a.code}</div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-3">
            {active ? t.activeText : a.cancelReason ? t.officeCancelled(a.cancelReason) : t.inactive}
          </p>
        </div>
        <div
          className="size-[96px] shrink-0 rounded-[8px] bg-white p-2 sm:size-[112px]"
          role="img"
          aria-label={t.qrLabel(a.code)}
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      </div>

      <dl className="grid grid-cols-2 border-t border-line text-[13px] sm:grid-cols-4">
        <div className="border-r border-b border-line px-5 py-4 sm:border-b-0">
          <dt className="text-ink-3">{t.date}</dt>
          <dd className="mt-1 font-medium">
            {formatDayMonth(a.startsAt, locale)}, <span className="text-ink-2">{weekday}</span>
          </dd>
        </div>
        <div className="border-b border-line px-5 py-4 sm:border-r sm:border-b-0">
          <dt className="text-ink-3">{t.time}</dt>
          <dd className="mt-1 font-mono font-medium tabular">{slotRange(a.startsAt, a.durationMin)}</dd>
        </div>
        <div className="border-r border-line px-5 py-4">
          <dt className="text-ink-3">{t.where}</dt>
          <dd className="mt-1 font-medium">
            {t.roomStart} <span className="font-mono">{a.faculty.officeRoom}</span>
            <span className="block text-[12px] font-normal text-ink-3">{t.officeLine(codeName(a.faculty.code, locale), building)}</span>
          </dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-ink-3">{t.topic}</dt>
          <dd className="mt-1 font-medium">{topicLabelFor(a.topic, locale)}</dd>
        </div>
      </dl>

      {a.comment && (
        <p className="border-t border-line px-5 py-4 text-[13px] text-ink-2">
          <span className="text-ink-3">{t.comment}</span>
          {a.comment}
        </p>
      )}

      {active && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
          <ButtonLink href={`/api/appointments/${a.id}/ics`} prefetch={false} variant="secondary" size="sm">
            <CalendarPlus className="size-3.5 text-ink-3" aria-hidden />
            {t.addToCalendar}
          </ButtonLink>
          <CancelAppointmentButton id={a.id} label={t.cancelAppointment} />
        </div>
      )}
    </Card>
  );
}
