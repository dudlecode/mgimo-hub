import type { Metadata } from "next";
import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { getSickLeaveStats, listScopedSickLeaves, type ScopedSickLeave, type SickFilter } from "@/lib/data/sick-leave";
import { dayLabel, periodDays, periodLabel, SICK_STATUS, todayKeyMsk } from "@/lib/sick-leave";
import { formatDayMonth, plural } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { CountUp } from "@/components/motion/count-up";
import { SegmentedLinks } from "@/components/motion/segmented-links";
import { ReviewActions } from "./review-actions";
import { StaffSectionTabs } from "@/components/shell/staff-section-tabs";

export const metadata: Metadata = { title: "Больничные" };

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const FILTERS: SickFilter[] = ["review", "open", "all"];

export default async function StaffSickLeavesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const filter: SickFilter = FILTERS.includes(sp.filter as SickFilter) ? (sp.filter as SickFilter) : "review";
  const [stats, rows] = await Promise.all([getSickLeaveStats(), listScopedSickLeaves(filter)]);
  const today = todayKeyMsk();

  const tiles = [
    { label: "На проверке", value: stats.review, href: "/staff/sick-leaves" },
    { label: "Болеют сейчас", value: stats.open, href: "/staff/sick-leaves?filter=open" },
    { label: "Засчитано за 30 дней", value: stats.approved30, href: "/staff/sick-leaves?filter=all" },
  ];

  return (
    <div>
      <StaffSectionTabs section="requests" current="/staff/sick-leaves" />
      <PageHeader
        eyebrow={staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Студенческий офис · все факультеты"}
        title="Больничные"
        subtitle="Студент сообщает о болезни в кабинете, после выздоровления прикладывает справку"
      />

      <div className="mb-8 grid grid-cols-3 gap-2.5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="min-w-0 rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-1 sm:p-5">
            <div className="text-[12px] leading-tight text-ink-3 sm:text-[13px]">{t.label}</div>
            <div className="mt-3 text-[28px] leading-none font-semibold tracking-[-0.03em] tabular sm:text-[32px]">
              <CountUp value={t.value} />
            </div>
          </Link>
        ))}
      </div>

      <div className="scrollbar-none -mx-5 mb-4 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <SegmentedLinks
        id="sick-leaves"
        items={[
          { href: "/staff/sick-leaves", label: "На проверке", active: filter === "review", count: stats.review },
          { href: "/staff/sick-leaves?filter=open", label: "Болеют сейчас", active: filter === "open", count: stats.open },
          { href: "/staff/sick-leaves?filter=all", label: "Все", active: filter === "all" },
        ]}
        />
      </div>

      {rows.length ? (
        <Card className="divide-y divide-line stagger-rows">
          {rows.map((r) => (
            <SickRow key={r.id} r={r} today={today} />
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={HeartPulse}
            title={filter === "review" ? "Проверять нечего" : filter === "open" ? "Сейчас никто не болеет" : "Больничных пока нет"}
            text={filter === "review" ? "Когда студент приложит справку, она появится здесь." : filter === "open" ? "Студенты, которые сообщили о болезни, появятся здесь сразу." : "Здесь будут все больничные студентов вашей области."}
          />
        </Card>
      )}
    </div>
  );
}

function SickRow({ r, today }: { r: ScopedSickLeave; today: string }) {
  const meta = SICK_STATUS[r.status];
  const open = r.status === "open";
  const file = r.files[0];
  const period = open ? `с ${dayLabel(r.startsOn)}${r.endsOn ? `, примерно до ${dayLabel(r.endsOn)}` : ""}` : periodLabel(r.startsOn, r.endsOn);
  const days = periodDays(r.startsOn, open ? today : (r.endsOn ?? today));

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/staff/students/${r.studentId}`} prefetch={false} className="block text-[14px] leading-5 font-medium hover:underline">
            {fullName(r)}
          </Link>
          <div className="mt-0.5 text-[13px] leading-5 text-ink-3">
            <span className="font-mono">{r.groupCode}</span> · {r.facultyCode}
          </div>
        </div>
        <StatusText tone={meta.tone} className="mt-0.5">
          {meta.label}
        </StatusText>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] leading-5">
        <span className="text-ink">{cap(period)}</span>
        <span className="text-ink-3 tabular">
          {days} {plural(days, "день", "дня", "дней")}
          {", "}
          пропущено пар: {r.missed}
        </span>
      </div>

      {r.comment && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">«{r.comment}»</p>}

      <div className="mt-2 text-[13px] leading-5">
        {file ? (
          <a href={`/api/sick-leave/files/${file.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-fg hover:underline">
            Открыть справку
          </a>
        ) : (
          <span className="text-ink-3">{open ? "Справку приложит после выздоровления" : "Справки нет"}</span>
        )}
      </div>

      {r.status === "submitted" && <ReviewActions id={r.id} />}
      {(r.status === "approved" || r.status === "rejected") && (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          Решение{r.reviewedAt ? ` ${formatDayMonth(r.reviewedAt)}` : ""}
          {r.reviewerLast ? `, ${r.reviewerFirst} ${r.reviewerLast}` : ""}
          {r.status === "rejected" && r.reviewNote ? `. Причина: ${r.reviewNote.replace(/[.!\s]+$/, "")}` : ""}
        </p>
      )}
    </div>
  );
}
