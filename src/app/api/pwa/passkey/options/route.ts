// 📱 PWA — passkey (Face ID) o'rnatish uchun WebAuthn challenge yaratish
import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import {
  credentialsForLogin,
  issueChallengeCookie,
  pwaRpConfig,
  pwaUserId,
  readSession,
} from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Avval login qiling" }, { status: 401 });
  }
  const { rpID } = pwaRpConfig(req);
  const existing = await credentialsForLogin(session.login);

  const options = await generateRegistrationOptions({
    rpName: "eMaktab ilovasi",
    rpID,
    userName: session.login,
    userID: pwaUserId(session.login),
    userDisplayName: session.name,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (JSON.parse(c.transports) as string[]) : undefined,
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform", // faqat qurilma sensori (yuz/panja/PIN)
      residentKey: "preferred",
      userVerification: "required",
    },
    preferredAuthenticatorType: "localDevice",
    timeout: 60000,
  });

  const res = NextResponse.json({ ok: true, options });
  issueChallengeCookie(res, options.challenge, "reg", session.login);
  return res;
}
