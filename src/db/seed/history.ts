// История заявок за последние 10 недель, для аналитики кабинета сотрудника.
// Только студенты «массовки»: демо-аккаунты (student.anna / timur / leyla) не трогаем.
// Все заявки закрыты (completed / rejected), у каждой правдоподобная цепочка request_events:
// студент подаёт в любое время, сотрудник действует в часы работы офиса, часть заявок с уточнением,
// немного просрочек. Детерминированный ГСЧ: при одинаковом «сейчас» данные одинаковые.
//
//   import { seedHistory } from "./history";
//   await seedHistory();
import { inArray, lt, sql, count } from "drizzle-orm";
import { db } from "../client";
import * as s from "../schema";
import { addWorkingDays, isHoliday } from "@/lib/academic";
import { addDays, addMinutes, dayKey, mskDate, mskParts, MINUTE_MS, startOfMskDay } from "@/lib/time";
import { getRequestType } from "@/lib/requests/catalog";
import { documentNumber, randomVerifyCode } from "@/lib/requests/codes";
import { fullName } from "@/lib/utils";

const DEMO_LOGINS = ["student.anna", "student.timur", "student.leyla"];
const TARGET = 300;
const DAYS_BACK = 70;

// ───────────── ГСЧ ─────────────
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

// ───────────── Профили учебных офисов: у каждого свой «почерк» ─────────────
type Profile = {
  /** медиана доли норматива, которую занимает обработка */
  speed: number;
  /** вероятность явной просрочки */
  lateP: number;
  /** базовая вероятность уточнения */
  infoP: number;
  /** доля электронных там, где есть выбор */
  eShare: number;
  /** медиана задержки до взятия в работу, рабочих минут */
  pickup: number;
};
const PROFILES: Record<string, Profile> = {
  mo: { speed: 0.34, lateP: 0.05, infoP: 0.13, eShare: 0.72, pickup: 70 },
  meo: { speed: 0.26, lateP: 0.02, infoP: 0.2, eShare: 0.6, pickup: 45 },
  flmk: { speed: 0.42, lateP: 0.17, infoP: 0.1, eShare: 0.84, pickup: 110 },
};
const DEFAULT_PROFILE = PROFILES.mo;

// ───────────── Типы: доля в потоке, сезонность, уточнения, отказы ─────────────
type TypeSpec = { slug: string; weight: number; season: (d: Date) => number; info: number; reject: number };
const md = (d: Date) => {
  const p = mskParts(d);
  return (p.m + 1) * 100 + p.d; // 914 = 14 сентября
};
const TYPES: TypeSpec[] = [
  { slug: "study-certificate", weight: 30, season: (d) => (md(d) >= 829 && md(d) <= 915 ? 1.7 : 1), info: 0.5, reject: 0.02 },
  { slug: "embassy-certificate", weight: 9, season: (d) => (md(d) >= 1001 && md(d) <= 1031 ? 1.6 : 1), info: 1.3, reject: 0.03 },
  { slug: "military-certificate", weight: 6, season: (d) => (md(d) <= 920 ? 2.4 : 0.7), info: 0.8, reject: 0.01 },
  { slug: "scholarship-certificate", weight: 9, season: (d) => (md(d) >= 920 && md(d) <= 1020 ? 1.3 : 1), info: 0.7, reject: 0.02 },
  { slug: "transcript", weight: 11, season: (d) => (md(d) >= 1005 && md(d) <= 1025 ? 1.9 : 1), info: 1.1, reject: 0.02 },
  { slug: "individual-plan", weight: 6, season: (d) => (md(d) <= 925 ? 2 : 0.8), info: 2, reject: 0.22 },
  { slug: "academic-leave", weight: 1.5, season: () => 1, info: 2.6, reject: 0.1 },
  { slug: "credit-transfer", weight: 4, season: (d) => (md(d) <= 930 ? 2 : 0.7), info: 2, reject: 0.14 },
  { slug: "financial-aid", weight: 3.5, season: () => 1, info: 1.8, reject: 0.2 },
  { slug: "student-card", weight: 4, season: (d) => (md(d) <= 920 ? 1.5 : 1), info: 0.6, reject: 0.01 },
];

const INFO_MESSAGES: Record<string, string> = {
  "study-certificate": "Уточните, пожалуйста, полное название организации для справки.",
  "embassy-certificate": "Проверьте, пожалуйста, даты поездки: они пересекаются с учебной неделей. Нужна отметка о согласовании?",
  "military-certificate": "Уточните, пожалуйста, полное название военного комиссариата.",
  "scholarship-certificate": "Уточните, пожалуйста, за какие месяцы нужна справка.",
  transcript: "Нужна выписка с печатью или достаточно электронной подписи? Уточните требования принимающего университета.",
  "individual-plan": "Приложите, пожалуйста, справку с места работы или письмо о стажировке.",
  "academic-leave": "Приложите, пожалуйста, медицинское заключение или принесите его в учебный офис.",
  "credit-transfer": "Пришлите, пожалуйста, транскрипт из принимающего университета.",
  "financial-aid": "Приложите, пожалуйста, документы, которые подтверждают ситуацию.",
  "student-card": "Приложите, пожалуйста, фото для нового студенческого билета.",
};
const STUDENT_REPLIES = ["Документ приложен.", "Уточнение внесено, спасибо.", "Добавлено в заявку.", "Ответ в комментарии к заявке.", "Готово, проверьте, пожалуйста."];
const REJECT_MESSAGES: Record<string, string> = {
  "individual-plan": "Для индивидуального плана нужна справка с места работы. Подайте заявку повторно с документом.",
  "financial-aid": "Стипендиальная комиссия не нашла оснований для выплаты. Можно подать повторно с подтверждающими документами.",
  "credit-transfer": "Объём дисциплин не совпадает по кредитам. Обратитесь к куратору программы, он поможет подобрать замену.",
  "academic-leave": "Не хватает подтверждающих документов. Подайте заявление повторно с заключением врачебной комиссии.",
};
const REJECT_DEFAULT = "Такая заявка уже выполнена. Документ доступен в разделе «Заявки».";

const PURPOSES = ["по месту требования", "для работодателя", "в банк", "в органы социальной защиты", "в налоговую инспекцию", "для общежития"];
const ADDRESSEES = ["", "", "ПАО «Демо-Банк»", "ООО «Аналитический центр»", "Управление соцзащиты района (демо)"];
const COUNTRIES = ["Италия", "Франция", "Испания", "Германия", "Китай", "Турция", "Сербия", "ОАЭ"];
const COMMISSARIATS = [
  "Военный комиссариат Гагаринского района (демо)",
  "Военный комиссариат Ломоносовского района (демо)",
  "Военный комиссариат Одинцовского округа (демо)",
];
const UNIVERSITIES = ["Universidad de Salamanca (демо)", "Università Bocconi (демо)", "Sciences Po (демо)", "Онлайн-платформа «Открытое образование»"];

// Интенсивность подачи: день недели (Пн..Вс) и час по Москве
const WD_WEIGHT = [1.25, 1.15, 1.05, 1, 0.85, 0.35, 0.45];
const HOUR_WEIGHT = [0.12, 0.06, 0.03, 0.02, 0.02, 0.03, 0.08, 0.3, 0.6, 1, 1.3, 1.4, 1.2, 1.1, 1.2, 1.1, 1, 0.9, 0.9, 1, 1.1, 1, 0.7, 0.35];

function seasonWeight(d: Date) {
  const x = md(d);
  if (x < 901) return 0.45; // конец августа
  if (x <= 914) return 2; // старт семестра
  if (x <= 930) return 1.2;
  if (x >= 1012 && x <= 1025) return 1.3; // отбор на обмен
  if (x >= 1101 && x <= 1104) return 0.6; // праздники
  return 1;
}

// ───────────── Рабочее время офиса: Пн-Чт 10:00-17:00, Пт 10:00-16:00 ─────────────
function officeWindow(day: Date): [Date, Date] | null {
  const p = mskParts(day);
  if (p.wd >= 5 || isHoliday(day)) return null;
  return [mskDate(p.y, p.m, p.d, 10, 0), mskDate(p.y, p.m, p.d, p.wd === 4 ? 16 : 17, 0)];
}

/** Прибавить рабочие минуты офиса (выходные и ночь пропускаются). */
function addWorkMinutes(from: Date, minutes: number): Date {
  let cur = from;
  let left = Math.max(0, minutes);
  for (let guard = 0; guard < 500; guard++) {
    const day = startOfMskDay(cur);
    const w = officeWindow(day);
    if (w) {
      const start = cur < w[0] ? w[0] : cur;
      if (start < w[1]) {
        const avail = (w[1].getTime() - start.getTime()) / MINUTE_MS;
        if (left <= avail) return addMinutes(start, Math.round(left));
        left -= avail;
      }
    }
    cur = addDays(day, 1);
  }
  return cur;
}

/** Рабочих минут офиса между двумя моментами. */
function workMinutesBetween(a: Date, b: Date): number {
  let total = 0;
  let day = startOfMskDay(a);
  for (let guard = 0; guard < 500 && day < b; guard++) {
    const w = officeWindow(day);
    if (w) {
      const from = Math.max(w[0].getTime(), a.getTime());
      const to = Math.min(w[1].getTime(), b.getTime());
      if (to > from) total += (to - from) / MINUTE_MS;
    }
    day = addDays(day, 1);
  }
  return total;
}

/** Студент отвечает не ночью: ночное время переносим на утро. */
function studentAwake(t: Date, r: () => number): Date {
  const p = mskParts(t);
  if (p.h >= 1 && p.h < 8) return mskDate(p.y, p.m, p.d, 8 + Math.floor(r() * 3), Math.floor(r() * 60));
  return t;
}

type Ev = { status: s.RequestStatus | null; message?: string; actor: "student" | "staff" | "system"; actorName: string; at: Date };

export async function seedHistory(opts: { dryRun?: boolean } = {}): Promise<number> {
  const now = new Date();

  // Повторный запуск не дублирует историю
  const [{ n: oldCount }] = await db.select({ n: count() }).from(s.requests).where(lt(s.requests.createdAt, addDays(now, -20)));
  if (oldCount > 30) {
    console.log(`• История заявок уже есть (${oldCount}), пропуск`);
    return 0;
  }

  const demoUsers = await db.select({ id: s.users.id }).from(s.users).where(inArray(s.users.login, DEMO_LOGINS));
  const demoUserIds = new Set(demoUsers.map((u) => u.id));

  const studentRows = await db
    .select({
      id: s.students.id,
      userId: s.students.userId,
      lastName: s.students.lastName,
      firstName: s.students.firstName,
      middleName: s.students.middleName,
      facultyId: s.groups.facultyId,
      facultyCode: s.faculties.code,
    })
    .from(s.students)
    .innerJoin(s.groups, sql`${s.groups.id} = ${s.students.groupId}`)
    .innerJoin(s.faculties, sql`${s.faculties.id} = ${s.groups.facultyId}`)
    .orderBy(s.students.recordBook);
  const fillers = studentRows.filter((x) => !demoUserIds.has(x.userId));
  if (!fillers.length) {
    console.log("• Нет студентов для истории заявок, пропуск");
    return 0;
  }

  const staffRows = await db.select().from(s.staff).orderBy(s.staff.lastName);
  const office = staffRows.find((x) => x.facultyId === null) ?? staffRows[0];
  if (!office) {
    console.log("• Нет сотрудников для истории заявок, пропуск");
    return 0;
  }
  const handlerFor = (facultyId: string) => staffRows.find((x) => x.facultyId === facultyId) ?? office;
  const staffName = (x: typeof office) => `${x.firstName} ${x.lastName}`;

  const rand = mulberry32(20260828);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  /** логнормальный множитель вокруг 1 */
  const spread = (sigma: number) => Math.exp((rand() + rand() + rand() - 1.5) * sigma);
  const weighted = <T,>(items: readonly T[], w: (x: T) => number): T => {
    const total = items.reduce((a, x) => a + w(x), 0);
    let r = rand() * total;
    for (const x of items) {
      r -= w(x);
      if (r <= 0) return x;
    }
    return items[items.length - 1];
  };

  // Дни окна с весами
  const today = startOfMskDay(now);
  const days: { day: Date; w: number }[] = [];
  for (let i = DAYS_BACK; i >= 1; i--) {
    const day = addDays(today, -i);
    const wd = mskParts(day).wd;
    days.push({ day, w: WD_WEIGHT[wd] * seasonWeight(day) * (isHoliday(day) ? 0.4 : 1) });
  }
  const hours = HOUR_WEIGHT.map((w, h) => ({ h, w }));

  function fieldsFor(slug: string, createdAt: Date): Record<string, string> {
    switch (slug) {
      case "study-certificate":
        return { purpose: pick(PURPOSES), addressee: pick(ADDRESSEES) };
      case "embassy-certificate": {
        const from = addDays(createdAt, 20 + Math.floor(rand() * 40));
        return { country: pick(COUNTRIES), travelFrom: dayKey(from), travelTo: dayKey(addDays(from, 5 + Math.floor(rand() * 10))), purpose: pick(["tourism", "tourism", "internship", "exchange", "conference"]) };
      }
      case "military-certificate":
        return { commissariat: pick(COMMISSARIATS) };
      case "scholarship-certificate":
        return { period: pick(["3", "6", "12"]), purpose: pick(["в органы социальной защиты", "в налоговую инспекцию", "по месту требования"]) };
      case "transcript":
        return { language: rand() < 0.65 ? "en" : "ru", purpose: pick(["exchange", "exchange", "internship", "double-degree", "other"]) };
      case "individual-plan":
        return {
          reason: pick(["work", "work", "internship", "sport", "family"]),
          details: pick([
            "Работаю аналитиком три дня в неделю, могу посещать занятия во вторник и четверг.",
            "Стажировка в консалтинговой компании до конца семестра, свободен после 16:00.",
            "Спортивные сборы сборной по фехтованию, график прилагаю.",
          ]),
        };
      case "academic-leave":
        return { reason: pick(["medical", "family", "other"]), startDate: dayKey(addDays(createdAt, 14)), details: "" };
      case "credit-transfer":
        return { university: pick(UNIVERSITIES), disciplines: pick(["Economía internacional, 6 ECTS, 8,5", "Corporate Finance, 6 ECTS, A\nEU Law, 4 ECTS, B", "Анализ данных, 3 з. е., отлично"]) };
      case "financial-aid":
        return { reason: pick(["family", "medical", "event", "other"]), details: "Сложная ситуация, прошу рассмотреть." };
      case "student-card":
        return { item: pick(["card", "card", "record-book", "both"]), details: pick(["Потерял в метро.", "Билет повреждён.", ""]) };
      default:
        return {};
    }
  }

  type Plan = {
    id: string;
    studentId: string;
    facultyCode: string;
    type: string;
    status: "completed" | "rejected";
    fields: Record<string, string>;
    delivery: "electronic" | "paper";
    copies: number;
    createdAt: Date;
    dueAt: Date;
    readyAt: Date | null;
    staffId: string;
    events: Ev[];
    isDoc: boolean;
  };

  const plans: Plan[] = [];
  const latestClose = addMinutes(now, -30);

  for (let attempt = 0; plans.length < TARGET && attempt < TARGET * 6; attempt++) {
    const { day } = weighted(days, (d) => d.w);
    const { h } = weighted(hours, (x) => x.w);
    const p = mskParts(day);
    const createdAt = mskDate(p.y, p.m, p.d, h, Math.floor(rand() * 60));
    if (createdAt >= now) continue;

    const st = fillers[Math.floor(rand() * fillers.length)];
    const prof = PROFILES[st.facultyId] ?? DEFAULT_PROFILE;
    const spec = weighted(TYPES, (t) => t.weight * t.season(createdAt));
    const def = getRequestType(spec.slug);
    if (!def) continue;

    const handler = handlerFor(st.facultyId);
    const hn = staffName(handler);
    const sn = fullName(st);
    const dueAt = addWorkingDays(createdAt, def.slaDays);
    const slaWork = Math.max(60, workMinutesBetween(createdAt, dueAt));

    const delivery: "electronic" | "paper" =
      def.delivery.length === 1 ? def.delivery[0] : rand() < prof.eShare ? "electronic" : "paper";

    const events: Ev[] = [{ status: "submitted", actor: "student", actorName: sn, at: createdAt }];
    const pickup = addWorkMinutes(createdAt, Math.max(5, prof.pickup * spread(0.9)));
    events.push({ status: "in_review", actor: "staff", actorName: hn, at: pickup });

    let status: Plan["status"] = "completed";
    let readyAt: Date | null = null;
    let cursor = pickup;

    if (rand() < spec.reject) {
      status = "rejected";
      cursor = addWorkMinutes(pickup, 30 + rand() * Math.min(slaWork * 0.6, 900));
      events.push({ status: "rejected", message: REJECT_MESSAGES[spec.slug] ?? REJECT_DEFAULT, actor: "staff", actorName: hn, at: cursor });
    } else {
      if (rand() < Math.min(0.85, prof.infoP * spec.info)) {
        const askAt = addWorkMinutes(pickup, 10 + rand() * 80);
        events.push({ status: "needs_info", message: INFO_MESSAGES[spec.slug], actor: "staff", actorName: hn, at: askAt });
        const replyAt = studentAwake(addMinutes(askAt, Math.round(60 * (1.5 + rand() * 30))), rand);
        events.push({ status: "in_review", message: pick(STUDENT_REPLIES), actor: "student", actorName: sn, at: replyAt });
        cursor = replyAt;
      }
      const startAt = addWorkMinutes(cursor, 5 + rand() * 90);
      events.push({ status: "in_progress", actor: "staff", actorName: hn, at: startAt });

      const late = rand() < prof.lateP;
      const share = late ? 1.05 + rand() * 0.6 : Math.min(0.95, prof.speed * spread(0.8));
      let ready = addWorkMinutes(createdAt, share * slaWork);
      if (late && ready <= dueAt) ready = addWorkMinutes(dueAt, 60 + rand() * 600);
      const minReady = addWorkMinutes(startAt, 10 + rand() * 40);
      if (ready < minReady) ready = minReady;
      readyAt = ready;
      const readyMsg =
        def.category === "certificate"
          ? delivery === "paper"
            ? "Справка готова. Заберите в учебном офисе, при себе студенческий билет."
            : "Справка готова и подписана электронной подписью. Подлинность проверяется по QR-коду."
          : "Заявление одобрено.";
      events.push({ status: "ready", message: readyMsg, actor: "staff", actorName: hn, at: ready });

      // Закрытие: скачал документ, забрал в офисе или решение доведено до студента
      if (def.category === "certificate" && delivery === "electronic") {
        cursor = studentAwake(addMinutes(ready, 5 + Math.round(rand() * 18 * 60)), rand);
        events.push({ status: "completed", message: "Документ скачан.", actor: "system", actorName: "Атташе", at: cursor });
      } else if (def.category === "certificate") {
        cursor = addWorkMinutes(ready, 60 + rand() * 1400);
        events.push({ status: "completed", message: "Документ выдан в учебном офисе.", actor: "staff", actorName: hn, at: cursor });
      } else {
        cursor = studentAwake(addMinutes(ready, 30 + Math.round(rand() * 30 * 60)), rand);
        events.push({ status: "completed", message: "Получение подтверждено", actor: "student", actorName: sn, at: cursor });
      }
    }

    // Все события в прошлом и строго по порядку
    const last = events[events.length - 1].at;
    if (last > latestClose) continue;
    let ordered = true;
    for (let i = 1; i < events.length; i++) if (events[i].at <= events[i - 1].at) ordered = false;
    if (!ordered) continue;

    plans.push({
      id: crypto.randomUUID(),
      studentId: st.id,
      facultyCode: st.facultyCode,
      type: spec.slug,
      status,
      fields: fieldsFor(spec.slug, createdAt),
      delivery,
      copies: def.copies && rand() < 0.15 ? 2 : 1,
      createdAt,
      dueAt,
      readyAt,
      staffId: handler.id,
      events,
      isDoc: def.category === "certificate" && readyAt !== null,
    });
  }

  plans.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (opts.dryRun) {
    const byFac = new Map<string, Plan[]>();
    for (const p of plans) byFac.set(p.facultyCode, [...(byFac.get(p.facultyCode) ?? []), p]);
    for (const [code, list] of byFac) {
      const ready = list.filter((p) => p.readyAt);
      const onTime = ready.filter((p) => p.readyAt! <= p.dueAt).length;
      const info = list.filter((p) => p.events.some((e) => e.status === "needs_info")).length;
      const hrs = ready.map((p) => (p.readyAt!.getTime() - p.createdAt.getTime()) / 3_600_000).sort((a, b) => a - b);
      console.log(`  ${code}: ${list.length}, в срок ${Math.round((100 * onTime) / Math.max(1, ready.length))} %, уточнения ${Math.round((100 * info) / list.length)} %, медиана ${hrs[Math.floor(hrs.length / 2)]?.toFixed(1)} ч`);
    }
    const byType = new Map<string, number[]>();
    for (const p of plans) if (p.readyAt) byType.set(p.type, [...(byType.get(p.type) ?? []), (p.readyAt.getTime() - p.createdAt.getTime()) / 3_600_000]);
    for (const [type, hrs] of byType) console.log(`  ${type}: ${hrs.length}, медиана ${hrs.sort((a, b) => a - b)[Math.floor(hrs.length / 2)].toFixed(1)} ч`);
    console.log(`• Пробный прогон: ${plans.length} заявок, в базу не записано`);
    return plans.length;
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < plans.length; i += 100) {
      const chunk = plans.slice(i, i + 100);
      const inserted = await tx
        .insert(s.requests)
        .values(
          chunk.map((r) => ({
            id: r.id,
            number: sql`'АТ-' || lpad(nextval('request_number_seq')::text, 5, '0')`,
            studentId: r.studentId,
            type: r.type,
            status: r.status,
            fields: r.fields,
            delivery: r.delivery,
            copies: r.copies,
            createdAt: r.createdAt,
            updatedAt: r.events[r.events.length - 1].at,
            dueAt: r.dueAt,
            readyAt: r.readyAt,
            verifyCode: r.isDoc ? randomVerifyCode() : null,
            assignedStaffId: r.staffId,
          })),
        )
        .returning({ id: s.requests.id, number: s.requests.number });
      const numberById = new Map(inserted.map((x) => [x.id, x.number]));

      for (const r of chunk) {
        const num = numberById.get(r.id);
        if (r.isDoc && r.readyAt && num) {
          await tx
            .update(s.requests)
            .set({ documentNo: documentNumber(r.facultyCode, num, r.readyAt) })
            .where(sql`${s.requests.id} = ${r.id}`);
        }
      }

      await tx.insert(s.requestEvents).values(
        chunk.flatMap((r) =>
          r.events.map((e) => ({ requestId: r.id, status: e.status, message: e.message ?? null, actor: e.actor, actorName: e.actorName, createdAt: e.at })),
        ),
      );
    }
  });

  const rejected = plans.filter((p) => p.status === "rejected").length;
  const late = plans.filter((p) => p.readyAt && p.readyAt > p.dueAt).length;
  const withInfo = plans.filter((p) => p.events.some((e) => e.status === "needs_info")).length;
  console.log(`✓ История заявок: ${plans.length} (отклонено ${rejected}, с уточнением ${withInfo}, позже срока ${late})`);
  return plans.length;
}
