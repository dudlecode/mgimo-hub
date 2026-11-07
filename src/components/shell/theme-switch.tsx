"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { useSharedMessages } from "./use-shared-messages";

/** Одна кнопка: светлая ↔ тёмная. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useSharedMessages(shellMessages).theme;
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted ? resolvedTheme === "dark" : true;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn("grid size-8 place-items-center rounded-[7px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink", className)}
      aria-label={dark ? t.toLight : t.toDark}
      title={dark ? t.light : t.dark}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
