"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { markPaidAction, remindAllAction, remindPaymentAction, type PaymentActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

function Submit({ children, variant = "secondary", disabled }: { children: ReactNode; variant?: "primary" | "secondary"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending || disabled}>
      {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

function report(res: PaymentActionState) {
  if (res?.ok) toast.success(res.ok);
  else if (res?.error) toast.error(res.error);
  return !!res?.ok;
}

/** Строка платежа: содержимое рендерит сервер, здесь «Напомнить» и форма «Отметить оплату». */
export function PaymentRow({
  id,
  name,
  unpaid,
  remindBlocked,
  today,
  children,
}: {
  id: string;
  name: string;
  unpaid: boolean;
  /** подсказка, почему напомнить пока нельзя; null, если можно */
  remindBlocked: string | null;
  /** сегодняшняя дата по Москве, ГГГГ-ММ-ДД */
  today: string;
  children: ReactNode;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);

  async function remind(formData: FormData) {
    report(await remindPaymentAction(undefined, formData));
  }
  async function markPaid(formData: FormData) {
    if (report(await markPaidAction(undefined, formData))) setOpen(false);
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">{children}</div>
        {unpaid && (
          <div className="flex flex-wrap gap-1.5 sm:shrink-0 sm:justify-end">
            <form action={remind}>
              <input type="hidden" name="id" value={id} />
              <span title={remindBlocked ?? undefined}>
                <Submit disabled={!!remindBlocked}>{remindBlocked ? "Напомнили" : "Напомнить"}</Submit>
              </span>
            </form>
            <Button variant={open ? "ghost" : "secondary"} size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={`${uid}-paid`}>
              {open ? "Свернуть" : "Отметить оплату"}
            </Button>
          </div>
        )}
      </div>

      {unpaid && open && (
        <form id={`${uid}-paid`} action={markPaid} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="id" value={id} />
          <p className="mb-3 text-[13px] text-ink-2">Оплата: {name}</p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
            <Field label="Номер платёжного документа" htmlFor={`${uid}-no`} required>
              <Input id={`${uid}-no`} name="receiptNo" required minLength={3} maxLength={40} autoFocus autoComplete="off" placeholder="Например, 518204" className="font-mono" />
            </Field>
            <Field label="Дата оплаты" htmlFor={`${uid}-date`} required>
              <Input id={`${uid}-date`} name="paidOn" type="date" required defaultValue={today} max={today} className="tabular" />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[12px] text-ink-3">Студент получит уведомление, что оплата поступила</p>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Submit variant="primary">Сохранить</Submit>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

/** «Напомнить всем» по текущему фильтру: просрочено или скоро срок. */
export function RemindAllButton({ filter, count }: { filter: "overdue" | "soon"; count: number }) {
  async function run(formData: FormData) {
    report(await remindAllAction(undefined, formData));
  }
  return (
    <form action={run}>
      <input type="hidden" name="filter" value={filter} />
      <Submit disabled={count === 0}>
        {count ? (
          <>
            Напомнить всем<span className="text-ink-3 tabular">{count}</span>
          </>
        ) : (
          "Всем уже напомнили"
        )}
      </Submit>
    </form>
  );
}
