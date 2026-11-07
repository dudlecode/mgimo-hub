"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Сводка очереди от Атташе: по запросу, чтобы не тратить ИИ на каждое открытие страницы. */
export function QueueSummary() {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "summary" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось получить сводку");
      setText(data.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить сводку");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-relaxed text-ink-2">Что срочно, что ждёт студента, что можно закрыть</p>
        <Button variant="secondary" size="sm" onClick={load} disabled={busy}>
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-ink-3" />}
          {text ? "Обновить" : "Собрать"}
        </Button>
      </div>
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      {text && (
        <ul className="stagger-rows mt-4 space-y-2 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-2">
          {text
            .split("\n")
            .map((l) => l.replace(/^[-•]\s*/, "").trim())
            .filter(Boolean)
            .map((l, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                <span>{l}</span>
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
