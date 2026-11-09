// 📱 PWA — muvaffaqiyatli login yakuni (parol yoki captcha bilan) — umumiy.
import { NextResponse } from "next/server";
import type { EmaktabSession } from "@/lib/emaktab";
import { credentialsForLogin, issueSessionCookie, saveAccount, type PwaProfile } from "@/lib/pwa";

export async function finishPwaLogin(login: string, password: string, session: EmaktabSession): Promise<NextResponse> {
  const profile: PwaProfile = {
    login,
    name: session.fullName || login,
    role: session.role,
    school: session.active.schoolName ?? "-",
    group: session.active.groupName ?? "-",
  };
  // Ma'lumot paneli uchun hisobni serverda saqlaymiz (shifrlangan) + sessiya cookie'lari
  await saveAccount(login, password, profile, session.cookies);
  const creds = await credentialsForLogin(login);
  const res = NextResponse.json({ ok: true, profile, hasPasskey: creds.length > 0 });
  issueSessionCookie(res, profile);
  return res;
}
