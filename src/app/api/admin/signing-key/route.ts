// 🔐 Android APK imzolash kaliti — ma'lumotlar bazasida (git'da EMAS).
// GitHub Actions workflow: GET = mavjud kalitni oladi, POST = birinchi marta yaratib saqlaydi.
import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/payments";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = "emaktab123";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ruxsat yo'q" }, { status: 403 });
  }
  const b64 = await getSetting("android_keystore_b64");
  const password = await getSetting("android_keystore_password");
  const fingerprint = await getSetting("android_signing_fp");
  if (!b64 || !password) {
    return NextResponse.json({ ok: false, error: "kalit hali yaratilmagan" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, b64, password, alias: "emaktab", fingerprint: fingerprint ?? "" });
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ruxsat yo'q" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    b64?: string;
    password?: string;
    fingerprint?: string;
    force?: boolean;
  };
  if (!body.b64 || !body.password) {
    return NextResponse.json({ ok: false, error: "b64/password kerak" }, { status: 400 });
  }
  const existing = await getSetting("android_keystore_b64");
  if (existing && !body.force) {
    return NextResponse.json({ ok: true, saved: false, message: "allaqachon saqlangan" });
  }
  await setSetting("android_keystore_b64", body.b64);
  await setSetting("android_keystore_password", body.password);
  if (body.fingerprint) await setSetting("android_signing_fp", body.fingerprint);
  return NextResponse.json({ ok: true, saved: true });
}
