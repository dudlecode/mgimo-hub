// Названия стран для справки на английском. Студент пишет страну по-русски в свободном поле,
// а документ для консульства английский: без перевода в тексте остаётся кириллица.
import { latin } from "@/lib/i18n/translit";

const COUNTRIES: Record<string, string> = {
  австрия: "Austria",
  бельгия: "Belgium",
  болгария: "Bulgaria",
  великобритания: "the United Kingdom",
  венгрия: "Hungary",
  германия: "Germany",
  греция: "Greece",
  дания: "Denmark",
  египет: "Egypt",
  израиль: "Israel",
  индия: "India",
  ирландия: "Ireland",
  испания: "Spain",
  италия: "Italy",
  казахстан: "Kazakhstan",
  канада: "Canada",
  кипр: "Cyprus",
  китай: "China",
  нидерланды: "the Netherlands",
  норвегия: "Norway",
  оаэ: "the United Arab Emirates",
  польша: "Poland",
  португалия: "Portugal",
  сербия: "Serbia",
  сша: "the United States",
  турция: "Turkey",
  финляндия: "Finland",
  франция: "France",
  хорватия: "Croatia",
  чехия: "the Czech Republic",
  швейцария: "Switzerland",
  швеция: "Sweden",
  "южная корея": "South Korea",
  япония: "Japan",
};

/** Страна по-английски; неизвестное название пишется латиницей, латиница остаётся как есть. */
export function countryEn(name: string): string {
  const key = name.trim().toLowerCase().replace(/ё/g, "е");
  return COUNTRIES[key] ?? latin(name.trim());
}
