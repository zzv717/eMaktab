// 📱 PWA — ✅ Darsni o'tildi qilish (haqiqiy eMaktabga yoziladi)
import { NextRequest, NextResponse } from "next/server";
import {
  fetchHomeworkRows,
  fetchLessonHeldPage,
  fetchTeacherGroups,
  setLessonConducted,
  setLessonHeld,
  type HomeworkRow,
} from "@/lib/emaktab";
import { readSession, withEmaktabSession, withPerson } from "@/lib/pwa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type ConductLesson = {
  lessonId: string;
  workId: string;
  dateText: string;
  lessonNo: string;
  description: string;
  subject: string;
  className: string;
};

/** GET — sinf+fan bo'yicha o'tilmagan darslar ro'yxati (faqat qilinmaganlari). */
export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const classId = sp.get("classId") ?? "";
  const subject = sp.get("subject") ?? "";

  const r = await withEmaktabSession(session.login, async (s0) => {
    const s = withPerson(s0, undefined);
    if (s.role !== "teacher") return { forbidden: true as const };
    const groups = await fetchTeacherGroups(s);
    const classes = groups.map((g) => ({
      classId: g.classId,
      className: g.className,
      subjects: g.subjects ?? [],
    }));
    if (!classId || !subject) {
      return { classes, lessons: [] as ConductLesson[] };
    }
    const g = groups.find((x) => x.classId === classId);
    if (!g) return { classes, lessons: [] as ConductLesson[] };

    const { rows, reason } = await fetchHomeworkRows(s, {
      schoolId: s.active.schoolId,
      className: g.className,
      subjectName: subject,
    });
    if (rows.length === 0) return { classes, lessons: [] as ConductLesson[], reason };

    // Eng so'nggi 21 qator (ro'yxat yangidan eski tomon) + held holatini
    // parallel tekshirish (5 tadan) — faqat o'tilmaganlari qaytadi.
    const recent = rows.slice(0, 21);
    const checked: Array<{ row: HomeworkRow; held: boolean | null }> = [];
    for (let i = 0; i < recent.length; i += 5) {
      const chunk = recent.slice(i, i + 5);
      const states = await Promise.all(
        chunk.map((row) =>
          fetchLessonHeldPage(s, s.active.schoolId, row.lessonId)
            .then((p) => (p.exists ? p.held : null))
            .catch(() => null),
        ),
      );
      chunk.forEach((row, j) => checked.push({ row, held: states[j] ?? null }));
    }
    const lessons: ConductLesson[] = checked
      .filter((x) => x.held === false)
      .map(({ row }) => ({
        lessonId: row.lessonId,
        workId: row.workId,
        dateText: row.dateText,
        lessonNo: row.lessonNo,
        description: row.description,
        subject: row.subject,
        className: row.className,
      }));
    return { classes, lessons };
  });

  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 500 });
  if ("forbidden" in r.data) {
    return NextResponse.json({ ok: false, error: "Faqat o'qituvchilar uchun" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...r.data });
}

/** POST — darsni "o'tildi" deb belgilash (lessonId bilan yoki eski formatda). */
export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    lessonId?: string;
    classId?: string;
    className?: string;
    subjectName?: string;
    date?: string;
    lessonNumber?: number;
  };

  const r = await withEmaktabSession(session.login, async (s) => {
    if (s.role !== "teacher") return { forbidden: true as const };
    if (body.lessonId) {
      return { res: await setLessonHeld(s, { schoolId: s.active.schoolId, lessonId: body.lessonId, held: true }) };
    }
    if (!body.classId || !body.subjectName || !body.date || !body.lessonNumber) {
      return { missing: true as const };
    }
    return {
      res: await setLessonConducted(s, {
        classId: body.classId,
        className: body.className ?? "",
        subjectName: body.subjectName,
        date: body.date,
        lessonNumber: body.lessonNumber,
      }),
    };
  });

  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 500 });
  if ("forbidden" in r.data) {
    return NextResponse.json({ ok: false, error: "Faqat o'qituvchilar uchun" }, { status: 403 });
  }
  if ("missing" in r.data) {
    return NextResponse.json({ ok: false, error: "Ma'lumot to'liq emas" }, { status: 400 });
  }
  return NextResponse.json({ ok: r.data.res.ok, error: r.data.res.reason ?? undefined, message: r.data.res.ok ? "Dars o'tildi deb belgilandi" : undefined });
}
