import { NextRequest, NextResponse } from "next/server";
import { runDueNotifications } from "@/lib/nazoratchi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 👁 Nazoratchi avtomatik bildirishnomalari (cron).
// Himoya: ?secret= TELEGRAM_WEBHOOK_SECRET (vercel.json dagi cron shu bilan chaqiradi).
export async function GET(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const sp = req.nextUrl.searchParams;
  if (!secret || sp.get("secret") !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const res = await runDueNotifications();
    return NextResponse.json({ ok: true, ...res });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error).slice(0, 200) },
      { status: 500 },
    );
  }
}
