"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RequestStatus } from "@/db/schema";
import { requestTitle, statusMeta, trackSteps } from "@/lib/requests/catalog-en";
import { requestsMessages } from "@/lib/i18n/messages/requests";
import { useLocale } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { StatusText, type BadgeTone } from "@/components/ui/badge";
import { formatDayMonth, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Язык подписей: явный locale или язык интерфейса. Эти же компоненты стоят в кабинете сотрудника,
 * который всегда на русском, даже если в браузере остался выбранный студентом английский.
 */
function useBitsLocale(explicit?: Locale): Locale {
  const locale = useLocale();
  const pathname = usePathname() ?? "";
  if (explicit) return explicit;
  return pathname === "/staff" || pathname.startsWith("/staff/") ? "ru" : locale;
}

function tone(status: RequestStatus): BadgeTone {
  const t = statusMeta(status, "ru").tone;
  return t === "brand" ? "brand" : t;
}

export function StatusBadge({ status, locale }: { status: RequestStatus; locale?: Locale }) {
  const lang = useBitsLocale(locale);
  return <StatusText tone={tone(status)}>{statusMeta(status, lang).label}</StatusText>;
}

/** Трекер этапов: 5 тонких сегментов */
export function MiniTracker({ status, className, locale }: { status: RequestStatus; className?: string; locale?: Locale }) {
  const lang = useBitsLocale(locale);
  const m = statusMeta(status, lang);
  const off = status === "rejected" || status === "cancelled";
  return (
    <div className={cn("seg-fill flex items-center gap-0.5", className)} aria-label={requestsMessages[lang].stage(m.label)}>
      {trackSteps(lang).map((label, i) => (
        <span
          key={label}
          title={label}
          className={cn(
            "h-[3px] flex-1 rounded-full",
            off ? "bg-surface-3" : i < m.step ? "bg-ink" : i === m.step ? (status === "needs_info" ? "bg-warning" : status === "ready" ? "bg-success" : "bg-brand") : "bg-surface-3",
          )}
        />
      ))}
    </div>
  );
}

export function RequestRow({
  r,
  now,
  locale,
}: {
  r: { id: string; number: string; type: string; status: RequestStatus; createdAt: Date; updatedAt: Date; dueAt: Date };
  now: Date;
  locale?: Locale;
}) {
  const lang = useBitsLocale(locale);
  const t = requestsMessages[lang];
  const title = requestTitle(r.type, lang);
  const active = !["completed", "rejected", "cancelled"].includes(r.status);
  return (
    <Link href={`/requests/${r.id}`} className="block px-5 py-4 transition-colors hover:bg-surface-1">
      <div className="flex items-baseline justify-between gap-3">
        {/* Длинные названия («Certificate for an embassy») переносим, а не обрезаем: на 360 px рядом стоит статус */}
        <span className="min-w-0 text-[14px] leading-snug font-medium break-words">{title ?? r.type}</span>
        <span className="shrink-0">
          <StatusBadge status={r.status} locale={lang} />
        </span>
      </div>
      <div className="mt-0.5 text-[12px] text-ink-3">
        <span className="font-mono">{r.number}</span> ·{" "}
        {active ? (r.status === "ready" ? t.canCollect : t.dueShort(formatDayMonth(r.dueAt, lang))) : t.updated(relativeTime(r.updatedAt, now, lang))}
      </div>
      {active && <MiniTracker status={r.status} className="mt-2" locale={lang} />}
    </Link>
  );
}
