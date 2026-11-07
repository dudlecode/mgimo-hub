import type { Metadata } from "next";
import Link from "next/link";
import { Search, Inbox } from "lucide-react";
import { listScopedRequests } from "@/lib/data/staff";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { StaffRequestRow } from "../row";
import { cn } from "@/lib/utils";
import { StaffSectionTabs } from "@/components/shell/staff-section-tabs";

export const metadata: Metadata = { title: "Заявки" };

const FILTERS = [
  { k: "", label: "Открытые" },
  { k: "new", label: "Новые" },
  { k: "work", label: "В работе" },
  { k: "waiting", label: "Ждут студента" },
  { k: "overdue", label: "Просрочены" },
  { k: "ready", label: "Готовы" },
  { k: "closed", label: "Закрытые" },
];

export default async function StaffRequestsPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const { filter = "", q = "" } = await searchParams;
  const rows = await listScopedRequests({ filter: filter || undefined, q: q || undefined });
  const now = new Date();
  return (
    <div >
      <StaffSectionTabs section="requests" current="/staff/requests" />
      <PageHeader title="Заявки студентов" subtitle={`${rows.length} в списке`} />
      <form className="relative mb-3" role="search">
        {filter && <input type="hidden" name="filter" value={filter} />}
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          name="q"
          defaultValue={q}
          placeholder="Номер заявки, фамилия или группа"
          aria-label="Поиск заявок"
          className="h-12 w-full rounded-ctl border border-line bg-surface pr-4 pl-11 text-[15px] outline-none placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/12"
        />
      </form>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <Link
            key={f.k}
            href={f.k ? `/staff/requests?filter=${f.k}` : "/staff/requests"}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium", filter === f.k ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <Card className="p-1.5">
        {rows.length ? rows.map((r) => <StaffRequestRow key={r.id} r={r} now={now} />) : <EmptyState icon={Inbox} title="Ничего не найдено" text={q ? `По запросу «${q}» заявок нет.` : "В этом статусе заявок нет."} />}
      </Card>
    </div>
  );
}
