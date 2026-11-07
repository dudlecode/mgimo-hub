"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { activeWorker } from "./sw-client";
import { canInstall, canInstallServer, isIOS, isStandalone, promptInstall, subscribeInstall } from "./install-store";
import { useMessages } from "@/lib/i18n/client";
import { notificationsMessages } from "@/lib/i18n/messages/notifications";

type Status = "loading" | "unsupported" | "ios-install" | "server-off" | "denied" | "off" | "on";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, vapidKey: string) {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = keyBytes(vapidKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function registration() {
  const sw = await activeWorker(6000);
  if (!sw) return null;
  return navigator.serviceWorker.getRegistration();
}

async function errorText(res: Response, fallback: string) {
  const data: unknown = await res.json().catch(() => null);
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return fallback;
}

function send(method: "POST" | "DELETE", url: string, body: unknown) {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
}

async function detect(vapidKey: string | null): Promise<{ status: Exclude<Status, "loading">; endpoint: string | null }> {
  const ios = isIOS() && !isStandalone();
  if (!("serviceWorker" in navigator) || !window.isSecureContext || !("PushManager" in window) || !("Notification" in window)) {
    return { status: ios ? "ios-install" : "unsupported", endpoint: null };
  }
  if (!vapidKey) return { status: "server-off", endpoint: null };
  if (Notification.permission === "denied") return { status: "denied", endpoint: null };
  const reg = await registration();
  if (!reg) return { status: "unsupported", endpoint: null };
  const sub = await reg.pushManager.getSubscription();
  if (!sub || Notification.permission !== "granted" || !sameKey(sub, vapidKey)) return { status: "off", endpoint: null };
  // Напоминаем серверу об этом устройстве: подписка привязывается к тому, кто сейчас вошёл
  void send("POST", "/api/push/subscribe", sub.toJSON()).catch(() => {});
  return { status: "on", endpoint: sub.endpoint };
}

/** Карточка «Уведомления на телефон»: включить, выключить, проверить, установить приложение. */
export function PushCard({ vapidKey }: { vapidKey: string | null }) {
  const t = useMessages(notificationsMessages);
  const [status, setStatus] = useState<Status>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "on" | "off" | "test" | "install">(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const installable = useSyncExternalStore(subscribeInstall, canInstall, canInstallServer);

  useEffect(() => {
    let alive = true;
    void detect(vapidKey)
      .catch(() => ({ status: "unsupported" as const, endpoint: null }))
      .then((r) => {
        if (!alive) return;
        setStatus(r.status);
        setEndpoint(r.endpoint);
        setShowIosHint(r.status !== "ios-install" && !(isIOS() && isStandalone()));
      });
    return () => {
      alive = false;
    };
  }, [vapidKey]);

  async function enable() {
    if (!vapidKey) return;
    setBusy("on");
    try {
      // Разрешение спрашиваем только по нажатию (Safari иначе откажет)
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      if (!reg) throw new Error(t.pushPrepareFailed);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, vapidKey)) {
        await sub.unsubscribe().catch(() => false);
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) });
      const res = await send("POST", "/api/push/subscribe", sub.toJSON());
      if (!res.ok) {
        const message = await errorText(res, t.pushFailed);
        await sub.unsubscribe().catch(() => false);
        throw new Error(message);
      }
      setEndpoint(sub.endpoint);
      setStatus("on");
      toast.success(t.pushEnabled);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t.pushEnableFailed);
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("off");
    try {
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await send("DELETE", "/api/push/subscribe", { endpoint: sub.endpoint }).catch(() => null);
        await sub.unsubscribe().catch(() => false);
      }
      setEndpoint(null);
      setStatus("off");
      toast(t.pushDisabled);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const res = await send("POST", "/api/push/test", endpoint ? { endpoint } : {});
      if (res.ok) toast.success(t.pushTestSent);
      else toast.error(await errorText(res, t.pushFailed));
    } catch {
      toast.error(t.pushNoConnection);
    } finally {
      setBusy(null);
    }
  }

  async function install() {
    setBusy("install");
    try {
      if (await promptInstall()) toast.success(t.appInstalled);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="push-title" className="mb-8">
      <Card className="divide-y divide-line">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-0 flex-1 basis-64">
            <h2 id="push-title" className="text-[14px] font-semibold text-ink">
              {t.pushTitle}
            </h2>
            {status === "loading" ? (
              <Skeleton className="mt-1.5 h-4 w-full max-w-sm" />
            ) : (
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3" aria-live="polite">
                {t.pushText[status]}
              </p>
            )}
          </div>
          {(status === "off" || status === "on") && (
            <div className="flex flex-wrap items-center gap-2">
              {status === "off" ? (
                <Button size="sm" onClick={enable} disabled={busy !== null}>
                  {busy === "on" ? t.enabling : t.enable}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={test} disabled={busy !== null}>
                    {busy === "test" ? t.testing : t.test}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={disable} disabled={busy !== null}>
                    {busy === "off" ? t.disabling : t.disable}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {installable && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
            <p className="min-w-0 flex-1 basis-64 text-[13px] leading-relaxed text-ink-3">
              {t.installText}
            </p>
            <Button size="sm" variant="secondary" onClick={install} disabled={busy !== null}>
              {t.install}
            </Button>
          </div>
        )}

        {showIosHint && (
          <p className="px-5 py-3 text-[12px] leading-relaxed text-ink-3">{t.iosHint}</p>
        )}
      </Card>
    </section>
  );
}
