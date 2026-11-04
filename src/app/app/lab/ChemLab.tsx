// 🧪 3D Kimyo laboratoriyasi — REAL ko'rinish: quyish animatsiyasi, siljitish, isitish, aralashtirish
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { REAGENTS, REAGENT_MAP, simulate, simulateSteps, type VesselContent , getReagent, ELEMENTS, type PourEvent } from "./engine";
import { attachFrameHooks, attachPointer, benchTop, createScene, glassMaterial, liquidMaterial, type SceneHandle } from "./three-utils";
import { CameraPad, PickCard, StageBox, labChip, type CatalogItem, type PickInfo } from "./StageBox";
import { GUIDE_CHEMISTRY } from "./Guides";

type VesselType = "probirka" | "kolba" | "stakan";

interface VesselObj {
  id: string;
  type: VesselType;
  contents: VesselContent[];
  temp: number;
  heatOn: boolean;
}

const VESSEL_LABEL: Record<VesselType, string> = { probirka: "🧪 Probirka", kolba: "⚗️ Kolba", stakan: "🥤 Ximik stakan" };

function newVessel(type: VesselType, n: number): VesselObj {
  return { id: `v${n}`, type, contents: [], temp: 20, heatOn: false };
}

export default function ChemLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const vesselsRef = useRef<VesselObj[]>([]);
  const selReagentRef = useRef("hcl");
  const moveRef = useRef<THREE.Object3D | null>(null);
  const animRef = useRef<{
    pour?: { until: number; vesselId: string; reagentColor: string };
    stir?: { until: number; vesselId: string };
    flash?: { until: number; vesselId: string };
  }>({});
  const mapsRef = useRef<{
    vessels: Map<string, THREE.Group>;
    liquids: Map<string, THREE.Mesh>;
    bubbles: Map<string, THREE.Mesh[]>;
    precips: Map<string, THREE.Group>;
    flames: Map<string, THREE.Group>;
    bottles: Map<string, THREE.Group>;
    pourBottle: THREE.Group | null;
    bottlesRoot: THREE.Group | null;
    stream: THREE.Mesh | null;
    stir: THREE.Group | null;
    heatLight: THREE.PointLight | null;
    splash: THREE.Mesh | null;
  } | null>(null);

  const [vessels, setVessels] = useState<VesselObj[]>([newVessel("stakan", 1)]);
  const [selVessel, setSelVessel] = useState("v1");
  const [selReagent, setSelReagent] = useState("hcl");
  const [pourFrom, setPourFrom] = useState<string | null>(null);
  const [journal, setJournal] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ info: PickInfo; kind: string; id: string } | null>(null);
  const [eq, setEq] = useState<string>(""); // pastdagi tenglama paneli (Na + Cl → NaCl)
  const projectTimers = useRef<number[]>([]);
  const [nearPour, setNearPour] = useState<{ bottleId: string; vesselId: string; label: string } | null>(null);
  const nearPourRef = useRef<{ bottleId: string; vesselId: string } | null>(null);
  const spawnBottleRef = useRef<((id: string) => void) | null>(null);
  const popBRef = useRef<{ obj: THREE.Object3D; t0: number }[]>([]);
  // Faqat oz miqdorda reaktivlar: bir tomonda birikmalar, bir tomonda moddalar
  const BENCH_BIRIKMALAR = ["hcl", "naoh", "cuso4", "na2co3", "agno3"];
  const BENCH_MODDALAR = ["mg", "zn", "cu"];
  const [moving, setMoving] = useState(false);
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
    const handle = createScene(canvas, { camZ: 12, bg: "#e6edf3" });
    handleRef.current = handle;
    handle.scene.add(benchTop(20, 12));
    handle.controls.maxPolarAngle = Math.PI * 0.52;

    const maps = {
      vessels: new Map<string, THREE.Group>(),
      liquids: new Map<string, THREE.Mesh>(),
      bubbles: new Map<string, THREE.Mesh[]>(),
      precips: new Map<string, THREE.Group>(),
      flames: new Map<string, THREE.Group>(),
      bottles: new Map<string, THREE.Group>(),
      pourBottle: null as THREE.Group | null,
      bottlesRoot: null as THREE.Group | null,
      stream: null as THREE.Mesh | null,
      stir: null as THREE.Group | null,
      heatLight: null as THREE.PointLight | null,
      splash: null as THREE.Mesh | null,
    };
    mapsRef.current = maps;

    // --- Reaktiv shishalari (2 qatlamli javon) — bosiladi/tanlanadi/siljitiladi
    for (const row of [0, 1]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(19, 0.24, 1.6), new THREE.MeshStandardMaterial({ color: "#5b4632", roughness: 0.8 }));
      shelf.position.set(0, 2.2 + row * 1.65, -4.6 - row * 1.35);
      handle.scene.add(shelf);
    }
    const makeBottle = (r: (typeof REAGENTS)[number]) => {
      const g = new THREE.Group();
      // shisha shakli (yelka + bo'yin)
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const rad = t < 0.62 ? 0.36 : t < 0.82 ? 0.36 - (t - 0.62) * 1.6 : 0.16;
        pts.push(new THREE.Vector2(Math.max(0.15, rad), t * 1.5));
      }
      const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 26), glassMaterial("#dfeaf2", 0.5));
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.325, 0.85, 20), liquidMaterial(r.ionColor ?? r.color));
      liq.position.y = 0.52;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.2, 0.26, 16), new THREE.MeshStandardMaterial({ color: "#273449", roughness: 0.42, metalness: 0.25 }));
      cap.position.y = 1.6;
      const cv = document.createElement("canvas");
      cv.width = 128;
      cv.height = 64;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 25px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(r.formula.slice(0, 9), 64, 30);
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText(r.name.split(" ").slice(0, 2).join(" ").slice(0, 18), 64, 50);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.33), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
      label.position.set(0, 0.72, 0.335);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 1.52, 0);
      mouth.name = "mouth";
      cap.name = "cap";
      g.add(body, liq, cap, label, mouth);
      g.userData = { kind: "bottle", id: r.id, label: `${r.formula} — ${r.name}`, icon: "🧫", desc: r.info };
      g.traverse((o) => {
        o.userData.pickRoot = g;
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
      });
      return g;
    };
    // 🧪 Stol: chapda BIRIKMALAR, o'ngda MODDALAR — faqat oz miqdorda!
    const putSide = (ids: string[], x0: number, title: string) => {
      ids.forEach((id, i) => {
        const r = REAGENTS.find((x) => x.id === id);
        if (!r) return;
        const g = makeBottle(r);
        g.position.set(x0 + i * 1.62, 2.32, -4.35);
        handle.scene.add(g);
        maps.bottles.set(r.id, g);
      });
      // tomalar ustidagi yozuv
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 64;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, 128, 42);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
      sign.position.set(x0 + ((ids.length - 1) * 1.62) / 2, 4.35, -4.35);
      handle.scene.add(sign);
    };
    putSide(BENCH_BIRIKMALAR, -8.3, "⚗️ BIRIKMALAR");
    putSide(BENCH_MODDALAR, 3.1, "🧫 MODDALAR");

    // ➕ Shisha qo'shish — stolga "sakrab" tushadi (to'g'ridan-to'g'ri quyilmaydi!)
    const bottlesRoot = new THREE.Group();
    handle.scene.add(bottlesRoot);
    for (const g of Array.from(maps.bottles.values())) bottlesRoot.add(g);
    spawnBottleRef.current = (reagentId: string) => {
      const r = getReagent(reagentId);
      if (!r) return;
      const g = makeBottle(r);
      const n = bottlesRoot.children.length;
      // ish stolining O'ZIDA (javonda emas) — darhol ushlab olinadi
      g.position.set(-7 + (n % 6) * 2.7, 0.02, 2.7 + Math.floor(n / 6) * 1.7);
      g.scale.setScalar(0.01);
      bottlesRoot.add(g);
      popBRef.current.push({ obj: g, t0: performance.now() / 1000 });
    };
    maps.bottlesRoot = bottlesRoot;

    // --- Idish yaratish
    const buildVessel = (v: VesselObj) => {
      const g = new THREE.Group();
      const glass = glassMaterial();
      if (v.type === "probirka") {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 40, 1, true), glass);
        tube.position.y = 1.75;
        const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass);
        bottom.position.y = 0.12;
        g.add(tube, bottom);
      } else if (v.type === "kolba") {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          pts.push(new THREE.Vector2(t < 0.55 ? 0.36 + 1.18 * Math.sin((t / 0.55) * Math.PI) * 0.92 : 0.38, t * 3.4));
        }
        g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 42), glass));
      } else {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.16, 2.3, 44, 1, true), glass);
        cup.position.y = 1.25;
        const bottom = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.08, 44), glass);
        bottom.position.y = 0.12;
        // yopiladigan qirra
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.06, 10, 44), glass);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 2.4;
        g.add(cup, bottom, rim);
      }
      const maxR = v.type === "probirka" ? 0.5 : v.type === "kolba" ? 1.12 : 1.2;
      const maxH = v.type === "probirka" ? 3.1 : v.type === "kolba" ? 3.0 : 2.12;
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(maxR * 0.96, maxR * 0.96, maxH, 36), liquidMaterial("#e9f5ff"));
      liq.position.y = 0.15 + maxH / 2;
      liq.visible = false;
      g.add(liq);
      const precip = new THREE.Group();
      precip.visible = false;
      g.add(precip);
      const bubbles: THREE.Mesh[] = [];
      for (let i = 0; i < 12; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.055 + Math.random() * 0.07, 10, 8), new THREE.MeshStandardMaterial({ color: "#eaf6ff", transparent: true, opacity: 0.78, roughness: 0.12 }));
        b.visible = false;
        g.add(b);
        bubbles.push(b);
      }
      // spirt lampasi
      const lamp = new THREE.Group();
      const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.58, 18), new THREE.MeshStandardMaterial({ color: "#8b5e34", roughness: 0.5 }));
      lampBody.position.y = 0.3;
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8), new THREE.MeshStandardMaterial({ color: "#2b2118" }));
      wick.position.y = 0.64;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.72, 14), new THREE.MeshStandardMaterial({ color: "#ff9a3c", emissive: "#ff7b00", emissiveIntensity: 1.8, transparent: true, opacity: 0.92 }));
      flame.position.y = 1.12;
      flame.visible = false;
      lamp.add(lampBody, wick, flame);
      lamp.position.set(v.type === "probirka" ? 1.1 : 1.85, 0, 0.5);
      lamp.userData = { kind: "lamp", id: v.id, label: "🔥 Spirt lampasi", icon: "🔥", desc: "Bosib yoqing/o'chiring" };
      lamp.traverse((o) => (o.userData.pickRoot = lamp));
      g.add(lamp);
      maps.vessels.set(v.id, g);
      maps.liquids.set(v.id, liq);
      maps.bubbles.set(v.id, bubbles);
      maps.precips.set(v.id, precip);
      maps.flames.set(v.id, lamp);
      g.userData = { kind: "vessel", id: v.id, label: `${VESSEL_LABEL[v.type]}`, icon: "🧪", desc: "Bosib reaktiv quying" };
      g.traverse((o) => {
        o.userData.pickRoot = g;
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
      });
      handle.scene.add(g);
    };

    const layout = () => {
      const list = vesselsRef.current;
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
        // faqat BIRINCHI marta joylash — keyin foydalanuvchi siljitadi
        if (!g.userData.placed) {
          const cols = Math.min(4, list.length);
          g.position.set((i - (cols - 1) / 2) * 3.7, 0.02, 1.2);
          g.userData.placed = true;
        }
      });
    };
    layout();

    // quyish animatsiyasi uchun shisha nusxa + oqim + sachrash
    const pourBottle = makeBottle(REAGENTS[0]);
    pourBottle.visible = false;
    handle.scene.add(pourBottle);
    maps.pourBottle = pourBottle;
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 1.7, 12), new THREE.MeshStandardMaterial({ color: "#bfe3ff", transparent: true, opacity: 0.85 }));
    stream.visible = false;
    handle.scene.add(stream);
    maps.stream = stream;
    const splash = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 26), new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.5 }));
    splash.rotation.x = Math.PI / 2;
    splash.visible = false;
    handle.scene.add(splash);
    maps.splash = splash;

    // aralashtirgich
    const stir = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.7, 10), glassMaterial("#ffffff", 0.5));
    rod.position.y = 1.35;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.4 }));
    knob.position.y = 2.72;
    stir.add(rod, knob);
    stir.visible = false;
    handle.scene.add(stir);
    maps.stir = stir;

    // isitilayotgan idish ostidagi issiqlik yog'dusi
    const heatLight = new THREE.PointLight(0xff7b2e, 0, 7, 2);
    heatLight.position.set(0, 1, 1);
    handle.scene.add(heatLight);
    maps.heatLight = heatLight;

    // bosish/siljitish
    const detachPointer = attachPointer(handle, canvas, {
      getRoots: () => [...maps.vessels.values(), ...(maps.bottlesRoot?.children ?? [])],
      moveRef,
      onPick: (root) => {
        const ud = root.userData as { kind: string; id: string; label: string; icon: string; desc?: string };
        if (ud.kind === "bottle") {
          setSelReagent(ud.id);
          setPick({ info: { icon: ud.icon, label: ud.label, desc: ud.desc }, kind: "bottle", id: ud.id });
        } else if (ud.kind === "vessel") {
          window.dispatchEvent(new CustomEvent("chem-vessel-tap", { detail: ud.id }));
          const v = vesselsRef.current.find((x) => x.id === ud.id);
          setPick({
            info: { icon: "🧪", label: ud.label, desc: v && v.contents.length ? `${simulate(v.contents, v.temp).umumiyMl} ml · ${v.temp}°C` : "Bo'sh idish — reaktiv tanlab bosing" },
            kind: "vessel",
            id: ud.id,
          });
        } else if (ud.kind === "lamp") {
          window.dispatchEvent(new CustomEvent("chem-lamp-tap", { detail: ud.id }));
          setPick({ info: { icon: "🔥", label: "Spirt lampasi", desc: "Isitishni yoqadi/o'chiradi" }, kind: "lamp", id: ud.id });
        }
      },
    });

    const stop = attachFrameHooks(handle, [
      (t, dt) => {
        const list = vesselsRef.current;
        layout();
        const pour = animRef.current.pour;
        for (const v of list) {
          const liq = maps.liquids.get(v.id);
          const res = simulate(v.contents, v.temp);
          if (liq) {
            const target = res.umumiyMl === 0 ? 0 : Math.min(1, res.umumiyMl / 170);
            liq.scale.y = Math.max(0.001, liq.scale.y + (target - liq.scale.y) * 0.14);
            liq.visible = liq.scale.y > 0.012;
            liq.position.y = 0.15 + (v.type === "probirka" ? 3.1 : v.type === "kolba" ? 3.0 : 2.12) * liq.scale.y * 0.5;
            const mat = liq.material as THREE.MeshStandardMaterial;
            mat.color.set(res.color);
            mat.emissive.set(res.color);
          }
          const bubbles = maps.bubbles.get(v.id) ?? [];
          const hasGas = Boolean(res.gas);
          bubbles.forEach((b, i) => {
            b.visible = hasGas;
            if (!hasGas) return;
            b.position.set(Math.sin(i * 2.1 + t) * 0.34, ((t * (0.85 + (i % 4) * 0.2) + i * 0.31) % 2.2) + 0.3, Math.cos(i * 1.7 + t) * 0.34);
          });
          const precip = maps.precips.get(v.id);
          if (precip) {
            const p = res.precipitate;
            precip.visible = Boolean(p);
            if (p && precip.children.length === 0) {
              for (let i = 0; i < 24; i++) {
                const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.075, 8, 6), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85 }));
                const ang = Math.random() * Math.PI * 2;
                const rad = Math.random() * (v.type === "probirka" ? 0.3 : 0.82);
                sp.position.set(Math.cos(ang) * rad, 0.2 + Math.random() * 0.14, Math.sin(ang) * rad);
                precip.add(sp);
              }
            } else if (p) {
              precip.children.forEach((c) => ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(p.color));
            }
          }
          const lamp = maps.flames.get(v.id);
          if (lamp) {
            const flame = lamp.children[2] as THREE.Mesh;
            flame.visible = v.heatOn;
            if (v.heatOn) {
              flame.scale.set(0.9 + Math.sin(t * 9) * 0.12, 1 + Math.sin(t * 13) * 0.16, 0.9 + Math.cos(t * 8) * 0.12);
              (flame.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(t * 11) * 0.4;
            }
          }
        }
        // isitish yog'dusi — faqat bitta idishni kuzatadi
        const heated = list.find((v) => v.heatOn);
        if (maps.heatLight) {
          if (heated) {
            const g = maps.vessels.get(heated.id);
            if (g) {
              maps.heatLight.visible = true;
              maps.heatLight.position.set(g.position.x + 1.2, 1.4, g.position.z + 0.5);
              maps.heatLight.intensity = 2.1 + Math.sin(t * 10) * 0.5;
            }
          } else maps.heatLight.visible = false;
        }
        // quyish animatsiyasi: shisha yuqorida qiyshayadi + oqim + sachrash
        if (maps.pourBottle && maps.stream && maps.splash) {
          if (pour && pour.until > performance.now()) {
            const g = maps.vessels.get(pour.vesselId);
            const life = (pour.until - performance.now()) / 900;
            if (g) {
              maps.pourBottle.visible = true;
              const targetPos = new THREE.Vector3(g.position.x + 1.05, 3.25, g.position.z + 0.15);
              maps.pourBottle.position.lerp(targetPos, Math.min(1, dt * 7));
              const tilt = Math.min(1, (1 - life) * 2.2);
              // OG'IZ tomonga qiyshaydi (idish tomonda) — orqa tomonidan emas!
              maps.pourBottle.rotation.z = tilt * 1.25;
              const liqMat = maps.pourBottle.children[1] as THREE.Mesh;
              const rg = getReagent(pour.reagentColor);
              if (rg) {
                (liqMat.material as THREE.MeshStandardMaterial).color.set(rg.ionColor ?? rg.color);
              }
              // qopqoq ochiladi
              const capM = maps.pourBottle.getObjectByName("cap") as THREE.Mesh | undefined;
              if (capM) {
                capM.position.y = 1.6 + tilt * 0.75;
                capM.rotation.x = tilt * 1.35;
              }
              // oqim OG'IZDAN tushadi
              const mouthObj = maps.pourBottle.getObjectByName("mouth");
              const mouthPos = new THREE.Vector3();
              if (mouthObj) mouthObj.getWorldPosition(mouthPos);
              else mouthPos.copy(maps.pourBottle.position);
              maps.stream.visible = life < 0.75;
              maps.stream.position.set(mouthPos.x - 0.1, mouthPos.y - 1.05, mouthPos.z);
              (maps.stream.material as THREE.MeshStandardMaterial).opacity = 0.7 + Math.sin(t * 20) * 0.2;
              maps.splash.visible = maps.stream.visible;
              maps.splash.position.set(g.position.x + 0.15, 1.15, g.position.z + 0.15);
              maps.splash.scale.setScalar(0.7 + Math.sin(t * 14) * 0.3);
            }
          } else {
            maps.pourBottle.visible = false;
            maps.stream.visible = false;
            maps.splash.visible = false;
            const capM = maps.pourBottle?.getObjectByName("cap") as THREE.Mesh | undefined;
            if (capM) {
              capM.position.y = 1.6;
              capM.rotation.x = 0;
            }
            if (pour) animRef.current.pour = undefined;
          }
        }
        // shisha pop-in
        popBRef.current = popBRef.current.filter((pp) => {
          const k = Math.min(1, (t - pp.t0) / 0.5);
          const e = 1 + Math.sin(k * Math.PI) * 0.12;
          pp.obj.scale.setScalar(k * e);
          return k < 1;
        });
        // 🟢 YAQINLIK — shisha idishga YAQIN keltirilsa "Quyish" tugmasi chiqadi
        const br = maps.bottlesRoot;
        if (br) {
          let found: { bottleId: string; vesselId: string } | null = null;
          for (const b of br.children) {
            for (const [vid, vg] of maps.vessels) {
              const dx = b.position.x - vg.position.x;
              const dz = b.position.z - vg.position.z;
              if (Math.sqrt(dx * dx + dz * dz) < 3.1) {
                found = { bottleId: b.userData.id as string, vesselId: vid };
                break;
              }
            }
            if (found) break;
          }
          const prev = nearPourRef.current;
          if ((found?.bottleId ?? null) !== (prev?.bottleId ?? null) || (found?.vesselId ?? null) !== (prev?.vesselId ?? null)) {
            nearPourRef.current = found;
            if (found) {
              const r = getReagent(found.bottleId);
              setNearPour({ ...found, label: `${r?.formula ?? found.bottleId}` });
            } else setNearPour(null);
          }
        }
        // aralashtirish
        const stirA = animRef.current.stir;
        if (maps.stir) {
          if (stirA && stirA.until > performance.now()) {
            const g = maps.vessels.get(stirA.vesselId);
            if (g) {
              maps.stir.visible = true;
              maps.stir.position.set(g.position.x + Math.sin(t * 9) * 0.17, 0.1, g.position.z + Math.cos(t * 9) * 0.17);
            }
          } else {
            maps.stir.visible = false;
            if (stirA) animRef.current.stir = undefined;
          }
        }
        // tanlangan idish halqasi
        for (const v of list) {
          const g = maps.vessels.get(v.id);
          if (!g) continue;
          let ring = g.getObjectByName("selRing") as THREE.Mesh | undefined;
          if (v.id === selVesselRef.current) {
            if (!ring) {
              ring = new THREE.Mesh(new THREE.TorusGeometry(v.type === "probirka" ? 0.78 : 1.55, 0.06, 10, 44), new THREE.MeshStandardMaterial({ color: "#0d9488", emissive: "#0d9488", emissiveIntensity: 0.85 }));
              ring.rotation.x = Math.PI / 2;
              ring.position.y = 0.07;
              ring.name = "selRing";
              g.add(ring);
            } else ring.rotation.z = t * 0.8;
          } else if (ring) g.remove(ring);
        }
      },
    ]);

    return () => {
      stop();
      detachPointer();
      handle.dispose();
      handleRef.current = null;
      mapsRef.current = null;
      spawnBottleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selVesselRef = useRef(selVessel);
  selVesselRef.current = selVessel;

  // 3D bosishlar (idish/lampa)
  useEffect(() => {
    const onVessel = (e: Event) => {
      const id = (e as CustomEvent).detail as string;
      const v = vesselsRef.current.find((x) => x.id === id);
      if (!v) return;
      if (pourFrom && pourFrom !== id) {
        doTransfer(pourFrom, id);
        setPourFrom(null);
        return;
      }
      doPour(id, selReagentRef.current);
    };
    const onLamp = (e: Event) => {
      const id = (e as CustomEvent).detail as string;
      setVessels((vs) => vs.map((v) => (v.id === id ? { ...v, heatOn: !v.heatOn } : v)));
    };
    window.addEventListener("chem-vessel-tap", onVessel);
    window.addEventListener("chem-lamp-tap", onLamp);
    return () => {
      window.removeEventListener("chem-vessel-tap", onVessel);
      window.removeEventListener("chem-lamp-tap", onLamp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pourFrom]);

  // ---------- amallar ----------
  const pushLog = (line: string) => setJournal((j) => [line, ...j].slice(0, 40));

  const doPour = (vesselId: string, reagentId: string) => {
    if (busy) return;
    setBusy(true);
    setSelVessel(vesselId);
    animRef.current.pour = { until: performance.now() + 950, vesselId, reagentColor: reagentId };
    window.setTimeout(() => {
      setVessels((vs) => vs.map((v) => (v.id === vesselId ? { ...v, contents: [...v.contents, { reagentId, ml: 20 }] } : v)));
      const v = vesselsRef.current.find((x) => x.id === vesselId);
      const name = getReagent(reagentId)?.formula ?? reagentId;
      if (v) {
        const res = simulate([...v.contents, { reagentId, ml: 20 }], v.temp);
        const last = res.hodisalar.slice(-2).map((h) => h.text);
        const withEq = [...res.hodisalar].reverse().find((h) => h.equation);
        if (withEq?.equation) setEq(withEq.equation);
        pushLog(`⬇ Quyildi: ${name} → ${VESSEL_LABEL[v.type]}${last.length ? " — " + last.join(" · ") : ""}`);
      }
      setBusy(false);
    }, 880);
  };

  const doTransfer = (fromId: string, toId: string) => {
    const from = vesselsRef.current.find((v) => v.id === fromId);
    const to = vesselsRef.current.find((v) => v.id === toId);
    if (!from || !to || from.contents.length === 0) return;
    animRef.current.pour = { until: performance.now() + 950, vesselId: toId, reagentColor: from.contents[from.contents.length - 1].reagentId };
    setBusy(true);
    window.setTimeout(() => {
      setVessels((vs) =>
        vs.map((v) => {
          if (v.id === fromId) return { ...v, contents: v.contents.map((c) => ({ ...c, ml: Math.round(c.ml / 2) })).filter((c) => c.ml > 0) };
          if (v.id === toId) return { ...v, contents: [...v.contents, ...from.contents.map((c) => ({ reagentId: c.reagentId, ml: Math.round(c.ml / 2) }))].filter((c) => c.ml > 0) };
          return v;
        }),
      );
      pushLog(`🫗 Idishdan idishga quyildi — ketma-ketlik SAQLANDI`);
      setSelVessel(toId);
      setBusy(false);
    }, 880);
  };

  const toggleHeat = (id?: string) => {
    const vid = id ?? sel?.id;
    if (!vid) return;
    setVessels((vs) => vs.map((v) => (v.id === vid ? { ...v, heatOn: !v.heatOn } : v)));
  };

  const stirIt = () => {
    if (!sel) return;
    animRef.current.stir = { until: performance.now() + 1500, vesselId: sel.id };
    // 🥄 Aralashtirish — reaksiya natijasini (tenglama) ham ko'rsatadi
    const res = simulate(sel.contents, sel.temp);
    const withEq = [...res.hodisalar].reverse().find((h) => h.equation);
    if (withEq?.equation) setEq(withEq.equation);
    const last = res.hodisalar.slice(-1).map((h) => h.text);
    pushLog(`🥄 Aralashtirildi — moddalar to'liq aralashdi${last.length ? " — " + last.join(" · ") : ""}`);
  };

  useEffect(() => {
    const t = window.setInterval(() => {
      setVessels((vs) =>
        vs.map((v) => {
          const target = v.heatOn ? 85 : 20;
          const next = v.temp + (target - v.temp) * 0.05;
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
    ...BENCH_BIRIKMALAR.map((id) => {
      const r = REAGENTS.find((x) => x.id === id)!;
      return { id: `r:${r.id}`, icon: "⚗️", name: `${r.formula} — ${r.name}`, group: "Birikmalar", desc: r.info };
    }),
    // 🧬 Moddalar — 118 elementning HAMMASI (Mendeleyev jadvali, qidiruv bilan)
    ...ELEMENTS.map((e) => ({
      id: `e:${e.id}`,
      icon: e.cat === "metall" ? "🪙" : e.cat === "nobil" ? "💨" : e.cat === "yarim" ? "💠" : "🧫",
      name: `${e.symbol} — ${e.name}`,
      group: "Moddalar (118 element)",
      desc: `#${e.num} · ${e.info}`,
    })),
    { id: "t:stir", icon: "🥄", name: "Aralashtirish", group: "Asboblar" },
    { id: "p:gold", icon: "✨", name: "Loyiha: Oltin yomg'ir", group: "Tayyor loyihalar", desc: "Pb(NO₃)₂ + KI → sariq kristallar; isitib eritib ko'ring!" },
    { id: "p:clock", icon: "⏱", name: "Loyiha: Soat reaksiyasi", group: "Tayyor loyihalar", desc: "Tiosulfat + kislota — bir necha soniya KUTING, loyqalanadi!" },
    { id: "p:kmno4", icon: "🟣", name: "Loyiha: Rangsizlanish", group: "Tayyor loyihalar", desc: "KMnO₄ + H₂O₂ — binafsha yo'qoladi, O₂ pufakchalari!" },
    { id: "p:indicator", icon: "💗", name: "Loyiha: Indikatorlar", group: "Tayyor loyihalar", desc: "Fenolftalein + ishqor → pushti mo'jiza" },
    { id: "p:co2", icon: "🫧", name: "Loyiha: CO₂ aniqlash", group: "Tayyor loyihalar", desc: "Soda + kislota → ko'piklanish va ohak suti" },
    { id: "p:amfoter", icon: "🌀", name: "Loyiha: Amfoter mo'jiza", group: "Tayyor loyihalar", desc: "AlCl₃ + NaOH — tartibni sinang!" },
    { id: "p:iron", icon: "🟢", name: "Loyiha: Temir cho'kmasi", group: "Tayyor loyihalar", desc: "FeSO₄ + NaOH → yashil cho'kma" },
    { id: "t:clear", icon: "🧹", name: "Tanlangan idishni tozalash", group: "Boshqaruv" },
    { id: "t:reset", icon: "↺", name: "Hammasini boshlash", group: "Boshqaruv" },
  ];

  const handleAdd = (id: string) => {
    if (id.startsWith("v:")) {
      const type = id.slice(2) as VesselType;
      counterRef.current += 1;
      const v = newVessel(type, counterRef.current);
      setVessels((vs) => (vs.length >= 5 ? vs : [...vs, v]));
      setSelVessel(v.id);
      pushLog(`➕ Yangi idish qo'shildi: ${VESSEL_LABEL[type]}`);
    } else if (id.startsWith("r:") || id.startsWith("e:")) {
      // ➕ Stolga shisha tushadi — keyin idishga YAQIN olib boriladi va "Quyish" chiqadi
      spawnBottleRef.current?.(id.slice(2));
      const r = getReagent(id.slice(2));
      pushLog(`➕ Stolga qo'shildi: ${r?.formula ?? id} — shishani ushlab, idishga YAQIN olib boring!`);
    } else if (id === "t:stir") stirIt();
    else if (id === "t:clear") {
      if (sel) setVessels((vs) => vs.map((v) => (v.id === sel.id ? { ...v, contents: [], heatOn: false } : v)));
    } else if (id === "t:reset") {
      setVessels([newVessel("stakan", 1)]);
      setSelVessel("v1");
      setJournal([]);
    } else if (id.startsWith("p:")) {
      const presets: Record<string, VesselContent[]> = {
        gold: [{ reagentId: "pbno32", ml: 25 }, { reagentId: "ki", ml: 25 }],
        clock: [{ reagentId: "na2s2o3", ml: 30 }, { reagentId: "hcl", ml: 20 }],
        kmno4: [{ reagentId: "kmno4", ml: 25 }, { reagentId: "h2o2", ml: 25 }],
        indicator: [{ reagentId: "fen", ml: 10 }, { reagentId: "naoh", ml: 25 }],
        co2: [{ reagentId: "na2co3", ml: 25 }, { reagentId: "hcl", ml: 30 }, { reagentId: "caoh2", ml: 15 }],
        amfoter: [{ reagentId: "alcl3", ml: 25 }, { reagentId: "naoh", ml: 20 }, { reagentId: "naoh", ml: 25 }],
        iron: [{ reagentId: "feso4", ml: 25 }, { reagentId: "naoh", ml: 25 }],
      };
      const contents = presets[id.slice(2)];
      if (contents && sel) {
        // 🐢 Birdan paydo bo'lish EMAS — bosqichma-bosqich, sekin qo'shiladi
        projectTimers.current.forEach((t) => window.clearTimeout(t));
        projectTimers.current = [];
        const targetId = sel.id;
        pushLog(`📋 Loyiha boshlandi — bosqichma-bosqich qo'shiladi (kuting)...`);
        contents.forEach((c, idx) => {
          const timer = window.setTimeout(() => {
            setVessels((vs) => vs.map((v) => (v.id === targetId ? { ...v, contents: [...v.contents, c] } : v)));
            const v = vesselsRef.current.find((x) => x.id === targetId);
            if (v) {
              const res = simulate([...v.contents, c], v.temp);
              const withEq = [...res.hodisalar].reverse().find((h) => h.equation);
              if (withEq?.equation) setEq(withEq.equation);
              const last = res.hodisalar.slice(-1).map((h) => h.text);
              pushLog(`📋 Bosqich ${idx + 1}/${contents.length}: ${getReagent(c.reagentId)?.formula ?? c.reagentId} qo'shildi${last.length ? " — " + last.join(" · ") : ""}`);
            }
            if (idx === contents.length - 1) pushLog(`✅ Loyiha yakunlandi — natija pastdagi tenglamada!`);
          }, 950 * (idx + 1));
          projectTimers.current.push(timer);
        });
      }
    }
  };

  return (
    <StageBox
      title="🧪 Kimyo — 3D laboratoriya (real)"
      catalog={catalog}
      onAdd={handleAdd}
      guide={GUIDE_CHEMISTRY}
      toolbar={
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPourFrom(pourFrom ? null : sel?.id ?? null)} className={`${labChip} ${pourFrom ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700"}`}>
            🫗 Boshqa idishga quyish
          </button>
          <button onClick={stirIt} className={`${labChip} bg-slate-100 text-slate-700`}>🥄 Aralashtirish</button>
          <button onClick={() => toggleHeat()} className={`${labChip} ${sel?.heatOn ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-600"}`}>
            {sel?.heatOn ? "🔥 O'chirish" : "🔥 Isitish"}
          </button>
          <button onClick={() => sel && setVessels((vs) => vs.map((v) => (v.id === sel.id ? { ...v, contents: [], heatOn: false } : v)))} className={`${labChip} bg-slate-100 text-slate-700`}>
            🧹 Tozalash
          </button>
        </div>
      }
    >
      <div className="relative">
        <canvas ref={canvasRef} className="lab-canvas h-[320px] w-full rounded-2xl bg-slate-100" />
        <CameraPad handleRef={handleRef} />
        <PickCard
          info={pick?.info ?? null}
          moving={moving}
          onMove={() => {
            if (!pick) return;
            const root = mapsRef.current?.vessels.get(pick.id) ?? mapsRef.current?.bottles.get(pick.id);
            if (root) {
              moveRef.current = moving ? null : root;
              setMoving(!moving);
            }
          }}
          onClose={() => {
            setPick(null);
            moveRef.current = null;
            setMoving(false);
          }}
        />
        <p className="px-2 pb-1 pt-2 text-center text-xs text-slate-400">
          🖐 Narsani <b>bosing</b> — nomi chiqadi · <b>🔀 Siljitish</b> bilan joyini o'zgartiring · 🎮 joystik bilan atrofni ko'ring
        </p>
      </div>

      {moving && <p className="rounded-2xl bg-amber-50 p-2.5 text-center text-sm text-amber-700">🔀 Siljitish rejimi — obyektni <b>sudrab</b> ish stolining istalgan joyiga qo'ying</p>}
      {nearPour && (
        <button
          onClick={() => {
            doPour(nearPour.vesselId, nearPour.bottleId);
            setNearPour(null);
            nearPourRef.current = null;
          }}
          className="mt-2 w-full rounded-2xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg active:scale-[0.98]"
        >
          🫗 Quyish — {nearPour.label} shishasidan idishga
        </button>
      )}
      {eq && (
        <div className="mt-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-center shadow-inner">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">⚗️ Natija</p>
          <p className="mt-0.5 text-sm font-semibold text-teal-300">{eq}</p>
        </div>
      )}
      {pourFrom && <p className="rounded-2xl bg-amber-50 p-2.5 text-center text-sm text-amber-700">🫗 Qaysi idishga quyilsin? — idishni <b>bosing</b></p>}

      <div className="rounded-2xl bg-teal-50 p-3 text-sm text-teal-800">
        <b>Tanlangan reaktiv:</b> {REAGENT_MAP[selReagent]?.formula} — {REAGENT_MAP[selReagent]?.name}
        <p className="mt-0.5 text-xs text-teal-600">{REAGENT_MAP[selReagent]?.info}</p>
      </div>

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

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">📖 Ketma-ketlik jurnali</p>
          <div className="mt-1.5 max-h-44 space-y-1.5 overflow-y-auto">
            {steps?.steps.map((st, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 text-xs ${st.yangiHodisalar.length ? "bg-fuchsia-50 text-fuchsia-800" : "bg-slate-50 text-slate-500"}`}>
                <b>{st.afterMl} ml</b> — {REAGENT_MAP[st.reagentId]?.formula} quyildi
                {st.yangiHodisalar.map((h, j) => (
                  <p key={j} className="mt-0.5">{h.text}</p>
                ))}
              </div>
            ))}
            {result.umumiyMl === 0 && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-400">Idish bo'sh — reaktiv tanlab, idishni bosing.</p>}
          </div>
        </div>
      )}

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
