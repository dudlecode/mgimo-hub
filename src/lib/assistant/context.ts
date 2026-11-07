import "server-only";
// Контекст для ассистента, ТОЛЬКО данные текущего студента и ТОЛЬКО необходимое.
// Не передаём: телефон, почту, дату рождения, номер зачётки и студенческого.
// locale = "en": подписи и названия дисциплин по-английски (слой данных отдаёт nameEn), чтобы модель
// и офлайн-ответы говорили на языке интерфейса. Тексты из БД без английской версии
// (заметки об изменениях, названия контрольных) остаются русскими, модель переводит их смысл сама.
import { requireStudent } from "@/lib/auth/dal";
import { getMyLessons, getUpcomingChanges, type LessonView } from "@/lib/data/schedule";
import { getCurrentSemester, getTranscript, scholarshipStatus, transcriptStats } from "@/lib/data/grades";
import { getMyDeadlines } from "@/lib/data/deadlines";
import { listMyRequests } from "@/lib/data/requests";
import { listMyRetakeReferrals } from "@/lib/data/retakes";
import { ACTIVE_STATUSES } from "@/lib/requests/catalog";
import { requestTitle, statusLabel } from "@/lib/requests/catalog-en";
import { controlLabel, GRADE_RULES, neededOnExam, standingMeta } from "@/lib/grades";
import { buildingLabel, campusInfo, getSemester, semesterLabel, weekOfSemester } from "@/lib/academic";
import { addDays, formatDateTime, formatDayMonth, formatTime, formatWeekday, startOfMskDay } from "@/lib/time";
import type { Locale } from "@/lib/i18n/config";
import { fundingLabel, localizedName, localizeLanguageName, localizeOfficeHours } from "@/lib/i18n/messages/common";

const FORMAT = {
  ru: { lecture: "лекция", seminar: "семинар", practice: "практика", lang: "язык" },
  en: { lecture: "lecture", seminar: "seminar", practice: "practical class", lang: "language class" },
} as const;

function lessonLine(l: LessonView, locale: Locale) {
  const en = locale === "en";
  const status = en
    ? l.status === "cancelled"
      ? " [CANCELLED]"
      : l.movedAway
        ? " [MOVED to another time]"
        : l.status === "moved"
          ? " [moved here]"
          : l.status === "room_changed"
            ? ` [room changed, was ${l.prevRoom}]`
            : l.status === "teacher_changed"
              ? ` [substitute teacher: ${l.substituteTeacher}]`
              : ""
    : l.status === "cancelled"
      ? " [ОТМЕНЕНО]"
      : l.movedAway
        ? " [ПЕРЕНЕСЕНО на другое время]"
        : l.status === "moved"
          ? " [перенесено сюда]"
          : l.status === "room_changed"
            ? ` [аудитория изменена, была ${l.prevRoom}]`
            : l.status === "teacher_changed"
              ? ` [замена: ${l.substituteTeacher}]`
              : "";
  const room = en ? `room ${l.room}, ${buildingLabel(l.building, locale)}` : `ауд. ${l.room}, ${l.building}`;
  return `${formatWeekday(l.startsAt, locale)} ${formatDayMonth(l.startsAt, locale)} ${formatTime(l.startsAt, locale)}-${formatTime(l.endsAt, locale)} · ${l.title} (${FORMAT[locale][l.format]}) · ${room} · ${l.teacher}${status}${l.changeNote ? `, ${l.changeNote}` : ""}`;
}

export async function buildAssistantContext(locale: Locale = "ru") {
  const { student, group, faculty } = await requireStudent();
  const en = locale === "en";
  const now = new Date();
  const today = startOfMskDay(now);
  // Язык передаём явно: названия дисциплин из слоя данных придут на языке интерфейса
  const [lessons, changes, sem, transcript, deadlines, requests, referrals] = await Promise.all([
    getMyLessons(today, addDays(today, 7), locale),
    getUpcomingChanges(10, locale),
    getCurrentSemester(locale),
    getTranscript(locale),
    getMyDeadlines(21, 0, locale),
    listMyRequests(),
    listMyRetakeReferrals(),
  ]);
  const stats = transcriptStats(transcript);
  const scholarship = scholarshipStatus(student.funding, transcript, locale);
  const semInfo = getSemester(now);
  const week = weekOfSemester(now, semInfo);
  const campus = campusInfo(group.campus, locale);
  const officeCampus = campusInfo(faculty.campus, locale);
  const line = (l: LessonView) => lessonLine(l, locale);

  return {
    now: `${formatWeekday(now, locale)}, ${formatDateTime(now, locale)} (${en ? "Moscow time" : "МСК"})`,
    semester: en
      ? `${semesterLabel(semInfo, locale)}, student's semester ${sem.semesterNo}, ${week.inSemester ? `week ${week.week} (${week.parity === "odd" ? "odd" : "even"})` : "outside teaching weeks"}`
      : `${semInfo.label}, ${sem.semesterNo}-й семестр студента, ${week.inSemester ? `${week.week}-я неделя (${week.parity === "odd" ? "нечётная" : "чётная"})` : "вне учебных недель"}`,
    student: {
      name: student.firstName,
      faculty: `${localizedName(faculty, locale)} (${faculty.code})`,
      program: en
        ? `${group.programCode} ${group.programName}${group.profileName ? `, specialisation "${group.profileName}"` : ", specialisation not chosen yet"}`
        : `${group.programCode} ${group.programName}${group.profileName ? `, профиль «${group.profileName}»` : ", профиль ещё не выбран"}`,
      course: group.course,
      group: group.code,
      funding: fundingLabel(student.funding, locale),
      campus: campus.label,
      languages: student.languages.map((l) => `${localizeLanguageName(l.name, locale)} (${l.level})`).join(", "),
    },
    office: {
      room: en ? `room ${faculty.officeRoom}, ${officeCampus.building}` : `ауд. ${faculty.officeRoom}, ${officeCampus.building}`,
      hours: localizeOfficeHours(faculty.officeHours, locale),
      phone: faculty.officePhone,
      email: faculty.officeEmail,
    },
    scheduleNext7Days: lessons.map(line),
    scheduleChanges: changes.map(line),
    courses: sem.courses.map((c) => ({
      id: c.id,
      title: c.title,
      control: controlLabel(c.controlType, locale),
      points: en
        ? `${c.earned} out of ${c.possible} points for assessments graded so far; up to ${GRADE_RULES.semesterMax - c.possible} more available in the remaining assessments this semester`
        : `набрано ${c.earned} из ${c.possible} уже проверенных; в оставшихся контрольных семестра можно набрать ещё до ${GRADE_RULES.semesterMax - c.possible}`,
      paceForecast: en
        ? `at the current pace the semester total will be about ${c.projectedSemester} of ${GRADE_RULES.semesterMax}`
        : `при текущем темпе за семестр выйдет ~${c.projectedSemester} из ${GRADE_RULES.semesterMax}`,
      standing: standingMeta(c.standing, locale).label,
      atRisk: c.standing === "risk" || c.standing === "critical",
      needOnExamFor5AtCurrentPace: c.controlType === "credit" ? null : neededOnExam(c.projectedSemester, GRADE_RULES.excellent),
      bestPossibleTotal: Math.min(100, c.earned + (GRADE_RULES.semesterMax - c.possible) + GRADE_RULES.examMax),
      needFromRemainingFor5WithFullExam: c.controlType === "credit" ? null : Math.max(0, GRADE_RULES.excellent - GRADE_RULES.examMax - c.earned),
      exam: c.examAt
        ? en
          ? `${formatDateTime(c.examAt, locale)}, room ${c.examRoom ?? "to be confirmed"}`
          : `${formatDateTime(c.examAt)}, ауд. ${c.examRoom ?? "уточняется"}`
        : null,
      upcoming: c.assessments
        .filter((a) => a.points === null && a.dueAt > now)
        .slice(0, 2)
        .map((a) => (en ? `${a.title} by ${formatDayMonth(a.dueAt, locale)} (${a.maxPoints} pts)` : `${a.title} до ${formatDayMonth(a.dueAt)} (${a.maxPoints} б.)`)),
    })),
    debts: stats.debts.map((d) => {
      // выпущенное направление без результата: дата уже назначена, заявление подавать не нужно
      const ref = referrals.find((r) => r.courseId === d.courseId && r.status === "issued" && r.startsAt > now);
      const who = ref?.commission.length ? ref.commission.join(", ") : null;
      return {
        courseId: d.courseId,
        title: d.title,
        semester: d.semester,
        points: d.points,
        retake: ref
          ? {
              when: formatDateTime(ref.startsAt, locale),
              room: ref.room,
              referral: ref.number,
              examiners: who,
              link: `/grades/retakes/${ref.id}`,
            }
          : null,
      };
    }),
    gpa: stats.gpa ? Number(stats.gpa.toFixed(2)) : null,
    scholarship: `${scholarship.label}. ${scholarship.text}`,
    deadlines: deadlines
      .filter((d) => !d.done)
      .map((d) => `${d.title}${d.subtitle ? ` (${d.subtitle})` : ""}, ${en ? "by" : "до"} ${formatDateTime(d.dueAt, locale)}`),
    requests: requests
      .filter((r) => ACTIVE_STATUSES.includes(r.status))
      .map((r) => `${requestTitle(r.type, locale)} ${r.number}: ${statusLabel(r.status, locale)}, ${en ? "due" : "срок"} ${formatDayMonth(r.dueAt, locale)}`),
  };
}

export type AssistantContext = Awaited<ReturnType<typeof buildAssistantContext>>;
