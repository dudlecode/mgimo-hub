// Демо-данные пересдач: долги «массовки» МО-305 и МЭО-212, график с черновиком, выпущенные направления,
// прошедшая пересдача с частью результатов и направление демо-студента Тимура по «Математическому анализу II».
//
//   import { seedRetakes } from "./retakes";
//   await seedRetakes();
//
// Идемпотентно и детерминированно: каждый запуск сначала убирает всё, что относится к пересдачам
// (пересдачи, направления, уведомления-ссылки на направления, даты пересдач в зачётке, закрытые выпуском заявления),
// потом заново выставляет долги по плану ниже и строит график. Даты считаются от «сейчас».
// В итоге finalGrades.retakeAt заполнен только там, где есть выпущенное направление без результата.
import { and, asc, eq, gte, inArray, isNotNull, like, lt, ne, sql } from "drizzle-orm";
import { db } from "../client";
import * as s from "../schema";
import { GROUPS } from "./data";
import { getSemester, isHoliday, semesterNumber } from "@/lib/academic";
import type { Mark } from "@/lib/grades";
import { referralNumber, RETAKE_RULES } from "@/lib/retakes";
import { addDays, addMinutes, formatDateTime, mskDate, mskParts, startOfMskDay, WEEKDAYS_SHORT } from "@/lib/time";
import { gradeText } from "@/lib/notify-text";
import { DISCIPLINE_EN } from "./english";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Префикс событий заявок, которые пишет выпуск направлений (и сид): по нему их находит очистка. */
const EVENT_PREFIX = "Направление на пересдачу № ";
const DEMO_TIMUR = "student.timur";

type Result = { status: "passed" | "failed"; mark: Mark; points: number };
type Plan = {
  group: string;
  semester: number;
  discipline: string;
  /** сколько студентов «массовки» с долгом */
  fillers: number;
  timur?: boolean;
  /** попытка в зачётке: 1, долг после сессии; 2, уже не сдали одну пересдачу */
  fgAttempt?: 1 | 2;
  session?:
    | { kind: "published"; attempt: 2 | 3; days: [number, number]; publishedHoursAgo: number }
    | { kind: "draft"; attempt: 2; days: [number, number] }
    | { kind: "past"; attempt: 2; daysAgo: [number, number]; results: (Result | null)[] };
};

// Сюжет: у МЭО (staff.meo) выпущенная пересдача с Тимуром, черновик и долг без даты;
// у МО (виден staff.office) прошедшая пересдача с результатами, комиссия и долг по зачёту без даты.
const PLAN: Plan[] = [
  { group: "МЭО-212", semester: 2, discipline: "Математический анализ II", fillers: 2, timur: true, session: { kind: "published", attempt: 2, days: [9, 12], publishedHoursAgo: 2 } },
  { group: "МЭО-212", semester: 2, discipline: "Микроэкономика", fillers: 3, session: { kind: "draft", attempt: 2, days: [11, 14] } },
  { group: "МЭО-212", semester: 2, discipline: "Экономическая история", fillers: 2 },
  {
    group: "МО-305",
    semester: 4,
    discipline: "Мировая политика",
    fillers: 3,
    session: {
      kind: "past",
      attempt: 2,
      daysAgo: [3, 7],
      results: [{ status: "passed", mark: "4", points: 78 }, { status: "failed", mark: "2", points: 52 }, null],
    },
  },
  { group: "МО-305", semester: 4, discipline: "Регионоведение: Ближний Восток", fillers: 2, fgAttempt: 2, session: { kind: "published", attempt: 3, days: [12, 14], publishedHoursAgo: 50 } },
  { group: "МО-305", semester: 4, discipline: "Основы дипломатической службы", fillers: 2 },
];

/** Предпочтительное время начала: после пар, потом днём */
const TIMES: [number, number][] = [
  [16, 15],
  [14, 35],
  [12, 55],
  [17, 55],
  [10, 40],
];

function hashStr(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return Math.abs(h);
}

const short = (p: { lastName: string; firstName: string; middleName: string | null }) => `${p.lastName} ${p.firstName[0]}.${p.middleName ? ` ${p.middleName[0]}.` : ""}`;
const overlaps = (a0: Date, a1: Date, b0: Date, b1: Date) => a0 < b1 && b0 < a1;
const isWorking = (d: Date) => mskParts(d).wd < 5 && !isHoliday(d);

/** Дата сессии семестра, который был `back` семестров назад (как в index.ts) */
function pastSessionDate(now: Date, back: number) {
  const sem = getSemester(now);
  const abs = sem.academicYear * 2 + (sem.kind === "autumn" ? 0 : 1) - back;
  const year = Math.floor(abs / 2);
  return abs % 2 === 0 ? mskDate(year + 1, 0, 18, 12) : mskDate(year + 1, 5, 15, 12);
}

type Taken = { startsAt: Date; room: string; groupId: string; teacherId: string };

/** Первый рабочий день из окна и время из TIMES, когда у группы и преподавателя нет пар, и свободная аудитория группы. */
async function findSlot(tx: Tx, o: { groupId: string; teacherId: string; rooms: string[]; offsets: number[]; today: Date; taken: Taken[] }) {
  const days = o.offsets.map((n) => addDays(o.today, n)).filter(isWorking);
  if (!days.length) days.push(addDays(o.today, o.offsets[0]));
  const from = days.reduce((a, d) => (d < a ? d : a), days[0]);
  const to = addDays(days.reduce((a, d) => (d > a ? d : a), days[0]), 1);
  const lessons = await tx
    .select({ startsAt: s.lessons.startsAt, endsAt: s.lessons.endsAt, room: s.lessons.room, groupId: s.courses.groupId, teacherId: s.courses.teacherId })
    .from(s.lessons)
    .innerJoin(s.courses, eq(s.courses.id, s.lessons.courseId))
    .where(and(gte(s.lessons.startsAt, from), lt(s.lessons.startsAt, to), ne(s.lessons.status, "cancelled")));
  for (const d of days) {
    const p = mskParts(d);
    for (const [h, m] of TIMES) {
      const startsAt = mskDate(p.y, p.m, p.d, h, m);
      const endsAt = addMinutes(startsAt, RETAKE_RULES.durationMin);
      const people = (x: { groupId: string | null; teacherId: string }) => x.groupId === o.groupId || x.teacherId === o.teacherId;
      if (lessons.some((l) => people(l) && overlaps(l.startsAt, l.endsAt, startsAt, endsAt))) continue;
      if (o.taken.some((t) => people(t) && overlaps(t.startsAt, addMinutes(t.startsAt, RETAKE_RULES.durationMin), startsAt, endsAt))) continue;
      const room = o.rooms.find(
        (r) =>
          !lessons.some((l) => l.room === r && overlaps(l.startsAt, l.endsAt, startsAt, endsAt)) &&
          !o.taken.some((t) => t.room === r && overlaps(t.startsAt, addMinutes(t.startsAt, RETAKE_RULES.durationMin), startsAt, endsAt)),
      );
      if (room) return { startsAt, room };
    }
  }
  const p = mskParts(days[0]);
  return { startsAt: mskDate(p.y, p.m, p.d, 16, 15), room: o.rooms[0] ?? "1005" };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export async function seedRetakes(now: Date = new Date()) {
  const today = startOfMskDay(now);
  const summary = await db.transaction(async (tx) => {
    // ── 1. Очистка: всё, что относится к пересдачам ──
    // Заявления «Пересдача», закрытые выпуском направлений: убираем событие и возвращаем прежний статус
    const closed = await tx
      .select({ requestId: s.requestEvents.requestId })
      .from(s.requestEvents)
      .innerJoin(s.requests, eq(s.requests.id, s.requestEvents.requestId))
      .where(and(eq(s.requests.type, "retake"), like(s.requestEvents.message, `${EVENT_PREFIX}%`)));
    const closedIds = [...new Set(closed.map((r) => r.requestId))];
    if (closedIds.length) {
      await tx.delete(s.requestEvents).where(and(inArray(s.requestEvents.requestId, closedIds), like(s.requestEvents.message, `${EVENT_PREFIX}%`)));
      for (const id of closedIds) {
        const [last] = await tx
          .select({ status: s.requestEvents.status, createdAt: s.requestEvents.createdAt })
          .from(s.requestEvents)
          .where(and(eq(s.requestEvents.requestId, id), isNotNull(s.requestEvents.status)))
          .orderBy(sql`${s.requestEvents.createdAt} desc`)
          .limit(1);
        if (last?.status) await tx.update(s.requests).set({ status: last.status, updatedAt: last.createdAt }).where(eq(s.requests.id, id));
      }
    }
    // Уведомления со ссылкой на направление ведут в никуда после удаления направлений
    await tx.delete(s.notifications).where(like(s.notifications.link, "/grades/retakes/%"));
    await tx.update(s.finalGrades).set({ retakeAt: null, retakeRoom: null }).where(sql`${s.finalGrades.id} in (select final_grade_id from ${s.retakeReferrals} where final_grade_id is not null)`);
    await tx.delete(s.retakeSessions);

    // ── 2. Справочники ──
    const groupRows = await tx.select({ id: s.groups.id, code: s.groups.code, course: s.groups.course }).from(s.groups).where(inArray(s.groups.code, [...new Set(PLAN.map((p) => p.group))]));
    const groupBy = new Map(groupRows.map((g) => [g.code, g]));
    const staffRows = await tx
      .select({ id: s.staff.id, facultyId: s.staff.facultyId, firstName: s.staff.firstName, lastName: s.staff.lastName, login: s.users.login })
      .from(s.staff)
      .innerJoin(s.users, eq(s.users.id, s.staff.userId));
    const officeStaff = staffRows.find((x) => x.facultyId === null) ?? staffRows[0];
    /** Учебный офис факультета группы; у МО своего сотрудника в демо нет, работает единый студенческий офис */
    const staffFor = (groupCode: string) => staffRows.find((x) => x.facultyId && GROUPS.find((g) => g.code === groupCode)?.facultyId === x.facultyId) ?? officeStaff;
    const teacherRows = await tx.select().from(s.teachers).orderBy(asc(s.teachers.lastName));
    // в комиссию третьей попытки зовём преподавателей профильных (не языковых) дисциплин
    const profile = new Set(
      (await tx.selectDistinct({ id: s.courses.teacherId }).from(s.courses).where(eq(s.courses.isLanguage, false))).map((x) => x.id),
    );

    const taken: Taken[] = [];
    const pendingRefs: { sessionId: string; publishedAt: Date; studentId: string; userId: string; fgId: string; startsAt: Date; room: string; discipline: string; commission: string[]; result: Result | null; demo: boolean }[] = [];
    const out = { debts: 0, sessions: 0, referrals: 0, timurReferral: null as string | null, timurDate: null as Date | null };

    for (const plan of PLAN) {
      const g = groupBy.get(plan.group);
      if (!g) continue;
      const gData = GROUPS.find((x) => x.code === plan.group);
      const [course] = await tx
        .select({ id: s.courses.id, teacherId: s.courses.teacherId, controlType: s.courses.controlType })
        .from(s.courses)
        .innerJoin(s.disciplines, eq(s.disciplines.id, s.courses.disciplineId))
        .where(and(eq(s.courses.groupId, g.id), eq(s.courses.semester, plan.semester), eq(s.disciplines.name, plan.discipline)));
      if (!course) continue;
      const teacher = teacherRows.find((t) => t.id === course.teacherId)!;

      // ── 3. Долги по плану: всегда одни и те же студенты и баллы ──
      const students = await tx
        .select({ id: s.students.id, userId: s.students.userId, login: s.users.login, fgId: s.finalGrades.id })
        .from(s.students)
        .innerJoin(s.users, eq(s.users.id, s.students.userId))
        .innerJoin(s.finalGrades, and(eq(s.finalGrades.studentId, s.students.id), eq(s.finalGrades.courseId, course.id)))
        .where(eq(s.students.groupId, g.id));
      const fillers = students
        .filter((x) => !x.login.startsWith("student."))
        .sort((a, b) => hashStr(`${a.login}|${plan.discipline}`) - hashStr(`${b.login}|${plan.discipline}`) || a.login.localeCompare(b.login))
        .slice(0, plan.fillers);
      const timur = plan.timur ? students.find((x) => x.login === DEMO_TIMUR) : undefined;
      const debtors = [...(timur ? [timur] : []), ...fillers];

      const back = semesterNumber(g.course, getSemester(now).kind) - plan.semester;
      const gradedBase = pastSessionDate(now, back);
      const fail: Mark = course.controlType === "credit" ? "fail" : "2";
      for (const d of debtors) {
        const isTimur = d.login === DEMO_TIMUR;
        await tx
          .update(s.finalGrades)
          .set({
            mark: fail,
            // у Тимура те же 48 баллов, что ставит index.ts
            points: isTimur ? 48 : 38 + (hashStr(`${d.login}|${plan.discipline}|p`) % 20),
            attempt: plan.fgAttempt ?? 1,
            gradedAt: isTimur ? undefined : addDays(gradedBase, hashStr(`${d.login}|${plan.discipline}|d`) % 10),
            retakeAt: null,
            retakeRoom: null,
          })
          .where(eq(s.finalGrades.id, d.fgId));
      }
      out.debts += debtors.length;
      if (!plan.session) continue;

      // ── 4. Пересдача ──
      const ses = plan.session;
      const rooms = gData ? [...gData.rooms.seminar, ...gData.rooms.lang] : [];
      const offsets = ses.kind === "past" ? range(ses.daysAgo[0], ses.daysAgo[1]).map((n) => -n) : range(ses.days[0], ses.days[1]);
      const slot = await findSlot(tx, { groupId: g.id, teacherId: course.teacherId, rooms, offsets, today, taken });
      taken.push({ ...slot, groupId: g.id, teacherId: course.teacherId });

      const others = teacherRows.filter((t) => t.id !== teacher.id && profile.has(t.id)).sort((a, b) => hashStr(`${a.lastName}|${plan.discipline}`) - hashStr(`${b.lastName}|${plan.discipline}`));
      const commission = ses.attempt === 3 ? [short(teacher), ...others.slice(0, 2).map(short)] : [short(teacher)];
      const publishedAt =
        ses.kind === "draft" ? null : ses.kind === "past" ? addDays(slot.startsAt, -8) : addMinutes(now, -ses.publishedHoursAgo * 60);
      const author = staffFor(plan.group);
      const [row] = await tx
        .insert(s.retakeSessions)
        .values({
          courseId: course.id,
          attempt: ses.attempt,
          startsAt: slot.startsAt,
          room: slot.room,
          commission,
          note: ses.attempt === 3 ? "Комиссионная пересдача, при себе зачётная книжка" : null,
          createdByStaffId: author.id,
          publishedAt,
          createdAt: publishedAt ? addDays(publishedAt, -1) : addMinutes(now, -3 * 60),
        })
        .returning({ id: s.retakeSessions.id });
      out.sessions++;
      if (!publishedAt) continue;
      debtors.forEach((d, i) =>
        pendingRefs.push({
          sessionId: row.id,
          publishedAt,
          studentId: d.id,
          userId: d.userId,
          fgId: d.fgId,
          startsAt: slot.startsAt,
          room: slot.room,
          discipline: plan.discipline,
          commission,
          result: ses.kind === "past" ? (ses.results[i] ?? null) : null,
          demo: d.login === DEMO_TIMUR,
        }),
      );
    }

    // ── 5. Направления: номера по порядку выпуска за год ──
    pendingRefs.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.sessionId.localeCompare(b.sessionId));
    const seqByYear = new Map<number, number>();
    const notifications: (typeof s.notifications.$inferInsert)[] = [];
    for (const r of pendingRefs) {
      const year = mskParts(r.publishedAt).y;
      const n = (seqByYear.get(year) ?? 0) + 1;
      seqByYear.set(year, n);
      const number = referralNumber(year, n);
      const status = r.result?.status ?? "issued";
      const [ref] = await tx
        .insert(s.retakeReferrals)
        .values({
          retakeSessionId: r.sessionId,
          studentId: r.studentId,
          finalGradeId: r.fgId,
          number,
          status,
          resultMark: r.result?.mark ?? null,
          resultPoints: r.result?.points ?? null,
          createdAt: r.publishedAt,
          updatedAt: r.result ? addMinutes(r.startsAt, 120) : r.publishedAt,
        })
        .returning({ id: s.retakeReferrals.id });
      out.referrals++;

      if (!r.result) {
        await tx.update(s.finalGrades).set({ retakeAt: r.startsAt, retakeRoom: r.room }).where(eq(s.finalGrades.id, r.fgId));
      } else if (r.result.status === "passed") {
        await tx.update(s.finalGrades).set({ mark: r.result.mark, points: r.result.points, attempt: 2, gradedAt: r.startsAt }).where(eq(s.finalGrades.id, r.fgId));
      } else {
        await tx.update(s.finalGrades).set({ attempt: 2, points: r.result.points }).where(eq(s.finalGrades.id, r.fgId));
      }

      const when = `${WEEKDAYS_SHORT[mskParts(r.startsAt).wd].toLowerCase()}, ${formatDateTime(r.startsAt)}`;
      notifications.push({
        userId: r.userId,
        kind: "grade",
        ...gradeText.referral({ ru: r.discipline, en: DISCIPLINE_EN[r.discipline] }, r.startsAt, r.room, number, r.commission),
        link: `/grades/retakes/${ref.id}`,
        important: true,
        createdAt: r.publishedAt,
        readAt: r.demo || r.startsAt > now ? null : addMinutes(r.publishedAt, 40),
      });

      // ── 6. Тимур: заявление «Пересдача» по этой дисциплине закрывается выпуском, как в кабинете ──
      if (r.demo) {
        out.timurReferral = number;
        out.timurDate = r.startsAt;
        const [courseRow] = await tx.select({ courseId: s.retakeSessions.courseId }).from(s.retakeSessions).where(eq(s.retakeSessions.id, r.sessionId));
        const reqs = await tx
          .select({ id: s.requests.id })
          .from(s.requests)
          .where(
            and(
              eq(s.requests.studentId, r.studentId),
              eq(s.requests.type, "retake"),
              inArray(s.requests.status, ["submitted", "in_review", "needs_info", "in_progress", "ready"]),
              sql`${s.requests.fields}->>'course' = ${courseRow.courseId}`,
            ),
          );
        const author = staffFor("МЭО-212");
        for (const q of reqs) {
          await tx.update(s.requests).set({ status: "completed", updatedAt: r.publishedAt }).where(eq(s.requests.id, q.id));
          await tx.insert(s.requestEvents).values({
            requestId: q.id,
            status: "completed",
            message: `${EVENT_PREFIX}${number} выпущено: ${when}, ауд. ${r.room}. Оно в разделе «Учёба», вкладка «Сессия».`,
            actor: "staff",
            actorName: `${author.firstName} ${author.lastName}`,
            createdAt: r.publishedAt,
          });
        }
      }
    }
    if (notifications.length) await tx.insert(s.notifications).values(notifications);

    // ── 7. Согласование: дата пересдачи в зачётке только у выпущенного направления без результата ──
    // (если index.ts когда-нибудь начнёт сам ставить retakeAt для долгов, здесь это выравнивается)
    await tx.execute(sql`
      update ${s.finalGrades} set retake_at = null, retake_room = null
      where retake_at is not null and id not in (
        select r.final_grade_id from ${s.retakeReferrals} r
        join ${s.retakeSessions} rs on rs.id = r.retake_session_id
        where r.status = 'issued' and rs.published_at is not null and r.final_grade_id is not null
      )`);

    return out;
  });

  console.log(
    `✓ Пересдачи: долгов ${summary.debts}, пересдач ${summary.sessions}, направлений ${summary.referrals}` +
      (summary.timurReferral && summary.timurDate ? `; Тимур: № ${summary.timurReferral} на ${formatDateTime(summary.timurDate)}` : ""),
  );
  return summary;
}
