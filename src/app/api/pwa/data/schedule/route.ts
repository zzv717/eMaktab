// 📱 PWA — 📚 Dars jadvali (haftalik, haqiqiy eMaktabdan)
// O'qituvchi uchun botdagi buildTeacherWeek bilan BIR XIL mantiq:
// 1) sinflar bo'yicha schedules API; 2) bo'sh bo'lsa — sinf a'zolari diary'si.
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { botUsers, memberAccounts } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import {
  fetchDiaryDays,
  fetchSchedule,
  fetchTeacherGroups,
  lessonMatchesTeacherLoad,
  loginEmaktab,
  pickPersonForClass,
  scheduleFromDiaryDays,
  shiftDayKey,
  tashkentDayKey,
  type DaySchedule,
  type Lesson,
} from "@/lib/emaktab";
import { readSession, withEmaktabSession, withPerson } from "@/lib/pwa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Berilgan kun haftaning dushanbasi (Toshkent). */
function weekStart(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Yak,1=Dush...
  return shiftDayKey(dayKey, -((dow + 6) % 7));
}

function classIdMatch(a: string | null | undefined, b: string): boolean {
  if (!a) return true;
  return a === b || a.includes(b) || b.includes(a);
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

/** O'qituvchi jadvali — sinf a'zolari diary'sidan (botdagi buildTeacherWeek kabi). */
async function teacherWeekFromDiaries(
  telegramId: number,
  fullName: string,
  groups: { classId: string; className: string; subjects: string[] }[],
  start: string,
  end: string,
): Promise<DaySchedule[]> {
  const saved = await db
    .select()
    .from(memberAccounts)
    .where(eq(memberAccounts.teacherTelegramId, telegramId));

  let all: DaySchedule[] = [];
  for (const cl of groups) {
    const subjects = cl.subjects ?? [];
    const candidates = saved
      .filter((s) => classIdMatch(s.classId, cl.classId) && s.emaktabLogin && s.emaktabPasswordEnc)
      .sort((a, b) => (a.kind === "student" ? 0 : 1) - (b.kind === "student" ? 0 : 1))
      .slice(0, 3);

    const perDate = new Map<string, { weekday: number; byKey: Map<string, Lesson> }>();
    for (const acc of candidates) {
      try {
        const password = decryptSecret(acc.emaktabPasswordEnc!);
        const res = await loginEmaktab(acc.emaktabLogin!, password);
        if (res.status !== "ok") continue;
        // Ota-ona hisobida FARZANDLAR aralashib ketmasligi uchun aynan shu sinf personi
        const person = pickPersonForClass(res.session.persons, cl.classId, cl.className);
        if (!person) continue;
        const diaryDays = await fetchDiaryDays({ ...res.session, active: person }, start, end);
        const sched = scheduleFromDiaryDays(diaryDays);
        for (const day of sched) {
          let slot = perDate.get(day.date);
          if (!slot) {
            slot = { weekday: day.weekday, byKey: new Map() };
            perDate.set(day.date, slot);
          }
          for (const l of day.lessons) {
            const key = `${l.number}|${l.subject}|${l.startTime ?? ""}`;
            if (!slot.byKey.has(key)) slot.byKey.set(key, l);
          }
        }
        if (sched.length > 0) break; // bitta ishlaydigan a'zo yetarli
      } catch {
        /* keyingi a'zo bilan davom */
      }
    }

    // Faqat shu o'qituvchining darslari qoladi (botdagi lessonMatchesTeacherLoad kabi)
    for (const [date, slot] of perDate.entries()) {
      const kept = [...slot.byKey.values()].filter((l) =>
        lessonMatchesTeacherLoad(l.subject, l.teacher, subjects, fullName),
      );
      if (kept.length > 0) {
        all = dedupe([...all, { date, weekday: slot.weekday, lessons: kept }]);
      }
    }
  }
  return all;
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
        days = dedupe([...days, ...part]);
      }
      // 2) Bo'sh bo'lsa — botdagi kabi sinf a'zolari diary'sidan
      if (days.reduce((n, d) => n + d.lessons.length, 0) === 0) {
        const rows = await db
          .select()
          .from(botUsers)
          .where(sql`lower(${botUsers.emaktabLogin}) = ${session.login.toLowerCase()}`)
          .limit(1);
        const tg = rows[0]?.telegramId;
        if (tg) {
          days = await teacherWeekFromDiaries(
            tg,
            s.fullName ?? "",
            groups.map((g) => ({ classId: g.classId, className: g.className, subjects: g.subjects ?? [] })),
            start,
            end,
          );
        }
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
