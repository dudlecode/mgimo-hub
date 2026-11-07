import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { listScopedGroups } from "@/lib/data/staff";
import { listScopedStudentDirectory, StudentDirectoryQuery, type DirectoryStudent } from "@/lib/data/students";
import { RISK_LEVEL_META } from "@/lib/data/radar";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { FilterSelect } from "@/app/staff/filter-select";
import { plural } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { StaffSectionTabs } from "@/components/shell/staff-section-tabs";

export const metadata: Metadata = { title: "Студенты" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StaffStudentsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { q, group } = StudentDirectoryQuery.parse({ q: one(sp.q) ?? "", group: one(sp.group) || undefined });
  const { staff } = await requireStaff();
  const groups = await listScopedGroups();
  // группа из адреса принимается, только если она в области сотрудника
  const groupId = group && groups.some((g) => g.id === group) ? group : "";
  const rows = await listScopedStudentDirectory({ q, groupId: groupId || undefined });
  const showFaculty = !staff.facultyId;
  const filtered = !!q || !!groupId;

  return (
    <div>
      <StaffSectionTabs section="students" current="/staff/students" />
      <PageHeader
        eyebrow={staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Все факультеты"}
        title="Студенты"
        subtitle={`${rows.length} ${plural(rows.length, "студент", "студента", "студентов")}${filtered ? " по фильтру" : " в вашей области"}`}
      />

      <Form action="/staff/students" role="search" className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            maxLength={60}
            placeholder="ФИО, номер зачётки или группа"
            aria-label="Поиск студентов"
            className="h-10 w-full rounded-ctl border border-line-strong bg-surface pr-3 pl-10 text-[14px] text-ink outline-none placeholder:text-ink-3 hover:border-ink-3 focus:border-brand focus:ring-3 focus:ring-brand/15"
          />
        </div>
        <div className="w-full sm:w-60">
          <FilterSelect name="group" defaultValue={groupId} aria-label="Группа">
            <option value="">Все группы</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code}, {g.course} курс
              </option>
            ))}
          </FilterSelect>
        </div>
        <button type="submit" className="sr-only">
          Найти
        </button>
      </Form>

      <Card className="divide-y divide-line stagger-rows">
        {rows.length ? (
          rows.map((r) => <StudentRow key={r.id} r={r} showFaculty={showFaculty} />)
        ) : (
          <EmptyState
            icon={Users}
            title={filtered ? "Никого не нашли" : "Студентов пока нет"}
            text={q ? `По запросу «${q}» студентов нет. Проверьте написание или выберите все группы.` : filtered ? "В этой группе студентов нет." : "В вашей области пока нет студентов."}
          />
        )}
      </Card>
    </div>
  );
}

function StudentRow({ r, showFaculty }: { r: DirectoryStudent; showFaculty: boolean }) {
  const flags: { text: string; tone: "danger" | "warning" | "neutral" | "brand" }[] = [];
  if (r.risk) flags.push({ text: `Риск: ${RISK_LEVEL_META[r.risk].label.toLowerCase()}`, tone: RISK_LEVEL_META[r.risk].tone });
  if (r.sick) flags.push({ text: "Болеет", tone: "brand" });
  if (r.paymentDebt) flags.push({ text: "Долг по оплате", tone: "danger" });
  return (
    <Link
      href={`/staff/students/${r.id}`}
      prefetch={false}
      className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-surface-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink">{fullName(r)}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[13px] text-ink-3">
          <span className="font-mono text-ink-2">{r.groupCode}</span>
          <span>{r.course} курс</span>
          {showFaculty && <span>{r.facultyCode}</span>}
          <span>{r.funding === "contract" ? "контракт" : "бюджет"}</span>
          <span>
            зачётка <span className="font-mono tabular">{r.recordBook}</span>
          </span>
        </div>
      </div>
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 sm:shrink-0 sm:justify-end">
          {flags.map((f) => (
            <StatusText key={f.text} tone={f.tone}>
              {f.text}
            </StatusText>
          ))}
        </div>
      )}
    </Link>
  );
}
