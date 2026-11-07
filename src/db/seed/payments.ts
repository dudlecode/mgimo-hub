// Демо-данные оплаты обучения: договор и график платежей по семестрам для студентов на контракте.
// Идемпотентно: сначала удаляет все записи tuition_payments и свои уведомления, потом заполняет заново.
// Даты строятся от текущего момента, суммы и номера детерминированы (свой ГСЧ с фиксированным зерном).
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "../client";
import { DEMO_STUDENTS } from "./data";
import { getSemester } from "@/lib/academic";
import { addDays, mskDate, mskParts } from "@/lib/time";
import { periodLabel, type SemesterKind } from "@/lib/payments";
import { paymentText } from "@/lib/notify-text";

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

/** Стоимость семестра в 2026/27 по факультетам; прошлые годы дешевле на индексацию */
const SEMESTER_PRICE_2026: Record<string, number> = {
  mo: 358_000,
  meo: 346_000,
  mp: 340_000,
  mj: 322_000,
  mb: 334_000,
  fup: 318_000,
  flmk: 296_000,
  ffe: 330_000,
};
const INDEXATION = 1.055;
const MIN_CONTRACT_FILLERS = 8;
const DEMO_LOGINS = new Set<string>(DEMO_STUDENTS.map((d) => d.login));
const TIMUR = "student.timur";

// Уведомления, которые создают этот модуль и экраны оплаты: при пересоздании графика они устаревают
const SEED_TITLES = ["Скоро срок оплаты", "Просрочена оплата обучения", "Оплата поступила"];

function semesterPrice(facultyId: string, academicYear: number) {
  const base = SEMESTER_PRICE_2026[facultyId] ?? 320_000;
  return Math.round(base / Math.pow(INDEXATION, 2026 - academicYear) / 1000) * 1000;
}

function endOfMskDay(d: Date) {
  const p = mskParts(d);
  return mskDate(p.y, p.m, p.d, 23, 59);
}

/** Момент оплаты: день по Москве со смещением, рабочее время */
function paidMoment(base: Date, dayShift: number, rand: () => number) {
  const p = mskParts(addDays(base, dayShift));
  return mskDate(p.y, p.m, p.d, 9 + Math.floor(rand() * 10), Math.floor(rand() * 60));
}

export async function seedPayments(now: Date = new Date()) {
  const rand = mulberry32(20261107);
  const sem = getSemester(now);
  const curAY = sem.academicYear;

  // ── Сначала убираем своё ──
  await db.delete(s.tuitionPayments);
  await db.delete(s.notifications).where(and(eq(s.notifications.kind, "payment"), eq(s.notifications.link, "/payments"), inArray(s.notifications.title, SEED_TITLES)));

  const load = () =>
    db
      .select({
        id: s.students.id,
        userId: s.students.userId,
        login: s.users.login,
        funding: s.students.funding,
        enrollmentYear: s.students.enrollmentYear,
        facultyId: s.groups.facultyId,
      })
      .from(s.students)
      .innerJoin(s.users, eq(s.users.id, s.students.userId))
      .innerJoin(s.groups, eq(s.groups.id, s.students.groupId))
      .orderBy(asc(s.groups.code), asc(s.students.recordBook));

  // ── Если контрактников в «массовке» мало, переводим часть студентов МО и МЭО на контракт ──
  let all = await load();
  const contractFillers = all.filter((x) => x.funding === "contract" && !DEMO_LOGINS.has(x.login));
  if (contractFillers.length < MIN_CONTRACT_FILLERS) {
    const candidates = all.filter((x) => x.funding !== "contract" && !DEMO_LOGINS.has(x.login));
    candidates.sort((a, b) => Number(b.facultyId === "mo" || b.facultyId === "meo") - Number(a.facultyId === "mo" || a.facultyId === "meo"));
    const toConvert = candidates.slice(0, MIN_CONTRACT_FILLERS + 2 - contractFillers.length).map((x) => x.id);
    if (toConvert.length) await db.update(s.students).set({ funding: "contract" }).where(inArray(s.students.id, toConvert));
    all = await load();
  }

  const contract = all.filter((x) => x.funding === "contract");
  const fillers = contract.filter((x) => !DEMO_LOGINS.has(x.login));

  // ── Сценарии: просрочка у 4 студентов МО и МЭО, отсрочка со сроком в ближайшие две недели у двоих ──
  const moMeo = fillers.filter((x) => x.facultyId === "mo" || x.facultyId === "meo");
  const pickFrom = <T,>(arr: T[], n: number, taken: Set<T>) => {
    const pool = arr.filter((x) => !taken.has(x));
    const out: T[] = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    out.forEach((x) => taken.add(x));
    return out;
  };
  const taken = new Set<(typeof fillers)[number]>();
  const overdueMo = pickFrom(moMeo.filter((x) => x.facultyId === "mo"), 2, taken);
  const overdueMeo = pickFrom(moMeo.filter((x) => x.facultyId === "meo"), 2, taken);
  const overdue = [...overdueMo, ...overdueMeo];
  if (overdue.length < 3) overdue.push(...pickFrom(moMeo, 3 - overdue.length, taken));
  const soonMeo = pickFrom(fillers.filter((x) => x.facultyId === "meo"), 1, taken);
  const soon = [...soonMeo, ...pickFrom(fillers.filter((x) => x.facultyId !== "meo"), 1, taken)];

  // Просрочка разной длины: обычный срок и истёкшие отсрочки; одному напоминали несколько часов назад
  const overdueDue = [null, -36, -17, -4];
  const overdueReminded = [-6 * 24 * 60, null, -5 * 60, null];
  const soonDue = [3, 12];

  const usedContracts = new Set<string>();
  const usedReceipts = new Set<string>();
  const receiptNo = () => {
    let r: string;
    do r = String(100000 + Math.floor(rand() * 900000));
    while (usedReceipts.has(r));
    usedReceipts.add(r);
    return r;
  };

  const rows: (typeof s.tuitionPayments.$inferInsert)[] = [];
  let timurNext: { period: string; amount: number; dueAt: Date } | null = null;

  for (const st of contract) {
    let contractNo: string;
    do contractNo = `Д-${st.enrollmentYear}-${1000 + Math.floor(rand() * 9000)}`;
    while (usedContracts.has(contractNo));
    usedContracts.add(contractNo);

    const isTimur = st.login === TIMUR;
    const overdueIdx = overdue.indexOf(st);
    const soonIdx = soon.indexOf(st);
    const paysYearAhead = !DEMO_LOGINS.has(st.login) && overdueIdx < 0 && soonIdx < 0 && rand() < 0.2;

    // Все семестры с года поступления до текущего учебного года включительно
    const plan: { kind: SemesterKind; ay: number; due: Date }[] = [];
    for (let ay = st.enrollmentYear; ay <= curAY; ay++) {
      plan.push({ kind: "autumn", ay, due: mskDate(ay, 8, 10, 23, 59) });
      // Весенний семестр текущего года: тот же срок, что в дедлайнах деканата (через 40 дней)
      const springDue = ay === curAY && sem.kind === "autumn" ? endOfMskDay(addDays(now, 40)) : mskDate(ay, 11, 15, 23, 59);
      plan.push({ kind: "spring", ay, due: springDue });
    }
    // «Текущий» платёж: последний, чей обычный срок уже наступил
    let currentIdx = -1;
    plan.forEach((p, i) => {
      if (p.due.getTime() <= now.getTime()) currentIdx = i;
    });
    if (currentIdx < 0) currentIdx = 0;

    plan.forEach((p, i) => {
      const period = periodLabel(p.kind, p.ay);
      const amount = semesterPrice(st.facultyId, p.ay);
      let dueAt = p.due;
      let paidAt: Date | null = null;
      let remindedAt: Date | null = null;

      if (i === currentIdx && isTimur) {
        // Отсрочка по заявлению: срок через 9 дней
        dueAt = endOfMskDay(addDays(now, 9));
        timurNext = { period, amount, dueAt };
      } else if (i === currentIdx && overdueIdx >= 0) {
        const shift = overdueDue[overdueIdx % overdueDue.length];
        if (shift !== null) dueAt = endOfMskDay(addDays(now, shift));
        const r = overdueReminded[overdueIdx % overdueReminded.length];
        if (r !== null) remindedAt = new Date(now.getTime() + r * 60_000);
      } else if (i === currentIdx && soonIdx >= 0) {
        dueAt = endOfMskDay(addDays(now, soonDue[soonIdx % soonDue.length]));
      } else if (dueAt.getTime() <= now.getTime()) {
        // Прошлые платежи оплачены: обычно за 1-12 дней до срока, у «массовки» иногда с опозданием
        const late = !DEMO_LOGINS.has(st.login) && rand() < 0.14;
        const shift = late ? 2 + Math.floor(rand() * 18) : -(1 + Math.floor(rand() * 12));
        const candidate = paidMoment(dueAt, shift, rand);
        paidAt = candidate.getTime() < now.getTime() ? candidate : paidMoment(now, -1, rand);
      } else if (paysYearAhead && i > currentIdx) {
        // Часть студентов платит сразу за год: весенний семестр оплачен вместе с осенним
        const autumn = plan[currentIdx];
        const candidate = paidMoment(autumn.due, -(1 + Math.floor(rand() * 8)), rand);
        paidAt = candidate.getTime() < now.getTime() ? candidate : null;
      }

      const createdAt = mskDate(p.ay, 6, 1, 10, 0);
      rows.push({ studentId: st.id, contractNo, period, amount, dueAt, paidAt, receiptNo: paidAt ? receiptNo() : null, remindedAt, createdAt });
    });
  }

  for (let i = 0; i < rows.length; i += 500) await db.insert(s.tuitionPayments).values(rows.slice(i, i + 500));

  // ── Уведомления: Тимуру о близком сроке, «массовке» о напоминаниях учебного офиса ──
  const notes: (typeof s.notifications.$inferInsert)[] = [];
  const timur = contract.find((x) => x.login === TIMUR);
  const tn = timurNext as { period: string; amount: number; dueAt: Date } | null;
  if (timur && tn) {
    notes.push({
      userId: timur.userId,
      kind: "payment",
      ...paymentText.soon(tn.period, tn.amount, tn.dueAt),
      link: "/payments",
      important: true,
      createdAt: new Date(now.getTime() - 2 * 60 * 60_000),
    });
  }
  for (const r of rows) {
    if (!r.remindedAt || r.paidAt) continue;
    const st = contract.find((x) => x.id === r.studentId);
    if (!st) continue;
    notes.push({
      userId: st.userId,
      kind: "payment",
      ...paymentText.overdue(r.period, r.amount, r.dueAt),
      link: "/payments",
      important: true,
      createdAt: r.remindedAt,
    });
  }
  if (notes.length) await db.insert(s.notifications).values(notes);

  const overdueCount = rows.filter((r) => !r.paidAt && r.dueAt.getTime() < now.getTime()).length;
  console.log(`✓ Оплата: ${contract.length} студентов на контракте, ${rows.length} платежей, просрочено ${overdueCount}`);
  return { students: contract.length, payments: rows.length, overdue: overdueCount };
}
