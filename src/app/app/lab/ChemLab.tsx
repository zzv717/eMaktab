// 🧪 3D Kimyo laboratoriyasi — qo'l bilan boshqarish: quyish, aralashtirish, isitish
// Reaksiyalar tartibga bog'liq (ketma-ketlik jurnali bilan)
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { REAGENTS, REAGENT_MAP, simulate, simulateSteps, type VesselContent } from "./engine";
import { attachFrameHooks, benchTop, createScene, glassMaterial, liquidMaterial, type SceneHandle } from "./three-utils";
import { StageBox, labChip, type CatalogItem } from "./StageBox";

type VesselType = "probirka" | "kolba" | "stakan";

interface VesselObj {
  id: string;
  type: VesselType;
  contents: VesselContent[];
  temp: number;
  heatOn: boolean;
}

const VESSEL_LABEL: Record<VesselType, string> = { probirka: "🧪 Probirka", kolba: "⚗️ Kolba", stakan: "🥤 Stakan" };

function newVessel(type: VesselType, n: number): VesselObj {
  return { id: `v${n}`, type, contents: [], temp: 20, heatOn: false };
}

export default function ChemLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const vesselsRef = useRef<VesselObj[]>([]);
  const selReagentRef = useRef("hcl");
  const meshRefs = useRef<{
    vessels: Map<string, THREE.Group>;
    liquids: Map<string, THREE.Mesh>;
    bubbles: Map<string, THREE.Mesh[]>;
    precips: Map<string, THREE.Group>;
    flames: Map<string, THREE.Group>;
    bottles: Map<string, THREE.Group>;
    stream: THREE.Mesh | null;
    stir: THREE.Group | null;
    thermo: THREE.Group | null;
  } | null>(null);
  const pourAnimRef = useRef<{ until: number; vesselId: string } | null>(null);
  const selVesselRef = useRef("v1");
  const stirAnimRef = useRef<{ until: number; vesselId: string } | null>(null);

  const [vessels, setVessels] = useState<VesselObj[]>([newVessel("stakan", 1)]);
  const [selVessel, setSelVessel] = useState("v1");
  const [selReagent, setSelReagent] = useState("hcl");
  const [pourFrom, setPourFrom] = useState<string | null>(null);
  const [journal, setJournal] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const counterRef = useRef(1);

  vesselsRef.current = vessels;
  selReagentRef.current = selReagent;

  const sel = vessels.find((v) => v.id === selVessel) ?? vessels[0];
  const steps = sel ? simulateSteps(sel.contents) : null;
  const result = steps?.final ?? null;

  // ---------- 3D sahna ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 11, bg: "#e8eef4" });
    handleRef.current = handle;
    handle.scene.add(benchTop(18, 11));
    handle.controls.maxPolarAngle = Math.PI * 0.52;

    const maps = {
      vessels: new Map<string, THREE.Group>(),
      liquids: new Map<string, THREE.Mesh>(),
      bubbles: new Map<string, THREE.Mesh[]>(),
      precips: new Map<string, THREE.Group>(),
      flames: new Map<string, THREE.Group>(),
      bottles: new Map<string, THREE.Group>(),
      stream: null as THREE.Mesh | null,
      stir: null as THREE.Group | null,
      thermo: null as THREE.Group | null,
    };
    meshRefs.current = maps;

    // --- Reaktiv shishalari (orqa javon) — bosib tanlanadi
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(17, 0.28, 2.2), new THREE.MeshStandardMaterial({ color: "#5b4632", roughness: 0.8 }));
    shelf.position.set(0, 2.35, -4.2);
    handle.scene.add(shelf);
    REAGENTS.forEach((r, i) => {
      const x = -7.8 + (i % 10) * 1.72;
      const z = -3.62 + Math.floor(i / 10) * 1.15;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 1.15, 18), new THREE.MeshPhysicalMaterial({ color: "#dfeaf2", transparent: true, opacity: 0.55, transmission: 0.35, roughness: 0.18 }));
      body.position.y = 0.72;
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.72, 16), liquidMaterial(r.ionColor ?? r.color));
      liq.position.y = 0.52;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 14), new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.5 }));
      cap.position.y = 1.42;
      // yorliq (formula)
      const cv = document.createElement("canvas");
      cv.width = 128;
      cv.height = 64;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(r.formula.slice(0, 8), 64, 42);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
      label.position.set(0, 0.78, 0.37);
      g.add(body, liq, cap, label);
      g.position.set(x, 2.5, z);
      g.userData = { kind: "bottle", reagent: r.id };
      g.traverse((o) => (o.userData.pickRoot = g));
      handle.scene.add(g);
      maps.bottles.set(r.id, g);
    });

    // --- Idish yaratish
    const buildVessel = (v: VesselObj) => {
      const g = new THREE.Group();
      const glass = glassMaterial();
      if (v.type === "probirka") {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 36, 1, true), glass);
        tube.position.y = 1.75;
        const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.55, 22, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass);
        bottom.position.y = 0.12;
        g.add(tube, bottom);
      } else if (v.type === "kolba") {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14;
          pts.push(new THREE.Vector2(t < 0.55 ? 0.36 + 1.2 * Math.sin((t / 0.55) * Math.PI) * 0.92 : 0.38, t * 3.4));
        }
        g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 36), glass));
      } else {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.15, 2.3, 36, 1, true), glass);
        cup.position.y = 1.25;
        const bottom = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.08, 36), glass);
        bottom.position.y = 0.12;
        g.add(cup, bottom);
      }
      const maxR = v.type === "probirka" ? 0.5 : v.type === "kolba" ? 1.12 : 1.18;
      const maxH = v.type === "probirka" ? 3.1 : v.type === "kolba" ? 3.0 : 2.1;
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(maxR * 0.96, maxR * 0.96, maxH, 32), liquidMaterial("#e9f5ff"));
      liq.position.y = 0.15 + maxH / 2;
      liq.visible = false;
      g.add(liq);
      const precip = new THREE.Group();
      precip.visible = false;
      g.add(precip);
      const bubbles: THREE.Mesh[] = [];
      for (let i = 0; i < 12; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.055 + Math.random() * 0.07, 9, 7), new THREE.MeshStandardMaterial({ color: "#eaf6ff", transparent: true, opacity: 0.75, roughness: 0.12 }));
        b.visible = false;
        g.add(b);
        bubbles.push(b);
      }
      // spirt lampasi
      const lamp = new THREE.Group();
      const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.55, 16), new THREE.MeshStandardMaterial({ color: "#8b5e34", roughness: 0.55 }));
      lampBody.position.y = 0.28;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 12), new THREE.MeshStandardMaterial({ color: "#ff9a3c", emissive: "#ff7b00", emissiveIntensity: 1.6, transparent: true, opacity: 0.9 }));
      flame.position.y = 0.95;
      flame.visible = false;
      lamp.add(lampBody, flame);
      lamp.position.set(v.type === "probirka" ? 1.05 : 1.75, 0, 0.4);
      g.add(lamp);
      maps.vessels.set(v.id, g);
      maps.liquids.set(v.id, liq);
      maps.bubbles.set(v.id, bubbles);
      maps.precips.set(v.id, precip);
      maps.flames.set(v.id, lamp);
      g.userData = { kind: "vessel", vessel: v.id };
      g.traverse((o) => (o.userData.pickRoot = g));
      handle.scene.add(g);
    };

    const layout = () => {
      const list = vesselsRef.current;
      // o'chirilganlar
      for (const [id, g] of maps.vessels) {
        if (!list.some((v) => v.id === id)) {
          g.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
          });
          handle.scene.remove(g);
          maps.vessels.delete(id);
          maps.liquids.delete(id);
          maps.bubbles.delete(id);
          maps.precips.delete(id);
          maps.flames.delete(id);
        }
      }
      list.forEach((v, i) => {
        if (!maps.vessels.has(v.id)) buildVessel(v);
        const g = maps.vessels.get(v.id)!;
        const cols = Math.min(4, list.length);
        const x = (i - (cols - 1) / 2) * 3.6;
        g.position.set(x, 0.02, 1.1);
      });
    };
    layout();

    // quyish oqimi
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.6, 10), new THREE.MeshStandardMaterial({ color: "#bfe3ff", transparent: true, opacity: 0.8 }));
    stream.visible = false;
    handle.scene.add(stream);
    maps.stream = stream;

    // aralashtirgich tayoq
    const stir = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 10), glassMaterial("#ffffff", 0.5));
    rod.position.y = 1.3;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshStandardMaterial({ color: "#c0392b" }));
    knob.position.y = 2.62;
    stir.add(rod, knob);
    stir.visible = false;
    handle.scene.add(stir);
    maps.stir = stir;

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      ptr.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ptr, handle.camera);
      const hits = ray.intersectObjects(handle.scene.children, true);
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData?.kind) o = o.parent;
        if (!o) continue;
        if (o.userData.kind === "bottle") {
          setSelReagent(o.userData.reagent as string);
          return;
        }
        if (o.userData.kind === "vessel") {
          window.dispatchEvent(new CustomEvent("chem-vessel-tap", { detail: o.userData.vessel }));
          return;
        }
      }
    };
    canvas.addEventListener("click", onClick);

    const stop = attachFrameHooks(handle, [
      (t, dt) => {
        const list = vesselsRef.current;
        layout();
        for (const v of list) {
          const liq = maps.liquids.get(v.id);
          const res = simulate(v.contents, v.temp);
          if (liq) {
            const target = res.umumiyMl === 0 ? 0 : Math.min(1, res.umumiyMl / 160);
            const cur = liq.scale.y;
            liq.scale.y = Math.max(0.001, cur + (target - cur) * 0.14);
            liq.visible = liq.scale.y > 0.012;
            liq.position.y = 0.15 + (v.type === "probirka" ? 3.1 : v.type === "kolba" ? 3.0 : 2.1) * liq.scale.y * 0.5;
            (liq.material as THREE.MeshStandardMaterial).color.set(res.color);
            (liq.material as THREE.MeshStandardMaterial).emissive.set(res.color);
          }
          const bubbles = maps.bubbles.get(v.id) ?? [];
          const hasGas = Boolean(res.gas);
          bubbles.forEach((b, i) => {
            b.visible = hasGas;
            if (!hasGas) return;
            b.position.set(Math.sin(i * 2.1 + t) * 0.34, ((t * (0.8 + (i % 4) * 0.2) + i * 0.31) % 2.2) + 0.3, Math.cos(i * 1.7 + t) * 0.34);
          });
          const precip = maps.precips.get(v.id);
          if (precip) {
            const p = res.precipitate;
            precip.visible = Boolean(p);
            if (p && precip.children.length === 0) {
              for (let i = 0; i < 22; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.07, 7, 6), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85 }));
                const ang = Math.random() * Math.PI * 2;
                const rad = Math.random() * (v.type === "probirka" ? 0.3 : 0.8);
                s.position.set(Math.cos(ang) * rad, 0.2 + Math.random() * 0.14, Math.sin(ang) * rad);
                precip.add(s);
              }
            } else if (p) {
              precip.children.forEach((c) => ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(p.color));
            }
          }
          // spirt lampasi + bug'
          const lamp = maps.flames.get(v.id);
          if (lamp) {
            const flame = lamp.children[1] as THREE.Mesh;
            flame.visible = v.heatOn;
            if (v.heatOn) {
              flame.scale.setScalar(0.9 + Math.sin(t * 9) * 0.12);
              (flame.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + Math.sin(t * 11) * 0.35;
            }
          }
        }
        // quyish oqimi animatsiyasi
        const pour = pourAnimRef.current;
        if (maps.stream) {
          if (pour && pour.until > performance.now()) {
            const g = maps.vessels.get(pour.vesselId);
            if (g) {
              maps.stream.visible = true;
              maps.stream.position.set(g.position.x, 2.6, g.position.z);
              (maps.stream.material as THREE.MeshStandardMaterial).opacity = 0.75 + Math.sin(t * 18) * 0.15;
            }
          } else {
            maps.stream.visible = false;
            if (pour) pourAnimRef.current = null;
          }
        }
        // aralashtirish
        const stirA = stirAnimRef.current;
        if (maps.stir) {
          if (stirA && stirA.until > performance.now()) {
            const g = maps.vessels.get(stirA.vesselId);
            if (g) {
              maps.stir.visible = true;
              maps.stir.position.set(g.position.x + Math.sin(t * 10) * 0.16, 0.1, g.position.z + Math.cos(t * 10) * 0.16);
            }
          } else {
            maps.stir.visible = false;
            if (stirA) stirAnimRef.current = null;
          }
        }
        // tanlangan idish halqasi
        for (const v of list) {
          const g = maps.vessels.get(v.id);
          if (!g) continue;
          const ring = g.getObjectByName("selRing") as THREE.Mesh | undefined;
          if (v.id === selVesselRef.current) {
            if (!ring) {
              const r = new THREE.Mesh(new THREE.TorusGeometry(v.type === "probirka" ? 0.75 : 1.5, 0.055, 10, 40), new THREE.MeshStandardMaterial({ color: "#0d9488", emissive: "#0d9488", emissiveIntensity: 0.7 }));
              r.rotation.x = Math.PI / 2;
              r.position.y = 0.06;
              r.name = "selRing";
              g.add(r);
            }
          } else if (ring) g.remove(ring);
        }
      },
    ]);

    return () => {
      stop();
      canvas.removeEventListener("click", onClick);
      handle.dispose();
      handleRef.current = null;
      meshRefs.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  selVesselRef.current = selVessel;

  // idish tanlash tugmasi bosilganda ham ishlasin
  useEffect(() => {
    const onTap = (e: Event) => {
      const id = (e as CustomEvent).detail as string;
      const v = vesselsRef.current.find((x) => x.id === id);
      if (!v) return;
      if (pourFrom && pourFrom !== id) {
        doTransfer(pourFrom, id);
        setPourFrom(null);
        return;
      }
      if (selReagentRef.current) {
        doPour(id, selReagentRef.current);
      } else {
        setSelVessel(id);
      }
    };
    window.addEventListener("chem-vessel-tap", onTap);
    return () => window.removeEventListener("chem-vessel-tap", onTap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pourFrom]);

  // ---------- amallar ----------
  const pushLog = (line: string) => setJournal((j) => [line, ...j].slice(0, 40));

  const doPour = (vesselId: string, reagentId: string) => {
    if (busy) return;
    setBusy(true);
    setSelVessel(vesselId);
    pourAnimRef.current = { until: performance.now() + 750, vesselId };
    window.setTimeout(() => {
      setVessels((vs) => vs.map((v) => (v.id === vesselId ? { ...v, contents: [...v.contents, { reagentId, ml: 20 }] } : v)));
      const v = vesselsRef.current.find((x) => x.id === vesselId);
      const name = REAGENT_MAP[reagentId]?.formula ?? reagentId;
      if (v) {
        const res = simulate([...v.contents, { reagentId, ml: 20 }], v.temp);
        const last = res.hodisalar.slice(-2).map((h) => h.text);
        pushLog(`⬇ ${VESSEL_LABEL[v.type]}: ${name} quyildi${last.length ? " → " + last.join(" · ") : ""}`);
      }
      setBusy(false);
    }, 620);
  };

  const doTransfer = (fromId: string, toId: string) => {
    const from = vesselsRef.current.find((v) => v.id === fromId);
    const to = vesselsRef.current.find((v) => v.id === toId);
    if (!from || !to || from.contents.length === 0) return;
    pourAnimRef.current = { until: performance.now() + 750, vesselId: toId };
    setBusy(true);
    window.setTimeout(() => {
      setVessels((vs) =>
        vs.map((v) => {
          if (v.id === fromId) return { ...v, contents: v.contents.map((c) => ({ ...c, ml: Math.round(c.ml / 2) })).filter((c) => c.ml > 0) };
          if (v.id === toId) return { ...v, contents: [...v.contents, ...from.contents.map((c) => ({ reagentId: c.reagentId, ml: Math.round(c.ml / 2) }))].filter((c) => c.ml > 0) };
          return v;
        }),
      );
      pushLog(`🫗 ${VESSEL_LABEL[from.type]} → ${VESSEL_LABEL[to.type]} — yarimi quyildi (tartib saqlanadi!)`);
      setSelVessel(toId);
      setBusy(false);
    }, 620);
  };

  const toggleHeat = () => {
    if (!sel) return;
    setVessels((vs) => vs.map((v) => (v.id === sel.id ? { ...v, heatOn: !v.heatOn } : v)));
    pushLog(sel.heatOn ? "🔥 Spirt lampasi o'chirildi" : "🔥 Spirt lampasi yoqildi — harorat ko'tariladi");
  };

  const stirIt = () => {
    if (!sel) return;
    stirAnimRef.current = { until: performance.now() + 1400, vesselId: sel.id };
    pushLog("🥄 Aralashtirildi — moddalar to'liq aralashdi");
  };

  // harorat dinamikasi (isitish/sovish)
  useEffect(() => {
    const t = window.setInterval(() => {
      setVessels((vs) =>
        vs.map((v) => {
          const target = v.heatOn ? 85 : 20;
          const next = v.temp + (target - v.temp) * 0.045;
          return Math.abs(next - v.temp) > 0.01 ? { ...v, temp: Math.round(next * 10) / 10 } : v;
        }),
      );
    }, 900);
    return () => window.clearInterval(t);
  }, []);

  // ---------- katalog ----------
  const catalog: CatalogItem[] = [
    { id: "v:probirka", icon: "🧪", name: "Probirka", group: "Idishlar", desc: "Mayda tajribalar uchun" },
    { id: "v:kolba", icon: "⚗️", name: "Kolba", group: "Idishlar", desc: "Eritmalar aralashtirish" },
    { id: "v:stakan", icon: "🥤", name: "Ximik stakan", group: "Idishlar", desc: "Katta hajm" },
    ...REAGENTS.map((r) => ({ id: `r:${r.id}`, icon: "🧫", name: `${r.formula} — ${r.name}`, group: "Reaktivlar", desc: r.info })),
    { id: "t:heat", icon: "🔥", name: "Spirt lampasi", group: "Asboblar", desc: "Isitish (issiqda PbI₂ eriydi!)" },
    { id: "t:stir", icon: "🥄", name: "Aralashtirish", group: "Asboblar" },
    { id: "p:gold", icon: "✨", name: "Loyiha: Oltin yomg'ir", group: "Tayyor loyihalar", desc: "Pb(NO₃)₂ + KI → sariq kristallar; isitib eritib ko'ring!" },
    { id: "p:indicator", icon: "💗", name: "Loyiha: Indikatorlar", group: "Tayyor loyihalar", desc: "Fenolftalein + ishqor → pushti mo'jiza" },
    { id: "p:co2", icon: "🫧", name: "Loyiha: CO₂ aniqlash", group: "Tayyor loyihalar", desc: "Soda + kislota → ko'piklanish va ohak suti" },
    { id: "p:amfoter", icon: "🌀", name: "Loyiha: Amfoter mo'jiza", group: "Tayyor loyihalar", desc: "AlCl₃ + NaOH — cho'kma paydo bo'ladi va ERIYDI (tartibni sinang!)" },
  ];

  const handleAdd = (id: string) => {
    if (id.startsWith("v:")) {
      const type = id.slice(2) as VesselType;
      counterRef.current += 1;
      const v = newVessel(type, counterRef.current);
      setVessels((vs) => (vs.length >= 5 ? vs : [...vs, v]));
      setSelVessel(v.id);
      pushLog(`➕ Yangi idish qo'shildi: ${VESSEL_LABEL[type]}`);
    } else if (id.startsWith("r:")) {
      setSelReagent(id.slice(2));
    } else if (id === "t:heat") toggleHeat();
    else if (id === "t:stir") stirIt();
    else if (id.startsWith("p:")) {
      const presets: Record<string, VesselContent[]> = {
        gold: [
          { reagentId: "pbno32", ml: 25 },
          { reagentId: "ki", ml: 25 },
        ],
        indicator: [
          { reagentId: "fen", ml: 10 },
          { reagentId: "naoh", ml: 25 },
        ],
        co2: [
          { reagentId: "na2co3", ml: 25 },
          { reagentId: "hcl", ml: 30 },
          { reagentId: "caoh2", ml: 15 },
        ],
        amfoter: [
          { reagentId: "alcl3", ml: 25 },
          { reagentId: "naoh", ml: 20 },
          { reagentId: "naoh", ml: 25 },
        ],
      };
      const contents = presets[id.slice(2)];
      if (contents) {
        if (sel) {
          setVessels((vs) => vs.map((v) => (v.id === sel.id ? { ...v, contents: [...v.contents, ...contents] } : v)));
          const { steps: st } = simulateSteps([...sel.contents, ...contents]);
          pushLog(`📋 Loyiha yuklandi: ${st.map((x) => x.yangiHodisalar.map((h) => h.text).join(" · ")).filter(Boolean).join(" ⏩ ") || "tayyor"}`);
        }
      }
    }
  };


  return (
    <StageBox title="🧪 Kimyo — 3D laboratoriya (qo'l bilan)" catalog={catalog} onAdd={handleAdd}>
      <div className="relative">
        <canvas ref={canvasRef} className="h-[320px] w-full rounded-2xl bg-slate-100" />
        <p className="px-2 pb-1 pt-1.5 text-center text-xs text-slate-400">
          🖐 Shishani <b>bosing</b> — tanlangan reaktiv quyiladi · idishni bosib tanlang
        </p>
      </div>

      {/* Tez amallar */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setPourFrom(pourFrom ? null : sel?.id ?? null)} className={`${labChip} ${pourFrom ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700"}`}>
          🫗 Boshqa idishga quyish
        </button>
        <button onClick={stirIt} className={`${labChip} bg-slate-100 text-slate-700`}>🥄 Aralashtirish</button>
        <button onClick={toggleHeat} className={`${labChip} ${sel?.heatOn ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-600"}`}>
          {sel?.heatOn ? "🔥 O'chirish" : "🔥 Isitish"}
        </button>
        <button
          onClick={() => sel && setVessels((vs) => vs.map((v) => (v.id === sel.id ? { ...v, contents: [], heatOn: false } : v)))}
          className={`${labChip} bg-slate-100 text-slate-700`}
        >
          🧹 Tozalash
        </button>
        <button onClick={() => { setVessels([newVessel("stakan", 1)]); setSelVessel("v1"); setJournal([]); }} className={`${labChip} bg-rose-50 text-rose-600`}>
          ↺ Hammasini boshlash
        </button>
      </div>

      {pourFrom && <p className="rounded-2xl bg-amber-50 p-2.5 text-center text-sm text-amber-700">🫗 Qaysi idishga quyilsin? — idishni <b>bosing</b></p>}

      {/* Reaktiv tanlangan */}
      <div className="rounded-2xl bg-teal-50 p-3 text-sm text-teal-800">
        <b>Tanlangan reaktiv:</b> {REAGENT_MAP[selReagent]?.formula} — {REAGENT_MAP[selReagent]?.name}
        <p className="mt-0.5 text-xs text-teal-600">{REAGENT_MAP[selReagent]?.info} · quyish uchun idishni bosing</p>
      </div>

      {/* Natija */}
      {sel && result && (
        <div className="rounded-3xl bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Natija (real vaqt) — {VESSEL_LABEL[sel.type]}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-400">pH</p>
              <p className="text-lg font-bold text-slate-800">{result.ph === null ? "—" : result.ph.toFixed(1)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-400">Harorat</p>
              <p className="text-lg font-bold text-slate-800">{sel.temp}°C</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-400">Hajm</p>
              <p className="text-lg font-bold text-slate-800">{result.umumiyMl} ml</p>
            </div>
          </div>
          {result.gas && <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700">🫧 Gaz: {result.gas.name}</p>}
          {result.precipitate && <p className="mt-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">🧱 Cho'kma: {result.precipitate.name}</p>}

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">📖 Ketma-ketlik jurnali (tartib muhim!)</p>
          <div className="mt-1.5 max-h-44 space-y-1.5 overflow-y-auto">
            {steps?.steps.map((st, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 text-xs ${st.yangiHodisalar.length ? "bg-fuchsia-50 text-fuchsia-800" : "bg-slate-50 text-slate-500"}`}>
                <b>{st.afterMl} ml</b> — {REAGENT_MAP[st.reagentId]?.formula} quyildi
                {st.yangiHodisalar.map((h, j) => (
                  <p key={j} className="mt-0.5">{h.text}</p>
                ))}
              </div>
            ))}
            {result.umumiyMl === 0 && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-400">Idish bo'sh — reaktivlarni tanlab, idishni bosing.</p>}
          </div>
        </div>
      )}

      {/* Umumiy jurnal */}
      {journal.length > 0 && (
        <div className="rounded-3xl bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Amallar tarixi</p>
          <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto">
            {journal.map((l, i) => (
              <p key={i} className="rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{l}</p>
            ))}
          </div>
        </div>
      )}
    </StageBox>
  );
}
