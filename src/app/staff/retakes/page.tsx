import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2, CircleCheck, ClipboardCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { getRetakeBoard, type BoardSession, type BoardStudent, type DebtGroup } from "@/lib/data/retakes";
import { getSemester } from "@/lib/academic";
import { CONTROL_LABEL, MARK_LABEL, type Mark } from "@/lib/grades";
import { ATTEMPT_SHORT, RETAKE_RULES, RETAKE_STATUS_META, resultOptions, type RetakeAttempt } from "@/lib/retakes";
import { addDays, dayKey, formatDayMonth, formatTime, formatWeekday, plural, startOfMskDay } from "@/lib/time";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { CountUp } from "@/components/motion/count-up";
import { cn } from "@/lib/utils";
import { DebtRow } from "./debt-row";
import { DeleteDraftButton, PublishButton, ResultForm } from "./session-actions";

export const metadata: Metadata = { title: "Пересдачи" };

const attemptLabel = (a: number) => ATTEMPT_SHORT[a as RetakeAttempt] ?? `попытка ${a}`;
const studentsWord = (n: number) => plural(n, "студент", "студента", "студентов");

export default async function StaffRetakesPage() {
  const { staff } = await requireStaff();
  const board = await getRetakeBoard();
  const now = new Date();
  const minDate = dayKey(addDays(startOfMskDay(now), 1));
  const scopeLabel = staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Все факультеты";
  const { stats, groups, upcoming, results } = board;
  const groupKeys = new Map(groups.map((g) => [g.key, g]));

  const days: { key: string; date: Date; items: BoardSession[] }[] = [];
  for (const x of upcoming) {
    const key = dayKey(x.startsAt);
    const day = days.find((d) => d.key === key);
    if (day) day.items.push(x);
    else days.push({ key, date: x.startsAt, items: [x] });
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${scopeLabel} · ${getSemester(now).label}`}
        title="Пересдачи"
        subtitle="Долги студентов, график пересдач и результаты. Направления и уведомления уходят студентам одним действием"
      />

      <div className="mb-10 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Долгов в области" value={stats.debts} />
        <Stat label="Студентов с долгами" value={stats.students} />
        <Stat label="Назначено пересдач" value={stats.scheduled} hint={stats.awaiting ? `ждут результата: ${stats.awaiting}` : "направления выданы"} />
        <Stat label="Без даты" value={stats.noDate} hint={stats.inDrafts ? `в черновиках: ${stats.inDrafts}` : undefined} alert={stats.noDate > 0} />
      </div>

      {/* Долги по дисциплинам */}
      <section id="debts" className="mb-10">
        <SectionTitle count={groups.length}>Долги по дисциплинам</SectionTitle>
        <Card className="divide-y divide-line stagger-rows">
          {groups.length ? (
            groups.map((g) => (
              <DebtRow
                key={g.key}
                anchorId={`d-${g.key}`}
                courseId={g.courseId}
                attempt={(g.attempt === 3 ? 3 : 2) as RetakeAttempt}
                teacher={g.teacher}
                minDate={minDate}
                canAssign={g.session === null && g.attempt <= RETAKE_RULES.maxAttempt}
              >
                <DebtSummary g={g} />
              </DebtRow>
            ))
          ) : (
            <EmptyState icon={CircleCheck} title="Долгов нет" text="У студентов вашей области нет академических задолженностей. Пересдачи назначать не нужно." />
          )}
        </Card>
      </section>

      {/* График */}
      <section id="schedule" className="mb-10">
        <SectionTitle count={upcoming.length}>График</SectionTitle>
        {days.length ? (
          <div className="space-y-5">
            {days.map((d) => (
              <div key={d.key}>
                <h3 className="mb-2 text-[13px] text-ink-3">
                  <span className="capitalize">{formatWeekday(d.date)}</span>, <span className="font-mono tabular">{formatDayMonth(d.date)}</span>
                </h3>
                <Card className="divide-y divide-line stagger-rows">
                  {d.items.map((x) => (
                    <SessionRow key={x.id} x={x} now={now} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={CalendarCheck2} title="Пересдач в графике нет" text="Нажмите «Назначить» у долга: дата попадёт сюда черновиком, а студенты получат направления, когда вы их выпустите." />
          </Card>
        )}
      </section>

      {/* Результаты */}
      <section id="results">
        <SectionTitle count={stats.awaiting}>Результаты</SectionTitle>
        {results.length ? (
          <div className="space-y-5">
            {results.map((x) => (
              <Card key={x.id} id={`r-${x.id}`} className="scroll-mt-24 divide-y divide-line">
                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-[14px] font-semibold">{x.discipline}</span>
                    <span className="font-mono text-[12px] text-ink-3">{x.groupCode}</span>
                    {x.referrals.every((r) => r.status !== "issued") && <StatusText tone="success">Результаты внесены</StatusText>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    <span className="font-mono tabular">
                      {formatDayMonth(x.startsAt)}, {formatTime(x.startsAt)}
                    </span>{" "}
                    · ауд. <span className="font-mono">{x.room}</span> · {attemptLabel(x.attempt)} · {x.commission.join(", ")}
                  </div>
                </div>
                <div className="divide-y divide-line stagger-rows">
                  {x.referrals.map((r) => {
                    const next = groupKeys.get(`${x.courseId}-3`);
                    const commissionHref = x.attempt === 2 ? `#d-${x.courseId}-3` : undefined;
                    const meta = RETAKE_STATUS_META[r.status];
                    return (
                      <div key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium">{r.name}</div>
                          <div className="font-mono text-[12px] text-ink-3">№ {r.number}</div>
                        </div>
                        {r.status === "issued" ? (
                          <ResultForm referralId={r.id} options={resultOptions(x.controlType)} commissionHref={commissionHref} name={r.short} />
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
                            <StatusText tone={meta.tone}>
                              <span>
                                {meta.label}
                                {r.resultMark && r.status === "passed" ? `, «${MARK_LABEL[r.resultMark as Mark] ?? r.resultMark}»` : ""}
                              </span>
                            </StatusText>
                            {r.resultPoints !== null && <span className="font-mono text-[12px] text-ink-3 tabular">{r.resultPoints} {plural(r.resultPoints, "балл", "балла", "баллов")}</span>}
                            {r.status === "failed" && x.attempt === 2 && (
                              next && next.session === null && next.students.some((st) => st.studentId === r.studentId) ? (
                                <Link href={`#d-${next.key}`} className="text-[13px] font-medium text-brand-fg">
                                  Назначить комиссию
                                </Link>
                              ) : next?.session ? (
                                <span className="text-[12px] text-ink-3">комиссия назначена</span>
                              ) : null
                            )}
                            {r.status === "failed" && x.attempt >= RETAKE_RULES.maxAttempt && <span className="text-[12px] text-ink-3">попытки исчерпаны</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={ClipboardCheck} title="Прошедших пересдач нет" text="После даты пересдачи здесь появится список студентов: отметьте, кто сдал, кто не сдал и кто не пришёл." compact />
          </Card>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, alert }: { label: string; value: number; hint?: string; alert?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="text-[13px] text-ink-3">{label}</div>
      <div className={cn("mt-3 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular", alert && "text-danger")}>
        <CountUp value={value} />
      </div>
      {hint && <div className="mt-2 text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}

function names(list: BoardStudent[], max = 4) {
  const shown = list.slice(0, max).map((st) => st.short);
  const rest = list.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} и ещё ${rest}` : shown.join(", ");
}

function DebtSummary({ g }: { g: DebtGroup }) {
  const exhausted = g.attempt > RETAKE_RULES.maxAttempt;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-[14px] font-semibold">{g.discipline}</span>
        <span className="font-mono text-[12px] text-ink-3">{g.langGroup ?? g.groupCode}</span>
        {!exhausted && <span className="text-[12px] text-ink-3">{attemptLabel(g.attempt)}</span>}
      </div>
      <div className="mt-0.5 text-[12px] text-ink-3">
        {CONTROL_LABEL[g.controlType]} · {g.semester}-й семестр · ведёт {g.teacher}
      </div>
      <div className="mt-1.5 text-[13px] text-ink-2">
        <span className="tabular">
          {g.students.length} {studentsWord(g.students.length)}
        </span>
        : {names(g.students)}
      </div>
      <div className="mt-1.5">
        {exhausted ? (
          <StatusText tone="danger" className="whitespace-normal">Попытки исчерпаны, решение принимает деканат</StatusText>
        ) : g.session === null ? (
          <StatusText tone="danger">Без даты</StatusText>
        ) : g.session.state === "draft" ? (
          <Link href={`#s-${g.session.id}`} className="inline-flex">
            <StatusText tone="neutral" className="whitespace-normal">
              <span>
                Черновик на <span className="font-mono tabular">{formatDayMonth(g.session.startsAt)}, {formatTime(g.session.startsAt)}</span>, направления не выпущены
              </span>
            </StatusText>
          </Link>
        ) : g.session.state === "awaiting" ? (
          <Link href={`#r-${g.session.id}`} className="inline-flex">
            <StatusText tone="warning" className="whitespace-normal">
              <span>
                Прошла <span className="font-mono tabular">{formatDayMonth(g.session.startsAt)}</span>, внесите результат
              </span>
            </StatusText>
          </Link>
        ) : (
          <StatusText tone="success" className="whitespace-normal">
            <span>
              Назначена: <span className="font-mono tabular">{formatDayMonth(g.session.startsAt)}, {formatTime(g.session.startsAt)}</span>, ауд. <span className="font-mono">{g.session.room}</span>
            </span>
          </StatusText>
        )}
      </div>
    </>
  );
}

function SessionRow({ x, now }: { x: BoardSession; now: Date }) {
  const draft = !x.publishedAt;
  const expired = draft && x.startsAt <= now;
  return (
    <div id={`s-${x.id}`} className="grid scroll-mt-24 grid-cols-[48px_minmax(0,1fr)] gap-x-3 px-5 py-4 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:gap-x-4">
      <div className={cn("pt-px font-mono text-[14px] font-semibold tabular", expired && "text-ink-3")}>{formatTime(x.startsAt)}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[14px] font-semibold">{x.discipline}</span>
          <span className="font-mono text-[12px] text-ink-3">{x.groupCode}</span>
          {expired ? (
            <StatusText tone="warning" className="whitespace-normal">Дата прошла, направления не выпущены</StatusText>
          ) : draft ? (
            <StatusText tone="neutral">Черновик</StatusText>
          ) : (
            <StatusText tone="success">Направления выпущены</StatusText>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-ink-3">
          ауд. <span className="font-mono">{x.room}</span> · {attemptLabel(x.attempt)} · {CONTROL_LABEL[x.controlType].toLowerCase()}
        </div>
        <div className="mt-1 text-[13px] text-ink-2">Комиссия: {x.commission.join(", ")}</div>
        {x.note && <div className="mt-0.5 text-[12px] text-ink-3">{x.note}</div>}
        {x.referrals.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
            {x.referrals.map((r) => (
              <li key={r.id}>
                {r.short} <span className="font-mono text-[12px] text-ink-3">№ {r.number}</span>
              </li>
            ))}
          </ul>
        )}
        {x.pending.length > 0 && !expired && (
          <p className="mt-2 text-[13px] text-ink-2">
            {draft ? "Получат направления" : "Ещё без направления"}: {names(x.pending, 6)}
          </p>
        )}
        {draft && x.pending.length === 0 && !expired && <p className="mt-2 text-[13px] text-ink-3">Должников для этой попытки нет, черновик можно удалить</p>}
      </div>
      {(draft || x.pending.length > 0) && (
        <div className="col-start-2 mt-3 flex flex-wrap items-center gap-2 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:justify-end">
          {!expired && <PublishButton sessionId={x.id} count={x.pending.length} label={draft ? "Выпустить направления" : `Выпустить оставшимся: ${x.pending.length}`} />}
          {draft && <DeleteDraftButton sessionId={x.id} />}
        </div>
      )}
    </div>
  );
}
