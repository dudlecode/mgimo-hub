"use client";

import { useEffect } from "react";
import { CHAT_STORE_KEY } from "@/lib/assistant/chat-store";
import { clearPageCaches, swSupported } from "./sw-client";

/**
 * На странице входа на устройстве никто не вошёл. Стираем сохранённые персональные страницы,
 * переписку с Атташе в этой вкладке и отписываем устройство от push, чтобы следующий пользователь
 * не увидел чужие данные и не получал чужие уведомления. Подписку на сервере удалит push-сервис (410).
 */
export function LoginCleanup() {
  useEffect(() => {
    void clearPageCaches();
    try {
      sessionStorage.removeItem(CHAT_STORE_KEY);
    } catch {
      /* хранилище недоступно: чистить нечего */
    }
    if (!swSupported()) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager?.getSubscription())
      .then((sub) => sub?.unsubscribe())
      .catch(() => {});
  }, []);
  return null;
}
