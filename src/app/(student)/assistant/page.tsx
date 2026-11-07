import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth/dal";
import { aiProvider } from "@/lib/assistant/providers";
import { Chat } from "./chat";
import { getLocale } from "@/lib/i18n/server";
import { assistantMessages } from "@/lib/i18n/messages/assistant";
import { personName } from "@/lib/i18n/translit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: assistantMessages[await getLocale()].title };
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { student } = await requireStudent();
  const { q } = await searchParams;
  const locale = await getLocale();
  return <Chat firstName={personName(student.firstName, locale)} initialQuestion={q?.slice(0, 500)} aiLabel={aiProvider()?.label ?? null} />;
}
