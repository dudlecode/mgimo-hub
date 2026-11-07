"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { useMessages } from "@/lib/i18n/client";
import { loginMessages } from "@/lib/i18n/messages/login";

export default function AuthError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useMessages(loginMessages).loadError;
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <LogoMark size={28} />
        <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.02em]">{t.title}</h1>
        <p className="mt-2 text-[14px] text-ink-2">{t.text}</p>
        {digest && (
          <p className="mt-2 font-mono text-[12px] text-ink-3">
            {t.code}: {digest}
          </p>
        )}
        <div className="mt-6">
          <Button onClick={() => retry()}>{t.retry}</Button>
        </div>
      </div>
    </main>
  );
}
