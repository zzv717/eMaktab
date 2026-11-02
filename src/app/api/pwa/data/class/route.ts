// 📱 PWA — 🏫 Sinfim (o'quvchilar/ota-onalar/xodimlar ro'yxati) — haqiqiy eMaktabdan
import { NextRequest, NextResponse } from "next/server";
import { fetchClassMembers, fetchTeacherGroups } from "@/lib/emaktab";
import { readSession, withEmaktabSession } from "@/lib/pwa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });

  const r = await withEmaktabSession(session.login, async (s) => {
    if (s.role !== "teacher") {
      return { forbidden: true as const };
    }
    const groups = await fetchTeacherGroups(s);
    if (groups.length === 0) return { groups: [] as Array<{ classId: string; className: string; students: Array<{ memberId: string; fullName: string }>; parents: Array<{ memberId: string; fullName: string }>; staff: Array<{ memberId: string; fullName: string }> }> };

    const out: Array<{
      classId: string;
      className: string;
      students: Array<{ memberId: string; fullName: string }>;
      parents: Array<{ memberId: string; fullName: string }>;
      staff: Array<{ memberId: string; fullName: string }>;
    }> = [];
    for (const g of groups.slice(0, 4)) {
      try {
        const info = await fetchClassMembers(s, g.classId, g.className);
        out.push({
          classId: g.classId,
          className: g.className,
          students: info.students.map((m) => ({ memberId: m.memberId, fullName: m.fullName })),
          parents: info.parents.map((m) => ({ memberId: m.memberId, fullName: m.fullName })),
          staff: info.staff.map((m) => ({ memberId: m.memberId, fullName: m.fullName })),
        });
      } catch {
        out.push({ classId: g.classId, className: g.className, students: [], parents: [], staff: [] });
      }
    }
    return { groups: out };
  });

  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 500 });
  if ("forbidden" in r.data) {
    return NextResponse.json({ ok: false, error: "Faqat o'qituvchilar uchun" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...r.data });
}
