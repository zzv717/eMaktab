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

// ---------------------------------------------------------------------------
// Xato jurnali — bot hech qachon jim qolmaydi, xatolar bazaga yoziladi va
// /api/admin/recent-errors orqali masofadan ko'rish mumkin.
// ---------------------------------------------------------------------------

export async function logError(step: string, error: unknown, telegramId?: number): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const detail = error instanceof Error ? (error.stack ?? "") : "";
    await db.insert(schema.errorLogs).values({
      step,
      message: message.slice(0, 1000),
      detail: detail.slice(0, 2000),
      telegramId: telegramId ?? null,
    });
  } catch {
    /* jurnal xatosi bot ishiga xalaqit bermaydi */
  }
}

export async function logEvent(step: string, detail: string, telegramId?: number): Promise<void> {
  try {
    await db.insert(schema.errorLogs).values({
      step,
      message: detail.slice(0, 1000),
      telegramId: telegramId ?? null,
    });
  } catch {
    /* ignore */
  }
}

