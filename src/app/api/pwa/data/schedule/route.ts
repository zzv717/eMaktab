// 📱 PWA — 📚 Dars jadvali (haftalik, haqiqiy eMaktabdan)
// O'qituvchi uchun botdagi buildTeacherWeek bilan BIR XIL mantiq:
// 1) sinflar bo'yicha schedules API; 2) bo'sh bo'lsa — sinf a'zolari diary'si.
import { NextRequest, NextResponse } from "next/server";
import { fetchSchedule, fetchTeacherGroups, shiftDayKey, tashkentDayKey, type DaySchedule } from "@/lib/emaktab";
import { buildPwaTeacherWeek, dedupeScheduleDays, readSession, withEmaktabSession, withPerson } from "@/lib/pwa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Berilgan kun haftaning dushanbasi (Toshkent). */
function weekStart(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Yak,1=Dush...
  return shiftDayKey(dayKey, -((dow + 6) % 7));
}

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const personId = sp.get("personId");
  const week = Number(sp.get("week") ?? "0") || 0;

  const r = await withEmaktabSession(session.login, async (s0) => {
    const start = shiftDayKey(weekStart(tashkentDayKey()), week * 7);
    const end = shiftDayKey(start, 6);
    const s = withPerson(s0, personId);

    let days: DaySchedule[] = [];
    if (s.role === "teacher") {
      // 1) Sinflar bo'yicha schedules API (tez yo'l)
      const groups = await fetchTeacherGroups(s);
      for (const g of groups) {
        const gs = { ...s, active: { ...s.active, groupId: g.classId, groupName: g.className } };
        const part = await fetchSchedule(gs, start, end).catch(() => [] as DaySchedule[]);
        days = dedupeScheduleDays([...days, ...part]);
      }
      // 2) Bo'sh bo'lsa — botdagi kabi sinf a'zolari diary'sidan
      if (days.reduce((n, d) => n + d.lessons.length, 0) === 0) {
        days = await buildPwaTeacherWeek(
          session.login,
          s.fullName ?? "",
          groups.map((g) => ({ classId: g.classId, className: g.className, subjects: g.subjects ?? [] })),
          start,
          end,
        );
      }
    } else {
      days = dedupeScheduleDays(await fetchSchedule(s, start, end).catch(() => [] as DaySchedule[]));
    }
    return {
      persons: s0.persons.map((p) => ({
        personId: p.personId,
        fullName: p.fullName,
        groupName: p.groupName,
      })),
      active: s.active.personId,
      role: s.role,
      start,
      end,
      days,
    };
  });
  return NextResponse.json(r.ok ? { ok: true, ...r.data } : r);
}
