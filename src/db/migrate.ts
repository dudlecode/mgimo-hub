import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { db, pool } from "./client";

async function main() {
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder });
  console.log("✓ Миграции применены");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
