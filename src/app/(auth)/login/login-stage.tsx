"use client";

import { useEffect, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";
import { useMessages } from "@/lib/i18n/client";
import { loginMessages } from "@/lib/i18n/messages/login";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { InkCanvas } from "./ink-canvas";
import { DemoAccess, LoginForm, type DemoAccount } from "./login-form";

const KEY = "mh-intro-seen";
const EASE = [0.7, 0, 0.2, 1] as const;

function Lockup({ big }: { big?: boolean }) {
  return (
    <span className={cn("flex items-center", big ? "gap-4" : "gap-2.5")}>
      <LogoMark size={big ? 64 : 28} />
      <span className={cn("leading-none tracking-[-0.03em] whitespace-nowrap", big ? "text-[44px]" : "text-[19px]")}>
        <span className="font-semibold">MGIMO</span>
        <span className="ml-[0.18em] font-normal text-ink-2">Hub</span>
      </span>
    </span>
  );
}

export function LoginStage({ next, demo }: { next?: string; demo: DemoAccount[] | null }) {
  const [ready, setReady] = useState(false);
  const [instant, setInstant] = useState(false);
  const m = useMessages(loginMessages);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* без хранилища просто показываем заставку */
    }
    const skip = seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(
      () => {
        setInstant(skip);
        setReady(true);
        try {
          sessionStorage.setItem(KEY, "1");
        } catch {
          /* ignore */
        }
      },
      skip ? 0 : 1600,
    );
    return () => clearTimeout(id);
  }, []);

  const t = (d: number, delay = 0) => (instant ? { duration: 0 } : { duration: d, delay, ease: EASE });

  return (
    // Высоты в svh/lvh, а не dvh: на телефоне при прокрутке сворачивается адресная строка, dvh меняется,
    // и форма перецентрировалась бы, а холст чернил пересчитывал размер и «прыгал».
    <main className="relative min-h-svh overflow-hidden bg-bg">
      {/* На телефоне слой чернил часть страницы (прокручивается вместе с ней), на десктопе закреплён на экране */}
      <div className={cn("ink-layer absolute inset-x-0 top-0 lg:fixed lg:inset-0", ready && "ink-ready", instant && "ink-instant")}>
        <InkCanvas ready={ready} instant={instant} />
      </div>

      <LayoutGroup>
        {!ready && (
          <button type="button" onClick={() => setReady(true)} className="fixed inset-0 z-20 grid cursor-default place-items-center" aria-label={m.skipIntro}>
            <motion.span
              layoutId="brand"
              initial={{ opacity: 0, scale: 0.94, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.9, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Lockup big />
            </motion.span>
          </button>
        )}

        <div className="relative z-10 grid min-h-svh grid-rows-[200px_1fr] lg:grid-cols-[56%_44%] lg:grid-rows-1">
          <div aria-hidden />
          <section className="flex flex-col px-6 pb-[max(env(safe-area-inset-bottom),20px)] sm:px-12 lg:px-14">
            <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
              <div className="h-[28px]">
                {ready && (
                  <motion.span layoutId="brand" className="inline-block" transition={t(0.95)}>
                    <Lockup />
                  </motion.span>
                )}
              </div>
              <motion.div initial={false} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }} transition={t(0.7, 0.45)}>
                <h1 className="mt-12 text-[34px] leading-[1.05] font-semibold tracking-[-0.04em]">{m.title}</h1>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-3">{m.lead}</p>
                <LoginForm next={next} />
                {demo && <DemoAccess demo={demo} />}
              </motion.div>
            </div>
            <motion.div initial={false} animate={{ opacity: ready ? 1 : 0 }} transition={t(0.6, 0.7)} className="mx-auto flex w-full max-w-[380px] justify-between text-[12px] text-ink-3">
              <span>MGIMO Hub, 2026</span>
              <span>{m.footer}</span>
            </motion.div>
          </section>
        </div>
      </LayoutGroup>

      {/* Язык: в углу, появляется вместе с формой */}
      <motion.div
        initial={false}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={t(0.6, 0.7)}
        className={cn("fixed top-[max(env(safe-area-inset-top),16px)] right-4 z-30 sm:right-6", !ready && "pointer-events-none")}
      >
        <LanguageSwitch variant="inline" />
      </motion.div>
    </main>
  );
}
