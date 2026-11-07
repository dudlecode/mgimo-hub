import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-2 h-9 w-64" />
      <Skeleton className="mb-10 h-4 w-80 max-w-full" />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:justify-between">
        <Skeleton className="h-9 w-80 max-w-full rounded-[9px]" />
        <div className="grid gap-2 sm:grid-cols-2 lg:w-[480px]">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
      <Card className="divide-y divide-line">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-5 py-4 sm:grid sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-5">
            <Skeleton className="h-3.5 w-28" />
            <div className="mt-2 sm:mt-0">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="mt-1.5 h-4 w-72 max-w-full" />
              <Skeleton className="mt-1.5 h-3.5 w-52" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
