import "dotenv/config";
import { pool } from "./client";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_RESET !== "true") {
    throw new Error("Сброс базы в продакшне запрещён (установите ALLOW_RESET=true, если уверены)");
  }
  await pool.query(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;`);
  console.log("✓ База очищена");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
