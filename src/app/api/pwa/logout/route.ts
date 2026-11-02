// 📱 PWA — chiqish (cookie'larni tozalash)
import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
