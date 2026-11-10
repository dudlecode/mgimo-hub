// Проверка Origin для Route Handlers (защита от CSRF). Без обращения к БД.

/** Хост запроса с учётом обратного прокси. */
function requestHost(headers: Headers) {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

/** Запрос пришёл с нашего же сайта. Любой некорректный Origin (в том числе «null») считается чужим. */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = requestHost(headers);
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Мягкий вариант для клиентов без браузера: Origin может отсутствовать, но если он есть, должен совпадать. */
export function isForeignOrigin(headers: Headers): boolean {
  return headers.has("origin") && !isSameOrigin(headers);
}
