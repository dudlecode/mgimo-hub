import "server-only";
// Кошелёк документов: студенческий билет и готовые справки. Только свои, по student.id из сессии.
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";
import { getRequestType } from "@/lib/requests/catalog";
import { qrSvg, verifyUrl } from "@/lib/data/documents";

/** Электронный студенческий билет. Без телефона, почты и даты рождения. */
export async function getMyStudentCard() {
  const { student, group, faculty } = await requireStudent();
  return {
    lastName: student.lastName,
    firstName: student.firstName,
    middleName: student.middleName,
    number: student.studentCard,
    validUntil: `31.08.${student.enrollmentYear + 4}`,
    group: group.code,
    course: group.course,
    faculty: faculty.name,
    facultyCode: faculty.code,
    qr: await qrSvg(`MGIMO-HUB-STUDENT-CARD:${student.studentCard}`),
  };
}

export type WalletDocument = {
  id: string;
  title: string;
  number: string;
  issuedAt: Date;
  /** Бланк с QR есть только у документов с кодом проверки */
  href: string;
  hasBlank: boolean;
  qr: string | null;
  /** Публичная страница проверки по QR (та же, что открывает сканер) */
  verifyHref: string | null;
};

/** Мои готовые документы: заявки ready/completed с номером документа или кодом проверки. */
export async function listMyWalletDocuments(): Promise<WalletDocument[]> {
  const { student } = await requireStudent();
  const rows = await db
    .select({
      id: s.requests.id,
      type: s.requests.type,
      number: s.requests.number,
      documentNo: s.requests.documentNo,
      verifyCode: s.requests.verifyCode,
      readyAt: s.requests.readyAt,
      updatedAt: s.requests.updatedAt,
    })
    .from(s.requests)
    .where(
      and(
        eq(s.requests.studentId, student.id),
        inArray(s.requests.status, ["ready", "completed"]),
        or(isNotNull(s.requests.documentNo), isNotNull(s.requests.verifyCode)),
      ),
    )
    .orderBy(desc(s.requests.readyAt), desc(s.requests.updatedAt))
    .limit(50);

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: getRequestType(r.type)?.title ?? "Документ",
      number: r.documentNo ?? r.number,
      issuedAt: r.readyAt ?? r.updatedAt,
      href: r.verifyCode ? `/requests/${r.id}/document` : `/requests/${r.id}`,
      hasBlank: !!r.verifyCode,
      qr: r.verifyCode ? await qrSvg(await verifyUrl(r.verifyCode)) : null,
      verifyHref: r.verifyCode ? `/verify/${r.verifyCode}` : null,
    })),
  );
}
