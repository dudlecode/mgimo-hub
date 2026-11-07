import "server-only";
// Проверка файла справки. Тип определяется по сигнатуре (первым байтам), расширение и mime от браузера
// должны с ней совпадать. Содержимое файла нигде не логируется.
import { createHash } from "node:crypto";
import { SICK_FILE_MAX_BYTES } from "@/lib/sick-leave";

export type SickFileType = { mime: "image/jpeg" | "image/png" | "application/pdf"; ext: "jpg" | "png" | "pdf"; label: string };

const TYPES: { type: SickFileType; magic: number[]; exts: string[]; mimes: string[] }[] = [
  { type: { mime: "image/png", ext: "png", label: "PNG" }, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], exts: ["png"], mimes: ["image/png"] },
  { type: { mime: "image/jpeg", ext: "jpg", label: "JPG" }, magic: [0xff, 0xd8, 0xff], exts: ["jpg", "jpeg"], mimes: ["image/jpeg", "image/jpg", "image/pjpeg"] },
  { type: { mime: "application/pdf", ext: "pdf", label: "PDF" }, magic: [0x25, 0x50, 0x44, 0x46, 0x2d], exts: ["pdf"], mimes: ["application/pdf"] },
];

export type FileCheck =
  | { ok: true; type: SickFileType; data: Buffer; size: number; sha256: string; fileName: string }
  | { ok: false; status: 400 | 413 | 415; error: string };

function startsWith(buf: Buffer, magic: number[]) {
  if (buf.length < magic.length) return false;
  return magic.every((b, i) => buf[i] === b);
}

/** Имя файла без пути, управляющих символов и кавычек, не длиннее 60 символов, с расширением по реальному типу. */
export function safeFileName(raw: string, ext: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const stem = base
    .replace(/\.[^.]*$/, "")
    .normalize("NFC")
    // без точек внутри имени: никаких «двойных расширений» вроде scan.exe.png
    .replace(/[^\p{L}\p{N} _()-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .slice(0, 60)
    .trim();
  return `${stem || "spravka"}.${ext}`;
}

/** ASCII-имя для старых клиентов в Content-Disposition */
export function asciiFileName(name: string, ext: string): string {
  const stem = name.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._()-]/g, "_").replace(/_+/g, "_").slice(0, 60);
  return `${/[A-Za-z0-9]/.test(stem) ? stem : "spravka"}.${ext}`;
}

export async function checkSickFile(file: File): Promise<FileCheck> {
  if (file.size === 0) return { ok: false, status: 400, error: "Файл пустой" };
  if (file.size > SICK_FILE_MAX_BYTES) return { ok: false, status: 413, error: "Файл больше 5 МБ. Сожмите фото или сохраните справку в PDF" };

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length > SICK_FILE_MAX_BYTES) return { ok: false, status: 413, error: "Файл больше 5 МБ. Сожмите фото или сохраните справку в PDF" };

  const match = TYPES.find((t) => startsWith(data, t.magic));
  const notSupported = { ok: false as const, status: 415 as const, error: "Подойдут только JPG, PNG или PDF. Этот файл не похож ни на один из них" };
  if (!match) return notSupported;

  const ext = (file.name.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? "").toLowerCase();
  if (!match.exts.includes(ext)) return notSupported;
  const declared = (file.type || "").toLowerCase();
  if (declared && declared !== "application/octet-stream" && !match.mimes.includes(declared)) return notSupported;

  return {
    ok: true,
    type: match.type,
    data,
    size: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    fileName: safeFileName(file.name, match.type.ext),
  };
}
