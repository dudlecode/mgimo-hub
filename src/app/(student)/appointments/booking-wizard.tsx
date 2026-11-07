"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { bookAppointmentAction, type BookState } from "./actions";
import type { BookingDay } from "@/lib/data/appointments";
import { COMMENT_MAX, isBeforeLunch, slotRange } from "@/lib/appointments";
import { formatDayMonth, formatWeekday, mskParts, weekdaysShort } from "@/lib/time";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { appointmentsMessages, appointmentTopics, topicLabelFor } from "@/lib/i18n/messages/appointments";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const t = useMessages(appointmentsMessages);
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={disabled || pending}>
      {pending && <LoaderCircle className="size-4.5 animate-spin" aria-hidden />}
      {pending ? t.booking : t.submit}
    </Button>
  );
}

function Step({ no, title, hint, disabled, children }: { no: number; title: string; hint?: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <section className="p-5 sm:p-7">
      <h2 className="mb-5 flex items-baseline gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
        <span className="font-mono text-[13px] font-medium text-ink-3 tabular">{no}</span>
        {title}
        {disabled && hint && <span className="ml-auto text-[12px] font-normal text-ink-3">{hint}</span>}
      </h2>
      <fieldset disabled={disabled} className={cn("min-w-0 transition-opacity duration-200", disabled && "pointer-events-none opacity-45")}>
        {children}
      </fieldset>
    </section>
  );
}

export function BookingWizard({ days, officeCode, officeRoom }: { days: BookingDay[]; officeCode: string; officeRoom: string }) {
  const locale = useLocale();
  const t = useMessages(appointmentsMessages);
  const [state, action] = useActionState<BookState, FormData>(bookAppointmentAction, undefined);
  const [topic, setTopic] = useState<string | null>(null);
  const [dayKey, setDayKey] = useState<string>(() => (days.find((d) => d.free > 0) ?? days[0])?.key ?? "");
  const [slot, setSlot] = useState<string | null>(null);

  const day = days.find((d) => d.key === dayKey) ?? days[0];
  // Выбранное время действительно, только пока оно свободно: после обновления данных занятый слот сбрасывается сам
  const chosen = day?.slots.find((x) => x.iso === slot && x.state === "free") ?? null;
  const chosenAt = chosen ? new Date(chosen.iso) : null;

  if (!days.length || !day) {
    return (
      <Card className="px-5 py-10">
        <h2 className="text-[14px] font-semibold">{t.noDaysTitle}</h2>
        <p className="mt-1 text-[13px] text-ink-3">{t.noDaysText}</p>
      </Card>
    );
  }

  const morning = day.slots.filter((x) => isBeforeLunch(new Date(x.iso)));
  const afternoon = day.slots.filter((x) => !isBeforeLunch(new Date(x.iso)));

  return (
    <Card>
      <form action={action} noValidate className="divide-y divide-line">
        <input type="hidden" name="topic" value={topic ?? ""} />
        <input type="hidden" name="startsAt" value={chosen?.iso ?? ""} />

        <Step no={1} title={t.stepTopic}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={t.stepTopic}>
            {appointmentTopics(locale).map((tp) => {
              const active = topic === tp.value;
              return (
                <button
                  key={tp.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTopic(tp.value)}
                  className={cn("rounded-[10px] border px-4 py-3.5 text-left transition-colors", active ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line-strong hover:border-ink-3")}
                >
                  <span className="block text-[14px] font-medium">{tp.label}</span>
                  <span className="mt-1 block text-[12px] leading-snug text-ink-3">{tp.hint}</span>
                </button>
              );
            })}
          </div>
        </Step>

        <Step no={2} title={t.stepTime} hint={t.stepTimeHint} disabled={!topic}>
          <div className="scrollbar-none -mx-5 mb-6 flex gap-2 overflow-x-auto px-5 sm:-mx-7 sm:px-7" role="group" aria-label={t.day}>
            {days.map((d) => {
              const date = new Date(d.iso);
              const p = mskParts(date);
              const sel = d.key === day.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={sel}
                  aria-label={t.dayAria(formatWeekday(date, locale), formatDayMonth(date, locale), d.free)}
                  onClick={() => setDayKey(d.key)}
                  className={cn(
                    "flex min-w-[58px] flex-1 flex-col items-center rounded-[10px] border px-1 py-3 transition-colors lg:min-w-0",
                    sel ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <span className={cn("text-[12px] font-medium", sel ? "text-brand-ink/75" : "text-ink-3")}>{weekdaysShort(locale)[p.wd]}</span>
                  <span className="mt-0.5 text-[18px] font-semibold tabular">{p.d}</span>
                  <span className={cn("mt-0.5 font-mono text-[11px] tabular", sel ? "text-brand-ink/75" : d.free ? "text-ink-3" : "text-ink-3/60")}>{d.free || t.none}</span>
                </button>
              );
            })}
          </div>

          <p className="mb-4 text-[13px] text-ink-2">
            <span className="capitalize">{formatWeekday(new Date(day.iso), locale)}</span>, {formatDayMonth(new Date(day.iso), locale)}
            <span className="text-ink-3"> · {t.freeOf(day.free, day.slots.length)}</span>
          </p>

          {[
            { label: t.morning, items: morning },
            { label: t.afternoon, items: afternoon },
          ]
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.label} className="mb-5 last:mb-0">
                <div className="mb-2 text-[12px] text-ink-3">{g.label}</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 lg:gap-2.5" role="group" aria-label={g.label}>
                  {g.items.map((x) => {
                    const sel = chosen?.iso === x.iso;
                    const off = x.state !== "free";
                    return (
                      <button
                        key={x.iso}
                        type="button"
                        disabled={off}
                        aria-pressed={sel}
                        aria-label={`${x.time}${x.state === "taken" ? t.slotTaken : x.state === "mine" ? t.slotMine : x.state === "closed" ? t.slotClosed : ""}`}
                        title={x.state === "mine" ? t.titleMine : x.state === "taken" ? t.titleTaken : undefined}
                        onClick={() => setSlot(x.iso)}
                        className={cn(
                          "h-11 rounded-ctl border font-mono text-[14px] tabular transition-colors",
                          sel
                            ? "border-brand bg-brand text-brand-ink"
                            : x.state === "free"
                              ? "border-line-strong bg-surface hover:border-ink-3"
                              : x.state === "mine"
                                ? "border-brand/40 text-brand-fg"
                                : "border-transparent bg-surface-2 text-ink-3 line-through",
                        )}
                      >
                        {x.time}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </Step>

        <Step no={3} title={t.stepConfirm} hint={t.stepConfirmHint} disabled={!topic || !chosenAt}>
          <dl className="mb-5 grid grid-cols-[minmax(0,1fr)] gap-3 rounded-[10px] bg-surface-1 px-4 py-3.5 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-ink-3">{t.topic}</dt>
              <dd className="mt-0.5 font-medium">{topic ? topicLabelFor(topic, locale) : t.notChosenTopic}</dd>
            </div>
            <div>
              <dt className="text-ink-3">{t.when}</dt>
              <dd className="mt-0.5 font-medium">
                {chosenAt ? (
                  <>
                    {formatDayMonth(chosenAt, locale)}, <span className="font-mono tabular">{slotRange(chosenAt)}</span>
                  </>
                ) : (
                  t.notChosenTime
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">{t.where}</dt>
              <dd className="mt-0.5 font-medium">
                {t.whereOffice(officeCode)} <span className="font-mono">{officeRoom}</span>
              </dd>
            </div>
          </dl>

          <Field label={t.commentLabel} htmlFor="appt-comment" hint={t.commentHint}>
            <Textarea id="appt-comment" name="comment" maxLength={COMMENT_MAX} defaultValue={state?.comment ?? ""} className="min-h-20" placeholder={t.commentPlaceholder} />
          </Field>

          <div aria-live="polite" className="mt-4 empty:hidden">
            {state?.error && (
              <div className="flex items-start gap-2.5 rounded-ctl bg-danger-soft px-3.5 py-3 text-[14px] font-medium text-danger">
                <CircleAlert className="mt-0.5 size-4.5 shrink-0" aria-hidden />
                {state.error}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-relaxed text-ink-3">{t.footer}</p>
            <Submit disabled={!topic || !chosenAt} />
          </div>
        </Step>
      </form>
    </Card>
  );
}
