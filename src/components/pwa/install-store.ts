// Событие beforeinstallprompt (Chrome, Edge, Android) приходит один раз и рано, поэтому ловим его
// сразу при загрузке (из PwaRegister) и храним здесь, пока пользователь не откроет нужный экран.

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
let started = false;

const emit = () => listeners.forEach((l) => l());

export function startInstallCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function subscribeInstall(cb: () => void) {
  startInstallCapture();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const canInstall = () => deferred !== null && !installed;
export const canInstallServer = () => false;

export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome === "accepted";
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  // iPadOS представляется как Mac с сенсорным экраном
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
