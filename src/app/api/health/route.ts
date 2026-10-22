import { db, dbConfigError } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (dbConfigError) {
    return Response.json({ ok: false, db: "error", error: dbConfigError }, { status: 500 });
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" });
  } catch (error) {
    return Response.json(
      { ok: false, db: "error", error: String(error).slice(0, 300) },
      { status: 500 },
    );
  }
}
