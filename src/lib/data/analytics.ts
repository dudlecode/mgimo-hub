import "server-only";
// Аналитика кабинета сотрудника. Область видимости: staff.facultyId (null = все факультеты).
// Наружу отдаются только агрегаты: числа по типам, неделям, факультетам и группам, без ФИО и id студентов.
// «Университет в среднем» для сотрудника факультета, тоже только агрегат.
import { and, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { requireStaff } from "@/lib/auth/dal";
import { getSemester, isHoliday } from "@/lib/academic";
import { GRADE_RULES } from "@/lib/grades";
import { getRequestType, REQUEST_TYPES } from "@/lib/requests/catalog";
import { addDays, DAY_MS, formatDayMonthShort, mskParts, startOfMskDay, startOfMskWeek } from "@/lib/time";
import { formatPoints } from "@/lib/utils";

// ───────────── Период ─────────────

export type PeriodKey = "4w" | "8w" | "sem";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "4w", label: "4 недели" },
  { key: "8w", label: "8 недель" },
  { key: "sem", label: "Семестр" },
];
export const DEFAULT_PERIOD: PeriodKey = "8w";

export function parsePeriod(v: unknown): PeriodKey {
  return v === "4w" || v === "8w" || v === "sem" ? v : DEFAULT_PERIOD;
}

function periodStart(period: PeriodKey, now: Date): Date {
  const week = startOfMskWeek(now);
  if (period === "4w") return addDays(week, -3 * 7);
  if (period === "8w") return addDays(week, -7 * 7);
  const sem = getSemester(now);
  return sem.start < now ? startOfMskDay(sem.start) : addDays(week, -7 * 7);
}

// ───────────── Заявки: сырьё для агрегатов ─────────────

type ReqRow = {
  type: string;
  delivery: "electronic" | "paper";
  facultyId: string;
  created: number; // мс
  due: number;
  submitted: number | null;
  ready: number | null;
  closed: number | null; // первое ready или rejected
  hadInfo: boolean;
};

const ev = s.requestEvents;
const epoch = (x: SQL) => sql<number | null>`(extract(epoch from ${x}) * 1000)::float8`;

async function loadRequests(start: Date, facultyId: string | null): Promise<ReqRow[]> {
  const rows = await db
    .select({
      type: s.requests.type,
      delivery: s.requests.delivery,
      facultyId: s.groups.facultyId,
      created: epoch(sql`${s.requests.createdAt}`),
      due: epoch(sql`${s.requests.dueAt}`),
      submitted: epoch(sql`min(${ev.createdAt}) filter (where ${ev.status} = 'submitted')`),
      ready: epoch(sql`min(${ev.createdAt}) filter (where ${ev.status} = 'ready')`),
      closed: epoch(sql`min(${ev.createdAt}) filter (where ${ev.status} in ('ready', 'rejected'))`),
      hadInfo: sql<boolean>`coalesce(bool_or(${ev.status} = 'needs_info'), false)`,
    })
    .from(s.requests)
    .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
    .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
    .leftJoin(ev, eq(ev.requestId, s.requests.id))
    .where(and(facultyId ? eq(s.groups.facultyId, facultyId) : undefined, or(gte(s.requests.createdAt, start), gte(s.requests.updatedAt, start))))
    .groupBy(s.requests.id, s.groups.facultyId);
  return rows.map((r) => ({ ...r, created: r.created ?? 0, due: r.due ?? 0 }));
}

// ───────────── Статистика ─────────────

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const pct = (part: number, total: number) => (total > 0 ? (100 * part) / total : null);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** «из 21 студента», «из 25 студентов»: после «из» родительный падеж */
const ofN = (n: number, one: string, many: string) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;
const HOUR = 3_600_000;

/** Время обработки, от события submitted до первого ready, ч */
const hoursOf = (r: ReqRow) => (r.ready === null ? null : (r.ready - (r.submitted ?? r.created)) / HOUR);

/** Типы, где студент выбирает между электронной и бумажной справкой */
const CHOICE_TYPES = new Set(REQUEST_TYPES.filter((t) => t.delivery.includes("electronic") && t.delivery.includes("paper")).map((t) => t.slug));

function workingDays(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let d = startOfMskDay(from); d <= to; d = addDays(d, 1)) if (mskParts(d).wd < 5 && !isHoliday(d)) out.push(String(d.getTime()));
  return out;
}

/** Рабочий день, когда офис увидит заявку: выходные и праздники переносятся на ближайший рабочий. */
function officeDayKey(ms: number): string {
  let d = startOfMskDay(new Date(ms));
  for (let i = 0; i < 10 && (mskParts(d).wd >= 5 || isHoliday(d)); i++) d = addDays(d, 1);
  return String(d.getTime());
}

export type OfficeAxis = "speed" | "onTime" | "noInfo" | "electronic" | "load";
export type OfficeScore = { value: number | null; note: string };
export type OfficeScores = { n: number } & Record<OfficeAxis, OfficeScore>;

/*
 * Оси «паучьей» диаграммы качества работы офиса, каждая 0..100, больше = лучше.
 * Считаются по заявкам, поданным за период (R); D = заявки из R, дошедшие до «Готова».
 *
 *   Скорость          = 100 × (1 − min(1, медиана по D от (t_ready − t_submitted) / (due_at − t_submitted)))
 *                       то есть какая часть отведённого срока в типичной заявке осталась в запасе.
 *                       Нормирование на срок делает сравнимыми справку на 1 день и перезачёт на 10.
 *   Соблюдение сроков = 100 × |{r ∈ D : t_ready ≤ due_at}| / |D|
 *   Без уточнений     = 100 × |{r ∈ R : не было статуса needs_info}| / |R|
 *   Электронно        = 100 × доля delivery = electronic среди заявок R тех типов, где есть выбор
 *                       (справка об обучении, для посольства, о стипендии, выписка)
 *   Нагрузка в норме  = 100 × доля рабочих дней периода, когда поступило не больше
 *                       max(3, 1,5 × среднего потока в рабочий день); заявки выходных относятся
 *                       к ближайшему рабочему дню, ведь офис увидит их именно тогда.
 */
function officeScores(rows: ReqRow[], from: Date, now: Date): OfficeScores {
  const R = rows.filter((r) => r.created >= from.getTime());
  const D = R.filter((r) => r.ready !== null);

  const ratios = D.map((r) => {
    const start = r.submitted ?? r.created;
    const window = Math.max(HOUR, r.due - start);
    return Math.max(0, (r.ready! - start) / window);
  });
  const medRatio = median(ratios);
  const onTime = D.filter((r) => r.ready! <= r.due).length;
  const noInfo = R.filter((r) => !r.hadInfo).length;
  const choice = R.filter((r) => CHOICE_TYPES.has(r.type));
  const electronic = choice.filter((r) => r.delivery === "electronic").length;

  const days = workingDays(from, now);
  const perDay = new Map(days.map((d) => [d, 0]));
  for (const r of R) {
    const k = officeDayKey(r.created);
    if (perDay.has(k)) perDay.set(k, perDay.get(k)! + 1);
  }
  const avg = days.length ? R.length / days.length : 0;
  const limit = Math.max(3, 1.5 * avg);
  const calmDays = [...perDay.values()].filter((n) => n <= limit).length;

  const fmt = (x: number) => Math.round(x);
  return {
    n: R.length,
    speed: { value: medRatio === null ? null : 100 * (1 - clamp01(medRatio)), note: medRatio === null ? "нет готовых заявок" : `типичная заявка занимает ${fmt(100 * clamp01(medRatio))}\u00a0% срока` },
    onTime: { value: pct(onTime, D.length), note: `${onTime} из ${D.length} готовы в срок` },
    noInfo: { value: pct(noInfo, R.length), note: `${noInfo} из ${R.length} без уточнений` },
    electronic: { value: pct(electronic, choice.length), note: `${electronic} из ${choice.length} электронно` },
    load: { value: pct(calmDays, days.length), note: `${calmDays} из ${ofN(days.length, "рабочего дня", "рабочих дней")} без всплеска` },
  };
}

// ───────────── Учёба: показатели групп за текущий семестр ─────────────

export type GroupAxis = "result" | "tests" | "seminars" | "noDebt" | "activity" | "attendance";
export type GroupStats = {
  key: string;
  label: string;
  students: number;
} & Record<GroupAxis, OfficeScore>;

/*
 * Оси «паучьей» диаграммы успеваемости, каждая 0..100, считаются по студентам группы
 * и проверенным контрольным точкам дисциплин текущего семестра группы:
 *
 *   Результат     = 100 × Σ баллов / Σ максимумов по всем проверенным точкам
 *   Контрольные   = доля работ вида test, где набрано не меньше 60 % максимума
 *   Семинары      = 100 × Σ баллов / Σ максимумов по точкам вида seminar
 *   Посещаемость  = 100 × Σ баллов / Σ максимумов по точкам вида attendance
 *                   (выставляется в конце семестра; пока отметок нет, ось не показывается)
 *   Без долгов    = доля студентов без «неуд.» и «не зачтено» в зачётке
 *   Активность    = средняя надбавка за активность / максимум надбавки (5 %) × 100
 */
type Acc = { students: number; debtors: number; bonusSum: number; pts: number; max: number; tests: number; testsPassed: number; semPts: number; semMax: number; attPts: number; attMax: number };
const emptyAcc = (): Acc => ({ students: 0, debtors: 0, bonusSum: 0, pts: 0, max: 0, tests: 0, testsPassed: 0, semPts: 0, semMax: 0, attPts: 0, attMax: 0 });

function groupStats(key: string, label: string, a: Acc): GroupStats {
  const r1 = (x: number) => formatPoints(Math.round(x * 10) / 10);
  const bonusAvg = a.students ? a.bonusSum / a.students : 0;
  return {
    key,
    label,
    students: a.students,
    result: { value: pct(a.pts, a.max), note: `${r1(a.pts)} из ${ofN(a.max, "балла", "баллов")}` },
    tests: { value: pct(a.testsPassed, a.tests), note: `${a.testsPassed} из ${ofN(a.tests, "работы", "работ")} от 60\u00a0%` },
    seminars: { value: pct(a.semPts, a.semMax), note: `${r1(a.semPts)} из ${ofN(a.semMax, "балла", "баллов")}` },
    attendance: { value: pct(a.attPts, a.attMax), note: a.attMax ? `${r1(a.attPts)} из ${ofN(a.attMax, "балла", "баллов")}` : "отметок пока нет" },
    noDebt: { value: pct(a.students - a.debtors, a.students), note: `${a.students - a.debtors} из ${ofN(a.students, "студента", "студентов")}` },
    activity: { value: a.students ? (100 * Math.min(bonusAvg, GRADE_RULES.activityBonusMax)) / GRADE_RULES.activityBonusMax : null, note: `в среднем ${r1(bonusAvg)}\u00a0% из ${GRADE_RULES.activityBonusMax}` },
  };
}

async function loadGroupAccs(): Promise<Map<string, Acc>> {
  const sem = getSemester();
  const semOffset = sem.kind === "autumn" ? 1 : 2;
  const [people, marks] = await Promise.all([
    db
      .select({
        groupId: s.students.groupId,
        students: sql<number>`count(*)::int`,
        bonusSum: sql<number>`coalesce(sum(${s.students.activityBonus}), 0)::float8`,
        // в запросе к одной таблице drizzle пишет колонки без имени таблицы, поэтому "students"."id" явно
        debtors: sql<number>`count(*) filter (where exists (select 1 from ${s.finalGrades} fg where fg.student_id = "students"."id" and fg.mark in ('2', 'fail')))::int`,
      })
      .from(s.students)
      .groupBy(s.students.groupId),
    db
      .select({
        groupId: s.students.groupId,
        kind: s.assessments.kind,
        pts: sql<number>`coalesce(sum(${s.scores.points}), 0)::float8`,
        max: sql<number>`coalesce(sum(${s.assessments.maxPoints}), 0)::int`,
        n: sql<number>`count(*)::int`,
        passed: sql<number>`count(*) filter (where ${s.scores.points} >= 0.6 * ${s.assessments.maxPoints})::int`,
      })
      .from(s.scores)
      .innerJoin(s.assessments, eq(s.assessments.id, s.scores.assessmentId))
      .innerJoin(s.courses, eq(s.courses.id, s.assessments.courseId))
      .innerJoin(s.students, eq(s.students.id, s.scores.studentId))
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .where(sql`${s.courses.semester} = (${s.groups.course} - 1) * 2 + ${semOffset}`)
      .groupBy(s.students.groupId, s.assessments.kind),
  ]);
  const accs = new Map<string, Acc>();
  const get = (id: string) => {
    let a = accs.get(id);
    if (!a) accs.set(id, (a = emptyAcc()));
    return a;
  };
  for (const p of people) Object.assign(get(p.groupId), { students: p.students, bonusSum: p.bonusSum, debtors: p.debtors });
  for (const m of marks) {
    const a = get(m.groupId);
    a.pts += m.pts;
    a.max += m.max;
    if (m.kind === "test") {
      a.tests += m.n;
      a.testsPassed += m.passed;
    }
    if (m.kind === "seminar") {
      a.semPts += m.pts;
      a.semMax += m.max;
    }
    if (m.kind === "attendance") {
      a.attPts += m.pts;
      a.attMax += m.max;
    }
  }
  return accs;
}

function sumAccs(list: Acc[]): Acc {
  const t = emptyAcc();
  for (const a of list) for (const k of Object.keys(t) as (keyof Acc)[]) t[k] += a[k];
  return t;
}

// ───────────── Главная функция страницы ─────────────

export type WeekPoint = { label: string; range: string; inflow: number; processed: number; inPeriod: boolean };
export type TypeStat = { slug: string; title: string; count: number; medianH: number | null; meanH: number | null; onTime: number | null };

export async function getStaffAnalytics(period: PeriodKey) {
  const { staff } = await requireStaff();
  const fid = staff.facultyId;
  const now = new Date();
  const from = periodStart(period, now);
  const thisWeek = startOfMskWeek(now);
  const chartFrom = new Date(Math.min(startOfMskWeek(from).getTime(), addDays(thisWeek, -7 * 7).getTime()));
  const loadFrom = new Date(Math.min(chartFrom.getTime(), from.getTime()));

  const [rows, uniRows, faculties, groups, accs, [{ overdue }]] = await Promise.all([
    loadRequests(loadFrom, fid),
    fid ? loadRequests(from, null) : Promise.resolve(null),
    db.select({ id: s.faculties.id, code: s.faculties.code }).from(s.faculties),
    db
      .select({ id: s.groups.id, code: s.groups.code, facultyId: s.groups.facultyId })
      .from(s.groups)
      .where(fid ? eq(s.groups.facultyId, fid) : undefined)
      .orderBy(s.groups.code),
    loadGroupAccs(),
    db
      .select({ overdue: sql<number>`count(*)::int` })
      .from(s.requests)
      .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .where(and(fid ? eq(s.groups.facultyId, fid) : undefined, lt(s.requests.dueAt, now), inArray(s.requests.status, ["submitted", "in_review", "in_progress"]))),
  ]);

  const inPeriod = rows.filter((r) => r.created >= from.getTime());
  const done = inPeriod.filter((r) => r.ready !== null);
  const hours = done.map(hoursOf).filter((h): h is number => h !== null);

  // Ключевые числа
  const onTimeCount = done.filter((r) => r.ready! <= r.due).length;
  const kpi = {
    total: inPeriod.length,
    medianHours: median(hours),
    meanHours: mean(hours),
    onTime: pct(onTimeCount, done.length),
    onTimeCount,
    onTimeOf: done.length,
    overdue,
    weeks: Math.max(1, Math.round((now.getTime() - from.getTime()) / (7 * DAY_MS))),
  };

  // Объём по неделям
  const weeks: WeekPoint[] = [];
  for (let w = chartFrom; w <= thisWeek; w = addDays(w, 7)) {
    const end = addDays(w, 7);
    const inWeek = (ms: number | null) => ms !== null && ms >= w.getTime() && ms < end.getTime();
    weeks.push({
      label: formatDayMonthShort(w),
      range: `с ${formatDayMonthShort(w)} по ${formatDayMonthShort(addDays(w, 6))}`,
      inflow: rows.filter((r) => inWeek(r.created)).length,
      processed: rows.filter((r) => inWeek(r.closed)).length,
      inPeriod: end.getTime() > from.getTime(),
    });
  }

  // Типы заявок
  const byType = new Map<string, ReqRow[]>();
  for (const r of inPeriod) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
  const types: TypeStat[] = [...byType.entries()]
    .map(([slug, list]) => {
      const d = list.filter((r) => r.ready !== null);
      const h = d.map(hoursOf).filter((x): x is number => x !== null);
      return { slug, title: getRequestType(slug)?.title ?? slug, count: list.length, medianH: median(h), meanH: mean(h), onTime: pct(d.filter((r) => r.ready! <= r.due).length, d.length) };
    })
    .sort((a, b) => b.count - a.count);

  // Нагрузка: день недели × час подачи (по Москве)
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const r of inPeriod) {
    const p = mskParts(new Date(r.created));
    heat[p.wd][p.h]++;
  }

  // Качество работы офиса: свой факультет против университета или факультеты между собой
  const facultyCode = new Map(faculties.map((f) => [f.id, f.code]));
  const office: { key: string; label: string; scores: OfficeScores }[] = [];
  if (fid) {
    office.push({ key: fid, label: `Офис ${facultyCode.get(fid) ?? ""}`.trim(), scores: officeScores(rows, from, now) });
    if (uniRows) office.push({ key: "uni", label: "Университет в среднем", scores: officeScores(uniRows, from, now) });
  } else {
    const byFac = new Map<string, ReqRow[]>();
    for (const r of rows) byFac.set(r.facultyId, [...(byFac.get(r.facultyId) ?? []), r]);
    for (const [id, list] of [...byFac.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5)) {
      const sc = officeScores(list, from, now);
      if (sc.n >= 5) office.push({ key: id, label: facultyCode.get(id) ?? id, scores: sc });
    }
  }

  // Успеваемость групп
  const groupList: GroupStats[] = groups
    .map((g) => groupStats(g.id, g.code, accs.get(g.id) ?? emptyAcc()))
    .filter((g) => g.students > 0)
    .slice(0, 5);
  if (fid) groupList.push(groupStats("uni", "Университет в среднем", sumAccs([...accs.values()])));
  const hasAttendance = groupList.some((g) => g.attendance.value !== null);

  return {
    scope: staff.faculty ? { kind: "faculty" as const, code: staff.faculty.code } : { kind: "all" as const },
    period: { key: period, from, to: now },
    kpi,
    weeks,
    types,
    heat,
    office,
    groups: groupList,
    hasAttendance,
    semesterLabel: getSemester(now).label,
  };
}

export type StaffAnalytics = Awaited<ReturnType<typeof getStaffAnalytics>>;
