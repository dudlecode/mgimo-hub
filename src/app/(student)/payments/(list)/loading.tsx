import { Skeleton } from "@/components/ui/misc";
import { getLocale } from "@/lib/i18n/server";
import { paymentsMessages } from "@/lib/i18n/messages/payments";

/** Скелетон повторяет экран оплаты: ближайший платёж, график по годам, подсказки справа. */
export default async function Loading() {
  const t = paymentsMessages[await getLocale()];
  return (
    <div aria-busy="true" aria-label={t.loading}>
      <Skeleton className="mb-2 h-9 w-64" />
      <Skeleton className="mb-10 h-4 w-44" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="space-y-10">
          <Skeleton className="h-[300px] rounded-card" />
          <div>
            <Skeleton className="mb-3.5 h-4 w-40" />
            <div className="divide-y divide-line rounded-card border border-line">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-card" />
          <Skeleton className="h-36 rounded-card" />
        </div>
      </div>
    </div>
  );
}
