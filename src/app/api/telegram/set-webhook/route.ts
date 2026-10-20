import { NextRequest, NextResponse } from "next/server";
import { getWebhookInfo, setWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// One-time setup helper: visit
//   GET /api/telegram/set-webhook?secret=YOUR_TELEGRAM_WEBHOOK_SECRET
// after deploying, to register this app's URL as the bot's webhook with Telegram.
export async function GET(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = req.nextUrl.searchParams.get("secret");

  if (!secret || given !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json({ ok: false, error: "APP_URL is not configured" }, { status: 500 });
  }

  const webhookUrl = `${appUrl.replace(/\/+$/, "")}/api/telegram/webhook`;

  try {
    const result = await setWebhook(webhookUrl, secret);
    const info = await getWebhookInfo();
    return NextResponse.json({ ok: true, webhookUrl, result, info });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
