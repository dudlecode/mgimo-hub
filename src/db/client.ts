// Подключение к PostgreSQL. Используется и приложением, и скриптами (миграции, сид),
// поэтому здесь нет `import "server-only"`, он стоит в слое доступа к данным (src/lib/data).
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __attachePool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  // Не падаем при импорте: во время `next build` модули маршрутов импортируются без БД.
  // Пул не подключается до первого запроса.
  if (!url && process.env.NEXT_PHASE !== "phase-production-build") {
    console.warn("[db] DATABASE_URL не задан, скопируйте .env.example в .env");
  }
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
}

// В dev Next.js перезагружает модули, держим один пул на процесс.
export const pool = globalForDb.__attachePool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__attachePool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type DB = typeof db;
export { schema };
