// 📱 PWA — passkey (Face ID) o'rnatishni tasdiqlash va saqlash
import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import {
  consumeChallenge,
  credentialsForLogin,
  pwaRpConfig,
  readChallenge,
  readSession,
  saveCredential,
} from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Avval login qiling" }, { status: 401 });
  }
  let body: { response?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  if (!body.response) {
    return NextResponse.json({ ok: false, error: "Javob topilmadi" }, { status: 400 });
  }

  const expectedChallenge = readChallenge(req, "reg", session.login);
  if (!expectedChallenge) {
    return NextResponse.json(
      { ok: false, error: "Sessiya eskirgan — qaytadan urinib ko'ring" },
      { status: 400 },
    );
  }
  const { rpID, expectedOrigin } = pwaRpConfig(req);

  try {
    const verification = await verifyRegistrationResponse({
      response: body.response as never,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      const fail = NextResponse.json({ ok: false, error: "Tasdiqlab bo'lmadi" }, { status: 400 });
      consumeChallenge(fail);
      return fail;
    }
    const info = verification.registrationInfo;
    const existing = await credentialsForLogin(session.login);
    if (!existing.some((c) => c.credentialId === info.credential.id)) {
      await saveCredential({
        login: session.login,
        credentialId: info.credential.id,
        publicKey: info.credential.publicKey,
        counter: info.credential.counter,
        transports: info.credential.transports,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp ? "yes" : "no",
        profile: session,
      });
    }
    const res = NextResponse.json({ ok: true });
    consumeChallenge(res);
    return res;
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 140) : "Xatolik";
    const fail = NextResponse.json({ ok: false, error: `Tasdiqlab bo'lmadi: ${msg}` }, { status: 400 });
    consumeChallenge(fail);
    return fail;
  }
}
