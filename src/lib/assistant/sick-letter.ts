import "server-only";
// Атташе: черновик письма преподавателю о переносе контрольной на время больничного.
// В модель уходят только имя студента, группа, даты больничного и одна его дисциплина. Без диагноза и контактов.
import { getMySickLetterContext } from "@/lib/data/sick-leave";
import { dayLabel } from "@/lib/sick-leave";
import { formatDayMonth, plural } from "@/lib/time";
import { aiProvider, complete, extractJson } from "./providers";

export type SickLetter = { subject: string; body: string; mode: "ai" | "offline" };

const clean = (t: string) =>
  t
    .replace(/\r/g, "")
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, "-")
    .replace(/\s*[→←⇒⟶➝]\s*/g, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function list(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
}

export async function draftSickLetter(courseId: string): Promise<SickLetter | null> {
  const ctx = await getMySickLetterContext(courseId);
  if (!ctx) return null;

  const me = `${ctx.student.firstName} ${ctx.student.lastName}`;
  const address = ctx.teacher.middleName ? `${ctx.teacher.firstName} ${ctx.teacher.middleName}` : `${ctx.teacher.firstName} ${ctx.teacher.lastName}`;
  const since = dayLabel(ctx.leave.startsOn);
  const until = ctx.leave.expectedEnd ? dayLabel(ctx.leave.expectedEnd) : null;
  const works = ctx.course.assessments.map((a) => ({ title: a.title, due: formatDayMonth(a.dueAt) }));
  const missed = ctx.course.lessons.length;

  const facts = {
    student: me,
    group: ctx.student.group,
    teacherAddress: address,
    discipline: ctx.course.title,
    sickSince: since,
    expectedUntil: until,
    missedLessons: missed,
    works,
  };

  if (aiProvider()) {
    try {
      const { text } = await complete(
        [
          "Ты «Атташе», помощник студента МГИМО. Напиши от имени студента короткое вежливое письмо преподавателю.",
          "Студент на больничном и просит перенести сдачу работ из списка works на другой день, удобный преподавателю.",
          "Требования: 4-6 предложений; начни с «Здравствуйте, <teacherAddress>!»; назови работы и их даты из данных;",
          "скажи, что справку студент передаст в учебный офис; в конце подпись: имя, фамилия, группа.",
          "Раздели письмо на абзацы переносом строки \\n: приветствие, просьба, благодарность и подпись.",
          "Не упоминай диагноз и подробности болезни. Пиши нейтрально по роду: без глаголов прошедшего времени и слов, выдающих пол автора",
          "(не «заболел» и не «заболела», а «я на больничном»). Не выдумывай дат и фактов, которых нет в данных.",
          "Пиши по-русски, на «вы», без длинных тире, без стрелок и без markdown.",
          'Ответ строго в формате JSON: {"subject": "тема письма до 90 символов", "body": "текст письма"}.',
          `Данные (JSON): ${JSON.stringify(facts)}`,
        ].join(" "),
        [{ role: "user", content: "Подготовь письмо." }],
        500,
      );
      const json = extractJson(text);
      const subject = typeof json?.subject === "string" ? clean(json.subject).replace(/\n/g, " ").slice(0, 120) : "";
      const body = typeof json?.body === "string" ? clean(json.body).slice(0, 1500) : "";
      if (subject && body.length > 40) return { subject, body, mode: "ai" };
    } catch (e) {
      console.error("[sick-letter] модель недоступна:", e instanceof Error ? e.message : "error");
    }
  }

  const workList = list(works.map((w) => `«${w.title}» (срок ${w.due})`));
  const many = works.length > 1;
  const subject = `${ctx.course.title}: перенос ${many ? "сдачи работ" : `«${works[0]?.title ?? "работы"}»`}`;
  const body = [
    `Здравствуйте, ${address}!`,
    "",
    `Я ${me}, группа ${ctx.student.group}. С ${since} я на больничном${until ? `, ориентировочно до ${until}` : ""}${missed ? `, поэтому пропускаю занятия по дисциплине «${ctx.course.title}» (${missed} ${plural(missed, "пара", "пары", "пар")})` : ""}.`,
    `На это время ${many ? "приходятся" : "приходится"} ${workList}. Могу ли я сдать ${many ? "эти работы" : "эту работу"} позже, в удобный для вас день? Справку передам в учебный офис, как только выздоровлю.`,
    "",
    "Спасибо за понимание.",
    `${me}, ${ctx.student.group}`,
  ].join("\n");
  return { subject: clean(subject).slice(0, 120), body: clean(body), mode: "offline" };
}
