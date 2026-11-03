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
      signal: AbortSignal.timeout(6000),
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
  // IPv4 majbur yo'l bilan ham sinab ko'ramiz
  let getMeV4: unknown;
  try {
    const { callTelegramIpv4 } = await import("@/lib/telegram");
    const r = await callTelegramIpv4("getMe", {});
    getMeV4 = { ok: true, username: (r as { username?: string }).username };
  } catch (e) {
    getMeV4 = { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
  return NextResponse.json({
    ok: true,
    tokenSet: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    appUrl: process.env.APP_URL ?? "",
    getMe,
    hookInfo,
    getMeV4,
  });
}
