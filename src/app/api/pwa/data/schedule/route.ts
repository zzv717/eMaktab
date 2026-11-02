// 📱 PWA — 📚 Dars jadvali (haftalik, haqiqiy eMaktabdan)
import { NextRequest, NextResponse } from "next/server";
import {
  fetchSchedule,
  fetchTeacherGroups,
  shiftDayKey,
  tashkentDayKey,
  type DaySchedule,
} from "@/lib/emaktab";
import { readSession, withEmaktabSession, withPerson } from "@/lib/pwa";

export const dynamic = "force-dynamic";

/** Berilgan kun haftaning dushanbasi (Toshkent). */
function weekStart(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Yak,1=Dush...
  return shiftDayKey(dayKey, -((dow + 6) % 7));
}

function dedupe(days: DaySchedule[]): DaySchedule[] {
  const byDate = new Map<string, DaySchedule>();
  for (const d of days) {
    const cur = byDate.get(d.date) ?? { date: d.date, weekday: d.weekday, lessons: [] };
    const seen = new Set<string>();
    for (const l of [...cur.lessons, ...d.lessons]) {
      const k = `${l.number}|${l.startTime}|${l.subject}|${l.groupName}`;
      if (!seen.has(k)) {
        seen.add(k);
        cur.lessons.push(l);
      }
    }
    byDate.set(d.date, cur);
  }
  return [...byDate.values()]
    .map((d) => ({ ...d, lessons: d.lessons.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")) }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
      // O'qituvchi: har bir sinf bo'yicha jadval — darslar groupName bilan keladi
      const groups = await fetchTeacherGroups(s);
      for (const g of groups) {
        const gs = { ...s, active: { ...s.active, groupId: g.classId, groupName: g.className } };
        const part = await fetchSchedule(gs, start, end).catch(() => [] as DaySchedule[]);
        days = dedupe([...days, ...part]);
      }
    } else {
      days = dedupe(await fetchSchedule(s, start, end).catch(() => [] as DaySchedule[]));
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
