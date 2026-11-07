import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { requireStaff } from "@/lib/auth/dal";
import { listScopedAnnouncements, listScopedFaculties, listScopedGroups } from "@/lib/data/staff";
import { formatDateTime, formatDayMonthShort } from "@/lib/time";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { AnnouncementForm, DeleteAnnouncement } from "./form";

export const metadata: Metadata = { title: "Объявления" };

export default async function StaffAnnouncementsPage() {
  const { staff } = await requireStaff();
  const [items, faculties, groups] = await Promise.all([listScopedAnnouncements(), listScopedFaculties(), listScopedGroups()]);
  return (
    <div>
      <PageHeader title="Объявления" subtitle="Адресно: весь университет, факультет, курс или группа. Студенты получат уведомление." />
      <AnnouncementForm
        canAll={!staff.facultyId}
        faculties={faculties.map((f) => ({ id: f.id, code: f.code, label: `${f.code}, ${f.name}` }))}
        groups={groups.map((g) => ({ id: g.id, code: g.code, label: `${g.code} (${g.faculty.code}, ${g.course} курс)`, facultyId: g.facultyId }))}
      />

      <section className="mt-12">
        <SectionTitle count={items.length}>Опубликованные</SectionTitle>
        <Card className="divide-y divide-line stagger-rows">
          {items.length ? (
            items.map((a) => {
              const canDelete = !staff.facultyId || a.facultyId === staff.facultyId;
              const first = a.body.split("\n")[0].trim();
              return (
                <article key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-5 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:px-6">
                  <time dateTime={a.publishedAt.toISOString()} className="hidden pt-0.5 font-mono text-[13px] text-ink-3 tabular sm:block">
                    {formatDayMonthShort(a.publishedAt)}
                  </time>
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {a.important && <Badge tone="danger">Важно</Badge>}
                      {a.pinned && <Badge tone="accent">Закреплено</Badge>}
                      <Badge tone="neutral">
                        {a.faculty ? a.faculty.code : "Все факультеты"}
                        {a.course ? `, ${a.course} курс` : ""}
                        {a.group ? `, ${a.group.code}` : ""}
                      </Badge>
                    </div>
                    <h3 className="text-[15px] leading-snug font-semibold">{a.title}</h3>
                    {first && <p className="mt-1 line-clamp-2 max-w-3xl text-[13px] leading-relaxed text-ink-2">{first}</p>}
                    <div className="mt-1.5 text-[12px] text-ink-3">
                      {a.authorName}, {formatDateTime(a.publishedAt)}
                    </div>
                  </div>
                  {canDelete ? <DeleteAnnouncement id={a.id} title={a.title} /> : <span />}
                </article>
              );
            })
          ) : (
            <EmptyState icon={Megaphone} title="Объявлений нет" text="Опубликуйте первое, студенты увидят его в ленте и получат уведомление." />
          )}
        </Card>
      </section>
    </div>
  );
}
