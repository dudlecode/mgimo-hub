import "server-only";
import { notFound } from "next/navigation";
import { and, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema as s } from "@/db/client";
import { requireStudent, requireUser } from "@/lib/auth/dal";
import type { Locale } from "@/lib/i18n/config";
import { localizeNews } from "@/lib/i18n/news";

export async function getUnreadCount(): Promise<number> {
  const { user } = await requireUser();
  const [{ n }] = await db
    .select({ n: count() })
    .from(s.notifications)
    .where(and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt)));
  return n;
}

const NEWS_LINK = /^\/news\/([0-9a-f-]{36})$/;

/**
 * Мои уведомления. В английском интерфейсе текст из title_en/body_en, а уведомление о новости берёт
 * заголовок и первую строку из перевода объявления; ru: перевода нет, текст русский (для атрибута lang).
 */
export async function listMyNotifications(limit = 60, locale: Locale = "ru") {
  const { user } = await requireUser();
  const rows = await db.query.notifications.findMany({
    where: eq(s.notifications.userId, user.id),
    orderBy: [desc(s.notifications.createdAt)],
    limit,
  });
  if (locale !== "en") return rows.map((n) => ({ ...n, ru: false }));
  const ids = [...new Set(rows.map((n) => (n.kind === "news" ? n.link?.match(NEWS_LINK)?.[1] : undefined)).filter((x): x is string => !!x))];
  const en = ids.length
    ? new Map(
        (await db.select({ id: s.announcements.id, titleEn: s.announcements.titleEn, bodyEn: s.announcements.bodyEn }).from(s.announcements).where(inArray(s.announcements.id, ids))).map((a) => [
          a.id,
          a,
        ]),
      )
    : new Map<string, { titleEn: string | null; bodyEn: string | null }>();
  return rows.map((n) => {
    if (n.titleEn && n.bodyEn) return { ...n, title: n.titleEn, body: n.bodyEn, ru: false };
    // новость: перевод готовит Атташе после публикации, поэтому берём его из объявления
    const a = n.kind === "news" ? en.get(n.link?.match(NEWS_LINK)?.[1] ?? "") : undefined;
    if (a?.titleEn && a.bodyEn) return { ...n, title: a.titleEn, body: a.bodyEn.split("\n")[0].slice(0, 160), ru: false };
    return { ...n, ru: true };
  });
}

/** Условие «объявление адресовано мне» */
function audienceFor(ctx: Awaited<ReturnType<typeof requireStudent>>) {
  return and(
    or(isNull(s.announcements.facultyId), eq(s.announcements.facultyId, ctx.faculty.id)),
    or(isNull(s.announcements.course), eq(s.announcements.course, ctx.group.course)),
    or(isNull(s.announcements.groupId), eq(s.announcements.groupId, ctx.group.id)),
  );
}

export async function listMyAnnouncements(limit = 30, locale: Locale = "ru") {
  const ctx = await requireStudent();
  const rows = await db.query.announcements.findMany({
    where: audienceFor(ctx),
    orderBy: [desc(s.announcements.pinned), desc(s.announcements.publishedAt)],
    limit,
  });
  return rows.map((r) => localizeNews(r, locale));
}

/** Объявление вне аудитории студента 404 */
export async function getMyAnnouncement(id: string, locale: Locale = "ru") {
  const ctx = await requireStudent();
  const row = await db.query.announcements.findFirst({ where: and(eq(s.announcements.id, id), audienceFor(ctx)) });
  if (!row) notFound();
  return localizeNews(row, locale);
}
