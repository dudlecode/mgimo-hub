"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, LoaderCircle, Minus, Plus, Send } from "lucide-react";
import { createRequestAction, type CreateRequestState } from "@/app/(student)/actions";
import type { FieldDef } from "@/lib/requests/catalog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMessages } from "@/lib/i18n/client";
import { requestsMessages } from "@/lib/i18n/messages/requests";

type Def = {
  slug: string;
  title: string;
  category: "certificate" | "application";
  delivery: ("electronic" | "paper")[];
  copies: boolean;
  fields: FieldDef[];
};

type Options = { current: { value: string; label: string }[]; debts: { value: string; label: string }[] };

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
}

function Submit({ category }: { category: Def["category"] }) {
  const { pending } = useFormStatus();
  const t = useMessages(requestsMessages);
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Send className="size-4.5" aria-hidden />}
      {pending ? t.sending : category === "certificate" ? t.orderCertificate : t.submitApplication}
    </Button>
  );
}

export function RequestForm({ def, options, prefill }: { def: Def; options: Options; prefill: Record<string, string> }) {
  const t = useMessages(requestsMessages);
  const [state, action] = useActionState<CreateRequestState, FormData>(createRequestAction, undefined);
  const [delivery, setDelivery] = useState<string>(def.delivery.includes(prefill.delivery as "paper") ? prefill.delivery : def.delivery[0]);
  const [copies, setCopies] = useState(1);
  const errors = state?.errors ?? {};
  const values = { ...prefill, ...(state?.values ?? {}) };
  const today = todayKey();

  return (
    <Card className="flex flex-col p-6 sm:p-8">
      <form action={action} className="flex flex-1 flex-col space-y-8" noValidate>
        <input type="hidden" name="type" value={def.slug} />

        {def.fields.map((f) => {
          const id = `f-${f.name}`;
          const err = errors[f.name];
          const common = {
            id,
            name: f.name,
            "aria-invalid": err ? true : undefined,
            "aria-describedby": err ? `${id}-error` : undefined,
            defaultValue: values[f.name] ?? "",
          };
          let control: React.ReactNode;
          if (f.type === "select" || f.type === "myCourse" || f.type === "myDebt") {
            const opts = f.type === "select" ? (f.options ?? []) : f.type === "myCourse" ? options.current : options.debts;
            control = opts.length ? (
              <Select {...common}>
                <option value="" disabled>
                  {t.choose}
                </option>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="rounded-ctl border border-dashed border-line-strong px-3.5 py-3 text-[14px] text-ink-3">{f.type === "myDebt" ? t.noDebts : t.noOptions}</div>
            );
          } else if (f.type === "textarea") {
            control = <Textarea {...common} maxLength={f.maxLength} placeholder={f.placeholder} />;
          } else if (f.type === "date") {
            control = <Input {...common} type="date" min={today} />;
          } else {
            control = <Input {...common} type={f.type === "number" ? "number" : "text"} maxLength={f.maxLength} placeholder={f.placeholder} />;
          }
          return (
            <Field key={f.name} label={f.label} htmlFor={id} required={f.required} hint={f.hint} error={err}>
              {control}
            </Field>
          );
        })}

        {/* Формат получения */}
        {def.category === "certificate" && (
          <fieldset>
            <legend className="mb-2 text-[14px] font-medium">{t.howToGet}</legend>
            {def.delivery.length > 1 ? (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
                {def.delivery.map((d) => (
                  <label
                    key={d}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[10px] border p-3.5 transition-colors",
                      delivery === d ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line-strong hover:border-ink-3",
                    )}
                  >
                    <input type="radio" name="delivery" value={d} checked={delivery === d} onChange={() => setDelivery(d)} className="sr-only" />
                    <span>
                      <span className="block text-[14px] font-semibold">{d === "electronic" ? t.electronicTitle : t.paperTitle}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{d === "electronic" ? t.electronicText : t.paperText}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <>
                <input type="hidden" name="delivery" value={def.delivery[0]} />
                <p className="rounded-ctl bg-surface-2 px-3.5 py-3 text-[14px] text-ink-2">{def.delivery[0] === "paper" ? t.paperOnly : t.electronicOnly}</p>
              </>
            )}
            {errors.delivery && <p className="mt-1.5 text-[13px] font-medium text-danger">{errors.delivery}</p>}
          </fieldset>
        )}
        {def.category === "application" && <input type="hidden" name="delivery" value={def.delivery[0]} />}

        {def.copies && delivery === "paper" && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium">{t.copies}</span>
            <div className="flex items-center gap-1 rounded-ctl border border-line p-1">
              <button type="button" onClick={() => setCopies((c) => Math.max(1, c - 1))} className="grid size-9 place-items-center rounded-lg hover:bg-surface-2" aria-label={t.fewer}>
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center font-semibold tabular" aria-live="polite">
                {copies}
              </span>
              <button type="button" onClick={() => setCopies((c) => Math.min(5, c + 1))} className="grid size-9 place-items-center rounded-lg hover:bg-surface-2" aria-label={t.more}>
                <Plus className="size-4" />
              </button>
            </div>
            <input type="hidden" name="copies" value={copies} />
          </div>
        )}

        <Field label={t.commentLabel} htmlFor="f-comment" error={errors.comment} hint={t.optional}>
          <Textarea id="f-comment" name="comment" maxLength={500} defaultValue={values.comment ?? ""} className="min-h-20" placeholder={t.commentPlaceholder} />
        </Field>

        <div aria-live="polite">
          {state?.error && (
            <div className="flex items-start gap-2.5 rounded-ctl bg-danger-soft px-3.5 py-3 text-[14px] font-medium text-danger">
              <CircleAlert className="mt-0.5 size-4.5 shrink-0" aria-hidden />
              {state.error}
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] leading-relaxed text-ink-3">{t.confirmNote}</p>
          <Submit category={def.category} />
        </div>
      </form>
    </Card>
  );
}
