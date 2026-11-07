import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { DEMO_STAFF, DEMO_STUDENTS } from "@/db/seed/data";
import type { DemoAccount } from "./login-form";
import { LoginStage } from "./login-stage";
import { LoginCleanup } from "@/components/pwa/login-cleanup";
import { getMessages } from "@/lib/i18n/server";
import { loginMessages } from "@/lib/i18n/messages/login";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(loginMessages)).metaTitle };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getCurrentSession();
  if (session) redirect(session.user.role === "staff" ? "/staff" : "/");
  const { next } = await searchParams;
  const d = (await getMessages(loginMessages)).demo;

  const demo: DemoAccount[] | null =
    process.env.DEMO_MODE === "false"
      ? null
      : [
          { login: DEMO_STUDENTS[0].login, password: DEMO_STUDENTS[0].password, ...d.anna },
          { login: DEMO_STUDENTS[1].login, password: DEMO_STUDENTS[1].password, ...d.timur },
          { login: DEMO_STUDENTS[2].login, password: DEMO_STUDENTS[2].password, ...d.leyla },
          { login: DEMO_STAFF[0].login, password: DEMO_STAFF[0].password, ...d.office, staff: true },
          { login: DEMO_STAFF[1].login, password: DEMO_STAFF[1].password, ...d.meo, staff: true },
        ];

  return (
    <>
      <LoginCleanup />
      <LoginStage next={next} demo={demo} />
    </>
  );
}
