// Человекочитаемое отображение полей заявки (для студента, сотрудника и документа).
import { getRequestType, type RequestTypeDef } from "./catalog";
import { formatDateLong, parseDayKey } from "@/lib/time";

export function displayFields(typeSlug: string, fields: Record<string, string>): { label: string; value: string }[] {
  const def: RequestTypeDef | undefined = getRequestType(typeSlug);
  if (!def) return [];
  const out: { label: string; value: string }[] = [];
  for (const f of def.fields) {
    const raw = fields[f.name];
    if (!raw) continue;
    let value = raw;
    if (f.type === "select") value = f.options?.find((o) => o.value === raw)?.label ?? raw;
    else if (f.type === "date") {
      const d = parseDayKey(raw);
      value = d ? formatDateLong(d) : raw;
    } else if (f.type === "myCourse" || f.type === "myDebt") value = fields[`${f.name}Title`] ?? "не указано";
    out.push({ label: f.label, value });
  }
  return out;
}
