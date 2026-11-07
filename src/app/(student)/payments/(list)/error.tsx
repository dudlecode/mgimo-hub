"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { paymentsMessages } from "@/lib/i18n/messages/payments";

export default function PaymentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useMessages(paymentsMessages);
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-md py-12">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{t.errorTitle}</h1>
      <p className="mt-2 text-[14px] text-ink-2">{t.errorText}</p>
      {error.digest && (
        <p className="mt-2 font-mono text-[12px] text-ink-3">
          {t.errorCode} {error.digest}
        </p>
      )}
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>{t.retry}</Button>
        <ButtonLink href="/" variant="secondary">
          {t.home}
        </ButtonLink>
      </div>
    </div>
  );
}
