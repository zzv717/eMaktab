// 📱 PWA — 📄 Ish reja joylashtirish (o'qituvchi: sinf → fan → chorak → guruh → .xls/.xlsx fayl)
// Botdagi (bot.ts ctp oqimi) bilan bir xil mantiq: emaktab.ts'dagi importLessonPlan ishlatiladi.
import { NextRequest, NextResponse } from "next/server";
import {
  fetchPlanImportOptions,
  fetchTeacherGroups,
  importLessonPlan,
  planPeriodOptions,
  resolvePlanSubjectId,
  tashkentDayKey,
  type PlanOption,
} from "@/lib/emaktab";
import { readSession, withEmaktabSession } from "@/lib/pwa";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

type TeacherClass = { classId: string; className: string; subjects: string[] };

function schoolYear(): number {
  const tk = tashkentDayKey();
  const y = Number(tk.slice(0, 4));
  const m = Number(tk.slice(5, 7));
  return m >= 8 ? y : y - 1;
}

/** Sinf tanlanganda: choraklar va guruhlar (Butun sinf + kichik guruhlar). */
export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const classId = req.nextUrl.searchParams.get("classId") ?? "";

  const r = await withEmaktabSession(session.login, async (s) => {
    if (s.role !== "teacher") return { denied: true as const };
    const groups = await fetchTeacherGroups(s);
    const classes: TeacherClass[] = groups.map((g) => ({
      classId: g.classId,
      className: g.className,
      subjects: g.subjects,
    }));
    let periods: PlanOption[] = [];
    let subgroups: PlanOption[] = [];
    if (classId) {
      const opts = await fetchPlanImportOptions(s, { groupId: classId });
      periods = planPeriodOptions(opts.periods);
      subgroups = [{ value: "", name: "Butun sinf" }, ...opts.subgroups];
    }
    return { classes, periods, subgroups };
  });
  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 502 });
  if ("denied" in r.data) {
    return NextResponse.json({ ok: false, error: "Bu bo'lim faqat o'qituvchilar uchun" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...r.data });
}

/** Faylni yuklash (multipart/form-data: classId, subject, period, subgroup, file). */
export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const classId = String(form.get("classId") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const period = String(form.get("period") ?? "").trim() || "0";
  const subgroup = String(form.get("subgroup") ?? "");
  const file = form.get("file");

  if (!classId || !subject) {
    return NextResponse.json({ ok: false, error: "Sinf va fanni tanlang" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Fayl tanlanmagan" }, { status: 400 });
  }
  const fileName = file.name || "ish-reja.xlsx";
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
    return NextResponse.json({ ok: false, error: "Faqat .xls yoki .xlsx fayl yuboring" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Fayl 10 MB dan katta" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());

  const r = await withEmaktabSession(session.login, async (s) => {
    if (s.role !== "teacher") return { denied: true as const };
    const schoolId = s.active.schoolId;
    const subjectId = await resolvePlanSubjectId(s, { schoolId, groupId: classId, subjectName: subject });
    if (!subjectId) return { ok: false as const, reason: `fan ID topilmadi (${subject})` };
    return await importLessonPlan(s, {
      schoolId,
      groupId: classId,
      subjectId,
      subjectName: subject,
      period,
      subgroup,
      year: schoolYear(),
      fileName,
      bytes,
    });
  });
  if (!r.ok) return NextResponse.json(r, { status: r.auth ? 401 : 502 });
  if ("denied" in r.data) {
    return NextResponse.json({ ok: false, error: "Bu bo'lim faqat o'qituvchilar uchun" }, { status: 403 });
  }
  if (!r.data.ok) {
    return NextResponse.json({ ok: false, error: r.data.reason ?? "Ish reja joylashtirilmadi" }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
