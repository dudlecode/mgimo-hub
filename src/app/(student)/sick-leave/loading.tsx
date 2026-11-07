import { Skeleton } from "@/components/ui/misc";
import { getLocale } from "@/lib/i18n/server";
import { sickLeaveMessages } from "@/lib/i18n/messages/sick-leave";

export default async function Loading() {
  const t = sickLeaveMessages[await getLocale()];
  return (
    <div aria-busy="true" aria-label={t.loading}>
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-10 h-4 w-80 max-w-full" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-6">
        <div className="space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-72 rounded-card" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      </div>
    </div>
  );
}
