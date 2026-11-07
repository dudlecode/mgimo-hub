"use client";

import { useEffect } from "react";
import { swSupported } from "./sw-client";
import { startInstallCapture } from "./install-store";

// В dev SW отдаёт статику сначала из сети (network-first), чтобы не мешать HMR и Turbopack.
const SW_URL = process.env.NODE_ENV === "development" ? "/sw.js?dev=1" : "/sw.js";

/** Регистрирует service worker после загрузки страницы, не отнимая сеть у первого экрана. */
export function PwaRegister() {
  useEffect(() => {
    startInstallCapture();
    if (!swSupported()) return;
    const register = () => {
      navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" }).catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
