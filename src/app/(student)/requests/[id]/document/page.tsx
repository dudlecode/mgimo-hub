import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getMyDocument, qrSvg, verifyUrl } from "@/lib/data/documents";
import { getTranscript } from "@/lib/data/grades";
import { CertificateView } from "@/components/feature/certificate";
import { getLocale } from "@/lib/i18n/server";
import { requestsMessages } from "@/lib/i18n/messages/requests";
import { getRequestType } from "@/lib/requests/catalog";
import { localizeRequestTitle } from "@/lib/requests/catalog-en";

// Заголовок с названием и номером: в списке сохранённых без сети страниц справки не сливаются в одинаковые «Справка»
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const locale = await getLocale();
  const fallback = requestsMessages[locale].certificateTitle;
  if (!z.string().uuid().safeParse(id).success) return { title: fallback };
  const { request: r } = await getMyDocument(id);
  return { title: `${localizeRequestTitle(getRequestType(r.type)?.title ?? fallback, locale)} ${r.number}` };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { request: r, student, group, faculty } = await getMyDocument(id);
  const url = await verifyUrl(r.verifyCode!);
  const qr = await qrSvg(url);
  // Названия дисциплин в официальном документе всегда русские (английская выписка переводит их сама)
  const transcript = r.type === "transcript" ? await getTranscript("ru") : [];
  const t = requestsMessages[await getLocale()];
  // Бланк справки остаётся официальным документом на своём языке, переводим только ссылку и кнопку вокруг
  return <CertificateView r={r} student={student} group={group} faculty={faculty} transcript={transcript} url={url} qr={qr} backHref={`/requests/${r.id}`} backLabel={t.backToRequest} />;
}
