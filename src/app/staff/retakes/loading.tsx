import { Skeleton } from "@/components/ui/misc";

/** Скелетон повторяет экран: шапка, четыре числа, список долгов, график. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <Skeleton className="mb-2 h-4 w-52" />
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-10 h-4 w-full max-w-xl" />
      <div className="mb-10 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-card" />
        ))}
      </div>
      <Skeleton className="mb-3.5 h-4 w-44" />
      <div className="mb-10 divide-y divide-line rounded-card border border-line">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 px-5 py-4">
            <Skeleton className="h-4 w-2/3 max-w-sm" />
            <Skeleton className="h-3 w-1/2 max-w-xs" />
            <Skeleton className="h-3 w-3/4 max-w-md" />
          </div>
        ))}
      </div>
      <Skeleton className="mb-3.5 h-4 w-24" />
      <Skeleton className="h-28 rounded-card" />
    </div>
  );
}
