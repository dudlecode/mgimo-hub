// JSON-вход: для автотестов безопасности и будущих мобильных клиентов.
// Та же логика, что и у формы: argon2id, лимит попыток, одинаковое время ответа.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { attemptLogin } from "@/lib/auth/login";
import { isForeignOrigin } from "@/lib/auth/origin";
import { clientIp, createSession } from "@/lib/auth/session";

const Body = z.object({ login: z.string().min(1).max(64), password: z.string().min(1).max(128) });

export async function POST(req: NextRequest) {
  // Защита от login-CSRF: если запрос пришёл из браузера, Origin должен совпадать с нашим хостом
  if (isForeignOrigin(req.headers)) return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
  const result = await attemptLogin(parsed.data.login, parsed.data.password, clientIp(req.headers));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await createSession(result.user.id);
  return NextResponse.json({ ok: true, role: result.user.role });
}
