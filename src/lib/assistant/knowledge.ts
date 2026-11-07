// База знаний ассистента: правила кабинета (демо) и каталог заявок.
import { GRADE_RULES } from "@/lib/grades";
import { REQUEST_TYPES } from "@/lib/requests/catalog";
import { localizeRequestType } from "@/lib/requests/catalog-en";
import type { Locale } from "@/lib/i18n/config";

export const KNOWLEDGE = `
ПРАВИЛА БАЛЛОВ (демо-правила прототипа):
- Итог по дисциплине: 100 баллов: до ${GRADE_RULES.semesterMax} за семестр (контрольные точки) + до ${GRADE_RULES.examMax} на экзамене/зачёте.
- Оценки: ${GRADE_RULES.excellent}-100 «отлично», ${GRADE_RULES.good}-${GRADE_RULES.excellent - 1} «хорошо», ${GRADE_RULES.satisfactory}-${GRADE_RULES.good - 1} «удовлетворительно», меньше ${GRADE_RULES.satisfactory}: «неудовлетворительно». Зачёт, от ${GRADE_RULES.passMin}.
- Допуск к экзамену: от ${GRADE_RULES.admissionMin} баллов за семестр. От ${GRADE_RULES.autoMin} за семестр можно получить оценку «автоматом» (по решению преподавателя).
- Прогноз по дисциплине строится при сохранении текущего темпа. Если при текущем темпе «отлично» не выходит, но bestPossibleTotal ≥ ${GRADE_RULES.excellent}: НЕ говори «невозможно»: скажи, сколько нужно добрать в оставшихся контрольных (needFromRemainingFor5WithFullExam) и что экзамен тогда нужно сдать почти на максимум; предложи реалистичную цель «хорошо».
- Академический рейтинг: средний итоговый балл за последнюю сессию + до ${GRADE_RULES.activityBonusMax}% за научную и общественную активность.
- Стипендия (бюджет): сессия без «удовлетворительно» и долгов, академическая; только «отлично», можно претендовать на повышенную.
- Задолженность закрывается пересдачей. Если у долга в debts есть retake, дата уже назначена: назови дату и время (when), аудиторию, номер направления и кто принимает, предложи открыть направление (action open с href из retake.link) и НЕ предлагай подавать заявление. Если retake = null, нужно подать заявление «Пересдача» в разделе Заявки, учебный офис согласует дату с кафедрой.

ЗАЯВКИ: всё оформляется онлайн в разделе «Заявки», статус виден как у посылки. Справку с QR можно показать работодателю или в посольстве, подлинность проверяют по ссылке.
Ошибки в баллах: кнопка «Сообщить об ошибке» на странице дисциплины.
Расписание можно добавить в календарь телефона (кнопка «В календарь» в разделе Расписание).
Электронный студенческий с QR в Профиле.

РАЗДЕЛЫ КАБИНЕТА: / (Сегодня), /schedule (Расписание), /grades (Учёба: семестр, сессия ?tab=session, зачётка ?tab=record), /requests (Заявки), /requests/new (каталог), /notifications (Уведомления и новости), /profile (Профиль, студенческий, сеансы).
`.trim();

export const CATALOG_FOR_PROMPT = REQUEST_TYPES.filter((t) => !t.hidden || t.slug === "grade-error")
  .map((t) => {
    const fields = t.fields
      .map((f) => {
        if (f.type === "select") return `${f.name}: одно из [${(f.options ?? []).map((o) => o.value).join(", ")}]`;
        if (f.type === "date") return `${f.name}: дата YYYY-MM-DD`;
        if (f.type === "myCourse") return `${f.name}: id дисциплины из courses`;
        if (f.type === "myDebt") return `${f.name}: courseId из debts`;
        return `${f.name}: текст`;
      })
      .join("; ");
    return `- ${t.slug}: «${t.title}» (${t.slaDays} раб. дн.). Поля: ${fields}`;
  })
  .join("\n");

/** База знаний для английского интерфейса: те же правила, по-английски */
export const KNOWLEDGE_EN = `
GRADING RULES (demo rules of the prototype):
- Course total: 100 points: up to ${GRADE_RULES.semesterMax} during the semester (assessments) + up to ${GRADE_RULES.examMax} in the exam or pass/fail test.
- Grades: ${GRADE_RULES.excellent}-100 "excellent", ${GRADE_RULES.good}-${GRADE_RULES.excellent - 1} "good", ${GRADE_RULES.satisfactory}-${GRADE_RULES.good - 1} "satisfactory", below ${GRADE_RULES.satisfactory}: "unsatisfactory". Pass/fail test: pass from ${GRADE_RULES.passMin}.
- Exam admission: from ${GRADE_RULES.admissionMin} semester points. From ${GRADE_RULES.autoMin} semester points the grade can be given automatically (at the teacher's discretion).
- The course forecast assumes the current pace continues. If "excellent" is not reachable at the current pace but bestPossibleTotal ≥ ${GRADE_RULES.excellent}, do NOT say "impossible": say how many points are still needed in the remaining assessments (needFromRemainingFor5WithFullExam) and that the exam must then be close to the maximum; suggest "good" as a realistic goal.
- Academic rating: average final points of the last exam session + up to ${GRADE_RULES.activityBonusMax}% for research and community activity.
- Scholarship (state-funded): a session with no "satisfactory" grades and no failed courses gives the academic scholarship; only "excellent" grades let you apply for the increased one.
- A failed course is cleared by a retake. If the debt in debts has a retake object, the date is already set: give the date and time (when), the room, the referral number and who examines, offer to open the referral (open action with href from retake.link) and do NOT suggest applying again. If retake is null, the student submits the Retake application in Requests and the student office agrees the date with the department.

REQUESTS: everything is done online in Requests, and the status can be tracked like a parcel. A certificate with a QR code can be shown to an employer or an embassy, and its authenticity is checked online.
Wrong points: the Report an error button on the course page.
The schedule can be added to the phone calendar (the Add to calendar button in Schedule).
The electronic student card with a QR code is in Documents and Profile.
Certificates of enrolment and other official documents are issued in Russian, except the certificate for an embassy and a transcript in English.

SECTIONS OF THE APP: / (Today), /schedule (Schedule), /grades (Studies: semester, exam session ?tab=session, record book ?tab=record), /requests (Requests), /requests/new (catalogue), /notifications (Notifications and news), /appointments (Book an appointment with the student office), /documents (Documents), /payments (Tuition fees), /sick-leave (Sick leave), /profile (Profile, student card, sessions).
`.trim();

/** Каталог заявок для системного промпта на языке интерфейса (slug и значения полей одинаковые) */
export function catalogForPrompt(locale: Locale): string {
  if (locale !== "en") return CATALOG_FOR_PROMPT;
  return REQUEST_TYPES.filter((t) => !t.hidden || t.slug === "grade-error")
    .map((ru) => {
      const t = localizeRequestType(ru, "en");
      const fields = t.fields
        .map((f) => {
          if (f.type === "select") return `${f.name}: one of [${(f.options ?? []).map((o) => `${o.value} (${o.label})`).join(", ")}]`;
          if (f.type === "date") return `${f.name}: date YYYY-MM-DD`;
          if (f.type === "myCourse") return `${f.name}: course id from courses`;
          if (f.type === "myDebt") return `${f.name}: courseId from debts`;
          return `${f.name}: text`;
        })
        .join("; ");
      return `- ${t.slug}: "${t.title}" (${t.slaDays} working days). Fields: ${fields}`;
    })
    .join("\n");
}

export const knowledgeFor = (locale: Locale) => (locale === "en" ? KNOWLEDGE_EN : KNOWLEDGE);
