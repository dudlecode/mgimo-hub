// Оплата обучения: экран графика платежей и окружение квитанции (сама квитанция остаётся русским платёжным документом).
// Наложение на src/lib/payments.ts: статусы, сроки и периоды по-английски; кабинет сотрудника читает русские подписи оттуда.
import { dueHint as dueHintRu, overdueDays, PAYMENT_STATE_META, type PaymentState } from "@/lib/payments";
import { diffDays } from "@/lib/time";
import type { BadgeTone } from "@/components/ui/badge";
import type { Locale } from "../config";
import { defineMessages, pluralEn, pluralRu } from "../define";

const STATE_EN: Record<PaymentState, string> = { paid: "Paid", overdue: "Overdue", soon: "Due soon", upcoming: "Upcoming" };

export function paymentStateMeta(state: PaymentState, locale: Locale): { label: string; tone: BadgeTone } {
  const ru = PAYMENT_STATE_META[state];
  return locale === "en" ? { ...ru, label: STATE_EN[state] } : ru;
}

/** «просрочено на 4 дня» / overdue by 4 days */
export function dueHintFor(p: { dueAt: Date; paidAt: Date | null }, now: Date, locale: Locale): string | null {
  if (locale !== "en") return dueHintRu(p, now);
  if (p.paidAt) return null;
  if (p.dueAt.getTime() < now.getTime()) {
    const d = Math.max(1, overdueDays(p.dueAt, now));
    return `overdue by ${d} ${pluralEn(d, "day", "days")}`;
  }
  const d = diffDays(now, p.dueAt);
  if (d <= 0) return "today is the last day";
  return `${d} ${pluralEn(d, "day", "days")} left`;
}

/** Период из БД («Осенний семестр 2026/27») по-английски: Autumn semester 2026/27 */
export function localizePeriod(period: string, locale: Locale): string {
  if (locale !== "en") return period;
  return period.replace(/^Осенний семестр/, "Autumn semester").replace(/^Весенний семестр/, "Spring semester");
}

const rubEn = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** Сумма: 350 000 ₽ / 350,000 ₽ (неразрывный пробел перед знаком) */
export function formatRubFor(amount: number, locale: Locale, ruFormat: (n: number) => string): string {
  return locale === "en" ? `${rubEn.format(amount)} ₽` : ruFormat(amount);
}

export const paymentsMessages = defineMessages(
  {
    title: "Оплата обучения",
    budgetTitle: "Вы учитесь на бюджетном месте, оплата не требуется",
    budgetText: "Если основа обучения изменится, договор, график платежей и квитанции появятся здесь.",
    noScheduleTitle: "График платежей пока не сформирован",
    noScheduleText: (code: string, room: string, hours: string) =>
      `Он появится здесь после подписания договора. Вопросы по оплате: учебный офис ${code}, ауд. ${room}, ${hours}.`,
    contract: (no: string) => `Договор № ${no}`,
    yearTitle: (label: string) => `${label} учебный год`,
    otherPayments: "Другие платежи",
    paidPrefix: "оплачено ",
    paidMid: " из ",
    paidSuffix: "",
    howToPay: "Как оплатить",
    steps: [
      "Откройте квитанцию к нужному платежу, сохраните PDF или распечатайте её.",
      "Оплатите в отделении банка или в приложении банка по реквизитам из квитанции. В назначении платежа укажите номер договора.",
      "Оплата поступает за 1-3 рабочих дня. После этого статус здесь сменится на «Оплачено».",
    ] as string[],
    deferral: (code: string, room: string, hours: string) => `Нужна отсрочка или рассрочка? Учебный офис ${code}: ауд. ${room}, ${hours},`,
    taxTitle: "Налоговый вычет за обучение",
    taxText: "Часть оплаты можно вернуть через социальный налоговый вычет. Для налоговой понадобятся договор, документы об оплате и справка об обучении.",
    orderCertificate: "Заказать справку",
    nextPayment: "Ближайший платёж",
    paid: "Оплачено",
    noDebt: "Задолженности нет",
    allPaid: "Все платежи по графику внесены. Следующий появится с началом нового учебного года.",
    dueDate: "Срок оплаты",
    dueBy: (date: string) => `до ${date}`,
    overdue: "Просрочка",
    untilDue: "До срока",
    days: (n: number) => `${n} ${pluralRu(n, "день", "дня", "дней")}`,
    lastDay: "Сегодня последний день",
    receipt: "Квитанция",
    rowDue: (date: string) => `срок до ${date}`,
    paidOn: (date: string) => `Оплачено ${date}`,
    documentNo: (no: string) => `документ № ${no}`,

    // ошибка
    errorTitle: "Не удалось загрузить график оплаты",
    errorText: "Попробуйте ещё раз через пару секунд. Если срок оплаты близко, квитанцию можно получить в учебном офисе.",
    errorCode: "Код ошибки:",
    retry: "Повторить",
    home: "На главную",
    loading: "Загрузка",

    // квитанция (окружение)
    receiptTitle: "Квитанция",
    backToPayments: "К оплате обучения",
  },
  {
    title: "Tuition fees",
    budgetTitle: "You study on a state-funded place, so no payment is needed",
    budgetText: "If your basis of study changes, your contract, payment schedule and receipts will appear here.",
    noScheduleTitle: "Your payment schedule is not ready yet",
    noScheduleText: (_code, room, hours) =>
      `It will appear here once the contract is signed. For questions about payment, contact the student office, room ${room}, ${hours}.`,
    contract: (no) => `Contract No. ${no}`,
    yearTitle: (label) => `Academic year ${label}`,
    otherPayments: "Other payments",
    paidPrefix: "",
    paidMid: " of ",
    paidSuffix: " paid",
    howToPay: "How to pay",
    steps: [
      "Open the receipt for the payment you need, then save it as a PDF or print it.",
      "Pay at a bank branch or in your banking app using the details on the receipt. Put your contract number in the payment reference.",
      "The payment arrives within 1-3 working days. After that, the status here changes to Paid.",
    ],
    deferral: (_code, room, hours) => `Need to defer a payment or pay in instalments? Student office: room ${room}, ${hours},`,
    taxTitle: "Tax deduction for tuition",
    taxText: "You can get part of your fees back through the social tax deduction. The tax office will need your contract, proof of payment and a certificate of enrolment.",
    orderCertificate: "Order certificate",
    nextPayment: "Next payment",
    paid: "Paid",
    noDebt: "Nothing is due",
    allPaid: "All scheduled payments have been made. The next one will appear when the new academic year starts.",
    dueDate: "Due date",
    dueBy: (date) => `by ${date}`,
    overdue: "Overdue by",
    untilDue: "Time left",
    days: (n) => `${n} ${pluralEn(n, "day", "days")}`,
    lastDay: "Today is the last day",
    receipt: "Receipt",
    rowDue: (date) => `due by ${date}`,
    paidOn: (date) => `Paid on ${date}`,
    documentNo: (no) => `document No. ${no}`,

    errorTitle: "Couldn't load the payment schedule",
    errorText: "Please try again in a few seconds. If the due date is close, you can get a receipt from the student office.",
    errorCode: "Error code:",
    retry: "Try again",
    home: "Go to Today",
    loading: "Loading",

    receiptTitle: "Receipt",
    backToPayments: "Back to tuition fees",
  },
);
