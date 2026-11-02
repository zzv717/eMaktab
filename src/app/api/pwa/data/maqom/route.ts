// 📱 PWA — ✅ Maqom (o'qituvchi: sinf → fan → uy vazifasi → Bajarildi)
import { NextRequest, NextResponse } from "next/server";
import {
  fetchHomeworkRows,
  fetchTeacherGroups,
  setHomeworkMaqom,
  type HomeworkRow,
} from "@/lib/emaktab";
import { readSession, withEmaktabSession } from "@/lib/pwa";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const classId = sp.get("classId") ?? "";
  const subject = sp.get("subject") ?? "";

  const r = await withEmaktabSession(session.login, async (s) => {
    if (s.role !== "teacher") return { denied: true as const };
    const groups = await fetchTeacherGroups(s);
    const classes = groups.map((g) => ({
      classId: g.classId,
      className: g.className,
      subjects: g.subjects,
    }));
    let rows: HomeworkRow[] = [];
    let reason: string | undefined;
    if (classId && subject) {
      const cl = groups.find((g) => g.classId === classId);
      const hw = await fetchHomeworkRows(s, {
        schoolId: s.active.schoolId,
        className: cl?.className ?? classId,
        subjectName: subject,
      });
      rows = hw.rows;
      reason = hw.reason;
    }
    return { classes, rows, reason };
  });
  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 502 });
  if ("denied" in r.data) {
    return NextResponse.json({ ok: false, error: "Bu bo'lim faqat o'qituvchilar uchun" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...r.data });
}

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  let body: { workId?: string; lessonId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const workId = (body.workId ?? "").trim();
  if (!workId) return NextResponse.json({ ok: false, error: "Vazifa topilmadi" }, { status: 400 });

  const r = await withEmaktabSession(session.login, async (s) => {
    if (s.role !== "teacher") return { denied: true as const };
    return await setHomeworkMaqom(s, {
      schoolId: s.active.schoolId,
      workId,
      lessonId: body.lessonId || undefined,
    });
  });
  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 502 });
  if ("denied" in r.data) {
    return NextResponse.json({ ok: false, error: "Bu bo'lim faqat o'qituvchilar uchun" }, { status: 403 });
  }
  return NextResponse.json({ ok: r.data.ok, reason: r.data.reason ?? "" });
}
