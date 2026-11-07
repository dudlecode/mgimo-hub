import { Skeleton } from "@/components/ui/misc";
import { getLocale } from "@/lib/i18n/server";
import { documentsMessages } from "@/lib/i18n/messages/documents";

export default async function Loading() {
  const t = documentsMessages[await getLocale()];
  return (
    <div aria-busy="true" aria-label={t.loading}>
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-10 h-4 w-72 max-w-full" />
      <Skeleton className="mb-3.5 h-4 w-36" />
      <Skeleton className="h-72 rounded-card" />
      <Skeleton className="mt-12 mb-3.5 h-4 w-32" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-card" />
        ))}
      </div>
    </div>
  );
}
