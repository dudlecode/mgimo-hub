import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Lock } from "lucide-react";
import { requireStudent } from "@/lib/auth/dal";
import { getMyCourseOptions } from "@/lib/data/grades";
import { getLocalizedRequestType } from "@/lib/requests/catalog-en";
import { addWorkingDays } from "@/lib/academic";
import { formatDayMonth, formatWeekday } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import { requestsMessages } from "@/lib/i18n/messages/requests";
import { fundingLabel, localizedName, localizeStudyForm } from "@/lib/i18n/messages/common";

import { Card } from "@/components/ui/card";
import { fullName } from "@/lib/utils";
import { RequestForm } from "./request-form";
import { codeName } from "@/lib/i18n/translit";

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const locale = await getLocale();
  const def = getLocalizedRequestType((await params).type, locale);
  return { title: def?.title ?? requestsMessages[locale].typeFallback };
}

function parsePrefill(raw: string | undefined, allowed: string[]): Record<string, string> {
  if (!raw || raw.length > 4000) return {};
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!json || typeof json !== "object") return {};
    const out: Record<string, string> = {};
    for (const k of allowed) if (typeof json[k] === "string") out[k] = String(json[k]).slice(0, 1000);
    return out;
  } catch {
    return {};
  }
}

export default async function NewRequestTypePage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ course?: string; prefill?: string }> }) {
  const { type } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = requestsMessages[locale];
  const def = getLocalizedRequestType(type, locale);
  if (!def) notFound();

  const { student, group, faculty } = await requireStudent();
  // Подписи дисциплин на языке интерфейса; экшен заявки сам сохранит русский снимок для сотрудника
  const options = await getMyCourseOptions(locale);
  const prefill = parsePrefill(sp.prefill, [...def.fields.map((f) => f.name), "comment", "delivery"]);
  const courseField = def.fields.find((f) => f.type === "myCourse" || f.type === "myDebt");
  if (courseField && sp.course && !prefill[courseField.name]) prefill[courseField.name] = sp.course;

  const eta = addWorkingDays(new Date(), def.slaDays);

  return (
    <div>
      <Link href="/requests/new" className="mb-3 inline-block text-[13px] text-ink-3 transition-colors hover:text-ink">
        {t.backToCatalog}
      </Link>

      <header className="mb-10 max-w-3xl">
        <h1 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] lg:text-[32px]">{def.title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{def.description}</p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <RequestForm def={{ slug: def.slug, title: def.title, category: def.category, delivery: def.delivery, copies: !!def.copies, fields: def.fields }} options={options} prefill={prefill} />

        <aside className="flex flex-col gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <Clock className="size-4 text-brand-fg" aria-hidden />
              {t.readyBy(formatDayMonth(eta, locale))}
            </div>
            <p className="mt-1 text-[13px] text-ink-2">{t.term(def.slaDays, formatWeekday(eta, locale))}</p>
            <ol className="mt-4 space-y-3 border-l-2 border-line pl-4 text-[13px]">
              <li className="relative">
                <span className="absolute top-1 -left-[21px] size-2.5 rounded-full bg-brand ring-4 ring-surface" />
                <b className="font-semibold">{t.stepSubmitBold}</b>
                {t.stepSubmitRest}
              </li>
              <li className="relative text-ink-2">
                <span className="absolute top-1 -left-[21px] size-2.5 rounded-full bg-line-strong ring-4 ring-surface" />
                {t.stepReview(def.category === "certificate")}
              </li>
              <li className="relative text-ink-2">
                <span className="absolute top-1 -left-[21px] size-2.5 rounded-full bg-line-strong ring-4 ring-surface" />
                {def.category === "certificate" ? (def.delivery.includes("electronic") ? t.stepGetElectronic : t.stepGetPaper) : t.stepGetDecision}
              </li>
            </ol>
          </Card>

          <Card className="flex flex-1 flex-col p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="text-[14px] font-semibold">{t.profileTitle}</div>
              <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">
                <Lock className="size-3.5" aria-hidden />
                {t.profileAuto}
              </span>
            </div>
            <dl className="space-y-2.5 text-[13px]">
              {(
                [
                  [t.profileName, fullName(student), true],
                  [t.profileFaculty, localizedName(faculty, locale), false],
                  [t.profileProgram, `${group.programCode} ${group.programName}`, true],
                  [t.profileYearGroup, t.yearGroup(group.course, codeName(group.code, locale)), false],
                  [t.profileModeBasis, `${localizeStudyForm(student.studyForm, locale)}, ${fundingLabel(student.funding, locale)}`, false],
                ] as [string, string, boolean][]
              ).map(([k, v, fromData]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-ink-3">{k}</dt>
                  <dd className="text-right font-medium" lang={fromData ? "ru" : undefined}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-auto pt-5 text-[12px] leading-relaxed text-ink-3">{t.profileHint}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
