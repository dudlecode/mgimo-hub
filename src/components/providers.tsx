"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/pwa/register";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast: "!rounded-[10px] !border-line !bg-surface !text-ink !shadow-pop !font-sans",
          description: "!text-ink-2",
        },
      }}
    />
  );
}

// next-themes рендерит inline-скрипт против мигания темы. На сервере он нужен как есть,
// а при клиентском рендере (например, 404) React 19 ругается на исполняемый <script>.
// На клиенте помечаем его как блок данных: скрипт и так не выполняется, предупреждения нет.
const themeScriptProps = typeof window === "undefined" ? undefined : { type: "application/json" };

export function Providers({ children, locale = "ru" }: { children: ReactNode; locale?: Locale }) {
  return (
    <LocaleProvider locale={locale}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={["light", "dark"]} disableTransitionOnChange scriptProps={themeScriptProps}>
        {children}
        <ThemedToaster />
        <PwaRegister />
      </ThemeProvider>
    </LocaleProvider>
  );
}
