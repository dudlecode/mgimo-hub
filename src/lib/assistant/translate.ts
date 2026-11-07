import "server-only";
// Перевод объявления деканата на английский для иностранных студентов.
// Вызывается после публикации в фоне (after): ответ сотруднику не ждёт модель.
// Без ключа ИИ ничего не делает, объявление остаётся русским, и в английском интерфейсе оно так и показывается.
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { aiProvider, complete, extractJson } from "./providers";
import { cleanReply } from "./engine";

const SYSTEM = [
  "Ты переводчик учебного офиса университета МГИМО. Переведи объявление для иностранных студентов на английский.",
  "Ответь только JSON без пояснений: {\"title\": \"...\", \"body\": \"...\"}.",
  "Сохрани абзацы (\\n), даты, время, номера аудиторий, названия курсов и подразделений. Ничего не добавляй от себя и не сокращай.",
  "Пиши ясно и нейтрально, британская орфография. Без длинных тире и стрелок.",
].join("\n");

export async function translateAnnouncement(id: string, title: string, body: string): Promise<boolean> {
  if (!aiProvider()) return false;
  try {
    const res = await complete(SYSTEM, [{ role: "user", content: JSON.stringify({ title, body }) }], 1500);
    const json = extractJson(res.text);
    const t = typeof json?.title === "string" ? cleanReply(json.title).trim() : "";
    const b = typeof json?.body === "string" ? cleanReply(json.body).trim() : "";
    if (!t || !b) return false;
    await db
      .update(s.announcements)
      .set({ titleEn: t.slice(0, 200), bodyEn: b.slice(0, 6000) })
      .where(eq(s.announcements.id, id));
    return true;
  } catch {
    return false;
  }
}
