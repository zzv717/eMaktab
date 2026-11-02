// 📱 PWA — joriy sessiya (profil + passkey holati)
import { NextRequest, NextResponse } from "next/server";
import { credentialsForLogin, readSession } from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, authed: false });
  }
  const creds = await credentialsForLogin(session.login);
  return NextResponse.json({ ok: true, authed: true, profile: session, hasPasskey: creds.length > 0 });
}
