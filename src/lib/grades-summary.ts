// «Как у меня дела» одной фразой, из данных, без ИИ (детерминированно и мгновенно).
import type { CourseOverview, TranscriptRow } from "@/lib/data/grades";
import type { Locale } from "@/lib/i18n/config";
import { formatPoints } from "@/lib/utils";

export type Summary = { tone: "success" | "brand" | "warning" | "danger"; title: string; text: string };

export function studySummary(courses: CourseOverview[], debts: TranscriptRow[], scholarshipKind: string, locale: Locale = "ru"): Summary {
  const graded = courses.filter((c) => c.possible > 0);
  const critical = graded.filter((c) => c.standing === "critical");
  const risk = graded.filter((c) => c.standing === "risk");
  const excellent = graded.filter((c) => c.standing === "excellent");
  const examsNotExcellent = graded.filter((c) => c.controlType !== "credit" && c.standing !== "excellent");
  const en = locale === "en";
  const names = (list: { title: string }[]) => list.map((c) => (en ? c.title : `«${c.title}»`)).join(", ");

  if (critical.length || debts.length) {
    const parts: string[] = [];
    if (critical.length) {
      const pts = formatPoints(critical[0].earned, locale);
      parts.push(
        en
          ? `admission is at risk in ${names(critical)}: ${pts} of ${critical[0].possible} possible, you need at least 30 of 60 before the exams`
          : `под угрозой допуск ${critical.length === 1 ? "по дисциплине" : "по дисциплинам"} ${names(critical)}: ${pts} из ${critical[0].possible} возможных, к сессии нужно не меньше 30 из 60`,
      );
    }
    if (debts.length) parts.push(en ? `academic debt: ${names(debts)}` : `есть задолженность: ${names(debts)}`);
    const lead = parts.join("; ").replace(/^./, (c) => c.toUpperCase());
    return {
      tone: "danger",
      title: en ? "Needs attention" : "Нужно внимание",
      text: en
        ? `${lead}. Start with the retake and the nearest assessments, the assistant can help you make a plan.`
        : `${lead}. Начните с пересдачи и ближайших контрольных, ассистент поможет составить план.`,
    };
  }
  if (risk.length) {
    return {
      tone: "warning",
      title: en ? "Some courses at risk" : "Есть зона риска",
      text: en
        ? `${graded.length - risk.length} of ${graded.length} courses are going well, but ${names(risk)} ${risk.length === 1 ? "is" : "are"} below 60% so far. Raise your points in the next assessments.`
        : `${graded.length - risk.length} из ${graded.length} дисциплин идут хорошо, но ${names(risk)} пока ниже 60 %. Подтяните баллы на ближайших контрольных точках.`,
    };
  }
  if (!graded.length) {
    return en
      ? { tone: "brand", title: "The semester has just started", text: "Points will appear after the first assessments, and we'll notify you right away." }
      : { tone: "brand", title: "Семестр только начался", text: "Баллы появятся после первых контрольных точек, мы сразу пришлём уведомление." };
  }
  if (scholarshipKind === "raised" && examsNotExcellent.length) {
    return {
      tone: "warning",
      title: en ? "Increased scholarship in question" : "Повышенная стипендия под вопросом",
      text: en
        ? `${excellent.length} of ${graded.length} courses are on track for excellent, but ${names(examsNotExcellent)} ${examsNotExcellent.length === 1 ? "is" : "are"} at good for now. The increased scholarship requires excellent marks only.`
        : `${excellent.length} из ${graded.length} дисциплин идут на «отлично», но ${names(examsNotExcellent)}, пока на «хорошо». Для повышенной стипендии нужны только «отлично».`,
    };
  }
  if (excellent.length === graded.length) {
    return en
      ? { tone: "success", title: "Everything on track for excellent", text: "All courses are above 90%. Keep it up, you can apply for the increased scholarship and exchange programmes." }
      : { tone: "success", title: "Всё идёт на «отлично»", text: "Все дисциплины выше 90 %. Так держать, можно претендовать на повышенную стипендию и программы обмена." };
  }
  return {
    tone: "brand",
    title: en ? "All on track" : "Всё под контролем",
    text: en
      ? `${excellent.length} of ${graded.length} courses are on track for excellent, the rest for good. No academic debts.`
      : `${excellent.length} из ${graded.length} дисциплин идут на «отлично», остальные на «хорошо». Задолженностей нет.`,
  };
}
