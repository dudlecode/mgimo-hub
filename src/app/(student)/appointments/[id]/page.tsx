import type { Metadata } from "next";
import { getMyAppointment } from "@/lib/data/appointments";
import { qrSvg } from "@/lib/data/documents";
import { Crumbs, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Ticket } from "../ticket";
import { getLocale } from "@/lib/i18n/server";
import { appointmentsMessages } from "@/lib/i18n/messages/appointments";
import { shellMessages } from "@/lib/i18n/messages/shell";

export async function generateMetadata(): Promise<Metadata> {
  return { title: appointmentsMessages[await getLocale()].ticketTitle };
}

// Без loading.tsx в этом сегменте: notFound() должен вернуть настоящий HTTP 404, а не 200 со стримингом.
export default async function AppointmentTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ booked?: string | string[] }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await getMyAppointment(id); // только своя запись, иначе 404
  const qr = await qrSvg(`MGIMO-HUB-APPOINTMENT:${a.code}`);
  const now = new Date();
  const fresh = sp.booked === "1" && a.status === "booked";
  const locale = await getLocale();
  const t = appointmentsMessages[locale];

  return (
    <div className="max-w-[720px]">
      <Crumbs items={[{ href: "/appointments", label: t.crumbsRoot }, { label: t.ticketCrumb(a.code) }]} label={shellMessages[locale].breadcrumbs} />
      <PageHeader
        title={fresh ? t.booked : t.ticketTitle}
        subtitle={fresh ? t.bookedSub : undefined}
        className="mb-8"
      />
      <Ticket a={a} qr={qr} now={now} locale={locale} />
      <div className="mt-6">
        <ButtonLink href="/appointments" variant="secondary" size="sm">
          {t.allMine}
        </ButtonLink>
      </div>
    </div>
  );
}
