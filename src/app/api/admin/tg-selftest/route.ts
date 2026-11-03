import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/bot";
import { beginReplyCapture, takeReplyCapture, type TelegramUpdate } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 🧪 O'z-o'zini sinov: soxta /start update bilan "webhook javobi" (capture)
// mexanizmini tekshiradi. Telegramga hech narsa YUBORILMAYDI — capture tarmoqqa
// chiqmaydi, javob shu JSON ichida qaytadi. Tarmoq uzilgan bo'lsa ham ishlaydi.
// Himoya: ?secret= TELEGRAM_WEBHOOK_SECRET.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && url.searchParams.get("secret") !== expected) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const fakeChat = 999999999;
  const update = {
    update_id: Date.now(),
    message: {
      message_id: 1,
      from: { id: fakeChat, is_bot: false, first_name: "Selftest", username: "emaktab_selftest" },
      chat: { id: fakeChat, type: "private", first_name: "Selftest" },
      date: Math.floor(Date.now() / 1000),
      text: "/start",
    },
  } as unknown as TelegramUpdate;

  beginReplyCapture(fakeChat);
  try {
    await handleTelegramUpdate(update);
  } catch (e) {
    return NextResponse.json({
      ok: false,
      stage: "handle",
      error: String(e instanceof Error ? e.message : e).slice(0, 200),
      reply: takeReplyCapture(),
    });
  }
  const reply = takeReplyCapture();
  const text = typeof reply?.text === "string" ? reply.text : "";
  const ok = Boolean(
    reply && reply.method === "sendMessage" && String(reply.chat_id) === String(fakeChat) && text.length > 0,
  );
  return NextResponse.json({
    ok,
    replyMethod: reply?.method ?? null,
    chatId: reply?.chat_id ?? null,
    textLen: text.length,
    hasKeyboard: Boolean(reply?.reply_markup),
    replyHead: text.slice(0, 120),
  });
}
