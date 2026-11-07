import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, FileCheck2, IdCard, MessageSquare } from "lucide-react";
import { requireStudent } from "@/lib/auth/dal";
import { getMyLessons, getNextLessonAfter, getUpcomingChanges } from "@/lib/data/schedule";
import { getMyDeadlines } from "@/lib/data/deadlines";
import { listMyRequests } from "@/lib/data/requests";
import { getCurrentSemester, getTranscript, transcriptStats } from "@/lib/data/grades";
import { listMyAnnouncements } from "@/lib/data/notifications";
import { getSemester, parityLabel, semesterLabel, weekOfSemester } from "@/lib/academic";
import { addDays, dayKey, formatDayMonth, formatTime, formatWeekday, greeting, relativeTime, startOfMskDay } from "@/lib/time";
import type { CourseStanding } from "@/lib/grades";
import { ACTIVE_STATUSES } from "@/lib/requests/catalog";
import { NowCard } from "@/components/feature/now-card";
import { Rise } from "@/components/motion/stagger";
import { CountUp } from "@/components/motion/count-up";
import { ChangeRow, formatLabel } from "@/components/feature/lesson";
import { DeadlineList } from "@/components/feature/deadlines";
import { RequestRow } from "@/components/feature/request-bits";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { cn, formatPoints } from "@/lib/utils";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { todayMessages } from "@/lib/i18n/messages/today";
import { personName } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(todayMessages)).metaTitle };
}

/** Сколько дедлайнов видно сразу: остальные раскрываются, чтобы ряд не уходил далеко вниз */
const DEADLINES_SHOWN = 5;
const STANDING_ORDER: CourseStanding[] = ["excellent", "good", "ok", "risk", "critical"];

/*
 * Раскладка «Сегодня» на десктопе: ряды из двух равных колонок, ячейки ряда одной высоты.
 *   ряд 1  Сейчас            | Как у меня дела
 *   ряд 2  Сегодня по расписанию | Изменения на неделе (или Мои заявки, если изменений нет)
 *   ряд 3  Дедлайны          | Мои заявки и Новости деканата
 * Вход: ячейки поднимаются по очереди слева направо, сверху вниз (Rise, шаг 60 мс).
 */
const ROW = "grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2 lg:gap-6";

export default async function TodayPage() {
  const locale = await getLocale();
  const t = await getMessages(todayMessages);
  const now = new Date();
  const dayStart = startOfMskDay(now);
  const tomorrow = addDays(dayStart, 1);

  const [{ student }, todayLessons, changes, deadlines, requests, semesterData, transcript, news] = await Promise.all([
    requireStudent(),
    getMyLessons(dayStart, tomorrow),
    getUpcomingChanges(7),
    getMyDeadlines(14),
    listMyRequests(),
    getCurrentSemester(),
    getTranscript(),
    listMyAnnouncements(3, locale),
  ]);
  const nextLesson = await getNextLessonAfter(tomorrow);

  const sem = getSemester(now);
  const week = weekOfSemester(now, sem);
  const activeRequests = requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).slice(0, 3);
  const futureChanges = changes.filter((c) => c.endsAt > now);
  const openDeadlines = deadlines.filter((d) => !d.done).length;

  const graded = semesterData.courses.filter((c) => c.possible > 0);
  const avgRatio = graded.length ? graded.reduce((a, c) => a + c.ratio, 0) / graded.length : 0;
  const risky = semesterData.courses.filter((c) => c.standing === "risk" || c.standing === "critical");
  const { debts } = transcriptStats(transcript);
  const pulse = debts.length || risky.some((c) => c.standing === "critical") ? "danger" : risky.length ? "warning" : "brand";
  const breakdown = STANDING_ORDER.map((st) => ({ st, n: graded.filter((c) => c.standing === st).length })).filter((g) => g.n > 0);
  const weekday = formatWeekday(now, locale);

  const requestsSection = (grow: boolean) => (
    <section className={cn("flex flex-col", grow && "flex-1")}>
      <SectionTitle action={t.all} href="/requests">
        {t.requestsTitle}
      </SectionTitle>
      <Card className="flex-1 divide-y divide-line stagger-rows">
        {activeRequests.length ? (
          activeRequests.map((r) => <RequestRow key={r.id} r={r} now={now} />)
        ) : (
          <EmptyState
            compact
            title={t.noRequestsTitle}
            text={t.noRequestsText}
            action={
              <Link href="/requests/new" className={buttonClass("secondary", "sm")}>
                {t.orderCertificate}
              </Link>
            }
          />
        )}
      </Card>
    </section>
  );

  const changesSection = (
    <section className="flex h-full flex-col">
      <SectionTitle count={futureChanges.length} action={t.scheduleLink} href="/schedule">
        {t.changesTitle}
      </SectionTitle>
      <Card className="flex-1 divide-y divide-line stagger-rows">
        {futureChanges.slice(0, 4).map((l) => (
          <ChangeRow key={l.id} lesson={l} locale={locale} />
        ))}
      </Card>
    </section>
  );

  const newsSection = news.length ? (
    <section className="flex flex-1 flex-col">
      <SectionTitle action={t.all} href="/notifications?tab=news">
        {t.newsTitle}
      </SectionTitle>
      <Card className="flex-1 divide-y divide-line stagger-rows">
        {news.slice(0, 3).map((n) => (
          <Link key={n.id} href={`/news/${n.id}`} className="block px-5 py-4 transition-colors hover:bg-surface-1">
            <div className="text-[14px] leading-5">
              {n.important && <span className="mr-1.5 inline-block size-1.5 -translate-y-0.5 rounded-full bg-brand" aria-label={t.important} />}
              {n.title}
            </div>
            <div className="mt-0.5 text-[12px] text-ink-3">
              {n.authorName}, {relativeTime(n.publishedAt, now, locale)}
            </div>
          </Link>
        ))}
      </Card>
    </section>
  ) : null;

  return (
    <div>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[13px] text-ink-3">{t.hello(greeting(now, locale), personName(student.firstName, locale))}</p>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.03em] lg:text-[32px]">
            {weekday.charAt(0).toUpperCase() + weekday.slice(1)}, {formatDayMonth(now, locale)}
          </h1>
          <p className="mt-1 text-[14px] text-ink-3">{week.inSemester ? t.weekLine(week.week, parityLabel(week.parity, locale)) : semesterLabel(sem, locale)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/requests/new" className={buttonClass("secondary", "sm")}>
            <FileCheck2 className="size-3.5 text-ink-3" aria-hidden />
            {t.quick.certificate}
          </Link>
          <Link href="/appointments" className={buttonClass("secondary", "sm")}>
            <CalendarClock className="size-3.5 text-ink-3" aria-hidden />
            {t.quick.appointment}
          </Link>
          <Link href="/assistant" className={buttonClass("secondary", "sm")}>
            <MessageSquare className="size-3.5 text-ink-3" aria-hidden />
            {t.quick.ask}
          </Link>
          <Link href="/documents#student-card" className={buttonClass("secondary", "sm")}>
            <IdCard className="size-3.5 text-ink-3" aria-hidden />
            {t.quick.studentCard}
          </Link>
        </div>
      </header>

      <div className="space-y-10">
        {/* Ряд 1: что идёт сейчас и общая картина по учёбе */}
        <div className={ROW}>
          <Rise i={0}>
            <NowCard lessons={todayLessons} nextLesson={nextLesson} serverNow={now.getTime()} />
          </Rise>
          <Rise i={1}>
            <section aria-labelledby="how-title" className="flex h-full flex-col rounded-card border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <h2 id="how-title" className="text-[13px] font-medium text-ink-2">
                  {t.howTitle}
                </h2>
                <Link href="/grades" className="text-[13px] text-ink-3 transition-colors hover:text-ink">
                  {t.gradesLink}
                </Link>
              </div>
              <div className="flex flex-1 flex-col px-5 py-5">
                <div className="flex items-baseline justify-between gap-3">
                  <CountUp value={Math.round(avgRatio * 100)} suffix="%" className="text-[36px] leading-none font-semibold tracking-[-0.04em] tabular" />
                  <span className={cn("text-right text-[13px] font-medium", pulse === "danger" ? "text-danger" : pulse === "warning" ? "text-warning" : "text-ink-2")}>
                    {debts.length ? t.debts(debts.length) : risky.length ? t.risky(risky.length) : t.allGood}
                  </span>
                </div>
                <ProgressBar value={avgRatio * 100} tone={pulse === "brand" ? "brand" : pulse} className="mt-4" />
                <p className="mt-2 text-[12px] text-ink-3">{graded.length ? t.avgHint(graded.length) : t.noScores}</p>
                {risky.length > 0 || debts.length > 0 ? (
                  <ul className="mt-auto space-y-2 border-t border-line pt-4 stagger-rows">
                    {debts.map((d) => (
                      <li key={d.id}>
                        <Link href="/grades?tab=session" className="flex items-baseline justify-between gap-2 text-[13px] hover:opacity-80">
                          <span className="truncate">{d.title}</span>
                          <span className="shrink-0 font-medium text-danger">{t.debt}</span>
                        </Link>
                      </li>
                    ))}
                    {risky.map((c) => (
                      <li key={c.id}>
                        <Link href={`/grades/${c.id}`} className="flex items-baseline justify-between gap-2 text-[13px] hover:opacity-80">
                          <span className="truncate">{c.title}</span>
                          <span className={cn("shrink-0 font-mono tabular", c.standing === "critical" ? "text-danger" : "text-warning")}>
                            {formatPoints(c.earned, locale)}/{c.possible}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  breakdown.length > 0 && (
                    <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-line pt-4 stagger-rows">
                      {breakdown.map((g) => (
                        <div key={g.st} className="flex flex-col-reverse">
                          <dt className="mt-1.5 text-[12px] text-ink-3">{t.standing[g.st]}</dt>
                          <dd className="text-[20px] leading-none font-semibold tabular">{g.n}</dd>
                        </div>
                      ))}
                    </dl>
                  )
                )}
              </div>
            </section>
          </Rise>
        </div>

        {/* Ряд 2: пары сегодня и что поменялось */}
        <div className={ROW}>
          <Rise i={2} className="flex flex-col">
            <section className="flex h-full flex-col">
              <SectionTitle count={todayLessons.filter((l) => !l.movedAway).length}>{t.lessonsTitle}</SectionTitle>
              <Card className="flex-1 divide-y divide-line stagger-rows">
                {todayLessons.length ? (
                  todayLessons.map((l) => {
                    const past = l.endsAt < now;
                    const live = l.startsAt <= now && l.endsAt > now;
                    const off = l.status === "cancelled" || l.movedAway;
                    return (
                      <Link
                        key={l.id}
                        href={`/schedule?day=${dayKey(l.startsAt)}`}
                        className={cn(
                          "relative flex items-baseline gap-4 px-5 py-3.5 transition-colors hover:bg-surface-1",
                          past && !live && "opacity-50",
                          live && "before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand",
                        )}
                      >
                        <span className={cn("w-11 shrink-0 font-mono text-[13px] tabular", live ? "font-medium text-brand-fg" : "text-ink-2")}>{formatTime(l.startsAt, locale)}</span>
                        <span className={cn("min-w-0 flex-1 text-[14px] leading-snug", off && "text-ink-3 line-through")}>{l.title}</span>
                        <span className="hidden shrink-0 text-[13px] text-ink-3 sm:inline">{formatLabel(l.format, locale)}</span>
                        <span className={cn("w-12 shrink-0 text-right font-mono text-[13px] tabular", l.status === "room_changed" ? "font-medium text-warning" : "text-ink-3")}>{l.room}</span>
                      </Link>
                    );
                  })
                ) : (
                  <EmptyState compact title={t.noLessonsTitle} text={t.noLessonsText} />
                )}
              </Card>
            </section>
          </Rise>
          <Rise i={3} className="flex flex-col">
            {futureChanges.length ? changesSection : requestsSection(true)}
          </Rise>
        </div>

        {/* Ряд 3: дедлайны и всё, что от деканата */}
        <div className={ROW}>
          <Rise i={4} className="flex flex-col">
            <section className="flex h-full flex-col">
              <SectionTitle count={openDeadlines}>{t.deadlinesTitle}</SectionTitle>
              <Card className="flex flex-1 flex-col">
                {deadlines.length ? <DeadlineList items={deadlines} serverNow={now.getTime()} limit={DEADLINES_SHOWN} /> : <EmptyState compact title={t.noDeadlinesTitle} text={t.noDeadlinesText} />}
              </Card>
            </section>
          </Rise>
          {(futureChanges.length > 0 || newsSection) && (
            <Rise i={5} className="flex flex-col gap-10">
              {futureChanges.length > 0 && requestsSection(!newsSection)}
              {newsSection}
            </Rise>
          )}
        </div>
      </div>
    </div>
  );
}
