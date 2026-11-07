// Хэширование паролей: argon2id с параметрами не ниже рекомендаций OWASP
// (m = 19 МиБ, t = 2, p = 1). Пароль в открытом виде нигде не сохраняется.
import { hash, verify } from "@node-rs/argon2";

const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Хэш-«пустышка»: проверяем пароль и для несуществующих логинов, чтобы время ответа не выдавало, есть ли такой пользователь. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("attache-dummy-password-for-timing");
  return dummyHash;
}
