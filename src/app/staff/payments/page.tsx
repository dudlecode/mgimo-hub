import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { getStaffPayments, type StaffPaymentFilter, type StaffPaymentRow } from "@/lib/data/payments";
import { canRemind, formatRub, overdueDays, PAYMENT_STATE_META, REMIND_COOLDOWN_MS } from "@/lib/payments";
import { dayKey, diffDays, formatDateLong, formatDayMonth, mskParts, plural, relativeTime } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { CountUp } from "@/components/motion/count-up";
import { SegmentedLinks } from "@/components/motion/segmented-links";
import { cn, fullName } from "@/lib/utils";
import { PaymentRow, RemindAllButton } from "./payment-row";
import { StaffSectionTabs } from "@/components/shell/staff-section-tabs";

export const metadata: Metadata = { title: "Оплата" };

const FILTERS: { k: StaffPaymentFilter; label: string; href: string }[] = [
  { k: "overdue", label: "Просрочено", href: "/staff/payments" },
  { k: "soon", label: "Скоро срок", href: "/staff/payments?filter=soon" },
  { k: "all", label: "Все", href: "/staff/payments?filter=all" },
];

const EMPTY: Record<StaffPaymentFilter, { title: string; text: string }> = {
  overdue: { title: "Просроченных платежей нет", text: "Все студенты на контракте в вашей области платят в срок." },
  soon: { title: "В ближайшие 14 дней сроков нет", text: "Когда у студента подойдёт срок оплаты, он появится в этом списке." },
  all: { title: "Студентов на контракте нет", text: "В вашей области нет студентов, которые учатся по договору." },
};

export default async function StaffPaymentsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: raw = "" } = await searchParams;
  const filter: StaffPaymentFilter = raw === "soon" || raw === "all" ? raw : "overdue";
  const { staff } = await requireStaff();
  const { rows, stats, remindable } = await getStaffPayments(filter);
  const now = new Date();
  const today = dayKey(now);
  const scopeLabel = staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Все факультеты";
  const counts: Record<StaffPaymentFilter, number> = { overdue: stats.overdueCount, soon: stats.soonCount, all: stats.students };

  return (
    <div>
      <StaffSectionTabs section="students" current="/staff/payments" />
      <PageHeader eyebrow={`${scopeLabel} · ${stats.semLabel}`} title="Оплата обучения" subtitle="Студенты на контракте: сроки, просрочки и напоминания" />

      <div className="mb-6 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <div className={cn("rounded-card border border-line bg-surface p-4 sm:p-5", stats.overdueCount > 0 && "border-danger/40")}>
          <div className="text-[13px] text-ink-3">Просрочено</div>
          <div className="mt-3 flex h-8 items-end gap-1.5">
            <span className={cn("text-[28px] leading-none font-semibold tracking-[-0.03em] tabular", stats.overdueCount > 0 && "text-danger")}>
              <CountUp value={stats.overdueCount} />
            </span>
            <span className="text-[13px] text-ink-3">{plural(stats.overdueCount, "платёж", "платежа", "платежей")}</span>
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="text-[13px] text-ink-3">Сумма просрочки</div>
          <div className="mt-3 flex h-8 items-end">
            <span className="text-[22px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap tabular sm:text-[28px]">{formatRub(stats.overdueSum)}</span>
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="text-[13px] text-ink-3">Срок в ближайшие 14 дней</div>
          <div className="mt-3 flex h-8 items-end gap-1.5">
            <span className="text-[28px] leading-none font-semibold tracking-[-0.03em] tabular">
              <CountUp value={stats.soonCount} />
            </span>
            <span className="truncate text-[13px] text-ink-3 tabular">{stats.soonCount ? `на ${formatRub(stats.soonSum)}` : "платежей"}</span>
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="text-[13px] text-ink-3">Оплачено за семестр</div>
          <div className="mt-3 flex h-8 items-end gap-1.5">
            <span className="text-[28px] leading-none font-semibold tracking-[-0.03em] tabular">
              <CountUp value={stats.paidShare} suffix="%" />
            </span>
            <span className="text-[13px] text-ink-3 tabular">
              {stats.currentPaid} из {stats.currentTotal}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="scrollbar-none -mx-5 w-[calc(100%+2.5rem)] overflow-x-auto px-5 sm:mx-0 sm:w-auto sm:px-0">
          <SegmentedLinks id="staff-payments" items={FILTERS.map((f) => ({ href: f.href, label: f.label, active: filter === f.k, count: counts[f.k] }))} />
        </div>
        {filter !== "all" && rows.length > 0 && <RemindAllButton filter={filter} count={remindable} />}
      </div>

      <Card className="divide-y divide-line stagger-rows">
        {rows.length ? (
          rows.map((r) => (
            <PaymentRow key={r.id} id={r.id} name={fullName(r)} unpaid={!r.paidAt} remindBlocked={remindBlocked(r, now)} today={today}>
              <RowInfo r={r} now={now} />
            </PaymentRow>
          ))
        ) : (
          <EmptyState icon={filter === "all" ? Users : CircleCheck} title={EMPTY[filter].title} text={EMPTY[filter].text} />
        )}
      </Card>

      <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-ink-3">
        Напоминание приходит студенту важным уведомлением со ссылкой на квитанцию, по одному платежу не чаще раза в сутки. Оплата через кабинет не принимается: отметку об оплате ставит учебный офис по платёжному документу.
      </p>
    </div>
  );
}

function remindBlocked(r: StaffPaymentRow, now: Date): string | null {
  if (!r.remindedAt || canRemind(r.remindedAt, now)) return null;
  return `Уже напоминали ${remindedAgo(r.remindedAt, now)}, повторить можно ${relativeTime(new Date(r.remindedAt.getTime() + REMIND_COOLDOWN_MS), now)}`;
}

function remindedAgo(d: Date, now: Date) {
  const ago = relativeTime(d, now);
  return ago === "сейчас" ? "только что" : ago;
}

function shortDate(d: Date, now: Date) {
  return mskParts(d).y === mskParts(now).y ? formatDayMonth(d) : formatDateLong(d);
}

function RowInfo({ r, now }: { r: StaffPaymentRow; now: Date }) {
  const meta = PAYMENT_STATE_META[r.state];
  let status: string;
  if (r.state === "paid") status = `Оплачено ${r.paidAt ? shortDate(r.paidAt, now) : ""}`.trim();
  else if (r.state === "overdue") {
    const d = Math.max(1, overdueDays(r.dueAt, now));
    status = `Просрочка ${d} ${plural(d, "день", "дня", "дней")}`;
  } else {
    const d = diffDays(now, r.dueAt);
    status = d <= 0 ? "Срок сегодня" : `${meta.label}, через ${d} ${plural(d, "день", "дня", "дней")}`;
  }
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <Link href={`/staff/students/${r.studentId}`} prefetch={false} className="text-[14px] font-semibold hover:underline">
          {fullName(r)}
        </Link>
        <span className="font-mono text-[12px] text-ink-3">{r.groupCode}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
        <span>{r.period}</span>
        <span className="font-mono font-medium text-ink tabular">{formatRub(r.amount)}</span>
        <span className="tabular">срок {shortDate(r.dueAt, now)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <StatusText tone={meta.tone}>{status}</StatusText>
        {r.state === "paid" ? (
          r.receiptNo && <span className="font-mono text-[12px] text-ink-3">документ № {r.receiptNo}</span>
        ) : (
          <span className="text-[12px] text-ink-3">{r.remindedAt ? `напоминали ${remindedAgo(r.remindedAt, now)}` : "не напоминали"}</span>
        )}
      </div>
    </>
  );
}
