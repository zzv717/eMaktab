import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/bot";
import type { TelegramUpdate } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const given = req.headers.get("x-telegram-bot-api-secret-token");
    if (given !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    await handleTelegramUpdate(update);
  } catch (error) {
    // Always answer Telegram with 200 so it doesn't keep retrying the same update,
    // but log the error for debugging.
    console.error("Failed to handle Telegram update", error);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Telegram webhook is alive. Use POST." });
}
