import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

// Import paytida xatolik tashlamaymiz — aks holda butun API route ishlamay qoladi
// va bot jim bo'ladi. Xatolik birinchi DB so'rovida ko'rinadi va foydalanuvchiga
// yetkaziladi.
export const dbConfigError = databaseUrl ? null : "DATABASE_URL sozlanmagan";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool, { schema });
