// 📱 PWA — eMaktab login/parol bilan kirish (haqiqiy eMaktabdan tekshiriladi)
import { NextRequest, NextResponse } from "next/server";
import { loginEmaktab } from "@/lib/emaktab";
import { credentialsForLogin, issueSessionCookie, saveAccount, type PwaProfile } from "@/lib/pwa";

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
    if (result.status !== "ok") {
      return NextResponse.json(
        { ok: false, error: result.message || "Login yoki parol noto'g'ri" },
        { status: 401 },
      );
    }
    const profile: PwaProfile = {
      login,
      name: result.session.fullName || login,
      role: result.session.role,
      school: result.session.active.schoolName ?? "-",
      group: result.session.active.groupName ?? "-",
    };
    // Ma'lumot paneli uchun hisobni serverda saqlaymiz (shifrlangan)
    await saveAccount(login, password, profile);
    const creds = await credentialsForLogin(login);
    const res = NextResponse.json({ ok: true, profile, hasPasskey: creds.length > 0 });
    issueSessionCookie(res, profile);
    return res;
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 120) : "Xatolik";
    return NextResponse.json({ ok: false, error: `eMaktabga ulanib bo'lmadi: ${msg}` }, { status: 502 });
  }
}
