"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function StaffSickLeavesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-md py-12">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Не удалось загрузить больничные</h1>
      <p className="mt-2 text-[14px] text-ink-2">Попробуйте ещё раз через пару секунд. Если ошибка повторится, сообщите в техподдержку.</p>
      {error.digest && <p className="mt-2 font-mono text-[12px] text-ink-3">Код ошибки: {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Повторить</Button>
        <ButtonLink href="/staff" variant="secondary">
          В очередь
        </ButtonLink>
      </div>
    </div>
  );
}
