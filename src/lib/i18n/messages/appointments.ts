// Запись на приём в учебный офис: экран записи, талон, календарь .ics.
// Наложение на src/lib/appointments.ts: темы и статусы по-английски; кабинет сотрудника читает русские подписи оттуда.
import type { AppointmentStatus } from "@/db/schema";
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_TOPICS, topicLabel as topicLabelRu, type AppointmentTopic } from "@/lib/appointments";
import type { Locale } from "../config";
import { defineMessages } from "../define";

const TOPICS_EN: Record<AppointmentTopic, { label: string; hint: string }> = {
  certificate: { label: "Certificate or transcript", hint: "A paper certificate with a stamp, an archive certificate, a transcript of grades" },
  documents: { label: "Retakes and documents", hint: "A retake referral, applications, signatures and copies" },
  plan: { label: "Study plan", hint: "An individual plan, credit transfer, choice of courses" },
  scholarship: { label: "Scholarship and payments", hint: "Increased scholarship, financial aid, compensation" },
  mobility: { label: "Exchange and internships", hint: "Academic mobility, work placements, documents for travel" },
  other: { label: "Other question", hint: "Briefly describe it in the comment" },
};

const STATUS_EN: Record<AppointmentStatus, string> = { booked: "Booked", done: "Attended", no_show: "Missed", cancelled: "Cancelled" };

/** Темы обращения на языке интерфейса (значения те же) */
export function appointmentTopics(locale: Locale): { value: AppointmentTopic; label: string; hint: string }[] {
  return APPOINTMENT_TOPICS.map((t) => (locale === "en" ? { value: t.value, ...TOPICS_EN[t.value] } : { value: t.value, label: t.label, hint: t.hint }));
}

export function topicLabelFor(value: string, locale: Locale): string {
  if (locale !== "en") return topicLabelRu(value);
  return (TOPICS_EN as Record<string, { label: string }>)[value]?.label ?? TOPICS_EN.other.label;
}

export const appointmentStatusLabel = (status: AppointmentStatus, locale: Locale) => (locale === "en" ? STATUS_EN[status] : APPOINTMENT_STATUS_LABEL[status]);

/** Ошибка записи из src/lib/data/appointments.ts (там она по-русски) на языке интерфейса */
export function bookingError(reason: "slot" | "taken" | "limit", ruError: string, locale: Locale): string {
  if (locale !== "en") return ruError;
  if (reason === "slot") return "This time cannot be booked. Please choose another one";
  if (reason === "limit") return "You already have the maximum number of active appointments. Cancel one to choose a new time.";
  return ruError.startsWith("Не удалось") ? "Couldn't book the appointment. Please try again" : "This time has just been taken. Please choose another one";
}

export const appointmentsMessages = defineMessages(
  {
    title: "Запись на приём",
    subtitle: (code: string, room: string) => `Учебный офис ${code}, ауд. ${room}. Без живой очереди: выберите время, и вас примут в назначенные 15 минут.`,
    cancelled: "Запись отменена. Время снова доступно другим студентам.",
    book: "Записаться",
    limitTitle: (n: number) => `У вас ${n} активные записи`,
    limitText: "Одновременно можно держать не больше двух записей. Отмените одну из них ниже, чтобы выбрать новое время.",
    office: (code: string) => `Учебный офис ${code}`,
    where: "Где",
    room: "ауд.",
    roomStart: "ауд.",
    hours: "Часы приёма",
    how: "Как это работает",
    howText: (days: number) =>
      `Запись открыта на ${days} рабочих дней вперёд, не позже чем за час до начала. Можно держать до двух записей одновременно. Справку без визита можно заказать в разделе`,
    howLink: "«Заявки»",
    upcoming: "Предстоящие записи",
    ticket: "Талон",
    ticketWord: "талон",
    upcomingEmptyTitle: "Предстоящих записей нет",
    upcomingEmptyText: "Выберите тему и удобное время выше, талон появится здесь.",
    past: "Прошедшие и отменённые",
    pastBooked: "Прошла",
    cancelledByOffice: (reason: string) => `Отменил учебный офис: ${reason}`,
    cancelledByYou: "Вы отменили запись",

    // талон
    ticketTitle: "Талон на приём",
    crumbsRoot: "Запись на приём",
    ticketCrumb: (code: string) => `Талон ${code}`,
    booked: "Вы записаны",
    bookedSub: "Талон сохранён в разделе «Запись на приём», уведомление тоже пришло.",
    allMine: "Все мои записи",
    activeText: "Назовите код в учебном офисе или покажите QR. Приходите за пару минут до начала.",
    officeCancelled: (reason: string) => `Учебный офис отменил запись: ${reason}`,
    inactive: "Эта запись уже не действует.",
    qrLabel: (code: string) => `QR-код талона ${code}`,
    date: "Дата",
    time: "Время",
    topic: "Тема",
    officeLine: (code: string, building: string) => `Учебный офис ${code}, ${building}`,
    comment: "Комментарий: ",
    addToCalendar: "Добавить в календарь",
    cancelAppointment: "Отменить запись",
    cancel: "Отменить",
    cancelConfirm: "Отменить запись? Время станет доступно другим студентам.",

    // мастер записи
    booking: "Записываем…",
    submit: "Записаться",
    noDaysTitle: "Свободных дней для записи нет",
    noDaysText: "Попробуйте зайти позже или позвоните в учебный офис.",
    stepTopic: "Тема обращения",
    stepTime: "День и время",
    stepTimeHint: "Сначала выберите тему",
    day: "День",
    dayAria: (weekday: string, date: string, free: number) => `${weekday}, ${date}, свободно ${free}`,
    none: "нет",
    freeOf: (free: number, total: number) => `свободно ${free} из ${total}`,
    morning: "До обеда",
    afternoon: "После обеда",
    slotTaken: ", занято",
    slotMine: ", ваша запись",
    slotClosed: ", запись закрыта",
    titleMine: "Ваша запись",
    titleTaken: "Занято",
    stepConfirm: "Подтверждение",
    stepConfirmHint: "Выберите время",
    notChosenTopic: "не выбрана",
    when: "Когда",
    notChosenTime: "не выбрано",
    whereOffice: (code: string) => `Учебный офис ${code}, ауд.`,
    commentLabel: "Комментарий для специалиста",
    commentHint: "Необязательно. Специалист заранее подготовит документы.",
    commentPlaceholder: "Например: нужно направление на пересдачу по эконометрике",
    footer: "Приём длится 15 минут. Если планы изменятся, отмените запись, чтобы время досталось другому студенту.",

    // ошибки экшенов
    errTopic: "Выберите тему обращения",
    errTime: "Выберите день и время",
    errComment: (n: number) => `Комментарий: не больше ${n} символов`,
    errSlot: "На это время записаться нельзя, выберите другое",

    // календарь .ics
    icsCancelled: "[Отменено] ",
    icsSummary: (code: string, topic: string) => `Приём в учебном офисе ${code}: ${topic}`,
    icsWhere: (code: string, room: string, building: string) => `Учебный офис ${code}, ауд. ${room}, ${building}`,
    icsDescription: (code: string) => `Талон ${code}. Назовите код в учебном офисе.`,
    icsComment: (comment: string) => `\nКомментарий: ${comment}`,
    icsAlarm: (room: string) => `Через 30 минут приём, ауд. ${room}`,
    signIn: "Требуется вход",
  },
  {
    title: "Book an appointment",
    subtitle: (_code, room) => `Student office, room ${room}. No queue: choose a time and you will be seen in your 15-minute slot.`,
    cancelled: "Your appointment is cancelled. The time is available to other students again.",
    book: "Book a time",
    limitTitle: (n) => `You have ${n} active appointments`,
    limitText: "You can hold up to two appointments at a time. Cancel one of them below to choose a new time.",
    office: () => "Student office",
    where: "Where",
    room: "room",
    roomStart: "Room",
    hours: "Opening hours",
    how: "How it works",
    howText: (days) =>
      `Booking is open ${days} working days ahead, up to one hour before the start. You can hold up to two appointments at a time. You can order a certificate without a visit in`,
    howLink: "Requests",
    upcoming: "Upcoming appointments",
    ticket: "Ticket",
    ticketWord: "ticket",
    upcomingEmptyTitle: "No upcoming appointments",
    upcomingEmptyText: "Choose a topic and a time above, and your ticket will appear here.",
    past: "Past and cancelled",
    pastBooked: "Past",
    cancelledByOffice: (reason) => `Cancelled by the student office: ${reason}`,
    cancelledByYou: "You cancelled this appointment",

    ticketTitle: "Appointment ticket",
    crumbsRoot: "Book an appointment",
    ticketCrumb: (code) => `Ticket ${code}`,
    booked: "You are booked in",
    bookedSub: "Your ticket is saved in Book an appointment, and we have sent you a notification.",
    allMine: "All my appointments",
    activeText: "Tell the student office your code or show the QR code. Please arrive a few minutes early.",
    officeCancelled: (reason) => `The student office cancelled this appointment: ${reason}`,
    inactive: "This appointment is no longer valid.",
    qrLabel: (code) => `QR code for ticket ${code}`,
    date: "Date",
    time: "Time",
    topic: "Topic",
    officeLine: (_code, building) => `Student office, ${building}`,
    comment: "Comment: ",
    addToCalendar: "Add to calendar",
    cancelAppointment: "Cancel appointment",
    cancel: "Cancel",
    cancelConfirm: "Cancel this appointment? The time will become available to other students.",

    booking: "Booking…",
    submit: "Book",
    noDaysTitle: "No days available for booking",
    noDaysText: "Please check back later or call the student office.",
    stepTopic: "Topic",
    stepTime: "Day and time",
    stepTimeHint: "Choose a topic first",
    day: "Day",
    dayAria: (weekday, date, free) => `${weekday}, ${date}, ${free} free`,
    none: "none",
    freeOf: (free, total) => `${free} of ${total} free`,
    morning: "Before lunch",
    afternoon: "After lunch",
    slotTaken: ", taken",
    slotMine: ", your appointment",
    slotClosed: ", booking closed",
    titleMine: "Your appointment",
    titleTaken: "Taken",
    stepConfirm: "Confirm",
    stepConfirmHint: "Choose a time",
    notChosenTopic: "not chosen",
    when: "When",
    notChosenTime: "not chosen",
    whereOffice: () => "Student office, room",
    commentLabel: "Comment for the specialist",
    commentHint: "Optional. The specialist will prepare the documents in advance.",
    commentPlaceholder: "For example: I need a retake referral for Econometrics",
    footer: "An appointment lasts 15 minutes. If your plans change, please cancel it so another student can have the time.",

    errTopic: "Choose a topic",
    errTime: "Choose a day and time",
    errComment: (n) => `Comment: no more than ${n} characters`,
    errSlot: "This time cannot be booked. Please choose another one",

    icsCancelled: "[Cancelled] ",
    icsSummary: (_code, topic) => `Student office appointment: ${topic}`,
    icsWhere: (_code, room, building) => `Student office, room ${room}, ${building}`,
    icsDescription: (code) => `Ticket ${code}. Tell the student office your code.`,
    icsComment: (comment) => `\nComment: ${comment}`,
    icsAlarm: (room) => `Appointment in 30 minutes, room ${room}`,
    signIn: "Please sign in",
  },
);
