import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, Clock, Flag, Hourglass, MapPin, UserRound } from "lucide-react";
import { z } from "zod";
import { getMyCourse } from "@/lib/data/grades";
import { controlLabel, GRADE_RULES, standingMeta, type Mark } from "@/lib/grades";
import { formatDateTime, formatDayMonth, relativeDayLabel, relativeTime } from "@/lib/time";
import { Card, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar, Ring } from "@/components/ui/misc";
import { GradeCalculator } from "@/components/feature/grade-calculator";
import { MarkBadge } from "@/components/feature/mark-badge";
import { cn, formatPoints } from "@/lib/utils";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { gradesMessages } from "@/lib/i18n/messages/grades";
import { personName } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(gradesMessages)).course.metaTitle };
}

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!z.string().uuid().safeParse(courseId).success) notFound();
  const data = await getMyCourse(courseId);
  const locale = await getLocale();
  const g = await getMessages(gradesMessages);
  const t = g.course;
  const now = new Date();

  if (data.kind === "past") {
    const r = data.row;
    return (
      <div >
        <BackLink label={t.back} />
        <h1 className="font-serif text-[26px] leading-tight font-semibold tracking-[-0.02em]">{r.title}</h1>
        <p className="mt-1 text-[14px] text-ink-2">{t.pastLine(r.semester, controlLabel(r.controlType, locale), r.credits)}</p>
        <Card className="mt-5 flex items-center justify-between gap-4 p-5">
          <div>
            <div className="text-[13px] text-ink-3">{t.finalMark}</div>
            <div className="mt-1 text-[30px] leading-none font-semibold tabular">{r.points}</div>
            <div className="mt-1 text-[13px] text-ink-3">{t.gradedOn(formatDayMonth(r.gradedAt, locale))}</div>
          </div>
          <MarkBadge mark={r.mark as Mark} locale={locale} />
        </Card>
      </div>
    );
  }

  const c = data.course;
  const meta = standingMeta(c.standing, locale);
  const ringTone = c.standing === "critical" ? "danger" : c.standing === "risk" ? "warning" : c.standing === "excellent" ? "success" : "brand";
  const upcoming = c.assessments.filter((a) => a.points === null && a.dueAt > now);
  const pending = c.assessments.filter((a) => a.points === null && a.dueAt <= now);
  const graded = c.assessments.filter((a) => a.points !== null);
  // «сегодня · до 23:59», а для дальних дат без повтора: «до 13 ноября, 23:59»
  const dueText = (d: Date) => {
    const rel = relativeDayLabel(d, now, locale);
    return rel === formatDayMonth(d, locale) ? t.dueOn(formatDateTime(d, locale)) : t.due(rel, formatDateTime(d, locale));
  };

  return (
    <div >
      <BackLink label={t.back} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[26px] leading-tight font-semibold tracking-[-0.02em] lg:text-[32px]">{c.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] text-ink-2">
            <Badge tone="neutral">{controlLabel(c.controlType, locale)}</Badge>
            <span>{g.credits(c.credits)}</span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4 text-ink-3" aria-hidden />
              {personName(c.teacher, locale)}, {c.teacherPosition}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
        <div className="space-y-8">
          <Card className="flex items-center gap-5 p-5">
            <Ring value={c.earned} max={Math.max(c.possible, 1)} size={96} stroke={9} tone={ringTone}>
              <div className="text-center leading-none">
                <div className="text-[22px] font-bold tabular">{formatPoints(c.earned, locale)}</div>
                <div className="mt-1 text-[11px] text-ink-3">{t.of(c.possible)}</div>
              </div>
            </Ring>
            <div className="min-w-0">
              <Badge tone={meta.tone === "neutral" ? "neutral" : meta.tone}>{meta.label}</Badge>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                {c.possible ? (
                  <>
                    {t.forecast} <b className="text-ink">{t.forecastValue(c.projectedSemester, GRADE_RULES.semesterMax)}</b>
                    {c.projectedSemester < GRADE_RULES.admissionMin ? t.admissionShort(GRADE_RULES.admissionMin - c.projectedSemester) : "."}
                  </>
                ) : (
                  t.noPoints
                )}
              </p>
              {c.lastGradedAt && <p className="mt-1 text-[12px] text-ink-3">{t.updated(relativeTime(c.lastGradedAt, now, locale))}</p>}
            </div>
          </Card>

          <section>
            <SectionTitle>{t.assessments}</SectionTitle>
            <Card className="divide-y divide-line stagger-rows">
              {[...graded, ...pending, ...upcoming].map((a) => {
                const state = a.points !== null ? "graded" : a.dueAt <= now ? "pending" : "upcoming";
                const ratio = a.points !== null ? a.points / a.maxPoints : 0;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-4">
                    <span className={cn("shrink-0", state === "graded" ? "text-success" : state === "pending" ? "text-brand-fg" : "text-ink-3")} aria-hidden>
                      {state === "graded" ? <CheckCircle2 className="size-4" strokeWidth={1.8} /> : state === "pending" ? <Hourglass className="size-4" strokeWidth={1.8} /> : <Clock className="size-4" strokeWidth={1.8} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{a.title}</div>
                      <div className="text-[12px] text-ink-3">
                        {state === "graded"
                          ? t.graded(formatDayMonth(a.gradedAt!, locale))
                          : state === "pending"
                            ? t.pending
                            : dueText(a.dueAt)}
                      </div>
                      {state === "graded" && <ProgressBar value={a.points!} max={a.maxPoints} tone={ratio >= 0.9 ? "success" : ratio >= 0.6 ? "brand" : "warning"} className="mt-1.5 h-1.5" />}
                    </div>
                    <div className="shrink-0 text-right text-[14px] tabular">
                      {a.points !== null ? (
                        <>
                          <b className="font-semibold">{formatPoints(a.points, locale)}</b>
                          <span className="text-ink-3"> / {a.maxPoints}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">{t.of(a.maxPoints)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
            <Link
              href={`/requests/new/grade-error?course=${c.id}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-medium text-ink-3 hover:text-ink"
            >
              <Flag className="size-3.5" aria-hidden />
              {t.reportError}
            </Link>
          </section>
        </div>

        <div className="space-y-8">
          <GradeCalculator projectedSemester={c.projectedSemester} controlType={c.controlType} />
          {c.examAt && (
            <Card className="p-5">
              <div className="text-[12px] font-bold tracking-wide text-ink-3 uppercase">{controlLabel(c.controlType, locale)}</div>
              <div className="mt-1 text-[18px] font-semibold">{formatDateTime(c.examAt, locale)}</div>
              <div className="mt-2 space-y-1 text-[14px] text-ink-2">
                {c.examRoom && (
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-ink-3" />
                    {t.room} {c.examRoom}
                  </div>
                )}
                {c.consultationAt && (
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-ink-3" />
                    {t.consultation} {formatDateTime(c.consultationAt, locale)}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/grades" className="mb-4 inline-block text-[13px] text-ink-3 hover:text-ink">
      {label}
    </Link>
  );
}
