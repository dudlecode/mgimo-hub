import { Skeleton } from "@/components/ui/misc";

/** Скелетон: четыре числа сверху, фильтр и строки платежей */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <Skeleton className="mb-2 h-4 w-56" />
      <Skeleton className="mb-2 h-9 w-64" />
      <Skeleton className="mb-10 h-4 w-80 max-w-full" />
      <div className="mb-6 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[98px] rounded-card" />
        ))}
      </div>
      <Skeleton className="mb-4 h-9 w-72 max-w-full rounded-[9px]" />
      <div className="divide-y divide-line rounded-card border border-line">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 px-5 py-4">
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
