"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { approveSickLeaveAction, rejectSickLeaveAction, type SickReviewState } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

function Submit({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

/** «Засчитать» и «Отклонить» с причиной для больничного на проверке. */
export function ReviewActions({ id }: { id: string }) {
  // строка может исчезнуть из списка сразу после решения, поэтому сообщаем прямо в обёртке экшена
  const [, approve] = useActionState<SickReviewState, FormData>(async (prev, fd) => {
    const res = await approveSickLeaveAction(prev, fd);
    if (res?.ok) toast.success(res.ok);
    else if (res?.error) toast.error(res.error);
    return res;
  }, undefined);
  const [rejectState, reject] = useActionState<SickReviewState, FormData>(async (prev, fd) => {
    const res = await rejectSickLeaveAction(prev, fd);
    if (res?.ok) toast.success(res.ok);
    return res;
  }, undefined);
  const [rejecting, setRejecting] = useState(false);

  if (rejecting) {
    return (
      <form action={reject} className="mt-3 space-y-2.5">
        <input type="hidden" name="id" value={id} />
        <label htmlFor={`reason-${id}`} className="block text-[13px] font-medium">
          Причина отказа
        </label>
        <Textarea
          id={`reason-${id}`}
          name="reason"
          required
          minLength={3}
          maxLength={300}
          autoFocus
          className="min-h-20"
          placeholder="Например: на справке нет печати медицинской организации"
          aria-invalid={rejectState?.error ? true : undefined}
          aria-describedby={rejectState?.error ? `reason-${id}-error` : undefined}
        />
        {rejectState?.error && (
          <p id={`reason-${id}-error`} className="text-[12px] font-medium text-danger" role="alert">
            {rejectState.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Submit variant="danger">Отклонить</Submit>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            Отмена
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <form action={approve}>
        <input type="hidden" name="id" value={id} />
        <Submit>Засчитать</Submit>
      </form>
      <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
        Отклонить
      </Button>
    </div>
  );
}
