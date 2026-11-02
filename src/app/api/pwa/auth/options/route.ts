// 📱 PWA — Face ID bilan kirish uchun WebAuthn challenge
import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { credentialsForLogin, issueChallengeCookie, pwaRpConfig } from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { login?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const login = (body.login ?? "").trim();
  if (!login) {
    return NextResponse.json({ ok: false, error: "Loginni kiriting" }, { status: 400 });
  }
  const creds = await credentialsForLogin(login);
  if (creds.length === 0) {
    return NextResponse.json({
      ok: true,
      found: false,
      error: "Bu login uchun Face ID o'rnatilmagan — login/parol bilan kiring",
    });
  }
  const { rpID } = pwaRpConfig(req);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (JSON.parse(c.transports) as string[]) : undefined,
    })),
    timeout: 60000,
  });
  const res = NextResponse.json({ ok: true, found: true, options });
  issueChallengeCookie(res, options.challenge, "auth", login);
  return res;
}
