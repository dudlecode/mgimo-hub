import "server-only";
// Атташе для радара рисков: черновик поддерживающего сообщения студенту из области сотрудника.
// Модель видит только факты одного студента: причины риска, долги и даты пересдач, открытые заявки, контакты офиса.
import { requireStaff } from "@/lib/auth/dal";
import { getScopedRiskProfile, type RiskProfile } from "@/lib/data/radar";
import { STATUS_META } from "@/lib/requests/catalog";
import { formatDateTime } from "@/lib/time";
import { formatPoints } from "@/lib/utils";
import { aiProvider, complete, extractJson } from "./providers";

/** Без длинных тире, стрелок и markdown, как в ответах Атташе для деканата. */
const clean = (t: string) =>
  t
    .replace(/(срок[а-я]*(?: [а-я]+)?)\s+[—–]\s+/gi, "$1 ")
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, "-")
    .replace(/\s*(?:[→←⇒⟶]|->|=>)\s*/g, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const RULES =
  "Пиши по-русски, тепло и уважительно, на «вы», коротко: 3-4 предложения. Без длинных тире и стрелок, без markdown, без подписи. Не пугай и не упрекай. Не выдумывай даты, аудитории, баллы и имена, которых нет в данных.";

function retakeText(d: RiskProfile["debts"][number]) {
  return d.retakeAt ? `${formatDateTime(d.retakeAt)}${d.retakeRoom ? `, ауд. ${d.retakeRoom}` : ""}` : null;
}

function context(p: RiskProfile) {
  return {
    studentFirstName: p.firstName,
    group: p.groupCode,
    reasons: p.reasons.map((r) => r.text),
    debts: p.debts.map((d) => ({ discipline: d.title, semester: d.semester, retake: retakeText(d) })),
    weakCourses: p.weakCourses.map((c) => ({
      discipline: c.title,
      points: `${formatPoints(c.earned)} из ${c.possible} возможных на сегодня`,
      status: c.standing === "critical" ? "допуск к сессии под угрозой, нужно не меньше 30 из 60 за семестр" : "результат ниже 60 %",
      teacher: c.teacher,
    })),
    waitingRequests: p.staleRequests.map((r) => ({ number: r.number, title: r.title, daysWithoutAnswer: r.days })),
    openRetakeRequests: p.retakeRequests.map((r) => ({ number: r.number, status: STATUS_META[r.status].label, needsStudentAnswer: r.status === "needs_info" })),
    lowAveragePercent: p.reasons.some((r) => r.kind === "average") ? p.averagePercent : null,
    office: `учебный офис ${p.office.code}, ауд. ${p.office.room}, ${p.office.hours}`,
    appointments: "раздел «Запись на приём» в кабинете студента",
    retakeApplication: "заявление на пересдачу подаётся в разделе «Заявки»",
  };
}

/** Шаблон без ИИ: главное из причин и один-два конкретных шага. */
export function offlineOutreach(p: RiskProfile): string {
  const facts: string[] = [];
  const steps: string[] = [];
  const debt = p.debts[0];
  const critical = p.weakCourses.find((c) => c.standing === "critical");
  const weak = critical ?? p.weakCourses[0];
  const req = p.staleRequests[0];

  if (debt) facts.push(`есть задолженность по дисциплине «${debt.title}»`);
  if (critical) facts.push(`по дисциплине «${critical.title}» пока ${formatPoints(critical.earned)} из ${critical.possible}, допуск к сессии под угрозой`);
  else if (weak) facts.push(p.weakCourses.length > 1 ? `по ${p.weakCourses.length} дисциплинам результат пока ниже 60 %` : `по дисциплине «${weak.title}» результат пока ниже 60 %`);
  const lowAverage = p.averagePercent !== null && p.reasons.some((r) => r.kind === "average");
  if (!facts.length && lowAverage) facts.push(`средний результат за семестр ${p.averagePercent} %`);
  if (req && facts.length < 2) facts.push(`заявка ${req.number} ждёт вашего ответа`);

  if (debt) {
    const when = retakeText(debt);
    const retakeReq = p.retakeRequests[0];
    steps.push(
      when
        ? `Пересдача по «${debt.title}» назначена на ${when}.`
        : retakeReq?.status === "needs_info"
          ? `По пересдаче ответьте, пожалуйста, в заявке ${retakeReq.number}: кафедре нужно ваше решение по дате.`
          : retakeReq
            ? `Заявка на пересдачу ${retakeReq.number} уже в работе, дату пришлём уведомлением.`
            : `Подайте заявление на пересдачу по «${debt.title}» в разделе «Заявки», мы согласуем дату с кафедрой.`,
    );
  }
  if (weak && steps.length < 2) steps.push(`Договоритесь о консультации по дисциплине «${weak.title}» (преподаватель ${weak.teacher}) и уточните, как добрать баллы до сессии.`);
  if (req && steps.length < 2) steps.push(`Ответьте, пожалуйста, в заявке ${req.number}, чтобы мы продолжили работу.`);
  if (!steps.length) steps.push("Посмотрите в разделе «Учёба», где баллы ниже, и договоритесь о консультации с преподавателями этих дисциплин.");

  const head = facts.length ? `${p.firstName}, учебный офис заметил, что ${facts.slice(0, 2).join(", а ")}. Это поправимо, и мы готовы помочь.` : `${p.firstName}, учебный офис готов помочь вам с учёбой в этом семестре.`;
  return [head, ...steps, "Если удобнее обсудить лично, запишитесь на приём в учебный офис в разделе «Запись на приём», вместе составим план."].join(" ");
}

/** Черновик сообщения студенту. null, если студент вне области сотрудника или рисков у него нет. */
export async function draftOutreach(studentId: string): Promise<{ text: string; mode: "ai" | "offline" } | null> {
  const { staff } = await requireStaff();
  const p = await getScopedRiskProfile(studentId);
  if (!p) return null;

  if (aiProvider()) {
    try {
      const { text } = await complete(
        `Ты «Атташе», помощник сотрудника учебного офиса (${staff.position}). Подготовь черновик личного сообщения студенту, у которого в этом семестре есть академические риски. ${RULES}
Обратись по имени. Назови главное, одну или две причины, без перечисления всех баллов. Предложи один или два конкретных шага: при долге пересдачу (если в данных есть дата, назови её; если уже есть открытая заявка на пересдачу, не предлагай подать новую, а попроси ответить в ней, когда needsStudentAnswer, или скажи, что она в работе; иначе предложи подать заявление на пересдачу), при угрозе допуска или низких баллах подойти к преподавателю на консультацию в ближайшие дни и договориться, как добрать баллы (дату консультации не называй), при заявке без ответа ответить в ней. Последним предложением предложи записаться на приём в учебный офис в разделе «Запись на приём».
Ответ строго JSON без пояснений вокруг: {"message": "текст сообщения"}
Данные студента (JSON): ${JSON.stringify(context(p))}`,
        [{ role: "user", content: "Напиши черновик сообщения студенту." }],
        500,
      );
      const parsed = extractJson(text);
      const message = typeof parsed?.message === "string" ? parsed.message : parsed ? "" : text;
      if (message.trim()) return { text: clean(message).slice(0, 1500), mode: "ai" };
    } catch (e) {
      console.error("[radar-assistant] модель недоступна:", e instanceof Error ? e.message : e);
    }
  }
  return { text: offlineOutreach(p), mode: "offline" };
}
