import "server-only";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema as s } from "@/db/client";
import { requireStudent } from "@/lib/auth/dal";
import { normalizeVerifyCode } from "@/lib/requests/codes";

/** Документ по своей заявке. Чужая заявка, не готовая или без кода 404. */
export async function getMyDocument(requestId: string) {
  const { student, group, faculty } = await requireStudent();
  const r = await db.query.requests.findFirst({
    where: and(eq(s.requests.id, requestId), eq(s.requests.studentId, student.id), inArray(s.requests.status, ["ready", "completed"])),
    with: { assignedStaff: { columns: { firstName: true, lastName: true, middleName: true, position: true } } },
  });
  if (!r || !r.verifyCode) notFound();
  return { request: r, student, group, faculty };
}

async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function verifyUrl(code: string) {
  return `${await appOrigin()}/verify/${code}`;
}

export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0f1834", light: "#ffffff00" } });
}

/** Публичная проверка: возвращает только минимум данных. */
export async function verifyDocument(rawCode: string) {
  const code = normalizeVerifyCode(rawCode);
  if (!code) return null;
  const r = await db.query.requests.findFirst({
    where: and(eq(s.requests.verifyCode, code), inArray(s.requests.status, ["ready", "completed"])),
    columns: { type: true, documentNo: true, readyAt: true, status: true },
    with: {
      student: {
        columns: { lastName: true, firstName: true, middleName: true },
        with: { group: { columns: { course: true }, with: { faculty: { columns: { name: true, nameEn: true } } } } },
      },
    },
  });
  if (!r) return null;
  const st = r.student;
  return {
    code,
    type: r.type,
    documentNo: r.documentNo,
    issuedAt: r.readyAt,
    holder: `${st.lastName} ${st.firstName[0]}.${st.middleName ? ` ${st.middleName[0]}.` : ""}`,
    faculty: st.group.faculty.name,
    facultyEn: st.group.faculty.nameEn,
    course: st.group.course,
  };
}
