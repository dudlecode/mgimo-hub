"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { shellMessages } from "@/lib/i18n/messages/shell";

export default function StudentError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useMessages(shellMessages).error;
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <div className="max-w-md py-12">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{t.title}</h1>
      <p className="mt-2 text-[14px] text-ink-2">{t.text}</p>
      {digest && (
        <p className="mt-2 font-mono text-[12px] text-ink-3">
          {t.code}: {digest}
        </p>
      )}
      <div className="mt-6 flex gap-2">
        <Button onClick={() => retry()}>{t.retry}</Button>
        <ButtonLink href="/" variant="secondary">
          {t.home}
        </ButtonLink>
      </div>
    </div>
  );
}
