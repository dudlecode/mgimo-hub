"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";

/** Свайп влево/вправо на телефоне, следующий/предыдущий день. */
export function SwipeNav({ prevHref, nextHref, children }: { prevHref: string; nextHref: string; children: ReactNode }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  return (
    <div
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8 && Date.now() - s.t < 600) {
          router.push(dx < 0 ? nextHref : prevHref, { scroll: false });
        }
      }}
    >
      {children}
    </div>
  );
}
