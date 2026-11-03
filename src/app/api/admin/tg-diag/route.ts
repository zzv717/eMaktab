// 🔍 Telegram ulanish diagnostikasi — xom HTTP javoblar bilan
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = "emaktab123";

async function rawCall(method: string, payload?: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const url = `https://api.telegram.org/bot${token.slice(0, 6)}…/${method}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: payload ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const text = (await res.text()).slice(0, 800);
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* JSON emas */
    }
    return { url, status: res.status, statusText: res.statusText, body: text, json };
  } catch (e) {
    return { url, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ruxsat yo'q" }, { status: 403 });
  }
  const getMe = await rawCall("getMe");
  const hookInfo = await rawCall("getWebhookInfo");
  return NextResponse.json({
    ok: true,
    tokenSet: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    appUrl: process.env.APP_URL ?? "",
    getMe,
    hookInfo,
  });
}
