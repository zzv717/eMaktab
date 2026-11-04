// 🧪🔬⚡ Laboratoriya va fanlar — 3D virtual laboratoriya (barcha rollar uchun)
"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// three.js faqat shu bo'lim ochilganda yuklanadi — qolgan ilova tez qoladi
const ChemLab = dynamic(() => import("./ChemLab"), { ssr: false });
const PhysLab = dynamic(() => import("./PhysLab"), { ssr: false });
const BioLab = dynamic(() => import("./BioLab"), { ssr: false });
const Experiments = dynamic(() => import("./Experiments"), { ssr: false });

type Tab = "chem" | "phys" | "bio";

export default function LabPanel() {
  const [tab, setTab] = useState<Tab>("chem");
  return (
    <div>
      <div className="mb-3 rounded-3xl bg-gradient-to-r from-teal-700 to-emerald-700 p-4 text-white shadow-[0_12px_36px_rgba(15,23,42,0.15)]">
        <p className="text-lg font-bold">🧪 Laboratoriya va fanlar</p>
        <p className="mt-1 text-sm text-teal-50">
          Haqiqiy reaksiyalar, elektr zanjirlari va 3D hujayra — tajriba qiling, natija real vaqtda hisoblanadi!
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["chem", "🧪 Kimyo"],
            ["phys", "⚡ Fizika"],
            ["bio", "🔬 Biologiya"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              t === tab ? "bg-teal-700 text-white shadow-md" : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto">
          <Experiments onOpen={(t) => setTab(t)} />
        </span>
      </div>

      {tab === "chem" && <ChemLab />}
      {tab === "phys" && <PhysLab />}
      {tab === "bio" && <BioLab />}

      <p className="mt-2 px-1 text-center text-xs text-slate-400">
        Barcha tajribalar real fizika, kimyo va biologiya qonunlari asosida hisoblanadi. 🎓
      </p>
    </div>
  );
}
