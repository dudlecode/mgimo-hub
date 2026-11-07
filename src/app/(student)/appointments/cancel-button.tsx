"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cancelAppointmentAction } from "./actions";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { appointmentsMessages } from "@/lib/i18n/messages/appointments";

function Pending({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-danger hover:bg-danger-soft hover:text-danger">
      {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      {label}
    </Button>
  );
}

/** Отмена своей записи. Сервер сам проверяет, что запись принадлежит студенту из сессии. */
export function CancelAppointmentButton({ id, label }: { id: string; label?: string }) {
  const t = useMessages(appointmentsMessages);
  return (
    <form
      action={cancelAppointmentAction}
      onSubmit={(e) => {
        if (!confirm(t.cancelConfirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Pending label={label ?? t.cancel} />
    </form>
  );
}
