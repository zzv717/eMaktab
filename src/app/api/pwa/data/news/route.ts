// 📱 PWA — 📰 Yangiliklar (haqiqiy eMaktabdan)
import { NextRequest, NextResponse } from "next/server";
import { fetchNews } from "@/lib/emaktab";
import { readSession, withEmaktabSession } from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const r = await withEmaktabSession(session.login, async (s) => {
    const posts = await fetchNews(s, 30);
    return { posts, school: s.active.schoolName };
  });
  return NextResponse.json(r.ok ? { ok: true, ...r.data } : r);
}
