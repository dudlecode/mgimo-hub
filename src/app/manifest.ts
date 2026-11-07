import type { MetadataRoute } from "next";

// PWA: кабинет можно установить на телефон как приложение
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MGIMO Hub",
    short_name: "MGIMO Hub",
    description: "Личный кабинет студента: расписание, баллы, справки и связь с деканатом.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    lang: "ru",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
