// ⚡ 3D Fizika laboratoriyasi — elektr zanjiri (MNA), prujina (Hooke), optika (linza)
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { applyWires, lensPhysics, solveCircuit, springPhysics, type CircuitComp } from "./engine";
import { attachFrameHooks, benchTop, createScene, type SceneHandle } from "./three-utils";

type Mode = "circuit" | "spring" | "optics";

export default function PhysLab() {
  const [mode, setMode] = useState<Mode>("circuit");
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["circuit", "🔌 Elektr zanjiri"],
            ["spring", "🌀 Prujina (Hooke)"],
            ["optics", "🔦 Optika (linza)"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${m === mode ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "circuit" && <CircuitLab />}
      {mode === "spring" && <SpringLab />}
      {mode === "optics" && <OpticsLab />}
    </div>
  );
}

const card = "rounded-3xl bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]";
const btn = "rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50";
const chip = "rounded-full px-3 py-1.5 text-sm font-medium transition";

// ============================== 🔌 ELEKTR ZANJIRI ==============================

type AddType = CircuitComp["type"];
const ADD_LABEL: Record<AddType, string> = {
  battery: "🔋 Batareya",
  bulb: "💡 Lampochka",
  resistor: "🎚 Rezistor",
  switch: "🔛 Kalit",
  ammeter: "📏 Ampermetr",
};

interface Wire {
  id: string;
  fromComp: string;
  fromTerm: "a" | "b";
  toComp: string;
  toTerm: "a" | "b";
}

function CircuitLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const compGroupRef = useRef<THREE.Group | null>(null);
  const wireGroupRef = useRef<THREE.Group | null>(null);

  const [comps, setComps] = useState<CircuitComp[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [selTerm, setSelTerm] = useState<{ comp: string; term: "a" | "b" } | null>(null);
  const [selComp, setSelComp] = useState<string | null>(null);

  // hisob — simlar tugunlarni birlashtiradi, so'ng Kirchgof bo'yicha yechildi
  const solved = solveCircuit(applyWires(comps, wires));
  const solvedRef = useRef(solved);
  solvedRef.current = solved;

  const compRef = useRef(comps);
  compRef.current = comps;
  const wireRef = useRef(wires);
  wireRef.current = wires;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 11 });
    handleRef.current = handle;
    handle.scene.add(benchTop(16, 10));
    const compGroup = new THREE.Group();
    const wireGroup = new THREE.Group();
    handle.scene.add(compGroup, wireGroup);
    compGroupRef.current = compGroup;
    wireGroupRef.current = wireGroup;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, handle.camera);
      const hits = raycaster.intersectObjects(compGroup.children, true);
      if (hits.length === 0) return;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && obj.userData?.kind !== "terminal" && obj.userData?.kind !== "comp") obj = obj.parent;
      if (!obj) return;
      if (obj.userData?.kind === "terminal") {
        let grp: THREE.Object3D | null = obj.parent;
        while (grp && grp.userData?.kind !== "comp") grp = grp.parent;
        const compId = grp?.userData?.id as string;
        const term = obj.userData.term as "a" | "b";
        if (!compId) return;
        setSelTerm((prev) => {
          if (!prev) return { comp: compId, term };
          if (prev.comp === compId && prev.term === term) return null;
          setWires((ws) =>
            ws.some(
              (w) =>
                (w.fromComp === prev.comp && w.fromTerm === prev.term && w.toComp === compId && w.toTerm === term) ||
                (w.toComp === prev.comp && w.toTerm === prev.term && w.fromComp === compId && w.fromTerm === term),
            )
              ? ws
              : [...ws, { id: `w${Date.now()}`, fromComp: prev.comp, fromTerm: prev.term, toComp: compId, toTerm: term }],
          );
          return null;
        });
      } else if (obj.userData?.kind === "comp") {
        const id = obj.userData.id as string;
        setSelComp(id);
        setComps((cs) => cs.map((c) => (c.id === id && c.type === "switch" ? { ...c, closed: !c.closed } : c)));
      }
    };
    canvas.addEventListener("click", onClick);

    const stop = attachFrameHooks(handle, [
      () => {
        // komponentlar
        const g = compGroupRef.current;
        if (!g) return;
        const list = compRef.current;
        // keraksizlarni o'chirish
        for (let i = g.children.length - 1; i >= 0; i--) {
          const child = g.children[i];
          if (!list.some((c) => c.id === child.userData?.id)) {
            child.traverse((o) => {
              const m = o as THREE.Mesh;
              if (m.geometry) m.geometry.dispose();
            });
            g.remove(child);
          }
        }
        list.forEach((c, i) => {
          let node = g.children.find((ch) => ch.userData?.id === c.id) as THREE.Group | undefined;
          if (!node) {
            node = buildCompMesh(c.type);
            node.userData = { kind: "comp", id: c.id };
            g.add(node);
          }
          node.position.set(-6 + (i % 6) * 2.4, 0.2, i >= 6 ? -2.6 : 1.4);
          node.rotation.y = 0;
          // yorug'lik (lampochka)
          const glow = node.getObjectByName("glow") as THREE.Mesh | undefined;
          if (glow) {
            const b = solvedRef.current.brightness[c.id] ?? 0;
            (glow.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + b * 2.4;
            (glow.material as THREE.MeshStandardMaterial).color.set(b > 0.05 ? "#ffd76a" : "#9aa4b2");
          }
          const lever = node.getObjectByName("lever") as THREE.Mesh | undefined;
          if (lever) lever.rotation.z = c.closed ? -0.6 : 0.5;
        });
        // simlar
        const wg = wireGroupRef.current;
        if (!wg) return;
        while (wg.children.length) {
          const ch = wg.children[0] as THREE.Mesh;
          (ch.geometry as THREE.BufferGeometry).dispose();
          wg.remove(ch);
        }
        for (const w of wireRef.current) {
          const ga = g.children.find((ch) => ch.userData?.id === w.fromComp) as THREE.Group | undefined;
          const gb = g.children.find((ch) => ch.userData?.id === w.toComp) as THREE.Group | undefined;
          if (!ga || !gb) continue;
          const pa = terminalPos(ga, w.fromTerm);
          const pb = terminalPos(gb, w.toTerm);
          const mid = pa.clone().add(pb).multiplyScalar(0.5);
          mid.y += 0.55;
          const curve = new THREE.CatmullRomCurve3([pa, mid, pb]);
          const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 18, 0.055, 8, false),
            new THREE.MeshStandardMaterial({ color: "#2f3b4a", roughness: 0.5, metalness: 0.35 }),
          );
          wg.add(tube);
        }
      },
    ]);

    return () => {
      stop();
      canvas.removeEventListener("click", onClick);
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  const addComp = (type: AddType) => {
    setComps((cs) => {
      const id = `${type}${Date.now()}`;
      const value = type === "battery" ? 9 : type === "resistor" ? 10 : type === "bulb" ? 6 : 0;
      return [...cs, { id, type, a: cs.length * 2 + 1, b: cs.length * 2 + 2, value, closed: type === "switch" ? true : undefined }];
    });
  };

  const selected = comps.find((c) => c.id === selComp);

  return (
    <div>
      <div className={`${card} mb-3 p-2`}>
        <canvas ref={canvasRef} className="h-[280px] w-full rounded-2xl" />
        <p className="px-2 pb-1 pt-1.5 text-center text-xs text-slate-400">
          🟢 Terminalni bosing → ikkinchi terminalga ulang (sim tortiladi) · qurilmaga bosib kalitni oching/yoping
        </p>
      </div>

      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Qurilmalar</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(ADD_LABEL) as AddType[]).map((t) => (
            <button key={t} onClick={() => addComp(t)} className={`${chip} bg-slate-100 text-slate-700`}>
              + {ADD_LABEL[t]}
            </button>
          ))}
          <button
            onClick={() => {
              setComps([]);
              setWires([]);
              setSelComp(null);
              setSelTerm(null);
            }}
            className={`${chip} bg-rose-50 text-rose-600`}
          >
            🧹 Hammasini o'chirish
          </button>
          {wires.length > 0 && (
            <button onClick={() => setWires((ws) => ws.slice(0, -1))} className={`${chip} bg-amber-50 text-amber-700`}>
              ↩️ Oxirgi simni o'chirish
            </button>
          )}
        </div>

        {selected && (selected.type === "battery" || selected.type === "resistor" || selected.type === "bulb") && (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">{ADD_LABEL[selected.type]}</p>
            <input
              type="range"
              min={selected.type === "battery" ? 1.5 : 1}
              max={selected.type === "battery" ? 24 : 60}
              step={0.5}
              value={selected.value}
              onChange={(e) =>
                setComps((cs) => cs.map((c) => (c.id === selected.id ? { ...c, value: Number(e.target.value) } : c)))
              }
              className="mt-2 w-full accent-teal-700"
            />
            <p className="mt-1 text-xs text-slate-500">
              {selected.type === "battery" ? `Kuchlanish: ${selected.value} V` : selected.type === "resistor" ? `Qarshilik: ${selected.value} Om` : `Nominal kuchlanish: ${selected.value} V`}
            </p>
          </div>
        )}
      </div>

      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hisob natijasi (Kirchgof qonuni)</p>
        {!solved.ok ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">{solved.error ?? "Zanjir to'liq emas."}</p>
        ) : (
          <div className="mt-2 space-y-1.5 text-sm">
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
              ✅ Zanjir hisoblandi — umumiy tok: <b>{(solved.totalCurrent * 1000).toFixed(1)} mA</b>
            </p>
            {comps
              .filter((c) => c.type === "bulb")
              .map((c) => (
                <p key={c.id} className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">
                  💡 Lampochka: yorug'lik <b>{Math.round((solved.brightness[c.id] ?? 0) * 100)}%</b> · tok{" "}
                  <b>{((solved.currents[c.id] ?? 0) * 1000).toFixed(1)} mA</b>
                </p>
              ))}
            {comps
              .filter((c) => c.type === "ammeter")
              .map((c) => (
                <p key={c.id} className="rounded-xl bg-sky-50 px-3 py-2 text-sky-700">
                  📏 Ampermetr o'qishi: <b>{((solved.currents[c.id] ?? 0) * 1000).toFixed(2)} mA</b>
                </p>
              ))}
            <p className="text-xs text-slate-400">Batareya ichki qarshiligi 0.4 Om hisobga olingan. Fizika: U = I·R (Om qonuni).</p>
          </div>
        )}
      </div>
    </div>
  );
}

function terminalPos(group: THREE.Group, term: "a" | "b"): THREE.Vector3 {
  const t = group.getObjectByName(`term-${term}`);
  const v = new THREE.Vector3();
  if (t) t.getWorldPosition(v);
  else v.copy(group.position);
  return v;
}

function buildCompMesh(type: AddType): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.55, 0.9),
    new THREE.MeshStandardMaterial({ color: type === "battery" ? "#3a7d44" : type === "bulb" ? "#5b6b7d" : "#7a6551", roughness: 0.55 }),
  );
  body.position.y = 0.32;
  body.castShadow = true;
  g.add(body);
  if (type === "battery") {
    const plus = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 12), new THREE.MeshStandardMaterial({ color: "#c0392b" }));
    plus.position.set(0.45, 0.72, 0);
    const minus = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), new THREE.MeshStandardMaterial({ color: "#2c3e50" }));
    minus.position.set(-0.45, 0.66, 0);
    g.add(plus, minus);
  } else if (type === "bulb") {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.35, 16), new THREE.MeshStandardMaterial({ color: "#8d99ae", metalness: 0.5, roughness: 0.4 }));
    stand.position.y = 0.78;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.52, 22, 16), new THREE.MeshStandardMaterial({ color: "#9aa4b2", emissive: "#ffb84d", emissiveIntensity: 0.15, roughness: 0.25 }));
    glow.position.y = 1.35;
    glow.name = "glow";
    g.add(stand, glow);
  } else if (type === "resistor") {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 18), new THREE.MeshStandardMaterial({ color: "#d9c7a3", roughness: 0.6 }));
    cyl.rotation.z = Math.PI / 2;
    cyl.position.y = 0.75;
    g.add(cyl);
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.1, 18), new THREE.MeshStandardMaterial({ color: ["#b02a2a", "#222", "#c9a227"][i] }));
      band.rotation.z = Math.PI / 2;
      band.position.set(-0.28 + i * 0.28, 0.75, 0);
      g.add(band);
    }
  } else if (type === "switch") {
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), new THREE.MeshStandardMaterial({ color: "#e07b39", roughness: 0.5 }));
    lever.position.set(0, 0.95, 0);
    lever.name = "lever";
    lever.geometry.translate(0, 0.31, 0);
    g.add(lever);
  } else if (type === "ammeter") {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24), new THREE.MeshStandardMaterial({ color: "#f4f1de", roughness: 0.4 }));
    face.rotation.x = Math.PI / 2;
    face.position.set(0, 1.05, 0.28);
    g.add(face);
  }
  for (const term of ["a", "b"] as const) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: term === "a" ? "#2e8b57" : "#8b2e2e", emissive: term === "a" ? "#1d5c38" : "#5c1d1d", emissiveIntensity: 0.25 }));
    t.position.set(term === "a" ? -0.85 : 0.85, 0.55, 0);
    t.name = `term-${term}`;
    t.userData = { kind: "terminal", term };
    g.add(t);
  }
  return g;
}

// ============================== 🌀 PRUJINA (HOOKE) ==============================

function SpringLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mass, setMass] = useState(1);
  const [k, setK] = useState(20);
  const phys = springPhysics(mass, k);
  const physRef = useRef(phys);
  physRef.current = phys;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 8.5 });
    handle.scene.add(benchTop(12, 8));
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.4, 0.35), new THREE.MeshStandardMaterial({ color: "#64748b", metalness: 0.55, roughness: 0.35 }));
    stand.position.set(-2.4, 2.2, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.28, 0.28), stand.material);
    arm.position.set(-1.25, 4.3, 0);
    handle.scene.add(stand, arm);

    const springMat = new THREE.MeshStandardMaterial({ color: "#8b98a8", metalness: 0.7, roughness: 0.3 });
    const weight = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.9, 1.15), new THREE.MeshStandardMaterial({ color: "#c96f4a", roughness: 0.55 }));
    weight.castShadow = true;
    handle.scene.add(weight);
    let springMesh: THREE.Mesh | null = null;

    const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 0.35), new THREE.MeshStandardMaterial({ color: "#f1e9c9", roughness: 0.7 }));
    ruler.position.set(0.9, 2.2, 0);
    handle.scene.add(ruler);

    const stop = attachFrameHooks(handle, [
      (t) => {
        const { extension } = physRef.current;
        const x = Math.min(2.6, extension * 3.4);
        const topY = 4.15;
        const bottomY = topY - 1.5 - x;
        weight.position.set(-1.25, bottomY - 0.45, 0);
        weight.rotation.y = t * 0.25;
        if (springMesh) {
          springMesh.geometry.dispose();
          handle.scene.remove(springMesh);
        }
        const pts: THREE.Vector3[] = [];
        const coils = 9;
        const h = topY - bottomY;
        for (let i = 0; i <= coils * 12; i++) {
          const tt = i / (coils * 12);
          pts.push(new THREE.Vector3(-1.25 + Math.cos(tt * coils * Math.PI * 2) * 0.42, topY - tt * h, Math.sin(tt * coils * Math.PI * 2) * 0.42));
        }
        springMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 140, 0.075, 8, false), springMat);
        handle.scene.add(springMesh);
      },
    ]);
    return () => {
      stop();
      handle.dispose();
    };
  }, []);

  return (
    <div>
      <div className={`${card} mb-3 p-2`}>
        <canvas ref={canvasRef} className="h-[280px] w-full rounded-2xl" />
        <p className="px-2 pb-1 pt-1.5 text-center text-xs text-slate-400">🖐 Sahnani aylantiring · og'irlik prujinani cho'zadi (F = k·x)</p>
      </div>
      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tajriba sozlamalari</p>
        <p className="mt-3 text-sm font-medium text-slate-700">Massa: {mass} kg</p>
        <input type="range" min={0.2} max={6} step={0.2} value={mass} onChange={(e) => setMass(Number(e.target.value))} className="w-full accent-teal-700" />
        <p className="mt-2 text-sm font-medium text-slate-700">Prujina qattiqligi (k): {k} N/m</p>
        <input type="range" min={5} max={80} step={1} value={k} onChange={(e) => setK(Number(e.target.value))} className="w-full accent-teal-700" />
      </div>
      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hisob natijasi (Hooke qonuni)</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] text-slate-400">Kuch (F = m·g)</p>
            <p className="text-lg font-bold text-slate-800">{phys.force.toFixed(1)} N</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] text-slate-400">Cho'zilish (x = F/k)</p>
            <p className="text-lg font-bold text-slate-800">{phys.extension.toFixed(2)} m</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] text-slate-400">Tebranish davri</p>
            <p className="text-lg font-bold text-slate-800">{phys.period.toFixed(2)} s</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================== 🔦 OPTIKA (LINZA) ==============================

function OpticsLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [focal, setFocal] = useState(30);
  const [objectCm, setObjectCm] = useState(60);
  const [concave, setConcave] = useState(false);
  const phys = lensPhysics(focal, objectCm, concave);
  const physRef = useRef(phys);
  physRef.current = phys;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 10 });
    // optik o'q
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 20, 10), new THREE.MeshStandardMaterial({ color: "#334155" }));
    axis.rotation.z = Math.PI / 2;
    axis.position.y = 1.6;
    handle.scene.add(axis);
    // stol
    const table = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), new THREE.MeshStandardMaterial({ color: "#7c5b3f", roughness: 0.8 }));
    table.position.y = -0.6;
    handle.scene.add(table);
    // linza
    const lens = new THREE.Group();
    const lensMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.16, 40), new THREE.MeshPhysicalMaterial({ color: "#bfe4f2", transparent: true, opacity: 0.45, transmission: 0.7, roughness: 0.1, thickness: 0.5 }));
    lensMesh.rotation.x = Math.PI / 2;
    lens.add(lensMesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.09, 12, 40), new THREE.MeshStandardMaterial({ color: "#475569", metalness: 0.55, roughness: 0.35 }));
    lens.add(ring);
    lens.position.y = 1.6;
    handle.scene.add(lens);

    const obj = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.7, 18), new THREE.MeshStandardMaterial({ color: "#e05a33", roughness: 0.45 }));
    const img = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.7, 18), new THREE.MeshStandardMaterial({ color: "#2f80ed", roughness: 0.45, transparent: true, opacity: 0.85 }));
    handle.scene.add(obj, img);

    const rayMat = new THREE.LineBasicMaterial({ color: "#d9a23e" });
    const rays = new THREE.Group();
    handle.scene.add(rays);

    const focusL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: "#16a34a", emissive: "#0f7a35", emissiveIntensity: 0.5 }));
    const focusR = focusL.clone();
    handle.scene.add(focusL, focusR);

    const stop = attachFrameHooks(handle, [
      () => {
        const p = physRef.current;
        const scale = 0.055; // 1 sm = 0.055 birligi
        const ox = -objectCm * scale;
        obj.position.set(ox, 1.6 + 0.85, 0);
        obj.rotation.x = Math.PI;
        const di = p.image;
        if (Number.isFinite(di)) {
          img.visible = true;
          const ix = di * scale;
          img.position.set(ix, 1.6 + (di < 0 ? -0.85 * Math.min(2, Math.abs(p.magnification)) : 0.85 * Math.min(2, Math.abs(p.magnification))), 0);
          img.rotation.x = di > 0 ? Math.PI : 0;
          const mAbs = Math.min(2.2, Math.abs(p.magnification));
          img.scale.set(mAbs, mAbs, mAbs);
        } else img.visible = false;

        focusL.position.set(-Math.abs(p.focal) * scale, 1.6, 0);
        focusR.position.set(Math.abs(p.focal) * scale, 1.6, 0);
        (lensMesh.material as THREE.MeshPhysicalMaterial).color.set(concave ? "#e9c7f2" : "#bfe4f2");

        // nurlar: parallel→fokus, markaz orqali, fokus orqali
        while (rays.children.length) rays.remove(rays.children[0]);
        const topY = 1.6 + 1.15;
        const addRay = (pts: [number, number][]) => {
          const geo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, 0.12)));
          rays.add(new THREE.Line(geo, rayMat));
        };
        const f = Math.abs(p.focal) * scale;
        if (!concave) {
          addRay([[ox, topY], [0, topY], [f, 1.6]]);
          addRay([[ox, topY], [0, 1.6 + (topY - 1.6) * 0.32], [6, 1.6 - (topY - 1.6) * 0.55]]);
          addRay([[ox, topY], [0, 1.6 - 0.2], [-6, 1.6 - 0.2 - (topY - 1.6) * 0.4]]);
        } else {
          addRay([[ox, topY], [0, topY], [6, topY + 0.9]]);
          addRay([[ox, topY], [0, 1.6 + (topY - 1.6) * 0.32], [6, 1.6 - (topY - 1.6) * 0.4]]);
          addRay([[ox, topY], [0, 1.6], [6, 1.6]]);
        }
      },
    ]);
    return () => {
      stop();
      handle.dispose();
    };
  }, [concave]);

  return (
    <div>
      <div className={`${card} mb-3 p-2`}>
        <canvas ref={canvasRef} className="h-[280px] w-full rounded-2xl" />
        <p className="px-2 pb-1 pt-1.5 text-center text-xs text-slate-400">🟠 nurlar · 🔴 buyum · 🔵 tasvir · 🟢 fokuslar — surib aylantiring</p>
      </div>
      <div className={`${card} mb-3`}>
        <div className="flex gap-2">
          <button onClick={() => setConcave(false)} className={`${chip} ${!concave ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>
            🔵 Yig'uvchi (qavariq)
          </button>
          <button onClick={() => setConcave(true)} className={`${chip} ${concave ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>
            🟣 Tarqatuvchi (qavariq emas)
          </button>
        </div>
        <p className="mt-3 text-sm font-medium text-slate-700">Fokus masofasi: {focal} sm</p>
        <input type="range" min={10} max={80} step={1} value={focal} onChange={(e) => setFocal(Number(e.target.value))} className="w-full accent-teal-700" />
        <p className="mt-2 text-sm font-medium text-slate-700">Buyum masofasi: {objectCm} sm</p>
        <input type="range" min={5} max={150} step={1} value={objectCm} onChange={(e) => setObjectCm(Number(e.target.value))} className="w-full accent-teal-700" />
      </div>
      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hisob natijasi (ingichka linza tenglamasi)</p>
        <div className="mt-2 space-y-1.5 text-sm">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">
            1/f = 1/d<sub>buyum</sub> + 1/d<sub>tasvir</sub> →{" "}
            {Number.isFinite(phys.image) ? (
              <>
                d<sub>tasvir</sub> = <b>{phys.image.toFixed(1)} sm</b> ({phys.real ? "haqiqiy" : "virtual"} tasvir)
              </>
            ) : (
              <b>Tasvir parallel nurlar bilan cheksizlikda</b>
            )}
          </p>
          {Number.isFinite(phys.magnification) && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">
              Kattalashtirish m = −d<sub>tasvir</sub>/d<sub>buyum</sub> = <b>{phys.magnification.toFixed(2)}×</b>{" "}
              {phys.magnification < 0 ? "(tik)" : "(tik emas)"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
