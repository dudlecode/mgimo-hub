import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import { getGroupLessonsOn, listScopedGroups } from "@/lib/data/staff";
import { addDays, dayKey, formatDayMonth, formatTime, mskParts, parseDayKey, startOfMskDay, WEEKDAYS_LONG } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LessonEditor } from "./editor";

export const metadata: Metadata = { title: "Расписание" };

const STATUS: Record<string, { label: string; tone: "warning" | "danger" | "info" }> = {
  cancelled: { label: "Отменено", tone: "danger" },
  moved: { label: "Перенесено", tone: "warning" },
  room_changed: { label: "Другая аудитория", tone: "warning" },
  teacher_changed: { label: "Замена", tone: "info" },
};

export default async function StaffSchedulePage({ searchParams }: { searchParams: Promise<{ group?: string; day?: string }> }) {
  const sp = await searchParams;
  const groups = await listScopedGroups();
  const groupId = groups.some((g) => g.id === sp.group) ? sp.group! : groups[0]?.id;
  let day = parseDayKey(sp.day) ?? startOfMskDay(new Date());
  if (!sp.day && mskParts(day).wd >= 5) day = addDays(day, 7 - mskParts(day).wd);
  const data = groupId ? await getGroupLessonsOn(groupId, day) : null;
  const href = (d: Date) => `/staff/schedule?group=${groupId}&day=${dayKey(d)}`;
  const now = new Date();

  return (
    <div >
      <PageHeader title="Изменения расписания" subtitle="Студенты группы получат уведомление сразу после изменения" />
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[200px] flex-1">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Группа</span>
          <select name="group" defaultValue={groupId} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[15px]">
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.faculty.code}, {g.course} курс
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Дата</span>
          <input type="date" name="day" defaultValue={dayKey(day)} className="h-11 rounded-ctl border border-line bg-surface px-3 text-[15px]" />
        </label>
        <button type="submit" className="h-11 rounded-ctl bg-brand px-4 text-[15px] font-semibold text-brand-ink">
          Показать
        </button>
      </form>

      <div className="mb-3 flex items-center gap-2">
        <Link href={href(addDays(day, -1))} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Предыдущий день">
          <ChevronLeft className="size-5" />
        </Link>
        <h2 className="text-[16px] font-semibold">
          <span className="capitalize">{WEEKDAYS_LONG[mskParts(day).wd]}</span>, {formatDayMonth(day)}
        </h2>
        <Link href={href(addDays(day, 1))} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Следующий день">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      {data && data.lessons.length ? (
        <div className="space-y-3">
          {data.lessons.map((l) => {
            const st = STATUS[l.status];
            return (
              <Card key={l.id} className={cn("p-4", l.status === "cancelled" && "border-dashed")}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-14 shrink-0 tabular">
                    <div className="font-semibold">{formatTime(l.startsAt)}</div>
                    <div className="text-[12px] text-ink-3">{l.pairNo} пара</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{l.title}</span>
                      {l.langGroup && <Badge tone="neutral">{l.langGroup}</Badge>}
                      {st && <Badge tone={st.tone}>{st.label}</Badge>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-2">
                      ауд. {l.room}
                      {l.prevRoom && <span className="text-ink-3"> (была {l.prevRoom})</span>} · {l.tLast}
                      {l.changeNote && <span className="text-ink-3"> · {l.changeNote}</span>}
                    </div>
                  </div>
                  <LessonEditor lessonId={l.id} status={l.status} dayKey={dayKey(l.startsAt)} past={l.endsAt < now} />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={CalendarX} title="Занятий нет" text="В этот день у группы нет пар. Выберите другую дату." />
        </Card>
      )}
    </div>
  );
}
