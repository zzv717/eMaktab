// 📱 PWA — ✅ Darsni o'tildi qilish (haqiqiy eMaktabga yoziladi)
import { NextRequest, NextResponse } from "next/server";
import { fetchSchedule, fetchTeacherGroups, setLessonConducted, tashkentDayKey, type DaySchedule } from "@/lib/emaktab";
import { dedupeScheduleDays, readSession, withEmaktabSession, withPerson } from "@/lib/pwa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — sinf va sana bo'yicha darslar ro'yxati */
export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const classId = sp.get("classId") ?? "";
  const date = sp.get("date") ?? tashkentDayKey();

  const r = await withEmaktabSession(session.login, async (s0) => {
    const s = withPerson(s0, undefined);
    if (s.role !== "teacher") return { forbidden: true as const };
    const groups = await fetchTeacherGroups(s);
    const classes = groups.map((g) => ({ classId: g.classId, className: g.className, subjects: g.subjects ?? [] }));
    if (!classId) return { classes, date, lessons: [] as Array<{ number: number; subject: string; date: string }> };

    const g = groups.find((x) => x.classId === classId);
    if (!g) return { classes, date, lessons: [] as Array<{ number: number; subject: string; date: string }> };
    const gs = { ...s, active: { ...s.active, groupId: g.classId, groupName: g.className } };
    const days = dedupeScheduleDays(await fetchSchedule(gs, date, date).catch(() => [] as DaySchedule[]));
    const lessons = (days[0]?.lessons ?? [])
      .filter((l) => !l.isCanceled)
      .map((l) => ({ number: l.number, subject: l.subject, date }));
    return { classes, date, lessons };
  });

  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 500 });
  if ("forbidden" in r.data) {
    return NextResponse.json({ ok: false, error: "Faqat o'qituvchilar uchun" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...r.data });
}

/** POST — darsni "o'tildi" deb belgilash */
export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    classId?: string;
    className?: string;
    subjectName?: string;
    date?: string;
    lessonNumber?: number;
  };
  if (!body.classId || !body.subjectName || !body.date || !body.lessonNumber) {
    return NextResponse.json({ ok: false, error: "Ma'lumot to'liq emas" }, { status: 400 });
  }

  const r = await withEmaktabSession(session.login, async (s) => {
    if (s.role !== "teacher") return { forbidden: true as const };
    const res = await setLessonConducted(s, {
      classId: body.classId!,
      className: body.className ?? "",
      subjectName: body.subjectName!,
      date: body.date!,
      lessonNumber: body.lessonNumber!,
    });
    return { done: res };
  });

  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 500 });
  if ("forbidden" in r.data) {
    return NextResponse.json({ ok: false, error: "Faqat o'qituvchilar uchun" }, { status: 403 });
  }
  const done = r.data.done;
  return NextResponse.json(
    done.ok
      ? { ok: true, message: "✅ Dars o'tildi deb belgilandi" }
      : { ok: false, error: done.reason ?? "Belgilab bo'lmadi" },
  );
}
