"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Ban, CalendarClock, DoorOpen, LoaderCircle, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { changeLessonAction, type StaffActionState } from "@/app/staff/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending && <LoaderCircle className="size-4 animate-spin" />}
      {label}
    </Button>
  );
}

function RestoreButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Вернуть как было
    </Button>
  );
}

export function LessonEditor({ lessonId, status, dayKey, past }: { lessonId: string; status: string; dayKey: string; past: boolean }) {
  const [mode, setMode] = useState<null | "cancel" | "room" | "move">(null);
  const [, action] = useActionState<StaffActionState, FormData>(async (prev, fd) => {
    const res = await changeLessonAction(prev, fd);
    if (res?.ok) {
      toast.success(res.ok);
      setMode(null);
    } else if (res?.error) toast.error(res.error);
    return res;
  }, undefined);

  if (past) return <span className="text-[12px] text-ink-3">прошло</span>;

  // На узком экране кнопки уходят отдельной строкой под название пары, чтобы не сжимать текст
  const row = "flex w-full flex-wrap gap-1.5 pl-[68px] sm:w-auto sm:pl-0";

  if (!mode) {
    return (
      <div className={row}>
        {status === "scheduled" ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setMode("room")}>
              <DoorOpen className="size-4" /> Аудитория
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("move")}>
              <CalendarClock className="size-4" /> Перенос
            </Button>
            <Button size="sm" variant="danger" onClick={() => setMode("cancel")}>
              <Ban className="size-4" /> Отмена
            </Button>
          </>
        ) : (
          <form action={action}>
            <input type="hidden" name="lessonId" value={lessonId} />
            <input type="hidden" name="kind" value="restore" />
            <RestoreButton />
          </form>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-[10px] bg-surface-2 p-3">
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="kind" value={mode} />
      {mode === "room" && <Input name="room" placeholder="Новая аудитория, напр. 4105" className="h-10 max-w-[220px]" required />}
      {mode === "move" && (
        <>
          <Input type="date" name="date" defaultValue={dayKey} className="h-10 max-w-[170px]" required />
          <Select name="pair" defaultValue="5" className="h-10 w-[150px]">
            {[1, 2, 3, 4, 5, 6].map((p) => (
              <option key={p} value={p}>
                {p}-я пара
              </option>
            ))}
          </Select>
        </>
      )}
      <Input name="note" placeholder={mode === "cancel" ? "Причина (обязательно)" : "Комментарий для студентов"} className="h-10 min-w-[200px] flex-1" required={mode === "cancel"} />
      <Submit label={mode === "cancel" ? "Отменить занятие" : "Сохранить"} />
      <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)} aria-label="Закрыть">
        <X className="size-4" />
      </Button>
    </form>
  );
}
