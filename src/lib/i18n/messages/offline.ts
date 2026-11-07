// Работа без сети: страница /offline, плашка «Нет сети», сохранённые страницы, отметка «Доступно без сети».
import { defineMessages } from "../define";

export const offlineMessages = defineMessages(
  {
    title: "Нет сети",
    text: "Эта страница ещё не сохранена на устройстве. Расписание, документы и профиль открываются без сети, если вы заходили в них раньше.",
    saved: "Сохранено на устройстве",
    retry: "Попробовать снова",
    savedAt: (time: string) => `сохранено в ${time}`,
    savedOn: (date: string, time: string) => `сохранено ${date}, ${time}`,
    nothingSaved: "На этом устройстве пока ничего не сохранено. Откройте расписание и документы, когда будет сеть, и они станут доступны без неё.",
    bannerCopy: "Показана сохранённая версия",
    bannerOffline: "Нет сети. Показаны данные",
    bannerFrom: "от",
    refresh: "Обновить",
    available: "Доступно без сети",
  },
  {
    title: "No connection",
    text: "This page is not saved on your device yet. Your schedule, documents and profile open offline if you have visited them before.",
    saved: "Saved on this device",
    retry: "Try again",
    savedAt: (time) => `saved at ${time}`,
    savedOn: (date, time) => `saved ${date}, ${time}`,
    nothingSaved: "Nothing is saved on this device yet. Open your schedule and documents while you are online, and they will be available offline.",
    bannerCopy: "Showing a saved version",
    bannerOffline: "No connection. Showing data",
    bannerFrom: "from",
    refresh: "Refresh",
    available: "Available offline",
  },
);
