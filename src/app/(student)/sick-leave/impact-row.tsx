"use client";

import { useState } from "react";
import { Check, Copy, LoaderCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { useMessages } from "@/lib/i18n/client";
import { sickLeaveMessages } from "@/lib/i18n/messages/sick-leave";

export type ImpactRowData = {
  courseId: string;
  title: string;
  teacher: string;
  lessonsLabel: string | null;
  lessonsCount: number;
  assessments: { id: string; title: string; due: string }[];
};

type Letter = { subject: string; body: string; mode: "ai" | "offline" };

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Дисциплина на время больничного: пары, контрольные и черновик письма преподавателю. */
export function ImpactRow({ row }: { row: ImpactRowData }) {
  const t = useMessages(sickLeaveMessages);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  async function draft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sick-leave/letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: row.courseId }) });
      const data = (await res.json().catch(() => ({}))) as Partial<Letter> & { error?: string };
      if (!res.ok || !data.subject || !data.body) throw new Error(data.error ?? t.letterFailed);
      setLetter({ subject: data.subject, body: data.body, mode: data.mode === "ai" ? "ai" : "offline" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.letterFailed);
    } finally {
      setBusy(false);
    }
  }

  async function copy(what: "subject" | "body") {
    if (!letter) return;
    const ok = await copyText(what === "subject" ? letter.subject : letter.body);
    if (!ok) return toast.error(t.copyFailed);
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
  }

  return (
    <div className="px-5 py-4">
      <div className="text-[14px] leading-5 font-medium text-ink">{row.title}</div>
      <div className="mt-0.5 text-[13px] leading-5 text-ink-3">
        <span>{row.teacher}</span>
        {row.lessonsCount > 0 && (
          <>
            {" "}
            · {t.classes(row.lessonsCount)}
          </>
        )}
      </div>
      {row.lessonsLabel && <div className="mt-1 font-mono text-[12px] text-ink-3 tabular">{row.lessonsLabel}</div>}

      {row.assessments.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {row.assessments.map((a) => (
            <li key={a.id} className="flex items-baseline gap-3 text-[13px] leading-5">
              <span className="w-[68px] shrink-0 font-mono text-[12px] font-medium text-warning tabular">{a.due}</span>
              <span className="min-w-0 text-ink-2" lang={/[А-Яа-яЁё]/.test(a.title) ? "ru" : undefined}>
                {a.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      {row.assessments.length > 0 && !letter && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={draft} disabled={busy}>
            {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Mail className="size-3.5 text-ink-3" aria-hidden />}
            {busy ? t.drafting : t.letterButton}
          </Button>
          {error && (
            <p className="mt-2 text-[13px] text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {letter && (
        <div className="mt-3 space-y-3 rounded-ctl border border-line bg-surface-1 p-3.5 sm:p-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`subj-${row.courseId}`} className="text-[12px] font-medium text-ink-3">
                {t.subject}
              </label>
              <button type="button" onClick={() => copy("subject")} className="inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
                {copied === "subject" ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                {copied === "subject" ? t.copied : t.copySubject}
              </button>
            </div>
            <Input id={`subj-${row.courseId}`} lang="ru" value={letter.subject} onChange={(e) => setLetter({ ...letter, subject: e.target.value })} maxLength={150} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`body-${row.courseId}`} className="text-[12px] font-medium text-ink-3">
              {t.letter}
            </label>
            <Textarea id={`body-${row.courseId}`} lang="ru" value={letter.body} onChange={(e) => setLetter({ ...letter, body: e.target.value })} maxLength={2000} className="min-h-56 text-[14px]" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => copy("body")}>
              {copied === "body" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              {copied === "body" ? t.copied : t.copy}
            </Button>
            <Button size="sm" variant="ghost" onClick={draft} disabled={busy}>
              {busy && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
              {t.another}
            </Button>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-3">
            {letter.mode === "ai" ? t.byAi : t.byTemplate} {t.checkAndSend}
            {t.russianNote && <> {t.russianNote}</>}
          </p>
          {error && (
            <p className="text-[13px] text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
