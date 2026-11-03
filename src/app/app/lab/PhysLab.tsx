// ⚡ 3D Fizika laboratoriyasi — elektr zanjiri (qo'l bilan yig'ish, nosozliklar, motor/LED/gurj…)
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { applyWires, lensPhysics, solveCircuit, springPhysics, type CircuitComp, type CircuitCompType, type CircuitWire } from "./engine";
import { attachFrameHooks, attachPointer, benchTop, createScene, type SceneHandle } from "./three-utils";
import { CameraPad, PickCard, StageBox, labChip, type CatalogItem, type PickInfo } from "./StageBox";

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

// ============================== 🔌 ELEKTR ZANJIRI ==============================

const ADD_LABEL: Record<CircuitCompType, string> = {
  battery: "🔋 Batareya",
  bulb: "💡 Lampochka",
  resistor: "🎚 Rezistor",
  switch: "🔛 Kalit",
  ammeter: "📏 Ampermetr",
  led: "🔴 LED",
  motor: "⚙️ Motor",
  buzzer: "🔔 Gurj",
  galv: "📟 Galvanometr",
  rheostat: "🎛 Reostat",
  heater: "♨️ Isitgich",
};

function CircuitLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const compGroupRef = useRef<THREE.Group | null>(null);
  const wireGroupRef = useRef<THREE.Group | null>(null);

  const [comps, setComps] = useState<CircuitComp[]>([]);
  const [wires, setWires] = useState<CircuitWire[]>([]);
  const [selTerm, setSelTerm] = useState<{ comp: string; term: "a" | "b" } | null>(null);
  const [selComp, setSelComp] = useState<string | null>(null);
  const [power, setPower] = useState(true);
  const [faultMode, setFaultMode] = useState(false);
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState<{ info: PickInfo; id: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const moveRef = useRef<THREE.Object3D | null>(null);
  const selTermRef = useRef<{ comp: string; term: "a" | "b" } | null>(null);
  selTermRef.current = selTerm;

  const powered = solveCircuit(applyWires(comps, wires));
  const solved = power ? powered : { ...powered, brightness: {}, motorSpeed: {}, buzzerOn: {}, galvNeedle: {}, heatGlow: {}, totalCurrent: 0 };
  const solvedRef = useRef(solved);
  solvedRef.current = solved;
  const compRef = useRef(comps);
  compRef.current = comps;
  const wireRef = useRef(wires);
  wireRef.current = wires;
  const faultModeRef = useRef(faultMode);
  faultModeRef.current = faultMode;
  const powerRef = useRef(power);
  powerRef.current = power;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 12 });
    handleRef.current = handle;
    handle.scene.add(benchTop(18, 11));
    const compGroup = new THREE.Group();
    const wireGroup = new THREE.Group();
    handle.scene.add(compGroup, wireGroup);
    compGroupRef.current = compGroup;
    wireGroupRef.current = wireGroup;

    // bosish/siljitish (qo'l bilan)
    const detachPointer = attachPointer(handle, canvas, {
      getRoots: () => compGroup.children,
      moveRef,
      onPick: (root, hit, ev) => {
        const ud = root.userData as { kind: string; id: string };
        // 🟢 TERMINAL SNAP — bosish yaqinidagi terminalni tortib olish (masofa keng)
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        let near: { comp: string; term: "a" | "b" } | null = null;
        let nearD = 52; // piksel — ulash masofasi
        for (const c of compRef.current) {
          const node = compGroup.children.find((ch) => ch.userData?.id === c.id);
          if (!node) continue;
          for (const tn of ["a", "b"] as const) {
            const tObj = node.getObjectByName(`term-${tn}`);
            if (!tObj) continue;
            const wp = tObj.getWorldPosition(new THREE.Vector3()).project(handle.camera);
            const sx = (wp.x * 0.5 + 0.5) * rect.width;
            const sy = (-wp.y * 0.5 + 0.5) * rect.height;
            const d = Math.hypot(sx - mx, sy - my);
            if (d < nearD) {
              nearD = d;
              near = { comp: c.id, term: tn };
            }
          }
        }
        const termHit = hit.userData?.kind === "terminal" ? { comp: ud.id, term: hit.userData.term as "a" | "b" } : near;
        if (termHit) {
          const term = termHit.term;
          const compId = termHit.comp;
          setSelTerm((prev) => {
            if (!prev) {
              setMsg(`🟢 Terminal tanlandi — endi ikkinchi terminalni bosing (sim tortiladi)`);
              return { comp: compId, term };
            }
            if (prev.comp === compId && prev.term === term) return null;
            setWires((ws) =>
              ws.some(
                (w) =>
                  (w.fromComp === prev.comp && w.fromTerm === prev.term && w.toComp === compId && w.toTerm === term) ||
                  (w.toComp === prev.comp && w.toTerm === prev.term && w.fromComp === compId && w.fromTerm === term),
              )
                ? ws
                : [...ws, { fromComp: prev.comp, fromTerm: prev.term, toComp: compId, toTerm: term }],
            );
            const c1 = compRef.current.find((c) => c.id === prev.comp);
            const c2 = compRef.current.find((c) => c.id === compId);
            setMsg(`⚡ Sim ulandi: ${c1 ? ADD_LABEL[c1.type] : prev.comp}(${prev.term.toUpperCase()}) → ${c2 ? ADD_LABEL[c2.type] : compId}(${term.toUpperCase()})`);
            return null;
          });
          return;
        }
        if (ud.kind === "comp") {
          if (faultModeRef.current) {
            setComps((cs) =>
              cs.map((c) => {
                if (c.id !== ud.id) return c;
                const order: Array<CircuitComp["fault"]> = c.type === "battery" ? [null, "open", "short", "dead"] : [null, "open", "short"];
                const next = order[(order.indexOf(c.fault ?? null) + 1) % order.length];
                return { ...c, fault: next ?? undefined };
              }),
            );
            return;
          }
          setSelComp(ud.id);
          setComps((cs) => cs.map((c) => (c.id === ud.id && c.type === "switch" ? { ...c, closed: !c.closed } : c)));
          const c = compRef.current.find((x) => x.id === ud.id);
          if (c) {
            setPick({
              info: {
                icon: "🔧",
                label: ADD_LABEL[c.type],
                desc: c.fault ? `Nosozlik: ${c.fault}` : c.type === "switch" ? `Kalit: ${c.closed ? "yopiq" : "ochiq"}` : "Siljitish uchun tugmani bosing",
              },
              id: ud.id,
            });
          }
        }
      },
    });

    const stop = attachFrameHooks(handle, [
      (t, dt) => {
        const g = compGroupRef.current;
        if (!g) return;
        const list = compRef.current;
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
            // terminal/urish zonalari bosilganda ham qurilmaning O'ZI tanlansin
            node.traverse((o) => {
              if (o !== node) o.userData.pickRoot = node;
            });
            g.add(node);
          }
          if (!node.userData.placed) {
            node.position.set(-7 + (i % 6) * 2.8, 0.2, i >= 6 ? -2.8 : 1.6);
            node.userData.placed = true;
          }
          // tanlangan terminal pulsatsiyasi
          const st = selTermRef.current;
          node.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.name === "term-a" || m.name === "term-b") {
              const isSel = st && st.comp === c.id && st.term === m.name.slice(5);
              (m.material as THREE.MeshStandardMaterial).emissiveIntensity = isSel ? 0.6 + Math.sin(t * 8) * 0.4 : 0.25;
            }
          });
          const sol = solvedRef.current;
          // yorug'lik / harakatlar
          const glow = node.getObjectByName("glow") as THREE.Mesh | undefined;
          if (glow) {
            const b = sol.brightness[c.id] ?? 0;
            (glow.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + b * 2.6;
            (glow.material as THREE.MeshStandardMaterial).color.set(b > 0.05 ? "#ffd76a" : "#9aa4b2");
          }
          const led = node.getObjectByName("led") as THREE.Mesh | undefined;
          if (led) {
            const b = sol.brightness[c.id] ?? 0;
            const rev = sol.ledReversed?.[c.id];
            (led.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1 + b * 3;
            (led.material as THREE.MeshStandardMaterial).color.set(rev ? "#4b5563" : b > 0.02 ? "#ff4d4d" : "#7f1d1d");
          }
          const fan = node.getObjectByName("fan") as THREE.Group | undefined;
          if (fan) fan.rotation.y += (sol.motorSpeed?.[c.id] ?? 0) * dt * 14;
          const needle = node.getObjectByName("needle") as THREE.Mesh | undefined;
          if (needle) {
            const n = sol.galvNeedle?.[c.id] ?? 0;
            needle.rotation.z = -n * 1.1;
          }
          const heat = node.getObjectByName("heat") as THREE.Mesh | undefined;
          if (heat) {
            const h = sol.heatGlow?.[c.id] ?? 0;
            (heat.material as THREE.MeshStandardMaterial).emissiveIntensity = h * (1.6 + Math.sin(t * 6) * 0.3);
          }
          const bell = node.getObjectByName("bell") as THREE.Mesh | undefined;
          if (bell) {
            const on = sol.buzzerOn?.[c.id] ?? false;
            bell.scale.setScalar(on ? 1 + Math.sin(t * 22) * 0.12 : 1);
            (bell.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.1 : 0;
          }
          const lever = node.getObjectByName("lever") as THREE.Mesh | undefined;
          if (lever) lever.rotation.z = c.closed ? -0.6 : 0.5;
          // nosozlik belgisi
          let faultMark = node.getObjectByName("faultMark") as THREE.Mesh | undefined;
          if (c.fault) {
            if (!faultMark) {
              faultMark = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ color: "#dc2626", transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
              faultMark.name = "faultMark";
              faultMark.position.set(0, 2.15, 0);
              node.add(faultMark);
            }
            faultMark.lookAt(handle.camera.position);
          } else if (faultMark) node.remove(faultMark);
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
          const flowing = solvedRef.current.ok && solvedRef.current.totalCurrent > 0.01 && powerRef.current;
          const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 18, 0.075, 8, false),
            new THREE.MeshStandardMaterial({
              color: flowing ? "#14b8a6" : "#2f3b4a",
              emissive: flowing ? "#0d9488" : "#000000",
              emissiveIntensity: flowing ? 0.55 + Math.sin(t * 6) * 0.25 : 0,
              roughness: 0.45,
              metalness: 0.35,
            }),
          );
          wg.add(tube);
        }
      },
    ]);

    return () => {
      stop();
      detachPointer();
      handle.dispose();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addComp = (type: CircuitCompType) => {
    setComps((cs) => {
      const id = `${type}${Date.now()}`;
      const value = type === "battery" ? 9 : type === "bulb" || type === "led" ? 6 : type === "resistor" ? 10 : type === "rheostat" ? 12 : type === "heater" ? 6 : 0;
      return [...cs, { id, type, a: cs.length * 2 + 1, b: cs.length * 2 + 2, value, closed: type === "switch" ? true : undefined }];
    });
  };

  const loadProject = (key: string) => {
    const projects: Record<string, { comps: CircuitComp[]; wires: CircuitWire[] }> = {
      light: {
        comps: [
          { id: "bat", type: "battery", a: 1, b: 2, value: 9 },
          { id: "sw", type: "switch", a: 2, b: 3, value: 0, closed: true },
          { id: "bulb", type: "bulb", a: 3, b: 1, value: 6 },
        ],
        wires: [
          { fromComp: "bat", fromTerm: "b", toComp: "sw", toTerm: "a" },
          { fromComp: "sw", fromTerm: "b", toComp: "bulb", toTerm: "a" },
          { fromComp: "bulb", fromTerm: "b", toComp: "bat", toTerm: "a" },
        ],
      },
      measure: {
        comps: [
          { id: "bat", type: "battery", a: 1, b: 2, value: 12 },
          { id: "am", type: "ammeter", a: 2, b: 3, value: 0 },
          { id: "r", type: "resistor", a: 3, b: 1, value: 20 },
        ],
        wires: [
          { fromComp: "bat", fromTerm: "b", toComp: "am", toTerm: "a" },
          { fromComp: "am", fromTerm: "b", toComp: "r", toTerm: "a" },
          { fromComp: "r", fromTerm: "b", toComp: "bat", toTerm: "a" },
        ],
      },
      motor: {
        comps: [
          { id: "bat", type: "battery", a: 1, b: 2, value: 12 },
          { id: "sw", type: "switch", a: 2, b: 3, value: 0, closed: false },
          { id: "rh", type: "rheostat", a: 3, b: 4, value: 15 },
          { id: "m", type: "motor", a: 4, b: 1, value: 0 },
        ],
        wires: [
          { fromComp: "bat", fromTerm: "b", toComp: "sw", toTerm: "a" },
          { fromComp: "sw", fromTerm: "b", toComp: "rh", toTerm: "a" },
          { fromComp: "rh", fromTerm: "b", toComp: "m", toTerm: "a" },
          { fromComp: "m", fromTerm: "b", toComp: "bat", toTerm: "a" },
        ],
      },
      signal: {
        comps: [
          { id: "bat", type: "battery", a: 1, b: 2, value: 9 },
          { id: "sw", type: "switch", a: 2, b: 3, value: 0, closed: true },
          { id: "led", type: "led", a: 3, b: 4, value: 6 },
          { id: "bz", type: "buzzer", a: 4, b: 1, value: 0 },
        ],
        wires: [
          { fromComp: "bat", fromTerm: "b", toComp: "sw", toTerm: "a" },
          { fromComp: "sw", fromTerm: "b", toComp: "led", toTerm: "a" },
          { fromComp: "led", fromTerm: "b", toComp: "bz", toTerm: "a" },
          { fromComp: "bz", fromTerm: "b", toComp: "bat", toTerm: "a" },
        ],
      },
    };
    const p = projects[key];
    if (!p) return;
    setComps(p.comps);
    setWires(p.wires);
    setSelComp(null);
    setSelTerm(null);
    setPower(true);
    setMsg("📋 Loyiha yuklandi — ▶ ishga tushirib ko'ring!");
  };

  const selected = comps.find((c) => c.id === selComp);
  const catalog: CatalogItem[] = [
    ...(Object.keys(ADD_LABEL) as CircuitCompType[]).map((t) => ({ id: `c:${t}`, icon: "🔧", name: ADD_LABEL[t], group: "Qurilmalar (ish stoliga qo'shing)" })),
    { id: "p:light", icon: "💡", name: "Loyiha: Yoritish", group: "Tayyor loyihalar", desc: "Batareya + kalit + lampochka" },
    { id: "p:measure", icon: "📏", name: "Loyiha: O'lchov", group: "Tayyor loyihalar", desc: "Ampermetr + rezistor (Om qonuni)" },
    { id: "p:motor", icon: "⚙️", name: "Loyiha: Motor", group: "Tayyor loyihalar", desc: "Reostat bilan tezlikni boshqaring" },
    { id: "p:signal", icon: "🔔", name: "Loyiha: Signal", group: "Tayyor loyihalar", desc: "LED + gurj — yorug'lik va tovush" },
    { id: "t:power", icon: "▶️", name: "Ishga tushirish / to'xtatish", group: "Boshqaruv" },
    { id: "t:fault", icon: "🔧", name: "Nosozlik rejimi", group: "Boshqaruv", desc: "Qurilmaga bosib nosozlik qo'shing — zanjir ishlamay qoladi!" },
    { id: "t:clear", icon: "🧹", name: "Hammasini o'chirish", group: "Boshqaruv" },
    { id: "t:unwire", icon: "↩️", name: "Oxirgi simni o'chirish", group: "Boshqaruv" },
  ];

  const handleAdd = (id: string) => {
    if (id.startsWith("c:")) addComp(id.slice(2) as CircuitCompType);
    else if (id.startsWith("p:")) loadProject(id.slice(2));
    else if (id === "t:power") setPower((p) => !p);
    else if (id === "t:fault") setFaultMode((f) => !f);
    else if (id === "t:clear") {
      setComps([]);
      setWires([]);
      setSelComp(null);
      setSelTerm(null);
    } else if (id === "t:unwire") setWires((ws) => ws.slice(0, -1));
  };

  return (
    <StageBox
      title="⚡ Elektr zanjiri — qo'l bilan yig'ish"
      catalog={catalog}
      onAdd={handleAdd}
      toolbar={
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPower((p) => !p)} className={`${labChip} ${power ? "bg-emerald-600 text-white" : "bg-slate-700 text-white"}`}>
            {power ? "⏸ To'xtatish" : "▶ Ishga tushirish"}
          </button>
          <button onClick={() => setFaultMode((f) => !f)} className={`${labChip} ${faultMode ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-600"}`}>
            🔧 Nosozlik rejimi {faultMode ? "(yoqilgan)" : ""}
          </button>
          <button onClick={() => setWires((ws) => ws.slice(0, -1))} className={`${labChip} bg-amber-50 text-amber-700`}>↩️ Simni o'chirish</button>
          <button onClick={() => { setComps([]); setWires([]); setSelComp(null); setSelTerm(null); }} className={`${labChip} bg-slate-100 text-slate-700`}>🧹 Tozalash</button>
        </div>
      }
    >
      <div className="relative">
        <canvas ref={canvasRef} className="lab-canvas h-[300px] w-full rounded-2xl bg-slate-100" />
        <CameraPad handleRef={handleRef} />
        <PickCard
          info={pick?.info ?? null}
          moving={moving}
          onMove={() => {
            if (!pick) return;
            const node = compGroupRef.current?.children.find((ch) => ch.userData?.id === pick.id);
            if (node) {
              moveRef.current = moving ? null : node;
              setMoving(!moving);
            }
          }}
          onClose={() => {
            setPick(null);
            moveRef.current = null;
            setMoving(false);
          }}
        />
      </div>
      <p className="px-1 pb-1 pt-1.5 text-center text-xs text-slate-400">
        🟢 Terminalni bosing → sim tortiladi · qurilmaga bosib <b>nomi</b> chiqadi · 🔀 Siljitish bilan joylashtiring{faultMode && " · NOSOZLIK REJIMI: qurilmaga bosib nosozlik qo'shing"}
      </p>
      {moving && <p className="rounded-2xl bg-amber-50 p-2.5 text-center text-sm text-amber-700">🔀 Siljitish rejimi — qurilmani <b>sudrab</b> joylang</p>}

      {msg && <p className="rounded-2xl bg-emerald-50 p-2.5 text-center text-sm text-emerald-700">{msg}</p>}

      {selected && (
        <div className="rounded-2xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">
            {ADD_LABEL[selected.type]}
            {selected.fault && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">nosozlik: {selected.fault === "open" ? "sindirilgan/ochiq" : selected.fault === "short" ? "qisqa tutashuv" : "o'lik"}</span>}
          </p>
          {(selected.type === "battery" || selected.type === "resistor" || selected.type === "bulb" || selected.type === "led" || selected.type === "rheostat" || selected.type === "heater") && (
            <>
              <input
                type="range"
                min={selected.type === "battery" ? 1.5 : 1}
                max={selected.type === "battery" ? 24 : 60}
                step={0.5}
                value={selected.value}
                onChange={(e) => setComps((cs) => cs.map((c) => (c.id === selected.id ? { ...c, value: Number(e.target.value) } : c)))}
                className="mt-2 w-full accent-teal-700"
              />
              <p className="mt-1 text-xs text-slate-500">
                {selected.type === "battery" ? `Kuchlanish: ${selected.value} V` : selected.type === "bulb" || selected.type === "led" ? `Nominal kuchlanish: ${selected.value} V` : `Qarshilik: ${selected.value} Om`}
              </p>
            </>
          )}
          <button
            onClick={() => setComps((cs) => cs.filter((c) => c.id !== selected.id))}
            className="mt-2 rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700"
          >
            🗑 O'chirish
          </button>
        </div>
      )}

      <div className="rounded-3xl bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hisob natijasi (Kirchgof qonuni)</p>
        {!power ? (
          <p className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-500">⏸ Zanjir to'xtatilgan — <b>▶ Ishga tushirish</b> tugmasini bosing.</p>
        ) : !solved.ok ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">{solved.error ?? "Zanjir to'liq emas."}</p>
        ) : (
          <div className="mt-2 space-y-1.5 text-sm">
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
              ✅ Zanjir ishlayapti — umumiy tok: <b>{(solved.totalCurrent * 1000).toFixed(1)} mA</b>
            </p>
            {comps.map((c) => {
              const i = solved.currents[c.id] ?? 0;
              const extra =
                c.type === "bulb" || c.type === "led"
                  ? `yorug'lik ${Math.round((solved.brightness[c.id] ?? 0) * 100)}%${solved.ledReversed?.[c.id] ? " (⚠️ LED teskari ulangan!)" : ""}`
                  : c.type === "motor"
                    ? `tezlik ${Math.round((solved.motorSpeed?.[c.id] ?? 0) * 100)}%`
                    : c.type === "buzzer"
                      ? (solved.buzzerOn?.[c.id] ? "🔔 OVOZ BERMOQDA" : "jim")
                      : c.type === "galv"
                        ? `strelka ${((solved.galvNeedle?.[c.id] ?? 0) * 100).toFixed(0)}%`
                        : c.type === "heater"
                          ? `qizish ${Math.round((solved.heatGlow?.[c.id] ?? 0) * 100)}%`
                          : "";
              return (
                <p key={c.id} className={`rounded-xl px-3 py-2 ${c.fault ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-700"}`}>
                  {ADD_LABEL[c.type]}: <b>{(i * 1000).toFixed(1)} mA</b> {extra}
                  {c.fault && <span className="ml-1 text-xs">— nosozlik!</span>}
                </p>
              );
            })}
            <p className="text-xs text-slate-400">U = I·R (Om qonuni) · batareya ichki qarshiligi 0.4 Om · nosozliklar hisobga olinadi.</p>
          </div>
        )}
      </div>
    </StageBox>
  );
}

function terminalPos(group: THREE.Group, term: "a" | "b"): THREE.Vector3 {
  const t = group.getObjectByName(`term-${term}`);
  const v = new THREE.Vector3();
  if (t) t.getWorldPosition(v);
  else v.copy(group.position);
  return v;
}

function buildCompMesh(type: CircuitCompType): THREE.Group {
  const g = new THREE.Group();
  const bodyColor = type === "battery" ? "#3a7d44" : type === "bulb" || type === "led" ? "#5b6b7d" : type === "motor" ? "#4b5f7a" : type === "buzzer" ? "#8a4b5f" : type === "galv" ? "#3b4a63" : "#7a6551";
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 0.95), new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55 }));
  body.position.y = 0.32;
  body.castShadow = true;
  g.add(body);
  if (type === "battery") {
    const plus = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 12), new THREE.MeshStandardMaterial({ color: "#c0392b" }));
    plus.position.set(0.45, 0.72, 0);
    g.add(plus);
  } else if (type === "bulb") {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.35, 16), new THREE.MeshStandardMaterial({ color: "#8d99ae", metalness: 0.5, roughness: 0.4 }));
    stand.position.y = 0.78;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 14), new THREE.MeshStandardMaterial({ color: "#9aa4b2", emissive: "#ffb84d", emissiveIntensity: 0.12, roughness: 0.25 }));
    glow.position.y = 1.35;
    glow.name = "glow";
    g.add(stand, glow);
  } else if (type === "led") {
    const led = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.85, 18), new THREE.MeshStandardMaterial({ color: "#7f1d1d", emissive: "#ff2d2d", emissiveIntensity: 0.1, roughness: 0.3 }));
    led.position.y = 1.15;
    led.name = "led";
    g.add(led);
  } else if (type === "resistor" || type === "rheostat" || type === "heater") {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.15, 18), new THREE.MeshStandardMaterial({ color: type === "heater" ? "#6b3b2b" : "#d9c7a3", roughness: 0.6, emissive: type === "heater" ? "#ff3b00" : "#000", emissiveIntensity: 0 }));
    cyl.rotation.z = Math.PI / 2;
    cyl.position.y = 0.78;
    if (type === "heater") cyl.name = "heat";
    g.add(cyl);
    if (type === "rheostat") {
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: "#e07b39" }));
      knob.position.set(0, 1.15, 0);
      g.add(knob);
    }
  } else if (type === "switch") {
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), new THREE.MeshStandardMaterial({ color: "#e07b39", roughness: 0.5 }));
    lever.position.set(0, 0.95, 0);
    lever.name = "lever";
    lever.geometry.translate(0, 0.31, 0);
    g.add(lever);
  } else if (type === "ammeter" || type === "galv") {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.14, 24), new THREE.MeshStandardMaterial({ color: "#f4f1de", roughness: 0.4 }));
    face.rotation.x = Math.PI / 2;
    face.position.set(0, 1.15, 0.3);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.03), new THREE.MeshStandardMaterial({ color: "#b02a2a" }));
    needle.position.set(0, 1.15, 0.4);
    needle.geometry.translate(0, 0.2, 0);
    needle.name = "needle";
    g.add(face, needle);
  } else if (type === "motor") {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.95, 22), new THREE.MeshStandardMaterial({ color: "#4b5f7a", metalness: 0.55, roughness: 0.35 }));
    cyl.position.y = 1.05;
    const fan = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.045, 0.2), new THREE.MeshStandardMaterial({ color: "#cbd5e1", metalness: 0.4, roughness: 0.4 }));
      blade.position.y = 1.72;
      blade.rotation.y = (i / 3) * Math.PI * 2;
      blade.translateX(0.32);
      fan.add(blade);
    }
    fan.name = "fan";
    g.add(cyl, fan);
  } else if (type === "buzzer") {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#c9a227", emissive: "#ffdd55", emissiveIntensity: 0, metalness: 0.5, roughness: 0.35 }));
    bell.position.y = 0.72;
    bell.name = "bell";
    g.add(bell);
  }
  for (const term of ["a", "b"] as const) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), new THREE.MeshStandardMaterial({ color: term === "a" ? "#2e8b57" : "#8b2e2e", emissive: term === "a" ? "#1d5c38" : "#5c1d1d", emissiveIntensity: 0.25 }));
    t.position.set(term === "a" ? -0.95 : 0.95, 0.55, 0);
    t.name = `term-${term}`;
    t.userData = { kind: "terminal", term };
    g.add(t);
    // katta "urish" zonasi — ulash masofasini uzaytiradi (ko'rinmas)
    const hitZone = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hitZone.position.copy(t.position);
    hitZone.name = `termhit-${term}`;
    hitZone.userData = { kind: "terminal", term };
    g.add(hitZone);
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
        springMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 130, 0.075, 8, false), springMat);
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
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 20, 10), new THREE.MeshStandardMaterial({ color: "#334155" }));
    axis.rotation.z = Math.PI / 2;
    axis.position.y = 1.6;
    handle.scene.add(axis);
    const table = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), new THREE.MeshStandardMaterial({ color: "#7c5b3f", roughness: 0.8 }));
    table.position.y = -0.6;
    handle.scene.add(table);
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
        const scale = 0.055;
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
          <button onClick={() => setConcave(false)} className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${!concave ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>
            🔵 Yig'uvchi
          </button>
          <button onClick={() => setConcave(true)} className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${concave ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>
            🟣 Tarqatuvchi
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
              <b>Tasvir cheksizlikda</b>
            )}
          </p>
          {Number.isFinite(phys.magnification) && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">
              Kattalashtirish m = <b>{phys.magnification.toFixed(2)}×</b> {phys.magnification < 0 ? "(tik)" : "(tik emas)"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
