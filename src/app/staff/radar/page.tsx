import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { listScopedGroups } from "@/lib/data/staff";
import { getRiskRadar, RADAR_RULES, RISK_LEVEL_META, type RiskLevel } from "@/lib/data/radar";
import { getSemester } from "@/lib/academic";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { CountUp } from "@/components/motion/count-up";
import { SegmentedLinks } from "@/components/motion/segmented-links";
import { fullName } from "@/lib/utils";
import { plural } from "@/lib/time";
import { ContactRow } from "./contact-row";
import { GroupFilter } from "./group-filter";

export const metadata: Metadata = { title: "Радар рисков" };

const LEVELS: RiskLevel[] = ["high", "medium", "low"];
const isLevel = (v: string): v is RiskLevel => (LEVELS as string[]).includes(v);

export default async function StaffRadarPage({ searchParams }: { searchParams: Promise<{ group?: string; level?: string }> }) {
  const { group = "", level: rawLevel = "" } = await searchParams;
  const { staff } = await requireStaff();
  const groups = await listScopedGroups();
  // группа из адреса принимается, только если она в области сотрудника
  const groupId = groups.some((g) => g.id === group) ? group : "";
  const level = isLevel(rawLevel) ? rawLevel : "";
  const { entries, counts, total } = await getRiskRadar({ groupId: groupId || undefined });
  const rows = level ? entries.filter((e) => e.level === level) : entries;

  const href = (next: { level?: string }) => {
    const p = new URLSearchParams();
    if (groupId) p.set("group", groupId);
    if (next.level) p.set("level", next.level);
    const qs = p.toString();
    return qs ? `/staff/radar?${qs}` : "/staff/radar";
  };
  const scopeLabel = staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Все факультеты";

  return (
    <div>
      <PageHeader
        eyebrow={`${scopeLabel} · ${getSemester().label}`}
        title="Радар рисков"
        subtitle="Кому из студентов нужна помощь в этом семестре: долги, угроза допуска, низкие баллы и заявки без ответа"
      />

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="text-[13px] text-ink-3">В радаре</div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-[32px] leading-none font-semibold tracking-[-0.03em] tabular">
              <CountUp value={entries.length} />
            </span>
            <span className="text-[13px] text-ink-3 tabular">из {total}</span>
          </div>
        </div>
        {LEVELS.map((l) => (
          <div key={l} className="rounded-card border border-line bg-surface p-5">
            <StatusText tone={RISK_LEVEL_META[l].tone} className="text-[13px]">
              {RISK_LEVEL_META[l].label} риск
            </StatusText>
            <div className="mt-3 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular">
              <CountUp value={counts[l]} />
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="scrollbar-none -mx-5 w-[calc(100%+2.5rem)] overflow-x-auto px-5 sm:mx-0 sm:w-auto sm:px-0">
          <SegmentedLinks
            id="radar-level"
            items={[
              { href: href({}), label: "Все", active: !level, count: entries.length },
              ...LEVELS.map((l) => ({ href: href({ level: l }), label: RISK_LEVEL_META[l].label, active: level === l, count: counts[l] })),
            ]}
          />
        </div>
        <GroupFilter groups={groups.map((g) => ({ id: g.id, label: `${g.code}, ${g.course} курс` }))} value={groupId} level={level} />
      </div>

      <Card className="divide-y divide-line stagger-rows">
        {rows.length ? (
          rows.map((e) => {
            const meta = RISK_LEVEL_META[e.level];
            return (
              <ContactRow key={e.studentId} studentId={e.studentId} name={`${e.lastName} ${e.firstName}`}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Link href={`/staff/students/${e.studentId}`} prefetch={false} className="text-[14px] font-semibold hover:underline">
                    {fullName(e)}
                  </Link>
                  <span className="font-mono text-[12px] text-ink-3">{e.groupCode}</span>
                  <StatusText tone={meta.tone}>{meta.label}</StatusText>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-[13px] leading-relaxed text-ink-2">
                  {e.reasons.map((r, i) => (
                    <li key={i} className={r.kind === "debt" || r.kind === "critical" ? "text-ink" : undefined}>
                      {r.text}
                    </li>
                  ))}
                </ul>
              </ContactRow>
            );
          })
        ) : entries.length ? (
          <EmptyState icon={ShieldCheck} title="На этом уровне студентов нет" text="Выберите другой уровень или все группы." />
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="Рисков не видно"
            text={`У ${total} ${plural(total, "студента", "студентов", "студентов")} ${groupId ? "группы" : "в вашей области"} нет долгов, угрозы допуска и заявок без ответа.`}
          />
        )}
      </Card>

      <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-ink-3">
        Как считается: долг или угроза допуска сразу дают высокий уровень. Дисциплины ниже 60 %, средний результат ниже {Math.round(RADAR_RULES.lowAverage * 100)} % и заявки без ответа студента дольше {RADAR_RULES.staleDays} дней складываются в балл риска. Баллы берутся по проверенным контрольным точкам текущего семестра.
      </p>
    </div>
  );
}
