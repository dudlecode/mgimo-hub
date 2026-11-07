"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SICK_FILE_ACCEPT, SICK_FILE_MAX_BYTES } from "@/lib/sick-leave";
import { cn } from "@/lib/utils";
import { useMessages } from "@/lib/i18n/client";
import { sickLeaveMessages } from "@/lib/i18n/messages/sick-leave";

type Errors = { endsOn?: string; file?: string; form?: string };

function formatSize(bytes: number, units: { kb: string; mb: string; decimal: string }) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ${units.kb}`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", units.decimal)} ${units.mb}`;
}

/** «Выздоровели?»: последний день болезни и справка. Загрузка через Route Handler (multipart). */
export function CloseSickForm({ id, startsOn, today }: { id: string; startsOn: string; today: string }) {
  const router = useRouter();
  const t = useMessages(sickLeaveMessages);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  function pick(f: File | null) {
    setErrors((e) => ({ ...e, file: undefined, form: undefined }));
    if (!f) return setFile(null);
    if (!/\.(jpe?g|png|pdf)$/i.test(f.name)) {
      setErrors((e) => ({ ...e, file: t.errFileType }));
      return setFile(null);
    }
    if (f.size > SICK_FILE_MAX_BYTES) {
      setErrors((e) => ({ ...e, file: t.errFileSize }));
      return setFile(null);
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const endsOn = String(fd.get("endsOn") ?? "");
    const next: Errors = {};
    if (!endsOn) next.endsOn = t.errEnterDate;
    else if (endsOn < startsOn) next.endsOn = t.errBeforeStart;
    else if (endsOn > today) next.endsOn = t.errNotYet;
    if (!file) next.file = t.errAttach;
    setErrors(next);
    if (Object.keys(next).length || !file) return;

    const body = new FormData();
    body.set("endsOn", endsOn);
    body.set("file", file, file.name);
    setBusy(true);
    try {
      const res = await fetch(`/api/sick-leave/${id}/close`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string; field?: "endsOn" | "file" };
      if (!res.ok) {
        const msg = data.error ?? t.errSendFailed;
        setErrors(data.field ? { [data.field]: msg } : { form: msg });
        return;
      }
      toast.success(t.sentToast, { description: t.sentToastText });
      startRefresh(() => router.refresh());
    } catch {
      setErrors({ form: t.errNoConnection });
    } finally {
      setBusy(false);
    }
  }

  const pending = busy || refreshing;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Field label={t.lastDay} htmlFor="sl-close-end" required error={errors.endsOn}>
        <Input
          id="sl-close-end"
          name="endsOn"
          type="date"
          required
          min={startsOn}
          max={today}
          defaultValue={today}
          aria-invalid={errors.endsOn ? true : undefined}
          aria-describedby={errors.endsOn ? "sl-close-end-error" : undefined}
          className="font-mono tabular"
        />
      </Field>

      <Field label={t.certificateField} htmlFor="sl-file" required error={errors.file} hint={t.certificateHint}>
        <label
          htmlFor="sl-file"
          className={cn(
            "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-ctl border border-dashed px-3 py-2.5 text-[14px] transition-colors hover:border-ink-3",
            errors.file ? "border-danger" : "border-line-strong",
          )}
        >
          <Paperclip className="size-4 shrink-0 text-ink-3" aria-hidden />
          {file ? (
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <span className="truncate text-ink">{file.name}</span>
              <span className="shrink-0 font-mono text-[12px] text-ink-3 tabular">{formatSize(file.size, t)}</span>
            </span>
          ) : (
            <span className="text-ink-3">{t.chooseFile}</span>
          )}
        </label>
        <input
          id="sl-file"
          name="file"
          type="file"
          accept={SICK_FILE_ACCEPT}
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          aria-invalid={errors.file ? true : undefined}
          aria-describedby={errors.file ? "sl-file-error" : undefined}
        />
      </Field>

      <div aria-live="polite">
        {errors.form && (
          <div className="flex items-start gap-2.5 rounded-ctl bg-danger-soft px-3.5 py-3 text-[14px] font-medium text-danger">
            <CircleAlert className="mt-0.5 size-4.5 shrink-0" aria-hidden />
            {errors.form}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {pending ? t.sending : t.close}
      </Button>
    </form>
  );
}
