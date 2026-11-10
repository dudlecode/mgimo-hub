// Расписание: страница, карточки занятий, экспорт .ics.
import { defineMessages } from "../define";

export const lessonMessages = defineMessages(
  {
    format: { lecture: "Лекция", seminar: "Семинар", practice: "Практика", lang: "Язык" },
    room: "ауд.",
    liveNow: "идёт сейчас",
    moved: "Перенос",
    cancelled: "Отмена",
    roomChanged: "Аудитория",
    substitute: "Замена",
    movedTo: (when: string) => `перенесено на ${when}`,
    movedElsewhere: "перенесено на другое время",
    noClass: "занятия не будет",
    movedFrom: (when: string) => `перенесено с ${when}`,
    newTime: "новое время",
    roomInstead: (room: string, prev: string) => `ауд. ${room} вместо ${prev}`,
    taughtBy: (teacher: string) => `ведёт ${teacher}`,
  },
  {
    format: { lecture: "Lecture", seminar: "Seminar", practice: "Practical", lang: "Language" },
    room: "room",
    liveNow: "in progress",
    moved: "Moved",
    cancelled: "Cancelled",
    roomChanged: "Room",
    substitute: "Substitute",
    movedTo: (when) => `moved to ${when}`,
    movedElsewhere: "moved to another time",
    noClass: "the class is cancelled",
    movedFrom: (when) => `moved from ${when}`,
    newTime: "new time",
    roomInstead: (room, prev) => `room ${room} instead of ${prev}`,
    taughtBy: (teacher) => `taught by ${teacher}`,
  },
);

export const scheduleMessages = defineMessages(
  {
    title: "Расписание",
    weekLine: (week: number, parity: string) => `${week}-я учебная неделя · ${parity}`,
    calendarAria: "Добавить расписание в календарь телефона",
    calendar: "В календарь",
    sick: (date: string) => `Вы на больничном с ${date}.`,
    closeSick: "Закрыть больничный",
    prevWeek: "Предыдущая неделя",
    nextWeek: "Следующая неделя",
    today: "Сегодня",
    day: "День",
    week: "Неделя",
    hasChanges: "есть изменения",
    changesLegend: "В этот день есть изменения: перенос, отмена или другая аудитория",
    todayInline: "сегодня",
    swipeHint: "Свайп влево или вправо переключает день",
    noLessons: "Занятий нет",
    offSemester: "Вне учебного семестра",
    offSemesterText: "Занятий нет. Расписание экзаменов и консультаций в разделе «Учёба», вкладка «Сессия».",
    openSession: "Открыть сессию",
    weekend: "Выходной",
    weekendText: "Отдохните, понедельник уже скоро.",
    freeDayText: "Свободный день по расписанию. Самое время для эссе и проектов.",
  },
  {
    title: "Schedule",
    weekLine: (week, parity) => `Week ${week} · ${parity} week`,
    calendarAria: "Add the schedule to your phone calendar",
    calendar: "Add to calendar",
    sick: (date) => `You've been on sick leave since ${date}.`,
    closeSick: "Close sick leave",
    prevWeek: "Previous week",
    nextWeek: "Next week",
    today: "Today",
    day: "Day",
    week: "Week",
    hasChanges: "has changes",
    changesLegend: "Changes on this day: moved, cancelled or a different room",
    todayInline: "today",
    swipeHint: "Swipe left or right to change the day",
    noLessons: "No classes",
    offSemester: "Outside the semester",
    offSemesterText: "No classes. The exam and consultation schedule is in Studies, on the Exams tab.",
    openSession: "Open exams",
    weekend: "Day off",
    weekendText: "Take a rest, Monday is almost here.",
    freeDayText: "No classes scheduled. A good time for essays and projects.",
  },
);

export const calendarMessages = defineMessages(
  {
    calName: "MGIMO Hub · расписание",
    cancelled: "[Отменено] ",
    room: (room: string, building: string) => `ауд. ${room}, ${building}`,
    teacher: "Преподаватель",
    signIn: "Требуется вход",
    forbidden: "Нет доступа",
  },
  {
    calName: "MGIMO Hub · schedule",
    cancelled: "[Cancelled] ",
    room: (room, building) => `Room ${room}, ${building}`,
    teacher: "Teacher",
    signIn: "Sign-in required",
    forbidden: "Access denied",
  },
);

/** Причины изменений из демо-данных. Свои заметки сотрудника остаются как есть. */
export const CHANGE_NOTE_EN: Record<string, string> = {
  "Аудитория закрыта на ремонт": "The room is closed for repairs",
  "Замена преподавателя на время больничного": "Substitute teacher while the teacher is on sick leave",
  "Занятие в компьютерном классе": "Class in the computer lab",
  "Перенос из-за конференции": "Moved because of a conference",
  "Перенос по просьбе кафедры": "Moved at the department's request",
  "Преподаватель в командировке. Материалы лекции в LMS, задание к следующему семинару.":
    "The teacher is on a business trip. Lecture materials and the assignment for the next seminar are in the LMS.",
};

/** Номер аудитории не переводим, только пояснение в скобках: «120 (компьютерный класс)» */
export const roomEn = (room: string) => room.replace("(компьютерный класс)", "(computer lab)");
