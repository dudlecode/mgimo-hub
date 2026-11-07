import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-2 h-9 w-52" />
      <Skeleton className="mb-10 h-4 w-96 max-w-full" />
      <div className="mb-8 grid grid-cols-3 gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-card" />
        ))}
      </div>
      <Skeleton className="mb-4 h-9 w-72 max-w-full rounded-[9px]" />
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>
    </div>
  );
}
