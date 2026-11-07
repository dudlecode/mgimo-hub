import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getMyRetakeReferral } from "@/lib/data/retakes";
import { CAMPUSES } from "@/lib/academic";
import { CONTROL_LABEL, MARK_LABEL, type Mark } from "@/lib/grades";
import { ATTEMPT_LABEL, RETAKE_STATUS_META, type RetakeAttempt } from "@/lib/retakes";
import { formatDateLong, formatDateNumeric, formatTime, formatWeekday } from "@/lib/time";
import { LogoMark } from "@/components/logo";
import { Crumbs } from "@/components/ui/card";
import { PrintButton } from "@/components/feature/print-button";
import { fullName } from "@/lib/utils";
import { getMessages } from "@/lib/i18n/server";
import { retakeMessages } from "@/lib/i18n/messages/retakes";
import { shellMessages } from "@/lib/i18n/messages/shell";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(retakeMessages)).metaTitle };
}

// Только своё направление: getMyRetakeReferral ищет по id и studentId из сессии, иначе 404.
export default async function RetakeReferralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { referral: r, student, group, faculty } = await getMyRetakeReferral(id);
  const t = await getMessages(retakeMessages);
  const shell = await getMessages(shellMessages);
  const campus = CAMPUSES[group.campus];
  const signer = r.signerLast && r.signerFirst ? `${r.signerFirst[0]}. ${r.signerLast}` : null;
  const attempt = ATTEMPT_LABEL[r.attempt as RetakeAttempt] ?? `попытка ${r.attempt}`;
  const result = r.status !== "issued" ? RETAKE_STATUS_META[r.status].label : null;

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Студент", value: <b>{fullName(student)}</b> },
    { label: "Группа", value: `${group.code}, ${group.course} курс, ${faculty.name.toLowerCase()}` },
    { label: "Дисциплина", value: <b>{r.discipline}</b> },
    { label: "Форма контроля", value: `${CONTROL_LABEL[r.controlType]}, ${r.semester}-й семестр` },
    { label: "Попытка", value: attempt.charAt(0).toUpperCase() + attempt.slice(1) },
    {
      label: "Дата и время",
      value: (
        <span className="font-mono tabular">
          {formatWeekday(r.startsAt)}, {formatDateLong(r.startsAt)}, {formatTime(r.startsAt)}
        </span>
      ),
    },
    {
      label: "Аудитория",
      value: (
        <>
          <span className="font-mono">{r.room}</span>, {campus.building}, {campus.address}
        </>
      ),
    },
    {
      label: r.commission.length > 1 ? "Комиссия" : "Преподаватель",
      value: (
        <ul>
          {r.commission.map((m, i) => (
            <li key={i}>
              {m}
              {r.commission.length > 1 && i === 0 ? ", председатель" : ""}
            </li>
          ))}
        </ul>
      ),
    },
  ];
  if (r.note) rows.push({ label: "Примечание", value: r.note });

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Crumbs label={shell.breadcrumbs} items={[{ href: "/grades?tab=session", label: t.grades }, { label: t.referral(r.number) }]} />
        <PrintButton />
      </div>

      <article lang="ru" className="relative mx-auto max-w-[760px] overflow-hidden rounded-[6px] bg-white px-6 py-8 text-[#111] shadow-pop sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:px-0 print:py-0 print:shadow-none">
        {/* Водяной знак «образец»: распечатку нельзя выдать за подлинный документ */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" aria-hidden>
          <div className="rotate-[-28deg] text-center font-serif text-[40px] leading-tight font-bold whitespace-nowrap text-[#15296b]/[0.06] sm:text-[64px]">
            ОБРАЗЕЦ
            <br />
            НЕ ДЛЯ ПРЕДЪЯВЛЕНИЯ
          </div>
        </div>

        <header className="relative flex items-start justify-between gap-4 border-b-2 border-[#15296b] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark size={44} />
            <div className="min-w-0 leading-tight">
              <div className="font-serif text-[15px] font-semibold text-[#15296b]">MGIMO Hub, цифровой деканат</div>
              <div className="text-[11px] text-[#555]">{faculty.name}</div>
            </div>
          </div>
          <div className="shrink-0 text-right text-[11px] text-[#555] tabular">
            <div className="font-mono">№ {r.number}</div>
            <div className="font-mono">{formatDateNumeric(r.issuedAt)}</div>
          </div>
        </header>

        <h1 className="relative mt-8 text-center font-serif text-[20px] font-bold tracking-[0.06em] uppercase sm:text-[22px]">Направление на пересдачу</h1>
        <p className="relative mt-1 text-center font-mono text-[13px] text-[#555]">№ {r.number}</p>

        <dl className="relative mt-7 divide-y divide-[#e5e5e5] border-y border-[#e5e5e5] text-[14px] leading-relaxed">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-0.5 py-2.5 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
              <dt className="text-[12px] text-[#666] sm:pt-0.5 sm:text-[13px]">{row.label}</dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>

        {result && (
          <p className="relative mt-5 text-[13px] text-[#333]">
            Итог пересдачи: <b>{result.toLowerCase()}</b>
            {r.status === "passed" && r.resultMark ? `, «${MARK_LABEL[r.resultMark as Mark] ?? r.resultMark}»` : ""}.
          </p>
        )}

        <p className="relative mt-5 font-serif text-[14px] leading-[1.7]">
          Направление действительно на указанные дату и время. Приходите за 10 минут до начала, при себе студенческий билет или зачётная книжка. Если не сможете прийти по уважительной причине, сообщите в учебный офис, ауд. {faculty.officeRoom}, до начала пересдачи.
        </p>

        <footer className="relative mt-12 flex flex-wrap items-end justify-between gap-6">
          <div className="text-[13px] leading-relaxed">
            <div>Учебный офис, электронная подпись</div>
            <div className="mt-4 font-serif text-[15px] italic">{signer ?? "Учебный офис факультета"}</div>
            {r.signerPosition && <div className="mt-0.5 max-w-[260px] text-[11px] text-[#666]">{r.signerPosition}</div>}
          </div>

          {/* Печать */}
          <svg viewBox="0 0 120 120" className="size-28 -rotate-[8deg] opacity-80 animate-stamp" aria-hidden>
            <circle cx="60" cy="60" r="56" fill="none" stroke="#2c4aa8" strokeWidth="3" />
            <circle cx="60" cy="60" r="44" fill="none" stroke="#2c4aa8" strokeWidth="1.2" />
            <defs>
              <path id="stamp-retake" d="M60 60 m-50 0 a50 50 0 1 1 100 0 a50 50 0 1 1 -100 0" />
            </defs>
            <text fontSize="9.5" fontWeight="700" fill="#2c4aa8" letterSpacing="1.5">
              <textPath href="#stamp-retake">MGIMO HUB · ОБРАЗЕЦ · НЕ ДЛЯ ПРЕДЪЯВЛЕНИЯ ·</textPath>
            </text>
            <text x="60" y="58" textAnchor="middle" fontSize="11" fontWeight="800" fill="#2c4aa8">
              ДЕМО
            </text>
            <text x="60" y="72" textAnchor="middle" fontSize="7" fill="#2c4aa8">
              {r.number}
            </text>
          </svg>
        </footer>

        <p className="relative mt-8 border-t border-[#ddd] pt-3 text-center text-[10px] text-[#777]">Образец документа, сформирован {formatDateLong(r.issuedAt)}.</p>
      </article>
    </div>
  );
}
