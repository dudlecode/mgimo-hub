"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useMessages } from "@/lib/i18n/client";
import { loginMessages } from "@/lib/i18n/messages/login";

export type DemoAccount = { login: string; password: string; title: string; note: string; staff?: boolean };

function Submit() {
  const { pending } = useFormStatus();
  const t = useMessages(loginMessages);
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {pending ? t.submitting : t.submit}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, undefined);
  const [show, setShow] = useState(false);
  const t = useMessages(loginMessages);
  const error = state?.error ? t.error(state.error) : undefined;

  return (
    <form id="login-form" action={action} className="mt-8 space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label={t.login} htmlFor="login" error={state?.field === "login" ? error : undefined}>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={state?.login}
          placeholder={t.loginPlaceholder}
          className="h-11"
          aria-invalid={state?.field === "login" || undefined}
          required
        />
      </Field>
      <Field label={t.password} htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            className="h-11 pr-10"
            aria-invalid={state?.field === "password" || undefined}
            aria-describedby={state?.error ? "login-error" : undefined}
            required
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-[6px] text-ink-3 hover:bg-surface-2 hover:text-ink"
            aria-label={show ? t.hidePassword : t.showPassword}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <div aria-live="polite">
        {state?.error && state.field !== "login" && (
          <p id="login-error" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>

      <Submit />
    </form>
  );
}

/** Быстрый вход для жюри: заполняет форму и отправляет её. */
function quickLogin(a: DemoAccount) {
  const form = document.getElementById("login-form") as HTMLFormElement | null;
  if (!form) return;
  (form.elements.namedItem("login") as HTMLInputElement).value = a.login;
  (form.elements.namedItem("password") as HTMLInputElement).value = a.password;
  form.requestSubmit();
}

export function DemoAccess({ demo }: { demo: DemoAccount[] }) {
  const t = useMessages(loginMessages).demo;
  const groups = [
    { title: t.students, items: demo.filter((d) => !d.staff) },
    { title: t.staff, items: demo.filter((d) => d.staff) },
  ];
  return (
    <section className="mt-10" aria-label={t.aria}>
      <div className="mb-3 flex items-center gap-3 text-[12px] text-ink-3">
        <span className="h-px flex-1 bg-line" />
        {t.divider}
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 text-[12px] font-medium text-ink-3">{g.title}</div>
            <div className={cn("grid gap-1.5", g.items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
              {g.items.map((a) => (
                <button
                  key={a.login}
                  type="button"
                  onClick={() => quickLogin(a)}
                  className="min-w-0 rounded-[8px] border border-line bg-bg px-2.5 py-2 text-left transition-colors hover:border-ink-3 hover:bg-surface-1"
                  title={`${a.title}, ${a.note}`}
                >
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[13px] font-medium">{a.title}</span>
                    <span className="block truncate text-[11px] text-ink-3">{a.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <details className="mt-3 text-[12px] text-ink-3">
        <summary className="cursor-pointer list-none hover:text-ink-2">{t.credentials}</summary>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-[11px]">
          {demo.map((a) => (
            <div key={a.login} className="contents">
              <dt className="text-ink-2">{a.login}</dt>
              <dd className="text-ink-3">{a.password}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
