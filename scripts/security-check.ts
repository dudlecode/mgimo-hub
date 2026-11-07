// Автопроверка безопасности «Атташе». Запуск: npm run test:security  (нужен запущенный сервер)
//   BASE_URL=http://localhost:3000 npm run test:security
// Проверяет изоляцию данных (IDOR), роли, cookie, заголовки, хранение паролей, лимит попыток входа.
import "dotenv/config";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, pool, schema as s } from "../src/db/client";
import { bookingDays, daySlots, randomAppointmentCode } from "../src/lib/appointments";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const results: { name: string; ok: boolean; info?: string }[] = [];

function check(name: string, ok: boolean, info?: string) {
  results.push({ name, ok, info });
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? `  — ${info}` : ""}`);
}

async function login(loginName: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: loginName, password }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  return { status: res.status, cookie, setCookie };
}

async function get(path: string, cookie?: string) {
  return fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
}

async function main() {
  console.log(`\nПроверка безопасности: ${BASE}\n`);

  // ── Данные для проверок (берём id чужих записей прямо из БД) ──
  const idOf = async (login: string) => (await db.select({ id: s.students.id }).from(s.students).innerJoin(s.users, eq(s.users.id, s.students.userId)).where(eq(s.users.login, login)))[0].id;
  const timurId = await idOf("student.timur");
  const annaId = await idOf("student.anna");
  const [timurReq] = await db.select({ id: s.requests.id }).from(s.requests).where(eq(s.requests.studentId, timurId)).limit(1);
  const [timurDoc] = await db.select({ id: s.requests.id }).from(s.requests).where(and(eq(s.requests.studentId, timurId), sql`verify_code is not null`)).limit(1);
  const [annaReq] = await db.select({ id: s.requests.id }).from(s.requests).where(eq(s.requests.studentId, annaId)).limit(1);
  const [timurCourse] = await db
    .select({ id: s.enrollments.courseId })
    .from(s.enrollments)
    .where(and(eq(s.enrollments.studentId, timurId), sql`${s.enrollments.courseId} not in (select course_id from enrollments where student_id = ${annaId})`))
    .limit(1);
  const [meoNews] = await db.select({ id: s.announcements.id }).from(s.announcements).where(eq(s.announcements.facultyId, "meo")).limit(1);
  const [timurNotif] = await db
    .select({ id: s.notifications.id })
    .from(s.notifications)
    .innerJoin(s.students, eq(s.students.userId, s.notifications.userId))
    .where(eq(s.students.id, timurId))
    .limit(1);

  // ── Без входа ──
  const r0 = await get("/");
  check("Без входа главная перенаправляет на /login", r0.status === 307 && (r0.headers.get("location") ?? "").includes("/login"), `HTTP ${r0.status}`);
  const r1 = await get("/api/notifications/count");
  check("Без входа API отвечает 401", r1.status === 401, `HTTP ${r1.status}`);

  // ── Заголовки ──
  const rh = await get("/login");
  check("Заголовок Content-Security-Policy", !!rh.headers.get("content-security-policy"));
  check("Заголовок X-Frame-Options: DENY", rh.headers.get("x-frame-options") === "DENY");
  check("Заголовок X-Content-Type-Options: nosniff", rh.headers.get("x-content-type-options") === "nosniff");

  // ── Вход ──
  const bad = await login("student.anna", "wrong-password");
  check("Неверный пароль отклоняется", bad.status === 401, `HTTP ${bad.status}`);
  const anna = await login("student.anna", "Demo-Anna-26");
  check("Вход студентки А", anna.status === 200 && !!anna.cookie, `HTTP ${anna.status}`);
  check("Cookie сессии: HttpOnly", /httponly/i.test(anna.setCookie));
  check("Cookie сессии: SameSite=Lax", /samesite=lax/i.test(anna.setCookie));
  const tokenInDb = await db.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.id, decodeURIComponent(anna.cookie.split("=")[1] ?? "")));
  check("В БД хранится не токен, а его хэш", tokenInDb.length === 0);

  // ── Изоляция данных (IDOR) ──
  const own = await get(`/requests/${annaReq.id}`, anna.cookie);
  check("Своя заявка открывается", own.status === 200, `HTTP ${own.status}`);
  const foreign = await get(`/requests/${timurReq.id}`, anna.cookie);
  check("Чужая заявка → 404 (подстановка адреса)", foreign.status === 404, `HTTP ${foreign.status}`);
  if (timurDoc) {
    const foreignDoc = await get(`/requests/${timurDoc.id}/document`, anna.cookie);
    check("Чужая справка → 404", foreignDoc.status === 404, `HTTP ${foreignDoc.status}`);
  }
  if (timurCourse) {
    const foreignCourse = await get(`/grades/${timurCourse.id}`, anna.cookie);
    check("Чужая дисциплина → 404", foreignCourse.status === 404, `HTTP ${foreignCourse.status}`);
  }
  if (meoNews) {
    const foreignNews = await get(`/news/${meoNews.id}`, anna.cookie);
    check("Объявление другого факультета → 404", foreignNews.status === 404, `HTTP ${foreignNews.status}`);
  }
  if (timurNotif) {
    await get(`/notifications/${timurNotif.id}/open`, anna.cookie);
    const [n] = await db.select({ readAt: s.notifications.readAt }).from(s.notifications).where(eq(s.notifications.id, timurNotif.id));
    check("Нельзя отметить прочитанным чужое уведомление", n.readAt === null || n.readAt < new Date(Date.now() - 5000));
  }
  // Оплата обучения: квитанция Тимура (контракт) по прямому адресу у Анны (бюджет) и экран оплаты деканата
  const [timurPayment] = await db.select({ id: s.tuitionPayments.id }).from(s.tuitionPayments).where(eq(s.tuitionPayments.studentId, timurId)).limit(1);
  if (timurPayment) {
    const foreignReceipt = await get(`/payments/${timurPayment.id}/receipt`, anna.cookie);
    check("Чужая квитанция на оплату → 404", foreignReceipt.status === 404, `HTTP ${foreignReceipt.status}`);
  }
  const staffPayments = await get("/staff/payments", anna.cookie);
  check(
    "Студент не открывает оплату в кабинете деканата",
    staffPayments.status === 307 || staffPayments.status === 303 || (staffPayments.status === 200 && !(await staffPayments.text()).includes("Студенты на контракте")),
    `HTTP ${staffPayments.status}`,
  );

  // Запись на приём: временные записи Анны и Тимура создаются прямо в БД и удаляются в конце блока
  const tempAppointments: string[] = [];
  try {
    const facultyOf = async (studentId: string) =>
      (await db.select({ f: s.groups.facultyId }).from(s.students).innerJoin(s.groups, eq(s.groups.id, s.students.groupId)).where(eq(s.students.id, studentId)))[0].f;
    const makeAppointment = async (studentId: string) => {
      const facultyId = await facultyOf(studentId);
      const busy = new Set(
        (await db.select({ t: s.appointments.startsAt }).from(s.appointments).where(and(eq(s.appointments.facultyId, facultyId), eq(s.appointments.status, "booked")))).map((r) => r.t.getTime()),
      );
      const startsAt = bookingDays(new Date())
        .flatMap((d) => daySlots(d))
        .reverse()
        .find((t) => !busy.has(t.getTime()));
      if (!startsAt) throw new Error("нет свободного слота для проверки");
      const [row] = await db
        .insert(s.appointments)
        .values({ studentId, facultyId, startsAt, topic: "other", comment: "security-check", code: randomAppointmentCode() })
        .returning({ id: s.appointments.id });
      tempAppointments.push(row.id);
      return row.id;
    };
    const annaAppt = await makeAppointment(annaId);
    const timurAppt = await makeAppointment(timurId);

    const foreignIcs = await get(`/api/appointments/${timurAppt}/ics`, anna.cookie);
    const foreignTicket = await get(`/appointments/${timurAppt}`, anna.cookie);
    check("Чужая запись на приём: .ics и талон → 404", foreignIcs.status === 404 && foreignTicket.status === 404, `.ics HTTP ${foreignIcs.status}, талон HTTP ${foreignTicket.status}`);

    // Тот же server action, что у кнопки «Отменить», но с id чужой записи. Контроль: своя запись тем же запросом отменяется.
    const page = await (await get("/appointments", anna.cookie)).text();
    const actionId = page.match(new RegExp(`name="\\$ACTION_ID_([0-9a-f]+)"\\s*/>\\s*<input type="hidden" name="id" value="${annaAppt}"`))?.[1];
    const cancelAs = (id: string) => {
      const fd = new FormData();
      fd.append(`$ACTION_ID_${actionId}`, "");
      fd.append("id", id);
      return fetch(`${BASE}/appointments`, { method: "POST", headers: { cookie: anna.cookie, origin: BASE }, body: fd, redirect: "manual" });
    };
    const statusOf = async (id: string) => (await db.select({ st: s.appointments.status }).from(s.appointments).where(eq(s.appointments.id, id)))[0]?.st;
    if (actionId) {
      await cancelAs(timurAppt);
      await cancelAs(annaAppt);
    }
    const [foreignSt, ownSt] = [await statusOf(timurAppt), await statusOf(annaAppt)];
    check(
      "Нельзя отменить чужую запись на приём",
      !!actionId && foreignSt === "booked" && ownSt === "cancelled",
      actionId ? `чужая: ${foreignSt}, своя (контроль): ${ownSt}` : "кнопка отмены на странице не найдена",
    );
  } finally {
    if (tempAppointments.length) await db.delete(s.appointments).where(inArray(s.appointments.id, tempAppointments));
  }

  // Больничный: временные больничные Анны и Тимура со справкой создаются прямо в БД и удаляются в конце блока
  const tempSick: string[] = [];
  try {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const pngSha = (await import("node:crypto")).createHash("sha256").update(png).digest("hex");
    const mskDay = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(Date.now() + offset * 86_400_000));
    const makeSick = async (studentId: string, status: "open" | "submitted") => {
      const [row] = await db
        .insert(s.sickLeaves)
        .values({ studentId, status, startsOn: mskDay(-200), endsOn: status === "open" ? null : mskDay(-198), comment: "security-check" })
        .returning({ id: s.sickLeaves.id });
      tempSick.push(row.id);
      if (status === "open") return { leaveId: row.id, fileId: null };
      const [file] = await db.insert(s.sickLeaveFiles).values({ sickLeaveId: row.id, fileName: "spravka.png", mimeType: "image/png", size: png.length, sha256: pngSha, data: png }).returning({ id: s.sickLeaveFiles.id });
      return { leaveId: row.id, fileId: file.id };
    };
    const annaSick = await makeSick(annaId, "submitted");
    const timurSick = await makeSick(timurId, "submitted");
    const timurOpen = await makeSick(timurId, "open");

    const ownFile = await get(`/api/sick-leave/files/${annaSick.fileId}`, anna.cookie);
    const foreignFile = await get(`/api/sick-leave/files/${timurSick.fileId}`, anna.cookie);
    check(
      "Чужая справка о болезни → 404",
      foreignFile.status === 404 && ownFile.status === 200,
      `чужая HTTP ${foreignFile.status}, своя (контроль) HTTP ${ownFile.status}, ${ownFile.headers.get("cache-control")}`,
    );

    const fd = new FormData();
    fd.append("endsOn", mskDay(0));
    fd.append("file", new Blob([png], { type: "image/png" }), "spravka.png");
    const closeForeign = await fetch(`${BASE}/api/sick-leave/${timurOpen.leaveId}/close`, { method: "POST", headers: { cookie: anna.cookie, origin: BASE }, body: fd, redirect: "manual" });
    const [after] = await db.select({ status: s.sickLeaves.status }).from(s.sickLeaves).where(eq(s.sickLeaves.id, timurOpen.leaveId));
    check("Нельзя закрыть чужой больничный", closeForeign.status === 404 && after?.status === "open", `HTTP ${closeForeign.status}, статус: ${after?.status}`);
  } finally {
    if (tempSick.length) await db.delete(s.sickLeaves).where(inArray(s.sickLeaves.id, tempSick));
  }
  const staffSick = await get("/staff/sick-leaves", anna.cookie);
  check(
    "Студент не открывает больничные в кабинете деканата",
    staffSick.status === 307 || staffSick.status === 303 || (staffSick.status === 200 && !(await staffSick.text()).includes("Болеют сейчас")),
    `HTTP ${staffSick.status}`,
  );

  // Пересдачи: направление Тимура по прямому адресу у Анны и экран пересдач деканата
  const [timurReferral] = await db.select({ id: s.retakeReferrals.id }).from(s.retakeReferrals).where(eq(s.retakeReferrals.studentId, timurId)).limit(1);
  if (timurReferral) {
    const foreignReferral = await get(`/grades/retakes/${timurReferral.id}`, anna.cookie);
    check("Чужое направление на пересдачу: 404", foreignReferral.status === 404, `HTTP ${foreignReferral.status}`);
  }
  const staffRetakes = await get("/staff/retakes", anna.cookie);
  check(
    "Студент не открывает пересдачи в кабинете деканата",
    staffRetakes.status === 307 || staffRetakes.status === 303 || (staffRetakes.status === 200 && !(await staffRetakes.text()).includes("Долги по дисциплинам")),
    `HTTP ${staffRetakes.status}`,
  );

  const ics = await get("/api/calendar", anna.cookie);
  const icsText = await ics.text();
  check("Календарь .ics — только свои занятия", ics.status === 200 && !icsText.includes("Эконометрика") && icsText.includes("BEGIN:VCALENDAR"));
  const staffPage = await get("/staff", anna.cookie);
  check("Студент не попадает в кабинет сотрудника", staffPage.status === 307 || staffPage.status === 303 || (staffPage.status === 200 && !(await staffPage.text()).includes("Требуют внимания")), `HTTP ${staffPage.status}`);
  // Карточка студента и журнал действий: только для сотрудников
  for (const [label, path] of [
    ["список студентов", "/staff/students"],
    ["карточку студента", `/staff/students/${timurId}`],
    ["журнал действий", "/staff/audit"],
  ] as const) {
    const r = await get(path, anna.cookie);
    check(`Студент не открывает ${label} в кабинете деканата`, r.status === 307, `HTTP ${r.status}`);
  }

  const home = await get("/", anna.cookie);
  const html = await home.text();
  check("В HTML нет хэшей паролей", !html.includes("$argon2"));
  const secrets = [process.env.DEEPSEEK_API_KEY, process.env.AWS_BEARER_TOKEN_BEDROCK, process.env.AWS_SECRET_ACCESS_KEY, process.env.AWS_ACCESS_KEY_ID].filter((x): x is string => !!x && x.length > 8);
  const assistantHtml = await (await get("/assistant", anna.cookie)).text();
  check("В HTML нет ключей ИИ-провайдера", secrets.every((k) => !html.includes(k) && !assistantHtml.includes(k)), secrets.length ? `проверено ключей: ${secrets.length}` : "ключи не заданы");

  // ── Ассистент: CSRF ──
  const ai = await fetch(`${BASE}/api/assistant`, { method: "POST", headers: { "Content-Type": "application/json", cookie: anna.cookie, origin: "https://evil.example" }, body: JSON.stringify({ messages: [{ role: "user", content: "привет" }] }) });
  check("Ассистент отклоняет запрос с чужого сайта (CSRF)", ai.status === 403, `HTTP ${ai.status}`);

  const staffAi = await fetch(`${BASE}/api/staff/assistant`, { method: "POST", headers: { "Content-Type": "application/json", cookie: anna.cookie, origin: BASE }, body: JSON.stringify({ kind: "summary" }) });
  check("Студент не может вызвать ИИ деканата", staffAi.status === 403, `HTTP ${staffAi.status}`);
  const staffDoc = await get(`/staff/requests/${annaReq.id}/document`, anna.cookie);
  check("Студент не открывает справку через кабинет деканата", staffDoc.status === 307 || staffDoc.status === 404, `HTTP ${staffDoc.status}`);

  // ── Сотрудник: область видимости ──
  const meo = await login("staff.meo", "Demo-Meo-26");
  const meoForeign = await get(`/staff/requests/${annaReq.id}`, meo.cookie);
  check("Сотрудник МЭО не видит заявку студента МО → 404", meoForeign.status === 404, `HTTP ${meoForeign.status}`);
  const meoOwn = await get(`/staff/requests/${timurReq.id}`, meo.cookie);
  check("Сотрудник МЭО видит заявку студента МЭО", meoOwn.status === 200, `HTTP ${meoOwn.status}`);
  const office = await login("staff.office", "Demo-Office-26");
  const officeAny = await get(`/staff/requests/${annaReq.id}`, office.cookie);
  check("Единый студенческий офис видит все факультеты", officeAny.status === 200, `HTTP ${officeAny.status}`);

  // ── Карточка студента и журнал действий ──
  const meoCardForeign = await get(`/staff/students/${annaId}`, meo.cookie);
  check("Сотрудник МЭО не открывает карточку студентки МО → 404", meoCardForeign.status === 404, `HTTP ${meoCardForeign.status}`);
  const meoCardOwn = await get(`/staff/students/${timurId}`, meo.cookie);
  check("Сотрудник МЭО открывает карточку студента МЭО", meoCardOwn.status === 200, `HTTP ${meoCardOwn.status}`);
  // Просмотр пишется не чаще раза в 10 минут на сотрудника и студента: ищем запись за это окно
  const [meoUser] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.login, "staff.meo"));
  const [viewed] = await db
    .select({ id: s.auditLog.id })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.action, "student.view"), eq(s.auditLog.actorUserId, meoUser.id), eq(s.auditLog.studentId, timurId), gte(s.auditLog.createdAt, new Date(Date.now() - 11 * 60_000))))
    .limit(1);
  check("Открытие карточки записано в журнал (student.view)", !!viewed);
  await get(`/staff/students/${annaId}`, office.cookie); // гарантирует запись журнала по студентке МО
  const moStudents = await db
    .selectDistinct({ id: s.auditLog.studentId })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.facultyId, "mo"), isNotNull(s.auditLog.studentId)));
  const meoAudit = await get("/staff/audit", meo.cookie);
  const meoAuditHtml = await meoAudit.text();
  const officeAuditHtml = await (await get("/staff/audit", office.cookie)).text();
  check(
    "Сотрудник МЭО не видит в журнале записей по студентам МО",
    meoAudit.status === 200 && moStudents.length > 0 && officeAuditHtml.includes(`/staff/students/${annaId}`) && moStudents.every((r) => !meoAuditHtml.includes(`/staff/students/${r.id}`)),
    `HTTP ${meoAudit.status}, студентов МО в журнале: ${moStudents.length}, у единого офиса видна (контроль): ${officeAuditHtml.includes(`/staff/students/${annaId}`)}`,
  );
  const tryChange = (q: ReturnType<typeof sql>) => db.execute(q).then(() => false, () => true);
  const noUpdate = await tryChange(sql`update audit_log set summary = summary where id = (select max(id) from audit_log)`);
  const noDelete = await tryChange(sql`delete from audit_log where id = (select max(id) from audit_log)`);
  check("Запись журнала нельзя изменить или удалить (триггер БД)", noUpdate && noDelete, `UPDATE ${noUpdate ? "запрещён" : "прошёл"}, DELETE ${noDelete ? "запрещён" : "прошёл"}`);

  // ── Пароли в БД ──
  const weak = await db.select({ n: sql<number>`count(*)::int` }).from(s.users).where(sql`password_hash not like '$argon2id$%'`);
  check("Все пароли — хэши argon2id", weak[0].n === 0, `не-argon2: ${weak[0].n}`);

  // ── Страница проверки справки: минимум данных ──
  const [doc] = await db
    .select({ code: s.requests.verifyCode, first: s.students.firstName, birth: s.students.birthDate })
    .from(s.requests)
    .innerJoin(s.students, eq(s.students.id, s.requests.studentId))
    .where(sql`verify_code is not null and status in ('ready','completed')`)
    .limit(1);
  if (doc?.code) {
    const v = await (await get(`/verify/${doc.code}`)).text();
    check("Проверка справки не раскрывает полное имя и дату рождения", v.includes("подлинный") && !v.includes(doc.birth) && !v.includes(`${doc.first} `));
  }

  // ── Лимит попыток входа ──
  const probe = `probe.${Date.now()}`;
  let lastStatus = 0;
  for (let i = 0; i < 6; i++) lastStatus = (await login(probe, "x")).status;
  check("После 5 неудачных попыток вход блокируется (429)", lastStatus === 429, `последний ответ HTTP ${lastStatus}`);
  await db.delete(s.loginAttempts).where(eq(s.loginAttempts.login, probe));
  // убираем только сессии, созданные этим скриптом (user-agent Node.js fetch)
  await db.delete(s.sessions).where(eq(s.sessions.userAgent, "node")).catch(() => undefined);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nИтог: ${results.length - failed.length} из ${results.length} проверок пройдено.${failed.length ? " Провалены: " + failed.map((f) => f.name).join("; ") : ""}\n`);
  await pool.end();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
