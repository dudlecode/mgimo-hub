// Общие константы, безопасные для proxy.ts (без обращения к БД).
export const SESSION_COOKIE = "attache_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Маршруты, доступные без входа */
export const PUBLIC_PATHS = ["/login", "/verify", "/api/health", "/api/auth/login", "/manifest.webmanifest", "/offline", "/robots.txt"];

/** Лимиты входа */
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_WINDOW_MIN = 15;
export const IP_MAX_FAILS = 30;
/** Общий предел неудач по одному логину со всех адресов: страховка от распределённого перебора */
export const LOGIN_GLOBAL_MAX_FAILS = 100;
