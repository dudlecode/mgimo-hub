import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

/** Анна Дмитриевна Орлова Орлова А. Д. */
export function shortName(p: { lastName: string; firstName: string; middleName?: string | null }) {
  return `${p.lastName} ${p.firstName[0]}.${p.middleName ? ` ${p.middleName[0]}.` : ""}`;
}

export function fullName(p: { lastName: string; firstName: string; middleName?: string | null }) {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
}

/** +7 (900) 012-34-56 +7 (900) •••-••-56 */
export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  return `+${digits[0]} (${digits.slice(1, 4)}) •••-••-${digits.slice(-2)}`;
}

export function maskTail(value: string, visible = 3) {
  if (value.length <= visible) return value;
  return "•".repeat(Math.max(3, value.length - visible)) + value.slice(-visible);
}

/** 12,5 / 12.5: в английском интерфейсе десятичная точка */
export function formatPoints(n: number, locale: "ru" | "en" = "ru") {
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(1);
  return locale === "en" ? s : s.replace(".", ",");
}
