import type { Metadata } from "next";
import Link from "next/link";
import { Award, BookOpen, CalendarClock, ChevronRight, GraduationCap, MapPin, ScrollText, Trophy, Users } from "lucide-react";
import { requireStudent } from "@/lib/auth/dal";
import { getAcademicRating, getCurrentSemester, getGroupRank, getTranscript, scholarshipStatus, transcriptStats, type CourseOverview } from "@/lib/data/grades";
import { listMyRequests } from "@/lib/data/requests";
import { listMyRetakeReferrals, type MyRetake } from "@/lib/data/retakes";
import { studySummary } from "@/lib/grades-summary";
import { controlLabel, GRADE_RULES, isFailing, neededOnExam, standingMeta, type Mark } from "@/lib/grades";
import { semesterLabel } from "@/lib/academic";
import { MarkBadge } from "@/components/feature/mark-badge";
import { diffDays, formatDateTime, formatDayMonth, formatTime, relativeDayLabel } from "@/lib/time";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/feature/request-bits";
import { SegmentedTabs } from "@/components/motion/segmented-tabs";
import { cn, formatPoints } from "@/lib/utils";
import { getLocale, getMessages } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { gradesMessages } from "@/lib/i18n/messages/grades";
import { personName } from "@/lib/i18n/translit";

type T = (typeof gradesMessages)["ru"];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(gradesMessages)).title };
}

const TABS = [{ key: "semester" }, { key: "session" }, { key: "record" }] as const;

/** 4,25 / 4.25 */
const decimal = (n: number, locale: Locale) => (locale === "en" ? n.toFixed(2) : n.toFixed(2).replace(".", ","));

export default async function GradesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? (rawTab as (typeof TABS)[number]["key"]) : "semester";
  const { student } = await requireStudent();
  const locale = await getLocale();
  const t = await getMessages(gradesMessages);
  const now = new Date();

  const [{ semester, semesterNo, courses }, transcript, rank, rating, requests, retakes] = await Promise.all([
    getCurrentSemester(),
    getTranscript(),
    getGroupRank(),
    getAcademicRating(),
    listMyRequests(),
    listMyRetakeReferrals(),
  ]);
  const stats = transcriptStats(transcript);
  const scholarship = scholarshipStatus(student.funding, transcript, locale);
  const summary = studySummary(courses, stats.debts, scholarship.kind, locale);
  const graded = courses.filter((c) => c.possible > 0);
  const avg = graded.length ? Math.round((graded.reduce((a, c) => a + c.ratio, 0) / graded.length) * 100) : null;
  const lastUpdate = courses.reduce<Date | null>((m, c) => (c.lastGradedAt && (!m || c.lastGradedAt > m) ? c.lastGradedAt : m), null);

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle(semesterLabel(semester, locale), semesterNo)} />

      {/* Как у меня дела */}
      <Card className="mb-5 overflow-hidden">
        <div className={cn("border-b border-line px-4 py-4 sm:px-5", "")}>
          <div
            className={cn(
              "inline-flex items-center gap-2 text-[13px] font-medium",
              summary.tone === "danger" ? "text-danger" : summary.tone === "warning" ? "text-warning" : summary.tone === "success" ? "text-success" : "text-brand-fg",
            )}
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {t.how}
          </div>
          <div className="mt-2 text-[22px] leading-snug font-semibold tracking-[-0.025em]">{summary.title}</div>
          <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-ink-2">{summary.text}</p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          <Stat icon={BookOpen} label={t.stats.avg} value={avg !== null ? `${avg}%` : t.stats.none} hint={t.stats.avgHint} />
          <Stat icon={Users} label={t.stats.rank} value={rank.place ? `${rank.place}` : t.stats.none} hint={rank.total ? t.stats.rankOf(rank.total) : ""} />
          <Stat
            icon={Trophy}
            label={t.stats.rating}
            value={rating ? `${formatPoints(rating.percent, locale)}%` : t.stats.none}
            hint={rating ? t.stats.ratingBonus(formatPoints(rating.bonus, locale)) : t.stats.ratingLater}
          />
          <Stat icon={Award} label={t.stats.scholarship} value={scholarship.label} hint={scholarship.kind === "raised" ? t.stats.keepExcellent : undefined} small />
        </dl>
      </Card>

      {/* Табы */}
      {/* Все три вкладки рисуются сразу и переключаются на клиенте: без запроса к серверу и без скачка высоты */}
      <SegmentedTabs
        id="grades"
        className="mb-6"
        initial={tab}
        items={TABS.map((x) => ({ key: x.key, href: x.key === "semester" ? "/grades" : `/grades?tab=${x.key}`, label: t.tabs[x.key], dot: x.key === "session" && stats.debts.length > 0 }))}
        panels={{
          semester: (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3 text-[12px] text-ink-3">
                <span>{t.rules(GRADE_RULES.semesterMax, GRADE_RULES.examMax, GRADE_RULES.admissionMin)}</span>
                {lastUpdate && <span className="shrink-0">{t.updated(formatDayMonth(lastUpdate, locale))}</span>}
              </div>
              <Card className="divide-y divide-line stagger-rows">
                <div className="hidden grid-cols-[minmax(0,1fr)_96px_120px_150px] gap-6 px-5 py-2.5 text-[12px] text-ink-3 md:grid">
                  <span>{t.columns.course}</span>
                  <span className="text-right">{t.columns.points}</span>
                  <span>{t.columns.progress}</span>
                  <span className="text-right">{t.columns.forecast}</span>
                </div>
                {courses.length ? courses.map((c) => <CourseCard key={c.id} c={c} t={t} locale={locale} />) : <EmptyState icon={BookOpen} title={t.noCoursesTitle} text={t.noCoursesText} />}
              </Card>
            </section>
          ),
          session: <SessionTab courses={courses} debts={stats.debts} requests={requests} retakes={retakes} now={now} t={t} locale={locale} />,
          record: (
            <section>
              {transcript.length ? (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[14px] text-ink-2">
                      {t.record.gpa} <b className="text-ink tabular">{stats.gpa !== null && decimal(stats.gpa, locale)}</b> · {t.credits(stats.credits)}
                    </div>
                    <ButtonLink href="/requests/new/transcript" variant="secondary" size="sm">
                      <ScrollText className="size-4" aria-hidden />
                      {t.record.orderTranscript}
                    </ButtonLink>
                  </div>
                  <div className="space-y-3">
                    {[...new Set(transcript.map((r) => r.semester))]
                      .sort((a, b) => b - a)
                      .map((sem, i) => {
                        const rows = transcript.filter((r) => r.semester === sem);
                        const marks = rows.map((r) => Number(r.mark)).filter((x) => x >= 2);
                        const gpa = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
                        return (
                          <details key={sem} open={i === 0} className="disclosure group rounded-card border border-line bg-surface shadow-card">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                              <span className="font-semibold">{t.record.semester(sem)}</span>
                              <span className="flex items-center gap-3 text-[13px] text-ink-3">
                                {rows.some((r) => isFailing(r.mark)) && <Badge tone="danger">{t.record.debt}</Badge>}
                                {gpa && <span className="tabular">{t.record.avg(decimal(gpa, locale))}</span>}
                                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                              </span>
                            </summary>
                            <ul className="divide-y divide-line border-t border-line">
                              {rows.map((r) => (
                                <li key={r.id} className="flex items-center gap-3 px-5 py-4">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[14px] font-medium">{r.title}</div>
                                    <div className="text-[12px] text-ink-3">
                                      {controlLabel(r.controlType, locale)} · {t.credits(r.credits)} · {formatDayMonth(r.gradedAt, locale)}
                                      {r.attempt > 1 && ` · ${t.record.retake}`}
                                    </div>
                                  </div>
                                  <span className="text-[13px] text-ink-3 tabular">{r.points}</span>
                                  <MarkBadge mark={r.mark as Mark} locale={locale} />
                                </li>
                              ))}
                            </ul>
                          </details>
                        );
                      })}
                  </div>
                </>
              ) : (
                <Card>
                  <EmptyState icon={GraduationCap} title={t.record.emptyTitle} text={t.record.emptyText} />
                </Card>
              )}
            </section>
          ),
        }}
      />
    </div>
  );
}

function Stat({ label, value, hint, small }: { icon?: typeof BookOpen; label: string; value: string; hint?: string; small?: boolean }) {
  return (
    <div className="border-line px-5 py-5 odd:border-r [&:nth-child(n+3)]:border-t sm:border-r sm:last:border-r-0 sm:[&:nth-child(n+3)]:border-t-0">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className={cn("mt-2 font-semibold tracking-[-0.02em] tabular", small ? "text-[17px]" : "text-[26px] leading-none")}>{value}</dd>
      {hint && <dd className="mt-1.5 text-[12px] text-ink-3">{hint}</dd>}
    </div>
  );
}

function CourseCard({ c, t, locale }: { c: CourseOverview; t: T; locale: Locale }) {
  const meta = standingMeta(c.standing, locale);
  const need5 = c.controlType !== "credit" ? neededOnExam(c.projectedSemester, GRADE_RULES.excellent) : null;
  const remaining = GRADE_RULES.semesterMax - c.possible;
  const fromRemaining = Math.max(0, Math.ceil(GRADE_RULES.excellent - GRADE_RULES.examMax - c.earned));
  const tone = c.standing === "critical" ? "danger" : c.standing === "risk" ? "warning" : c.standing === "excellent" ? "success" : "brand";
  const toneText = { danger: "text-danger", warning: "text-warning", success: "text-success", brand: "text-ink-2" }[tone];
  const hint =
    c.possible === 0
      ? t.hint.noPoints
      : c.controlType === "credit"
        ? t.hint.creditForecast(c.projectedSemester, GRADE_RULES.semesterMax)
        : need5 !== null
          ? t.hint.examNeed(need5, GRADE_RULES.examMax)
          : fromRemaining <= remaining
            ? t.hint.remainingNeed(fromRemaining, remaining)
            : t.hint.unreachable;
  return (
    <Link
      href={`/grades/${c.id}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-1 md:grid-cols-[minmax(0,1fr)_96px_120px_150px]"
    >
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium">{c.title}</div>
        <div className="mt-0.5 truncate text-[12px] text-ink-3">
          {controlLabel(c.controlType, locale)}, {t.credits(c.credits)} · {personName(c.teacher, locale)} · {hint}
        </div>
      </div>
      <div className="text-right font-mono text-[14px] tabular">
        {formatPoints(c.earned, locale)}
        <span className="text-ink-3">/{c.possible}</span>
      </div>
      <ProgressBar value={c.earned} max={Math.max(c.possible, 1)} tone={tone} className="col-span-2 md:col-span-1" />
      <div className={cn("hidden text-right text-[13px] md:block", toneText)}>{c.possible > 0 ? meta.short : t.noData}</div>
    </Link>
  );
}

function SessionTab({
  courses,
  debts,
  requests,
  retakes,
  now,
  t,
  locale,
}: {
  courses: CourseOverview[];
  debts: { id: string; courseId: string; title: string; semester: number; points: number }[];
  requests: { id: string; type: string; status: Parameters<typeof StatusBadge>[0]["status"]; fields: Record<string, string> }[];
  retakes: MyRetake[];
  now: Date;
  t: T;
  locale: Locale;
}) {
  const exams = courses.filter((c) => c.controlType === "exam" && c.examAt).sort((a, b) => a.examAt!.getTime() - b.examAt!.getTime());
  const credits = courses.filter((c) => c.controlType !== "exam" && c.examAt).sort((a, b) => a.examAt!.getTime() - b.examAt!.getTime());

  return (
    <div className="space-y-10">
      {debts.length > 0 && (
        <section>
          <SectionTitle>{t.session.debtsTitle}</SectionTitle>
          <div className="space-y-2.5">
            {debts.map((d) => {
              const req = requests.find((r) => r.type === "retake" && r.fields.course === d.courseId && !["completed", "rejected", "cancelled"].includes(r.status));
              // выпущенное направление без результата: дата, аудитория, комиссия
              const ref = retakes.find((r) => r.courseId === d.courseId && r.status === "issued");
              return (
                <Card key={d.id} className="border-danger/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{d.title}</div>
                      <div className="text-[13px] text-ink-2">{t.session.debtLine(d.semester, d.points)}</div>
                      {ref ? (
                        <div className="mt-2.5 text-[13px] text-ink-2">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span className="inline-flex items-center gap-1 font-mono tabular text-ink">
                              <CalendarClock className="size-3.5 text-ink-3" />
                              {formatDayMonth(ref.startsAt, locale)}, {formatTime(ref.startsAt, locale)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5 text-ink-3" />
                              {t.session.room} <span className="font-mono">{ref.room}</span>
                            </span>
                            <span className="text-ink-3">{diffDays(now, ref.startsAt) > 1 ? t.session.inDays(diffDays(now, ref.startsAt)) : relativeDayLabel(ref.startsAt, now, locale)}</span>
                          </div>
                          {ref.commission.length > 0 && (
                            <div className="mt-0.5 text-ink-3">
                              {ref.commission.length > 1 ? t.session.board : t.session.examiner}: {ref.commission.map((m) => personName(m, locale)).join(", ")}
                            </div>
                          )}
                          <Link href={`/grades/retakes/${ref.id}`} className="mt-2 inline-flex text-[13px] font-semibold text-brand-fg">
                            {t.session.referral(ref.number)}
                          </Link>
                        </div>
                      ) : (
                        <>
                          <p className="mt-1.5 text-[13px] text-ink-3">{t.session.dateLater}</p>
                          {req ? (
                            <Link href={`/requests/${req.id}`} className="mt-2.5 inline-flex items-center gap-2 text-[13px] font-semibold text-brand-fg">
                              {t.session.retakeRequest} <StatusBadge status={req.status} />
                            </Link>
                          ) : (
                            <ButtonLink href={`/requests/new/retake?course=${d.courseId}`} size="sm" className="mt-3">
                              {t.session.signUp}
                            </ButtonLink>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <SessionList title={t.session.creditWeek} items={credits} now={now} t={t} locale={locale} />
      <SessionList title={t.session.exams} items={exams} now={now} t={t} locale={locale} />
    </div>
  );
}

function SessionList({ title, items, now, t, locale }: { title: string; items: CourseOverview[]; now: Date; t: T; locale: Locale }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionTitle count={items.length}>{title}</SectionTitle>
      <Card className="divide-y divide-line stagger-rows">
        {items.map((c) => {
          const days = diffDays(now, c.examAt!);
          const admission = c.possible === 0 || c.projectedSemester >= GRADE_RULES.admissionMin;
          return (
            <Link key={c.id} href={`/grades/${c.id}`} className="flex items-center gap-3.5 px-5 py-4">
              <div className="w-12 shrink-0 text-center">
                <div className="text-[20px] leading-none font-semibold tabular">{formatDayMonth(c.examAt!, locale).split(" ")[0]}</div>
                <div className="mt-0.5 text-[11px] text-ink-3 uppercase">{formatDayMonth(c.examAt!, locale).split(" ")[1]?.slice(0, 3)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{c.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5" />
                    {formatTime(c.examAt!, locale)}
                  </span>
                  {c.examRoom && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {t.session.room} {c.examRoom}
                    </span>
                  )}
                  {c.consultationAt && <span>{t.session.consultation(formatDateTime(c.consultationAt, locale))}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <Badge tone={admission ? "success" : "danger"}>{admission ? t.session.admitted : t.session.notAdmitted}</Badge>
                <div className="mt-1 text-[11px] text-ink-3">{days > 0 ? t.session.inDays(days) : relativeDayLabel(c.examAt!, now, locale)}</div>
              </div>
            </Link>
          );
        })}
      </Card>
    </section>
  );
}
