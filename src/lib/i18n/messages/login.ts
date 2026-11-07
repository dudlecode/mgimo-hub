// Страница входа.
import { defineMessages, pluralEn } from "../define";

/** Английский текст ошибки входа. Сервер (src/lib/auth/login.ts, actions.ts) отдаёт русский, переводим по тексту. */
function loginErrorEn(ru: string): string {
  if (!/[А-Яа-яЁё]/.test(ru)) return ru;
  const n = Number(/(\d+)/.exec(ru)?.[1] ?? NaN);
  if (ru.startsWith("Введите логин")) return "Enter your login";
  if (ru.startsWith("Введите пароль")) return "Enter your password";
  if (ru.startsWith("Слишком много попыток")) {
    return Number.isFinite(n) ? `Too many sign-in attempts. Try again in ${n} ${pluralEn(n, "minute", "minutes")}.` : "Too many sign-in attempts. Try again later.";
  }
  if (ru.startsWith("Неверный логин или пароль")) {
    if (ru.includes("заблокирован")) return `Incorrect login or password. Sign-in is blocked for ${Number.isFinite(n) ? n : 15} minutes.`;
    if (ru.includes("Осталось") && Number.isFinite(n)) return `Incorrect login or password. ${n} ${pluralEn(n, "attempt", "attempts")} left.`;
    return "Incorrect login or password.";
  }
  return "Couldn't sign in. Check your login and password and try again.";
}

export const loginMessages = defineMessages(
  {
    metaTitle: "Вход",
    title: "Вход",
    lead: "Расписание, баллы, справки и деканат в одном окне.",
    footer: "Пароль выдаёт Студенческий офис",
    skipIntro: "Пропустить заставку",
    login: "Логин",
    loginPlaceholder: "Логин из Студенческого офиса",
    password: "Пароль",
    showPassword: "Показать пароль",
    hidePassword: "Скрыть пароль",
    submit: "Войти",
    submitting: "Входим",
    error: (ru: string) => ru,
    loadError: {
      title: "Не удалось открыть вход",
      text: "Сервис временно недоступен. Попробуйте ещё раз через пару секунд.",
      code: "Код ошибки",
      retry: "Повторить",
    },
    demo: {
      aria: "Быстрый вход для жюри",
      divider: "быстрый вход для жюри",
      students: "Студенты",
      staff: "Деканат",
      credentials: "Логины и пароли",
      anna: { title: "Анна", note: "МО, 3 курс" },
      timur: { title: "Тимур", note: "МЭО, 2 курс" },
      leyla: { title: "Лейла", note: "ФЛМК, 1 курс" },
      office: { title: "Студенческий офис", note: "все факультеты" },
      meo: { title: "Учебный офис МЭО", note: "только МЭО" },
    },
  },
  {
    metaTitle: "Sign in",
    title: "Sign in",
    lead: "Schedule, grades, certificates and the dean's office in one place.",
    footer: "Your password is issued by the Student Office",
    skipIntro: "Skip intro",
    login: "Login",
    loginPlaceholder: "Login from the Student Office",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    submit: "Sign in",
    submitting: "Signing in",
    error: loginErrorEn,
    loadError: {
      title: "Couldn't open sign-in",
      text: "The service is temporarily unavailable. Try again in a few seconds.",
      code: "Error code",
      retry: "Try again",
    },
    demo: {
      aria: "Quick sign-in for the jury",
      divider: "quick sign-in for the jury",
      students: "Students",
      staff: "Dean's office",
      credentials: "Logins and passwords",
      anna: { title: "Anna", note: "IR, year 3" },
      timur: { title: "Timur", note: "IER, year 2" },
      leyla: { title: "Leyla", note: "Languages, year 1" },
      office: { title: "Student Office", note: "all schools" },
      meo: { title: "IER Academic Office", note: "IER only" },
    },
  },
);
