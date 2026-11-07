import { Badge } from "@/components/ui/badge";
import { markLabel, type Mark } from "@/lib/grades";
import type { Locale } from "@/lib/i18n/config";

export function MarkBadge({ mark, locale = "ru" }: { mark: Mark; locale?: Locale }) {
  const tone = mark === "5" ? "success" : mark === "4" ? "brand" : mark === "3" ? "warning" : mark === "pass" ? "neutral" : "danger";
  const label = markLabel(mark, locale);
  return (
    <Badge tone={tone} className="min-w-[72px] justify-center">
      {mark === "pass" || mark === "fail" ? label : `${mark} · ${label}`}
    </Badge>
  );
}
