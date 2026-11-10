"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

// Ошибка любого экрана деканата без собственного error.tsx: меню остаётся на месте
export default function StaffError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-md py-12">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Не удалось загрузить страницу</h1>
      <p className="mt-2 text-[14px] text-ink-2">Попробуйте ещё раз через пару секунд. Если ошибка повторится, вернитесь к очереди заявок.</p>
      {error.digest && <p className="mt-2 font-mono text-[12px] text-ink-3">Код ошибки: {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <Button onClick={() => retry()}>Повторить</Button>
        <ButtonLink href="/staff" variant="secondary">
          К очереди
        </ButtonLink>
      </div>
    </div>
  );
}
