// Больничный: экран, формы, ответы /api/sick-leave/*.
// Наложение на src/lib/sick-leave.ts: статусы и периоды по-английски; кабинет сотрудника читает русские подписи оттуда.
// Письмо преподавателю всегда по-русски (преподаватели русскоязычные), переводится только интерфейс вокруг.
import type { SickLeaveStatus } from "@/db/schema";
import { dayLabel as dayLabelRu, periodLabel as periodLabelRu, SICK_STATUS } from "@/lib/sick-leave";
import { formatDayMonth, parseDayKey } from "@/lib/time";
import type { BadgeTone } from "@/components/ui/badge";
import type { Locale } from "../config";
import { defineMessages, pluralEn, pluralRu } from "../define";

const STATUS_EN: Record<SickLeaveStatus, string> = { open: "On sick leave", submitted: "Under review", approved: "Approved", rejected: "Declined" };

export function sickStatus(status: SickLeaveStatus, locale: Locale): { label: string; tone: BadgeTone } {
  const ru = SICK_STATUS[status];
  return locale === "en" ? { ...ru, label: STATUS_EN[status] } : ru;
}

/** «4 ноября» / 4 November из «2026-11-04» */
export function dayLabelFor(key: string, locale: Locale): string {
  if (locale !== "en") return dayLabelRu(key);
  const d = parseDayKey(key);
  return d ? formatDayMonth(d, "en") : key;
}

/** «с 3 по 7 ноября» / 3 to 7 November, from 4 November, 28 October to 3 November */
export function periodLabelFor(startsOn: string, endsOn: string | null, locale: Locale): string {
  if (locale !== "en") return periodLabelRu(startsOn, endsOn);
  if (!endsOn) return `from ${dayLabelFor(startsOn, "en")}`;
  if (startsOn === endsOn) return dayLabelFor(startsOn, "en");
  const [sy, sm] = startsOn.split("-");
  const [ey, em] = endsOn.split("-");
  const start = sy === ey && sm === em ? String(Number(startsOn.slice(8, 10))) : dayLabelFor(startsOn, "en");
  return `${start} to ${dayLabelFor(endsOn, "en")}`;
}

// Ошибки из src/lib/data/sick-leave.ts и src/lib/sick-leave-file.ts приходят по-русски
const ERRORS_EN: Record<string, string> = {
  "Больничный уже открыт. Обновите страницу": "Your sick leave is already open. Please reload the page",
  "Этот день уже входит в другой ваш больничный": "This day is already part of another sick leave",
  "Больничный не найден": "Sick leave not found",
  "Последний день болезни раньше первого": "The last day of illness is before the first one",
  "Дата окончания ещё не наступила": "The end date has not come yet",
  "Файл пустой": "The file is empty",
  "Файл больше 5 МБ. Сожмите фото или сохраните справку в PDF": "The file is larger than 5 MB. Compress the photo or save the certificate as a PDF",
  "Подойдут только JPG, PNG или PDF. Этот файл не похож ни на один из них": "Only JPG, PNG or PDF files are accepted. This file doesn't look like any of them",
  "Укажите дату": "Enter a date",
};

export const localizeSickError = (message: string, locale: Locale) => (locale === "en" ? (ERRORS_EN[message] ?? message) : message);

export const sickLeaveMessages = defineMessages(
  {
    title: "Больничный",
    subtitle: "Сообщите о болезни, предупредите преподавателей и приложите справку",
    now: "Сейчас",
    onLeaveSince: (date: string) => `Вы на больничном с ${date}`,
    expectedUntil: (date: string) => `Примерно до ${date}. `,
    officeKnows: "Учебный офис уже в курсе. Поправляйтесь, а договориться с преподавателями о переносе поможет Атташе.",
    recoveredClose: "Выздоровели? Закрыть больничный",
    recovered: "Выздоровели?",
    closeText: "Укажите последний день болезни и приложите справку. Учебный офис проверит её и засчитает пропуски.",
    gotSick: "Заболели?",
    affects: "Что это затрагивает",
    impact: (period: string, lessons: number, works: number, grace: number) =>
      `${period}: ${lessons} ${pluralRu(lessons, "пара", "пары", "пар")}, ${works} ${pluralRu(works, "дедлайн", "дедлайна", "дедлайнов")}. Дедлайны считаем с запасом, ещё ${grace} дня после болезни.`,
    noImpactTitle: "Занятий и контрольных в эти дни нет",
    noImpactText: "Можно спокойно выздоравливать. Если болезнь затянется, дедлайны появятся здесь.",
    deanDeadlines: "Дедлайны деканата",
    how: "Как это устроено",
    steps: [
      { t: "Сообщите сразу", d: "Учебный офис увидит, что вы болеете, ещё до справки." },
      { t: "Предупредите преподавателей", d: "Атташе подготовит письмо о переносе контрольной." },
      { t: "Приложите справку", d: "После выздоровления загрузите фото справки 095/у, пропуски засчитают." },
    ] as { t: string; d: string }[],
    past: "Прошлые больничные",
    days: (n: number) => `${n} ${pluralRu(n, "день", "дня", "дней")}`,
    certificate: "Справка",
    noCertificate: "без справки",
    checking: "учебный офис проверяет",
    reason: (r: string) => `Причина: ${r}. `,
    reopen: "Можно сообщить о болезни заново и приложить другую справку.",
    andMore: (n: number) => ` и ещё ${n}`,
    classes: (n: number) => `${n} ${pluralRu(n, "пара", "пары", "пар")}`,
    loading: "Загрузка",

    // форма «Заболели?»
    sending: "Отправляем…",
    report: "Сообщить о болезни",
    reportedToast: "Учебный офис в курсе",
    reportedToastText: "Поправляйтесь. Справку приложите после выздоровления",
    firstDay: "С какого дня",
    expectedEnd: "Примерно до какого",
    expectedEndHint: "Необязательно, если пока не знаете",
    comment: "Комментарий для учебного офиса",
    commentHint: "Необязательно. Диагноз указывать не нужно",
    commentPlaceholder: "Например: на связи по почте, задания могу сдавать онлайн",
    openFooter: "Учебный офис увидит сообщение сразу. Справку приложите, когда выздоровеете.",

    // форма «Выздоровели?»
    kb: "КБ",
    mb: "МБ",
    decimal: ",",
    errFileType: "Подойдут только JPG, PNG или PDF",
    errFileSize: "Файл больше 5 МБ. Сожмите фото или сохраните справку в PDF",
    errEnterDate: "Укажите дату",
    errBeforeStart: "Раньше первого дня болезни",
    errNotYet: "Этот день ещё не наступил",
    errAttach: "Приложите справку",
    errSendFailed: "Не удалось отправить справку. Попробуйте ещё раз",
    sentToast: "Справка отправлена",
    sentToastText: "Учебный офис проверит её и засчитает пропуски",
    errNoConnection: "Нет соединения. Проверьте интернет и попробуйте ещё раз",
    lastDay: "Последний день болезни",
    certificateField: "Справка",
    certificateHint: "Фото или скан справки 095/у: JPG, PNG или PDF до 5 МБ",
    chooseFile: "Выбрать файл",
    close: "Закрыть больничный",

    // письмо преподавателю
    letterFailed: "Не удалось подготовить письмо",
    copyFailed: "Не получилось скопировать. Выделите текст и скопируйте вручную",
    drafting: "Готовим письмо…",
    letterButton: "Письмо преподавателю",
    subject: "Тема",
    copied: "Скопировано",
    copySubject: "Скопировать тему",
    letter: "Письмо",
    copy: "Скопировать",
    another: "Другой вариант",
    byAi: "Черновик подготовил Атташе.",
    byTemplate: "Черновик по шаблону.",
    checkAndSend: "Проверьте текст и отправьте со своей почты.",
    russianNote: "",

    // ошибки экшенов и /api/sick-leave/*
    errCheckFields: "Проверьте выделенные поля",
    errComment500: "Не больше 500 символов",
    errTooEarly: "Можно указать не раньше чем 30 дней назад",
    errWithinTwoMonths: "Укажите дату в пределах двух месяцев",
    apiRejected: "Запрос отклонён",
    apiSignIn: "Требуется вход",
    apiNotFound: "Не найдено",
    apiNoAccess: "Нет доступа",
    apiBadRequest: "Некорректный запрос",
    apiReadFailed: "Не удалось прочитать файл. Попробуйте ещё раз",
    apiTooMany: (limit: number, minutes: number) => `Слишком много запросов подряд. Подождите несколько минут, лимит ${limit} за ${minutes} минут.`,
  },
  {
    title: "Sick leave",
    subtitle: "Report an illness, let your teachers know and attach a medical certificate",
    now: "Now",
    onLeaveSince: (date) => `You have been on sick leave since ${date}`,
    expectedUntil: (date) => `Expected until about ${date}. `,
    officeKnows: "The student office already knows. Get well soon. Attaché will help you arrange new dates with your teachers.",
    recoveredClose: "Recovered? Close sick leave",
    recovered: "Recovered?",
    closeText: "Enter your last day of illness and attach the medical certificate. The student office will check it and excuse your absences.",
    gotSick: "Feeling ill?",
    affects: "What this affects",
    impact: (period, lessons, works, grace) =>
      `${period}: ${lessons} ${pluralEn(lessons, "class", "classes")}, ${works} ${pluralEn(works, "deadline", "deadlines")}. To be safe, we include deadlines up to ${grace} days after your illness.`,
    noImpactTitle: "No classes or tests on these days",
    noImpactText: "You can rest and recover. If your illness lasts longer, deadlines will appear here.",
    deanDeadlines: "Dean's office deadlines",
    how: "How it works",
    steps: [
      { t: "Report it straight away", d: "The student office will see that you are ill even before you have a certificate." },
      { t: "Let your teachers know", d: "Attaché will draft a letter asking to reschedule a test." },
      { t: "Attach the certificate", d: "When you recover, upload a photo of medical certificate form 095/u, and your absences will be excused." },
    ],
    past: "Past sick leave",
    days: (n) => `${n} ${pluralEn(n, "day", "days")}`,
    certificate: "Certificate",
    noCertificate: "no certificate",
    checking: "the student office is checking",
    reason: (r) => `Reason: ${r}. `,
    reopen: "You can report the illness again and attach a different certificate.",
    andMore: (n) => ` and ${n} more`,
    classes: (n) => `${n} ${pluralEn(n, "class", "classes")}`,
    loading: "Loading",

    sending: "Sending…",
    report: "Report illness",
    reportedToast: "The student office has been informed",
    reportedToastText: "Get well soon. Attach the certificate once you have recovered",
    firstDay: "First day of illness",
    expectedEnd: "Expected last day",
    expectedEndHint: "Optional if you don't know yet",
    comment: "Comment for the student office",
    commentHint: "Optional. You don't need to give a diagnosis",
    commentPlaceholder: "For example: reachable by email, can submit work online",
    openFooter: "The student office will see your report straight away. Attach the certificate when you recover.",

    kb: "KB",
    mb: "MB",
    decimal: ".",
    errFileType: "Only JPG, PNG or PDF files are accepted",
    errFileSize: "The file is larger than 5 MB. Compress the photo or save the certificate as a PDF",
    errEnterDate: "Enter a date",
    errBeforeStart: "This is before the first day of illness",
    errNotYet: "This day has not come yet",
    errAttach: "Attach the certificate",
    errSendFailed: "Couldn't send the certificate. Please try again",
    sentToast: "Certificate sent",
    sentToastText: "The student office will check it and excuse your absences",
    errNoConnection: "No connection. Check your internet and try again",
    lastDay: "Last day of illness",
    certificateField: "Medical certificate",
    certificateHint: "A photo or scan of form 095/u: JPG, PNG or PDF up to 5 MB",
    chooseFile: "Choose file",
    close: "Close sick leave",

    letterFailed: "Couldn't prepare the letter",
    copyFailed: "Couldn't copy. Select the text and copy it manually",
    drafting: "Preparing the letter…",
    letterButton: "Letter to the teacher",
    subject: "Subject",
    copied: "Copied",
    copySubject: "Copy subject",
    letter: "Letter",
    copy: "Copy",
    another: "Another version",
    byAi: "Attaché prepared this draft.",
    byTemplate: "Draft from a template.",
    checkAndSend: "Check the text and send it from your own email.",
    russianNote: "The letter is in Russian because teachers expect Russian.",

    errCheckFields: "Please check the highlighted fields",
    errComment500: "No more than 500 characters",
    errTooEarly: "The date can be no more than 30 days ago",
    errWithinTwoMonths: "Choose a date within two months",
    apiRejected: "Request rejected",
    apiSignIn: "Please sign in",
    apiNotFound: "Not found",
    apiNoAccess: "Access denied",
    apiBadRequest: "Invalid request",
    apiReadFailed: "Couldn't read the file. Please try again",
    apiTooMany: (limit, minutes) => `Too many requests in a row. Please wait a few minutes: the limit is ${limit} per ${minutes} minutes.`,
  },
);
