"use client";

import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { deleteRetakeDraftAction, publishRetakeSessionAction, recordRetakeResultAction, type RetakeActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { plural } from "@/lib/time";
import type { RetakeResult } from "@/lib/retakes";

function useToastAction(fn: (prev: RetakeActionState, fd: FormData) => Promise<RetakeActionState>, onOk?: (res: NonNullable<RetakeActionState>) => void) {
  return useActionState<RetakeActionState, FormData>(async (prev, fd) => {
    const res = await fn(prev, fd);
    if (res?.ok) {
      toast.success(res.ok);
      onOk?.(res);
    } else if (res?.error) toast.error(res.error);
    return res;
  }, undefined);
}

/** «Выпустить направления»: в два касания, чтобы уведомления не ушли случайно. */
export function PublishButton({ sessionId, count, label = "Выпустить направления" }: { sessionId: string; count: number; label?: string }) {
  const [confirm, setConfirm] = useState(false);
  const [, action, pending] = useToastAction(publishRetakeSessionAction, () => setConfirm(false));
  if (!confirm) {
    return (
      <Button size="sm" onClick={() => setConfirm(true)} disabled={count === 0}>
        {label}
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
        Отправить {count} {plural(count, "студенту", "студентам", "студентам")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={pending}>
        Отмена
      </Button>
    </form>
  );
}

export function DeleteDraftButton({ sessionId }: { sessionId: string }) {
  const [, action, pending] = useToastAction(deleteRetakeDraftAction);
  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
        Удалить черновик
      </Button>
    </form>
  );
}

/** Результат по одному направлению: оценка при «сдал», «не сдал», «не явился»; баллы по желанию. */
export function ResultForm({ referralId, options, commissionHref, name }: { referralId: string; options: { value: RetakeResult; label: string }[]; commissionHref?: string; name: string }) {
  const [result, setResult] = useState<RetakeResult | "">("");
  const [, action, pending] = useActionState<RetakeActionState, FormData>(async (prev, fd) => {
    const res = await recordRetakeResultAction(prev, fd);
    if (res?.ok) {
      toast.success(res.ok, res.commission && commissionHref ? { action: { label: "Назначить комиссию", onClick: () => (window.location.hash = commissionHref.slice(1)) } } : undefined);
    } else if (res?.error) toast.error(res.error);
    return res;
  }, undefined);
  const withPoints = result !== "" && result !== "absent";
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="referralId" value={referralId} />
      <div className="w-[156px]">
        <Select name="result" value={result} onChange={(e) => setResult(e.target.value as RetakeResult)} required aria-label={`Результат: ${name}`} className="h-9">
          <option value="" disabled>
            Результат
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {withPoints && (
        <Input name="points" inputMode="numeric" pattern="\d{1,3}" maxLength={3} placeholder="баллы" aria-label={`Баллы: ${name}`} className="h-9 w-[76px] font-mono tabular" />
      )}
      <Button type="submit" size="sm" variant="secondary" disabled={pending || result === ""}>
        {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
        Сохранить
      </Button>
    </form>
  );
}
