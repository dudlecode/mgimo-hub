import { randomBytes } from "node:crypto";

// Без похожих символов (0/O, 1/I/L), чтобы код можно было продиктовать или ввести вручную.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Код проверки подлинности документа: 12 символов (≈ 59 бит), формат XXXX-XXXX-XXXX. */
export function randomVerifyCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 3 || i === 7) out += "-";
  }
  return out;
}

export function normalizeVerifyCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 12 || [...clean].some((c) => !ALPHABET.includes(c))) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
}

/** Исходящий номер документа: 26-МО/01042 */
export function documentNumber(facultyCode: string, requestNumber: string, at: Date = new Date()): string {
  const yy = String(at.getUTCFullYear()).slice(2);
  const seq = requestNumber.replace(/\D/g, "").slice(-5);
  return `${yy}-${facultyCode}/${seq}`;
}
