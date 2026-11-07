"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { appointmentAction, type AppointmentActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function Submit({ kind, label, variant = "secondary", className }: { kind: string; label: string; variant?: "primary" | "secondary" | "ghost" | "danger"; className?: string }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("kind") === kind;
  return (
    <Button type="submit" name="kind" value={kind} size="sm" variant={variant} disabled={pending} className={className}>
      {mine && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      {label}
    </Button>
  );
}

/** Действия по записи: явка, неявка, отмена с причиной (студент получит уведомление). */
export function AppointmentRowActions({ id, canMark, canCancel }: { id: string; canMark: boolean; canCancel: boolean }) {
  const [cancelling, setCancelling] = useState(false);
  const [, action] = useActionState<AppointmentActionState, FormData>(async (prev, fd) => {
    const res = await appointmentAction(prev, fd);
    if (res?.ok) {
      toast.success(res.ok);
      setCancelling(false);
    } else if (res?.error) toast.error(res.error);
    return res;
  }, undefined);

  if (cancelling) {
    return (
      <form action={action} className="flex w-full flex-wrap items-center gap-2 rounded-[10px] bg-surface-2 p-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="kind" value="cancel" />
        <label htmlFor={`reason-${id}`} className="sr-only">
          Причина отмены
        </label>
        <Input id={`reason-${id}`} name="reason" required minLength={3} maxLength={300} autoFocus placeholder="Причина, студент её увидит" className="h-9 min-w-0 flex-1 basis-[200px]" />
        <div className="flex gap-1.5">
          <Submit kind="cancel" label="Отменить запись" variant="danger" />
          <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>
            Назад
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      {canMark && (
        <>
          <Submit kind="done" label="Пришёл" />
          <Submit kind="no_show" label="Не пришёл" />
        </>
      )}
      {canCancel && (
        <Button size="sm" variant="ghost" onClick={() => setCancelling(true)} className={cn("text-danger hover:bg-danger-soft hover:text-danger")}>
          Отменить
        </Button>
      )}
    </form>
  );
}
