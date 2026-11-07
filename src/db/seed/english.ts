// Английские названия для интерфейса иностранных студентов.
// Хранятся в БД рядом с русскими (disciplines.name_en, faculties.name_en); где перевода нет, показывается русское.
import { eq } from "drizzle-orm";
import { db } from "../client";
import * as s from "../schema";

export const DISCIPLINE_EN: Record<string, string> = {
  "Анализ данных в международных отношениях": "Data Analysis in International Relations",
  "Английский язык": "English",
  "Арабский язык": "Arabic",
  "Безопасность жизнедеятельности": "Life Safety",
  "Бухгалтерский учёт": "Accounting",
  "Введение в специальность": "Introduction to the Field",
  "Введение в языкознание": "Introduction to Linguistics",
  "Внешняя политика России": "Russian Foreign Policy",
  "Всемирная история": "World History",
  "Дипломатический протокол и этикет": "Diplomatic Protocol and Etiquette",
  "Информатика": "Computer Science",
  "Информационные технологии в лингвистике": "Information Technology in Linguistics",
  "Испанский язык": "Spanish",
  "История России": "History of Russia",
  "История внешней политики России": "History of Russian Foreign Policy",
  "История международных отношений": "History of International Relations",
  "История экономических учений": "History of Economic Thought",
  "Итальянский язык": "Italian",
  "Китайский язык": "Chinese",
  "Конфликтология": "Conflict Studies",
  "Линейная алгебра": "Linear Algebra",
  "Макроэкономика": "Macroeconomics",
  "Математический анализ": "Calculus",
  "Математический анализ II": "Calculus II",
  "Международное публичное право": "Public International Law",
  "Международные организации": "International Organizations",
  "Методы прикладного анализа МО": "Applied Methods in International Relations",
  "Микроэкономика": "Microeconomics",
  "Мировая политика": "World Politics",
  "Мировая экономика": "World Economy",
  "Немецкий язык": "German",
  "Основы дипломатической службы": "Foundations of Diplomatic Service",
  "Основы российской государственности": "Foundations of Russian Statehood",
  "Политология": "Political Science",
  "Правоведение": "Introduction to Law",
  "Регионоведение: Ближний Восток": "Regional Studies: Middle East",
  "Русский язык и культура речи": "Russian Language and Speech Culture",
  "Социология": "Sociology",
  "Сравнительная политология": "Comparative Politics",
  "Теория вероятностей и математическая статистика": "Probability Theory and Mathematical Statistics",
  "Теория международных отношений": "International Relations Theory",
  "Турецкий язык": "Turkish",
  "Физическая культура и спорт": "Physical Education and Sports",
  "Философия": "Philosophy",
  "Французский язык": "French",
  "Эконометрика": "Econometrics",
  "Экономическая история": "Economic History",
  "Экономическая теория": "Economic Theory",
};

export const FACULTY_EN: Record<string, string> = {
  mo: "School of International Relations",
  meo: "School of International Economic Relations",
  mp: "School of International Law",
  mj: "School of International Journalism",
  mb: "School of International Business",
  fup: "School of Governance and Politics",
  flmk: "School of Linguistics and Intercultural Communication",
  ffe: "School of Financial Economics",
};

/** Проставляет английские названия уже созданным дисциплинам и факультетам */
export async function seedEnglishNames() {
  const rows = await db.select({ id: s.disciplines.id, name: s.disciplines.name }).from(s.disciplines);
  let missing = 0;
  for (const r of rows) {
    const en = DISCIPLINE_EN[r.name];
    if (!en) {
      missing++;
      continue;
    }
    await db.update(s.disciplines).set({ nameEn: en }).where(eq(s.disciplines.id, r.id));
  }
  for (const [id, nameEn] of Object.entries(FACULTY_EN)) {
    await db.update(s.faculties).set({ nameEn }).where(eq(s.faculties.id, id));
  }
  if (missing) console.warn(`  нет английского названия у ${missing} дисциплин`);
}
