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
    // Sir qiymatini hech qachon qaytarmaymiz — faqat sozlangan-yo'qligini bildiramiz.
    return NextResponse.json(
      {
        ok: false,
        error: "forbidden",
        webhookSecretConfigured: Boolean(secret),
        hint: !secret
          ? "TELEGRAM_WEBHOOK_SECRET Vercel muhitida sozlanmagan"
          : "?secret= qiymati Vercel'dagi TELEGRAM_WEBHOOK_SECRET bilan mos kelmadi",
      },
      { status: 403 },
    );
  }

  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json({ ok: false, error: "APP_URL is not configured" }, { status: 500 });
  }

  const webhookUrl = `${appUrl.replace(/\/+$/, "")}/api/telegram/webhook`;

  try {
    // Qo'lda chaqirilganda eski yig'ilgan xabarlarni tashlaymiz — bot toza boshlaydi.
    const result = await setWebhook(webhookUrl, secret, { dropPendingUpdates: true });
    const info = await getWebhookInfo();
    return NextResponse.json({ ok: true, webhookUrl, result, info });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
