import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarClock, FolderLock, HeartPulse, IdCard, Laptop, LogOut, Smartphone, Wallet } from "lucide-react";
import { requireStudent } from "@/lib/auth/dal";
import { listSessions } from "@/lib/auth/session";
import { logoutAction, terminateOtherSessionsAction, terminateSessionAction } from "@/lib/auth/actions";
import { campusInfo, type Campus } from "@/lib/academic";
import { formatDateTime, relativeTime } from "@/lib/time";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { fullName, maskPhone } from "@/lib/utils";
import { Reveal } from "./reveal";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { profileMessages } from "@/lib/i18n/messages/profile";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { OfficeHours } from "@/components/feature/office-hours";
import { codeName, personName } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(profileMessages)).title };
}

function device(ua: string | null, t: { device: string; browser: string; yandex: string }) {
  const s = ua ?? "";
  const os = /iPhone|iPad/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "macOS" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : t.device;
  const br = /YaBrowser/.test(s) ? t.yandex : /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : t.browser;
  return { label: `${br}, ${os}`, mobile: /iPhone|Android|Mobile/.test(s) };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="mt-1 text-[14px]">{children}</dd>
    </div>
  );
}

export default async function ProfilePage() {
  const { student, group, faculty, session, user } = await requireStudent();
  const sessions = await listSessions(user.id);
  const now = new Date();
  const languages = [...student.languages].sort((a, b) => a.order - b.order);
  const locale = await getLocale();
  const t = await getMessages(profileMessages);
  const en = locale === "en";
  const campus = campusInfo(group.campus as Campus, locale);
  const facultyName = en ? (faculty.nameEn ?? faculty.name) : faculty.name;
  // данные из БД, у которых нет перевода: помечаем языком, чтобы экранный диктор читал их по-русски
  const ruLang = en ? "ru" : undefined;

  return (
    <div>
      <PageHeader
        title={t.title}
        subtitle={`${facultyName}, ${codeName(group.code, locale)}`}
        actions={
          <ButtonLink href="/documents#student-card" variant="secondary" size="sm">
            <IdCard className="size-4 text-ink-3" aria-hidden />
            {t.cardLink}
          </ButtonLink>
        }
      />

      {/* На телефоне нет сайдбара: дополнительные разделы собраны здесь */}
      <nav aria-label={t.services} className="mb-12 lg:hidden">
        <SectionTitle>{t.services}</SectionTitle>
        <Card className="grid grid-cols-2 overflow-hidden [&>*]:border-line [&>*:nth-child(odd)]:border-r [&>*:not(:nth-last-child(-n+2))]:border-b">
          {[
            { href: "/appointments", label: t.svcAppointments, icon: CalendarClock },
            { href: "/documents", label: t.svcDocuments, icon: FolderLock },
            { href: "/sick-leave", label: t.svcSick, icon: HeartPulse },
            student.funding === "contract" ? { href: "/payments", label: t.svcPayments, icon: Wallet } : { href: "/notifications", label: t.svcNotifications, icon: Bell },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex min-h-14 items-center gap-2.5 px-4 py-3.5 text-[14px] transition-colors hover:bg-surface-1">
              <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden />
              <span className="min-w-0">{label}</span>
            </Link>
          ))}
        </Card>
      </nav>

      <section>
        <SectionTitle>{t.study}</SectionTitle>
        <Card>
          <dl className="grid grid-cols-[minmax(0,1fr)] divide-y divide-line sm:grid-cols-2 sm:divide-y-0 sm:[&>*]:border-b sm:[&>*]:border-line sm:[&>*:nth-child(odd)]:border-r sm:[&>*:nth-last-child(-n+2)]:border-b-0">
            <Row label={t.fullName}>
              {en ? (
                <>
                  {personName(fullName(student), locale)}
                  <span className="mt-0.5 block text-[12px] text-ink-3" lang="ru">
                    {fullName(student)}
                  </span>
                </>
              ) : (
                fullName(student)
              )}
            </Row>
            <Row label={t.faculty}>{facultyName}</Row>
            <Row label={t.program}>
              <span className="font-mono">{group.programCode}</span> <span lang={ruLang}>{group.programName}</span>
            </Row>
            <Row label={t.profile}>{group.profileName ? <span lang={ruLang}>{group.profileName}</span> : t.profileLater}</Row>
            <Row label={t.courseAndGroup}>{t.courseGroup(group.course, codeName(group.code, locale))}</Row>
            <Row label={t.formAndBasis}>
              {t.studyForm(student.studyForm)}, {t.funding(student.funding)}
            </Row>
            <Row label={t.languages}>{languages.map((l) => `${t.languageName(l.name)} ${l.level}`).join(", ")}</Row>
            <Row label={t.recordBook}>
              <Reveal value={student.recordBook} masked={`•••${student.recordBook.slice(-3)}`} />
            </Row>
          </dl>
        </Card>
      </section>

      <section className="mt-12">
        <SectionTitle>{t.office(codeName(faculty.code, locale))}</SectionTitle>
        <Card>
          <dl className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-4">
            {(
              [
                [
                  t.where,
                  <>
                    {t.room} <span className="font-mono">{faculty.officeRoom}</span>, {campusInfo(faculty.campus as Campus, locale).building}
                  </>,
                ],
                [t.hours, <OfficeHours key="hours" value={faculty.officeHours} locale={locale} now={now} />],
                [t.phone, faculty.officePhone],
                [t.email, faculty.officeEmail],
              ] as [string, React.ReactNode][]
            ).map(([label, value]) => (
              <div key={label} className="border-line px-5 py-4 [&:not(:last-child)]:border-b lg:[&:not(:last-child)]:border-r lg:[&:not(:last-child)]:border-b-0">
                <dt className="text-[12px] text-ink-3">{label}</dt>
                <dd className="mt-1 text-[14px] break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
            <span className="text-[13px] text-ink-3">{t.bookHint}</span>
            <ButtonLink href="/appointments" variant="secondary" size="sm">
              {t.book}
            </ButtonLink>
          </div>
        </Card>
      </section>

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2 lg:gap-6">
        <section className="flex flex-col">
          <SectionTitle>{t.contacts}</SectionTitle>
          <Card className="flex-1">
            <dl className="divide-y divide-line">
              <Row label={t.email}>{student.email}</Row>
              <Row label={t.phone}>
                <Reveal value={student.phone} masked={maskPhone(student.phone)} />
              </Row>
              <Row label={t.campus}>
                {campus.label}, {campus.address}
              </Row>
            </dl>
          </Card>
        </section>

        <section className="flex flex-col">
          <SectionTitle count={sessions.length}>{t.sessions}</SectionTitle>
          <Card className="flex flex-1 flex-col">
            <ul className="divide-y divide-line stagger-rows">
              {sessions.map((s) => {
                const d = device(s.userAgent, t);
                const current = s.id === session.sessionId;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-4">
                    {d.mobile ? <Smartphone className="size-4 shrink-0 text-ink-3" /> : <Laptop className="size-4 shrink-0 text-ink-3" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px]">{d.label}</div>
                      <div className="text-[12px] text-ink-3">{current ? t.thisDevice : t.activity(relativeTime(s.lastSeenAt, now, locale))}</div>
                    </div>
                    {!current && (
                      <form action={terminateSessionAction}>
                        <input type="hidden" name="sessionId" value={s.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {t.terminate}
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-[12px] text-ink-3">
              <span>{user.lastLoginAt ? t.lastLogin(formatDateTime(user.lastLoginAt, locale)) : t.hashOnly}</span>
              {sessions.length > 1 && (
                <form action={terminateOtherSessionsAction}>
                  <Button type="submit" variant="secondary" size="sm">
                    {t.terminateOthers}
                  </Button>
                </form>
              )}
            </div>
          </Card>
        </section>
      </div>

      <section className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LanguageSwitch variant="inline" />
          <ThemeSwitch className="size-9 bg-surface-2" />
          <span className="text-[13px] text-ink-3">{t.settingsHint}</span>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="danger">
            <LogOut className="size-4" aria-hidden />
            {t.logout}
          </Button>
        </form>
      </section>
    </div>
  );
}
