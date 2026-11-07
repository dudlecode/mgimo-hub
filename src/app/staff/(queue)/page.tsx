import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCog, CheckCircle2, ChevronRight, Megaphone } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { getQueueStats, listScopedRequests } from "@/lib/data/staff";
import { getScopedAppointmentStats } from "@/lib/data/appointments";
import { getSickLeaveStats } from "@/lib/data/sick-leave";
import { getStaffPayments } from "@/lib/data/payments";
import { getRetakeBoard } from "@/lib/data/retakes";
import { formatRub } from "@/lib/payments";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { greeting } from "@/lib/time";
import { CountUp } from "@/components/motion/count-up";
import { Rise } from "@/components/motion/stagger";
import { QueueSummary } from "../queue-summary";
import { StaffRequestRow } from "../requests/row";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Очередь" };

/*
 * Главная сотрудника: счётчики очереди, затем один ряд из двух колонок одной высоты.
 *   слева  заявки, которые требуют внимания
 *   справа сводка от Атташе и «Сегодня в офисе» (приём, больничные, оплата, пересдачи)
 * Быстрые действия стоят кнопками в шапке, как на главной студента.
 */
export default async function StaffHome() {
  const { staff } = await requireStaff();
  const now = new Date();
  const [stats, attention, appts, sick, pay, retakes] = await Promise.all([
    getQueueStats(),
    listScopedRequests({ limit: 6 }),
    getScopedAppointmentStats(now),
    getSickLeaveStats(),
    getStaffPayments("overdue"),
    getRetakeBoard(),
  ]);
  const tiles = [
    { label: "Новые", value: stats.by.submitted ?? 0, href: "/staff/requests?filter=new", tone: "brand" },
    { label: "В работе", value: (stats.by.in_review ?? 0) + (stats.by.in_progress ?? 0), href: "/staff/requests?filter=work", tone: "info" },
    { label: "Ждут студента", value: stats.by.needs_info ?? 0, href: "/staff/requests?filter=waiting", tone: "warning" },
    { label: "Просрочены", value: stats.overdue, href: "/staff/requests?filter=overdue", tone: "danger" },
    { label: "Готово сегодня", value: stats.readyToday, href: "/staff/requests?filter=ready", tone: "success" },
  ] as const;

  const today = [
    { label: "Приём", value: appts.waiting, hint: appts.total ? `ждут из ${appts.total} записей сегодня` : "записей на сегодня нет", href: "/staff/appointments", alert: false },
    { label: "Больничные", value: sick.review, hint: sick.review ? "справок ждут проверки" : `болеют сейчас: ${sick.open}`, href: "/staff/sick-leaves", alert: sick.review > 0 },
    {
      label: "Оплата",
      value: pay.stats.overdueCount,
      hint: pay.stats.overdueCount ? `просрочено на ${formatRub(pay.stats.overdueSum)}` : "просрочек нет",
      href: "/staff/payments",
      alert: pay.stats.overdueCount > 0,
    },
    { label: "Пересдачи", value: retakes.stats.noDate, hint: retakes.stats.noDate ? "долгов без даты пересдачи" : `назначено: ${retakes.stats.scheduled}`, href: "/staff/retakes", alert: false },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Студенческий офис, все факультеты"}
        title={`${greeting(now)}, ${staff.firstName}`}
        subtitle="Заявки студентов, приём, объявления и изменения расписания в одном окне"
        actions={
          <>
            <Link href="/staff/announcements" className={buttonClass("secondary", "sm")}>
              <Megaphone className="size-3.5 text-ink-3" aria-hidden />
              Объявление
            </Link>
            <Link href="/staff/schedule" className={buttonClass("secondary", "sm")}>
              <CalendarCog className="size-3.5 text-ink-3" aria-hidden />
              Изменить расписание
            </Link>
          </>
        }
      />

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t, i) => (
          <Rise key={t.label} i={i} className={cn(i === tiles.length - 1 && "col-span-2 sm:col-span-1")}>
            <Link
              href={t.href}
              aria-label={`${t.label}: ${t.value}`}
              className={cn(
                "block h-full rounded-card border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-1",
                t.tone === "danger" && t.value > 0 && "border-danger/40",
              )}
            >
              <div className="text-[13px] text-ink-3">{t.label}</div>
              <div aria-hidden className={cn("mt-3 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular", t.tone === "danger" && t.value > 0 && "text-danger")}>
                <CountUp value={t.value} />
              </div>
            </Link>
          </Rise>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)] lg:gap-6">
        <Rise i={5} className="flex flex-col">
          <section className="flex h-full flex-col">
            <SectionTitle action="Все заявки" href="/staff/requests">
              Требуют внимания
            </SectionTitle>
            <Card className="flex-1 p-1.5">
              {attention.length ? attention.map((r) => <StaffRequestRow key={r.id} r={r} now={now} />) : <EmptyState icon={CheckCircle2} title="Очередь пуста" text="Все заявки обработаны." />}
            </Card>
          </section>
        </Rise>

        <Rise i={6} className="flex flex-col gap-10">
          <section>
            <SectionTitle>Сводка от Атташе</SectionTitle>
            <QueueSummary />
          </section>
          <section className="flex flex-1 flex-col">
            <SectionTitle>Сегодня в офисе</SectionTitle>
            <Card className="flex flex-1 flex-col divide-y divide-line stagger-rows">
              {today.map((row) => (
                <Link key={row.label} href={row.href} className="flex flex-1 items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-1">
                  <span className={cn("w-10 shrink-0 text-[22px] leading-none font-semibold tracking-[-0.03em] tabular", row.alert ? "text-warning" : "text-ink")}>{row.value}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{row.label}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">{row.hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                </Link>
              ))}
            </Card>
          </section>
        </Rise>
      </div>
    </div>
  );
}
