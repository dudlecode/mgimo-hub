import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CheckCircle2, Clock, FileText, MessageCircle, QrCode, UserRound } from "lucide-react";
import { getMyRequest } from "@/lib/data/requests";
import { deliveryLabel, displayFieldsLocalized, getLocalizedRequestType, localizeActorName, localizeEventMessage, statusMeta, trackSteps } from "@/lib/requests/catalog-en";
import { formatDateTime, formatDayMonth, relativeTime } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import { requestsMessages } from "@/lib/i18n/messages/requests";
import { getMyCourseNamesEn } from "@/lib/data/i18n-names";

import { Card, SectionTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/feature/request-bits";
import { cn } from "@/lib/utils";
import { CancelButton, ConfirmReceived, ReplyForm } from "./request-actions";
import { personName, staffPosition } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: requestsMessages[await getLocale()].requestTitle };
}

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const r = await getMyRequest(id);
  const locale = await getLocale();
  const t = requestsMessages[locale];
  const def = getLocalizedRequestType(r.type, locale);
  const meta = statusMeta(r.status, locale);
  const now = new Date();
  const closed = ["completed", "rejected", "cancelled"].includes(r.status);
  const overdue = !closed && r.status !== "ready" && r.dueAt < now;
  const lastStaffMsg = [...r.events].reverse().find((e) => e.actor === "staff" && e.message);
  const hasDoc = !!r.verifyCode && (r.status === "ready" || r.status === "completed");
  const courseNames = locale === "en" ? new Map([...(await getMyCourseNamesEn())].flatMap(([k, v]) => (v.nameEn ? [[k, v.nameEn] as const] : []))) : undefined;
  const fields = displayFieldsLocalized(r.type, r.fields, locale, courseNames);
  // Сообщение сотрудника хранится по-русски: показываем как есть (служебное переводим) и помечаем язык
  const staffMsg = lastStaffMsg?.message && (r.status === "ready" || r.status === "needs_info" || r.status === "rejected") ? lastStaffMsg.message : null;
  const staffMsgEn = staffMsg ? localizeEventMessage(staffMsg, locale) : null;
  const statusText = staffMsg ? (staffMsgEn ?? staffMsg) : meta.hint;

  return (
    <div>
      <Link href="/requests" className="mb-4 inline-block text-[13px] text-ink-3 hover:text-ink">
        {t.back}
      </Link>

      {created && (
        <div className="mb-4 flex items-start gap-3 rounded-card border border-success/30 bg-success-soft p-4" role="status">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div>
            <div className="font-semibold text-success">{t.createdTitle(r.number)}</div>
            <p className="mt-0.5 text-[14px] text-ink-2">{t.createdText(formatDayMonth(r.dueAt, locale))}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] lg:items-start">
        <div className="space-y-8">
          <Card className="overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                <div className="min-w-0 flex-1">
                  <h1 className="font-serif text-[22px] leading-tight font-semibold tracking-[-0.01em] sm:text-[26px]">{def?.title ?? r.type}</h1>
                  <div className="mt-1 text-[13px] text-ink-3">
                    {r.number} · {t.submittedAt(formatDateTime(r.createdAt, locale))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} locale={locale} />
                {!closed && (
                  <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", overdue ? "text-danger" : "text-ink-2")}>
                    <Clock className="size-3.5" aria-hidden />
                    {r.status === "ready" ? t.readyRel(r.readyAt ? relativeTime(r.readyAt, now, locale) : "") : overdue ? t.overdue : t.dueBy(formatDayMonth(r.dueAt, locale))}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2" lang={staffMsg && !staffMsgEn ? "ru" : undefined}>
                {statusText}
              </p>

              {/* Трекер */}
              {!["rejected", "cancelled"].includes(r.status) && (
                <ol className="mt-5 grid grid-cols-5 gap-1.5" aria-label={t.stagesLabel}>
                  {trackSteps(locale).map((label, i) => {
                    const done = i < meta.step || r.status === "completed";
                    const current = i === meta.step && r.status !== "completed";
                    return (
                      <li key={label} className="min-w-0">
                        <div
                          className={cn(
                            "h-1.5 rounded-full",
                            done ? "bg-brand" : current ? (r.status === "needs_info" ? "bg-warning" : r.status === "ready" ? "bg-success" : "bg-brand animate-pulse") : "bg-surface-3",
                          )}
                        />
                        {/* На узком экране подписи пяти этапов не помещаются: видны с 640 px, ниже этап понятен по статусу над полосой */}
                        <div className={cn("sr-only mt-1.5 truncate text-[12px] font-medium sm:not-sr-only sm:block", current ? "text-ink" : done ? "text-ink-2" : "text-ink-3")}>{label}</div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {(hasDoc || r.status === "ready" || (!closed && r.status !== "in_progress")) && (
              <div className="flex flex-wrap gap-2.5 border-t border-line bg-surface-2/40 px-5 py-4 sm:px-5">
                {hasDoc && (
                  <ButtonLink href={`/requests/${r.id}/document`}>
                    <FileText className="size-4.5" aria-hidden />
                    {t.openCertificate}
                  </ButtonLink>
                )}
                {hasDoc && (
                  <ButtonLink href={`/requests/${r.id}/document#qr`} variant="secondary">
                    <QrCode className="size-4.5" aria-hidden />
                    {t.qrCheck}
                  </ButtonLink>
                )}
                {r.status === "ready" && r.delivery === "paper" && <ConfirmReceived id={r.id} />}
                {["submitted", "in_review", "needs_info"].includes(r.status) && <CancelButton id={r.id} />}
              </div>
            )}
          </Card>

          {r.status === "needs_info" && (
            <Card className="border-warning/40 p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <MessageCircle className="size-4.5 text-warning" aria-hidden />
                {t.replyTitle}
              </div>
              <ReplyForm id={r.id} />
            </Card>
          )}

          <section>
            <SectionTitle>{t.history}</SectionTitle>
            <Card className="p-5 sm:p-6">
              <ol className="relative space-y-5 border-l-2 border-line pl-5">
                {[...r.events].reverse().map((e, idx) => (
                  <li key={e.id} className="relative">
                    <span
                      className={cn(
                        "absolute top-0.5 -left-[29px] grid size-4 place-items-center rounded-full ring-4 ring-surface",
                        idx === 0 ? (e.status === "needs_info" ? "bg-warning" : e.status === "ready" ? "bg-success" : e.status === "rejected" ? "bg-danger" : "bg-brand") : "bg-line-strong",
                      )}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <div className="text-[14px] font-semibold">{e.status ? statusMeta(e.status, locale).label : e.actor === "student" ? t.yourReply : t.message}</div>
                      <time className="text-[12px] text-ink-3">{formatDateTime(e.createdAt, locale)}</time>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                      {e.actor === "staff" ? <Building2 className="size-3.5" /> : <UserRound className="size-3.5" />}
                      {e.actor === "student" ? t.you : e.actor === "system" ? localizeActorName(e.actorName, e.actor, locale) : <span lang="ru">{e.actorName}</span>}
                    </div>
                    {e.message && <EventMessage message={e.message} fromStudent={e.actor === "student"} translated={localizeEventMessage(e.message, locale)} />}
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 text-[14px] font-semibold">{t.details}</div>
            <dl className="space-y-2.5 text-[13px]">
              {fields.map((f) => (
                <div key={f.label}>
                  <dt className="text-ink-3">{f.label}</dt>
                  <dd className="mt-0.5 font-medium whitespace-pre-line" lang={f.fromData && locale === "en" && /[А-Яа-яЁё]/.test(f.value) ? "ru" : undefined}>
                    {f.value}
                  </dd>
                </div>
              ))}
              {def?.category === "certificate" && (
                <div>
                  <dt className="text-ink-3">{t.delivery}</dt>
                  <dd className="mt-0.5 font-medium">
                    {deliveryLabel(r.delivery, locale)}
                    {r.copies > 1 ? t.copiesN(r.copies) : ""}
                  </dd>
                </div>
              )}
              {r.comment && (
                <div>
                  <dt className="text-ink-3">{t.yourComment}</dt>
                  <dd className="mt-0.5 font-medium">{r.comment}</dd>
                </div>
              )}
            </dl>
          </Card>
          {r.assignedStaff && (
            <Card className="flex items-center gap-3 p-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent">
                {personName(r.assignedStaff.firstName, locale)[0]}
                {personName(r.assignedStaff.lastName, locale)[0]}
              </div>
              <div className="min-w-0">
                <div className="text-[12px] text-ink-3">{t.responsible}</div>
                <div className="text-[14px] font-semibold">{personName(`${r.assignedStaff.firstName} ${r.assignedStaff.lastName}`, locale)}</div>
                <div className="truncate text-[12px] text-ink-3" lang={locale === "en" ? undefined : "ru"}>
                  {staffPosition(r.assignedStaff.position, locale)}
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Сообщение в истории: служебное переводим, текст человека показываем как есть (ответ сотрудника по-русски). */
function EventMessage({ message, fromStudent, translated }: { message: string; fromStudent: boolean; translated: string | null }) {
  return (
    <p className={cn("mt-2 rounded-[10px] px-3.5 py-2.5 text-[14px] leading-relaxed", fromStudent ? "bg-brand-soft/60" : "bg-surface-2")} lang={translated || fromStudent ? undefined : "ru"}>
      {translated ?? message}
    </p>
  );
}
