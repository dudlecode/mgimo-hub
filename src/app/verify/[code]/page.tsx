import type { Metadata } from "next";
import Link from "next/link";
import { verifyDocument } from "@/lib/data/documents";
import { getRequestType } from "@/lib/requests/catalog";
import { localizeRequestTitle } from "@/lib/requests/catalog-en";
import { formatDateLong, formatDateTime } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import { defineMessages } from "@/lib/i18n/define";
import { personName } from "@/lib/i18n/translit";
import { Logo } from "@/components/logo";

const messages = defineMessages(
  {
    meta: "Проверка документа",
    valid: "Документ подлинный",
    checked: (at: string) => `Проверено ${at}`,
    number: "Номер",
    issued: "Дата выдачи",
    holder: "Кому выдан",
    faculty: "Факультет",
    course: "Курс",
    code: "Код проверки",
    none: "не указан",
    noneDate: "не указана",
    privacy: "Для защиты персональных данных показаны только инициалы и учебные сведения. Сверьте их с предъявленным документом.",
    notFoundLabel: "Не найден",
    notFoundTitle: "Документ не найден",
    notFoundText: "Проверьте код с документа в формате XXXX-XXXX-XXXX. Если код верный, документ мог быть отозван.",
  },
  {
    meta: "Document check",
    valid: "Authentic document",
    checked: (at) => `Checked ${at}`,
    number: "Number",
    issued: "Date of issue",
    holder: "Issued to",
    faculty: "Faculty",
    course: "Year of study",
    code: "Verification code",
    none: "not specified",
    noneDate: "not specified",
    privacy: "To protect personal data, only initials and study details are shown. Compare them with the document presented to you.",
    notFoundLabel: "Not found",
    notFoundTitle: "Document not found",
    notFoundText: "Check the code on the document, it looks like XXXX-XXXX-XXXX. If the code is correct, the document may have been revoked.",
  },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: messages[await getLocale()].meta };
}

// Публичная страница: доступна без входа (посольство, работодатель). Показывает минимум данных.
// Язык берётся из настройки браузера посетителя (cookie), по умолчанию русский.
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const doc = await verifyDocument(decodeURIComponent(code));
  const locale = await getLocale();
  const t = messages[locale];
  const now = new Date();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-8">
      <Link href="/login" className="mb-12">
        <Logo />
      </Link>
      {doc ? (
        <section>
          <p className="inline-flex items-center gap-2 text-[13px] font-medium text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            {t.valid}
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.025em]">{localizeRequestTitle(getRequestType(doc.type)?.title ?? doc.type, locale)}</h1>
          <p className="mt-1 text-[13px] text-ink-3">{t.checked(formatDateTime(now, locale))}</p>
          <dl className="mt-6 divide-y divide-line rounded-card border border-line text-[14px]">
            {(
              [
                [t.number, doc.documentNo ?? t.none, true],
                [t.issued, doc.issuedAt ? formatDateLong(doc.issuedAt, locale) : t.noneDate, false],
                [t.holder, personName(doc.holder, locale), false],
                [t.faculty, locale === "en" ? (doc.facultyEn ?? doc.faculty) : doc.faculty, false],
                [t.course, `${doc.course}`, false],
                [t.code, doc.code, true],
              ] as [string, string, boolean][]
            ).map(([k, v, mono]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3.5">
                <dt className="text-ink-3">{k}</dt>
                <dd className={mono ? "text-right font-mono text-[13px]" : "text-right"}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">{t.privacy}</p>
        </section>
      ) : (
        <section>
          <p className="inline-flex items-center gap-2 text-[13px] font-medium text-danger">
            <span className="size-1.5 rounded-full bg-danger" aria-hidden />
            {t.notFoundLabel}
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.025em]">{t.notFoundTitle}</h1>
          <p className="mt-2 text-[14px] text-ink-2">{t.notFoundText}</p>
        </section>
      )}
    </main>
  );
}
