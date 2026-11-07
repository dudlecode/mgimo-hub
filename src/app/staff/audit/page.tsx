import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { AUDIT_PERIODS, AuditQuery, listScopedAudit, type AuditFilter, type ScopedAuditRow } from "@/lib/data/audit";
import { AUDIT_ACTIONS, AUDIT_ACTION_CODES, auditActionLabel } from "@/lib/audit-actions";
import { Card, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SegmentedLinks } from "@/components/motion/segmented-links";
import { FilterSelect } from "@/app/staff/filter-select";
import { formatDateNumeric, formatDateTime, formatTime, mskParts } from "@/lib/time";
import { shortName } from "@/lib/utils";
import { StaffSectionTabs } from "@/components/shell/staff-section-tabs";

export const metadata: Metadata = { title: "Журнал действий" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(f: AuditFilter) {
  const p = new URLSearchParams();
  if (f.action) p.set("action", f.action);
  if (f.actor) p.set("actor", f.actor);
  if (f.period) p.set("period", f.period);
  if (f.before) p.set("before", String(f.before));
  const qs = p.toString();
  return qs ? `/staff/audit?${qs}` : "/staff/audit";
}

function stamp(d: Date, now: Date) {
  return mskParts(d).y === mskParts(now).y ? formatDateTime(d) : `${formatDateNumeric(d)}, ${formatTime(d)}`;
}

export default async function StaffAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filter = AuditQuery.parse({
    action: one(sp.action) || undefined,
    actor: one(sp.actor) || undefined,
    period: one(sp.period) || undefined,
    before: one(sp.before) || undefined,
  });
  const { staff } = await requireStaff();
  const { rows, nextBefore, actors } = await listScopedAudit(filter);
  const now = new Date();
  const base = { action: filter.action, actor: filter.actor, period: filter.period };
  const filtered = !!(filter.action || filter.actor || filter.period);

  return (
    <div>
      <StaffSectionTabs section="analytics" current="/staff/audit" />
      <PageHeader
        eyebrow={staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Все факультеты"}
        title="Журнал действий"
        subtitle={staff.faculty ? "Действия сотрудников с данными студентов вашего факультета и ваши собственные" : "Кто из сотрудников что открывал и менял"}
      />
      <p className="-mt-6 mb-8 text-[13px] text-ink-3">Записи журнала нельзя изменить или удалить, это обеспечивает база данных.</p>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-none -mx-5 w-[calc(100%+2.5rem)] overflow-x-auto px-5 sm:mx-0 sm:w-auto sm:px-0">
          <SegmentedLinks
            id="audit-period"
            className="whitespace-nowrap"
            items={[
              { href: href({ ...base, period: undefined }), label: "Всё время", active: !filter.period },
              ...AUDIT_PERIODS.map((p) => ({ href: href({ ...base, period: p.value }), label: p.label, active: filter.period === p.value })),
            ]}
          />
        </div>
        <Form action="/staff/audit" className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:w-[480px]">
          {filter.period && <input type="hidden" name="period" value={filter.period} />}
          <FilterSelect name="action" defaultValue={filter.action ?? ""} aria-label="Тип действия">
            <option value="">Все действия</option>
            {AUDIT_ACTION_CODES.map((code) => (
              <option key={code} value={code}>
                {AUDIT_ACTIONS[code]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect name="actor" defaultValue={filter.actor ?? ""} aria-label="Сотрудник">
            <option value="">Все сотрудники</option>
            {actors.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name}
              </option>
            ))}
          </FilterSelect>
          <button type="submit" className="sr-only">
            Показать
          </button>
        </Form>
      </div>

      <Card className="divide-y divide-line stagger-rows">
        {rows.length ? (
          rows.map((r) => <AuditRow key={r.id} r={r} now={now} />)
        ) : (
          <EmptyState
            icon={ScrollText}
            title={filter.before ? "Больше записей нет" : "Записей нет"}
            text={
              filtered
                ? "По этим фильтрам записей нет. Выберите другой период или все действия."
                : "Здесь появятся действия сотрудников: изменения заявок, решения по больничным, отметки об оплате и просмотры карточек студентов."
            }
          />
        )}
      </Card>

      {(filter.before || nextBefore) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {filter.before && (
            <ButtonLink href={href(base)} variant="secondary" size="sm">
              К новым записям
            </ButtonLink>
          )}
          {nextBefore && (
            <ButtonLink href={href({ ...base, before: nextBefore })} variant="secondary" size="sm">
              Более ранние
            </ButtonLink>
          )}
        </div>
      )}
    </div>
  );
}

function AuditRow({ r, now }: { r: ScopedAuditRow; now: Date }) {
  return (
    <div className="px-5 py-4 sm:grid sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-5 lg:grid-cols-[150px_minmax(0,1fr)_200px]">
      <time dateTime={r.createdAt.toISOString()} className="block font-mono text-[12px] leading-5 text-ink-3 tabular">
        {stamp(r.createdAt, now)}
      </time>
      <div className="mt-1 min-w-0 sm:mt-0">
        <div className="text-[12px] leading-5 text-ink-3">{auditActionLabel(r.action)}</div>
        <div className="text-[14px] leading-5 text-ink">{r.summary}</div>
        <div className="mt-1 text-[12px] text-ink-3">
          {r.actorName ?? "Сотрудник"}
          {r.position ? `, ${r.position}` : ""}
        </div>
      </div>
      {r.studentId && r.studentLast && r.studentFirst ? (
        <div className="mt-1.5 min-w-0 text-[13px] sm:col-start-2 lg:col-start-auto lg:mt-0 lg:text-right">
          <Link href={`/staff/students/${r.studentId}`} prefetch={false} className="text-brand-fg hover:underline">
            {shortName({ lastName: r.studentLast, firstName: r.studentFirst, middleName: r.studentMiddle })}
          </Link>
          {r.groupCode && <span className="ml-1.5 font-mono text-[12px] text-ink-3">{r.groupCode}</span>}
        </div>
      ) : null}
    </div>
  );
}
