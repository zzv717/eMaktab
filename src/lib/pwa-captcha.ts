// 📱 PWA — captcha bosqichi: login urinishini (shifrlangan) cookie'da vaqtincha saqlaydi.
import type { NextRequest, NextResponse } from "next/server";
import type { LoginFormState } from "@/lib/emaktab";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export const PWA_CAPTCHA_COOKIE = "pwa_cap";
const TTL_MS = 5 * 60 * 1000;

export interface PendingCaptcha {
  login: string;
  password: string;
  form: LoginFormState;
  exp: number;
}

export function setPendingCaptcha(res: NextResponse, p: { login: string; password: string; form: LoginFormState }): void {
  const payload = encryptSecret(JSON.stringify({ ...p, exp: Date.now() + TTL_MS }));
  res.cookies.set(PWA_CAPTCHA_COOKIE, encodeURIComponent(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/api/pwa",
    maxAge: TTL_MS / 1000,
  });
}

export function readPendingCaptcha(req: NextRequest | Request): PendingCaptcha | null {
  try {
    const raw = (req as NextRequest).cookies?.get(PWA_CAPTCHA_COOKIE)?.value;
    if (!raw) return null;
    const data = JSON.parse(decryptSecret(decodeURIComponent(raw))) as PendingCaptcha;
    if (!data.exp || data.exp < Date.now() || !data.form) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPendingCaptcha(res: NextResponse): void {
  res.cookies.set(PWA_CAPTCHA_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/api/pwa",
    maxAge: 0,
  });
}
