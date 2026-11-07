import { Skeleton } from "@/components/ui/misc";

/** Скелетон повторяет сетку страницы: заголовок, четыре числа, карточки диаграмм. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="mb-2 h-4 w-44" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-64 max-w-full rounded-[9px]" />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-card" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[420px] rounded-card" />
        ))}
      </div>
      <Skeleton className="mt-3 h-64 rounded-card" />
    </div>
  );
}
