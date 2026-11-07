import type { Metadata } from "next";
import Link from "next/link";
import { Printer } from "lucide-react";
import { getScopedRequest } from "@/lib/data/staff";
import { DELIVERY_LABEL, getRequestType, STATUS_META } from "@/lib/requests/catalog";
import { displayFields } from "@/lib/requests/display";
import { formatDateTime, formatDayMonth } from "@/lib/time";

import { Card, Crumbs, SectionTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/feature/request-bits";
import { buttonClass } from "@/components/ui/button";
import { cn, fullName } from "@/lib/utils";
import { ActionPanel } from "./action-panel";

export const metadata: Metadata = { title: "Заявка" };

export default async function StaffRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getScopedRequest(id);
  const def = getRequestType(r.type);
  const st = r.student;
  const now = new Date();
  const overdue = ["submitted", "in_review", "in_progress"].includes(r.status) && r.dueAt < now;

  const fields = [
    ...displayFields(r.type, r.fields),
    ...(def?.category === "certificate" ? [{ label: "Получение", value: `${DELIVERY_LABEL[r.delivery]}${r.copies > 1 ? `, ${r.copies} экз.` : ""}` }] : []),
  ];

  return (
    <div>
      <Crumbs items={[{ href: "/staff/requests", label: "Заявки" }, { label: r.number }]} />

      <header className="mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] lg:text-[32px]">{def?.title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-3">
            <StatusBadge status={r.status} />
            <span>
              <span className="font-mono">{r.number}</span>, подана {formatDateTime(r.createdAt)}
            </span>
            <span className={cn(overdue && "font-medium text-danger")}>{overdue ? `Просрочена, срок был ${formatDayMonth(r.dueAt)}` : `Срок ${formatDayMonth(r.dueAt)}`}</span>
          </div>
        </div>
        {r.verifyCode && (r.status === "ready" || r.status === "completed") && (
          <Link href={`/staff/requests/${r.id}/document`} className={buttonClass("secondary", "sm")}>
            <Printer className="size-3.5 text-ink-3" aria-hidden />
            Справка для печати
          </Link>
        )}
      </header>

      {/* Ряд одной высоты: слева заявка и студент, справа действия. История ниже на всю ширину */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] lg:gap-6">
        <div className="flex flex-col gap-10">
          <section>
            <SectionTitle>Данные заявки</SectionTitle>
            <Card className="overflow-hidden">
              {/* линии сетки: фон карточки виден в зазоре 1 px между ячейками */}
              <dl className="grid grid-cols-[minmax(0,1fr)] gap-px bg-line sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.label} className="bg-surface px-5 py-4 sm:odd:last:col-span-2">
                    <dt className="text-[12px] text-ink-3">{f.label}</dt>
                    <dd className="mt-1 text-[14px] font-medium whitespace-pre-line">{f.value}</dd>
                  </div>
                ))}
                {r.comment && (
                  <div className="bg-surface px-5 py-4 sm:col-span-2">
                    <dt className="text-[12px] text-ink-3">Комментарий студента</dt>
                    <dd className="mt-1 text-[14px] leading-relaxed">{r.comment}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </section>

          <section className="flex flex-1 flex-col">
            <SectionTitle action="Карточка" href={`/staff/students/${st.id}`}>
              Студент
            </SectionTitle>
            <Card className="flex flex-1 flex-col overflow-hidden">
              <dl className="grid flex-1 auto-rows-fr grid-cols-[minmax(0,1fr)] gap-px bg-line sm:grid-cols-2">
                {(
                  [
                    [
                      "ФИО",
                      <Link key="fio" href={`/staff/students/${st.id}`} prefetch={false} className="text-brand-fg hover:underline">
                        {fullName(st)}
                      </Link>,
                    ],
                    ["Группа", `${st.group.code}, ${st.group.course} курс`],
                    ["Факультет", st.group.faculty.code],
                    ["Направление", `${st.group.programCode} ${st.group.programName}`],
                    ["Основа", st.funding === "budget" ? "бюджет" : "договор"],
                    [
                      "Зачётка",
                      <span key="rb" className="font-mono">
                        {st.recordBook}
                      </span>,
                    ],
                  ] as [string, React.ReactNode][]
                ).map(([k, v]) => (
                  <div key={k} className="bg-surface px-5 py-4">
                    <dt className="text-[12px] text-ink-3">{k}</dt>
                    <dd className="mt-1 text-[14px] font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-line px-5 py-3.5 text-[12px] text-ink-3">Показаны только данные, нужные для обработки заявки.</p>
            </Card>
          </section>
        </div>

        <section className="flex flex-col">
          <SectionTitle>Действия</SectionTitle>
          <ActionPanel id={r.id} status={r.status} category={def?.category ?? "application"} delivery={r.delivery} className="flex-1" />
        </section>
      </div>

      <section className="mt-12">
        <SectionTitle count={r.events.length}>История</SectionTitle>
        <Card className="px-5 py-5 sm:px-6">
          <ol>
            {r.events.map((e, i) => (
              <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                {i < r.events.length - 1 && <span aria-hidden className="absolute top-4 bottom-0 left-[4.5px] w-px bg-line" />}
                <span aria-hidden className={cn("relative mt-[5px] size-2.5 shrink-0 rounded-full ring-4 ring-surface", e.actor === "staff" ? "bg-ink-3" : "bg-brand")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                    <span>
                      <span className="font-semibold text-ink">{e.actorName}</span>
                      {e.status && <span className="text-ink-3">, {STATUS_META[e.status].label.toLowerCase()}</span>}
                    </span>
                    <time className="text-[12px] text-ink-3 tabular">{formatDateTime(e.createdAt)}</time>
                  </div>
                  {e.message && <p className="mt-2 rounded-[10px] bg-surface-2 px-4 py-3 text-[14px] leading-relaxed">{e.message}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}
