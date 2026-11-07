"use client";

import { useActionState, useId, useState, useTransition, type ReactNode } from "react";
import { LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { createRetakeSessionAction, suggestRetakeSlotAction, type RetakeActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { RETAKE_RULES, type RetakeAttempt } from "@/lib/retakes";

const ATTEMPT_NAME: Record<RetakeAttempt, string> = { 2: "Вторая", 3: "Третья" };

type Props = {
  anchorId: string;
  courseId: string;
  attempt: RetakeAttempt;
  teacher: string;
  /** минимальная дата в календаре (завтра по Москве) */
  minDate: string;
  canAssign: boolean;
  children: ReactNode;
};

/** Строка «Долги по дисциплинам»: содержимое рендерит сервер, здесь кнопка «Назначить» и форма под строкой. */
export function DebtRow({ anchorId, courseId, attempt, teacher, minDate, canAssign, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div id={anchorId} className="scroll-mt-24 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">{children}</div>
        {canAssign && (
          <Button
            variant={open ? "ghost" : attempt === 3 ? "primary" : "secondary"}
            size="sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={`${id}-form`}
            className="shrink-0 self-start"
          >
            {open ? "Свернуть" : attempt === 3 ? "Назначить комиссию" : "Назначить"}
          </Button>
        )}
      </div>
      {open && <AssignForm formId={`${id}-form`} courseId={courseId} attempt={attempt} teacher={teacher} minDate={minDate} onDone={() => setOpen(false)} />}
    </div>
  );
}

function AssignForm({ formId, courseId, attempt: initialAttempt, teacher, minDate, onDone }: { formId: string; courseId: string; attempt: RetakeAttempt; teacher: string; minDate: string; onDone: () => void }) {
  const [attempt, setAttempt] = useState<RetakeAttempt>(initialAttempt);
  const [date, setDate] = useState("");
  const [time, setTime] = useState<string>(RETAKE_RULES.defaultTime);
  const [room, setRoom] = useState("");
  const [commission, setCommission] = useState<string[]>(initialAttempt === 3 ? [teacher, "", ""] : [teacher]);
  const [reason, setReason] = useState<string | null>(null);
  const [suggesting, startSuggest] = useTransition();

  const [, action, pending] = useActionState<RetakeActionState, FormData>(async (prev, fd) => {
    const res = await createRetakeSessionAction(prev, fd);
    if (res?.ok) {
      toast.success("Пересдача в графике", { description: res.ok });
      onDone();
    } else if (res?.error) toast.error(res.error);
    return res;
  }, undefined);

  function suggest() {
    startSuggest(async () => {
      const res = await suggestRetakeSlotAction(courseId, time);
      if (res.ok) {
        setDate(res.date);
        if (res.room) setRoom(res.room);
        setReason(res.reason);
      } else {
        setReason(null);
        toast.error(res.error);
      }
    });
  }

  const min = RETAKE_RULES.commissionMin[attempt] ?? 1;
  const setMember = (i: number, v: string) => setCommission((list) => list.map((x, j) => (j === i ? v : x)));

  return (
    <form id={formId} action={action} className="mt-4 space-y-4 border-t border-line pt-4">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Попытка" htmlFor={`${formId}-attempt`} hint={attempt === 3 ? "комиссия" : "у преподавателя"}>
          <Select
            id={`${formId}-attempt`}
            name="attempt"
            value={attempt}
            onChange={(e) => {
              const next = Number(e.target.value) as RetakeAttempt;
              setAttempt(next);
              if (next === 3 && commission.length < 3) setCommission((list) => [...list, ...Array(3 - list.length).fill("")]);
            }}
          >
            {([2, 3] as const).map((a) => (
              <option key={a} value={a}>
                {ATTEMPT_NAME[a]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Дата" htmlFor={`${formId}-date`} required>
          <Input id={`${formId}-date`} type="date" name="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} required className="font-mono tabular" />
        </Field>
        <Field label="Начало" htmlFor={`${formId}-time`} required>
          <Input
            id={`${formId}-time`}
            type="time"
            name="time"
            min={RETAKE_RULES.earliestStart}
            max={RETAKE_RULES.latestStart}
            step={300}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="font-mono tabular"
          />
        </Field>
        <Field label="Аудитория" htmlFor={`${formId}-room`} required>
          <Input id={`${formId}-room`} name="room" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={20} placeholder="3018" required className="font-mono" />
        </Field>
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Button variant="secondary" size="sm" onClick={suggest} disabled={suggesting} className="shrink-0">
          {suggesting ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5 text-ink-3" aria-hidden />}
          Предложить дату
        </Button>
        <p className="min-w-0 text-[12px] leading-relaxed text-ink-3 sm:flex-1" aria-live="polite">
          {reason ?? `Подберём рабочий день через ${RETAKE_RULES.suggestFromDays}-${RETAKE_RULES.suggestToDays} дней без пар у группы и преподавателя в выбранное время и свободную аудиторию`}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13px] font-medium text-ink">
          Комиссия
          <span className="ml-1.5 font-normal text-ink-3">{attempt === 3 ? `не меньше ${min} человек` : "преподаватель дисциплины, можно добавить ещё"}</span>
        </legend>
        {commission.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              name="commission"
              value={name}
              onChange={(e) => setMember(i, e.target.value)}
              maxLength={80}
              placeholder="Фамилия И. О."
              aria-label={`Член комиссии ${i + 1}`}
              required={i < min}
            />
            {i > 0 && (
              <Button variant="ghost" size="icon" onClick={() => setCommission((list) => list.filter((_, j) => j !== i))} aria-label="Убрать из комиссии">
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {commission.length < RETAKE_RULES.commissionMax && (
          <Button variant="ghost" size="sm" onClick={() => setCommission((list) => [...list, ""])}>
            <Plus className="size-3.5" aria-hidden />
            Добавить члена комиссии
          </Button>
        )}
      </fieldset>

      <Field label="Примечание для студентов" htmlFor={`${formId}-note`} hint="Например: при себе зачётная книжка">
        <Input id={`${formId}-note`} name="note" maxLength={RETAKE_RULES.noteMax} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[12px] text-ink-3">Попадёт в график черновиком. Студенты узнают дату, когда вы выпустите направления.</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDone}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
            Добавить в график
          </Button>
        </div>
      </div>
    </form>
  );
}
