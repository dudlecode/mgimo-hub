import type { Metadata } from "next";
import Link from "next/link";
import { ChartNoAxesCombined, GraduationCap, Inbox } from "lucide-react";
import { DEFAULT_PERIOD, getStaffAnalytics, parsePeriod, PERIODS, type GroupAxis, type OfficeAxis } from "@/lib/data/analytics";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { CountUp } from "@/components/motion/count-up";
import { SegmentedLinks } from "@/components/motion/segmented-links";
import { Stagger } from "@/components/motion/stagger";
import { ChartCard } from "@/components/charts/chart-card";
import { RadarChart, type RadarAxis } from "@/components/charts/radar-chart";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { Heatmap } from "@/components/charts/heatmap";
import { formatDayMonth, plural, WEEKDAYS_LONG, WEEKDAYS_SHORT } from "@/lib/time";
import { cn } from "@/lib/utils";
import { StaffSectionTabs } from "@/components/shell/staff-section-tabs";

export const metadata: Metadata = { title: "Аналитика" };

const OFFICE_AXES: (RadarAxis & { key: OfficeAxis; how: string })[] = [
  { key: "speed", label: "Скорость", how: "какая часть отведённого срока остаётся в запасе у типичной заявки (медиана)" },
  { key: "onTime", label: "Соблюдение сроков", lines: ["Соблюдение", "сроков"], how: "доля готовых заявок, закрытых не позже срока" },
  { key: "noInfo", label: "Без уточнений", lines: ["Без", "уточнений"], how: "доля заявок, где не пришлось ничего уточнять у студента" },
  { key: "electronic", label: "Электронные справки", lines: ["Электронные", "справки"], how: "доля электронных справок там, где студент выбирает между бумагой и электронным видом" },
  { key: "load", label: "Нагрузка в норме", lines: ["Нагрузка", "в норме"], how: "доля рабочих дней без всплеска: поступило не больше полутора средних дневных потоков" },
];

const GROUP_AXES: (RadarAxis & { key: GroupAxis; how: string })[] = [
  { key: "result", label: "Средний результат", lines: ["Средний", "результат"], how: "сумма баллов к сумме максимумов по всем проверенным работам семестра" },
  { key: "tests", label: "Контрольные", how: "доля контрольных, написанных на 60 % от максимума и выше" },
  { key: "seminars", label: "Семинары", how: "баллы за работу на семинарах к максимуму" },
  { key: "attendance", label: "Посещаемость", how: "баллы за посещаемость к максимуму" },
  { key: "activity", label: "Активность", how: "средняя надбавка за активность к максимуму в 5 %" },
  { key: "noDebt", label: "Без долгов", lines: ["Без", "долгов"], how: "доля студентов без «неуд.» и «не зачтено» в зачётке" },
];

const NB = "\u00a0";
const pctText = (v: number | null) => (v === null ? "нет данных" : `${Math.round(v)}${NB}%`);

function hoursText(h: number | null): string {
  if (h === null) return "нет данных";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}${NB}мин`;
  if (h < 48) return `${Math.round(h)}${NB}ч`;
  const d = Math.round(h / 24);
  return `${d}${NB}${plural(d, "день", "дня", "дней")}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function HowItWorks({ items, note }: { items: { label: string; how: string }[]; note?: string }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-ink-2 transition-colors select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        Как считаются оси <span className="text-ink-3 group-open:hidden">(показать)</span>
      </summary>
      <ul className="mt-2 space-y-1">
        {items.map((it) => (
          <li key={it.label}>
            <span className="text-ink-2">{it.label}:</span> {it.how}
          </li>
        ))}
      </ul>
      {note && <p className="mt-2">{note}</p>}
    </details>
  );
}

export default async function StaffAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  const raw = (await searchParams).period;
  const period = parsePeriod(Array.isArray(raw) ? raw[0] : raw);
  const a = await getStaffAnalytics(period);
  const { kpi } = a;
  const isFaculty = a.scope.kind === "faculty";

  const tabs = PERIODS.map((p) => ({
    href: p.key === DEFAULT_PERIOD ? "/staff/analytics" : `/staff/analytics?period=${p.key}`,
    label: p.label,
    active: p.key === period,
  }));

  // ── Радар офиса ──
  const officeSeries = a.office.map((o) => ({
    key: o.key,
    label: o.label,
    values: OFFICE_AXES.map((ax) => o.scores[ax.key].value),
    notes: OFFICE_AXES.map((ax) => o.scores[ax.key].note),
  }));

  // ── Радар групп: оси без данных не показываем (посещаемость выставляют в конце семестра) ──
  const groupAxes = GROUP_AXES.filter((ax) => a.groups.some((g) => g[ax.key].value !== null));
  const groupSeries = a.groups.map((g) => ({
    key: g.key,
    label: g.key === "uni" ? g.label : `${g.label}, ${g.students} ${plural(g.students, "студент", "студента", "студентов")}`,
    values: groupAxes.map((ax) => g[ax.key].value),
    notes: groupAxes.map((ax) => g[ax.key].note),
  }));

  // ── Типы заявок: первые 6, остальное одной строкой ──
  const topTypes = a.types.slice(0, 6);
  const restTypes = a.types.slice(6);
  const restCount = restTypes.reduce((s, t) => s + t.count, 0);

  // ── Тепловая карта ──
  const heatTotal = a.heat.flat().reduce((s, v) => s + v, 0);
  const inOffice = a.heat.slice(0, 5).reduce((s, row) => s + row.slice(10, 17).reduce((x, v) => x + v, 0), 0);
  const outsideShare = heatTotal ? Math.round((100 * (heatTotal - inOffice)) / heatTotal) : 0;
  const weekendShare = heatTotal ? Math.round((100 * a.heat.slice(5).flat().reduce((s, v) => s + v, 0)) / heatTotal) : 0;
  const dayTotals = a.heat.map((row) => row.reduce((s, v) => s + v, 0));
  const peak = a.heat.flatMap((row, d) => row.map((v, h) => ({ d, h, v }))).reduce((best, c) => (c.v > best.v ? c : best), { d: 0, h: 0, v: -1 });

  const weekly = a.weeks.map((w) => ({ label: w.label, title: `Неделя ${w.range}`, values: [w.inflow, w.processed], inPeriod: w.inPeriod }));
  const weeklyTotal = a.weeks.reduce((s, w) => s + w.inflow, 0);

  const tiles = [
    { label: "Заявок за период", short: "Заявок", value: kpi.total, suffix: "", hint: `в среднем ${Math.round(kpi.total / kpi.weeks)} в неделю` },
    { label: "Медиана обработки", short: "Медиана", value: kpi.medianHours === null ? null : Math.round(kpi.medianHours), suffix: `${NB}ч`, hint: `от подачи до готовности, среднее ${hoursText(kpi.meanHours)}` },
    { label: "Готово в срок", short: "В срок", value: kpi.onTime === null ? null : Math.round(kpi.onTime), suffix: `${NB}%`, hint: `${kpi.onTimeCount} из ${kpi.onTimeOf} готовых заявок` },
  ];

  return (
    <div>
      <StaffSectionTabs section="analytics" current="/staff/analytics" />
      <PageHeader
        eyebrow={isFaculty && a.scope.kind === "faculty" ? `Учебный офис ${a.scope.code}` : "Студенческий офис · все факультеты"}
        title="Аналитика"
        subtitle={`Заявки с ${formatDayMonth(a.period.from)} по ${formatDayMonth(a.period.to)}, успеваемость за ${a.semesterLabel.charAt(0).toLowerCase()}${a.semesterLabel.slice(1)}`}
        actions={<SegmentedLinks id="analytics-period" items={tabs} />}
      />

      <Stagger className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-card border border-line bg-surface p-4 sm:p-5">
              <div className="text-[13px] text-ink-3">
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </div>
              <div className="mt-3 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular">
                {t.value === null ? <span className="text-[20px] text-ink-3">нет данных</span> : <CountUp value={t.value} suffix={t.suffix} />}
              </div>
              <div className="mt-2 text-[12px] text-ink-3">{t.hint}</div>
            </div>
          ))}
          <Link
            href="/staff/requests?filter=overdue"
            className={cn("rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-1 sm:p-5", kpi.overdue > 0 && "border-danger/40")}
          >
            <div className="text-[13px] text-ink-3">
              <span className="sm:hidden">Просрочено</span>
              <span className="hidden sm:inline">Просрочено сейчас</span>
            </div>
            <div className={cn("mt-3 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular", kpi.overdue > 0 && "text-danger")}>
              <CountUp value={kpi.overdue} />
            </div>
            <div className="mt-2 text-[12px] text-ink-3">{kpi.overdue > 0 ? "в очереди, срок уже прошёл" : "все в очереди укладываются в срок"}</div>
          </Link>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          <ChartCard
            title="Качество работы офиса"
            description={isFaculty ? "Ваш офис и университет в среднем, 100 лучше всего" : "Факультеты между собой по пяти осям, 100 лучше всего"}
            footer={<HowItWorks items={OFFICE_AXES} />}
          >
            {officeSeries.length ? (
              <RadarChart
                axes={OFFICE_AXES.map(({ key, label, lines }) => ({ key, label, lines }))}
                series={officeSeries}
                selectable={!isFaculty}
                ariaLabel={`Качество работы офиса: ${officeSeries.map((s) => `${s.label}: ${OFFICE_AXES.map((ax, i) => `${ax.label.toLowerCase()} ${s.values[i] === null ? "нет данных" : Math.round(s.values[i]!)}`).join(", ")}`).join("; ")}`}
                caption="Показатели качества работы офиса, от 0 до 100"
              />
            ) : (
              <EmptyState icon={Inbox} title="За период заявок нет" text="Показатели появятся, когда студенты подадут заявки." compact />
            )}
          </ChartCard>

          <ChartCard
            title="Успеваемость групп"
            description={isFaculty ? "Группы факультета и университет в среднем, текущий семестр" : "Группы между собой за текущий семестр, 100 лучше всего"}
            footer={<HowItWorks items={groupAxes} note={a.hasAttendance ? undefined : "Посещаемость появится, когда преподаватели выставят отметки в конце семестра."} />}
          >
            {groupSeries.length && groupAxes.length >= 3 ? (
              <RadarChart
                axes={groupAxes.map(({ key, label, lines }) => ({ key, label, lines }))}
                series={groupSeries}
                selectable={!isFaculty}
                ariaLabel={`Успеваемость групп: ${groupSeries.map((s) => `${s.label}: ${groupAxes.map((ax, i) => `${ax.label.toLowerCase()} ${s.values[i] === null ? "нет данных" : Math.round(s.values[i]!)}`).join(", ")}`).join("; ")}`}
                caption="Показатели успеваемости групп за текущий семестр, от 0 до 100"
              />
            ) : (
              <EmptyState icon={GraduationCap} title="Пока нет оценок" text="Показатели появятся после первых проверенных контрольных точек." compact />
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          <ChartCard title="Поступление заявок" description="Пришло и обработано заявок за неделю" aside={`${weeklyTotal} за ${a.weeks.length} нед.`}>
            {weeklyTotal ? (
              <AreaChart
                points={weekly}
                series={[
                  { key: "inflow", label: "Поступило", tone: "brand", area: true },
                  { key: "processed", label: "Обработано", tone: "muted" },
                ]}
                height={250}
                periodLabel="выбранный период"
                ariaLabel={`Заявки по неделям: ${weekly.map((w) => `${w.label}: поступило ${w.values[0]}, обработано ${w.values[1]}`).join("; ")}`}
                caption="Поступление и обработка заявок по неделям"
              />
            ) : (
              <EmptyState icon={ChartNoAxesCombined} title="Заявок пока нет" compact />
            )}
          </ChartCard>

          <ChartCard title="Типы заявок" description="Число заявок и время обработки по каждому типу" aside={kpi.total ? `${kpi.total} всего` : undefined}>
            {topTypes.length ? (
              <>
                <BarList
                  items={topTypes.map((t) => ({
                    key: t.slug,
                    label: t.title,
                    value: t.count,
                    meta: t.medianH === null ? "пока нет готовых" : `медиана ${hoursText(t.medianH)}, среднее ${hoursText(t.meanH)}, в срок ${pctText(t.onTime)}`,
                    detail: [hoursText(t.medianH), hoursText(t.meanH), pctText(t.onTime)],
                  }))}
                  labelHeader="Тип заявки"
                  valueLabel="Заявок"
                  detailLabels={["Медиана обработки", "Среднее время обработки", "Готово в срок"]}
                  ariaLabel={`Заявки по типам: ${topTypes.map((t) => `${t.title}: ${t.count}`).join(", ")}`}
                  caption="Заявки по типам за период"
                />
                {restTypes.length > 0 && (
                  <p className="mt-4 text-[12px] text-ink-3">
                    Ещё {restCount} {plural(restCount, "заявка", "заявки", "заявок")}: {restTypes.map((t) => `${t.title.toLowerCase()} (${t.count})`).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <EmptyState icon={Inbox} title="За период заявок нет" compact />
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Когда приходят заявки"
          description="Подача по дням недели и часам, время московское"
          aside={heatTotal ? `пик: ${WEEKDAYS_SHORT[peak.d].toLowerCase()}, ${String(peak.h).padStart(2, "0")}:00` : undefined}
          footer={heatTotal ? `${outsideShare}${NB}% заявок подано вне часов работы офиса, ${weekendShare}${NB}% в выходные. Такие заявки офис разбирает с начала следующего рабочего дня.` : undefined}
        >
          {heatTotal ? (
            <Heatmap
              rows={[...WEEKDAYS_SHORT]}
              rowsLong={WEEKDAYS_LONG.map(capital)}
              values={a.heat}
              office={{ rows: [0, 4], hours: [10, 17], label: "часы работы офиса" }}
              ariaLabel={`Подача заявок по дням недели: ${dayTotals.map((n, i) => `${WEEKDAYS_LONG[i]} ${n}`).join(", ")}. Пик: ${WEEKDAYS_LONG[peak.d]}, ${String(peak.h).padStart(2, "0")}:00`}
              caption="Количество поданных заявок по дням недели и часам"
            />
          ) : (
            <EmptyState icon={Inbox} title="За период заявок нет" compact />
          )}
        </ChartCard>
      </Stagger>
    </div>
  );
}
