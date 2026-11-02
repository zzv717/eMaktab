// 📱 PWA — 📊 Baholar (oxirgi 14 kun, haqiqiy eMaktabdan)
import { NextRequest, NextResponse } from "next/server";
import { fetchGrades, type Grade } from "@/lib/emaktab";
import { readSession, withEmaktabSession, withPerson } from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const personId = req.nextUrl.searchParams.get("personId");
  const r = await withEmaktabSession(session.login, async (s0) => {
    const s = withPerson(s0, personId);
    const grades = await fetchGrades(s, 14);
    return {
      persons: s0.persons.map((p) => ({
        personId: p.personId,
        fullName: p.fullName,
        groupName: p.groupName,
      })),
      active: s.active.personId,
      grades: grades as Grade[],
    };
  });
  return NextResponse.json(r.ok ? { ok: true, ...r.data } : r);
}
