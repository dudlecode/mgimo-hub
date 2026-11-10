"use client";

import { CHAT_STORE_KEY } from "@/lib/assistant/chat-store";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, LoaderCircle, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { LogoMark } from "@/components/logo";
import { SPRING } from "@/components/motion/presets";
import { cn } from "@/lib/utils";
import { useMessages } from "@/lib/i18n/client";
import { assistantMessages } from "@/lib/i18n/messages/assistant";

type Action = { kind: "draft" | "open"; label: string; href: string; summary?: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; actions?: Action[]; mode?: "ai" | "offline"; error?: boolean };

const STORE_KEY = CHAT_STORE_KEY;

/** Безопасный мини-рендер: **жирный** и списки «- ». Никакого HTML из ответа модели. */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="space-y-1 pl-4">
          {list.map((l, i) => (
            <li key={i} className="list-disc marker:text-ink-3">
              {inline(l)}
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^[-•]\s+/.test(t)) list.push(t.replace(/^[-•]\s+/, ""));
    else {
      flush();
      if (t) blocks.push(<p key={`p-${blocks.length}`}>{inline(t)}</p>);
    }
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i} className="font-semibold text-ink">{part.slice(2, -2)}</b> : part));
}

function Composer({ value, onChange, onSend, busy, big, inputRef }: { value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean; big?: boolean; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const t = useMessages(assistantMessages);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="rounded-[12px] border border-line-strong bg-surface transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15"
    >
      <label htmlFor="ask" className="sr-only">
        {t.askLabel}
      </label>
      <textarea
        ref={inputRef}
        id="ask"
        rows={big ? 3 : 1}
        value={value}
        maxLength={2000}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={t.placeholder}
        // Рамку фокуса рисует сама форма (focus-within), глобальная обводка :focus-visible здесь дублировала её
        style={{ outline: "none" }}
        className={cn("block w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-ink-3", big ? "px-5 pt-5" : "px-4 pt-3")}
      />
      <div className={cn("flex items-center justify-between", big ? "px-4 pb-4" : "px-3 pb-3")}>
        <span className="pl-1 text-[12px] text-ink-3">{big ? t.enterToSend : ""}</span>
        <button type="submit" disabled={!value.trim() || busy} className="grid size-8 place-items-center rounded-[7px] bg-brand text-brand-ink transition-opacity disabled:opacity-35" aria-label={t.send}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
    </form>
  );
}

export function Chat({ firstName, initialQuestion }: { firstName: string; initialQuestion?: string; aiLabel?: string | null }) {
  const t = useMessages(assistantMessages);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inited = useRef(false);
  const reduce = useReducedMotion();

  async function send(text: string, base: Msg[] = messages) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...base, { id: crypto.randomUUID(), role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.error).slice(-10).map(({ role, content }) => ({ role, content })) }),
      });
      // Ответ может прийти не JSON (сбой прокси, перезапуск сервера): показываем понятную ошибку, а не текст исключения парсера
      const data = (await res.json().catch(() => ({}))) as { error?: string; reply?: string; actions?: Action[]; mode?: Msg["mode"] };
      if (!res.ok || typeof data.reply !== "string") throw new Error(data.error ?? t.unavailable);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: data.reply ?? "", actions: data.actions, mode: data.mode }]);
    } catch (e) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: e instanceof Error && !(e instanceof TypeError) ? e.message : t.noAnswer, error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  // Один раз: восстановить историю вкладки и, если пришли с ?q=, сразу задать вопрос.
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    let restored: Msg[] = [];
    try {
      restored = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]");
    } catch {
      /* без хранилища: без истории */
    }
    if (initialQuestion) {
      // вопрос из адреса задаём один раз: без ?q обновление страницы и «Назад» не отправят его снова
      window.history.replaceState(null, "", window.location.pathname);
      send(initialQuestion, restored);
    } else setTimeout(() => setMessages(restored), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!inited.current) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore */
    }
    if (messages.length) endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages, reduce]);

  const empty = messages.length === 0 && !busy;

  if (empty) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-220px)] max-w-[720px] flex-col justify-center py-8 lg:min-h-[calc(100dvh-160px)]">
        <div className="flex items-center gap-2 text-[13px] text-ink-3">
          <LogoMark size={18} />
          {t.intro}
        </div>
        <h1 className="mt-4 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] sm:text-[38px]">{t.hello(firstName)}</h1>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-ink-2">{t.lead}</p>
        <div className="mt-10">
          <Composer value={input} onChange={setInput} onSend={() => send(input)} busy={busy} big inputRef={inputRef} />
        </div>
        <div className="stagger-rows mt-8 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          {t.suggestions.map((s) => (
            <button key={s.text} type="button" onClick={() => send(s.text)} className="rounded-[10px] border border-line px-5 py-4 text-left transition-colors hover:border-ink-3 hover:bg-surface-1">
              <span className="block text-[12px] text-ink-3">{s.topic}</span>
              <span className="mt-1.5 block text-[15px] leading-snug">{s.text}</span>
            </button>
          ))}
        </div>
        <p className="mt-10 text-[12px] text-ink-3">{t.privacy}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-220px)] max-w-[720px] flex-col lg:min-h-[calc(100dvh-160px)]">
      <div className="mb-8 flex items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMark size={22} />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">{t.name}</div>
            <div className="text-[12px] text-ink-3">{t.byYourData}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            try {
              sessionStorage.removeItem(STORE_KEY);
            } catch {
              /* ignore */
            }
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[13px] whitespace-nowrap text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t.newChat}
        </button>
      </div>

      <div className="flex-1 space-y-7" aria-live="polite">
        {messages.map((m) => (
          <motion.div key={m.id} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.smooth}>
            {m.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-[12px] bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed">{m.content}</div>
              </div>
            ) : (
              <div className="flex gap-3">
                <LogoMark size={22} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className={cn("text-[15px] leading-relaxed", m.error ? "text-danger" : "text-ink-2")}>
                    <RichText text={m.content} />
                  </div>
                  {m.actions?.map((a) => (
                    <Link key={a.href + a.label} href={a.href} className="block rounded-[10px] border border-line-strong px-4 py-3 transition-colors hover:border-brand hover:bg-surface-1">
                      <span className="block text-[14px] font-medium text-brand-fg">{a.label}</span>
                      {a.summary && <span className="mt-0.5 block truncate text-[12px] text-ink-2">{a.summary}</span>}
                      {a.kind === "draft" && <span className="mt-0.5 block text-[12px] text-ink-3">{t.draftNote}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ))}
        {busy && (
          <div className="flex items-center gap-3">
            <LogoMark size={22} />
            <div className="flex items-center gap-1.5" aria-label={t.typing}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        {/* Отступ прокрутки: последний ответ не прячется под закреплённым полем ввода и нижним меню */}
        <div ref={endRef} className="scroll-mb-[170px] lg:scroll-mb-28" />
      </div>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+68px)] mt-8 bg-bg pb-2 lg:bottom-6">
        <Composer value={input} onChange={setInput} onSend={() => send(input)} busy={busy} inputRef={inputRef} />
      </div>
    </div>
  );
}
