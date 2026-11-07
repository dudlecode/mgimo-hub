"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, QrCode, Search, Stamp, Sparkles } from "lucide-react";
import { useMessages } from "@/lib/i18n/client";
import { requestsMessages } from "@/lib/i18n/messages/requests";


type Item = {
  slug: string;
  title: string;
  short: string;
  icon: string;
  category: "certificate" | "application";
  slaDays: number;
  delivery: ("electronic" | "paper")[];
  popular: boolean;
  keywords: string[];
};

export function CatalogSearch({ items }: { items: Item[] }) {
  const t = useMessages(requestsMessages);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((i) => [i.title, i.short, ...i.keywords].some((s) => s.toLowerCase().includes(query)));
  }, [q, items]);

  const groups = [
    { key: "certificate", title: t.groupCertificates, items: filtered.filter((i) => i.category === "certificate") },
    { key: "application", title: t.groupApplications, items: filtered.filter((i) => i.category === "application") },
  ];

  return (
    <div>
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="h-12 w-full rounded-ctl border border-line bg-surface pr-4 pl-11 text-[15px] outline-none placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/12"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong p-6 text-center">
          <p className="text-[15px] font-medium">{t.nothingFound(q)}</p>
          <p className="mt-1 text-[14px] text-ink-2">{t.nothingFoundText}</p>
          <Link href={`/assistant?q=${encodeURIComponent(t.askQuery(q))}`} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-[14px] font-semibold text-brand-ink">
            <Sparkles className="size-4" aria-hidden />
            {t.askAttache}
          </Link>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(
            (g) =>
              g.items.length > 0 && (
                <section key={g.key}>
                  <h2 className="mb-3 text-[13px] font-bold tracking-wide text-ink-3 uppercase">{g.title}</h2>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
                    {g.items.map((i) => {
                              return (
                        <Link
                          key={i.slug}
                          href={`/requests/new/${i.slug}`}
                          className="group flex items-start gap-3.5 rounded-card border border-line bg-surface p-4 shadow-card transition-[border-color,transform] hover:border-line-strong active:scale-[0.99]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-semibold">{i.title}</span>
                              {i.popular && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent uppercase">{t.popularBadge}</span>}
                            </div>
                            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{i.short}</p>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="size-3.5" aria-hidden />
                                {t.slaCard(i.slaDays)}
                              </span>
                              {i.delivery.includes("electronic") && i.category === "certificate" && (
                                <span className="inline-flex items-center gap-1">
                                  <QrCode className="size-3.5" aria-hidden />{t.withQr}
                                </span>
                              )}
                              {i.delivery.includes("paper") && (
                                <span className="inline-flex items-center gap-1">
                                  <Stamp className="size-3.5" aria-hidden />
                                  {t.paper}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ),
          )}
        </div>
      )}
    </div>
  );
}
