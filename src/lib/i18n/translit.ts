// Латиница для имён в английском интерфейсе. Имена не переводят, а записывают латиницей,
// поэтому «Орлова Анна» становится «Orlova Anna». Схема читаемая (как в англоязычной прессе:
// я = ya, ю = yu, й = y), а не паспортная ИКАО, где «Юлия» превращается в «Iuliia».
import type { Locale } from "./config";

const MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** «Сухарев И. Н.» становится «Sukharev I. N.», «Аль-Хасан» становится «Al-Khasan». Латиница и знаки остаются как есть. */
export function latin(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const low = ch.toLowerCase();
    const tr = MAP[low];
    if (tr === undefined) {
      out += ch;
      continue;
    }
    // «е» в начале слова и после ь/ъ пишем «ye»: Елена = Yelena, Юрьевна = Yuryevna; после гласной просто «e»: Галиев = Galiev
    let t = tr;
    if (low === "е") {
      const prev = text[i - 1]?.toLowerCase() ?? "";
      if (!prev || !/[а-яё]/.test(prev) || "ъь".includes(prev)) t = "ye";
    }
    if (ch !== low && t) {
      // заглавная: «Ж» даёт «Zh», а в слове из заглавных («МГИМО») «ZH»
      const next = text[i + 1];
      const allCaps = next !== undefined && next !== next.toLowerCase();
      t = allCaps ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1);
    }
    out += t;
  }
  return out;
}

/** Имя человека на языке интерфейса: в английском латиницей, в русском как в данных. */
export const personName = (name: string, locale: Locale) => (locale === "en" ? latin(name) : name);

/** Код группы или факультета: «МЭО-212-EN» в английском интерфейсе «MEO-212-EN», как в новостях и уведомлениях. */
export const codeName = (code: string, locale: Locale) => (locale === "en" ? latin(code) : code);

const STAFF_POSITION_EN: Record<string, string> = {
  "Специалист Студенческого офиса (единое окно)": "Student Office specialist (one-stop desk)",
};

/** Должность сотрудника офиса: «Методист учебного офиса МЭО» в английском интерфейсе «MEO student office coordinator». */
export function staffPosition(position: string | null, locale: Locale): string {
  if (!position || locale !== "en") return position ?? "";
  if (STAFF_POSITION_EN[position]) return STAFF_POSITION_EN[position];
  const m = position.match(/^Методист учебного офиса\s+(.+)$/);
  return m ? `${latin(m[1])} student office coordinator` : latin(position);
}
