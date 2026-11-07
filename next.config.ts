import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: всё грузится только с нашего домена, внешних скриптов нет.
// 'unsafe-inline' для script нужен Next.js для инлайн-гидратации; 'unsafe-eval', только в dev (React Refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // service worker (public/sw.js) и манифест PWA, только со своего домена
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Самодостаточная сборка для Docker (node server.js)
  output: "standalone",
  poweredByHeader: false,
  // без плавающего значка Next.js в режиме разработки
  devIndicators: false,
  // Кабинет полностью персональный: каждая страница зависит от сессии,
  // поэтому используем классический динамический рендеринг (без cacheComponents).
  // Стриминг и скелетоны, через loading.tsx.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Скан справки о болезни: песочница без скриптов и без реферера. Правило стоит после общего,
      // потому что при совпадении ключа побеждает последнее (иначе общий CSP перезапишет заголовок маршрута).
      {
        source: "/api/sick-leave/files/:id",
        headers: [
          { key: "Content-Security-Policy", value: "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      // Service worker: всегда свежая версия и правильный тип, иначе браузер его не зарегистрирует
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
