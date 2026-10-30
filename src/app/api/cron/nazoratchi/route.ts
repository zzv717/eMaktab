import { NextResponse } from "next/server";
import { runDueNotifications } from "@/lib/nazoratchi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 👁 Nazoratchi avtomatik bildirishnomalari.
//
// Xavfsiz (sir talab qilmaydi — refresh-webhook bilan bir xil tamoyil):
// endpoint faqat tegishli xabarlarni yuboradi, ichida 2 daqiqalik qulf va
// kunlik dedup bor — tashqi chaqiruv zarar keltira olmaydi.
// Chaqiruv manbalari: webhook (har qanday faollik) + /api/telegram/refresh-webhook
// (kunlik cron) + Vercel cron (qo'shilsa).
export async function GET() {
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
