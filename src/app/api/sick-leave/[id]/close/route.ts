// Закрыть больничный: дата окончания и справка (multipart). Только свой открытый больничный, иначе 404.
// Файл проверяется по сигнатуре, хранится в БД, его содержимое не логируется.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { closeMySickLeave } from "@/lib/data/sick-leave";
import { notify } from "@/lib/data/notify";
import { checkSickFile } from "@/lib/sick-leave-file";
import { periodLabel, SICK_FILE_MAX_BYTES } from "@/lib/sick-leave";
import { parseDayKey } from "@/lib/time";
import { getLocale } from "@/lib/i18n/server";
import { localizeSickError, sickLeaveMessages } from "@/lib/i18n/messages/sick-leave";

/** Запас на служебные части multipart поверх самого файла */
const MAX_BODY = SICK_FILE_MAX_BYTES + 64 * 1024;

const Fields = z.object({
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату")
    .refine((v) => parseDayKey(v) !== null, "Укажите дату"),
});

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isFile(v: FormDataEntryValue | null): v is File {
  return typeof v === "object" && v !== null && typeof v.arrayBuffer === "function" && typeof v.name === "string" && typeof v.size === "number";
}

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const t = sickLeaveMessages[locale];
  if (!sameOrigin(req)) return json({ error: t.apiRejected }, 403);

  const session = await getCurrentSession();
  if (!session) return json({ error: t.apiSignIn }, 401);
  // сотруднику этот маршрут не нужен, не подтверждаем, что он существует
  if (session.user.role !== "student") return json({ error: t.apiNotFound }, 404);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ error: t.errFileSize }, 413);
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return json({ error: t.apiBadRequest }, 400);

  const { id } = await params;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: t.apiReadFailed }, 400);
  }

  const fields = Fields.safeParse({ endsOn: form.get("endsOn") });
  if (!fields.success) return json({ error: localizeSickError(fields.error.issues[0]?.message ?? "Укажите дату", locale), field: "endsOn" }, 400);
  const file = form.get("file");
  // File из undici не всегда instanceof глобального File, поэтому проверяем по форме объекта
  if (!isFile(file)) return json({ error: t.errAttach, field: "file" }, 400);

  const checked = await checkSickFile(file);
  if (!checked.ok) return json({ error: localizeSickError(checked.error, locale), field: "file" }, checked.status);

  const res = await closeMySickLeave(id, fields.data.endsOn, {
    fileName: checked.fileName,
    mimeType: checked.type.mime,
    size: checked.size,
    sha256: checked.sha256,
    data: checked.data,
  });
  if (!res.ok) return json({ error: localizeSickError(res.error, locale), field: res.status === 400 ? "endsOn" : undefined }, res.status);

  if (res.staffUserIds.length) {
    await notify(
      res.staffUserIds.map((userId) => ({
        userId,
        kind: "health" as const,
        title: "Справка на проверке",
        body: `${res.who}: больничный ${periodLabel(res.startsOn, res.endsOn)}, справка приложена.`,
        link: "/staff/sick-leaves",
      })),
    );
  }
  return json({ ok: true });
}
