import "server-only";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";
import { getSemester, semesterNumber } from "@/lib/academic";
import { courseProgress, GRADE_RULES, isFailing, markValue, ratingPercent, type CourseStanding } from "@/lib/grades";
import type { ControlType } from "@/db/schema";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { assessmentTitle, scholarshipMessages, teacherPosition } from "@/lib/i18n/messages/grades";

export type AssessmentView = {
  id: string;
  title: string;
  kind: string;
  maxPoints: number;
  dueAt: Date;
  points: number | null;
  gradedAt: Date | null;
};

export type CourseOverview = {
  id: string;
  title: string;
  teacher: string;
  teacherPosition: string;
  controlType: ControlType;
  credits: number;
  isLanguage: boolean;
  earned: number;
  possible: number;
  ratio: number;
  projectedSemester: number;
  projectedTotal: number;
  standing: CourseStanding;
  assessments: AssessmentView[];
  examAt: Date | null;
  examRoom: string | null;
  consultationAt: Date | null;
  lastGradedAt: Date | null;
};

async function currentCoursesFor(studentId: string, semester: number) {
  return db
    .select({
      id: s.courses.id,
      title: s.disciplines.name,
      titleEn: s.disciplines.nameEn,
      tLast: s.teachers.lastName,
      tFirst: s.teachers.firstName,
      tMiddle: s.teachers.middleName,
      teacherPosition: s.teachers.position,
      controlType: s.courses.controlType,
      credits: s.courses.credits,
      isLanguage: s.courses.isLanguage,
      examAt: s.courses.examAt,
      examRoom: s.courses.examRoom,
      consultationAt: s.courses.consultationAt,
    })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .innerJoin(s.teachers, eq(s.teachers.id, s.courses.teacherId))
    .where(and(eq(s.enrollments.studentId, studentId), eq(s.courses.semester, semester)))
    .orderBy(asc(s.courses.isLanguage), asc(s.disciplines.name));
}

/** Текущий семестр: дисциплины, баллы по контрольным точкам, прогноз. locale по умолчанию: язык запроса. */
export async function getCurrentSemester(locale?: Locale) {
  const { student, group } = await requireStudent();
  const lang = locale ?? (await getLocale());
  const en = lang === "en";
  const sem = getSemester();
  const semesterNo = semesterNumber(group.course, sem.kind);
  const courses = await currentCoursesFor(student.id, semesterNo);
  const ids = courses.map((c) => c.id);

  const assess = ids.length
    ? await db
        .select({
          id: s.assessments.id,
          courseId: s.assessments.courseId,
          title: s.assessments.title,
          kind: s.assessments.kind,
          maxPoints: s.assessments.maxPoints,
          dueAt: s.assessments.dueAt,
          points: s.scores.points,
          gradedAt: s.scores.gradedAt,
        })
        .from(s.assessments)
        .leftJoin(s.scores, and(eq(s.scores.assessmentId, s.assessments.id), eq(s.scores.studentId, student.id)))
        .where(inArray(s.assessments.courseId, ids))
        .orderBy(asc(s.assessments.dueAt))
    : [];

  const overview: CourseOverview[] = courses.map((c) => {
    const items = assess.filter((a) => a.courseId === c.id);
    const graded = items.filter((a) => a.points !== null);
    const earned = graded.reduce((sum, a) => sum + (a.points ?? 0), 0);
    const possible = graded.reduce((sum, a) => sum + a.maxPoints, 0);
    const p = courseProgress(earned, possible);
    const lastGradedAt = graded.reduce<Date | null>((m, a) => (a.gradedAt && (!m || a.gradedAt > m) ? a.gradedAt : m), null);
    return {
      id: c.id,
      title: en ? (c.titleEn ?? c.title) : c.title,
      teacher: `${c.tLast} ${c.tFirst[0]}.${c.tMiddle ? ` ${c.tMiddle[0]}.` : ""}`,
      teacherPosition: teacherPosition(c.teacherPosition, lang),
      controlType: c.controlType,
      credits: c.credits,
      isLanguage: c.isLanguage,
      earned,
      possible,
      ...p,
      assessments: items.map((a) => ({ id: a.id, title: assessmentTitle(a.title, lang), kind: a.kind, maxPoints: a.maxPoints, dueAt: a.dueAt, points: a.points, gradedAt: a.gradedAt })),
      examAt: c.examAt,
      examRoom: c.examRoom,
      consultationAt: c.consultationAt,
      lastGradedAt,
    };
  });

  return { semester: sem, semesterNo, courses: overview };
}

/** Место в рейтинге группы по текущему семестру (показываем только своё место, без чужих данных). */
export async function getGroupRank() {
  const { student, group } = await requireStudent();
  const sem = getSemester();
  const semesterNo = semesterNumber(group.course, sem.kind);
  const rows = await db.execute<{ student_id: string; ratio: number }>(sql`
    select sc.student_id, sum(sc.points)::float / nullif(sum(a.max_points), 0) as ratio
    from scores sc
    join assessments a on a.id = sc.assessment_id
    join courses c on c.id = a.course_id
    join students st on st.id = sc.student_id
    where st.group_id = ${group.id} and c.semester = ${semesterNo}
    group by sc.student_id
    order by ratio desc
  `);
  const list = rows.rows;
  const idx = list.findIndex((r) => r.student_id === student.id);
  return { place: idx >= 0 ? idx + 1 : null, total: list.length };
}

export type TranscriptRow = {
  id: string;
  courseId: string;
  title: string;
  semester: number;
  controlType: ControlType;
  credits: number;
  points: number;
  mark: string;
  attempt: number;
  gradedAt: Date;
  retakeAt: Date | null;
  retakeRoom: string | null;
};

/**
 * Электронная зачётка. locale по умолчанию: язык запроса.
 * Для официальных документов (справка, выписка) передавайте "ru": названия дисциплин в них всегда русские.
 */
export async function getTranscript(locale?: Locale): Promise<TranscriptRow[]> {
  const { student } = await requireStudent();
  const en = (locale ?? (await getLocale())) === "en";
  const rows = await db
    .select({
      id: s.finalGrades.id,
      courseId: s.courses.id,
      title: s.disciplines.name,
      titleEn: s.disciplines.nameEn,
      semester: s.courses.semester,
      controlType: s.courses.controlType,
      credits: s.courses.credits,
      points: s.finalGrades.points,
      mark: s.finalGrades.mark,
      attempt: s.finalGrades.attempt,
      gradedAt: s.finalGrades.gradedAt,
      retakeAt: s.finalGrades.retakeAt,
      retakeRoom: s.finalGrades.retakeRoom,
    })
    .from(s.finalGrades)
    .innerJoin(s.courses, eq(s.courses.id, s.finalGrades.courseId))
    .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
    .where(eq(s.finalGrades.studentId, student.id))
    .orderBy(asc(s.courses.semester), asc(s.courses.isLanguage), asc(s.disciplines.name));
  return rows.map(({ titleEn, ...r }) => (en ? { ...r, title: titleEn ?? r.title } : r));
}

export function transcriptStats(rows: TranscriptRow[]) {
  const marks = rows.map((r) => markValue(r.mark)).filter((x): x is number => x !== null && x > 2);
  const gpa = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
  const credits = rows.filter((r) => !isFailing(r.mark)).reduce((a, r) => a + r.credits, 0);
  const debts = rows.filter((r) => isFailing(r.mark));
  const lastSem = rows.length ? Math.max(...rows.map((r) => r.semester)) : null;
  const lastSession = lastSem ? rows.filter((r) => r.semester === lastSem) : [];
  const lastAvgPoints = lastSession.length ? lastSession.reduce((a, r) => a + r.points, 0) / lastSession.length : null;
  return { gpa, credits, debts, lastSem, lastSession, lastAvgPoints };
}

/**
 * Стипендия по демо-правилам: бюджет + сессия без «3» и долгов академическая; все «5» претендент на повышенную.
 * locale по умолчанию русский: функция синхронная, язык передаёт вызывающий.
 */
export function scholarshipStatus(funding: string, rows: TranscriptRow[], locale: Locale = "ru") {
  const t = scholarshipMessages[locale];
  if (funding !== "budget") return { kind: "contract" as const, ...t.contract };
  const { lastSession, debts } = transcriptStats(rows);
  if (!lastSession.length) return { kind: "first" as const, ...t.first };
  if (debts.length) return { kind: "none" as const, ...t.debts };
  const has3 = lastSession.some((r) => r.mark === "3");
  if (has3) return { kind: "none" as const, ...t.has3 };
  const all5 = lastSession.every((r) => r.mark === "5" || r.mark === "pass");
  if (all5) return { kind: "raised" as const, ...t.raised };
  return { kind: "regular" as const, ...t.regular };
}

export async function getAcademicRating() {
  const { student } = await requireStudent();
  const rows = await getTranscript();
  const { lastAvgPoints } = transcriptStats(rows);
  if (lastAvgPoints === null) return null;
  return { percent: ratingPercent(lastAvgPoints, student.activityBonus), bonus: Math.min(student.activityBonus, GRADE_RULES.activityBonusMax) };
}

/** Детальная страница дисциплины. Чужой или несуществующий курс 404. */
export async function getMyCourse(courseId: string) {
  const { student } = await requireStudent();
  const enrolled = await db.query.enrollments.findFirst({
    where: and(eq(s.enrollments.studentId, student.id), eq(s.enrollments.courseId, courseId)),
  });
  if (!enrolled) notFound();

  const { courses, semesterNo } = await getCurrentSemester();
  const current = courses.find((c) => c.id === courseId);
  if (current) return { kind: "current" as const, course: current, semesterNo };

  const transcript = await getTranscript();
  const past = transcript.find((r) => r.courseId === courseId);
  if (!past) notFound();
  return { kind: "past" as const, row: past };
}

/**
 * Варианты для полей «моя дисциплина» / «мой долг» в формах заявок.
 * По умолчанию подписи русские: экшен заявки сохраняет их снимком для сотрудника.
 * Для показа в форме на языке интерфейса передайте await getLocale().
 */
export async function getMyCourseOptions(locale: Locale = "ru") {
  const [{ courses }, transcript] = await Promise.all([getCurrentSemester(locale), getTranscript(locale)]);
  const sem = (n: number) => (locale === "en" ? `semester ${n}` : `${n} семестр`);
  return {
    current: courses.map((c) => ({ value: c.id, label: c.title })),
    debts: transcript.filter((r) => isFailing(r.mark)).map((r) => ({ value: r.courseId, label: `${r.title} (${sem(r.semester)})` })),
  };
}
