import { Skeleton } from "@/components/ui/misc";

// У страницы нет вложенных маршрутов с notFound(), поэтому скелетон не превращает 404 в потоковый 200.
export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-2xl flex-col items-center pt-10">
      <Skeleton className="mb-4 size-12 rounded-[14px]" />
      <Skeleton className="mb-3 h-8 w-64 max-w-full" />
      <Skeleton className="mb-10 h-4 w-80 max-w-full" />
      <Skeleton className="h-14 w-full rounded-card" />
      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-ctl" />
        ))}
      </div>
    </div>
  );
}
