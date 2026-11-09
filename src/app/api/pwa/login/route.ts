// 📱 PWA — eMaktab login/parol bilan kirish (haqiqiy eMaktabdan tekshiriladi)
import { NextRequest, NextResponse } from "next/server";
import { captchaDataUrlOrReason, loginEmaktab } from "@/lib/emaktab";
import { setPendingCaptcha } from "@/lib/pwa-captcha";
import { finishPwaLogin } from "@/lib/pwa-login";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { login?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const login = (body.login ?? "").trim();
  const password = (body.password ?? "").trim();
  if (!login || !password) {
    return NextResponse.json({ ok: false, error: "Login va parolni kiriting" }, { status: 400 });
  }

  try {
    const result = await loginEmaktab(login, password);
    if (result.status === "captcha_required" && result.formState) {
      // Captcha: foydalanuvchi rasmdagi kodni kiritadi (avtomatik yechilmaydi).
      const img = await captchaDataUrlOrReason(result.formState);
      if (!("dataUrl" in img)) {
        return NextResponse.json(
          { ok: false, error: `eMaktab captcha rasmini bermadi (${img.reason}). Bir ozdan so'ng qayta urinib ko'ring.` },
          { status: 502 },
        );
      }
      const res = NextResponse.json({
        ok: false,
        captcha: true,
        captchaImage: img.dataUrl,
        error: "eMaktab rasmdagi kodni so'ramoqda. Kodni kiriting.",
      });
      setPendingCaptcha(res, { login, password, form: result.formState });
      return res;
    }
    if (result.status !== "ok") {
      return NextResponse.json(
        { ok: false, error: result.message || "Login yoki parol noto'g'ri" },
        { status: 401 },
      );
    }
    return await finishPwaLogin(login, password, result.session);
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 120) : "Xatolik";
    return NextResponse.json({ ok: false, error: `eMaktabga ulanib bo'lmadi: ${msg}` }, { status: 502 });
  }
}
