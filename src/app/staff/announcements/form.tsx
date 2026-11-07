"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createAnnouncementAction, deleteAnnouncementAction, type StaffActionState } from "@/app/staff/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="size-4.5 animate-spin" /> : <Send className="size-4.5" />}
      Опубликовать
    </Button>
  );
}

const CATEGORIES = [
  ["study", "Учёба"],
  ["scholarship", "Стипендия"],
  ["events", "События"],
  ["mobility", "Обмен"],
  ["campus", "Кампус"],
  ["office", "Учебный офис"],
] as const;

/**
 * Новое объявление: слева текст, справа «кому» и предпросмотр уведомления.
 * Поля управляемые, чтобы предпросмотр и строка «Получат» менялись сразу; после публикации всё сбрасывается.
 */
export function AnnouncementForm({
  canAll,
  faculties,
  groups,
}: {
  canAll: boolean;
  faculties: { id: string; label: string; code: string }[];
  groups: { id: string; label: string; code: string; facultyId: string }[];
}) {
  const initialFaculty = canAll ? "" : (faculties[0]?.id ?? "");
  const [faculty, setFaculty] = useState(initialFaculty);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [course, setCourse] = useState("");
  const [group, setGroup] = useState("");
  const [important, setImportant] = useState(false);
  // после успешной публикации поля очищаются прямо в обработчике отправки, а не в эффекте
  const [state, action] = useActionState<StaffActionState, FormData>(async (prev, fd) => {
    const res = await createAnnouncementAction(prev, fd);
    if (res?.ok) {
      setTitle("");
      setBody("");
      setCourse("");
      setGroup("");
      setImportant(false);
      setFaculty(initialFaculty);
    }
    return res;
  }, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.ok);
      ref.current?.reset();
    } else if (state?.error) toast.error(state.error);
  }, [state]);
  const visibleGroups = groups.filter((g) => !faculty || g.facultyId === faculty);
  const groupCode = groups.find((g) => g.id === group)?.code;
  const facultyCode = faculties.find((f) => f.id === faculty)?.code;
  const audience = groupCode ? `группа ${groupCode}` : [facultyCode ?? "все факультеты", course ? `${course} курс` : "все курсы"].join(", ");
  const firstLine = body.split("\n")[0].trim();

  return (
    <Card className="overflow-hidden">
      <form ref={ref} action={action} className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5 p-6 sm:p-7">
          <h2 className="text-[16px] font-semibold">Новое объявление</h2>
          <Field label="Заголовок" htmlFor="a-title" required>
            <Input id="a-title" name="title" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Перенос консультации по макроэкономике" required />
          </Field>
          <Field label="Текст" htmlFor="a-body" required hint="Первая строка попадёт в уведомление">
            <Textarea id="a-body" name="body" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} required className="min-h-44 lg:min-h-56" />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[14px]">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="important" checked={important} onChange={(e) => setImportant(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Важное (красная метка)
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="pinned" className="size-4 accent-[var(--brand)]" /> Закрепить вверху ленты
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-5 border-t border-line bg-surface-1 p-6 sm:p-7 lg:border-t-0 lg:border-l">
          <h3 className="text-[14px] font-semibold">Кому</h3>
          <Field label="Факультет" htmlFor="a-fac">
            <Select
              id="a-fac"
              name="facultyId"
              value={faculty}
              onChange={(e) => {
                setFaculty(e.target.value);
                setGroup("");
              }}
              disabled={!canAll}
            >
              {canAll && <option value="">Все факультеты</option>}
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
            {!canAll && <input type="hidden" name="facultyId" value={faculty} />}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Курс" htmlFor="a-course">
              <Select id="a-course" name="course" value={course} onChange={(e) => setCourse(e.target.value)}>
                <option value="">Все курсы</option>
                {[1, 2, 3, 4].map((c) => (
                  <option key={c} value={c}>
                    {c} курс
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Группа" htmlFor="a-group">
              <Select id="a-group" name="groupId" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">Все группы</option>
                {visibleGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Категория" htmlFor="a-cat">
            <Select id="a-cat" name="category" defaultValue="study">
              {CATEGORIES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <div className="mb-2 text-[12px] text-ink-3">Так студенты увидят уведомление</div>
            <div className="rounded-[10px] border border-line bg-surface px-4 py-3.5" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3 text-[12px] text-ink-3">
                <span>MGIMO Hub</span>
                <span>сейчас</span>
              </div>
              <div className={cn("mt-1 text-[14px] leading-snug font-semibold break-words", !title && "text-ink-3")}>
                {important && <span className="mr-1.5 inline-block size-1.5 -translate-y-0.5 rounded-full bg-danger" aria-hidden />}
                {title || "Заголовок объявления"}
              </div>
              <div className={cn("mt-0.5 line-clamp-2 text-[13px] leading-snug break-words", firstLine ? "text-ink-2" : "text-ink-3")}>{firstLine || "Первая строка текста"}</div>
            </div>
          </div>

        </div>

        {/* Нижняя полоса на всю ширину: кому уйдёт и кнопка, обе колонки заканчиваются на одной линии */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 sm:px-7 lg:col-span-2">
          <span className="text-[13px] text-ink-3">
            Получат: <span className="text-ink-2">{audience}</span>
          </span>
          <Submit />
        </div>
      </form>
    </Card>
  );
}

function DeleteSubmit({ title }: { title: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-danger-soft hover:text-danger disabled:opacity-60"
      aria-label={`Удалить «${title}»`}
      title="Удалить"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}

/** Удаление с подтверждением: объявление пропадает из ленты у всех адресатов. */
export function DeleteAnnouncement({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={async (fd) => {
        await deleteAnnouncementAction(fd);
        toast.success("Объявление удалено");
      }}
      onSubmit={(e) => {
        if (!window.confirm(`Удалить объявление «${title}»? Студенты больше не увидят его в ленте.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <DeleteSubmit title={title} />
    </form>
  );
}
