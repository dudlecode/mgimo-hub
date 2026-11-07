// Тексты уведомлений студенту на двух языках. Русский уходит в title/body, английский в title_en/body_en,
// и кабинет показывает тот, что выбран в интерфейсе. Шаблоны общие для экшенов и демо-данных (сида),
// поэтому формулировки не расходятся. Свободный текст сотрудника (сообщение, причина, примечание)
// не переводится: он вставляется как есть в обе версии.
import { formatDateTime, formatDayMonth, formatTime, formatWeekday, mskParts, WEEKDAYS_SHORT, WEEKDAYS_SHORT_EN } from "@/lib/time";
import { localizeRequestTitle } from "@/lib/requests/catalog-en";
import { topicLabelFor } from "@/lib/i18n/messages/appointments";
import { dayLabelFor, periodLabelFor } from "@/lib/i18n/messages/sick-leave";
import { formatRubFor, localizePeriod } from "@/lib/i18n/messages/payments";
import { formatRub } from "@/lib/payments";
import { slotRange } from "@/lib/appointments";
import { markLabel, type Mark } from "@/lib/grades";
import { pluralEn, pluralRu } from "@/lib/i18n/define";
import { latin } from "@/lib/i18n/translit";
import { roomEn } from "@/lib/i18n/messages/schedule";

export type BiText = { title: string; body: string; titleEn: string; bodyEn: string };
/** Название дисциплины на двух языках: en из disciplines.name_en, если перевода нет, русское */
export type BiName = { ru: string; en?: string | null };

const en = (n: BiName) => n.en || n.ru;
const wdRu = (d: Date) => WEEKDAYS_SHORT[mskParts(d).wd].toLowerCase();
const wdEn = (d: Date) => WEEKDAYS_SHORT_EN[mskParts(d).wd];
const pairRu = (d: Date, pair: number) => `${wdRu(d)}, ${formatDayMonth(d)}, ${pair}-я пара`;
const pairEn = (d: Date, pair: number) => `${wdEn(d)}, ${formatDayMonth(d, "en")}, period ${pair}`;
const withNote = (note?: string | null) => (note ? ` ${note}` : "");
const rubEn = (n: number) => formatRubFor(n, "en", formatRub);
const typeEn = (ruTitle: string) => localizeRequestTitle(ruTitle, "en");

/* ───────────── Расписание ───────────── */

export const lessonText = {
  cancelled: (c: BiName, d: Date, pair: number, note?: string | null): BiText => ({
    title: "Занятие отменено",
    body: `${c.ru}, ${pairRu(d, pair)}: занятие отменено.${withNote(note)}`,
    titleEn: "Class cancelled",
    bodyEn: `${en(c)}, ${pairEn(d, pair)}: the class is cancelled.${withNote(note)}`,
  }),
  room: (c: BiName, d: Date, pair: number, room: string, prev: string): BiText => ({
    title: "Другая аудитория",
    body: `${c.ru}, ${pairRu(d, pair)}: аудитория ${room} вместо ${prev}`,
    titleEn: "Room change",
    bodyEn: `${en(c)}, ${pairEn(d, pair)}: room ${roomEn(room)} instead of ${roomEn(prev)}`,
  }),
  moved: (c: BiName, from: Date, fromPair: number, to: Date): BiText => ({
    title: "Перенос занятия",
    body: `${c.ru}: перенос с ${pairRu(from, fromPair)} на ${wdRu(to)}, ${formatDayMonth(to)}, ${formatTime(to)}`,
    titleEn: "Class moved",
    bodyEn: `${en(c)}: moved from ${pairEn(from, fromPair)} to ${wdEn(to)}, ${formatDayMonth(to, "en")}, ${formatTime(to, "en")}`,
  }),
  restored: (c: BiName, d: Date, pair: number): BiText => ({
    title: "Занятие по расписанию",
    body: `${c.ru}, ${pairRu(d, pair)}: изменение отменено, занятие проходит по обычному расписанию`,
    titleEn: "Back to the usual schedule",
    bodyEn: `${en(c)}, ${pairEn(d, pair)}: the change is cancelled, the class runs as scheduled`,
  }),
  substitute: (c: BiName, d: Date, pair: number, teacher: string): BiText => ({
    title: "Замена преподавателя",
    body: `${c.ru}, ${pairRu(d, pair)}: занятие проведёт ${teacher}`,
    titleEn: "Substitute teacher",
    bodyEn: `${en(c)}, ${pairEn(d, pair)}: taught by ${latin(teacher)}`,
  }),
};

/* ───────────── Заявки ───────────── */

export type RequestStep = "take" | "start" | "ask" | "ready" | "complete" | "reject" | "comment";

const STEP_TITLE: Record<Exclude<RequestStep, "ready">, [string, string]> = {
  take: ["Заявка принята в работу", "Request taken into work"],
  start: ["Документ готовится", "Your document is being prepared"],
  ask: ["Нужно ваше уточнение", "We need more information"],
  complete: ["Заявка закрыта", "Request closed"],
  reject: ["Заявка отклонена", "Request declined"],
  comment: ["Сообщение от учебного офиса", "Message from the student office"],
};

export const requestText = {
  submitted: (type: string, number: string, dueAt: Date): BiText => ({
    title: "Заявка подана",
    body: `${type} ${number}. Ориентировочный срок: ${formatDayMonth(dueAt)}.`,
    titleEn: "Request submitted",
    bodyEn: `${typeEn(type)} ${number}. Expected by ${formatDayMonth(dueAt, "en")}.`,
  }),
  /** Смена статуса сотрудником. text и textEn: сообщение студенту; автосообщение переводится, текст сотрудника нет */
  step: (step: RequestStep, type: string, number: string, opts: { certificate: boolean; paper: boolean; text?: string | null; textEn?: string | null }): BiText => {
    const [ru, eng] =
      step === "ready"
        ? opts.certificate
          ? opts.paper
            ? ["Справка готова, заберите в офисе", "Certificate ready, collect it at the office"]
            : ["Справка готова", "Certificate ready"]
          : ["Заявление одобрено", "Application approved"]
        : STEP_TITLE[step];
    const text = opts.text?.slice(0, 140);
    const textEn = (opts.textEn ?? opts.text)?.slice(0, 160);
    return { title: ru, body: `${type} ${number}${text ? `: ${text}` : ""}`, titleEn: eng, bodyEn: `${typeEn(type)} ${number}${textEn ? `: ${textEn}` : ""}` };
  },
  /** Автосообщение при «готово»: на русском уходит в историю заявки, английское только в уведомление */
  readyMessage: (opts: { certificate: boolean; paper: boolean; officeCode: string; room: string; hours: string; hoursEn: string }): { ru: string; en: string } =>
    opts.paper
      ? {
          ru: `Документ готов. Заберите в учебном офисе ${opts.officeCode}, ауд. ${opts.room} (${opts.hours}). При себе, студенческий билет.`,
          en: `Your document is ready. Collect it at the ${latin(opts.officeCode)} student office, room ${opts.room} (${opts.hoursEn}). Please bring your student card.`,
        }
      : opts.certificate
        ? { ru: "Справка готова. Откройте её в кабинете, подлинность проверяется по QR-коду.", en: "Your certificate is ready. Open it in MGIMO Hub; its authenticity can be checked with the QR code." }
        : { ru: "Заявление рассмотрено и одобрено.", en: "Your application has been reviewed and approved." },
  issuedAtOffice: (type: string, number: string): BiText => ({
    title: "Справка готова",
    body: `${type} ${number} оформлена в учебном офисе.`,
    titleEn: "Certificate ready",
    bodyEn: `${typeEn(type)} ${number} was issued at the student office.`,
  }),
};

/* ───────────── Запись на приём ───────────── */

export const appointmentText = {
  booked: (topic: string, at: Date, officeCode: string, room: string, ticket: string): BiText => ({
    title: "Вы записаны на приём",
    body: `${topicLabelFor(topic, "ru")}: ${formatWeekday(at)}, ${formatDayMonth(at)}, ${slotRange(at)}. Учебный офис ${officeCode}, ауд. ${room}. Талон ${ticket}.`,
    titleEn: "Appointment booked",
    bodyEn: `${topicLabelFor(topic, "en")}: ${formatWeekday(at, "en")}, ${formatDayMonth(at, "en")}, ${slotRange(at)}. ${latin(officeCode)} student office, room ${room}. Ticket ${ticket}.`,
  }),
  cancelled: (topic: string, at: Date, durationMin: number, reason: string): BiText => ({
    title: "Запись на приём отменена",
    body: `${topicLabelFor(topic, "ru")}, ${formatWeekday(at)}, ${formatDayMonth(at)}, ${slotRange(at, durationMin)}. Причина: ${reason}. Выберите другое время.`,
    titleEn: "Appointment cancelled",
    bodyEn: `${topicLabelFor(topic, "en")}, ${formatWeekday(at, "en")}, ${formatDayMonth(at, "en")}, ${slotRange(at, durationMin)}. Reason: ${reason}. Please choose another time.`,
  }),
};

/* ───────────── Больничный ───────────── */

export const sickText = {
  approved: (startsOn: string, endsOn: string): BiText =>
    startsOn === endsOn
      ? {
          title: "Больничный засчитан",
          body: `Пропуск ${dayLabelFor(startsOn, "ru")} засчитан по уважительной причине.`,
          titleEn: "Sick leave accepted",
          bodyEn: `Your absence on ${dayLabelFor(startsOn, "en")} is excused.`,
        }
      : {
          title: "Больничный засчитан",
          body: `Пропуски ${periodLabelFor(startsOn, endsOn, "ru")} засчитаны по уважительной причине.`,
          titleEn: "Sick leave accepted",
          bodyEn: `Your absences ${periodLabelFor(startsOn, endsOn, "en")} are excused.`,
        },
  rejected: (startsOn: string, endsOn: string | null, reason: string): BiText => ({
    title: "Справка не принята",
    body: `Больничный ${periodLabelFor(startsOn, endsOn, "ru")}. Причина: ${reason}. Можно сообщить о болезни заново и приложить другую справку.`,
    titleEn: "Medical certificate not accepted",
    bodyEn: `Sick leave ${periodLabelFor(startsOn, endsOn, "en")}. Reason: ${reason}. You can report the illness again and attach another certificate.`,
  }),
};

/* ───────────── Оплата обучения ───────────── */

export const paymentText = {
  overdue: (period: string, amount: number, dueAt: Date): BiText => ({
    title: "Просрочена оплата обучения",
    body: `${period}: ${formatRub(amount)}, срок был ${formatDayMonth(dueAt)}. Оплатите по квитанции в разделе «Оплата обучения» или напишите в учебный офис.`,
    titleEn: "Tuition payment overdue",
    bodyEn: `${localizePeriod(period, "en")}: ${rubEn(amount)}, due ${formatDayMonth(dueAt, "en")}. Pay with the invoice in Tuition or write to the student office.`,
  }),
  soon: (period: string, amount: number, dueAt: Date): BiText => ({
    title: "Скоро срок оплаты",
    body: `${period}: ${formatRub(amount)} до ${formatDayMonth(dueAt)}. Квитанция в разделе «Оплата обучения».`,
    titleEn: "Tuition payment due soon",
    bodyEn: `${localizePeriod(period, "en")}: ${rubEn(amount)} by ${formatDayMonth(dueAt, "en")}. The invoice is in Tuition.`,
  }),
  received: (period: string, amount: number, receiptNo: string): BiText => ({
    title: "Оплата поступила",
    body: `${period}: ${formatRub(amount)}, платёжный документ № ${receiptNo}. Спасибо.`,
    titleEn: "Payment received",
    bodyEn: `${localizePeriod(period, "en")}: ${rubEn(amount)}, payment document no. ${receiptNo}. Thank you.`,
  }),
};

/* ───────────── Пересдачи и баллы ───────────── */

const whenRetakeRu = (d: Date) => `${wdRu(d)}, ${formatDateTime(d)}`;
const whenRetakeEn = (d: Date) => `${wdEn(d)}, ${formatDateTime(d, "en")}`;

export const gradeText = {
  referral: (c: BiName, at: Date, room: string, number: string, commission: string[]): BiText => {
    // ФИО заканчиваются точкой («Горелов В. П.»), поэтому комиссия в конце текста, без своей точки
    const ru = commission.length ? ` ${commission.length > 1 ? "Комиссия" : "Принимает"}: ${commission.join(", ")}` : "";
    const eng = commission.length ? ` ${commission.length > 1 ? "Board" : "Examiner"}: ${commission.map(latin).join(", ")}` : "";
    return {
      title: "Направление на пересдачу",
      body: `${c.ru}: ${whenRetakeRu(at)}, ауд. ${room}. Направление № ${number}.${ru}`,
      titleEn: "Retake referral",
      bodyEn: `${en(c)}: ${whenRetakeEn(at)}, room ${room}. Referral no. ${number}.${eng}`,
    };
  },
  passed: (c: BiName, mark: Mark, points: number): BiText => ({
    title: "Пересдача сдана",
    body: `${c.ru}: «${markLabel(mark)}», ${points} ${pluralRu(points, "балл", "балла", "баллов")}. Задолженность закрыта.`,
    titleEn: "Retake passed",
    bodyEn: `${en(c)}: ${markLabel(mark, "en")}, ${points} ${pluralEn(points, "point", "points")}. The academic debt is cleared.`,
  }),
  failed: (c: BiName, mark: Mark, last: boolean): BiText => ({
    title: "Пересдача не сдана",
    body: last ? `${c.ru}: «${markLabel(mark)}». Попытки пересдачи исчерпаны, учебный офис свяжется с вами.` : `${c.ru}: «${markLabel(mark)}». Учебный офис назначит пересдачу комиссии и пришлёт направление.`,
    titleEn: "Retake not passed",
    bodyEn: last
      ? `${en(c)}: ${markLabel(mark, "en")}. No retake attempts are left; the student office will contact you.`
      : `${en(c)}: ${markLabel(mark, "en")}. The student office will schedule a retake before a board and send you a referral.`,
  }),
  absent: (c: BiName, at: Date): BiText => ({
    title: "Неявка на пересдачу",
    body: `${c.ru}, ${formatDayMonth(at)}: вы не пришли на пересдачу. Если причина уважительная, сообщите в учебный офис, дату назначат заново.`,
    titleEn: "Missed retake",
    bodyEn: `${en(c)}, ${formatDayMonth(at, "en")}: you did not attend the retake. If you had a valid reason, tell the student office and a new date will be set.`,
  }),
  debt: (c: BiName, mark: Mark): BiText => ({
    title: "Академическая задолженность",
    body: `${c.ru}: «${markLabel(mark)}». Запишитесь на пересдачу, чтобы закрыть долг до конца семестра.`,
    titleEn: "Academic debt",
    bodyEn: `${en(c)}: ${markLabel(mark, "en")}. Sign up for a retake to clear the debt before the end of the semester.`,
  }),
  scored: (c: BiName, assessment: BiName, points: number | string, max: number | string): BiText => ({
    title: "Выставлены баллы",
    body: `${c.ru}: «${assessment.ru}», ${points} из ${max}`,
    titleEn: "New points",
    bodyEn: `${en(c)}: ${en(assessment)}, ${points} of ${max}`,
  }),
};

/* ───────────── Прочее ───────────── */

export const systemText = {
  welcome: (): BiText => ({
    title: "Добро пожаловать в MGIMO Hub",
    body: "Здесь расписание, баллы, справки и новости деканата. Спросите Атташе, ассистент подскажет, где что найти.",
    titleEn: "Welcome to MGIMO Hub",
    bodyEn: "Your schedule, points, certificates and dean's office news are all here. Ask Attaché and it will show you where to find things.",
  }),
  /** Сообщение сотрудника студенту: заголовок переводится, сам текст остаётся как написан */
  fromOffice: (officeCode: string | null, message: string): BiText => ({
    title: officeCode ? `Сообщение от учебного офиса ${officeCode}` : "Сообщение от студенческого офиса",
    body: message,
    titleEn: officeCode ? `Message from the ${latin(officeCode)} student office` : "Message from the Student Office",
    bodyEn: message,
  }),
};
