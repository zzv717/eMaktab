// 📱 PWA panellari — Baholar · Dars jadvali · Yangiliklar · Nazoratchi · Testlar · Maqom
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, weekdayOf, WEEKDAYS } from "./api";

type Person = { personId: string; fullName: string; groupName: string };
type Ok = { ok: boolean; error?: string };

const card = "rounded-3xl bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.08)]";
const chip = "rounded-full px-3 py-1.5 text-sm font-medium transition";
const btn = "rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50";

function Err({ msg }: { msg: string }) {
  return <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{msg}</p>;
}
function Loading() {
  return <p className="p-6 text-center text-slate-400">⏳ Yuklanmoqda…</p>;
}

function PersonTabs({
  persons,
  active,
  onPick,
}: {
  persons: Person[];
  active: string;
  onPick: (id: string) => void;
}) {
  if (persons.length <= 1) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {persons.map((p) => (
        <button
          key={p.personId}
          onClick={() => onPick(p.personId)}
          className={`${chip} ${p.personId === active ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          👶 {p.fullName}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ 📊 Baholar
type Grade = { date: string; subject: string; values: number[]; workType: string | null; comment: string | null; isFinal: boolean };

export function GradesPanel() {
  const [data, setData] = useState<{ persons: Person[]; active: string; grades: Grade[] } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (personId?: string) => {
    setError("");
    const r = await api<{ ok: boolean; error?: string; persons: Person[]; active: string; grades: Grade[] }>(
      `/api/pwa/data/grades${personId ? `?personId=${encodeURIComponent(personId)}` : ""}`,
    );
    if (!r.ok) setError(r.error ?? "Yuklab bo'lmadi");
    else setData(r);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Err msg={error} />;
  if (!data) return <Loading />;

  const bySubject = new Map<string, Grade[]>();
  for (const g of data.grades) {
    const arr = bySubject.get(g.subject) ?? [];
    arr.push(g);
    bySubject.set(g.subject, arr);
  }
  return (
    <div>
      <PersonTabs persons={data.persons} active={data.active} onPick={(id) => void load(id)} />
      {bySubject.size === 0 && (
        <div className={card}>
          <p className="text-slate-500">So'nggi 14 kunda baho yo'q.</p>
        </div>
      )}
      {[...bySubject.entries()].map(([subject, list]) => {
        const all = list.flatMap((g) => g.values);
        const avg = all.reduce((a, b) => a + b, 0) / (all.length || 1);
        return (
          <div key={subject} className={`${card} mb-3`}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">{subject}</p>
              <p className="rounded-full bg-teal-50 px-2.5 py-1 text-sm font-semibold text-teal-800">
                ⌀ {avg.toFixed(2)}
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {list.map((g, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">
                      {fmtDate(g.date)} {g.workType ? `· ${g.workType}` : ""}
                    </p>
                    {g.comment && <p className="mt-0.5 truncate text-xs text-slate-400">{g.comment}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {g.values.map((v, j) => (
                      <span
                        key={j}
                        className={`grid h-8 w-8 place-items-center rounded-xl text-sm font-bold ${
                          v >= 4 ? "bg-emerald-100 text-emerald-700" : v >= 3 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------- 📚 Dars jadvali
type Lesson = {
  number: number;
  subject: string;
  teacher: string | null;
  groupName: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  isCanceled: boolean;
  homework: string | null;
  homeworkDone: boolean;
  marks: number[];
};
type DaySchedule = { date: string; weekday: number; lessons: Lesson[] };

export function SchedulePanel() {
  const [data, setData] = useState<{ persons: Person[]; active: string; role: string; start: string; end: string; days: DaySchedule[] } | null>(null);
  const [error, setError] = useState("");
  const [week, setWeek] = useState(0);
  const [person, setPerson] = useState<string | undefined>(undefined);

  const load = useCallback(async (w: number, personId?: string) => {
    setError("");
    const qs = new URLSearchParams({ week: String(w) });
    if (personId) qs.set("personId", personId);
    const r = await api<{ ok: boolean; error?: string; persons: Person[]; active: string; role: string; start: string; end: string; days: DaySchedule[] }>(
      `/api/pwa/data/schedule?${qs}`,
    );
    if (!r.ok) setError(r.error ?? "Yuklab bo'lmadi");
    else setData(r);
  }, []);

  useEffect(() => {
    void load(week, person);
  }, [week, person, load]);

  if (error) return <Err msg={error} />;
  if (!data) return <Loading />;

  const byDate = new Map(data.days.map((d) => [d.date, d]));
  const days: DaySchedule[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.parse(`${data.start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    days.push(byDate.get(dt) ?? { date: dt, weekday: i, lessons: [] });
  }

  return (
    <div>
      <PersonTabs persons={data.persons} active={data.active} onPick={setPerson} />
      <div className="mb-3 flex items-center justify-between">
        <button className={`${btn} border border-slate-200 bg-white text-slate-700`} onClick={() => setWeek(week - 1)}>
          ← Oldingi
        </button>
        <p className="text-sm font-semibold text-slate-700">
          {fmtDate(data.start)} – {fmtDate(data.end)}
        </p>
        <button className={`${btn} border border-slate-200 bg-white text-slate-700`} onClick={() => setWeek(week + 1)}>
          Keyingi →
        </button>
      </div>
      {days.map((d) => (
        <div key={d.date} className={`${card} mb-3`}>
          <p className="font-semibold text-slate-900">
            {fmtDate(d.date)} · {WEEKDAYS[d.weekday]}
            {d.lessons.length === 0 && <span className="ml-2 text-sm font-normal text-slate-400">dam olish kuni</span>}
          </p>
          <div className="mt-2 space-y-2">
            {d.lessons.map((l, i) => (
              <div key={i} className={`rounded-2xl p-3 ${l.isCanceled ? "bg-rose-50 opacity-70" : "bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {l.number}. {l.subject}
                      {l.isCanceled && <span className="ml-2 text-xs text-rose-500">bekor qilingan</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {l.startTime ? `${l.startTime} – ${l.endTime ?? ""}` : ""}
                      {l.groupName ? ` · 🏫 ${l.groupName}` : ""}
                      {l.teacher ? ` · 👤 ${l.teacher}` : ""}
                      {l.room ? ` · 🚪 ${l.room}` : ""}
                    </p>
                    {l.homework && (
                      <p className="mt-1.5 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
                        📝 {l.homework} {l.homeworkDone && " ✅"}
                      </p>
                    )}
                  </div>
                  {l.marks.length > 0 && (
                    <div className="flex shrink-0 gap-1">
                      {l.marks.map((m, j) => (
                        <span key={j} className="grid h-7 w-7 place-items-center rounded-lg bg-teal-100 text-xs font-bold text-teal-800">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- 📰 Yangiliklar
type NewsPost = { id: string | null; title: string | null; text: string; author: string | null; date: string | null };

export function NewsPanel() {
  const [data, setData] = useState<{ posts: NewsPost[]; school: string } | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(-1);

  useEffect(() => {
    void (async () => {
      const r = await api<{ ok: boolean; error?: string; posts: NewsPost[]; school: string }>("/api/pwa/data/news");
      if (!r.ok) setError(r.error ?? "Yuklab bo'lmadi");
      else setData(r);
    })();
  }, []);

  if (error) return <Err msg={error} />;
  if (!data) return <Loading />;
  return (
    <div>
      {data.school && <p className="mb-3 text-sm text-slate-500">🏫 {data.school}</p>}
      {data.posts.length === 0 && <div className={card}>Yangiliklar topilmadi.</div>}
      {data.posts.map((p, i) => (
        <div key={i} className={`${card} mb-3`}>
          <button className="w-full text-left" onClick={() => setOpen(open === i ? -1 : i)}>
            <p className="font-semibold text-slate-900">{p.title ?? "Yangilik"}</p>
            <p className="mt-1 text-xs text-slate-400">
              {p.date ? fmtDate(p.date) : ""}
              {p.author ? ` · ${p.author}` : ""}
            </p>
            <p className={`mt-2 whitespace-pre-line text-sm text-slate-600 ${open === i ? "" : "line-clamp-3"}`}>
              {p.text}
            </p>
            <p className="mt-1 text-xs font-medium text-teal-700">{open === i ? "▲ Yopish" : "▼ Davomini o'qish"}</p>
          </button>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- 👁 Nazoratchi
type Tutor = { id: number; subject: string; book: string | null; time: string; days: string; place: string | null };
type NzLink = {
  id: number;
  childName: string;
  parentName: string;
  status: string;
  childBlocked: string;
  testLevel: number;
  tutors: Tutor[];
  quizzes: { quizId: string; source: string; date: string; total: number; answered: number; correct: number }[];
};

function daysLabel(days: string): string {
  try {
    const arr = JSON.parse(days) as number[];
    return arr.map((d) => WEEKDAYS[d]?.slice(0, 2) ?? d).join(" · ");
  } catch {
    return days;
  }
}

export function NazoratchiPanel() {
  const [data, setData] = useState<{ linked: boolean; links?: NzLink[]; role?: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await api<{ ok: boolean; error?: string; linked: boolean; links?: NzLink[]; role?: string }>(
        "/api/pwa/data/nazoratchi",
      );
      if (!r.ok) setError(r.error ?? "Yuklab bo'lmadi");
      else setData(r);
    })();
  }, []);

  if (error) return <Err msg={error} />;
  if (!data) return <Loading />;
  if (!data.linked) {
    return (
      <div className={card}>
        <p className="font-semibold text-slate-900">👁 Nazoratchi</p>
        <p className="mt-2 text-sm text-slate-600">
          Nazoratchi Telegram bot orqali ishlaydi. Farzandingizni ulash uchun botni oching:
          <b> 👁 Nazoratchi → 🔗 Ulanish</b>.
        </p>
        <a
          href="https://t.me/emaktab_azizbek_bot"
          target="_blank"
          rel="noopener"
          className={`${btn} mt-4 block bg-teal-700 text-center text-white`}
        >
          🤖 Botni ochish
        </a>
      </div>
    );
  }
  return (
    <div>
      {(data.links ?? []).length === 0 && (
        <div className={card}>
          <p className="text-slate-600">Hozircha ulanish yo'q. Bot orqali farzandingizni ulang.</p>
          <a href="https://t.me/emaktab_azizbek_bot" target="_blank" rel="noopener" className={`${btn} mt-4 block bg-teal-700 text-center text-white`}>
            🤖 Botni ochish
          </a>
        </div>
      )}
      {(data.links ?? []).map((l) => (
        <div key={l.id} className={`${card} mb-3`}>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-900">👶 {l.childName || "Farzand"}</p>
            <div className="flex gap-1.5">
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                daraja {l.testLevel}
              </span>
              {l.childBlocked === "yes" && (
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">⛔ blok</span>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Repetitorlar</p>
          {l.tutors.length === 0 && <p className="mt-1 text-sm text-slate-400">repetitor qo'shilmagan</p>}
          <div className="mt-1.5 space-y-1.5">
            {l.tutors.map((t) => (
              <div key={t.id} className="rounded-2xl bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">
                  🧑‍🏫 {t.subject}
                  {t.book ? ` · 📚 ${t.book}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  ⏰ {t.time} · 📅 {daysLabel(t.days)}
                  {t.place ? ` · 📍 ${t.place}` : ""}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Oxirgi testlar</p>
          {l.quizzes.length === 0 && <p className="mt-1 text-sm text-slate-400">testlar hali yo'q</p>}
          <div className="mt-1.5 space-y-1.5">
            {l.quizzes.slice(0, 5).map((q) => (
              <div key={q.quizId} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-700">{q.source || "Test"}</p>
                  <p className="text-xs text-slate-400">{fmtDate(q.date)}</p>
                </div>
                <p className="shrink-0 font-semibold text-slate-800">
                  {q.correct}/{q.total}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ 📝 Testlar
export function TestsPanel() {
  const [links, setLinks] = useState<NzLink[] | null>(null);
  const [linkId, setLinkId] = useState(0);
  const [quizzes, setQuizzes] = useState<{ quizId: string; source: string; date: string; total: number; answered: number; correct: number }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Forma
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<"book" | "topic">("topic");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");
  const [topic, setTopic] = useState("");

  const loadHistory = useCallback(async (id: number) => {
    const r = await api<{ ok: boolean; error?: string; quizzes: typeof quizzes }>(`/api/pwa/data/tests?linkId=${id}`);
    if (r.ok) setQuizzes(r.quizzes ?? []);
    else setError(r.error ?? "Yuklab bo'lmadi");
  }, []);

  useEffect(() => {
    void (async () => {
      const r = await api<{ ok: boolean; error?: string; linked: boolean; links?: NzLink[] }>(
        "/api/pwa/data/nazoratchi",
      );
      if (!r.ok) {
        setError(r.error ?? "Yuklab bo'lmadi");
        return;
      }
      const ls = r.links ?? [];
      setLinks(ls);
      if (ls.length > 0) {
        setLinkId(ls[0]!.id);
        void loadHistory(ls[0]!.id);
      }
    })();
  }, [loadHistory]);

  const create = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await api<Ok & { message?: string }>("/api/pwa/data/tests", {
      linkId,
      count,
      mode,
      title,
      author,
      pages,
      topic,
    });
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Yaratib bo'lmadi");
    else {
      setNotice(r.message ?? "✅ Yaratildi!");
      void loadHistory(linkId);
    }
  };

  if (error && !links) return <Err msg={error} />;
  if (links === null) return <Loading />;

  if (links.length === 0) {
    return (
      <div className={card}>
        <p className="font-semibold text-slate-900">📝 Testlar</p>
        <p className="mt-2 text-sm text-slate-600">
          Testlar Nazoratchi orqali yaratiladi. Avval bot orqali farzandingizni ulang.
        </p>
        <a href="https://t.me/emaktab_azizbek_bot" target="_blank" rel="noopener" className={`${btn} mt-4 block bg-teal-700 text-center text-white`}>
          🤖 Botni ochish
        </a>
      </div>
    );
  }

  return (
    <div>
      {links.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setLinkId(l.id);
                void loadHistory(l.id);
              }}
              className={`${chip} ${l.id === linkId ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              👶 {l.childName || "Farzand"}
            </button>
          ))}
        </div>
      )}

      {notice && <p className="mb-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {error && <Err msg={error} />}

      {/* Yangi test */}
      <div className={`${card} mb-3`}>
        <p className="font-semibold text-slate-900">➕ Yangi test</p>
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Nechta savol? (kamida 10)</p>
            <input
              type="number"
              min={10}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-600"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMode("topic")}
              className={`${chip} flex-1 ${mode === "topic" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              🧑‍🏫 Mavzu
            </button>
            <button
              onClick={() => setMode("book")}
              className={`${chip} flex-1 ${mode === "book" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              📚 Kitob
            </button>
          </div>
          {mode === "topic" ? (
            <input
              placeholder="Mavzu (masalan: Kesimlar to'plami)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-600"
            />
          ) : (
            <div className="space-y-2">
              <input
                placeholder="Kitob nomi"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-600"
              />
              <input
                placeholder="Muallif (ixtiyoriy)"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-600"
              />
              <input
                placeholder="Betlar (ixtiyoriy, masalan: 12-20)"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-600"
              />
            </div>
          )}
          <button
            onClick={() => void create()}
            disabled={busy || count < 10 || (mode === "book" ? !title : !topic)}
            className={`${btn} w-full bg-teal-700 text-white`}
          >
            {busy ? "⏳ Tayyorlanmoqda…" : "🚀 Test yaratish"}
          </button>
          <p className="text-xs text-slate-400">Test savollari Telegram orqali bolaga, javoblar kitobi esa sizga yuboriladi.</p>
        </div>
      </div>

      {/* Tarix */}
      <div className={`${card} mb-3`}>
        <p className="font-semibold text-slate-900">🗂 Testlar tarixi</p>
        {quizzes.length === 0 && <p className="mt-2 text-sm text-slate-400">Hozircha test yo'q.</p>}
        <div className="mt-2 space-y-2">
          {quizzes.map((q) => (
            <div key={q.quizId} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate text-slate-700">{q.source || "Test"}</p>
                <p className="text-xs text-slate-400">
                  {fmtDate(q.date)} · {q.answered}/{q.total} javob berildi
                </p>
              </div>
              <p className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 font-semibold text-teal-800">
                {q.correct}/{q.total}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- ✅ Maqom
type HwRow = {
  workId: string;
  lessonId: string;
  dateText: string;
  lessonNo: string;
  description: string;
  subject: string;
  className: string;
  hisobot: string;
  maqom: string;
  maqomDone: boolean;
};
type TeacherClass = { classId: string; className: string; subjects: string[] };

export function MaqomPanel() {
  const [classes, setClasses] = useState<TeacherClass[] | null>(null);
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [rows, setRows] = useState<HwRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (cid: string, subj: string) => {
    setError("");
    const qs = new URLSearchParams();
    if (cid) qs.set("classId", cid);
    if (subj) qs.set("subject", subj);
    const r = await api<{ ok: boolean; error?: string; classes: TeacherClass[]; rows: HwRow[]; reason?: string }>(
      `/api/pwa/data/maqom?${qs}`,
    );
    if (!r.ok) setError(r.error ?? "Yuklab bo'lmadi");
    else {
      setClasses(r.classes);
      setRows(r.rows);
      if (r.reason) setNotice("");
    }
  }, []);

  useEffect(() => {
    void load("", "");
  }, [load]);

  const markDone = async (row: HwRow) => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await api<Ok & { reason?: string }>("/api/pwa/data/maqom", {
      workId: row.workId,
      lessonId: row.lessonId,
    });
    setBusy(false);
    if (!r.ok) setError(r.error ?? r.reason ?? "Belgilab bo'lmadi");
    else {
      setNotice(`✅ Maqom berildi — ${row.subject} (${row.dateText})`);
      void load(classId, subject);
    }
  };

  if (error && classes === null) return <Err msg={error} />;
  if (classes === null) return <Loading />;

  const current = classes.find((c) => c.classId === classId);
  return (
    <div>
      {notice && <p className="mb-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {error && <Err msg={error} />}

      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">1️⃣ Sinf</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {classes.map((c) => (
            <button
              key={c.classId}
              onClick={() => {
                setClassId(c.classId);
                setSubject("");
                setRows([]);
                void load(c.classId, "");
              }}
              className={`${chip} ${c.classId === classId ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              🏫 {c.className}
            </button>
          ))}
        </div>

        {current && (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">2️⃣ Fan</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {current.subjects.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSubject(s);
                    void load(classId, s);
                  }}
                  className={`${chip} ${s === subject ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  📖 {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {classId && subject && (
        <div className={`${card} mb-3`}>
          <p className="font-semibold text-slate-900">3️⃣ Uy vazifalari</p>
          {rows.length === 0 && <p className="mt-2 text-sm text-slate-400">Vazifalar topilmadi.</p>}
          <div className="mt-2 space-y-2">
            {rows.map((r) => (
              <div key={r.workId} className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">
                      <span className="mr-1">{r.maqomDone ? "🟢" : "🔴"}</span>
                      {r.dateText} — {r.lessonNo}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{r.description}</p>
                  </div>
                  {!r.maqomDone && (
                    <button
                      onClick={() => void markDone(r)}
                      disabled={busy}
                      className={`${btn} shrink-0 bg-teal-700 text-white`}
                    >
                      ✅ Bajarildi
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
