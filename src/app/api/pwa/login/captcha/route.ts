// 📱 PWA — captcha kodini yuborish va loginni yakunlash
import { NextRequest, NextResponse } from "next/server";
import { submitCaptchaLogin } from "@/lib/emaktab";
import { clearPendingCaptcha, readPendingCaptcha, setPendingCaptcha } from "@/lib/pwa-captcha";
import { finishPwaLogin } from "@/lib/pwa-login";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const pending = readPendingCaptcha(req);
  if (!pending) {
    return NextResponse.json({ ok: false, error: "Avval login va parolni qayta kiriting" }, { status: 400 });
  }
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const code = (body.code ?? "").trim();
  if (!code) return NextResponse.json({ ok: false, error: "Rasmdagi kodni kiriting" }, { status: 400 });

  try {
    const result = await submitCaptchaLogin(pending.login, pending.password, pending.form, code);
    if (result.status === "ok") {
      const res = await finishPwaLogin(pending.login, pending.password, result.session);
      clearPendingCaptcha(res);
      return res;
    }
    if (result.status === "captcha_required" && result.formState) {
      // Kod noto'g'ri — yangi captcha bilan qayta urinish
      const res = NextResponse.json({ ok: false, captcha: true, error: "Kod noto'g'ri. Qaytadan kiriting." });
      setPendingCaptcha(res, { login: pending.login, password: pending.password, form: result.formState });
      return res;
    }
    const res = NextResponse.json(
      { ok: false, error: result.status === "error" || result.status === "invalid_credentials" ? result.message : "Kirish amalga oshmadi" },
      { status: 401 },
    );
    clearPendingCaptcha(res);
    return res;
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 120) : "Xatolik";
    return NextResponse.json({ ok: false, error: `eMaktabga ulanib bo'lmadi: ${msg}` }, { status: 502 });
  }
}
