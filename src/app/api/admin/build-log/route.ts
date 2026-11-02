// 🔍 Android build logi — CI xatolarini masofadan ko'rish uchun
import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/payments";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = "emaktab123";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ruxsat yo'q" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, log: (await getSetting("android_build_log")) ?? "" });
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ruxsat yo'q" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { log?: string };
  await setSetting("android_build_log", (body.log ?? "").slice(-8000));
  return NextResponse.json({ ok: true });
}
