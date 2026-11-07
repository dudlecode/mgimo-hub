"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCheck, LoaderCircle, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cancelRequestAction, confirmReceivedAction, replyRequestAction, type ReplyState } from "@/app/(student)/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useMessages } from "@/lib/i18n/client";
import { requestsMessages } from "@/lib/i18n/messages/requests";

function Pending({ children, variant = "primary" as const }: { children: React.ReactNode; variant?: "primary" | "danger" | "secondary" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

export function CancelButton({ id }: { id: string }) {
  const t = useMessages(requestsMessages);
  return (
    <form
      action={cancelRequestAction}
      onSubmit={(e) => {
        if (!confirm(t.cancelConfirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Pending variant="ghost">
        <Undo2 className="size-4" aria-hidden />
        {t.cancel}
      </Pending>
    </form>
  );
}

export function ConfirmReceived({ id }: { id: string }) {
  const t = useMessages(requestsMessages);
  return (
    <form action={confirmReceivedAction}>
      <input type="hidden" name="id" value={id} />
      <Pending variant="secondary">
        <CheckCheck className="size-4" aria-hidden />
        {t.received}
      </Pending>
    </form>
  );
}

export function ReplyForm({ id }: { id: string }) {
  const t = useMessages(requestsMessages);
  const [state, action] = useActionState<ReplyState, FormData>(replyRequestAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      toast.success(t.replySent);
      ref.current?.reset();
    }
  }, [state, t]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="reply" className="sr-only">
        {t.yourReply}
      </label>
      <Textarea id="reply" name="message" placeholder={t.replyPlaceholder} maxLength={1000} required className="min-h-24" />
      {state?.error && <p className="text-[13px] font-medium text-danger">{state.error}</p>}
      <Pending>
        <Send className="size-4" aria-hidden />
        {t.send}
      </Pending>
    </form>
  );
}
