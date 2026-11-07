import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-10 h-4 w-56" />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-full sm:w-60" />
      </div>
      <Card className="divide-y divide-line">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-5 py-4">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}
