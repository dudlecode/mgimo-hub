// Английское наложение на каталог справок и заявлений (catalog.ts) для кабинета студента.
// Русский каталог не меняется: кабинет сотрудника, бланки и ассистент деканата читают его напрямую.
// Значения полей (value) общие для обоих языков, переводятся только подписи.
import type { RequestStatus } from "@/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { formatDateLong, parseDayKey } from "@/lib/time";
import { DELIVERY_LABEL, getRequestType, REQUEST_TYPES, STATUS_META, TRACK_STEPS, type FieldDef, type RequestTypeDef, type Tone } from "./catalog";

type FieldEn = { label: string; placeholder?: string; hint?: string; options?: Record<string, string> };
type TypeEn = { title: string; short: string; description: string; keywords: string[]; fields: Record<string, FieldEn> };

const PURPOSE_EN: Record<string, string> = {
  "по месту требования": "To whom it may concern",
  "для работодателя": "For an employer",
  "в банк": "For a bank",
  "в органы социальной защиты": "For social services",
  "в налоговую инспекцию": "For the tax office (deduction)",
  "в Пенсионный фонд / СФР": "For the Social Fund",
  "для общежития": "For student housing",
};

const TYPES_EN: Record<string, TypeEn> = {
  "study-certificate": {
    title: "Certificate of enrolment",
    short: "Confirms that you are a student. For an employer, a bank or social services",
    description:
      "An official certificate confirming that you study at the university: school, year, mode and basis of study. The certificate is issued in Russian. Most organisations accept the electronic version with a QR code, and anyone can check that it is genuine online.",
    keywords: ["certificate", "enrolment", "enrollment", "proof of study", "student status", "employer", "bank", "social services", "tax"],
    fields: {
      purpose: { label: "Where you need it", options: PURPOSE_EN },
      addressee: { label: "Organisation name", placeholder: "Optional, for example, your bank" },
    },
  },
  "embassy-certificate": {
    title: "Certificate for an embassy",
    short: "Certificate of enrolment in English, for a visa",
    description:
      "A certificate in English for a visa centre or an embassy. It confirms that you study here and, if needed, that the trip is agreed for the holidays or an internship.",
    keywords: ["embassy", "visa", "visa centre", "visa center", "schengen", "travel", "trip", "english", "certificate of enrolment"],
    fields: {
      country: { label: "Country", placeholder: "For example, Italy" },
      travelFrom: { label: "Travelling from" },
      travelTo: { label: "to" },
      purpose: {
        label: "Purpose of the trip",
        options: { tourism: "Tourism (holidays)", internship: "Internship", exchange: "Exchange or study abroad", conference: "Conference or competition" },
      },
    },
  },
  "military-certificate": {
    title: "Certificate for the military office",
    short: "Proof of full-time study for the military commissariat",
    description:
      "A certificate of full-time study for the military commissariat. It is issued on paper with a stamp only. Collect it from the student office.",
    keywords: ["military", "commissariat", "deferment", "draft", "conscription", "army"],
    fields: {
      commissariat: { label: "Military commissariat", placeholder: "For example, Gagarinsky District, Moscow" },
    },
  },
  "scholarship-certificate": {
    title: "Scholarship certificate",
    short: "The amount of your scholarship for a chosen period",
    description: "A certificate stating the scholarship paid to you, for example for social services or a tax deduction.",
    keywords: ["scholarship", "stipend", "payments", "amount"],
    fields: {
      period: { label: "Period", options: { "3": "Last 3 months", "6": "Last 6 months", "12": "Last 12 months" } },
      purpose: { label: "Where you need it", options: PURPOSE_EN },
    },
  },
  transcript: {
    title: "Transcript of Records",
    short: "Your grades with ECTS credits for all semesters",
    description:
      "A transcript of your grades with ECTS credits, in Russian or English, for an exchange, a double degree, an internship or an employer. Signed by the dean.",
    keywords: ["transcript", "records", "grades", "ects", "exchange", "double degree"],
    fields: {
      language: { label: "Language", options: { ru: "Russian", en: "English" } },
      purpose: {
        label: "Purpose",
        options: { exchange: "Exchange programme", internship: "Internship or employer", "double-degree": "Double degree", other: "Other" },
      },
    },
  },
  "individual-plan": {
    title: "Individual study plan",
    short: "Flexible attendance if you work, intern or train",
    description:
      "An application to study on an individual plan: you agree deadlines and attendance with your teachers. The dean makes the decision.",
    keywords: ["individual plan", "individual study plan", "flexible attendance", "work", "internship", "sport"],
    fields: {
      reason: {
        label: "Reason",
        options: {
          work: "Work in your field",
          internship: "Internship",
          sport: "Sports training camp",
          family: "Family circumstances",
          health: "Health",
          other: "Other",
        },
      },
      details: { label: "Briefly describe your situation", placeholder: "Where you work or intern and on which days you can attend classes" },
    },
  },
  "academic-leave": {
    title: "Academic leave",
    short: "A break from studies of up to 2 years, keeping your place",
    description:
      "An application for academic leave. You will need supporting documents. After reviewing your application, a specialist will tell you which ones.",
    keywords: ["academic leave", "leave of absence", "break", "pause", "gap"],
    fields: {
      reason: {
        label: "Grounds",
        options: { medical: "Medical reasons", family: "Family circumstances", military: "Military service", other: "Other" },
      },
      startDate: { label: "Start date" },
      details: { label: "Comment" },
    },
  },
  "credit-transfer": {
    title: "Credit transfer",
    short: "After an exchange, another university or online courses",
    description:
      "Recognition of results from another university (an exchange or study abroad) or from online courses. Attach your transcript, or bring it to the student office.",
    keywords: ["credit transfer", "transfer credits", "recognition", "exchange", "study abroad", "online course"],
    fields: {
      university: { label: "University or platform", placeholder: "For example, Università Bocconi" },
      disciplines: { label: "Courses to transfer", placeholder: "One per line: title, credits, grade" },
    },
  },
  retake: {
    title: "Retake",
    short: "Sign up to retake a failed exam or test",
    description: "An application to retake an exam or a pass/fail test. The student office will agree the date with the department and notify you.",
    keywords: ["retake", "resit", "failed", "fail", "debt", "exam"],
    fields: {
      course: { label: "Course" },
      preferred: {
        label: "Preferred time",
        options: { asap: "As soon as possible", "weekday-morning": "Weekdays, morning", "weekday-evening": "Weekdays, after classes" },
      },
      details: { label: "Comment" },
    },
  },
  "financial-aid": {
    title: "Financial aid",
    short: "A one-off payment if you are in a difficult situation",
    description: "An application for financial aid. The scholarship committee reviews it, usually within two weeks.",
    keywords: ["financial aid", "financial support", "hardship", "payment", "money"],
    fields: {
      reason: {
        label: "Situation",
        options: { family: "Family financial difficulties", medical: "Medical treatment", event: "Birth of a child or a wedding", other: "Other" },
      },
      details: { label: "Briefly describe your situation" },
    },
  },
  "student-card": {
    title: "Replacement student card",
    short: "If you have lost your student card or record book",
    description: "We will issue a duplicate of your student card or record book. Collect it from the student office.",
    keywords: ["student card", "student id", "lost", "record book", "duplicate", "replacement", "pass"],
    fields: {
      item: { label: "What to replace", options: { card: "Student card", "record-book": "Record book", both: "Both documents" } },
      details: { label: "What happened" },
    },
  },
  "grade-error": {
    title: "Grade error",
    short: "Report incorrect points or a wrong grade",
    description: "If your points or grade are shown incorrectly, describe what is wrong. The student office will check them with the department.",
    keywords: ["error", "wrong grade", "wrong points", "appeal", "mistake"],
    fields: {
      course: { label: "Course" },
      details: { label: "What is wrong", placeholder: "For example: test 1 shows 6 points, but the teacher announced 9" },
    },
  },
};

function localizeField(f: FieldDef, en: FieldEn | undefined): FieldDef {
  if (!en) return f;
  return {
    ...f,
    label: en.label,
    placeholder: en.placeholder ?? (f.placeholder ? undefined : f.placeholder),
    hint: en.hint ?? (f.hint ? undefined : f.hint),
    options: f.options?.map((o) => ({ value: o.value, label: en.options?.[o.value] ?? o.label })),
  };
}

/** Тип заявки на языке интерфейса. Для поиска в английском каталоге сохраняем и русские ключевые слова. */
export function localizeRequestType(def: RequestTypeDef, locale: Locale): RequestTypeDef {
  if (locale !== "en") return def;
  const en = TYPES_EN[def.slug];
  if (!en) return def;
  return {
    ...def,
    title: en.title,
    short: en.short,
    description: en.description,
    keywords: [...en.keywords, ...def.keywords],
    fields: def.fields.map((f) => localizeField(f, en.fields[f.name])),
  };
}

/** getRequestType + перевод */
export function getLocalizedRequestType(slug: string, locale: Locale): RequestTypeDef | undefined {
  const def = getRequestType(slug);
  return def ? localizeRequestType(def, locale) : undefined;
}

export const localizedRequestTypes = (locale: Locale): RequestTypeDef[] => REQUEST_TYPES.map((t) => localizeRequestType(t, locale));

/** Название типа по slug */
export function requestTitle(slug: string, locale: Locale): string | undefined {
  const def = getRequestType(slug);
  if (!def) return undefined;
  return locale === "en" ? (TYPES_EN[slug]?.title ?? def.title) : def.title;
}

/** Перевод уже готового русского названия типа (когда в данных есть только title) */
export function localizeRequestTitle(ruTitle: string, locale: Locale): string {
  if (locale !== "en") return ruTitle;
  const def = REQUEST_TYPES.find((t) => t.title === ruTitle);
  return (def && TYPES_EN[def.slug]?.title) ?? ruTitle;
}

// ───────────── Статусы ─────────────

const STATUS_EN: Record<RequestStatus, { label: string; hint: string }> = {
  submitted: { label: "Submitted", hint: "The student office has your request. We usually start on it within one working day." },
  in_review: { label: "In review", hint: "A specialist is checking the details." },
  needs_info: { label: "Needs your reply", hint: "The specialist needs more information from you. Please reply below." },
  in_progress: { label: "Being prepared", hint: "The document is being prepared and signed." },
  ready: { label: "Ready", hint: "Everything is ready." },
  completed: { label: "Received", hint: "This request is closed." },
  rejected: { label: "Declined", hint: "The request was declined. The reason is given below." },
  cancelled: { label: "Withdrawn", hint: "You withdrew this request." },
};

export function statusMeta(status: RequestStatus, locale: Locale): { label: string; tone: Tone; step: number; hint: string } {
  const ru = STATUS_META[status];
  return locale === "en" ? { ...ru, ...STATUS_EN[status] } : ru;
}

export const statusLabel = (status: RequestStatus, locale: Locale) => statusMeta(status, locale).label;

// Короткие подписи: на 360 px у каждого этапа около 55 px
const TRACK_STEPS_EN = ["Sent", "Review", "Issuing", "Ready", "Received"] as const;

export const trackSteps = (locale: Locale): readonly string[] => (locale === "en" ? TRACK_STEPS_EN : TRACK_STEPS);

const DELIVERY_EN = { electronic: "Electronic, with a QR code", paper: "Paper, with a stamp" } as const;

export const deliveryLabel = (d: "electronic" | "paper", locale: Locale) => (locale === "en" ? DELIVERY_EN[d] : DELIVERY_LABEL[d]);

// ───────────── Поля заявки для показа студенту ─────────────

/**
 * Как displayFields из display.ts, но на языке интерфейса.
 * courseNames: courseId → английское название (для полей «дисциплина» при английском интерфейсе).
 */
export function displayFieldsLocalized(
  typeSlug: string,
  fields: Record<string, string>,
  locale: Locale,
  courseNames?: Map<string, string>,
): { label: string; value: string; fromData?: boolean }[] {
  const def = getLocalizedRequestType(typeSlug, locale);
  if (!def) return [];
  const out: { label: string; value: string; fromData?: boolean }[] = [];
  for (const f of def.fields) {
    const raw = fields[f.name];
    if (!raw) continue;
    let value = raw;
    let fromData = false;
    if (f.type === "select") value = f.options?.find((o) => o.value === raw)?.label ?? raw;
    else if (f.type === "date") {
      const d = parseDayKey(raw);
      value = d ? formatDateLong(d, locale) : raw;
    } else if (f.type === "myCourse" || f.type === "myDebt") {
      const en = locale === "en" ? courseNames?.get(raw) : undefined;
      value = en ?? fields[`${f.name}Title`] ?? (locale === "en" ? "not specified" : "не указано");
      fromData = !en;
    } else fromData = true; // свободный текст, который ввёл студент
    out.push({ label: f.label, value, fromData });
  }
  return out;
}

// ───────────── Ошибки проверки полей (src/lib/data/requests.ts) ─────────────

const FIELD_ERRORS_EN: Record<string, string> = {
  "Заполните это поле": "Please fill in this field",
  "Выберите вариант из списка": "Choose an option from the list",
  "Укажите дату": "Enter a date",
  "Укажите число": "Enter a number",
  "Выберите дисциплину из своего списка": "Choose a course from your list",
  "Выберите дисциплину с задолженностью": "Choose a course you need to retake",
  "Дата поездки уже прошла": "The travel date has already passed",
  "Окончание раньше начала": "The end date is before the start date",
  "Дата уже прошла": "This date has already passed",
};

/** Перевод сообщения об ошибке поля; неизвестное сообщение возвращается как есть */
export function localizeFieldError(message: string, locale: Locale): string {
  if (locale !== "en") return message;
  const max = /^Не больше (\d+) символов$/.exec(message);
  if (max) return `No more than ${max[1]} characters`;
  return FIELD_ERRORS_EN[message] ?? message;
}

// ───────────── Служебные сообщения в истории заявки ─────────────
// Пишутся в БД по-русски (их читает и сотрудник); студенту с английским интерфейсом показываем перевод.

const EVENT_MESSAGES_EN: Record<string, string> = {
  "Заявка отозвана студентом": "Withdrawn by the student",
  "Получение подтверждено": "Receipt confirmed",
  "Оформлено в учебном офисе по обращению студента": "Issued by the student office at your request",
  "Справка готова": "The certificate is ready",
  "Документ скачан.": "Document downloaded.",
};

/** null, если сообщение не служебное (тогда это текст человека, показываем как есть) */
export function localizeEventMessage(message: string, locale: Locale): string | null {
  return locale === "en" ? (EVENT_MESSAGES_EN[message] ?? null) : null;
}

/** Имя системного автора события («Атташе») на языке интерфейса */
export const localizeActorName = (name: string, actor: string, locale: Locale) => (locale === "en" && actor === "system" && name === "Атташе" ? "Attaché" : name);
