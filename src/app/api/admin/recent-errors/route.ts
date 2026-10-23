import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { errorLogs } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Masofaviy diagnostika: bazaviy jadval ustunlari + so'nggi xatolar jurnali.
 * GET /api/admin/recent-errors?secret=...[&n=3]
 */
export async function GET(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const sp = req.nextUrl.searchParams;
  if (!secret || sp.get("secret") !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const n = Math.min(Number(sp.get("n") ?? 3) || 3, 10);

  const cols: Record<string, string> = {};
  for (const table of ["bot_users", "member_accounts", "error_log"]) {
    try {
      const res = await db.execute(
        sql`select column_name from information_schema.columns where table_name = ${table} order by ordinal_position`,
      );
      cols[table] = res.rows
        .map((r) => String((r as { column_name: unknown }).column_name))
        .join(",");
    } catch (error) {
      cols[table] = `XATO ${String(error).slice(0, 60)}`;
    }
  }

  const errors: Array<{ at: string; step: string; m: string; d: string }> = [];
  try {
    const rows = await db
      .select()
      .from(errorLogs)
      .orderBy(sql`${errorLogs.createdAt} desc`)
      .limit(n);
    for (const r of rows) {
      errors.push({
        at: (r.createdAt instanceof Date ? r.createdAt.toISOString() : "").slice(5, 16),
        step: r.step.slice(0, 24),
        m: (r.message ?? "").slice(0, 90),
        d: (r.detail ?? "").slice(0, 90),
      });
    }
  } catch (error) {
    errors.push({ at: "", step: "read", m: String(error).slice(0, 90), d: "" });
  }

  return NextResponse.json({ cols, errors });
}
