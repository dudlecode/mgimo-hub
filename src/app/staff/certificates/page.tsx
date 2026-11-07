import type { Metadata } from "next";
import { listScopedStudents } from "@/lib/data/staff";
import { REQUEST_TYPES } from "@/lib/requests/catalog";
import { PageHeader } from "@/components/ui/card";
import { IssueForm } from "./issue-form";
import { StaffSectionTabs } from "@/components/shell/staff-section-tabs";

export const metadata: Metadata = { title: "Генератор справок" };

export default async function CertificatesPage() {
  const students = await listScopedStudents();
  const types = REQUEST_TYPES.filter((t) => t.category === "certificate").map((t) => ({ slug: t.slug, title: t.title, delivery: t.delivery, fields: t.fields }));
  return (
    <div>
      <StaffSectionTabs section="requests" current="/staff/certificates" />
      <PageHeader title="Генератор справок" subtitle="Студент пришёл в офис: оформите справку за минуту, она сразу появится у него в кабинете" />
      <IssueForm students={students.map((s) => ({ id: s.id, label: `${s.lastName} ${s.firstName} ${s.middleName ?? ""}`.trim(), group: `${s.groupCode}, ${s.facultyCode}` }))} types={types} />
    </div>
  );
}
