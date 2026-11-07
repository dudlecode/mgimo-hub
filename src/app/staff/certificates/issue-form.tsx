"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { issueCertificateAction, type StaffActionState } from "@/app/staff/actions";
import type { FieldDef } from "@/lib/requests/catalog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type T = { slug: string; title: string; delivery: ("electronic" | "paper")[]; fields: FieldDef[] };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      Сформировать справку
    </Button>
  );
}

export function IssueForm({ students, types }: { students: { id: string; label: string; group: string }[]; types: T[] }) {
  const [state, action] = useActionState<StaffActionState, FormData>(issueCertificateAction, undefined);
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState("");
  const [slug, setSlug] = useState(types[0]?.slug ?? "");
  const type = types.find((t) => t.slug === slug);
  const found = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (query ? students.filter((s) => `${s.label} ${s.group}`.toLowerCase().includes(query)) : students).slice(0, 8);
  }, [q, students]);
  const chosen = students.find((s) => s.id === studentId);

  return (
    <form action={action} className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2 lg:gap-6">
      <section className="flex flex-col">
        <div className="mb-3.5 text-[14px] font-semibold">1. Студент</div>
        {/* список студентов на широком экране тянется на высоту формы справа и прокручивается внутри */}
        <Card className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-line p-4">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фамилия или группа" aria-label="Поиск студента" />
          </div>
          <ul className="max-h-[360px] divide-y divide-line overflow-auto lg:max-h-none lg:min-h-[280px] lg:flex-1 lg:basis-0">
            {found.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setStudentId(s.id)} className={cn("flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-1", studentId === s.id && "bg-brand-soft")}>
                  <span className="text-[14px]">{s.label}</span>
                  <span className="shrink-0 text-[12px] text-ink-3">{s.group}</span>
                </button>
              </li>
            ))}
            {!found.length && <li className="px-5 py-4 text-[13px] text-ink-3">Никого не нашли</li>}
          </ul>
        </Card>
        <input type="hidden" name="studentId" value={studentId} />
      </section>

      <section className="flex flex-col">
        <div className="mb-3.5 text-[14px] font-semibold">2. Справка</div>
        <Card className="flex-1 space-y-5 p-6">
          <p className="text-[13px] text-ink-3">{chosen ? `Для: ${chosen.label}, ${chosen.group}` : "Сначала выберите студента"}</p>
          <Field label="Тип" htmlFor="c-type">
            <Select id="c-type" name="type" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {types.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
          {type?.fields.map((f) => (
            <Field key={`${slug}-${f.name}`} label={f.label} htmlFor={`c-${f.name}`} required={f.required}>
              {f.type === "select" ? (
                <Select id={`c-${f.name}`} name={f.name} defaultValue="">
                  <option value="" disabled>
                    Выберите
                  </option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea id={`c-${f.name}`} name={f.name} maxLength={f.maxLength} />
              ) : (
                <Input id={`c-${f.name}`} name={f.name} type={f.type === "date" ? "date" : "text"} maxLength={f.maxLength} placeholder={f.placeholder} />
              )}
            </Field>
          ))}
          {type && type.delivery.length > 1 && (
            <Field label="Формат" htmlFor="c-delivery">
              <Select id="c-delivery" name="delivery" defaultValue="paper">
                <option value="paper">На бумаге, с печатью</option>
                <option value="electronic">Электронно, с QR</option>
              </Select>
            </Field>
          )}
          {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
          <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
            <span className="text-[12px] text-ink-3">Откроется бланк для печати, студенту придёт уведомление</span>
            <Submit />
          </div>
        </Card>
      </section>
    </form>
  );
}
