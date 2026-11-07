import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: { default: "MGIMO Hub", template: "%s · MGIMO Hub" },
  description:
    "Личный кабинет студента: расписание, баллы, справки и связь с деканатом в одном месте.",
  applicationName: "MGIMO Hub",
  appleWebApp: { capable: true, title: "MGIMO Hub", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg text-[14px] text-ink">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
