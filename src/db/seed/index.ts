// Генератор демо-данных. Даты строятся относительно текущего момента,
// поэтому кабинет всегда «живой»: текущая неделя, ближайшие дедлайны, свежие изменения.
//
//   npm run db:seed             , очистить и заполнить заново
//   npm run db:seed -- --if-empty, заполнить, только если база пустая (для первого запуска в Docker)
import "dotenv/config";
import { count, sql, and, eq, gte, lt, inArray, asc } from "drizzle-orm";
import { db, pool } from "../client";
import * as s from "../schema";
import { DEMO_STAFF, DEMO_STUDENTS, FACULTIES, FEMALE_FIRST, GROUPS, LAST_NAMES, MALE_FIRST, PATRONYMIC_ROOTS, TEACHERS, type CourseSpec } from "./data";
import { addWorkingDays, CAMPUSES, getSemester, isHoliday, mondayOfWeek, pairTimes, semesterNumber, weekOfSemester } from "@/lib/academic";
import { addDays, addMinutes, dayKey, formatDayMonth, mskDate, mskParts, startOfMskDay } from "@/lib/time";
import { markFromPoints } from "@/lib/grades";
import { hashPassword } from "@/lib/auth/password";
import { documentNumber, randomVerifyCode } from "@/lib/requests/codes";
import { getRequestType } from "@/lib/requests/catalog";
import { seedAppointments } from "./appointments";
import { seedHistory } from "./history";
import { seedPayments } from "./payments";
import { seedSickLeaves } from "./sick";
import { DISCIPLINE_EN, seedEnglishNames } from "./english";
import { seedRetakes } from "./retakes";
import { gradeText, lessonText, systemText, type BiText } from "@/lib/notify-text";
import { localizeRequestTitle } from "@/lib/requests/catalog-en";
import { assessmentTitle } from "@/lib/i18n/messages/grades";

// ───────────── Детерминированный ГСЧ, данные одинаковые при каждом сиде ─────────────
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261106);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + rand() * (b - a);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const noise = (amp: number) => (rand() + rand() + rand() - 1.5) * (amp / 1.5);
const half = (x: number) => Math.round(x * 2) / 2;
function hashStr(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return Math.abs(h);
}

const now = new Date();
const sem = getSemester(now);
const today = startOfMskDay(now);

const LANG_TEACHER: Record<string, string> = {
  "Английский язык": "Рощина",
  "Арабский язык": "Аль-Хасан",
  "Французский язык": "Лефевр",
  "Немецкий язык": "Штайнер",
  "Китайский язык": "Ван",
  "Испанский язык": "Ушакова",
  "Турецкий язык": "Демирель",
  "Итальянский язык": "Кольцова",
};
const LANG_SHORT: Record<string, string> = {
  "Английский язык": "EN",
  "Арабский язык": "AR",
  "Французский язык": "FR",
  "Немецкий язык": "DE",
  "Китайский язык": "ZH",
  "Испанский язык": "ES",
  "Турецкий язык": "TR",
  "Итальянский язык": "IT",
};

const ASSESS: Record<CourseSpec["kind"], [string, string, number, number][]> = {
  // [название, вид, макс. баллов, учебная неделя]
  theory: [
    ["Контрольная работа №1", "test", 10, 5],
    ["Работа на семинарах (сентябрь-октябрь)", "seminar", 10, 8],
    ["Эссе", "essay", 10, 11],
    ["Рубежная контрольная", "test", 15, 13],
    ["Работа на семинарах (ноябрь-декабрь)", "seminar", 10, 16],
    ["Посещаемость", "attendance", 5, 16],
  ],
  lang: [
    ["Лексико-грамматический тест", "test", 10, 4],
    ["Устная тема", "oral", 10, 7],
    ["Аудирование", "test", 10, 9],
    ["Письменный перевод", "essay", 10, 12],
    ["Итоговый тест", "test", 15, 15],
    ["Посещаемость", "attendance", 5, 16],
  ],
  practice: [
    ["Практическое задание 1", "project", 10, 4],
    ["Практическое задание 2", "project", 10, 7],
    ["Проект: промежуточный этап", "project", 10, 11],
    ["Проект: защита", "project", 20, 15],
    ["Посещаемость", "attendance", 10, 16],
  ],
};

type StudentRow = {
  id: string;
  userId: string;
  ability: number;
  weak?: string;
  weakAbility?: number;
  l2: string;
  demo: boolean;
  first: string;
  last: string;
  middle: string | null;
  login: string;
};

type CourseRef = { id: string; name: string; spec: CourseSpec; semester: number; lang?: string; teacherName: string };

async function main() {
  const ifEmpty = process.argv.includes("--if-empty");
  if (ifEmpty) {
    const [{ n }] = await db.select({ n: count() }).from(s.users);
    if (n > 0) {
      console.log("• База уже заполнена, сид пропущен");
      return;
    }
  }

  console.log(` Сид: ${sem.label}, неделя ${weekOfSemester(now, sem).week}`);
  await db.execute(sql`TRUNCATE users, sessions, login_attempts, faculties, groups, students, staff, teachers, disciplines,
    courses, enrollments, assessments, scores, final_grades, lessons, announcements, deadlines, deadline_done,
    notifications, requests, request_events, assistant_usage, appointments, tuition_payments, sick_leaves,
    sick_leave_files, push_subscriptions, retake_sessions, retake_referrals, audit_log RESTART IDENTITY CASCADE`);
  await db.execute(sql`ALTER SEQUENCE request_number_seq RESTART WITH 1000`);

  // ── Факультеты, преподаватели ──
  await db.insert(s.faculties).values(FACULTIES);
  const facultyById = new Map(FACULTIES.map((f) => [f.id, f]));

  const teacherRows = await db
    .insert(s.teachers)
    .values(TEACHERS.map((t) => ({ lastName: t.last, firstName: t.first, middleName: t.middle || null, position: t.position, department: "" })))
    .returning();
  const teacherByLast = new Map(teacherRows.map((t) => [t.lastName, t]));
  const nonLangTeachers = teacherRows.filter((t) => !Object.values(LANG_TEACHER).includes(t.lastName));
  const teacherShort = (t: (typeof teacherRows)[number]) =>
    `${t.lastName} ${t.firstName[0]}.${t.middleName ? ` ${t.middleName[0]}.` : ""}`;

  const disciplineIds = new Map<string, string>();
  async function disciplineId(name: string, dept: string) {
    const existing = disciplineIds.get(name);
    if (existing) return existing;
    const [row] = await db.insert(s.disciplines).values({ name, department: dept }).returning();
    disciplineIds.set(name, row.id);
    return row.id;
  }

  // ── Пароли: демо-аккаунты получают свои, «массовка», общий случайный (войти под ними нельзя) ──
  const fillerHash = await hashPassword(crypto.randomUUID() + crypto.randomUUID());

  const demoStudentRows: (StudentRow & { groupKey: string })[] = [];
  const allStudents: (StudentRow & { groupKey: string; groupId: string })[] = [];
  const groupCourses = new Map<string, CourseRef[]>(); // groupKey курсы текущего семестра
  const groupIds = new Map<string, string>();
  const lessonsBatch: (typeof s.lessons.$inferInsert)[] = [];
  const curSemByGroup = new Map<string, number>();

  for (const g of GROUPS) {
    const curSem = semesterNumber(g.course, sem.kind);
    curSemByGroup.set(g.key, curSem);
    const [groupRow] = await db
      .insert(s.groups)
      .values({
        code: g.code,
        facultyId: g.facultyId,
        programCode: g.programCode,
        programName: g.programName,
        profileName: g.profileName,
        course: g.course,
        campus: g.campus,
      })
      .returning();
    groupIds.set(g.key, groupRow.id);
    const faculty = facultyById.get(g.facultyId)!;
    const enrollYear = sem.academicYear - (g.course - 1);

    // ── Студенты ──
    const students: StudentRow[] = [];
    const demo = DEMO_STUDENTS.filter((d) => d.group === g.key);
    let seq = 100 + hashStr(g.code) % 50;
    const nextSeq = () => ++seq;

    for (const d of demo) {
      const [u] = await db.insert(s.users).values({ login: d.login, passwordHash: await hashPassword(d.password), role: "student" }).returning();
      const n = nextSeq();
      const [st] = await db
        .insert(s.students)
        .values({
          userId: u.id,
          lastName: d.last,
          firstName: d.first,
          middleName: d.middle,
          birthDate: d.birthDate,
          recordBook: `${String(enrollYear).slice(2)}${faculty.code}${String(n).padStart(4, "0")}`,
          studentCard: `${String(enrollYear).slice(2)}-${String(n * 7 + 3).padStart(5, "0")}`,
          groupId: groupRow.id,
          funding: d.funding,
          email: `${d.login.replace("student.", "")}.${translit(d.last)}@student.attache.demo`,
          phone: `+7 (900) 0${String(10 + n % 89).padStart(2, "0")}-${String(n % 97).padStart(2, "0")}-${String((n * 3) % 89).padStart(2, "0")}`,
          languages: [
            { name: g.l1, level: g.course >= 3 ? "C1" : "B2", order: 1, group: `${g.code}-${LANG_SHORT[g.l1]}` },
            { name: d.l2, level: g.course >= 3 ? "B2" : g.course === 2 ? "B1" : "A1", order: 2, group: `${g.code}-${LANG_SHORT[d.l2]}` },
          ],
          enrollmentYear: enrollYear,
          avatarHue: d.hue,
          activityBonus: d.bonus,
        })
        .returning();
      const row = { id: st.id, userId: u.id, ability: d.ability, weak: d.weak, weakAbility: d.weakAbility, l2: d.l2, demo: true, first: d.first, last: d.last, middle: d.middle, login: d.login };
      students.push(row);
      demoStudentRows.push({ ...row, groupKey: g.key });
    }

    const fillerUsers: (typeof s.users.$inferInsert)[] = [];
    const fillerMeta: { female: boolean; first: string; last: string; middle: string; l2: string; ability: number }[] = [];
    for (let i = students.length; i < g.size; i++) {
      const female = rand() < 0.55;
      const [lm, lf] = pick(LAST_NAMES);
      const pr = pick(PATRONYMIC_ROOTS);
      fillerMeta.push({
        female,
        first: female ? pick(FEMALE_FIRST) : pick(MALE_FIRST),
        last: female ? lf : lm,
        middle: female ? pr[1] : pr[0],
        l2: pick(g.l2),
        ability: clamp(between(0.55, 0.96), 0, 1),
      });
      fillerUsers.push({ login: `${g.key}.${String(i + 1).padStart(3, "0")}`, passwordHash: fillerHash, role: "student" });
    }
    const fillerUserRows = fillerUsers.length ? await db.insert(s.users).values(fillerUsers).returning() : [];
    const fillerStudentRows = fillerUserRows.length
      ? await db
          .insert(s.students)
          .values(
            fillerUserRows.map((u, i) => {
              const m = fillerMeta[i];
              const n = nextSeq();
              return {
                userId: u.id,
                lastName: m.last,
                firstName: m.first,
                middleName: m.middle,
                birthDate: `${enrollYear - 18 + (rand() < 0.3 ? -1 : 0)}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
                recordBook: `${String(enrollYear).slice(2)}${faculty.code}${String(n).padStart(4, "0")}`,
                studentCard: `${String(enrollYear).slice(2)}-${String(n * 7 + 3).padStart(5, "0")}`,
                groupId: groupRow.id,
                funding: rand() < 0.6 ? "budget" : "contract",
                email: `${u.login.replace(".", "")}@student.attache.demo`,
                phone: `+7 (900) 0${String(10 + (n % 89)).padStart(2, "0")}-${String(n % 97).padStart(2, "0")}-${String((n * 3) % 89).padStart(2, "0")}`,
                languages: [
                  { name: g.l1, level: "B2", order: 1, group: `${g.code}-${LANG_SHORT[g.l1]}` },
                  { name: m.l2, level: "B1", order: 2, group: `${g.code}-${LANG_SHORT[m.l2]}` },
                ],
                enrollmentYear: enrollYear,
                avatarHue: Math.floor(rand() * 360),
                activityBonus: half(between(0, 3)),
              };
            }),
          )
          .returning()
      : [];
    fillerStudentRows.forEach((st, i) =>
      students.push({ id: st.id, userId: st.userId, ability: fillerMeta[i].ability, l2: fillerMeta[i].l2, demo: false, first: st.firstName, last: st.lastName, middle: st.middleName, login: fillerUserRows[i].login }),
    );
    students.forEach((st) => allStudents.push({ ...st, groupKey: g.key, groupId: groupRow.id }));

    // ── Курсы по всем семестрам 1..curSem ──
    const usedL2 = [...new Set(students.map((x) => x.l2))];
    const planKeys = Object.keys(g.plan).map(Number);
    for (let semNo = 1; semNo <= curSem; semNo++) {
      const plan = g.plan[semNo] ?? g.plan[Math.max(...planKeys)];
      const isCurrent = semNo === curSem;
      const refs: CourseRef[] = [];

      for (const spec of plan) {
        const t = nonLangTeachers[hashStr(spec.name) % nonLangTeachers.length];
        const [c] = await db
          .insert(s.courses)
          .values({ disciplineId: await disciplineId(spec.name, spec.dept), teacherId: t.id, groupId: groupRow.id, semester: semNo, controlType: spec.control, credits: spec.credits })
          .returning();
        refs.push({ id: c.id, name: spec.name, spec, semester: semNo, teacherName: teacherShort(t) });
      }
      for (const lang of [g.l1, ...usedL2]) {
        const t = teacherByLast.get(LANG_TEACHER[lang])!;
        const spec: CourseSpec = { name: lang, dept: "Кафедра иностранных языков", control: "exam", credits: lang === g.l1 ? 4 : 5, kind: "lang" };
        const [c] = await db
          .insert(s.courses)
          .values({
            disciplineId: await disciplineId(lang, spec.dept),
            teacherId: t.id,
            groupId: groupRow.id,
            semester: semNo,
            controlType: "exam",
            credits: spec.credits,
            isLanguage: true,
            langGroup: `${g.code}-${LANG_SHORT[lang]}`,
          })
          .returning();
        refs.push({ id: c.id, name: lang, spec, semester: semNo, lang, teacherName: teacherShort(t) });
      }

      // Запись студентов на курсы
      const enr: (typeof s.enrollments.$inferInsert)[] = [];
      for (const st of students)
        for (const r of refs) if (!r.lang || r.lang === g.l1 || r.lang === st.l2) enr.push({ studentId: st.id, courseId: r.id });
      await db.insert(s.enrollments).values(enr);

      if (!isCurrent) {
        // Зачётка за прошлые семестры
        const gradedAt = pastSessionDate(curSem - semNo);
        const fg: (typeof s.finalGrades.$inferInsert)[] = [];
        for (const st of students)
          for (const r of refs) {
            if (r.lang && r.lang !== g.l1 && r.lang !== st.l2) continue;
            let points = Math.round(100 * clamp(st.ability + 0.03 + noise(0.09), 0.45, 1));
            if (st.login === "student.anna" && semNo === curSem - 1) points = Math.max(points, 90 + Math.floor(rand() * 8));
            if (!st.demo && points < 60) points = 60 + Math.floor(rand() * 6);
            let mark = markFromPoints(points, r.spec.control);
            let attempt = 1;
            // Задолженность Тимура, сюжет для демо (пересдача, риск по стипендии)
            if (st.login === "student.timur" && r.name === "Математический анализ II") {
              points = 48;
              mark = "2";
            } else if (st.demo && points < 60) {
              points = 61 + Math.floor(rand() * 8);
              mark = markFromPoints(points, r.spec.control);
              attempt = 2;
            }
            fg.push({ studentId: st.id, courseId: r.id, points, mark, gradedAt: addDays(gradedAt, Math.floor(rand() * 10)), attempt });
          }
        await db.insert(s.finalGrades).values(fg);
        continue;
      }

      // ── Текущий семестр: даты экзаменов, контрольные точки, баллы, занятия ──
      groupCourses.set(g.key, refs);
      const exams = refs.filter((r) => r.spec.control === "exam");
      const credits = refs.filter((r) => r.spec.control !== "exam");
      const examDays = [1, 4, 8, 11, 15, 18, 22, 25];
      for (const [i, r] of exams.entries()) {
        const d = addDays(sem.sessionStart, examDays[i % examDays.length]);
        const p = mskParts(d);
        const examAt = mskDate(p.y, p.m, p.d, 10, 0);
        await db
          .update(s.courses)
          .set({ examAt, consultationAt: mskDate(p.y, p.m, p.d - 1, 14, 35), examRoom: pick(r.lang ? g.rooms.lang : g.rooms.seminar) })
          .where(eq(s.courses.id, r.id));
      }
      for (const [i, r] of credits.entries()) {
        let d = addDays(sem.creditWeekStart, i % 6);
        if (mskParts(d).wd === 6) d = addDays(d, 1);
        const { startsAt } = pairTimes(d, 2 + (i % 3));
        await db.update(s.courses).set({ examAt: startsAt, examRoom: pick(g.rooms.seminar) }).where(eq(s.courses.id, r.id));
      }

      const assessRows: (typeof s.assessments.$inferInsert)[] = [];
      refs.forEach((r, idx) => {
        for (const [title, kind, max, week] of ASSESS[r.spec.kind]) {
          const shiftW = kind === "attendance" ? 0 : idx % 2;
          const base = addDays(mondayOfWeek(sem, Math.min(week + shiftW, 16)), idx % 5);
          const p = mskParts(base);
          const dueAt = kind === "essay" || kind === "project" ? mskDate(p.y, p.m, p.d, 23, 59) : mskDate(p.y, p.m, p.d, 18, 0);
          assessRows.push({ courseId: r.id, title, kind, maxPoints: max, dueAt });
        }
      });
      const assessInserted = await db.insert(s.assessments).values(assessRows).returning();

      const scoreRows: (typeof s.scores.$inferInsert)[] = [];
      for (const a of assessInserted) {
        const gradedAt = addDays(a.dueAt, 2 + (hashStr(a.id) % 3));
        if (gradedAt > now) continue; // ещё не проверено
        const ref = refs.find((r) => r.id === a.courseId)!;
        for (const st of students) {
          if (ref.lang && ref.lang !== g.l1 && ref.lang !== st.l2) continue;
          const base = st.weak === ref.name ? st.weakAbility! : st.ability + (hashStr(st.id + ref.id) % 100) / 1000 - 0.05;
          const ratio = a.kind === "attendance" ? clamp(base + 0.12 + noise(0.05), 0.4, 1) : clamp(base + noise(0.1), 0.15, 1);
          scoreRows.push({ studentId: st.id, assessmentId: a.id, points: half(a.maxPoints * ratio), gradedAt });
        }
      }
      if (scoreRows.length) await db.insert(s.scores).values(scoreRows);

      // Занятия на весь семестр по недельному шаблону
      const building = CAMPUSES[g.campus].building;
      const lastWeek = weekOfSemester(sem.end, sem).week;
      for (let w = 1; w <= lastWeek; w++) {
        const parity = w % 2 === 1 ? "odd" : "even";
        for (const [slotIdx, slot] of g.template.entries()) {
          if (slot.parity && slot.parity !== parity) continue;
          const day = addDays(mondayOfWeek(sem, w), slot.wd);
          if (day < startOfMskDay(sem.start) || day > sem.end || isHoliday(day)) continue;
          const { startsAt, endsAt } = pairTimes(day, slot.pair);
          const targets =
            slot.ref === "L1" ? refs.filter((r) => r.lang === g.l1) : slot.ref === "L2" ? refs.filter((r) => r.lang && r.lang !== g.l1) : refs.filter((r) => r.name === slot.ref);
          targets.forEach((r, ti) => {
            const pool = slot.format === "lecture" ? g.rooms.lecture : slot.format === "lang" ? g.rooms.lang : g.rooms.seminar;
            lessonsBatch.push({
              courseId: r.id,
              startsAt,
              endsAt,
              pairNo: slot.pair,
              room: pool[(slotIdx + ti) % pool.length],
              building,
              format: slot.format,
            });
          });
        }
      }
    }
  }

  for (let i = 0; i < lessonsBatch.length; i += 500) await db.insert(s.lessons).values(lessonsBatch.slice(i, i + 500));
  console.log(`✓ Студенты: ${allStudents.length}, занятия: ${lessonsBatch.length}`);

  // ── Сотрудники ──
  const staffRows: (typeof s.staff.$inferSelect)[] = [];
  for (const st of DEMO_STAFF) {
    const [u] = await db.insert(s.users).values({ login: st.login, passwordHash: await hashPassword(st.password), role: "staff" }).returning();
    const [row] = await db
      .insert(s.staff)
      .values({ userId: u.id, lastName: st.last, firstName: st.first, middleName: st.middle, position: st.position, facultyId: st.facultyId })
      .returning();
    staffRows.push(row);
  }
  const officeStaff = staffRows[0];
  const meoStaff = staffRows[1];
  const staffName = (x: typeof officeStaff) => `${x.firstName} ${x.lastName}`;

  // ── Объявления ──
  const ann: (typeof s.announcements.$inferInsert)[] = [
    {
      title: "Запись на элективы весеннего семестра открыта",
      titleEn: "Spring semester elective sign-up is open",
      bodyEn: `Choose two electives for the spring semester in the Studies section. Sign-up is open until ${formatDayMonth(addDays(now, 10), "en")} inclusive. After that date, the remaining places are assigned automatically.\n\nPopular courses fill up fast: Digital Diplomacy, Economics of Sanctions, Business Etiquette in Asian Countries.`,
      body: `Выберите два электива на весенний семестр в разделе «Учёба». Запись открыта до ${formatDayMonth(addDays(now, 10))} включительно, после этой даты свободные места распределят автоматически.\n\nПопулярные курсы быстро заполняются: «Цифровая дипломатия», «Экономика санкций», «Деловой этикет стран Азии».`,
      category: "study",
      important: true,
      pinned: true,
      authorName: "Студенческий офис",
      publishedAt: addMinutes(now, -26 * 60),
    },
    {
      title: "Повышенная стипендия: приём документов",
      titleEn: "Increased scholarship: applications open",
      bodyEn: `Until ${formatDayMonth(addDays(now, 16), "en")} we accept applications for the increased state academic scholarship for achievements in studies, research, community, cultural and sports activities.\n\nUpload supporting documents to your request or bring them to the student office. Requirement: an exam session without "satisfactory" marks or academic debts.`,
      body: `До ${formatDayMonth(addDays(now, 16))} принимаем заявки на повышенную государственную академическую стипендию за достижения в учёбе, науке, общественной, культурной и спортивной деятельности.\n\nПодтверждающие документы загрузите в заявку или принесите в учебный офис. Условие: сессия без «удовлетворительно» и задолженностей.`,
      category: "scholarship",
      important: true,
      authorName: "Стипендиальная комиссия",
      publishedAt: addMinutes(now, -3 * 24 * 60),
    },
    {
      title: "Программы обмена на весенний семестр",
      titleEn: "Exchange programmes for the spring semester",
      bodyEn: `Selection for a semester at partner universities is open. You need an academic transcript, a motivation letter and a language certificate. Deadline: ${formatDayMonth(addDays(now, 25), "en")}.\n\nYou can order an academic transcript in English in MGIMO Hub in a couple of taps: Requests, Academic transcript.`,
      body: `Открыт отбор на включённое обучение в университетах-партнёрах. Нужны: академическая выписка, мотивационное письмо и языковой сертификат. Дедлайн: ${formatDayMonth(addDays(now, 25))}.\n\nАкадемическую выписку на английском можно заказать в MGIMO Hub за пару касаний: Заявки Академическая выписка.`,
      category: "mobility",
      authorName: "Управление международного сотрудничества",
      publishedAt: addMinutes(now, -5 * 24 * 60),
    },
    {
      title: "Неделя карьеры: стажировки в международных организациях",
      titleEn: "Career Week: internships at international organisations",
      bodyEn: "Meet representatives of international organisations, companies and government bodies. They will talk about summer internships and programmes for 2nd to 4th year students. Register at the desk in the main hall.",
      body: "Встречи с представителями международных организаций, компаний и госструктур. Расскажут о летних стажировках и программах для студентов 2-4 курсов. Регистрация, на стойке в главном холле.",
      category: "events",
      authorName: "Центр карьеры",
      publishedAt: addMinutes(now, -2 * 24 * 60 - 120),
    },
    {
      title: "Зачётная неделя и зимняя сессия",
      titleEn: "Credit week and winter exam session",
      bodyEn: `Credit week starts on ${formatDayMonth(sem.creditWeekStart, "en")}, the exam session runs from ${formatDayMonth(sem.sessionStart, "en")} to ${formatDayMonth(sem.sessionEnd, "en")}. Your personal exam and consultation timetable is already in Studies, Session.`,
      body: `Зачётная неделя с ${formatDayMonth(sem.creditWeekStart)}, экзаменационная сессия, с ${formatDayMonth(sem.sessionStart)} по ${formatDayMonth(sem.sessionEnd)}. Персональное расписание экзаменов и консультаций уже в разделе «Учёба Сессия».`,
      category: "study",
      authorName: "Учебно-методическое управление",
      publishedAt: addMinutes(now, -8 * 24 * 60),
    },
    {
      title: "Шаттл между кампусами Вернадского и Одинцово",
      titleEn: "Shuttle between the Vernadsky and Odintsovo campuses",
      bodyEn: "From Monday, a free shuttle runs every hour from 7:30 to 20:30. Board with your student card; the electronic student card in MGIMO Hub works too.",
      body: "С понедельника бесплатный шаттл ходит каждый час с 7:30 до 20:30. Посадка по студенческому билету, подойдёт и электронный студенческий из профиля MGIMO Hub.",
      category: "campus",
      facultyId: "flmk",
      authorName: "Кампус Одинцово",
      publishedAt: addMinutes(now, -4 * 24 * 60),
    },
    {
      title: "Учебный офис МЭО: приёмные часы",
      titleEn: "MEO student office: opening hours",
      bodyEn: "Next week the student office is open from 11:00 to 16:00. Most certificates can be ordered online in MGIMO Hub, no need to come in.",
      body: "На следующей неделе учебный офис принимает с 11:00 до 16:00. Большинство справок можно заказать онлайн в MGIMO Hub, приходить не нужно.",
      category: "office",
      facultyId: "meo",
      authorName: "Учебный офис МЭО",
      publishedAt: addMinutes(now, -6 * 60),
    },
    {
      title: "Компенсация языковых экзаменов",
      titleEn: "Language exam fee compensation",
      bodyEn: "3rd and 4th year students can get the fee for an international language exam (IELTS, HSK, DELF, DELE and others) refunded with a result of B2 or higher. Ask your faculty student office for details.",
      body: "Студенты 3-4 курсов могут получить компенсацию стоимости международного языкового экзамена (IELTS, HSK, DELF, DELE и др.) при результате не ниже B2. Подробности, в учебном офисе факультета.",
      category: "study",
      course: 3,
      authorName: "Кафедра иностранных языков",
      publishedAt: addMinutes(now, -9 * 24 * 60),
    },
  ];
  const annRows = await db.insert(s.announcements).values(ann).returning();

  // ── Дедлайны деканата ──
  await db.insert(s.deadlines).values([
    { title: "Выбрать элективы на весенний семестр", description: "Два курса по выбору", dueAt: endOfDay(addDays(now, 10)), kind: "study", link: "/notifications?tab=news" },
    { title: "Подать документы на повышенную стипендию", dueAt: endOfDay(addDays(now, 16)), kind: "admin" },
    { title: "Оплатить обучение за весенний семестр", dueAt: endOfDay(addDays(now, 40)), kind: "finance", funding: "contract" },
    { title: "Пройти медосмотр в студенческой поликлинике", dueAt: endOfDay(addDays(now, 20)), kind: "admin", course: 1 },
    { title: "Заявка на программу обмена", description: "Выписка, мотивационное письмо, сертификат", dueAt: endOfDay(addDays(now, 25)), kind: "mobility", facultyId: "mo" },
    { title: "Заявка на программу обмена", description: "Выписка, мотивационное письмо, сертификат", dueAt: endOfDay(addDays(now, 25)), kind: "mobility", facultyId: "meo" },
  ]);

  // ── История заявок за 10 недель для аналитики (до демо-заявок, чтобы номера шли по хронологии) ──
  await seedHistory();
  console.log("✓ История заявок");

  // ── Заявки ──
  const anna = demoStudentRows.find((x) => x.login === "student.anna")!;
  const timur = demoStudentRows.find((x) => x.login === "student.timur")!;
  const leyla = demoStudentRows.find((x) => x.login === "student.leyla")!;
  const timurDebtCourse = await db
    .select({ id: s.courses.id })
    .from(s.finalGrades)
    .innerJoin(s.courses, eq(s.courses.id, s.finalGrades.courseId))
    .where(and(eq(s.finalGrades.studentId, timur.id), eq(s.finalGrades.mark, "2")))
    .limit(1);

  type Ev = { status: s.RequestStatus | null; message?: string; actor: "student" | "staff" | "system"; actorName: string; after: number };
  async function createRequest(opts: {
    student: { id: string; first: string; last: string };
    facultyCode: string;
    type: string;
    status: s.RequestStatus;
    fields: Record<string, string>;
    delivery?: "electronic" | "paper";
    createdAt: Date;
    events: Ev[];
    staffId?: string;
    comment?: string;
  }) {
    const def = getRequestType(opts.type)!;
    const delivery = opts.delivery ?? def.delivery[0];
    const readyEv = opts.events.find((e) => e.status === "ready");
    const readyAt = readyEv ? addMinutes(opts.createdAt, readyEv.after) : null;
    const isDoc = def.category === "certificate" && readyAt;
    const last = opts.events[opts.events.length - 1];
    const [r] = await db
      .insert(s.requests)
      .values({
        number: sql`'АТ-' || lpad(nextval('request_number_seq')::text, 5, '0')`,
        studentId: opts.student.id,
        type: opts.type,
        status: opts.status,
        fields: opts.fields,
        delivery,
        comment: opts.comment,
        createdAt: opts.createdAt,
        updatedAt: addMinutes(opts.createdAt, last.after),
        dueAt: addWorkingDays(opts.createdAt, def.slaDays),
        readyAt,
        verifyCode: isDoc ? randomVerifyCode() : null,
        assignedStaffId: opts.staffId,
      })
      .returning();
    if (isDoc) await db.update(s.requests).set({ documentNo: documentNumber(opts.facultyCode, r.number, readyAt!) }).where(eq(s.requests.id, r.id));
    await db.insert(s.requestEvents).values(
      opts.events.map((e) => ({ requestId: r.id, status: e.status, message: e.message, actor: e.actor, actorName: e.actorName, createdAt: addMinutes(opts.createdAt, e.after) })),
    );
    return r;
  }

  const officeName = staffName(officeStaff);
  const meoName = staffName(meoStaff);
  const studentName = (x: { first: string; last: string }) => `${x.first} ${x.last}`;

  const annaOld = await createRequest({
    student: anna,
    facultyCode: "МО",
    type: "study-certificate",
    status: "completed",
    fields: { purpose: "в банк", addressee: "АО «Демо-Банк»" },
    createdAt: addMinutes(now, -18 * 24 * 60),
    staffId: officeStaff.id,
    events: [
      { status: "submitted", actor: "student", actorName: studentName(anna), after: 0 },
      { status: "in_review", actor: "staff", actorName: officeName, after: 75 },
      { status: "ready", message: "Справка готова и подписана электронной подписью. Подлинность проверяется по QR-коду.", actor: "staff", actorName: officeName, after: 260 },
      { status: "completed", message: "Документ скачан.", actor: "system", actorName: "Атташе", after: 300 },
    ],
  });
  const annaEmbassy = await createRequest({
    student: anna,
    facultyCode: "МО",
    type: "embassy-certificate",
    status: "in_progress",
    fields: { country: "Италия", travelFrom: dayKey(addDays(now, 46)), travelTo: dayKey(addDays(now, 56)), purpose: "tourism" },
    createdAt: addMinutes(now, -27 * 60),
    staffId: officeStaff.id,
    events: [
      { status: "submitted", actor: "student", actorName: studentName(anna), after: 0 },
      { status: "in_review", actor: "staff", actorName: officeName, after: 40 },
      { status: "in_progress", message: "Данные проверены. Справку подпишет заместитель декана, ориентировочно завтра до 15:00.", actor: "staff", actorName: officeName, after: 190 },
    ],
  });
  const timurRetake = await createRequest({
    student: timur,
    facultyCode: "МЭО",
    type: "retake",
    status: "needs_info",
    fields: { course: timurDebtCourse[0]?.id ?? "", preferred: "weekday-evening", details: "" },
    createdAt: addMinutes(now, -2 * 24 * 60 - 200),
    staffId: meoStaff.id,
    events: [
      { status: "submitted", actor: "student", actorName: studentName(timur), after: 0 },
      { status: "in_review", actor: "staff", actorName: meoName, after: 55 },
      {
        status: "needs_info",
        message: "Тимур, пересдачу проведём для всей группы в ближайшие две недели. Подскажите, удобно ли вам во второй половине дня, после 16:00?",
        actor: "staff",
        actorName: meoName,
        after: 24 * 60 + 30,
      },
    ],
  });
  const timurMilitary = await createRequest({
    student: timur,
    facultyCode: "МЭО",
    type: "military-certificate",
    status: "ready",
    fields: { commissariat: "Военный комиссариат Ломоносовского района (демо)" },
    delivery: "paper",
    createdAt: addMinutes(now, -3 * 24 * 60 - 90),
    staffId: meoStaff.id,
    events: [
      { status: "submitted", actor: "student", actorName: studentName(timur), after: 0 },
      { status: "in_review", actor: "staff", actorName: meoName, after: 120 },
      { status: "in_progress", actor: "staff", actorName: meoName, after: 24 * 60 },
      {
        status: "ready",
        message: "Справка готова. Заберите в учебном офисе МЭО, ауд. 2017 (пн-чт 10:00-17:00, пт до 16:00). При себе, студенческий билет.",
        actor: "staff",
        actorName: meoName,
        after: 2 * 24 * 60 + 60,
      },
    ],
  });

  // Очередь для кабинета сотрудника, заявки «массовки»
  const fillers = allStudents.filter((x) => !x.demo);
  const queuePlan: { status: s.RequestStatus; type: string; ageMin: number }[] = [
    { status: "submitted", type: "study-certificate", ageMin: 35 },
    { status: "submitted", type: "embassy-certificate", ageMin: 140 },
    { status: "submitted", type: "transcript", ageMin: 5 * 60 },
    { status: "submitted", type: "study-certificate", ageMin: 4 * 24 * 60 }, // просрочена
    { status: "submitted", type: "military-certificate", ageMin: 22 * 60 },
    { status: "submitted", type: "individual-plan", ageMin: 26 * 60 },
    { status: "in_review", type: "scholarship-certificate", ageMin: 30 * 60 },
    { status: "in_review", type: "credit-transfer", ageMin: 3 * 24 * 60 },
    { status: "in_review", type: "financial-aid", ageMin: 5 * 24 * 60 },
    { status: "in_progress", type: "transcript", ageMin: 2 * 24 * 60 },
    { status: "in_progress", type: "embassy-certificate", ageMin: 26 * 60 },
    { status: "needs_info", type: "academic-leave", ageMin: 4 * 24 * 60 },
    { status: "ready", type: "study-certificate", ageMin: 20 * 60 },
    { status: "ready", type: "student-card", ageMin: 3 * 24 * 60 },
    { status: "completed", type: "study-certificate", ageMin: 6 * 24 * 60 },
    { status: "completed", type: "scholarship-certificate", ageMin: 9 * 24 * 60 },
    { status: "rejected", type: "individual-plan", ageMin: 7 * 24 * 60 },
  ];
  const sampleFields: Record<string, Record<string, string>> = {
    "study-certificate": { purpose: "для работодателя", addressee: "" },
    "embassy-certificate": { country: "Франция", travelFrom: dayKey(addDays(now, 50)), travelTo: dayKey(addDays(now, 60)), purpose: "tourism" },
    transcript: { language: "en", purpose: "exchange" },
    "military-certificate": { commissariat: "Военный комиссариат Гагаринского района (демо)" },
    "individual-plan": { reason: "work", details: "Работаю аналитиком 3 дня в неделю, могу посещать занятия во вторник и четверг." },
    "scholarship-certificate": { period: "6", purpose: "в органы социальной защиты" },
    "credit-transfer": { university: "Universidad de Salamanca (демо)", disciplines: "Economía internacional, 6 ECTS, 8,5\nHistoria de España, 4 ECTS, 9" },
    "financial-aid": { reason: "family", details: "Сложная ситуация в семье, прошу рассмотреть." },
    "academic-leave": { reason: "medical", startDate: dayKey(addDays(now, 14)), details: "" },
    "student-card": { item: "card", details: "Потерял в метро." },
  };
  for (const [i, q] of queuePlan.entries()) {
    const st = fillers[(i * 7 + 3) % fillers.length];
    const g = GROUPS.find((x) => x.key === st.groupKey)!;
    const fc = facultyById.get(g.facultyId)!.code;
    const handler = g.facultyId === "meo" ? meoStaff : officeStaff;
    const hn = staffName(handler);
    const createdAt = addMinutes(now, -q.ageMin);
    const ev: Ev[] = [{ status: "submitted", actor: "student", actorName: studentName(st), after: 0 }];
    const step = Math.max(10, Math.floor(q.ageMin / 5));
    if (q.status !== "submitted") ev.push({ status: "in_review", actor: "staff", actorName: hn, after: step });
    if (q.status === "needs_info") ev.push({ status: "needs_info", message: "Приложите, пожалуйста, медицинское заключение или принесите его в учебный офис.", actor: "staff", actorName: hn, after: step * 2 });
    if (["in_progress", "ready", "completed"].includes(q.status)) ev.push({ status: "in_progress", actor: "staff", actorName: hn, after: step * 2 });
    if (["ready", "completed"].includes(q.status)) ev.push({ status: "ready", actor: "staff", actorName: hn, after: step * 3 });
    if (q.status === "completed") ev.push({ status: "completed", actor: "staff", actorName: hn, after: step * 4 });
    if (q.status === "rejected") ev.push({ status: "rejected", message: "Для индивидуального плана нужна справка с места работы. Подайте заявку повторно с документом.", actor: "staff", actorName: hn, after: step * 2 });
    await createRequest({
      student: st,
      facultyCode: fc,
      type: q.type,
      status: q.status,
      fields: sampleFields[q.type] ?? {},
      createdAt,
      events: ev,
      staffId: q.status === "submitted" ? undefined : handler.id,
    });
  }

  // ── Изменения в расписании рядом с «сейчас» ──
  type Change = { groupKey: string; dayOffset: number; nth: number; kind: "room" | "cancel" | "move" | "teacher"; note: string };
  const changes: Change[] = [
    { groupKey: "mo", dayOffset: 0, nth: 0, kind: "room", note: "Аудитория закрыта на ремонт" },
    { groupKey: "mo", dayOffset: 1, nth: 1, kind: "cancel", note: "Преподаватель в командировке. Материалы лекции в LMS, задание к следующему семинару." },
    { groupKey: "mo", dayOffset: 4, nth: 2, kind: "move", note: "Перенос по просьбе кафедры" },
    { groupKey: "meo", dayOffset: 0, nth: 0, kind: "teacher", note: "Замена преподавателя на время больничного" },
    { groupKey: "meo", dayOffset: 2, nth: 1, kind: "move", note: "Перенос из-за конференции" },
    { groupKey: "flmk", dayOffset: 1, nth: 0, kind: "room", note: "Занятие в компьютерном классе" },
  ];
  const notifications: (typeof s.notifications.$inferInsert)[] = [];
  const demoByGroup = new Map(demoStudentRows.map((d) => [d.groupKey, d]));

  for (const ch of changes) {
    const refs = groupCourses.get(ch.groupKey)!;
    const ids = refs.map((r) => r.id);
    const from = ch.dayOffset === 0 ? now : nextWorkingDay(today, ch.dayOffset);
    const to = addDays(startOfMskDay(from), ch.dayOffset === 0 ? 1 : 1);
    let candidates = await db
      .select()
      .from(s.lessons)
      .where(and(inArray(s.lessons.courseId, ids), gte(s.lessons.startsAt, from), lt(s.lessons.startsAt, to), eq(s.lessons.status, "scheduled")))
      .orderBy(asc(s.lessons.startsAt));
    if (!candidates.length) {
      // сегодня пар уже нет, берём ближайший рабочий день
      const d = nextWorkingDay(today, 1);
      candidates = await db
        .select()
        .from(s.lessons)
        .where(and(inArray(s.lessons.courseId, ids), gte(s.lessons.startsAt, d), lt(s.lessons.startsAt, addDays(d, 1)), eq(s.lessons.status, "scheduled")))
        .orderBy(asc(s.lessons.startsAt));
    }
    // для «перенос/отмена/замена» не трогаем языковые подгруппы, изменение должно касаться всей группы
    const nonLang = candidates.filter((l) => !refs.find((r) => r.id === l.courseId)?.lang);
    const lesson = (nonLang.length ? nonLang : candidates)[Math.min(ch.nth, (nonLang.length || candidates.length) - 1)];
    if (!lesson) continue;
    const ref = refs.find((r) => r.id === lesson.courseId)!;
    const g = GROUPS.find((x) => x.key === ch.groupKey)!;
    const changedAt = addMinutes(now, -(40 + Math.floor(rand() * 300)));
    const course = { ru: ref.name, en: DISCIPLINE_EN[ref.name] };
    let text: BiText;
    if (ch.kind === "room") {
      const newRoom = g.campus === "odintsovo" ? "120 (компьютерный класс)" : "4105";
      await db.update(s.lessons).set({ status: "room_changed", prevRoom: lesson.room, room: newRoom, changeNote: ch.note, changedAt }).where(eq(s.lessons.id, lesson.id));
      text = lessonText.room(course, lesson.startsAt, lesson.pairNo, newRoom, lesson.room);
    } else if (ch.kind === "cancel") {
      await db.update(s.lessons).set({ status: "cancelled", changeNote: ch.note, changedAt }).where(eq(s.lessons.id, lesson.id));
      text = lessonText.cancelled(course, lesson.startsAt, lesson.pairNo);
    } else if (ch.kind === "teacher") {
      await db
        .update(s.lessons)
        .set({ status: "teacher_changed", prevTeacher: ref.teacherName, substituteTeacher: "Карелин Д. О.", changeNote: ch.note, changedAt })
        .where(eq(s.lessons.id, lesson.id));
      text = lessonText.substitute(course, lesson.startsAt, lesson.pairNo, "Карелин Д. О.");
    } else {
      const targetDay = nextWorkingDay(startOfMskDay(lesson.startsAt), 1);
      const { startsAt, endsAt } = pairTimes(targetDay, 5);
      await db
        .update(s.lessons)
        .set({ status: "moved", prevStartsAt: lesson.startsAt, startsAt, endsAt, pairNo: 5, changeNote: ch.note, changedAt })
        .where(eq(s.lessons.id, lesson.id));
      text = lessonText.moved(course, lesson.startsAt, lesson.pairNo, startsAt);
    }
    const d = demoByGroup.get(ch.groupKey);
    if (d) {
      notifications.push({
        userId: d.userId,
        kind: "schedule",
        ...text,
        link: `/schedule?day=${dayKey(ch.kind === "move" ? lesson.startsAt : lesson.startsAt)}`,
        important: ch.kind === "cancel" || ch.kind === "move",
        createdAt: changedAt,
      });
    }
  }

  // ── Уведомления демо-студентов ──
  const reqLink = (r: { id: string }) => `/requests/${r.id}`;
  notifications.push(
    { userId: anna.userId, kind: "request", title: "Справка готова", body: `Справка об обучении ${annaOld.number} готова, можно скачать или показать QR.`, titleEn: "Certificate ready", bodyEn: `${localizeRequestTitle("Справка об обучении", "en")} ${annaOld.number} is ready: download it or show the QR code.`, link: reqLink(annaOld), createdAt: addMinutes(now, -18 * 24 * 60 + 260), readAt: addMinutes(now, -18 * 24 * 60 + 280) },
    { userId: anna.userId, kind: "request", title: "Заявка в работе", body: `Справка для посольства ${annaEmbassy.number}: данные проверены, документ готовят к подписи.`, titleEn: "Request in progress", bodyEn: `${localizeRequestTitle("Справка для посольства", "en")} ${annaEmbassy.number}: details checked, the document is being prepared for signature.`, link: reqLink(annaEmbassy), createdAt: addMinutes(now, -27 * 60 + 190) },
    { userId: timur.userId, kind: "request", title: "Нужно ваше уточнение", body: `Заявка на пересдачу ${timurRetake.number}: учебный офис уточняет удобное время.`, titleEn: "We need more information", bodyEn: `Retake request ${timurRetake.number}: the student office is checking a convenient time.`, link: reqLink(timurRetake), important: true, createdAt: addMinutes(now, -24 * 60 + 30), readAt: addMinutes(now, -20 * 60) },
    { userId: timur.userId, kind: "request", title: "Справка готова, заберите в офисе", body: `Справка для военкомата ${timurMilitary.number} ждёт вас в ауд. 2017.`, titleEn: "Certificate ready, collect it at the office", bodyEn: `${localizeRequestTitle("Справка для военкомата", "en")} ${timurMilitary.number} is waiting for you in room 2017.`, link: reqLink(timurMilitary), createdAt: addMinutes(now, -3 * 24 * 60 - 90 + 2 * 24 * 60 + 60) },
    { userId: timur.userId, kind: "grade", ...gradeText.debt({ ru: "Математический анализ II", en: DISCIPLINE_EN["Математический анализ II"] }, "2"), link: "/grades?tab=session", important: true, createdAt: addMinutes(now, -12 * 24 * 60), readAt: addMinutes(now, -11 * 24 * 60) },
    { userId: leyla.userId, kind: "system", ...systemText.welcome(), link: "/assistant", createdAt: addMinutes(now, -20 * 24 * 60) },
  );

  // Свежевыставленные баллы
  for (const d of demoStudentRows) {
    const recent = await db
      .select({ points: s.scores.points, gradedAt: s.scores.gradedAt, title: s.assessments.title, max: s.assessments.maxPoints, courseId: s.assessments.courseId })
      .from(s.scores)
      .innerJoin(s.assessments, eq(s.assessments.id, s.scores.assessmentId))
      .where(and(eq(s.scores.studentId, d.id), gte(s.scores.gradedAt, addDays(now, -5))))
      .limit(3);
    for (const r of recent) {
      const ref = groupCourses.get(d.groupKey)!.find((x) => x.id === r.courseId)!;
      notifications.push({
        userId: d.userId,
        kind: "grade",
        ...gradeText.scored({ ru: ref.name, en: DISCIPLINE_EN[ref.name] }, { ru: r.title, en: assessmentTitle(r.title, "en") }, r.points, r.max),
        link: `/grades/${r.courseId}`,
        createdAt: r.gradedAt,
        readAt: r.gradedAt < addDays(now, -2) ? addMinutes(r.gradedAt, 90) : null,
      });
    }
  }

  // Новости уведомления для своей аудитории
  for (const a of annRows) {
    if (!a.important) continue;
    for (const d of demoStudentRows) {
      const g = GROUPS.find((x) => x.key === d.groupKey)!;
      if (a.facultyId && a.facultyId !== g.facultyId) continue;
      if (a.course && a.course !== g.course) continue;
      notifications.push({ userId: d.userId, kind: "news", title: a.title, body: a.body.split("\n")[0].slice(0, 160), titleEn: a.titleEn, bodyEn: a.bodyEn?.split("\n")[0].slice(0, 160), link: `/news/${a.id}`, important: true, createdAt: a.publishedAt });
    }
  }
  await db.insert(s.notifications).values(notifications);

  // ── Разделы со своими модулями сида ──
  await seedAppointments();
  console.log("✓ Запись на приём");
  await seedPayments(now);
  console.log("✓ Оплата обучения");
  await seedSickLeaves(now);
  console.log("✓ Больничные");
  // пересдачи в конце: выпуск направления закрывает заявку Тимура на пересдачу
  await seedRetakes(now);
  console.log("✓ Пересдачи");
  await seedEnglishNames();
  console.log("✓ Английские названия");

  console.log("✓ Готово. Тестовые аккаунты:");
  for (const d of DEMO_STUDENTS) console.log(`   студент   ${d.login.padEnd(16)} ${d.password}`);
  for (const d of DEMO_STAFF) console.log(`   сотрудник ${d.login.padEnd(16)} ${d.password}`);
}

// ───────────── вспомогательные ─────────────

function endOfDay(d: Date) {
  const p = mskParts(d);
  return mskDate(p.y, p.m, p.d, 23, 59);
}

/** n-й рабочий день после day (пн-пт, без праздников) */
function nextWorkingDay(day: Date, n: number) {
  let d = startOfMskDay(day);
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (mskParts(d).wd < 5 && !isHoliday(d)) left--;
  }
  return d;
}

/** Дата сессии семестра, который был `back` семестров назад */
function pastSessionDate(back: number) {
  const curAbs = sem.academicYear * 2 + (sem.kind === "autumn" ? 0 : 1);
  const abs = curAbs - back;
  const year = Math.floor(abs / 2);
  return abs % 2 === 0 ? mskDate(year + 1, 0, 18, 12) : mskDate(year + 1, 5, 15, 12);
}

function translit(str: string) {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  return [...str.toLowerCase()].map((c) => map[c] ?? c).join("");
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });
