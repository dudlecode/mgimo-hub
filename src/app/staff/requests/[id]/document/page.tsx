import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScopedRequest, getScopedTranscript } from "@/lib/data/staff";
import { qrSvg, verifyUrl } from "@/lib/data/documents";
import { CertificateView } from "@/components/feature/certificate";
import { auditView } from "@/lib/audit";

export const metadata: Metadata = { title: "Справка для печати" };

// Сотрудник открывает и печатает справку по заявке своей области (бумажная выдача, проверка перед подписью).
export default async function StaffDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getScopedRequest(id); // вне области сотрудника → 404
  if (!r.verifyCode || !["ready", "completed"].includes(r.status)) notFound();
  const url = await verifyUrl(r.verifyCode);
  const qr = await qrSvg(url);
  const transcript = r.type === "transcript" ? await getScopedTranscript(id) : [];
  await auditView({ action: "certificate.print", entityType: "request", entityId: r.id, studentId: r.student.id, summary: `Открыта справка ${r.number} для печати` });
  return (
    <CertificateView
      r={r}
      student={r.student}
      group={r.student.group}
      faculty={r.student.group.faculty}
      transcript={transcript}
      url={url}
      qr={qr}
      backHref={`/staff/requests/${r.id}`}
      backLabel="К заявке"
    />
  );
}
