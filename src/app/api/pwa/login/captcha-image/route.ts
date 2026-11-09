// 📱 PWA — captcha rasmi (eMaktab sessiyasi cookie'lari bilan proksi qilinadi)
import { NextRequest, NextResponse } from "next/server";
import { fetchCaptchaImageForForm } from "@/lib/emaktab";
import { readPendingCaptcha } from "@/lib/pwa-captcha";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pending = readPendingCaptcha(req);
  if (!pending) return NextResponse.json({ ok: false, error: "Captcha muddati tugagan" }, { status: 404 });
  const img = await fetchCaptchaImageForForm(pending.form);
  if (!img) return NextResponse.json({ ok: false, error: "Captcha rasmi yuklanmadi" }, { status: 502 });
  return new NextResponse(Buffer.from(img.bytes), {
    headers: { "Content-Type": img.contentType, "Cache-Control": "no-store" },
  });
}
