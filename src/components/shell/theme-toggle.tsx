"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { useSharedMessages } from "./use-shared-messages";

const OPTIONS = [
  { value: "light", key: "lightShort", icon: Sun },
  { value: "dark", key: "darkShort", icon: Moon },
] as const;

export function ThemeToggle({ className, full }: { className?: string; full?: boolean }) {
  const { theme, setTheme } = useTheme();
  const t = useSharedMessages(shellMessages).theme;
  // true только в браузере после гидратации, без setState в эффекте
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const current = mounted ? theme : undefined;

  return (
    <div role="radiogroup" aria-label={t.group} className={cn("inline-flex rounded-[7px] bg-surface-2 p-0.5", full && "flex w-full", className)}>
      {OPTIONS.map(({ value, key, icon: Icon }) => {
        const active = current === value;
        const label = t[key];
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-[5px] text-[13px] font-medium text-ink-3 transition-colors", full ? "h-8 px-2.5" : "h-6 px-1.5",
              full && "flex-1",
              active ? "bg-surface text-ink ring-1 ring-line" : "hover:text-ink",
            )}
          >
            <Icon className={full ? "size-4" : "size-3.5"} aria-hidden />
            {full && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
