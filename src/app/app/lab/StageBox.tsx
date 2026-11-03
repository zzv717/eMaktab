// 🖥 Ish stoli konteyneri — to'liq ekran + "+" katalog (fanga qarab qidirib qo'shish)
"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface CatalogItem {
  id: string;
  icon: string;
  name: string;
  group: string;
  desc?: string;
}

export function StageBox({
  title,
  children,
  catalog,
  onAdd,
  toolbar,
}: {
  title: string;
  children: ReactNode;
  catalog: CatalogItem[];
  onAdd: (id: string) => void;
  toolbar?: ReactNode;
}) {
  const [fs, setFs] = useState(false);
  const [cat, setCat] = useState(false);
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? catalog.filter((c) => (c.name + " " + c.group + " " + (c.desc ?? "")).toLowerCase().includes(needle))
      : catalog;
    const map = new Map<string, CatalogItem[]>();
    for (const item of filtered) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return [...map.entries()];
  }, [catalog, q]);

  const header = (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{title}</p>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => setCat((c) => !c)}
          className="rounded-full bg-teal-700 px-3 py-1.5 text-sm font-bold text-white shadow-md active:scale-95"
          title="Ish stoliga narsa qo'shish"
        >
          ＋ Qo'shish
        </button>
        <button
          onClick={() => setFs((f) => !f)}
          className="rounded-full bg-slate-800 px-3 py-1.5 text-sm font-bold text-white shadow-md active:scale-95"
        >
          {fs ? "✕ Yopish" : "⤢ Kengaytirish"}
        </button>
      </div>
    </div>
  );

  const catalogSheet = cat && (
    <div className="absolute inset-0 z-[80] flex items-end" onClick={() => setCat(false)}>
      <div className="absolute inset-0 bg-slate-950/45" />
      <div
        className="relative max-h-[72%] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Qidirish (masalan: kislota, motor, piyoz…)"
            className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-teal-600"
          />
          <button onClick={() => setCat(false)} className="shrink-0 rounded-full bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-600">
            ✕
          </button>
        </div>
        {groups.length === 0 && <p className="mt-4 text-center text-sm text-slate-400">Hech narsa topilmadi.</p>}
        {groups.map(([group, items]) => (
          <div key={group} className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    onAdd(it.id);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm transition hover:border-teal-600 hover:bg-teal-50 active:scale-[0.97]"
                >
                  <span className="text-base">{it.icon}</span> <span className="font-medium text-slate-800">{it.name}</span>
                  {it.desc && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{it.desc}</p>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (fs) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 p-3">
        <div className="rounded-2xl bg-white/95 p-2.5">{header}</div>
        <div className="relative mt-2 min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col gap-2.5">{children}</div>
          {catalogSheet}
        </div>
        {toolbar && <div className="mt-2 rounded-2xl bg-white/95 p-2">{toolbar}</div>}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="rounded-3xl bg-white p-3 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
        {header}
        <div className="mt-2">{children}</div>
        {toolbar && <div className="mt-2">{toolbar}</div>}
      </div>
      {catalogSheet}
    </div>
  );
}

export const labBtn = "rounded-2xl px-3.5 py-2 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50";
export const labChip = "rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-[0.97]";
