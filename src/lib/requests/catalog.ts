// Каталог справок и заявлений. Добавить новый тип = добавить объект в REQUEST_TYPES.
// Поля форм, валидация и карточки каталога строятся отсюда автоматически.
import type { RequestStatus } from "@/db/schema";

export type FieldType = "text" | "textarea" | "select" | "date" | "number" | "myCourse" | "myDebt";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  min?: number;
  max?: number;
};

export type RequestCategory = "certificate" | "application";

export type RequestTypeDef = {
  slug: string;
  category: RequestCategory;
  title: string;
  /** коротко, для карточки каталога */
  short: string;
  description: string;
  /** имя иконки из src/components/icons.tsx */
  icon: string;
  /** срок в рабочих днях */
  slaDays: number;
  delivery: ("electronic" | "paper")[];
  copies?: boolean;
  popular?: boolean;
  /** не показывать в каталоге (создаётся из других экранов) */
  hidden?: boolean;
  /** для справок: на каком языке документ */
  docLang?: "ru" | "en";
  /** ключевые слова для поиска и ассистента */
  keywords: string[];
  fields: FieldDef[];
};

const PURPOSE_OPTIONS = [
  { value: "по месту требования", label: "По месту требования" },
  { value: "для работодателя", label: "Для работодателя" },
  { value: "в банк", label: "В банк" },
  { value: "в органы социальной защиты", label: "В соцзащиту" },
  { value: "в налоговую инспекцию", label: "В налоговую (вычет)" },
  { value: "в Пенсионный фонд / СФР", label: "В Социальный фонд" },
  { value: "для общежития", label: "Для общежития" },
];

export const REQUEST_TYPES: RequestTypeDef[] = [
  {
    slug: "study-certificate",
    category: "certificate",
    title: "Справка об обучении",
    short: "Подтверждает, что вы студент. Для работы, банка, соцзащиты",
    description:
      "Официальная справка о том, что вы обучаетесь в университете: факультет, курс, форма и основа обучения. Электронная версия с QR-кодом принимается большинством организаций, подлинность проверяется по ссылке.",
    icon: "file-check",
    slaDays: 1,
    delivery: ["electronic", "paper"],
    copies: true,
    popular: true,
    docLang: "ru",
    keywords: ["справка", "с места учёбы", "об обучении", "подтверждение", "работодатель", "банк", "соцзащита"],
    fields: [
      { name: "purpose", label: "Куда нужна справка", type: "select", required: true, options: PURPOSE_OPTIONS },
      {
        name: "addressee",
        label: "Название организации",
        type: "text",
        placeholder: "Необязательно, например, ПАО «Банк»",
        maxLength: 120,
      },
    ],
  },
  {
    slug: "embassy-certificate",
    category: "certificate",
    title: "Справка для посольства",
    short: "Certificate of enrollment на английском, для визы",
    description:
      "Справка на английском языке для визового центра или посольства: подтверждает обучение и, при необходимости, что поездка согласована на время каникул или стажировки.",
    icon: "plane",
    slaDays: 3,
    delivery: ["electronic", "paper"],
    copies: true,
    popular: true,
    docLang: "en",
    keywords: ["посольство", "виза", "визовый центр", "английском", "certificate", "enrollment", "поездка", "шенген"],
    fields: [
      { name: "country", label: "Страна", type: "text", required: true, placeholder: "Например, Италия", maxLength: 60 },
      { name: "travelFrom", label: "Поездка с", type: "date", required: true },
      { name: "travelTo", label: "по", type: "date", required: true },
      {
        name: "purpose",
        label: "Цель поездки",
        type: "select",
        required: true,
        options: [
          { value: "tourism", label: "Туризм (каникулы)" },
          { value: "internship", label: "Стажировка" },
          { value: "exchange", label: "Обмен / включённое обучение" },
          { value: "conference", label: "Конференция / олимпиада" },
        ],
      },
    ],
  },
  {
    slug: "military-certificate",
    category: "certificate",
    title: "Справка для военкомата",
    short: "Об обучении по форме для военного комиссариата",
    description:
      "Справка для военного комиссариата об обучении по очной форме. Оформляется только на бумаге с печатью, заберите в учебном офисе.",
    icon: "shield",
    slaDays: 2,
    delivery: ["paper"],
    keywords: ["военкомат", "отсрочка", "военный комиссариат", "призыв"],
    fields: [
      {
        name: "commissariat",
        label: "Военный комиссариат",
        type: "text",
        required: true,
        placeholder: "Например, ВК Гагаринского района г. Москвы",
        maxLength: 160,
      },
    ],
  },
  {
    slug: "scholarship-certificate",
    category: "certificate",
    title: "Справка о стипендии",
    short: "О размере стипендии за выбранный период",
    description: "Справка о размере выплаченной стипендии, например, для соцзащиты или налогового вычета.",
    icon: "wallet",
    slaDays: 2,
    delivery: ["electronic", "paper"],
    docLang: "ru",
    keywords: ["стипендия", "размер стипендии", "выплаты"],
    fields: [
      {
        name: "period",
        label: "За какой период",
        type: "select",
        required: true,
        options: [
          { value: "3", label: "Последние 3 месяца" },
          { value: "6", label: "Последние 6 месяцев" },
          { value: "12", label: "Последние 12 месяцев" },
        ],
      },
      { name: "purpose", label: "Куда нужна справка", type: "select", required: true, options: PURPOSE_OPTIONS },
    ],
  },
  {
    slug: "transcript",
    category: "certificate",
    title: "Академическая выписка",
    short: "Transcript of Records (ECTS): оценки за все семестры",
    description:
      "Выписка оценок с кредитами ECTS на русском или английском языке, для обмена, двойного диплома, стажировки или работодателя. Подписывается деканом.",
    icon: "scroll",
    slaDays: 5,
    delivery: ["electronic", "paper"],
    popular: true,
    docLang: "ru",
    keywords: ["выписка", "транскрипт", "transcript", "оценки", "ects", "обмен", "двойной диплом"],
    fields: [
      {
        name: "language",
        label: "Язык выписки",
        type: "select",
        required: true,
        options: [
          { value: "ru", label: "Русский" },
          { value: "en", label: "Английский" },
        ],
      },
      {
        name: "purpose",
        label: "Для чего",
        type: "select",
        required: true,
        options: [
          { value: "exchange", label: "Программа обмена" },
          { value: "internship", label: "Стажировка / работодатель" },
          { value: "double-degree", label: "Двойной диплом" },
          { value: "other", label: "Другое" },
        ],
      },
    ],
  },
  {
    slug: "individual-plan",
    category: "application",
    title: "Индивидуальный учебный план",
    short: "Свободное посещение при работе, стажировке, спорте",
    description:
      "Заявление на обучение по индивидуальному плану: вы договариваетесь с преподавателями о сроках работ и посещении. Решение принимает декан.",
    icon: "route",
    slaDays: 5,
    delivery: ["electronic"],
    keywords: ["индивидуальный план", "иуп", "свободное посещение", "работа", "стажировка", "спорт"],
    fields: [
      {
        name: "reason",
        label: "Причина",
        type: "select",
        required: true,
        options: [
          { value: "work", label: "Работа по специальности" },
          { value: "internship", label: "Стажировка" },
          { value: "sport", label: "Спортивные сборы" },
          { value: "family", label: "Семейные обстоятельства" },
          { value: "health", label: "Состояние здоровья" },
          { value: "other", label: "Другое" },
        ],
      },
      { name: "details", label: "Коротко о ситуации", type: "textarea", required: true, maxLength: 800, placeholder: "Где работаете или стажируетесь, в какие дни можете посещать занятия" },
    ],
  },
  {
    slug: "academic-leave",
    category: "application",
    title: "Академический отпуск",
    short: "Перерыв в учёбе до 2 лет с сохранением места",
    description:
      "Заявление на академический отпуск. Понадобятся подтверждающие документы, специалист подскажет, какие именно, после рассмотрения.",
    icon: "pause",
    slaDays: 10,
    delivery: ["electronic"],
    keywords: ["академ", "академический отпуск", "перерыв", "взять паузу"],
    fields: [
      {
        name: "reason",
        label: "Основание",
        type: "select",
        required: true,
        options: [
          { value: "medical", label: "Медицинские показания" },
          { value: "family", label: "Семейные обстоятельства" },
          { value: "military", label: "Призыв на военную службу" },
          { value: "other", label: "Другое" },
        ],
      },
      { name: "startDate", label: "С какой даты", type: "date", required: true },
      { name: "details", label: "Комментарий", type: "textarea", maxLength: 800 },
    ],
  },
  {
    slug: "credit-transfer",
    category: "application",
    title: "Перезачёт дисциплин",
    short: "После обмена, второго вуза или онлайн-курсов",
    description:
      "Перезачёт результатов обучения в другом университете (обмен, включённое обучение) или на онлайн-курсах. Приложите транскрипт, его можно принести в учебный офис.",
    icon: "repeat",
    slaDays: 10,
    delivery: ["electronic"],
    keywords: ["перезачёт", "перезачет", "обмен", "включённое обучение", "зачесть"],
    fields: [
      { name: "university", label: "Университет или платформа", type: "text", required: true, maxLength: 160, placeholder: "Например, Università Bocconi" },
      { name: "disciplines", label: "Какие дисциплины перезачесть", type: "textarea", required: true, maxLength: 1000, placeholder: "По одной на строку: название, кредиты, оценка" },
    ],
  },
  {
    slug: "retake",
    category: "application",
    title: "Пересдача",
    short: "Записаться на пересдачу по задолженности",
    description: "Заявление на пересдачу экзамена или зачёта. Учебный офис согласует дату с кафедрой и пришлёт уведомление.",
    icon: "rotate",
    slaDays: 3,
    delivery: ["electronic"],
    keywords: ["пересдача", "пересдать", "задолженность", "долг", "хвост", "неуд"],
    fields: [
      { name: "course", label: "Дисциплина", type: "myDebt", required: true },
      {
        name: "preferred",
        label: "Удобное время",
        type: "select",
        required: true,
        options: [
          { value: "asap", label: "Как можно скорее" },
          { value: "weekday-morning", label: "Будни, утро" },
          { value: "weekday-evening", label: "Будни, после занятий" },
        ],
      },
      { name: "details", label: "Комментарий", type: "textarea", maxLength: 600 },
    ],
  },
  {
    slug: "financial-aid",
    category: "application",
    title: "Материальная помощь",
    short: "Единовременная выплата в трудной ситуации",
    description: "Заявление на материальную помощь. Рассматривает стипендиальная комиссия, обычно в течение двух недель.",
    icon: "heart",
    slaDays: 10,
    delivery: ["electronic"],
    keywords: ["материальная помощь", "матпомощь", "выплата", "деньги", "трудная ситуация"],
    fields: [
      {
        name: "reason",
        label: "Ситуация",
        type: "select",
        required: true,
        options: [
          { value: "family", label: "Сложное материальное положение семьи" },
          { value: "medical", label: "Лечение" },
          { value: "event", label: "Рождение ребёнка / свадьба" },
          { value: "other", label: "Другое" },
        ],
      },
      { name: "details", label: "Коротко о ситуации", type: "textarea", required: true, maxLength: 800 },
    ],
  },
  {
    slug: "student-card",
    category: "application",
    title: "Восстановление студенческого",
    short: "Если потеряли студенческий билет или зачётку",
    description: "Выдадим дубликат студенческого билета или зачётной книжки. Заберите в учебном офисе.",
    icon: "id-card",
    slaDays: 5,
    delivery: ["paper"],
    keywords: ["студенческий", "студак", "потерял", "зачётка", "дубликат", "пропуск"],
    fields: [
      {
        name: "item",
        label: "Что восстановить",
        type: "select",
        required: true,
        options: [
          { value: "card", label: "Студенческий билет" },
          { value: "record-book", label: "Зачётную книжку" },
          { value: "both", label: "Оба документа" },
        ],
      },
      { name: "details", label: "Что случилось", type: "textarea", maxLength: 400 },
    ],
  },
  {
    slug: "grade-error",
    category: "application",
    title: "Ошибка в оценке",
    short: "Сообщить о неверных баллах или оценке",
    description: "Если баллы или оценка отображаются неверно, опишите, что не так. Учебный офис сверит данные с кафедрой.",
    icon: "flag",
    slaDays: 3,
    delivery: ["electronic"],
    hidden: true,
    keywords: ["ошибка", "неверная оценка", "баллы не те", "апелляция"],
    fields: [
      { name: "course", label: "Дисциплина", type: "myCourse", required: true },
      { name: "details", label: "Что не так", type: "textarea", required: true, maxLength: 800, placeholder: "Например: за контрольную №1 стоит 6 баллов, а преподаватель объявил 9" },
    ],
  },
];

export const REQUEST_TYPE_MAP = new Map(REQUEST_TYPES.map((t) => [t.slug, t]));

export function getRequestType(slug: string): RequestTypeDef | undefined {
  return REQUEST_TYPE_MAP.get(slug);
}

export const DELIVERY_LABEL = {
  electronic: "Электронно, с QR-кодом",
  paper: "На бумаге, с печатью",
} as const;

// ───────────── Статусы: человеческие названия и пояснения ─────────────

export type Tone = "neutral" | "brand" | "info" | "warning" | "success" | "danger";

export const STATUS_META: Record<RequestStatus, { label: string; tone: Tone; step: number; hint: string }> = {
  submitted: { label: "Подана", tone: "info", step: 0, hint: "Заявка у учебного офиса. Обычно берём в работу в течение рабочего дня." },
  in_review: { label: "На рассмотрении", tone: "brand", step: 1, hint: "Специалист проверяет данные." },
  needs_info: { label: "Нужно уточнение", tone: "warning", step: 1, hint: "Специалисту нужна информация от вас, ответьте ниже." },
  in_progress: { label: "Готовится", tone: "brand", step: 2, hint: "Документ готовят и подписывают." },
  ready: { label: "Готова", tone: "success", step: 3, hint: "Всё готово." },
  completed: { label: "Получена", tone: "neutral", step: 4, hint: "Заявка закрыта." },
  rejected: { label: "Отклонена", tone: "danger", step: 4, hint: "Заявка отклонена, причина указана ниже." },
  cancelled: { label: "Отозвана", tone: "neutral", step: 4, hint: "Вы отозвали заявку." },
};

export const TRACK_STEPS = ["Подана", "Рассмотрение", "Готовится", "Готова", "Получена"] as const;

export const ACTIVE_STATUSES: RequestStatus[] = ["submitted", "in_review", "needs_info", "in_progress", "ready"];
export const FINAL_STATUSES: RequestStatus[] = ["completed", "rejected", "cancelled"];
