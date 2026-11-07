// Просмотр справки о болезни. Владельцу и сотруднику, в чьей области студент; всем остальным 404.
// Персональные данные: не кэшируется, открывается в песочнице без скриптов.
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getSickFileForViewer } from "@/lib/data/sick-leave";
import { asciiFileName } from "@/lib/sick-leave-file";
import { periodLabel } from "@/lib/sick-leave";
import { auditView } from "@/lib/audit";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf" };

const notFound = () => NextResponse.json({ error: "Не найдено" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const { id } = await params;
  const file = await getSickFileForViewer(id);
  if (!file) return notFound();
  // тип записан при загрузке по сигнатуре файла; всё, что не из белого списка, не отдаём
  const ext = TYPES[file.mimeType];
  if (!ext) return notFound();
  if (session.user.role === "staff") {
    await auditView({ action: "file.view", entityType: "sick_leave_file", entityId: id, studentId: file.studentId, summary: `Открыт файл справки о болезни ${periodLabel(file.startsOn, file.endsOn)}` });
  }

  const name = file.fileName.endsWith(`.${ext}`) ? file.fileName : `spravka.${ext}`;
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.length),
      // PDF скачивается и открывается системной программой: встроенный просмотрщик браузера не работает в песочнице CSP.
      // Картинки показываются прямо во вкладке, в песочнице.
      "Content-Disposition": `${ext === "pdf" ? "attachment" : "inline"}; filename="${asciiFileName(name, ext)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
