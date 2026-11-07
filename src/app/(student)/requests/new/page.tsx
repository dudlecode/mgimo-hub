import type { Metadata } from "next";
import Link from "next/link";

import { localizedRequestTypes } from "@/lib/requests/catalog-en";
import { getLocale } from "@/lib/i18n/server";
import { requestsMessages } from "@/lib/i18n/messages/requests";
import { PageHeader } from "@/components/ui/card";
import { CatalogSearch } from "./catalog-search";

export async function generateMetadata(): Promise<Metadata> {
  return { title: requestsMessages[await getLocale()].newTitle };
}

export default async function NewRequestPage() {
  const locale = await getLocale();
  const t = requestsMessages[locale];
  const items = localizedRequestTypes(locale)
    .filter((d) => !d.hidden)
    .map((d) => ({
      slug: d.slug,
      title: d.title,
      short: d.short,
      icon: d.icon,
      category: d.category,
      slaDays: d.slaDays,
      delivery: d.delivery,
      popular: !!d.popular,
      keywords: d.keywords,
    }));
  return (
    <div >
      <Link href="/requests" className="mb-4 inline-block text-[13px] text-ink-3 hover:text-ink">{t.back}</Link>
      <PageHeader title={t.catalogTitle} subtitle={t.catalogSubtitle} />
      <CatalogSearch items={items} />
    </div>
  );
}
