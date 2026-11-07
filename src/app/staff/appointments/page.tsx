import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX, ChevronLeft, ChevronRight, Coffee } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { countScopedAppointmentsByDay, getScopedAppointmentStats, listScopedAppointmentsOn } from "@/lib/data/appointments";
import { APPOINTMENT_STATUS_LABEL, daySlots, isOfficeDay, topicLabel } from "@/lib/appointments";
import { addDays, dayKey, formatDayMonth, formatTime, isSameMskDay, MINUTE_MS, mskParts, parseDayKey, plural, startOfMskDay, WEEKDAYS_LONG, WEEKDAYS_SHORT } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusText } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { CountUp } from "@/components/motion/count-up";
import { cn } from "@/lib/utils";
import { AppointmentRowActions } from "./row-actions";

export const metadata: Metadata = { title: "Приём" };

/** Рабочие дни офиса начиная с даты (сегодня входит, если офис работает) */
function officeDays(from: Date, n: number): Date[] {
  const out: Date[] = [];
  for (let d = startOfMskDay(from), i = 0; out.length < n && i < 60; d = addDays(d, 1), i++) if (isOfficeDay(d)) out.push(d);
  return out;
}

function shiftOfficeDay(day: Date, dir: 1 | -1): Date {
  let d = addDays(day, dir);
  for (let i = 0; i < 14 && !isOfficeDay(d); i++) d = addDays(d, dir);
  return d;
}

const STATUS_TONE = { done: "success", no_show: "warning", cancelled: "neutral", booked: "neutral" } as const;

export default async function StaffAppointmentsPage({ searchParams }: { searchParams: Promise<{ day?: string | string[] }> }) {
  const sp = await searchParams;
  const { staff } = await requireStaff();
  const now = new Date();
  const today = startOfMskDay(now);
  const strip = officeDays(today, 10);
  const selected = parseDayKey(typeof sp.day === "string" ? sp.day : null) ?? strip[0] ?? today;

  const [stats, rows, perDay] = await Promise.all([
    getScopedAppointmentStats(now),
    listScopedAppointmentsOn(selected),
    countScopedAppointmentsByDay(strip[0] ?? today, addDays(strip[strip.length - 1] ?? today, 1)),
  ]);

  const tiles = [
    { label: "Сегодня записано", value: stats.total },
    { label: "Ждём", value: stats.waiting },
    { label: "Пришли", value: stats.done },
    { label: "Не пришли", value: stats.noShow },
  ];
  const showFaculty = !staff.facultyId;
  const active = rows.filter((r) => r.status !== "cancelled").length;
  const capacity = daySlots(selected).length;
  const tomorrowStart = addDays(today, 1);
  const href = (d: Date) => `/staff/appointments?day=${dayKey(d)}`;

  return (
    <div>
      <PageHeader
        eyebrow={staff.faculty ? `Учебный офис ${staff.faculty.code}` : "Студенческий офис · все факультеты"}
        title="Приём студентов"
        subtitle="Запись вместо живой очереди: по 15 минут, в часы работы офиса"
      />

      <div className="mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-card border border-line bg-surface p-4 sm:p-5">
            <div className="text-[13px] text-ink-3">{t.label}</div>
            <div className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.03em] tabular sm:mt-3 sm:text-[32px]">
              <CountUp value={t.value} />
            </div>
          </div>
        ))}
      </div>

      {/* Полоса дней */}
      <div className="scrollbar-none -mx-5 mb-6 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        {strip.map((d) => {
          const sel = isSameMskDay(d, selected);
          const isToday = isSameMskDay(d, today);
          const n = perDay.get(dayKey(d)) ?? 0;
          return (
            <Link
              key={d.toISOString()}
              href={href(d)}
              scroll={false}
              aria-current={sel ? "date" : undefined}
              aria-label={`${formatDayMonth(d)}, записей ${n}`}
              className={cn(
                "relative flex min-w-[56px] flex-1 flex-col items-center rounded-[10px] border px-2 py-2.5 transition-colors",
                sel ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <span className={cn("text-[12px] font-medium", sel ? "text-brand-ink/75" : isToday ? "text-brand-fg" : "text-ink-3")}>{WEEKDAYS_SHORT[mskParts(d).wd]}</span>
              <span className="mt-0.5 text-[18px] font-semibold tabular">{mskParts(d).d}</span>
              <span className={cn("mt-0.5 font-mono text-[11px] tabular", sel ? "text-brand-ink/75" : "text-ink-3")}>{n}</span>
              {isToday && !sel && <span className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-brand" aria-hidden />}
            </Link>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-1">
          <Link href={href(shiftOfficeDay(selected, -1))} scroll={false} className="grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-surface-2" aria-label="Предыдущий рабочий день">
            <ChevronLeft className="size-5" />
          </Link>
          <h2 className="text-[15px] font-semibold">
            <span className="capitalize">{WEEKDAYS_LONG[mskParts(selected).wd]}</span>, {formatDayMonth(selected)}
            {isSameMskDay(selected, today) && <span className="ml-2 text-brand-fg">сегодня</span>}
          </h2>
          <Link href={href(shiftOfficeDay(selected, 1))} scroll={false} className="grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-surface-2" aria-label="Следующий рабочий день">
            <ChevronRight className="size-5" />
          </Link>
        </div>
        {capacity > 0 && (
          <span className="text-[13px] text-ink-3 tabular">
            {active} {plural(active, "запись", "записи", "записей")}
            {!showFaculty && `, свободно ${Math.max(0, capacity - rows.filter((r) => r.status === "booked").length)} из ${capacity}`}
          </span>
        )}
      </div>

      {!isOfficeDay(selected) ? (
        <Card>
          <EmptyState icon={Coffee} title="Офис не работает" text="Выходной или праздничный день, записи на него нет." />
        </Card>
      ) : rows.length ? (
        <Card className="divide-y divide-line stagger-rows">
          {rows.map((r) => {
            const end = new Date(r.startsAt.getTime() + r.durationMin * MINUTE_MS);
            const live = r.status === "booked" && r.startsAt <= now && end > now;
            const booked = r.status === "booked";
            return (
              <div key={r.id} className={cn("flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between", r.status === "cancelled" && "text-ink-3")}>
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="w-12 shrink-0">
                    <div className={cn("font-mono text-[14px] font-medium tabular", live && "text-brand-fg", r.status === "cancelled" && "line-through")}>{formatTime(r.startsAt)}</div>
                    <div className="mt-0.5 text-[11px] text-ink-3">{live ? "сейчас" : `${r.durationMin} мин`}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Link href={`/staff/students/${r.studentId}`} prefetch={false} className="text-[14px] font-medium text-ink hover:underline">
                        {r.lastName} {r.firstName}
                      </Link>
                      <span className="text-[13px] text-ink-3">
                        {r.groupCode}, {r.course} курс{showFaculty && `, ${r.facultyCode}`}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-2">{topicLabel(r.topic)}</div>
                    {r.comment && <p className="mt-1 text-[13px] leading-relaxed break-words text-ink-3">{r.comment}</p>}
                    <div className="mt-1 text-[12px] text-ink-3">
                      талон <span className="font-mono text-ink-2">{r.code}</span>
                    </div>
                  </div>
                </div>
                <div className="sm:pl-16 md:max-w-[360px] md:shrink-0 md:pl-0 md:text-right">
                  {booked ? (
                    <AppointmentRowActions id={r.id} canMark={r.startsAt < tomorrowStart} canCancel={end > now} />
                  ) : (
                    <div>
                      <StatusText tone={STATUS_TONE[r.status]}>{r.status === "done" ? "Пришёл" : r.status === "no_show" ? "Не пришёл" : APPOINTMENT_STATUS_LABEL[r.status]}</StatusText>
                      {r.status === "cancelled" && <div className="mt-1 text-[12px] text-ink-3">{r.cancelReason ? `Офис: ${r.cancelReason}` : "Отменил студент"}</div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      ) : (
        <Card>
          <EmptyState icon={CalendarX} title="Записей нет" text="На этот день студенты пока не записались. Все слоты свободны." />
        </Card>
      )}
    </div>
  );
}
