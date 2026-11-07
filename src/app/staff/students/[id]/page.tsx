import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getScopedStudentCard, type StudentCard } from "@/lib/data/students";
import { RISK_LEVEL_META } from "@/lib/data/radar";
import { auditView } from "@/lib/audit";
import { getRequestType } from "@/lib/requests/catalog";
import { MARK_LABEL, STANDING_META, type Mark } from "@/lib/grades";
import { SICK_STATUS, dayLabel, periodLabel } from "@/lib/sick-leave";
import { dueHint, formatRub, PAYMENT_STATE_META } from "@/lib/payments";
import { APPOINTMENT_STATUS_LABEL, topicLabel } from "@/lib/appointments";
import { dayKey, formatDateNumeric, formatDateTime, formatDayMonth, formatTime, formatWeekday, mskParts } from "@/lib/time";
import { Card, Crumbs, PageHeader, SectionTitle } from "@/components/ui/card";
import { StatusText, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/feature/request-bits";
import { ContactRow } from "@/app/staff/radar/contact-row";
import { cn, formatPoints, fullName, shortName } from "@/lib/utils";

export const metadata: Metadata = { title: "Карточка студента" };

// Без loading.tsx выше по дереву: студент вне области даёт настоящий HTTP 404, а не 200 со стримом.
export default async function StaffStudentCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getScopedStudentCard(id); // вне области сотрудника: 404
  await auditView({ action: "student.view", entityType: "student", entityId: card.student.id, studentId: card.student.id, summary: "Открыта карточка студента" });
  const { student, group, faculty } = card;
  const now = new Date();

  // Порядок подобран так, чтобы строки сетки заполнялись целиком: 2 колонки на телефоне, 4 на широком экране
  const facts: { label: string; value: ReactNode; wide?: boolean }[] = [
    { label: "Группа и курс", value: <><span className="font-mono">{group.code}</span>, {group.course} курс</> },
    { label: "Форма и основа", value: `${student.studyForm}, ${student.funding === "contract" ? "контракт" : "бюджет"}` },
    { label: "Факультет", value: faculty.name, wide: true },
    { label: "Направление", value: <><span className="font-mono">{group.programCode}</span> {group.programName}</>, wide: true },
    { label: "Зачётная книжка", value: <span className="font-mono tabular">{student.recordBook}</span> },
    { label: "Год поступления", value: <span className="tabular">{student.enrollmentYear}</span> },
    { label: "Почта", value: <a href={`mailto:${student.email}`} className="break-all text-brand-fg hover:underline">{student.email}</a>, wide: true },
    { label: "Телефон", value: <a href={`tel:${student.phone.replace(/[^\d+]/g, "")}`} className="font-mono tabular text-brand-fg hover:underline">{student.phone}</a>, wide: true },
  ];

  return (
    <div>
      <Crumbs items={[{ href: "/staff/students", label: "Студенты" }, { label: shortName(student) }]} />
      <PageHeader eyebrow={`${faculty.code} · ${group.code} · ${group.course} курс`} title={fullName(student)} subtitle={card.semester.label} />

      <Card className="mb-10 overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className={cn("min-w-0 bg-surface px-5 py-3.5", f.wide && "col-span-2")}>
              <dt className="text-[12px] text-ink-3">{f.label}</dt>
              <dd className="mt-1 text-[14px] text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 lg:grid-cols-2">
        <RiskBlock card={card} />
        <GradesBlock card={card} />
        <DebtsBlock card={card} />
        <RequestsBlock card={card} now={now} />
        <SickBlock card={card} />
        <PaymentsBlock card={card} now={now} />
        <AppointmentsBlock card={card} now={now} />
        <JournalBlock card={card} now={now} />
      </div>
    </div>
  );
}

// ───────────── Каркас блока ─────────────

function Block({ title, action, href, count, children }: { title: string; action?: string; href?: string; count?: number; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col">
      <SectionTitle action={action} href={href} count={count}>
        {title}
      </SectionTitle>
      <Card className="flex-1 divide-y divide-line stagger-rows">{children}</Card>
    </section>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-start justify-between gap-4 px-5 py-4", className)}>{children}</div>;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** «6 ноября, 14:35»; для прошлых лет с годом */
function stamp(d: Date, now: Date) {
  return mskParts(d).y === mskParts(now).y ? formatDateTime(d) : `${formatDateNumeric(d)}, ${formatTime(d)}`;
}

// ───────────── Блоки ─────────────

function RiskBlock({ card }: { card: StudentCard }) {
  const { risk, student, group } = card;
  return (
    <Block title="Риск в этом семестре" action="Радар" href={`/staff/radar?group=${group.id}`}>
      {risk ? (
        <ContactRow studentId={student.id} name={`${student.lastName} ${student.firstName}`}>
          <StatusText tone={RISK_LEVEL_META[risk.level].tone}>{RISK_LEVEL_META[risk.level].label} риск</StatusText>
          <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-ink-2">
            {risk.reasons.map((r, i) => (
              <li key={i} className={r.kind === "debt" || r.kind === "critical" ? "text-ink" : undefined}>
                {r.text}
              </li>
            ))}
          </ul>
        </ContactRow>
      ) : (
        <EmptyState compact title="Рисков не видно" text="Нет долгов, угрозы допуска, низких баллов и заявок без ответа." />
      )}
    </Block>
  );
}

function GradesBlock({ card }: { card: StudentCard }) {
  return (
    <Block title={`Успеваемость, ${card.semester.number} семестр`}>
      {card.courses.length ? (
        card.courses.map((c) => (
          <Row key={c.id}>
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-ink">{c.title}</div>
              <div className="mt-0.5 text-[12px] text-ink-3">{c.teacher}</div>
            </div>
            <div className="shrink-0 text-right">
              {c.possible > 0 ? (
                <>
                  <div className="font-mono text-[13px] text-ink tabular">
                    {formatPoints(c.earned)} из {c.possible}
                  </div>
                  <StatusText tone={STANDING_META[c.standing].tone} className="mt-1">
                    {STANDING_META[c.standing].label}
                  </StatusText>
                </>
              ) : (
                <span className="text-[12px] text-ink-3">оценок пока нет</span>
              )}
            </div>
          </Row>
        ))
      ) : (
        <EmptyState compact title="Дисциплин нет" text="В текущем семестре у студента нет дисциплин в учебном плане." />
      )}
    </Block>
  );
}

const RETAKE_STATUS: Record<StudentCard["referrals"][number]["status"], { label: string; tone: BadgeTone }> = {
  issued: { label: "Направление выдано", tone: "brand" },
  passed: { label: "Сдано", tone: "success" },
  failed: { label: "Не сдано", tone: "danger" },
  absent: { label: "Неявка", tone: "warning" },
};

const markLabel = (m: string | null) => (m && m in MARK_LABEL ? MARK_LABEL[m as Mark] : null);

function DebtsBlock({ card }: { card: StudentCard }) {
  const debtCourses = new Set(card.debts.map((d) => d.courseId));
  const history = card.referrals.filter((r) => r.status !== "issued" && !debtCourses.has(r.courseId));
  return (
    <Block title="Долги и пересдачи" count={card.debts.length}>
      {card.debts.length || history.length ? (
        <>
          {card.debts.map((d) => {
            const ref = card.referrals.find((r) => r.courseId === d.courseId && r.status === "issued");
            const last = card.referrals.find((r) => r.courseId === d.courseId && r.status !== "issued");
            return (
              <Row key={d.id}>
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-ink">{d.title}</div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {d.semester} семестр, {markLabel(d.mark) ?? d.mark}
                    {d.attempt > 1 ? `, попытка ${d.attempt}` : ""}
                  </div>
                  {ref ? (
                    <div className="mt-1.5 text-[13px] text-ink-2">
                      {ref.attempt === 3 ? "Комиссия" : "Пересдача"} <span className="font-mono tabular">{formatDateTime(ref.startsAt)}</span>, ауд. <span className="font-mono">{ref.room}</span>
                      <div className="text-[12px] text-ink-3">
                        направление <span className="font-mono">{ref.number}</span>
                      </div>
                    </div>
                  ) : last ? (
                    <div className="mt-1.5 text-[12px] text-ink-3">
                      Последняя пересдача {formatDayMonth(last.startsAt)}: {RETAKE_STATUS[last.status].label.toLowerCase()}
                    </div>
                  ) : null}
                </div>
                {ref ? <StatusText tone="brand">Назначена</StatusText> : <StatusText tone="warning">Без даты</StatusText>}
              </Row>
            );
          })}
          {history.slice(0, 3).map((r) => (
            <Row key={r.id}>
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-ink">{r.title}</div>
                <div className="mt-0.5 text-[12px] text-ink-3">
                  {r.attempt === 3 ? "комиссия" : "пересдача"} <span className="font-mono tabular">{formatDayMonth(r.startsAt)}</span>, направление <span className="font-mono">{r.number}</span>
                  {markLabel(r.resultMark) ? `, ${markLabel(r.resultMark)}` : ""}
                </div>
              </div>
              <StatusText tone={RETAKE_STATUS[r.status].tone}>{RETAKE_STATUS[r.status].label}</StatusText>
            </Row>
          ))}
        </>
      ) : (
        <EmptyState compact title="Долгов нет" text="Все дисциплины прошлых сессий сданы." />
      )}
    </Block>
  );
}

function RequestsBlock({ card, now }: { card: StudentCard; now: Date }) {
  return (
    <Block title="Заявки" count={card.requestsTotal} action={card.requestsTotal > card.requests.length ? "Все заявки" : undefined} href={`/staff/requests?q=${encodeURIComponent(card.student.lastName)}`}>
      {card.requests.length ? (
        card.requests.map((r) => (
          <Link key={r.id} href={`/staff/requests/${r.id}`} className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-1">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-ink">{getRequestType(r.type)?.title ?? "Заявка"}</div>
              <div className="mt-0.5 text-[12px] text-ink-3">
                <span className="font-mono">{r.number}</span>, подана <span className="tabular">{stamp(r.createdAt, now)}</span>
              </div>
            </div>
            <StatusBadge status={r.status} />
          </Link>
        ))
      ) : (
        <EmptyState compact title="Заявок нет" text="Студент ещё не подавал заявки и заявления." />
      )}
    </Block>
  );
}

function SickBlock({ card }: { card: StudentCard }) {
  return (
    <Block title="Больничные" action="Все больничные" href="/staff/sick-leaves">
      {card.sickLeaves.length ? (
        card.sickLeaves.map((l) => {
          const open = l.status === "open";
          const meta = SICK_STATUS[l.status];
          return (
            <Row key={l.id}>
              <div className="min-w-0">
                <div className="text-[14px] text-ink">
                  {open ? `С ${dayLabel(l.startsOn)}${l.endsOn ? `, примерно до ${dayLabel(l.endsOn)}` : ""}` : cap(periodLabel(l.startsOn, l.endsOn))}
                </div>
                {l.reviewedAt && <div className="mt-0.5 text-[12px] text-ink-3">решение {formatDayMonth(l.reviewedAt)}</div>}
              </div>
              <StatusText tone={meta.tone}>{open ? "Болеет сейчас" : meta.label}</StatusText>
            </Row>
          );
        })
      ) : (
        <EmptyState compact title="Больничных не было" text="Студент не сообщал о болезни." />
      )}
    </Block>
  );
}

function PaymentsBlock({ card, now }: { card: StudentCard; now: Date }) {
  const p = card.payments;
  if (card.student.funding !== "contract") {
    return (
      <Block title="Оплата обучения">
        <EmptyState compact title="Бюджет" text="Студент учится на бюджетной основе, оплаты нет." />
      </Block>
    );
  }
  const rows = [...p.overdue, ...(p.next ? [p.next] : [])];
  return (
    <Block title="Оплата обучения" action="Все платежи" href={p.overdue.length ? "/staff/payments" : "/staff/payments?filter=all"}>
      {p.total === 0 ? (
        <EmptyState compact title="Графика платежей нет" text="По договору студента пока нет платежей." />
      ) : (
        <>
          {rows.length ? (
            rows.map((r) => (
              <Row key={r.id}>
                <div className="min-w-0">
                  <div className="text-[14px] text-ink">{r.period}</div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    <span className="font-mono text-ink-2 tabular">{formatRub(r.amount)}</span>, срок <span className="tabular">{formatDayMonth(r.dueAt)}</span>
                  </div>
                </div>
                <StatusText tone={PAYMENT_STATE_META[r.state].tone}>{dueHint(r, now) ?? PAYMENT_STATE_META[r.state].label}</StatusText>
              </Row>
            ))
          ) : (
            <Row>
              <div className="min-w-0">
                <div className="text-[14px] text-ink">Все платежи внесены</div>
                {p.lastPaid?.paidAt && (
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    последний: {p.lastPaid.period}, {formatDayMonth(p.lastPaid.paidAt)}
                  </div>
                )}
              </div>
              <StatusText tone="success">Без долга</StatusText>
            </Row>
          )}
          {p.contractNo && (
            <div className="px-5 py-3 text-[12px] text-ink-3">
              договор <span className="font-mono">{p.contractNo}</span>
            </div>
          )}
        </>
      )}
    </Block>
  );
}

const APPOINTMENT_TONE = { done: "success", no_show: "warning", cancelled: "neutral", booked: "neutral" } as const;

function AppointmentsBlock({ card, now }: { card: StudentCard; now: Date }) {
  const { next, past } = card.appointments;
  return (
    <Block title="Записи на приём">
      {next || past.length ? (
        <>
          {next && (
            <Link href={`/staff/appointments?day=${dayKey(next.startsAt)}`} className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-1">
              <div className="min-w-0">
                <div className="text-[14px] text-ink">
                  {cap(formatWeekday(next.startsAt))}, <span className="tabular">{formatDayMonth(next.startsAt)}</span>, <span className="font-mono tabular">{formatTime(next.startsAt)}</span>
                </div>
                <div className="mt-0.5 text-[12px] text-ink-3">
                  {topicLabel(next.topic)}, талон <span className="font-mono">{next.code}</span>
                </div>
              </div>
              <StatusText tone="brand">Ближайшая</StatusText>
            </Link>
          )}
          {past.map((a) => (
            <Row key={a.id}>
              <div className="min-w-0">
                <div className="text-[14px] text-ink">
                  <span className="tabular">{stamp(a.startsAt, now)}</span>
                </div>
                <div className="mt-0.5 text-[12px] text-ink-3">{topicLabel(a.topic)}</div>
              </div>
              <StatusText tone={APPOINTMENT_TONE[a.status]}>
                {a.status === "done" ? "Пришёл" : a.status === "no_show" ? "Не пришёл" : a.status === "booked" ? "Не отмечен" : APPOINTMENT_STATUS_LABEL[a.status]}
              </StatusText>
            </Row>
          ))}
        </>
      ) : (
        <EmptyState compact title="Записей не было" text="Студент не записывался на приём в учебный офис." />
      )}
    </Block>
  );
}

function JournalBlock({ card, now }: { card: StudentCard; now: Date }) {
  return (
    <Block title="Действия сотрудников" action="Журнал" href="/staff/audit">
      {card.journal.length ? (
        card.journal.map((e) => (
          <div key={e.id} className="px-5 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0 text-[14px] text-ink">{e.summary}</div>
              <time dateTime={e.createdAt.toISOString()} className="shrink-0 font-mono text-[12px] text-ink-3 tabular">
                {stamp(e.createdAt, now)}
              </time>
            </div>
            <div className="mt-0.5 text-[12px] text-ink-3">
              {e.actorName ?? "Сотрудник"}
              {e.position ? `, ${e.position}` : ""}
            </div>
          </div>
        ))
      ) : (
        <EmptyState compact title="Пока пусто" text="Сотрудники ещё не открывали и не меняли данные этого студента." />
      )}
    </Block>
  );
}
