"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { sendRadarMessageAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

function SendButton({ empty }: { empty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || empty}>
      {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      Отправить
    </Button>
  );
}

/** Строка радара: содержимое рендерит сервер, здесь только «Написать» и поле сообщения под строкой. */
export function ContactRow({ studentId, name, children }: { studentId: string; name: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [mode, setMode] = useState<"ai" | "offline" | null>(null);

  async function draft() {
    setDrafting(true);
    try {
      const res = await fetch("/api/staff/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId }) });
      const data = (await res.json().catch(() => ({}))) as { text?: string; mode?: "ai" | "offline"; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error ?? "Не удалось подготовить черновик");
      setText(data.text);
      setMode(data.mode ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось подготовить черновик");
    } finally {
      setDrafting(false);
    }
  }

  async function send(formData: FormData) {
    const res = await sendRadarMessageAction(undefined, formData);
    if (res?.ok) {
      toast.success(res.ok, { description: "Студент получил важное уведомление" });
      setText("");
      setMode(null);
      setOpen(false);
    } else if (res?.error) toast.error(res.error);
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">{children}</div>
        <Button variant={open ? "ghost" : "secondary"} size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={`${id}-form`} className="shrink-0 self-start">
          {open ? "Свернуть" : "Написать"}
        </Button>
      </div>

      {open && (
        <form id={`${id}-form`} action={send} className="mt-4 space-y-3 border-t border-line pt-4">
          <input type="hidden" name="studentId" value={studentId} />
          <label htmlFor={`${id}-msg`} className="block text-[13px] font-medium text-ink">
            Сообщение: {name}
          </label>
          <Textarea
            id={`${id}-msg`}
            name="message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1500}
            placeholder="Напишите сами или попросите черновик у Атташе"
            className="min-h-28"
            autoFocus
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[12px] text-ink-3">{mode === "offline" ? "Черновик по шаблону, проверьте перед отправкой" : mode === "ai" ? "Черновик Атташе, проверьте перед отправкой" : "Придёт студенту как важное уведомление"}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={draft} disabled={drafting}>
                {drafting ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5 text-ink-3" aria-hidden />}
                Черновик Атташе
              </Button>
              <SendButton empty={text.trim().length < 10} />
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
