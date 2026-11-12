// 📋 Tajribalar kutubxonasi — ro'yxat + bosqichma-bosqich kartochka (o'zbekcha)
"use client";

import { useEffect, useState } from "react";
import { DIFFICULTY_COLOR, EXPERIMENTS, loadProgress, saveProgress, type Experiment } from "./experiments";

export default function Experiments({ onOpen }: { onOpen: (tab: "chem" | "phys" | "bio") => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Experiment | null>(null);
  const [subject, setSubject] = useState<"Hammasi" | "Kimyo" | "Fizika" | "Biologiya">("Hammasi");
  const [progress, setProgress] = useState<Record<string, boolean>>({});

  // taraqqiyotni yuklash (faqat brauzer xotirasida — bazaga tegmaydi!)
  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const done = Object.values(progress).filter(Boolean).length;
  const toggleDone = (id: string) => {
    const next = { ...progress, [id]: !progress[id] };
    saveProgress(next);
    setProgress(next);
  };

  const list = EXPERIMENTS.filter((e) => subject === "Hammasi" || e.subject === subject);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-violet-600 px-3.5 py-2 text-sm font-bold text-white shadow-md active:scale-95"
      >
        📋 Tajribalar
      </button>
      {open && (
        <div className="fixed inset-0 z-[92] flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-950/55" />
          <div
            className="relative max-h-[88%] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {!sel ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-bold text-slate-900">📋 Tajribalar kutubxonasi</p>
                    <p className="text-xs text-slate-500">Har biri: maqsad → qadamlar → kutilgan natija → ilmiy tushuntirish</p>
                  </div>
                  <button onClick={() => setOpen(false)} className="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700 active:scale-95">
                    ✕
                  </button>
                </div>
                <div className="mt-2.5 rounded-2xl bg-violet-50 p-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-violet-800">
                    <span>📊 Sizning taraqqiyotingiz</span>
                    <span>
                      {done} / {EXPERIMENTS.length} bajarildi
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-violet-100">
                    <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${(done / EXPERIMENTS.length) * 100}%` }} />
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(["Hammasi", "Kimyo", "Fizika", "Biologiya"] as const).map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setSubject(sub)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${subject === sub ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
                <div className="mt-2.5 space-y-2">
                  {list.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setSel(ex)}
                      className="block w-full rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">
                          {progress[ex.id] ? "✅ " : ""}
                          {ex.title}
                        </p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${DIFFICULTY_COLOR[ex.difficulty]}`}>{ex.difficulty}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {ex.subject} · {ex.objective}
                      </p>
                    </button>
                  ))}
                  {list.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Bu fanda hozircha tajriba yo'q</p>}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold text-slate-900">{sel.title}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{sel.subject}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${DIFFICULTY_COLOR[sel.difficulty]}`}>{sel.difficulty}</span>
                    </div>
                  </div>
                  <button onClick={() => setSel(null)} className="shrink-0 rounded-full bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700 active:scale-95">
                    ✕
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <Info title="🎯 Maqsad" text={sel.objective} />
                  <Info title="🔧 Jihozlar" text={sel.equipment.join(" · ")} />
                  <Info title="⚠️ Xavfsizlik" text={sel.safety} tone="amber" />
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">📋 Bosqichlar</p>
                    <ol className="mt-1.5 space-y-1">
                      {sel.steps.map((st, i) => (
                        <li key={i} className="text-[12.5px] leading-relaxed text-slate-700">
                          {st}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <Info title="👀 Kutilgan natija" text={sel.expected} tone="sky" />
                  <Info title="🔬 Ilmiy tushuntirish" text={sel.explanation} tone="emerald" />
                  {sel.formula && (
                    <div className="rounded-2xl bg-slate-900 p-3 text-center">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Formula</p>
                      <p className="mt-1 font-mono text-lg font-bold text-teal-300">{sel.formula}</p>
                    </div>
                  )}
                  {sel.questions?.length > 0 && (
                    <div className="rounded-2xl bg-violet-50 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-violet-500">❓ Nazorat savollari</p>
                      <ol className="mt-1.5 space-y-1">
                        {sel.questions.map((q, i) => (
                          <li key={i} className="text-[12.5px] leading-relaxed text-violet-900">
                            {i + 1}. {q}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => toggleDone(sel.id)}
                  className={`mt-3 w-full rounded-2xl py-2.5 text-sm font-bold active:scale-[0.98] ${progress[sel.id] ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`}
                >
                  {progress[sel.id] ? "✅ Bajarildi (bosib bekor qiling)" : "✅ Tajribani bajardim"}
                </button>

                <button
                  onClick={() => {
                    onOpen(sel.openIn);
                    setOpen(false);
                    setSel(null);
                  }}
                  className="mt-3 w-full rounded-2xl bg-teal-700 py-2.5 text-sm font-bold text-white active:scale-[0.98]"
                >
                  🔬 Laboratoriyada ochish
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Info({ title, text, tone }: { title: string; text: string; tone?: "amber" | "sky" | "emerald" }) {
  const bg = tone === "amber" ? "bg-amber-50" : tone === "sky" ? "bg-sky-50" : tone === "emerald" ? "bg-emerald-50" : "bg-slate-50";
  return (
    <div className={`rounded-2xl ${bg} p-3`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-700">{text}</p>
    </div>
  );
}
