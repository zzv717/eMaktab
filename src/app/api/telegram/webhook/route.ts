import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/bot";
import { runDueNotifications } from "@/lib/nazoratchi";
import {
  beginReplyCapture,
  drainOutbox,
  healthNow,
  takeReplyCapture,
  type TelegramUpdate,
} from "@/lib/telegram";

function chatIdOf(u: TelegramUpdate): number | null {
  const m = u as unknown as { message?: { chat?: { id?: number } } };
  const cb = u as unknown as {
    callback_query?: { message?: { chat?: { id?: number } }; from?: { id?: number } };
  };
  return m.message?.chat?.id ?? cb.callback_query?.message?.chat?.id ?? cb.callback_query?.from?.id ?? null;
}

export const dynamic = "force-dynamic";
// Faollashtirish kabi uzoq jarayonlar uchun (Vercel Fluid: 5 daqiqagacha)
export const maxDuration = 300;

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

  // Javobni yig'amiz — Telegram ushbu JSON ni O'ZI yuboradi (tarmoq uzilsa ham ishlaydi!)
  beginReplyCapture(chatIdOf(update));
  try {
    await handleTelegramUpdate(update);
  } catch (error) {
    // Always answer Telegram with 200 so it doesn't keep retrying the same update,
    // but log the error for debugging.
    console.error("Failed to handle Telegram update", error);
  }
  const reply = takeReplyCapture();

  // 👁 Nazoratchi bildirishnomalari + outbox navbati — faqat tarmoq sog'lom bo'lsa
  // (javobni sekinlashtirmaslik uchun; tushmasa keyingi safar/cron yetkazadi).
  if (healthNow() !== "down") {
    try {
      await runDueNotifications();
    } catch {
      /* bildirishnoma xatosi javobga xalaqit bermaydi */
    }
    try {
      await drainOutbox(3);
    } catch {
      /* navbat xatosi javobga xalaqit bermaydi */
    }
  }

  return NextResponse.json(reply ?? { ok: true });
}

export async function GET() {
  // Diagnostika — hech qanday sir qaytarmaydi, faqat sozlangan-yo'qligini ko'rsatadi.
  return NextResponse.json({
    ok: true,
    message: "Telegram webhook is alive. Use POST.",
    config: {
      botTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      appUrlConfigured: Boolean(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      encryptionKeyConfigured: Boolean(process.env.ENCRYPTION_KEY),
    },
  });
}
