// 🧪 3D Kimyo laboratoriyasi — haqiqiy reaksiyalar (rang, cho'kma, gaz, harorat)
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { REAGENTS, REAGENT_MAP, simulate, type VesselContent } from "./engine";
import { attachFrameHooks, benchTop, createScene, glassMaterial, liquidMaterial, type SceneHandle } from "./three-utils";

type Vessel = "probirka" | "kolba" | "stakan";

const VESSEL_LABEL: Record<Vessel, string> = {
  probirka: "🧪 Probirka",
  kolba: "⚗️ Kolba",
  stakan: "🥤 Stakan (ximik)",
};

export default function ChemLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const liqRef = useRef<{ mesh: THREE.Mesh; maxH: number } | null>(null);
  const bubbleRef = useRef<THREE.Mesh[]>([]);
  const precipRef = useRef<THREE.Group | null>(null);
  const mercuryRef = useRef<THREE.Mesh | null>(null);
  const steamRef = useRef<THREE.Group | null>(null);
  const vesselRef = useRef<Vessel>("stakan");
  const rebuildRef = useRef<(() => void) | null>(null);

  const [vessel, setVessel] = useState<Vessel>("stakan");
  const [contents, setContents] = useState<VesselContent[]>([]);
  const [pouring, setPouring] = useState(false);
  const [selected, setSelected] = useState<string>("hcl");

  const result = simulate(contents);
  const resultRef = useRef(result);
  resultRef.current = result;

  // --- 3D sahna
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 8 });
    handleRef.current = handle;
    handle.scene.add(benchTop());

    const rebuild = () => {
      // eski idishni o'chirish
      const old = handle.scene.getObjectByName("vessel");
      if (old) handle.scene.remove(old);
      bubbleRef.current = [];
      precipRef.current = null;

      const group = new THREE.Group();
      group.name = "vessel";
      const glass = glassMaterial();
      const v = vesselRef.current;
      if (v === "probirka") {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 40, 1, true), glass);
        tube.position.y = 1.75;
        const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass);
        bottom.position.y = 0.12;
        group.add(tube, bottom);
      } else if (v === "kolba") {
        const points: THREE.Vector2[] = [];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          const y = t * 3.4;
          const r = t < 0.55 ? 0.35 + 1.35 * Math.sin((t / 0.55) * Math.PI) * 0.92 : 0.38;
          points.push(new THREE.Vector2(Math.max(0.32, r), y));
        }
        const flask = new THREE.Mesh(new THREE.LatheGeometry(points, 40), glass);
        group.add(flask);
      } else {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.2, 2.3, 40, 1, true), glass);
        cup.position.y = 1.25;
        const bottom = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 40), glass);
        bottom.position.y = 0.12;
        group.add(cup, bottom);
      }

      // suyuqlik
      const maxR = v === "probirka" ? 0.5 : v === "kolba" ? 1.15 : 1.22;
      const maxH = v === "probirka" ? 3.1 : v === "kolba" ? 3.0 : 2.1;
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(maxR * 0.97, maxR * 0.97, maxH, 36), liquidMaterial("#e9f5ff"));
      liq.position.y = 0.15 + maxH / 2;
      liq.visible = false;
      group.add(liq);
      liqRef.current = { mesh: liq, maxH };

      // cho'kma guruhi
      const precip = new THREE.Group();
      precip.visible = false;
      group.add(precip);
      precipRef.current = precip;

      // pufakchalar
      for (let i = 0; i < 14; i++) {
        const b = new THREE.Mesh(
          new THREE.SphereGeometry(0.06 + Math.random() * 0.07, 10, 8),
          new THREE.MeshStandardMaterial({ color: "#eaf6ff", transparent: true, opacity: 0.75, roughness: 0.1 }),
        );
        b.visible = false;
        group.add(b);
        bubbleRef.current.push(b);
      }

      handle.scene.add(group);
    };
    rebuild();
    rebuildRef.current = rebuild;

    // termometr
    const thermo = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 18), glassMaterial("#ffffff", 0.4));
    shell.position.y = 1.35;
    const bulbM = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), new THREE.MeshStandardMaterial({ color: "#d33a2c", roughness: 0.35 }));
    bulbM.position.y = 0.18;
    const mercury = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 12), new THREE.MeshStandardMaterial({ color: "#e33b2e", emissive: "#a11", emissiveIntensity: 0.35 }));
    mercury.position.y = 0.75;
    thermo.add(shell, bulbM, mercury);
    thermo.position.set(3.1, 0.05, 0.3);
    handle.scene.add(thermo);
    mercuryRef.current = mercury;

    // bug' guruhi (issiqda)
    const steam = new THREE.Group();
    steam.visible = false;
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.16 + Math.random() * 0.12, 10, 8),
        new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.28, roughness: 1 }),
      );
      s.position.set((Math.random() - 0.5) * 1.2, 2.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
      steam.add(s);
    }
    handle.scene.add(steam);
    steamRef.current = steam;

    const stop = attachFrameHooks(handle, [
      (t) => {
        // suyuqlik sathi silliq o'zgaradi
        const liq = liqRef.current;
        if (liq) {
          const total = resultRef.current.umumiyMl;
          const target = total === 0 ? 0 : Math.min(1, total / 120);
          const cur = liq.mesh.scale.y;
          const next = cur + (target - cur) * 0.12;
          liq.mesh.scale.y = Math.max(0.001, next);
          liq.mesh.visible = next > 0.01;
          liq.mesh.position.y = 0.15 + liq.maxH * next * 0.5;
          (liq.mesh.material as THREE.MeshStandardMaterial).color.set(resultRef.current.color);
          (liq.mesh.material as THREE.MeshStandardMaterial).emissive.set(resultRef.current.color);
        }
        // pufakchalar (gaz)
        const hasGas = Boolean(resultRef.current.gas);
        bubbleRef.current.forEach((b, i) => {
          b.visible = hasGas;
          if (!hasGas) return;
          const speed = 0.9 + (i % 5) * 0.22;
          const y = ((t * speed + i * 0.37) % 2.4) + 0.35;
          b.position.set(Math.sin(i * 2.1 + t) * 0.42, y, Math.cos(i * 1.7 + t) * 0.42);
        });
        // cho'kma
        const precip = precipRef.current;
        if (precip) {
          const p = resultRef.current.precipitate;
          precip.visible = Boolean(p);
          if (p && precip.children.length === 0) {
            for (let i = 0; i < 26; i++) {
              const g = new THREE.Mesh(
                new THREE.SphereGeometry(0.055 + Math.random() * 0.075, 8, 6),
                new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85 }),
              );
              const ang = Math.random() * Math.PI * 2;
              const rad = Math.random() * (vesselRef.current === "probirka" ? 0.32 : 0.85);
              g.position.set(Math.cos(ang) * rad, 0.22 + Math.random() * 0.16, Math.sin(ang) * rad);
              precip.add(g);
            }
          } else if (p && precip.children.length > 0) {
            precip.children.forEach((c) => ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(p.color));
          }
        }
        // termometr + bug'
        const temp = resultRef.current.temperature;
        if (mercuryRef.current) {
          const level = Math.max(0.06, Math.min(1, (temp - 5) / 95));
          mercuryRef.current.scale.y = level * 2.1;
          mercuryRef.current.position.y = 0.42 + (level * 2.1) / 2;
        }
        if (steamRef.current) steamRef.current.visible = temp > 38;
        if (steamRef.current?.visible) {
          steamRef.current.children.forEach((s, i) => {
            s.position.y = 2.4 + ((t * 0.4 + i * 0.5) % 1.8);
            ((s as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity =
              0.32 * (1 - ((t * 0.4 + i * 0.5) % 1.8) / 1.8);
          });
        }
      },
    ]);

    return () => {
      stop();
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  // idish o'zgarsa — 3D idishni qayta quramiz
  useEffect(() => {
    vesselRef.current = vessel;
    rebuildRef.current?.();
  }, [vessel]);

  const pour = (reagentId: string) => {
    if (pouring) return;
    setPouring(true);
    window.setTimeout(() => {
      setContents((c) => [...c, { reagentId, ml: 20 }]);
      setPouring(false);
    }, 420);
  };

  return (
    <div>
      {/* Idish tanlash */}
      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">1️⃣ Idishni tanlang</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(VESSEL_LABEL) as Vessel[]).map((v) => (
            <button
              key={v}
              onClick={() => {
                setVessel(v);
                setContents([]);
              }}
              className={`${chip} ${v === vessel ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {VESSEL_LABEL[v]}
            </button>
          ))}
          <button onClick={() => setContents([])} className={`${chip} bg-rose-50 text-rose-600`}>
            🧹 Tozalash
          </button>
        </div>
      </div>

      {/* 3D sahna */}
      <div className={`${card} mb-3 p-2`}>
        <canvas ref={canvasRef} className="h-[300px] w-full rounded-2xl" />
        <p className="px-2 pb-1 pt-1.5 text-center text-xs text-slate-400">
          🖐 Surib aylantiring · ikki barmoq bilan yaqinlashtiring
          {pouring && <span className="ml-2 font-semibold text-teal-600">⏳ Quyilmoqda…</span>}
        </p>
      </div>

      {/* Reaktivlar javoni */}
      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">2️⃣ Reaktivni tanlang va qo'shing</p>
        <div className="mt-2 grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto">
          {REAGENTS.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={`rounded-xl border px-2.5 py-2 text-left text-xs transition ${
                selected === r.id ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <span className="font-semibold">{r.formula}</span>
              <span className="ml-1 text-slate-400">{r.name.split(" ").slice(0, 2).join(" ")}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => pour(selected)} disabled={pouring} className={`${btn} flex-1 bg-teal-700 text-white`}>
            ⬇️ Qo'shish (20 ml)
          </button>
        </div>
        {selected && <p className="mt-2 text-xs text-slate-500">💡 {REAGENT_MAP[selected]?.info}</p>}
      </div>

      {/* Natija */}
      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">3️⃣ Reaksiya natijasi (real vaqt)</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-400">pH</p>
            <p className="text-lg font-bold text-slate-800">{result.ph === null ? "—" : result.ph.toFixed(1)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-400">Harorat</p>
            <p className="text-lg font-bold text-slate-800">{result.temperature}°C</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-400">Hajm</p>
            <p className="text-lg font-bold text-slate-800">{result.umumiyMl} ml</p>
          </div>
        </div>
        <div className="mt-2 space-y-1.5 text-xs">
          {result.gas && (
            <p className="rounded-xl bg-sky-50 px-3 py-2 font-medium text-sky-700">🫧 Gaz ajralmoqda: {result.gas.name}</p>
          )}
          {result.precipitate && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 font-medium text-amber-700">🧱 Cho'kma: {result.precipitate.name}</p>
          )}
          {result.hodisalar.length === 0 && result.umumiyMl > 0 && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-slate-500">Reaksiya kuzatilmadi — boshqa reaktiv qo'shib ko'ring.</p>
          )}
          {result.hodisalar.slice(-6).map((h, i) => (
            <p
              key={i}
              className={`rounded-xl px-3 py-2 ${
                h.kind === "gas" ? "bg-sky-50 text-sky-700" : h.kind === "precipitate" ? "bg-amber-50 text-amber-700" : h.kind === "color" ? "bg-fuchsia-50 text-fuchsia-700" : h.kind === "heat" ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600"
              }`}
            >
              {h.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

const card = "rounded-3xl bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]";
const chip = "rounded-full px-3 py-1.5 text-sm font-medium transition";
const btn = "rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50";
