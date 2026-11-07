// Квитанция на оплату обучения: печатный бланк в стиле справки.
// Без платёжного QR-кода и без настоящих реквизитов: счета из нулей, водяной знак «ОБРАЗЕЦ».
import type { Metadata } from "next";
import Link from "next/link";
import { getMyPaymentReceipt } from "@/lib/data/payments";
import { formatRubPlain, periodForPurpose, rublesInWords } from "@/lib/payments";
import { formatDateLong, formatDateNumeric } from "@/lib/time";
import { LogoMark } from "@/components/logo";
import { PrintButton } from "@/components/feature/print-button";
import { fullName } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { paymentsMessages } from "@/lib/i18n/messages/payments";

export async function generateMetadata(): Promise<Metadata> {
  return { title: paymentsMessages[await getLocale()].receiptTitle };
}

const ZEROS_20 = "0".repeat(20);

const RECIPIENT: { label: string; value: string; mono?: boolean }[] = [
  { label: "Получатель", value: "Университет" },
  { label: "ИНН / КПП", value: "0000000000 / 000000000", mono: true },
  { label: "Расчётный счёт", value: ZEROS_20, mono: true },
  { label: "Банк получателя", value: "ПАО «Банк», г. Москва" },
  { label: "БИК", value: "000000000", mono: true },
  { label: "Корр. счёт", value: ZEROS_20, mono: true },
  { label: "КБК", value: ZEROS_20, mono: true },
  { label: "ОКТМО", value: "00000000", mono: true },
];

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { payment: p, student, group, faculty } = await getMyPaymentReceipt(id);
  const now = new Date();
  const name = fullName(student);
  const t = paymentsMessages[await getLocale()];

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/payments" className="text-[13px] text-ink-3 hover:text-ink">
          {t.backToPayments}
        </Link>
        <PrintButton />
      </div>

      {/* Квитанция: русский платёжный документ, не переводится */}
      <article lang="ru" className="relative mx-auto max-w-[760px] overflow-hidden rounded-[6px] bg-white px-5 py-7 text-[#111] shadow-pop sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:px-0 print:py-0 print:shadow-none">
        {/* Водяной знак, как на справках: распечатку нельзя выдать за настоящий платёжный документ */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" aria-hidden>
          <div className="rotate-[-28deg] font-serif text-[56px] leading-tight font-bold whitespace-nowrap text-[#15296b]/[0.06] sm:text-[96px]">ОБРАЗЕЦ</div>
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
            <div>№ {p.id.slice(0, 8).toUpperCase()}</div>
            <div>{formatDateNumeric(now)}</div>
          </div>
        </header>

        <h1 className="relative mt-8 text-center font-serif text-[20px] font-bold tracking-[0.08em] uppercase sm:text-[22px]">Квитанция на оплату</h1>
        <p className="relative mt-1 text-center text-[13px] text-[#555]">
          обучение по договору <span className="whitespace-nowrap">№ {p.contractNo}</span>
        </p>

        <section className="relative mt-7">
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-[#555] uppercase">Реквизиты получателя</h2>
          <dl className="divide-y divide-[#e5e5e5] border-y border-[#d4d4d4] text-[13px]">
            {RECIPIENT.map((r) => (
              <div key={r.label} className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[170px_minmax(0,1fr)]">
                <dt className="text-[#666]">{r.label}</dt>
                <dd className={r.mono ? "font-mono break-all tabular" : undefined}>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="relative mt-6">
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-[#555] uppercase">Плательщик и назначение</h2>
          <dl className="divide-y divide-[#e5e5e5] border-y border-[#d4d4d4] text-[13px]">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[170px_minmax(0,1fr)]">
              <dt className="text-[#666]">Плательщик</dt>
              <dd>{name}</dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[170px_minmax(0,1fr)]">
              <dt className="text-[#666]">Обучающийся</dt>
              <dd>
                {name}, группа {group.code}, {group.course} курс, {group.programCode} «{group.programName}», зачётная книжка № <span className="font-mono">{student.recordBook}</span>
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[170px_minmax(0,1fr)]">
              <dt className="text-[#666]">Назначение платежа</dt>
              <dd>
                Оплата обучения по договору <span className="whitespace-nowrap">№ {p.contractNo}</span> за {periodForPurpose(p.period)}, обучающийся {name}. НДС не облагается.
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[170px_minmax(0,1fr)]">
              <dt className="text-[#666]">Срок оплаты</dt>
              <dd className="tabular">до {formatDateLong(p.dueAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="relative mt-6 rounded-[4px] border border-[#d4d4d4] px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[13px] text-[#666]">Сумма к оплате</span>
            <span className="font-mono text-[20px] font-semibold tabular">{formatRubPlain(p.amount)}&nbsp;руб.</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug">{rublesInWords(p.amount)}</p>
        </section>

        <div className="relative mt-6 text-[13px]">
          <span className="text-[#666]">Отметка об оплате: </span>
          {p.paidAt ? (
            <span>
              оплата поступила {formatDateLong(p.paidAt)}
              {p.receiptNo ? (
                <>
                  , платёжный документ № <span className="font-mono">{p.receiptNo}</span>
                </>
              ) : null}
              .
            </span>
          ) : (
            <span>не оплачено.</span>
          )}
        </div>

        <footer className="relative mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 text-[13px] sm:grid-cols-2">
          <div>
            <div className="border-b border-[#999] pb-6" />
            <div className="mt-1 text-[11px] text-[#666]">Подпись плательщика</div>
          </div>
          <div>
            <div className="border-b border-[#999] pb-6" />
            <div className="mt-1 text-[11px] text-[#666]">Дата</div>
          </div>
        </footer>

        <p className="relative mt-8 border-t border-[#ddd] pt-3 text-center text-[10px] text-[#777]">Образец документа, сформирован {formatDateLong(now)}.</p>
      </article>
    </div>
  );
}
