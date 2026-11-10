// Бланк справки с QR-проверкой. Водяной знак «образец» защищает от выдачи распечатки за подлинник.
import Link from "next/link";

import type { TranscriptRow } from "@/lib/data/grades";
import { getRequestType } from "@/lib/requests/catalog";
import { displayFields } from "@/lib/requests/display";
import { CONTROL_LABEL, MARK_LABEL, type Mark } from "@/lib/grades";
import { dayKey, formatDateLong, formatDateNumeric, parseDayKey } from "@/lib/time";
import { getSemester } from "@/lib/academic";
import { LogoMark } from "@/components/logo";
import { fullName } from "@/lib/utils";
import { PrintButton } from "./print-button";


const FACULTY_EN: Record<string, string> = {
  mo: "School of International Relations",
  meo: "School of International Economic Relations",
  mp: "School of International Law",
  mj: "School of International Journalism",
  mb: "School of International Business",
  fup: "School of Governance and Politics",
  flmk: "School of Linguistics and Intercultural Communication",
  ffe: "School of Financial Economics",
};

const TRANSLIT: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "iu", я: "ia" };
const tr = (s: string) => s.split("").map((c) => { const l = c.toLowerCase(); const t = TRANSLIT[l]; return t === undefined ? c : c === l ? t : t.charAt(0).toUpperCase() + t.slice(1); }).join("");

export type CertificateProps = {
  r: { id: string; type: string; fields: Record<string, string>; verifyCode: string | null; documentNo: string | null; readyAt: Date | null; updatedAt: Date; assignedStaff: { firstName: string; lastName: string } | null };
  student: { lastName: string; firstName: string; middleName: string | null; birthDate: string; enrollmentYear: number; studyForm: string; funding: string };
  group: { course: number; programCode: string; programName: string; profileName: string | null };
  faculty: { id: string; name: string };
  transcript: TranscriptRow[];
  url: string;
  qr: string;
  backHref: string;
  backLabel: string;
};

/** Бланк справки: одинаковый для студента и для сотрудника деканата. */
export function CertificateView({ r, student, group, faculty, transcript, url, qr, backHref, backLabel }: CertificateProps) {
  const def = getRequestType(r.type);
  const issued = r.readyAt ?? r.updatedAt;
  const en = r.type === "embassy-certificate" || (r.type === "transcript" && r.fields.language === "en");
  const sem = getSemester(issued);
  const fields = displayFields(r.type, r.fields);
  const signer = r.assignedStaff ? `${r.assignedStaff.firstName[0]}. ${r.assignedStaff.lastName}` : "И. Соколова";
  const birth = parseDayKey(student.birthDate)!;
  const studyEnd = `31.08.${student.enrollmentYear + 4}`;

  return (
    <div >
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-[13px] text-ink-3 hover:text-ink">{backLabel}</Link>
        <PrintButton />
      </div>

      <article lang={en ? "en" : "ru"} className="relative mx-auto max-w-[760px] overflow-hidden rounded-[6px] bg-white px-6 py-8 text-[#111] shadow-pop sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:px-0 print:py-0 print:shadow-none">
        {/* Водяной знак «образец»: сгенерированную справку нельзя выдать за подлинную */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" aria-hidden>
          <div className="rotate-[-28deg] text-center font-serif text-[40px] leading-tight font-bold whitespace-nowrap text-[#15296b]/[0.06] sm:text-[64px]">
            ОБРАЗЕЦ
            <br />
            НЕ ДЛЯ ПРЕДЪЯВЛЕНИЯ
          </div>
        </div>

        <header className="relative flex items-start justify-between gap-4 border-b-2 border-[#15296b] pb-4">
          <div className="flex items-center gap-3">
            <LogoMark size={44} paper />
            <div className="leading-tight">
              <div className="font-serif text-[15px] font-semibold text-[#15296b]">{en ? "MGIMO Hub, digital dean’s office" : "MGIMO Hub, цифровой деканат"}</div>
              <div className="text-[11px] text-[#555]">{en ? FACULTY_EN[faculty.id] ?? faculty.name : faculty.name}</div>
            </div>
          </div>
          <div className="text-right text-[11px] text-[#555] tabular">
            <div className="whitespace-nowrap">№ {r.documentNo}</div>
            <div>{en ? dayKey(issued) : formatDateNumeric(issued)}</div>
          </div>
        </header>

        <h1 className="relative mt-8 text-center font-serif text-[22px] font-bold tracking-[0.08em] uppercase">
          {en ? (r.type === "transcript" ? "Transcript of Records" : "Certificate of Enrollment") : r.type === "transcript" ? "Академическая выписка" : "Справка"}
        </h1>
        {!en && r.type !== "transcript" && <p className="relative mt-1 text-center text-[13px] text-[#555]">{def?.title.toLowerCase()}</p>}

        <div className="relative mt-7 space-y-4 font-serif text-[15px] leading-[1.75]">
          {r.type === "embassy-certificate" ? (
            <>
              <p>
                This is to certify that <b>{tr(student.lastName).toUpperCase()} {tr(student.firstName)}</b>, born{" "}
                {birth.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" })}, is a full-time{" "}
                <b>{group.course}{["st", "nd", "rd"][group.course - 1] ?? "th"}-year</b> Bachelor’s student of the {FACULTY_EN[faculty.id] ?? faculty.name}, programme {group.programCode}, in the academic year{" "}
                {sem.academicYear}/{sem.academicYear + 1}.
              </p>
              <p>
                Expected graduation: {studyEnd}. The student is permitted to travel to <b>{r.fields.country}</b> from {r.fields.travelFrom} to {r.fields.travelTo}; the travel does not interfere with the academic schedule.
              </p>
              <p>This certificate is issued upon the student’s request for submission to the consular authorities.</p>
            </>
          ) : r.type === "transcript" ? (
            <>
              <p>
                {en ? "Student" : "Студент"}: <b>{en ? `${tr(student.lastName).toUpperCase()} ${tr(student.firstName)}` : fullName(student)}</b>, {group.course} {en ? "year" : "курс"}, {group.programCode} {en ? "" : group.programName}
              </p>
              <table className="w-full border-collapse font-sans text-[12px] leading-snug">
                <thead>
                  <tr className="border-b border-[#999] text-left">
                    <th className="py-1.5 pr-2">{en ? "Sem." : "Сем."}</th>
                    <th className="py-1.5 pr-2">{en ? "Course" : "Дисциплина"}</th>
                    <th className="py-1.5 pr-2">{en ? "Form" : "Форма"}</th>
                    <th className="py-1.5 pr-2 text-right">ECTS</th>
                    <th className="py-1.5 text-right">{en ? "Grade" : "Оценка"}</th>
                  </tr>
                </thead>
                <tbody>
                  {transcript.map((t) => (
                    <tr key={t.id} className="border-b border-[#ddd]">
                      <td className="py-1 pr-2 tabular">{t.semester}</td>
                      <td className="py-1 pr-2">{en ? tr(t.title) : t.title}</td>
                      <td className="py-1 pr-2">{en ? t.controlType.replace("_", " ") : CONTROL_LABEL[t.controlType]}</td>
                      <td className="py-1 pr-2 text-right tabular">{t.credits}</td>
                      <td className="py-1 text-right tabular">
                        {t.points} · {en ? t.mark : MARK_LABEL[t.mark as Mark]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <p>
                Настоящая справка выдана: <b>{fullName(student)}</b>, {formatDateNumeric(birth)} г. р., в том, что {student.firstName} действительно обучается в университете на <b>{group.course} курсе</b>, {faculty.name.toLowerCase()}, по направлению подготовки{" "}
                {group.programCode} «{group.programName}»{group.profileName ? `, профиль «${group.profileName}»` : ""}, по {student.studyForm.replace(/ая$/, "ой")} форме обучения на {student.funding === "budget" ? "бюджетной" : "договорной"} основе.
              </p>
              <p>
                Нормативный срок обучения: с 01.09.{student.enrollmentYear} по {studyEnd}.
              </p>
              {fields.map((f) => (
                <p key={f.label}>
                  {f.label}: {f.value}.
                </p>
              ))}
            </>
          )}
        </div>

        <footer className="relative mt-12 flex flex-wrap items-end justify-between gap-6">
          <div className="text-[13px] leading-relaxed">
            <div>{en ? "Deputy Dean (electronic signature)" : "Заместитель декана (электронная подпись)"}</div>
            <div className="mt-4 font-serif text-[15px] italic">{signer}</div>
          </div>

          {/* Печать */}
          <svg viewBox="0 0 120 120" className="size-28 -rotate-[8deg] opacity-80 animate-stamp" aria-hidden>
            <circle cx="60" cy="60" r="56" fill="none" stroke="#2c4aa8" strokeWidth="3" />
            <circle cx="60" cy="60" r="44" fill="none" stroke="#2c4aa8" strokeWidth="1.2" />
            <defs>
              <path id="stamp-c" d="M60 60 m-50 0 a50 50 0 1 1 100 0 a50 50 0 1 1 -100 0" />
            </defs>
            <text fontSize="9.5" fontWeight="700" fill="#2c4aa8" letterSpacing="1.5">
              <textPath href="#stamp-c">MGIMO HUB · ОБРАЗЕЦ · НЕ ДЛЯ ПРЕДЪЯВЛЕНИЯ ·</textPath>
            </text>
            <text x="60" y="58" textAnchor="middle" fontSize="11" fontWeight="800" fill="#2c4aa8">
              ДЕМО
            </text>
            <text x="60" y="72" textAnchor="middle" fontSize="7" fill="#2c4aa8">
              {r.documentNo}
            </text>
          </svg>

          <div id="qr" className="flex items-end gap-3">
            <div className="size-24 rounded bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="max-w-[170px] text-[10px] leading-snug text-[#555]">
              {en ? "Verify authenticity:" : "Проверить подлинность:"}
              <br />
              <span className="font-mono break-all text-[#15296b]">{url}</span>
              <br />
              {en ? "Code" : "Код"}: <span className="font-mono font-semibold">{r.verifyCode}</span>
            </div>
          </div>
        </footer>
        <p className="relative mt-8 border-t border-[#ddd] pt-3 text-center text-[10px] text-[#777]">
          {en
            ? "Sample document."
            : `Образец документа, сформирован ${formatDateLong(issued)}.`}
        </p>
      </article>
    </div>
  );
}
