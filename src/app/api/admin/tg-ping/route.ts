import { NextRequest, NextResponse } from "next/server";
import { callTelegramIpv4, healthNow } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ⚡ Tez diagnostika: bitta getMe so'rovi (~5s) — Telegram bilan aloqa bormi-yo'qligini
// darhol ko'rsatadi (tg-diag esa to'liq tekshiruv — sekinroq).
// Himoya: ?secret= TELEGRAM_WEBHOOK_SECRET bilan mos bo'lishi shart.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && url.searchParams.get("secret") !== expected) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const t0 = Date.now();
  try {
    const me = (await callTelegramIpv4("getMe", {}, 5000)) as { username?: string };
    return NextResponse.json({
      ok: true,
      ms: Date.now() - t0,
      username: me.username,
      health: healthNow(),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      ms: Date.now() - t0,
      health: healthNow(),
      error: String(e instanceof Error ? e.message : e).slice(0, 160),
    });
  }
}
