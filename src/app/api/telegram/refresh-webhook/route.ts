import { NextResponse } from "next/server";
import { getWebhookInfo, setWebhook } from "@/lib/telegram";
import { runDueNotifications } from "@/lib/nazoratchi";

export const dynamic = "force-dynamic";

// Webhook'ni o'z-o'zidan tiklash (self-heal).
//
// Muammo: TELEGRAM_WEBHOOK_SECRET o'zgartirilsa-yu, webhook qayta
// ro'yxatdan o'tkazilmasa, Telegram xabar yubora olmaydi (403) va bot jim qoladi.
//
// Bu endpoint hech qanday sir talab qilmaydi, chunki u xavfsiz:
// webhook manzili ham, secret ham faqat serverdagi ENV'dan olinadi —
// tashqi tomon URL yoki sirni boshqara olmaydi. Faqat to'g'ri qiymatlar bilan
// qayta ro'yxatdan o'tkazadi (idempotent).
//
// Vercel cron har kuni shuni chaqiradi — buzilgan holat 24 soat ichida avtomatik tiklanadi.
export async function GET() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const botTokenSet = Boolean(process.env.TELEGRAM_BOT_TOKEN);

  if (!appUrl) {
    return NextResponse.json({ ok: false, error: "APP_URL is not configured" }, { status: 500 });
  }
  if (!botTokenSet) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 500 });
  }

  const webhookUrl = `${appUrl.replace(/\/+$/, "")}/api/telegram/webhook`;

  try {
    // Muhim: eski yig'ilgan xabarlarni TASHLAMAYMiz (drop_pending_updates: false),
    // chunki bu avtomatik chaqiruv va haqiqiy xabarni yo'qotish mumkin.
    const result = await setWebhook(webhookUrl, secret ?? "", { dropPendingUpdates: false });
    const info = await getWebhookInfo();
    // 👁 Nazoratchi bildirishnomalari — kunlik cron bilan bepul qo'shimcha tekshiruv.
    let nazoratchi = "ok";
    try {
      await runDueNotifications();
    } catch {
      nazoratchi = "xato";
    }
    return NextResponse.json({
      ok: true,
      webhookUrl,
      webhookSecretConfigured: Boolean(secret),
      result,
      info,
      nazoratchi,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
