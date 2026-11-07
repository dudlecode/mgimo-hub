// Proxy (бывший middleware): быстрая «оптимистичная» проверка, есть ли cookie сессии.
// Настоящая проверка сессии и роли, на сервере в src/lib/auth/dal.ts (рядом с данными).
import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_PATHS, SESSION_COOKIE } from "@/lib/auth/constants";

const PWA_PUBLIC_PATHS = ["/sw.js", "/offline"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    // PWA: service worker и офлайн-страница должны открываться и без входа (после выхода тоже)
    PWA_PUBLIC_PATHS.includes(pathname);
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (!hasSession && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
