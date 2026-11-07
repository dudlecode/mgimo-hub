"use client";

import { Skeleton } from "@/components/ui/misc";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { useSharedMessages } from "@/components/shell/use-shared-messages";

/** Скелетоны повторяют форму будущего контента, экран не «прыгает» при загрузке. */
export function PageSkeleton({ variant = "dashboard" }: { variant?: "dashboard" | "today" | "booking" | "list" | "schedule" | "grades" | "profile" }) {
  const t = useSharedMessages(shellMessages);
  return (
    <div aria-busy="true" aria-label={t.loading}>
      <Skeleton className="mb-2 h-4 w-44" />
      <Skeleton className="mb-6 h-9 w-64" />
      {variant === "dashboard" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          <div className="space-y-4">
            <Skeleton className="h-56 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-44 rounded-card" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-20 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
          </div>
        </div>
      )}
      {variant === "today" && (
        <div className="space-y-10">
          {["h-56", "h-64", "h-96"].map((h) => (
            <div key={h} className="grid gap-10 lg:grid-cols-2 lg:gap-6">
              <Skeleton className={`${h} rounded-card`} />
              <Skeleton className={`${h} rounded-card`} />
            </div>
          ))}
        </div>
      )}
      {variant === "booking" && (
        <div className="space-y-12">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-[28rem] rounded-card" />
        </div>
      )}
      {variant === "schedule" && (
        <>
          <div className="mb-5 flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[70px] flex-1 rounded-[10px]" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
        </>
      )}
      {variant === "grades" && (
        <>
          <Skeleton className="mb-5 h-44 rounded-card" />
          <Skeleton className="mb-4 h-10 w-64 rounded-[8px]" />
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-card" />
            ))}
          </div>
        </>
      )}
      {variant === "list" && (
        <div className="space-y-2.5">
          <Skeleton className="mb-3 h-10 w-56 rounded-[8px]" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      )}
      {variant === "profile" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Skeleton className="h-52 rounded-card" />
            <Skeleton className="h-72 rounded-card" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-card" />
            <Skeleton className="h-56 rounded-card" />
          </div>
        </div>
      )}
    </div>
  );
}
