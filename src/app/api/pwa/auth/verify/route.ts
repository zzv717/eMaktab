// 📱 PWA — Face ID bilan kirishni tasdiqlash (sessiya ochish)
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import {
  consumeChallenge,
  credPublic,
  credentialById,
  issueSessionCookie,
  pwaRpConfig,
  profileFromCredJson,
  readChallenge,
  updateCredentialCounter,
} from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { login?: string; response?: { id?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const login = (body.login ?? "").trim();
  const credId = body.response?.id ?? "";
  if (!login || !credId) {
    return NextResponse.json({ ok: false, error: "Ma'lumot to'liq emas" }, { status: 400 });
  }

  const expectedChallenge = readChallenge(req, "auth", login);
  if (!expectedChallenge) {
    return NextResponse.json(
      { ok: false, error: "Sessiya eskirgan — qaytadan urinib ko'ring" },
      { status: 400 },
    );
  }

  const cred = await credentialById(credId);
  if (!cred || cred.emaktabLogin !== login.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "Qurilma topilmadi" }, { status: 404 });
  }

  const { rpID, expectedOrigin } = pwaRpConfig(req);
  try {
    const verification = await verifyAuthenticationResponse({
      response: body.response as never,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: credPublic(cred),
    });
    if (!verification.verified) {
      const fail = NextResponse.json({ ok: false, error: "Tasdiqlab bo'lmadi" }, { status: 400 });
      consumeChallenge(fail);
      return fail;
    }
    await updateCredentialCounter(credId, verification.authenticationInfo.newCounter);
    const profile = profileFromCredJson(cred.profileJson, login);
    const res = NextResponse.json({ ok: true, profile, hasPasskey: true });
    consumeChallenge(res);
    issueSessionCookie(res, profile);
    return res;
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 140) : "Xatolik";
    const fail = NextResponse.json({ ok: false, error: `Tasdiqlab bo'lmadi: ${msg}` }, { status: 400 });
    consumeChallenge(fail);
    return fail;
  }
}
