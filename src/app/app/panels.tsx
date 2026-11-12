// 📱 PWA panellari — Baholar · Dars jadvali · Yangiliklar · Nazoratchi · Testlar · Maqom
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, weekdayOf, WEEKDAYS } from "./api";

type Person = { personId: string; fullName: string; groupName: string };
type Ok = { ok: boolean; error?: string };

const card = "rounded-3xl bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.08)]";
const chip = "rounded-full px-3 py-1.5 text-sm font-medium transition";
const btn = "rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50";

function Err({ msg, auth }: { msg: string; auth?: boolean }) {
  return (
    <div className="rounded-2xl bg-rose-50 p-3">
      <p className="text-sm text-rose-700">{msg}</p>
      {(auth || /qayta kir|sessiya|captcha|hisob/i.test(msg)) && (
        <button
          className="mt-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            void fetch("/api/pwa/logout", { method: "POST" }).then(() => {
              window.location.reload();
            });
          }}
        >
          🔁 Qayta kirish
        </button>
      )}
    </div>
  );
}
function Loading() {
  return <p className="p-6 text-center text-slate-400">⏳ Yuklanmoqda…</p>;
}

/** Butun jarayon fon kechadi — foydalanuvchi faqat shu loading'ni ko'radi. */
function BatchOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 px-6 backdrop-blur-[2px]">
      <div className="w-full max-w-xs rounded-3xl bg-white px-8 py-8 text-center shadow-2xl">
        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-teal-200 border-t-teal-700" />
        <p className="mt-4 text-sm font-semibold text-slate-800">{label}</p>
        <p className="mt-1 text-xs text-slate-400">Iltimos kuting — sahifani yopmang</p>
      </div>
    </div>
  );
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
      {data.role === "teacher" && days.every((d) => d.lessons.length === 0) && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <b>Jadval hali bo'sh.</b> O'qituvchi jadvali sinf o'quvchilarining kirish ma'lumotlari orqali
            yig'iladi (Telegram botdagi <b>⚡ Barchani tekshirish</b> kabi). Ilova avtomatik sinaydi —
            ma'lumotlar qo'shilgach shu yerda ko'rinadi.
          </p>
        </div>
      )}
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
  const [batch, setBatch] = useState(false);
  const [progress, setProgress] = useState("");

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

  // 🔄 Hammasiga maqom berish — fon kechadi, foydalanuvchi faqat loading ko'radi
  const markAll = async () => {
    const pending = rows.filter((r) => !r.maqomDone);
    if (pending.length === 0) return;
    setBatch(true);
    setError("");
    setNotice("");
    let done = 0;
    let fail = 0;
    for (let i = 0; i < pending.length; i++) {
      setProgress(`Maqom berilmoqda… (${i + 1}/${pending.length})`);
      const r = await api<Ok & { reason?: string }>("/api/pwa/data/maqom", {
        workId: pending[i].workId,
        lessonId: pending[i].lessonId,
      });
      if (r.ok) done++;
      else fail++;
    }
    setBatch(false);
    setProgress("");
    setNotice(fail > 0 ? `⚠️ ${done} ta berildi, ${fail} ta bajarilmadi` : `✅ Yakunlandi — ${done} ta maqom berildi`);
    void load(classId, subject);
  };

  if (error && classes === null) return <Err msg={error} />;
  if (classes === null) return <Loading />;

  const current = classes.find((c) => c.classId === classId);
  const pending = rows.filter((r) => !r.maqomDone);
  return (
    <div>
      {batch && <BatchOverlay label={progress || "Maqom berilmoqda…"} />}
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
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-900">3️⃣ Uy vazifalari</p>
            {pending.length > 1 && (
              <button
                onClick={() => void markAll()}
                disabled={busy || batch}
                className={`${btn} shrink-0 bg-teal-700 text-white`}
              >
                🔄 Hammasiga maqom berish ({pending.length})
              </button>
            )}
          </div>
          {pending.length === 0 && (
            <p className="mt-2 text-sm text-slate-400">
              {rows.length > 0 ? "Barcha vazifalarga maqom berilgan ✅" : "Vazifalar topilmadi."}
            </p>
          )}
          <div className="mt-2 space-y-2">
            {pending.map((r) => (
              <div key={r.workId} className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">
                      <span className="mr-1">🔴</span>
                      {r.dateText} — {r.lessonNo}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{r.description}</p>
                  </div>
                  <button
                    onClick={() => void markDone(r)}
                    disabled={busy || batch}
                    className={`${btn} shrink-0 bg-teal-700 text-white`}
                  >
                    ✅ Bajarildi
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ 🏫 Sinfim (ro'yxat)
type ClassInfoOut = {
  classId: string;
  className: string;
  students: { memberId: string; fullName: string }[];
  parents: { memberId: string; fullName: string }[];
  staff: { memberId: string; fullName: string }[];
};

export function SinfimPanel() {
  const [groups, setGroups] = useState<ClassInfoOut[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"students" | "parents" | "staff">("students");
  const [classIdx, setClassIdx] = useState(0);

  useEffect(() => {
    void (async () => {
      const r = await api<{ ok: boolean; error?: string; groups?: ClassInfoOut[] }>("/api/pwa/data/class");
      if (!r.ok) setError(r.error ?? "Yuklab bo'lmadi");
      else setGroups(r.groups ?? []);
    })();
  }, []);

  if (error) return <Err msg={error} />;
  if (groups === null) return <Loading />;
  if (groups.length === 0) return <div className={card}>Sinf topilmadi.</div>;

  const g = groups[Math.min(classIdx, groups.length - 1)]!;
  const list = g[tab];
  return (
    <div>
      {groups.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {groups.map((x, i) => (
            <button
              key={x.classId}
              onClick={() => setClassIdx(i)}
              className={`${chip} ${i === classIdx ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              🏫 {x.className}
            </button>
          ))}
        </div>
      )}
      <div className={`${card} mb-3`}>
        <div className="flex gap-2">
          {(
            [
              ["students", `🎒 O'quvchilar (${g.students.length})`],
              ["parents", `👪 Ota-onalar (${g.parents.length})`],
              ["staff", `🧑‍🏫 Xodimlar (${g.staff.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`${chip} ${tab === k ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          {list.length === 0 && <p className="text-sm text-slate-400">Ro'yxat bo'sh.</p>}
          {list.map((m, i) => (
            <div key={m.memberId || i} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">
                {m.fullName.slice(0, 1).toUpperCase()}
              </div>
              <p className="min-w-0 truncate text-sm text-slate-800">{m.fullName}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------ ✅ Darsni o'tildi qilish
type ConductLesson = {
  lessonId: string;
  workId: string;
  dateText: string;
  lessonNo: string;
  description: string;
  subject: string;
  className: string;
};

export function ConductPanel() {
  const [classes, setClasses] = useState<TeacherClass[] | null>(null);
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [lessons, setLessons] = useState<ConductLesson[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState(false);
  const [progress, setProgress] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  const load = useCallback(async (cid: string, subj: string) => {
    setError("");
    const qs = new URLSearchParams();
    if (cid) qs.set("classId", cid);
    if (subj) qs.set("subject", subj);
    if (cid && subj) setLoadingList(true);
    const r = await api<{
      ok: boolean;
      error?: string;
      classes: TeacherClass[];
      lessons: ConductLesson[];
      reason?: string;
    }>(`/api/pwa/data/conduct?${qs}`);
    setLoadingList(false);
    if (!r.ok) setError(r.error ?? "Yuklab bo'lmadi");
    else {
      setClasses(r.classes);
      setLessons(r.lessons ?? []);
    }
  }, []);

  useEffect(() => {
    void load("", "");
  }, [load]);

  const mark = async (l: ConductLesson) => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await api<Ok & { message?: string }>("/api/pwa/data/conduct", { lessonId: l.lessonId });
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Belgilab bo'lmadi");
    else {
      setNotice(`✅ ${l.dateText} — ${l.lessonNo} o'tildi deb belgilandi`);
      void load(classId, subject);
    }
  };

  // 🔄 Hammasini o'tildi deb belgilash — fon kechadi, foydalanuvchi faqat loading ko'radi
  const markAll = async () => {
    if (lessons.length === 0) return;
    setBatch(true);
    setError("");
    setNotice("");
    let done = 0;
    let fail = 0;
    for (let i = 0; i < lessons.length; i++) {
      setProgress(`Darslar o'tildi qilinmoqda… (${i + 1}/${lessons.length})`);
      const r = await api<Ok>("/api/pwa/data/conduct", { lessonId: lessons[i].lessonId });
      if (r.ok) done++;
      else fail++;
    }
    setBatch(false);
    setProgress("");
    setNotice(fail > 0 ? `⚠️ ${done} ta qilindi, ${fail} ta bajarilmadi` : `✅ Yakunlandi — ${done} ta dars o'tildi deb belgilandi`);
    void load(classId, subject);
  };

  if (error && classes === null) return <Err msg={error} />;
  if (classes === null) return <Loading />;

  const current = classes.find((c) => c.classId === classId);
  return (
    <div>
      {batch && <BatchOverlay label={progress || "Darslar o'tildi qilinmoqda…"} />}
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
                setLessons([]);
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
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-900">3️⃣ O'tilmagan darslar</p>
            {lessons.length > 1 && (
              <button
                onClick={() => void markAll()}
                disabled={busy || batch}
                className={`${btn} shrink-0 bg-teal-700 text-white`}
              >
                🔄 Hammasini o'tildi deb belgilash ({lessons.length})
              </button>
            )}
          </div>
          {loadingList && <Loading />}
          {!loadingList && lessons.length === 0 && (
            <p className="mt-2 text-sm text-slate-400">Barcha darslar o'tilgan ✅</p>
          )}
          <div className="mt-2 space-y-2">
            {!loadingList &&
              lessons.map((l) => (
                <div key={l.lessonId} className="rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">
                        <span className="mr-1">📅</span>
                        {l.dateText} — {l.lessonNo}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{l.description}</p>
                    </div>
                    <button
                      onClick={() => void mark(l)}
                      disabled={busy || batch}
                      className={`${btn} shrink-0 bg-teal-700 text-white`}
                    >
                      ✅ O'tildi
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- ⚙️ Sozlamalar
export function SettingsPanel({ profile, hasPasskey }: { profile: { name: string; role: string; login: string }; hasPasskey: boolean }) {
  const [children, setChildren] = useState<{ personId: string; fullName: string; groupName: string }[]>([]);

  useEffect(() => {
    if (profile.role !== "parent" && profile.role !== "student") return;
    void (async () => {
      const r = await api<{ ok: boolean; persons?: { personId: string; fullName: string; groupName: string }[] }>(
        "/api/pwa/data/grades",
      );
      if (r.ok && r.persons) setChildren(r.persons);
    })();
  }, [profile.role]);

  return (
    <div>
      <div className={`${card} mb-3`}>
        <p className="font-semibold text-slate-900">👤 Profil</p>
        <div className="mt-3 space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm">
          <p className="flex justify-between gap-4">
            <span className="text-slate-500">Ism</span>
            <span className="text-right font-medium text-slate-800">{profile.name}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-slate-500">Login</span>
            <span className="text-right font-medium text-slate-800">{profile.login}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-slate-500">Kirish</span>
            <span className="text-right font-medium text-slate-800">{hasPasskey ? "Face ID ✅" : "Login/parol"}</span>
          </p>
        </div>
      </div>

      {children.length > 0 && (
        <div className={`${card} mb-3`}>
          <p className="font-semibold text-slate-900">👶 Bolalar</p>
          <div className="mt-2 space-y-1.5">
            {children.map((c) => (
              <div key={c.personId} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm">
                <p className="text-slate-800">{c.fullName}</p>
                <p className="text-slate-500">🏫 {c.groupName}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`${card} mb-3`}>
        <p className="font-semibold text-slate-900">📱 Ilovani o'rnatish</p>
        <p className="mt-2 text-sm text-slate-600">
          Android uchun APK faylini yuklab oling yoki telefonga to'g'ridan-to'g'ri o'rnating.
        </p>
        <a
          href="https://github.com/zzv717/eMaktab/releases/latest/download/eMaktab.apk"
          className={`${btn} mt-3 block bg-teal-700 text-center text-white`}
        >
          📲 APK yuklab olish
        </a>
        <p className="mt-3 text-xs text-slate-400">
          iPhone: <b>Safari</b> → <b>Ulashish</b> → <b>Uy ekraniga qo'shish</b>
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- 📖 Yoriqnoma
export function GuidePanel() {
  return (
    <div className={card}>
      <p className="font-semibold text-slate-900">📖 Qo'llanma</p>
      <div className="mt-3 space-y-3 text-sm text-slate-700">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="font-semibold">📊 Baholar</p>
          <p className="mt-1 text-slate-600">Farzandlaringizning oxirgi 14 kunlik baholari — fanlar kesimida, o'rtacha bilan.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="font-semibold">📚 Dars jadvali</p>
          <p className="mt-1 text-slate-600">Haftalik jadval: darslar vaqti, fan, o'qituvchi, uy vazifasi va baholar.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="font-semibold">👁 Nazoratchi</p>
          <p className="mt-1 text-slate-600">
            Telegram bot orqali farzandingizni ulang — dars boshlanishi/tugashi, repetitor eslatmalari va AI testlar shu yerda ko'rinadi.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="font-semibold">📝 Testlar</p>
          <p className="mt-1 text-slate-600">
            Kitob yoki mavzu bo'yicha test yarating (kamida 10 savol). Savollar bolaga Telegramga, javoblar kitobi esa sizga yuboriladi.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="font-semibold">✅ Maqom (o'qituvchi)</p>
          <p className="mt-1 text-slate-600">Uy vazifasi bajarilganini belgilang — eMaktabga yoziladi.</p>
        </div>
        <p className="text-xs text-slate-400">
          Barcha ma'lumotlar haqiqiy eMaktab tizimidan olinadi. Yordam uchun: Telegram bot → 📖 Yoriqnoma.
        </p>
      </div>
    </div>
  );
}
