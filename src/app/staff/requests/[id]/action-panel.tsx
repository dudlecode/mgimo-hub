"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { requestAction, type StaffActionState } from "@/app/staff/actions";
import type { RequestStatus } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Kind = "take" | "start" | "ask" | "ready" | "complete" | "reject" | "comment";

function Btn({
  kind,
  label,
  variant = "secondary",
  current,
  className,
}: {
  kind: Kind;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  current: Kind | null;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="action" value={kind} variant={variant} disabled={pending} className={cn("w-full", className)}>
      {pending && current === kind && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {label}
    </Button>
  );
}

const INTENTS = [
  { key: "ask", label: "Уточнить" },
  { key: "status", label: "Статус" },
  { key: "reject", label: "Отказ" },
] as const;

export function ActionPanel({
  id,
  status,
  category,
  delivery,
  className,
}: {
  id: string;
  status: RequestStatus;
  category: "certificate" | "application";
  delivery: "electronic" | "paper";
  className?: string;
}) {
  const [state, action] = useActionState<StaffActionState, FormData>(requestAction, undefined);
  const [current, setCurrent] = useState<Kind | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.ok, { description: "Студент получил уведомление" });
      formRef.current?.reset();
    } else if (state?.error) toast.error(state.error);
  }, [state]);

  async function draft(intent: (typeof INTENTS)[number]["key"]) {
    setDrafting(intent);
    try {
      const res = await fetch("/api/staff/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "reply", requestId: id, intent }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось подготовить черновик");
      if (msgRef.current) {
        msgRef.current.value = data.text;
        msgRef.current.focus();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось подготовить черновик");
    } finally {
      setDrafting(null);
    }
  }

  if (["completed", "rejected", "cancelled"].includes(status)) {
    return (
      <Card className={cn("p-6", className)}>
        <div className="text-[14px] font-semibold">Заявка закрыта</div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Действий больше не нужно. История и сообщения студенту сохранены ниже.</p>
      </Card>
    );
  }

  const next: { kind: Kind; label: string } | null =
    status === "submitted"
      ? { kind: "take", label: "Взять в работу" }
      : status === "in_review"
        ? { kind: "start", label: category === "certificate" ? "Начать подготовку" : "Передать на согласование" }
        : status === "in_progress"
          ? { kind: "ready", label: category === "certificate" ? (delivery === "paper" ? "Готово к выдаче" : "Сформировать справку с QR") : "Одобрить" }
          : status === "ready"
            ? { kind: "complete", label: "Выдано, закрыть" }
            : null;

  return (
    <Card className={cn("flex flex-col", className)}>
      <form ref={formRef} className="flex flex-1 flex-col" action={action} onSubmitCapture={(e) => setCurrent(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as Kind)}>
        <input type="hidden" name="id" value={id} />

        <div className="space-y-3 p-6">
          <div className="text-[14px] font-semibold">Следующий шаг</div>
          {next ? <Btn kind={next.kind} label={next.label} variant="primary" current={current} /> : <p className="text-[13px] text-ink-3">Ждём ответа студента.</p>}
          {status === "in_review" && category === "certificate" && <Btn kind="ready" label={delivery === "paper" ? "Сразу готово к выдаче" : "Сразу сформировать справку"} current={current} />}
        </div>

        <div className="space-y-3 border-t border-line p-6">
          <label htmlFor="staff-msg" className="block text-[14px] font-semibold">
            Сообщение студенту
          </label>
          <Textarea ref={msgRef} id="staff-msg" name="message" maxLength={1500} placeholder="Напишите сами или попросите черновик" className="min-h-28" />
          <div className="flex items-center gap-1 text-[12px]">
            <span className="mr-1 text-ink-3">Черновик Атташе:</span>
            {INTENTS.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => draft(i.key)}
                disabled={!!drafting}
                className="inline-flex h-7 items-center gap-1 rounded-[6px] px-2 font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              >
                {drafting === i.key && <LoaderCircle className="size-3 animate-spin" aria-hidden />}
                {i.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Btn kind="comment" label="Отправить" current={current} />
            {["submitted", "in_review", "in_progress"].includes(status) ? <Btn kind="ask" label="Запросить данные" current={current} /> : <span />}
          </div>
        </div>

        {status !== "ready" && (
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line px-6 py-3.5">
            <span className="text-[12px] text-ink-3">Причину отказа напишите в сообщении</span>
            <Btn kind="reject" label="Отклонить" variant="ghost" current={current} className="w-auto text-danger hover:bg-danger-soft hover:text-danger" />
          </div>
        )}
      </form>
    </Card>
  );
}
