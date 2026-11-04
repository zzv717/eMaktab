// ⚡ 3D Fizika laboratoriyasi — elektr zanjiri (qo'l bilan yig'ish, nosozliklar, motor/LED/gurj…)
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { applyWires, lensPhysics, solveCircuit, springPhysics, type CircuitComp, type CircuitCompType, type CircuitWire } from "./engine";
import { attachFrameHooks, attachPointer, benchTop, createScene, type SceneHandle } from "./three-utils";
import { CameraPad, PickCard, StageBox, labChip, type CatalogItem, type PickInfo } from "./StageBox";
import { GuideButton, GUIDE_PHYSICS } from "./Guides";

type Mode = "circuit" | "spring" | "optics";

export default function PhysLab() {
  const [mode, setMode] = useState<Mode>("circuit");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <span className="ml-auto">
          <GuideButton guide={GUIDE_PHYSICS} />
        </span>
      </div>
      {mode === "circuit" && <CircuitLab />}
      {mode === "spring" && <SpringLab />}
      {mode === "optics" && <OpticsLab />}
    </div>
  );
}

// 🌍 Real hayot — har bir qurilma qayerda ishlatiladi (bosilganda chiqadi)
const REAL_DESC: Record<CircuitCompType, string> = {
  battery: "🔋 Telefon, qo'l chirog'i, avtomobil akkumulyatori — hammasi shunday energiya beradi!",
  bulb: "💡 Xona chirog'i, fonar, avtomobil farasi — spiral qizib yonadi.",
  resistor: "📻 Radio, TV, kompyuter sxemasida tokni cheklash uchun millionlab ishlatiladi.",
  switch: "🏠 Devordagi yorug'lik kaliti — zanjirni ochadi/yopadi.",
  ammeter: "🔧 Elektrchi tok kuchini shunday o'lchaydi; uy hisoblagichi ham shu printsipda.",
  led: "🔴 Telefon ekrani, svetodiod chiroq, yo'l belgisi — hammasi LED.",
  motor: "🌪 Ventilyator, chang yutgich, elektromobil, lift — tokdan harakat!",
  buzzer: "🏫 Maktab qo'ng'irog'i, eshik qo'ng'irog'i, signalizatsiya.",
  galv: "📡 Laboratoriya tok o'lchagichi; elektr uzatish liniyalarini tekshirishda ishlatiladi.",
  rheostat: "🏠 Yorug'likni pas-yuqori qiluvchi dimmer, mashina gazi pedali.",
  heater: "☕ Choynak, dazmol, suv isitgich — spiral qizib ishlaydi.",
};

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
      onPick: (root, hit) => {
        const ud = root.userData as { kind: string; id: string };
        // 🟢 SIM ULASH — faqat TERMINALNING O'ZIGA bosilganda (katta urish zonasi bor).
        // Qolgan joyga bosilganda qurilma TANLANADI (nomi + Siljitish) — avvalgi xato shu edi.
        const termHit = hit.userData?.kind === "terminal" ? { comp: ud.id, term: hit.userData.term as "a" | "b" } : null;
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
                desc: c.fault ? `Nosozlik: ${c.fault}` : `${REAL_DESC[c.type]}${c.type === "switch" ? ` (hozir: ${c.closed ? "yopiq" : "ochiq"})` : ""}`,
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
    ...(Object.keys(ADD_LABEL) as CircuitCompType[]).map((t) => ({ id: `c:${t}`, icon: "🔧", name: ADD_LABEL[t], group: "Qurilmalar (ish stoliga qo'shing)", desc: REAL_DESC[t] })),
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
  const mat = (color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...opts });
  const add = (...objs: THREE.Object3D[]) => {
    for (const o of objs) {
      o.castShadow = true;
      g.add(o);
    }
  };

  if (type === "battery") {
    // 🔋 Batareya — silindr korpus, rangli yorliq, qutb belgilari
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.75, 26), mat("#2b3a4a", { metalness: 0.35, roughness: 0.4 }));
    body.position.y = 0.95;
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.575, 0.575, 1.05, 26), mat("#e8722a", { roughness: 0.5 }));
    wrap.position.y = 0.95;
    const wrap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 26), mat("#22303f"));
    wrap2.position.y = 1.62;
    const plusKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 14), mat("#c0392b", { metalness: 0.5 }));
    plusKnob.position.y = 1.9;
    const minus = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 20), mat("#37474f", { metalness: 0.6 }));
    minus.position.y = 0.1;
    add(body, wrap, wrap2, plusKnob, minus);
  } else if (type === "resistor") {
    // 🎨 Rezistor — keramik tana + RANGLI TASMALAR (haqiqiy rezistor kabi!)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.3, 20), mat("#d9c7a3", { roughness: 0.6 }));
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.78;
    add(body);
    const bandColors = ["#6b3b1d", "#c0392b", "#e8a33d", "#c9a227"]; // qo'ng'ir-qizil-sariq-oltin
    bandColors.forEach((c, i) => {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.1, 20), mat(c, { roughness: 0.5 }));
      band.rotation.z = Math.PI / 2;
      band.position.set(-0.42 + i * 0.26, 0.78, 0);
      add(band);
    });
    for (const sx of [-0.92, 0.92]) {
      const lead = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 10), mat("#c9d2dc", { metalness: 0.85, roughness: 0.2 }));
      lead.rotation.z = Math.PI / 2;
      lead.position.set(sx, 0.78, 0);
      add(lead);
    }
  } else if (type === "bulb") {
    // 💡 Lampochka — vintli asos, shisha gumbaz, SPIRAL (filament)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.5, 18), mat("#9aa7b3", { metalness: 0.7, roughness: 0.3 }));
    base.position.y = 0.35;
    add(base);
    for (let i = 0; i < 3; i++) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.035, 8, 22), mat("#8d99ae", { metalness: 0.7, roughness: 0.3 }));
      ridge.rotation.x = Math.PI / 2;
      ridge.position.y = 0.22 + i * 0.16;
      add(ridge);
    }
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), new THREE.MeshPhysicalMaterial({ color: "#eaf2f8", transparent: true, opacity: 0.24, transmission: 0.85, roughness: 0.06, thickness: 0.2, side: THREE.DoubleSide }));
    glass.position.y = 1.42;
    glass.name = "glass";
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.33, 18, 14), mat("#9aa4b2", { emissive: "#ffb84d", emissiveIntensity: 0.12, roughness: 0.25 }));
    glow.position.y = 1.38;
    glow.name = "glow";
    const filament = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.032, 8, 22), mat("#7a5c2e", { emissive: "#ff9a3c", emissiveIntensity: 0.5 }));
    filament.position.y = 1.36;
    filament.name = "filament";
    add(glass, glow, filament);
    for (const sx of [-0.1, 0.1]) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), mat("#b08d4f", { metalness: 0.8 }));
      wire.position.set(sx, 0.95, 0);
      add(wire);
    }
  } else if (type === "led") {
    // 🔴 LED — dumaloq korpus + linza + ikkala oyoq (anod/katod)
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 22), mat("#7f1d1d", { roughness: 0.4 }));
    flange.position.y = 0.28;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat("#7f1d1d", { emissive: "#ff2d2d", emissiveIntensity: 0.1, roughness: 0.22 }));
    dome.position.y = 0.32;
    dome.name = "led";
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), mat("#ffd2d2", { emissive: "#ff6b6b", emissiveIntensity: 0.25 }));
    lens.position.y = 0.64;
    add(flange, dome, lens);
    for (const sx of [-0.13, 0.13]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), mat("#c9d2dc", { metalness: 0.85, roughness: 0.2 }));
      leg.position.set(sx, 0.12, 0);
      add(leg);
    }
  } else if (type === "switch") {
    // 🔌 Pichoqli kalit — asos, g'altaklar, tayoqcha
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.3, 1.0), mat("#5b4632", { roughness: 0.6 }));
    base.position.y = 0.18;
    add(base);
    for (const sx of [-0.52, 0.52]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.42, 14), mat("#b08d4f", { metalness: 0.75, roughness: 0.3 }));
      post.position.set(sx, 0.52, 0);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat("#c9a86a", { metalness: 0.8, roughness: 0.25 }));
      cap.position.set(sx, 0.76, 0);
      add(post, cap);
    }
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.8, 0.16), mat("#e07b39", { roughness: 0.45 }));
    lever.position.set(-0.52, 0.72, 0);
    lever.geometry.translate(0, 0.4, 0);
    lever.name = "lever";
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.24), mat("#b2551f"));
    grip.position.set(0, 0.86, 0);
    lever.add(grip); // dastasi tayoqcha bilan birga qimirlaydi
    add(lever);
  } else if (type === "ammeter" || type === "galv") {
    // 📊 Strelkali asbob — dumaloq korpus, shkala chiziqlari, strelka, oynali qopqoq
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.32, 0.85), mat("#3b4a63", { metalness: 0.5, roughness: 0.4 }));
    stand.position.y = 0.18;
    const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.34, 26), mat("#2c3a4d", { metalness: 0.45, roughness: 0.4 }));
    caseM.rotation.x = Math.PI / 2;
    caseM.position.set(0, 1.05, 0.12);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 26), mat("#f4f1de", { roughness: 0.35 }));
    face.rotation.x = Math.PI / 2;
    face.position.set(0, 1.05, 0.31);
    add(stand, caseM, face);
    // shkala chiziqlari (yay)
    for (let i = 0; i <= 10; i++) {
      const ang = -1.15 + (i / 10) * 2.3;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 5 === 0 ? 0.035 : 0.02, 0.1, 0.015), mat("#1f2937"));
      tick.position.set(Math.sin(ang) * 0.44, 1.05 + Math.cos(ang) * 0.44, 0.345);
      tick.rotation.z = -ang;
      add(tick);
    }
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.48, 0.02), mat("#b02a2a"));
    needle.position.set(0, 1.05, 0.36);
    needle.geometry.translate(0, 0.24, 0);
    needle.name = "needle";
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), mat("#22303f", { metalness: 0.6 }));
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 1.05, 0.37);
    const glassCover = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.03, 26), new THREE.MeshPhysicalMaterial({ color: "#eaf2f8", transparent: true, opacity: 0.14, transmission: 0.9, roughness: 0.05 }));
    glassCover.rotation.x = Math.PI / 2;
    glassCover.position.set(0, 1.05, 0.39);
    add(needle, hub, glassCover);
  } else if (type === "motor") {
    // ⚙️ Motor — korpus, val, fan, tayanchlar, ventilyatsiya
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.15, 24), mat("#4b5f7a", { metalness: 0.55, roughness: 0.35 }));
    body.position.y = 1.05;
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24), mat("#3a4c63", { metalness: 0.6 }));
    capTop.position.y = 1.68;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.75, 12), mat("#c9d2dc", { metalness: 0.85, roughness: 0.2 }));
    shaft.position.y = 2.05;
    add(body, capTop, shaft);
    for (const sx of [-0.42, 0.42]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.85), mat("#3a4c63", { metalness: 0.5 }));
      foot.position.set(sx, 0.32, 0);
      add(foot);
    }
    for (let i = 0; i < 6; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.05), mat("#2c3a4d"));
      const ang = (i / 6) * Math.PI * 2;
      vent.position.set(Math.cos(ang) * 0.525, 1.05, Math.sin(ang) * 0.525);
      vent.rotation.y = -ang;
      add(vent);
    }
    const fan = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.22), mat("#cbd5e1", { metalness: 0.45, roughness: 0.35 }));
      blade.position.y = 1.82;
      blade.rotation.y = (i / 4) * Math.PI * 2;
      blade.translateX(0.36);
      blade.rotation.z = 0.35;
      fan.add(blade);
    }
    fan.name = "fan";
    g.add(fan);
  } else if (type === "buzzer") {
    // 🔔 Qo'ng'iroq — yarim shar, markaziy bolt, teshikchalar
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.64, 0.26, 22), mat("#6b4a2f", { roughness: 0.5 }));
    base.position.y = 0.32;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.56, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat("#c9a227", { emissive: "#ffdd55", emissiveIntensity: 0, metalness: 0.55, roughness: 0.3 }));
    bell.position.y = 0.45;
    bell.name = "bell";
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10), mat("#8a6d1c", { metalness: 0.8 }));
    bolt.position.y = 1.03;
    add(base, bell, bolt);
    for (let i = 0; i < 6; i++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8), mat("#3a2c12"));
      const ang = (i / 6) * Math.PI * 2;
      hole.position.set(Math.cos(ang) * 0.3, 0.86, Math.sin(ang) * 0.3);
      hole.rotation.x = Math.PI / 2.6;
      hole.rotation.y = -ang;
      add(hole);
    }
  } else if (type === "rheostat") {
    // 🎚 Reostat — seramik nay, rel, siljiydigan kontakt
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.55, 22), mat("#c9b391", { roughness: 0.65 }));
    tube.rotation.z = Math.PI / 2;
    tube.position.y = 0.82;
    add(tube);
    for (const sz of [-0.34, 0.34]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.09), mat("#c9d2dc", { metalness: 0.85, roughness: 0.2 }));
      rail.position.set(0, 1.22, sz);
      add(rail);
    }
    for (const sx of [-0.86, 0.86]) {
      const capE = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 20), mat("#8d6b3f", { metalness: 0.5, roughness: 0.4 }));
      capE.rotation.z = Math.PI / 2;
      capE.position.set(sx, 0.82, 0);
      add(capE);
    }
    const slider = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.85), mat("#e07b39", { roughness: 0.45 }));
    slider.position.set(0.15, 1.36, 0);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 14), mat("#b2551f"));
    knob.position.set(0.15, 1.58, 0);
    add(slider, knob);
  } else if (type === "heater") {
    // 🔥 Isitgich — SPIRAL (haqiyqiy kabi) + ramka
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.26, 1.05), mat("#4a3b2c", { roughness: 0.6 }));
    base.position.y = 0.16;
    add(base);
    for (const sx of [-0.82, 0.82]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 10), mat("#8d99ae", { metalness: 0.7 }));
      post.position.set(sx, 0.62, 0);
      add(post);
    }
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 72; i++) {
      const t = i / 72;
      const ang = t * Math.PI * 12;
      pts.push(new THREE.Vector3(-0.72 + t * 1.44, 0.92 + Math.sin(ang) * 0.21, Math.cos(ang) * 0.21));
    }
    const spiral = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.052, 8), mat("#5b3a2a", { emissive: "#ff3b00", emissiveIntensity: 0 }));
    spiral.name = "heat";
    add(spiral);
  }

  // ⚡ terminallar (sim ulash uchun)
  for (const term of ["a", "b"] as const) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), mat(term === "a" ? "#2e8b57" : "#8b2e2e", { emissive: term === "a" ? "#1d5c38" : "#5c1d1d", emissiveIntensity: 0.25 }));
    t.position.set(term === "a" ? -0.95 : 0.95, 0.55, 0);
    t.name = `term-${term}`;
    t.userData = { kind: "terminal", term };
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.3, 10), mat("#b08d4f", { metalness: 0.75, roughness: 0.3 }));
    post.position.set(term === "a" ? -0.95 : 0.95, 0.38, 0);
    g.add(t, post);
    const hitZone = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
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
