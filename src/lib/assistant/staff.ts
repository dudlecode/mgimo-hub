import "server-only";
// Атташе для деканата: черновик ответа студенту и сводка очереди. Только данные из области сотрудника.
import { getQueueStats, getScopedRequest, listScopedRequests } from "@/lib/data/staff";
import { requireStaff } from "@/lib/auth/dal";
import { getRequestType, STATUS_META } from "@/lib/requests/catalog";
import { displayFields } from "@/lib/requests/display";
import { formatDateTime, formatDayMonth } from "@/lib/time";
import { aiProvider, complete } from "./providers";

export type ReplyIntent = "ask" | "status" | "reject";

const clean = (t: string) => t.replace(/(срок[а-я]*(?: [а-я]+)?)\s+[—–]\s+/gi, "$1 ").replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "-").replace(/\s*[→←⇒]\s*/g, " ").replace(/^["«]|["»]$/g, "").trim();

const RULES = "Пиши по-русски, вежливо, на «вы», коротко. Без длинных тире и стрелок. Не выдумывай факты, даты и аудитории, которых нет в данных. Без подписи и приветствия-шапки, без markdown.";

export async function draftReply(requestId: string, intent: ReplyIntent): Promise<{ text: string; mode: "ai" | "offline" }> {
  const { staff } = await requireStaff();
  const r = await getScopedRequest(requestId);
  const def = getRequestType(r.type);
  const f = r.student.group.faculty;
  const ctx = {
    request: def?.title ?? r.type,
    number: r.number,
    status: STATUS_META[r.status].label,
    due: formatDayMonth(r.dueAt),
    delivery: r.delivery === "paper" ? "бумажная, выдача в учебном офисе" : "электронная с QR",
    fields: displayFields(r.type, r.fields),
    comment: r.comment,
    studentFirstName: r.student.firstName,
    office: `ауд. ${f.officeRoom}, ${f.officeHours}`,
    history: r.events.slice(-6).map((e) => `${formatDateTime(e.createdAt)} ${e.actor === "staff" ? "сотрудник" : "студент"}: ${e.status ? STATUS_META[e.status].label : "сообщение"}${e.message ? `. ${e.message}` : ""}`),
  };
  const goal = {
    ask: "Попроси студента уточнить или дополнить данные, которых не хватает для заявки. Спроси конкретно, чего не хватает, исходя из полей.",
    status: "Сообщи студенту текущий статус заявки и ориентировочный срок; если документ бумажный и готов, скажи, где и когда забрать.",
    reject: "Объясни студенту причину, по которой заявку придётся отклонить, и что сделать, чтобы подать её повторно правильно.",
  }[intent];

  if (aiProvider()) {
    try {
      const { text } = await complete(
        `Ты «Атташе», помощник сотрудника учебного офиса (${staff.position}). Подготовь черновик сообщения студенту по заявке, 2-4 предложения. ${RULES}\nЗадача: ${goal}\nДанные заявки (JSON): ${JSON.stringify(ctx)}`,
        [{ role: "user", content: "Напиши черновик сообщения." }],
        400,
      );
      if (text.trim()) return { text: clean(text).slice(0, 1500), mode: "ai" };
    } catch (e) {
      console.error("[staff-assistant] модель недоступна:", e instanceof Error ? e.message : e);
    }
  }
  const name = ctx.studentFirstName;
  const text = {
    ask: `${name}, чтобы подготовить «${ctx.request}», нам не хватает данных. Уточните, пожалуйста, детали ответом в этой заявке, и мы сразу продолжим работу.`,
    status: `${name}, заявка «${ctx.request}» ${ctx.number} сейчас в статусе «${ctx.status}». Ориентировочный срок: ${ctx.due}.${r.delivery === "paper" ? ` Бумажный документ можно будет забрать в учебном офисе, ${ctx.office}.` : ""}`,
    reject: `${name}, к сожалению, заявку «${ctx.request}» в текущем виде принять не можем. Проверьте данные и подайте её повторно, при необходимости приложите подтверждающие документы.`,
  }[intent];
  return { text, mode: "offline" };
}

export async function queueSummary(): Promise<{ text: string; mode: "ai" | "offline" }> {
  const { staff } = await requireStaff();
  const [stats, rows] = await Promise.all([getQueueStats(), listScopedRequests({ limit: 40 })]);
  const now = new Date();
  const items = rows.map((r) => ({
    number: r.number,
    type: getRequestType(r.type)?.title ?? r.type,
    status: STATUS_META[r.status].label,
    student: `${r.lastName} ${r.firstName[0]}., ${r.groupCode}`,
    due: formatDayMonth(r.dueAt),
    overdue: ["submitted", "in_review", "in_progress"].includes(r.status) && r.dueAt < now,
  }));
  if (aiProvider()) {
    try {
      const { text } = await complete(
        `Ты «Атташе», помощник сотрудника учебного офиса (${staff.position}). Составь короткую сводку очереди на сегодня: 4-6 пунктов, каждый с новой строки и начинается с «- ». Сначала просроченные и срочные, потом ждущие ответа студента, потом то, что можно закрыть. Указывай номера заявок. ${RULES}\nСтатистика: ${JSON.stringify(stats)}\nЗаявки (JSON): ${JSON.stringify(items)}`,
        [{ role: "user", content: "Сводка очереди." }],
        500,
      );
      if (text.trim()) {
        // просроченные всегда первой строкой: это гарантирует код, а не модель
        const late = items.filter((i) => i.overdue);
        const missed = late.filter((i) => !text.includes(i.number));
        const head = missed.length ? `- Просрочено: ${missed.map((i) => `${i.number} (${i.student})`).join(", ")}. Начните с них.\n` : "";
        return { text: clean(head + text).slice(0, 2000), mode: "ai" };
      }
    } catch (e) {
      console.error("[staff-assistant] модель недоступна:", e instanceof Error ? e.message : e);
    }
  }
  const overdue = items.filter((i) => i.overdue);
  const fresh = items.filter((i) => i.status === "Подана" && !i.overdue);
  const waiting = items.filter((i) => i.status === "Нужно уточнение");
  const ready = items.filter((i) => i.status === "Готова");
  const lines = [
    overdue.length ? `- Просрочено: ${overdue.map((i) => i.number).join(", ")}. Начните с них.` : "- Просроченных заявок нет.",
    fresh.length ? `- Новые без ответственного: ${fresh.length} (${fresh.slice(0, 4).map((i) => i.number).join(", ")}).` : "- Новых заявок нет.",
    waiting.length ? `- Ждут ответа студента: ${waiting.map((i) => i.number).join(", ")}.` : "",
    ready.length ? `- Готовы к выдаче: ${ready.map((i) => i.number).join(", ")}. Отметьте выданные.` : "",
  ].filter(Boolean);
  return { text: lines.join("\n"), mode: "offline" };
}
