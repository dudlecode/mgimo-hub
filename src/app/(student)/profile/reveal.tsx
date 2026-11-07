"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useMessages } from "@/lib/i18n/client";
import { profileMessages } from "@/lib/i18n/messages/profile";

/** Скрывает персональные данные от случайного взгляда; показывает по нажатию. */
export function Reveal({ value, masked }: { value: string; masked: string }) {
  const [shown, setShown] = useState(false);
  const t = useMessages(profileMessages);
  return (
    <button
      type="button"
      onClick={() => setShown((v) => !v)}
      className="inline-flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-[14px] font-medium tabular hover:bg-surface-2"
      aria-label={shown ? t.hide : t.show}
    >
      <span>{shown ? value : masked}</span>
      {shown ? <EyeOff className="size-4 text-ink-3" aria-hidden /> : <Eye className="size-4 text-ink-3" aria-hidden />}
    </button>
  );
}
