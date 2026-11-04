// 🖥 Ish stoli konteyneri — to'liq ekran + "+" katalog + joystik kamera + tanlash/siljitish
"use client";

import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { orbitBy, translateBy, type SceneHandle } from "./three-utils";
import { GuideButton, type GuideData } from "./Guides";

export interface CatalogItem {
  id: string;
  icon: string;
  name: string;
  group: string;
  desc?: string;
}

export interface PickInfo {
  icon: string;
  label: string;
  desc?: string;
}

export function StageBox({
  title,
  children,
  catalog,
  onAdd,
  toolbar,
  guide,
}: {
  title: string;
  children: ReactNode;
  catalog: CatalogItem[];
  onAdd: (id: string) => void;
  toolbar?: ReactNode;
  /** 📖 bu fan uchun ALOHIDA ishlatish yoriqnomasi (real hayot bog'lanishlari bilan) */
  guide?: GuideData;
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
        {guide && <GuideButton guide={guide} />}
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
    <div className="fixed inset-0 z-[90] flex items-end" onClick={() => setCat(false)}>
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
        <div className="grid gap-x-5 sm:grid-cols-2">
        {groups.map(([group, items]) => (
          <div key={group} className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    onAdd(it.id);
                    // loyiha bosilsa — katalog yopiladi, keyin bosqichma-bosqich ko'rsatiladi
                    if (it.id.startsWith("p:")) setCat(false);
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
    </div>
  );

  // MUHIM: bir xil JSX daraxti — kengaytirishda sahna qayta yaratilmaydi (3D saqlanadi)
  return (
    <>
      <div
        className={
          fs
            ? "fixed inset-0 z-[70] flex flex-col bg-slate-950/95 p-2.5"
            : "relative rounded-3xl bg-white p-3 shadow-[0_12px_36px_rgba(15,23,42,0.08)]"
        }
      >
        {header}
        <div className={fs ? "lab-fullscreen mt-2 min-h-0 flex-1 overflow-y-auto" : "mt-2"}>{children}</div>
        {toolbar && <div className="mt-2">{toolbar}</div>}
      </div>
      {catalogSheet}
    </>
  );
}

/** Tanlangan obyekt kartochkasi — nomi + '🔀 Siljitish' tugmasi. */
export function PickCard({
  info,
  moving,
  onMove,
  onClose,
  extra,
}: {
  info: PickInfo | null;
  moving: boolean;
  onMove: () => void;
  onClose: () => void;
  extra?: ReactNode;
}) {
  if (!info) return null;
  return (
    <div className="absolute bottom-2 left-2 right-2 z-20 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-xl">
      <span className="text-xl">{info.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{info.label}</p>
        {info.desc && <p className="truncate text-[11px] text-slate-500">{info.desc}</p>}
      </div>
      {extra}
      <button
        onClick={onMove}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold active:scale-95 ${moving ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700"}`}
      >
        {moving ? "🖐 Siljitilmoqda…" : "🔀 Siljitish"}
      </button>
      <button onClick={onClose} className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500">
        ✕
      </button>
    </div>
  );
}

/** 🎮 Joystik — kamerani atrofni aylantirib ko'rish uchun. */
export function CameraPad({ handleRef }: { handleRef: RefObject<SceneHandle | null> }) {
  // ▲▼ — y o'qini ko'tarish/pasaytirish; ◀▶ — chap/o'ng ko'chish; ➕➖ — yaqin/uzoq
  const mv = (dx: number, dy: number, dz: number) => () => translateBy(handleRef.current, dx, dy, dz);
  const reset = () => orbitBy(handleRef.current, { reset: true });
  const b = "h-9 w-9 rounded-full bg-slate-800/85 text-sm font-bold text-white active:scale-90 disabled:opacity-40";
  return (
    <div className="pointer-events-auto absolute bottom-2 right-2 z-10 flex items-end gap-2">
      <div className="grid grid-cols-3 gap-1">
        <span />
        <button className={b} onClick={mv(0, 0.75, 0)} title="Y o'qini tepaga">▲</button>
        <span />
        <button className={b} onClick={mv(-0.85, 0, 0)} title="Chapga">◀</button>
        <button className={b} onClick={reset} title="Boshlang'ich holat">⌂</button>
        <button className={b} onClick={mv(0.85, 0, 0)} title="O'ngga">▶</button>
        <span />
        <button className={b} onClick={mv(0, -0.75, 0)} title="Y o'qini pastga">▼</button>
        <span />
      </div>
      <div className="flex flex-col gap-1">
        <button className={b} onClick={mv(0, 0, 1.15)} title="Yaqinlashish">➕</button>
        <button className={b} onClick={mv(0, 0, -1.15)} title="Uzoqlashish">➖</button>
      </div>
    </div>
  );
}

export const labBtn = "rounded-2xl px-3.5 py-2 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50";
export const labChip = "rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-[0.97]";
