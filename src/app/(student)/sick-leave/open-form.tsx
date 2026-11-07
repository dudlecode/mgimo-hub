"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { openSickLeaveAction, type OpenSickState } from "./actions";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { sickLeaveMessages } from "@/lib/i18n/messages/sick-leave";

function Submit() {
  const { pending } = useFormStatus();
  const t = useMessages(sickLeaveMessages);
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending && <LoaderCircle className="size-4.5 animate-spin" aria-hidden />}
      {pending ? t.sending : t.report}
    </Button>
  );
}

/** «Заболели?»: с какого дня, примерно до какого, комментарий. */
export function OpenSickForm({ today, earliest }: { today: string; earliest: string }) {
  const t = useMessages(sickLeaveMessages);
  const [state, action] = useActionState<OpenSickState, FormData>(async (prev, fd) => {
    const res = await openSickLeaveAction(prev, fd);
    // после успеха форма сразу сменится на экран больничного, поэтому сообщаем здесь, а не в эффекте
    if (res?.ok) toast.success(t.reportedToast, { description: t.reportedToastText });
    return res;
  }, undefined);
  const values = state?.values;
  const errors = state?.errors ?? {};
  const [start, setStart] = useState(values?.startsOn ?? today);

  return (
    <form action={action} className="space-y-6" noValidate>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-6 sm:grid-cols-2">
        <Field label={t.firstDay} htmlFor="sl-start" required error={errors.startsOn}>
          <Input
            id="sl-start"
            name="startsOn"
            type="date"
            required
            min={earliest}
            max={today}
            defaultValue={values?.startsOn ?? today}
            onChange={(e) => setStart(e.target.value || today)}
            aria-invalid={errors.startsOn ? true : undefined}
            aria-describedby={errors.startsOn ? "sl-start-error" : undefined}
            className="font-mono tabular"
          />
        </Field>
        <Field label={t.expectedEnd} htmlFor="sl-end" hint={t.expectedEndHint} error={errors.expectedEnd}>
          <Input
            id="sl-end"
            name="expectedEnd"
            type="date"
            min={start}
            defaultValue={values?.expectedEnd ?? ""}
            aria-invalid={errors.expectedEnd ? true : undefined}
            aria-describedby={errors.expectedEnd ? "sl-end-error" : undefined}
            className="font-mono tabular"
          />
        </Field>
      </div>

      <Field label={t.comment} htmlFor="sl-comment" hint={t.commentHint} error={errors.comment}>
        <Textarea
          id="sl-comment"
          name="comment"
          maxLength={500}
          defaultValue={values?.comment ?? ""}
          className="min-h-20"
          placeholder={t.commentPlaceholder}
          aria-invalid={errors.comment ? true : undefined}
          aria-describedby={errors.comment ? "sl-comment-error" : undefined}
        />
      </Field>

      <div aria-live="polite">
        {state?.error && (
          <div className="flex items-start gap-2.5 rounded-ctl bg-danger-soft px-3.5 py-3 text-[14px] font-medium text-danger">
            <CircleAlert className="mt-0.5 size-4.5 shrink-0" aria-hidden />
            {state.error}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] leading-relaxed text-ink-3">{t.openFooter}</p>
        <Submit />
      </div>
    </form>
  );
}
