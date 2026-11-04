// 🧫 Namuna tayyorlash va mikroskop — simulyator oqimi (hammasi bitta sahnada!)
// Tanlanadi → stolga tushadi → anjom YAQIN keltiriladi → tugma chiqadi → animatsiya →
// oynacha → mikroskop → kamera ko'zga → ko'rish SAHNA ICHIDA
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { attachFrameHooks, attachPointer, benchTop, createScene, glassMaterial, type SceneHandle } from "./three-utils";
import { CameraPad, PickCard, StageBox, labChip, type CatalogItem, type PickInfo } from "./StageBox";
import { SPECIMENS, type Specimen } from "./engine";
import { GUIDE_BIOLOGY } from "./Guides";
import { drawSpecimen } from "./SpecimenView";

type PrepMode = "cut" | "smear" | "scrape" | "pipette";

// 🌍 REAL HAYOT: qattiq namuna → skalpel; qon → surtma; tili → surish;
// YOG', suyuqlik, shilliqlar → PIPETKA bilan namuna olinadi!
const prepMode = (s: Specimen | null): PrepMode =>
  !s
    ? "cut"
    : s.texture === "blood"
      ? "smear"
      : s.texture === "cheek"
        ? "scrape"
        : s.texture === "fat" || s.texture === "bacteria" || s.texture === "fungi"
          ? "pipette"
          : "cut";

const ACTION_LABEL: Record<PrepMode, string> = {
  cut: "🔪 Skalpel bilan kesish",
  smear: "🩸 Surtma tayyorlash",
  scrape: "👄 Surib olish",
  pipette: "💧 Pipetka bilan namuna olish",
};

const EYE_POS = new THREE.Vector3(3.68, 4.35, -0.42); // mikroskop ko'zi (world)

export default function PrepLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const [specimen, setSpecimen] = useState<Specimen | null>(null);
  // 0 tanlash · 1 namuna stolda · 2 kesilgan · 3 bo'yalgan · 4 oynachada · 5 mikroskopda · 6 ko'rish
  const [stage, setStage] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [pickInfo, setPickInfo] = useState<PickInfo | null>(null);
  const [moving, setMoving] = useState(false);
  const moveRef = useRef<THREE.Object3D | null>(null);
  const cutAnimRef = useRef<{ t0: number; mode: PrepMode } | null>(null);
  const stainAnimRef = useRef<{ t0: number } | null>(null);
  const transferRef = useRef<{ t0: number; kind: "toSlide" | "toMicro" } | null>(null);
  const flyRef = useRef<{ t0: number; from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null>(null);
  const popRef = useRef<{ obj: THREE.Object3D; t0: number }[]>([]);
  const knifeRef = useRef<THREE.Group | null>(null);
  const sliceRef = useRef<THREE.Group | null>(null);
  const sampleRef = useRef<THREE.Mesh | null>(null);
  const coverRef = useRef<THREE.Group | null>(null);
  const specGroupRef = useRef<THREE.Group | null>(null);
  const slideRef = useRef<THREE.Object3D | null>(null);
  const microRef = useRef<THREE.Group | null>(null);
  const dropRef = useRef<THREE.Mesh | null>(null);
  const viewPlaneRef = useRef<THREE.Mesh | null>(null);
  const stateRef = useRef({ stage: 0, mode: "cut" as PrepMode });
  // yaqinlik holati (frame hook → React, faqat O'ZGARGANDA)
  const [near, setNear] = useState({ knife: false, stain: false, slideSpec: false, slideMicro: false, atEye: false });
  const nearRef = useRef({ knife: false, stain: false, slideSpec: false, slideMicro: false });
  // ko'rish rejimi sozlamalari
  const [objective, setObjective] = useState(4); // 4× / 10× / 40× / 100× (ob'yektivlar)
  const [cellMode, setCellMode] = useState(false); // "Hujayra ichiga kirish"
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState(1);
  const [light, setLight] = useState(0.75);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // stolcha (X/Y) siljitish
  const [atEye, setAtEye] = useState(false);
  const [viewing, setViewing] = useState(false);
  const texRef = useRef<HTMLCanvasElement | null>(null);
  const rebuildRef = useRef<((s: Specimen | null, cut: boolean) => void) | null>(null);
  const flyToRef = useRef<((to: THREE.Vector3, toT: THREE.Vector3) => void) | null>(null);
  const spawnRef = useRef<((kind: string) => void) | null>(null);

  stateRef.current = { stage, mode: prepMode(specimen) };

  // ob'yektiv → kattalik: 4× (kam) → 100× (ko'p)
  const setObj = (n: number) => {
    setObjective(n);
    setZoom(n === 4 ? 0.55 : n === 10 ? 1 : n === 40 ? 2.2 : 4.5);
    if (n < 100) setCellMode(false);
  };

  const push = (line: string) => setLog((l) => [line, ...l].slice(0, 30));

  // ---------- mikroskop ko'rinishi (sahna ichida) — VFX: vignette + aberration + Braun zarrachalar ----------
  const cellModeRef = useRef(false);
  useEffect(() => {
    const tex = texRef.current;
    const plane = viewPlaneRef.current;
    if (!tex || !plane) return;
    const ctx = tex.getContext("2d");
    if (!ctx) return;
    const off = document.createElement("canvas");
    off.width = 512;
    off.height = 512;
    const octx = off.getContext("2d");
    if (!octx) return;
    drawSpecimen(octx, 512, 512, specimen?.texture ?? "onion", zoom);
    ctx.filter = `blur(${(1 - focus) * 3.2}px) brightness(${0.55 + light * 0.9}) contrast(${1 + light * 0.18})`;
    ctx.drawImage(off, 0, 0);
    ctx.filter = "none";
    // 🌈 xromatik aberration — chetlarda binafsha/yashil halqalar (haqiqiy linza effekti)
    ctx.globalAlpha = 0.14;
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(off, -2.4, 0);
    ctx.drawImage(off, 2.4, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    // 🕳 vignette — chetlar qorong'ilashadi (obyektiv ko'rinishi)
    const vg = ctx.createRadialGradient(256, 256, 150, 256, 256, 340);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(8,12,22,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 512, 512);
    // 🔵 Braun harakati — sitoplazmada suzib yuruvchi zarrachalar
    const rnd = (i: number) => ((Math.sin(i * 127.1 + performance.now() * 0.0006) * 43758.5453) % 1 + 1) % 1;
    ctx.fillStyle = "rgba(210,225,240,0.5)";
    for (let i = 0; i < 26; i++) {
      const x = rnd(i) * 512;
      const y = rnd(i + 99) * 512;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + rnd(i + 7) * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // 🧬 HUJAYRA ICHIGA KIRISH — organoidlar (yadro, mitoxondriya, xloroplast) + puls
    if (cellMode) {
      const tt = performance.now() * 0.001;
      const cellGrad = ctx.createRadialGradient(256, 256, 40, 256, 256, 340);
      cellGrad.addColorStop(0, "#cfe8d4");
      cellGrad.addColorStop(1, "#7fb98c");
      ctx.fillStyle = cellGrad;
      ctx.fillRect(0, 0, 512, 512);
      // yadro
      const pulse = 1 + Math.sin(tt * 1.7) * 0.05;
      ctx.beginPath();
      ctx.arc(256, 246, 86 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(90,60,140,0.85)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(256, 246, 30, 0, Math.PI * 2);
      ctx.fillStyle = "#3b2568";
      ctx.fill();
      // mitoxondriyalar (puls bilan)
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + tt * 0.12;
        const r = 150 + Math.sin(tt * 1.2 + i) * 14;
        const x = 256 + Math.cos(ang) * r;
        const y = 256 + Math.sin(ang) * r * 0.86;
        const p2 = 1 + Math.sin(tt * 2.2 + i * 1.3) * 0.11;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(0, 0, 34 * p2, 17 * p2, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(214,120,90,0.9)";
        ctx.fill();
        ctx.strokeStyle = "rgba(150,70,50,0.8)";
        ctx.stroke();
        ctx.restore();
      }
      // xloroplastlar
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 - tt * 0.1;
        const x = 256 + Math.cos(ang) * 196;
        const y = 256 + Math.sin(ang) * 172;
        ctx.beginPath();
        ctx.ellipse(x, y, 30, 18, ang, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(60,150,80,0.92)";
        ctx.fill();
      }
      // sitoplazma zarrachalari (Braun)
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 40; i++) {
        const x = rnd(i + 31) * 512;
        const y = rnd(i + 131) * 512;
        ctx.beginPath();
        ctx.arc(x, y, 1.4 + rnd(i + 17) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const map = (plane.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture | null;
    if (map) {
      // 🎯 STOLCHA (Stage) — preparatni X/Y bo'yicha surish
      map.offset.set(cellMode ? 0 : pan.x, cellMode ? 0 : pan.y);
      map.needsUpdate = true;
    }
  }, [specimen, zoom, focus, light, viewing, cellMode, pan]);

  // ---------- 3D sahna ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 9.5 });
    handleRef.current = handle;
    handle.scene.add(benchTop(14, 9));

    const metal = new THREE.MeshStandardMaterial({ color: "#3b4a63", metalness: 0.55, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: "#22303f", metalness: 0.35, roughness: 0.5 });

    // ====== MIKROSKOP (realistik) ======
    const micro = new THREE.Group();
    microRef.current = micro;
    const base1 = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.32, 2.0), metal);
    base1.position.y = 0.16;
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 1.6), dark);
    base2.position.y = 0.46;
    const armLower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.6, 18), metal);
    armLower.position.set(-0.95, 1.35, -0.25);
    const armUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 1.6, 18), metal);
    armUpper.position.set(-0.62, 2.75, -0.45);
    armUpper.rotation.z = -0.35;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.55, 20), metal);
    tube.position.set(-0.12, 3.35, -0.12);
    tube.rotation.z = 0.38;
    const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.72, 18), dark);
    eyepiece.position.set(0.28, 4.18, -0.02);
    eyepiece.rotation.z = 0.38;
    const eyeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 18), new THREE.MeshStandardMaterial({ color: "#0f2a3f", metalness: 0.7, roughness: 0.15 }));
    eyeLens.position.set(0.42, 4.5, 0.04);
    eyeLens.rotation.z = 0.38;
    const stage3d = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 1.45), new THREE.MeshStandardMaterial({ color: "#64748b", metalness: 0.45, roughness: 0.42 }));
    stage3d.position.set(-0.02, 1.72, 0.28);
    for (const sx of [-0.62, 0.62]) {
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.16), new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.6, roughness: 0.3 }));
      clip.position.set(sx, 1.83, 0.1);
      micro.add(clip);
    }
    const aperture = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), dark);
    aperture.position.set(-0.02, 1.8, 0.28);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.52, 0.26, 20), metal);
    turret.position.set(-0.05, 2.42, 0.18);
    for (const [i, ang] of [0, 1, 2].entries()) {
      const obj = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 0.5 + i * 0.16, 14),
        new THREE.MeshStandardMaterial({ color: i === 0 ? "#c9a227" : i === 1 ? "#2f80ed" : "#b02a2a", metalness: 0.55, roughness: 0.3 }),
      );
      obj.position.set(-0.05 + Math.cos(ang * 2.1) * 0.4, 2.05 - i * 0.08, 0.18 + Math.sin(ang * 2.1) * 0.4);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 10), new THREE.MeshStandardMaterial({ color: "#bfe3ff", metalness: 0.8, roughness: 0.1 }));
      lens.position.y = -(0.28 + i * 0.08);
      obj.add(lens);
      micro.add(obj);
    }
    for (const sx of [-1.32, 1.18]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 18), new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.55, roughness: 0.35 }));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(sx, 1.42, 0.62);
      const knobS = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.24, 14), new THREE.MeshStandardMaterial({ color: "#cbd5e1", metalness: 0.6 }));
      knobS.rotation.x = Math.PI / 2;
      knobS.position.set(sx, 1.42, 0.88);
      micro.add(knob, knobS);
    }
    const mirrorPivot = new THREE.Group();
    const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 22), new THREE.MeshStandardMaterial({ color: "#d9e2ec", metalness: 0.85, roughness: 0.12 }));
    mirror.rotation.x = Math.PI / 2 - 0.6;
    const mirrorFrame = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 22), dark);
    mirrorFrame.rotation.x = Math.PI / 2 - 0.6;
    mirrorPivot.add(mirror, mirrorFrame);
    mirrorPivot.position.set(-0.02, 0.85, 0.28);
    const mirrorArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.75, 10), dark);
    mirrorArm.position.set(-0.02, 0.62, 0.05);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.18, 16), new THREE.MeshStandardMaterial({ color: "#f5e9c8", emissive: "#ffe9a8", emissiveIntensity: 0.7 }));
    lamp.position.set(-0.02, 0.2, 0.28);
    micro.add(base1, base2, armLower, armUpper, tube, eyepiece, eyeLens, stage3d, turret, mirrorPivot, mirrorArm, lamp);
    micro.position.set(3.4, 0, -0.4);
    micro.userData = { kind: "microscope", label: "🔬 Mikroskop", icon: "🔬", desc: "Bosing — kamera ko'z joyiga o'tadi" };
    micro.traverse((o) => {
      o.userData.pickRoot = micro;
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    handle.scene.add(micro);

    // ====== ANJOMLAR (ishlatiladigan narsalar) ======
    const makeKnife = () => {
      const g = new THREE.Group();
      const handleM = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 1.35, 16), new THREE.MeshStandardMaterial({ color: "#6e4226", roughness: 0.55 }));
      handleM.rotation.z = Math.PI / 2;
      handleM.position.x = -0.55;
      const bolster = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.18, 16), new THREE.MeshStandardMaterial({ color: "#b08d4f", metalness: 0.75, roughness: 0.3 }));
      bolster.rotation.z = Math.PI / 2;
      bolster.position.x = 0.16;
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(0, -0.2);
      bladeShape.lineTo(1.35, -0.16);
      bladeShape.lineTo(1.95, 0.02);
      bladeShape.lineTo(1.35, 0.12);
      bladeShape.lineTo(0, 0.16);
      bladeShape.lineTo(0, -0.2);
      const blade = new THREE.Mesh(
        new THREE.ExtrudeGeometry(bladeShape, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }),
        new THREE.MeshStandardMaterial({ color: "#cdd7e3", metalness: 0.92, roughness: 0.14 }),
      );
      blade.rotation.x = -Math.PI / 2;
      blade.position.set(0.22, 0.03, 0.02);
      g.add(handleM, bolster, blade);
      return g;
    };
    const makePipette = () => {
      const g = new THREE.Group();
      const tubeG = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.055, 1.7, 12), glassMaterial("#d8ecf5", 0.45));
      tubeG.position.y = 0.95;
      tubeG.rotation.z = 0.28;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: "#b02a3a", roughness: 0.5 }));
      bulb.position.set(-0.26, 1.86, 0);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.5, 8), glassMaterial("#d8ecf5", 0.5));
      tip.position.set(0.22, 0.16, 0);
      tip.rotation.z = 0.28;
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshStandardMaterial({ color: "#7fc4e8", transparent: true, opacity: 0.85 }));
      drop.position.set(0.31, -0.08, 0);
      drop.name = "pipdrop";
      g.add(tubeG, bulb, tip, drop);
      return g;
    };
    const makeTweezers = () => {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.055, 0.11), new THREE.MeshStandardMaterial({ color: "#c9d2dc", metalness: 0.85, roughness: 0.2 }));
        arm.position.set(0.55, 0.12, s * 0.1);
        arm.rotation.y = s * 0.06;
        arm.rotation.z = -0.045 * s * s - 0.02;
        g.add(arm);
      }
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: "#5b4a8f", roughness: 0.5 }));
      grip.position.set(-0.28, 0.1, 0);
      g.add(grip);
      return g;
    };
    const makeSpreader = () => {
      const g = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.045, 0.16), glassMaterial("#d8ecf5", 0.5));
      rod.position.y = 0.12;
      rod.rotation.z = 0.03;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.3), glassMaterial("#d8ecf5", 0.5));
      tip.position.set(0.92, 0.12, 0);
      g.add(rod, tip);
      return g;
    };
    const makeCover = () => {
      const g = new THREE.Group();
      const cov = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.025, 0.95), glassMaterial("#dceef7", 0.42));
      cov.position.y = 0.12;
      const shine = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.12 }));
      shine.rotation.x = -Math.PI / 2;
      shine.position.y = 0.145;
      g.add(cov, shine);
      return g;
    };
    const makeStain = () => {
      const g = new THREE.Group();
      const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 1.05, 16), new THREE.MeshPhysicalMaterial({ color: "#e8d8f2", transparent: true, opacity: 0.6, transmission: 0.35, roughness: 0.2 }));
      sb.position.y = 0.72;
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.22, 12), new THREE.MeshStandardMaterial({ color: "#6b21a8" }));
      sc.position.y = 1.36;
      const sd = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), new THREE.MeshStandardMaterial({ color: "#5b21a0" }));
      sd.position.y = 0.14;
      g.add(sb, sc, sd);
      return g;
    };
    const makeSlide = () => {
      const g = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.07, 0.95), glassMaterial("#d8ecf5", 0.42));
      glass.position.y = 0.16;
      const frost = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.95), new THREE.MeshStandardMaterial({ color: "#e8f2f8", transparent: true, opacity: 0.55 }));
      frost.position.set(-0.62, 0.215, 0);
      g.add(glass, frost);
      return g;
    };

    type ToolKind = "knife" | "pipette" | "tweezers" | "spreader" | "cover" | "stain" | "slide";
    const TOOL_META: Record<ToolKind, { label: string; icon: string; desc: string }> = {
      knife: { label: "🔪 Skalpel (pichoqcha)", icon: "🔪", desc: "Namunani kesish/surtish uchun" },
      pipette: { label: "💧 Pipetka", icon: "💧", desc: "Suyuqlik tomchisi olish" },
      tweezers: { label: "🤏 Pinset", icon: "🤏", desc: "Mayda namunani ushlab olish" },
      spreader: { label: "🩹 Surtma tayoqchasi", icon: "🩹", desc: "Qon surtmasini yoyish" },
      cover: { label: "🪟 Yopqich shisha", icon: "🪟", desc: "Namunani yopish uchun" },
      stain: { label: "💧 Bo'yovchi", icon: "💧", desc: "Namunani bo'yash uchun" },
      slide: { label: "🧫 Preparat oynachasi", icon: "🧫", desc: "Namuna shu yerga qo'yiladi" },
    };
    const toolsGroup = new THREE.Group();
    handle.scene.add(toolsGroup);
    const buildTool = (kind: ToolKind) => {
      const g =
        kind === "knife" ? makeKnife() : kind === "pipette" ? makePipette() : kind === "tweezers" ? makeTweezers() : kind === "spreader" ? makeSpreader() : kind === "cover" ? makeCover() : kind === "stain" ? makeStain() : makeSlide();
      g.userData = { kind, ...TOOL_META[kind] };
      g.traverse((o) => {
        o.userData.pickRoot = g;
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
      });
      return g;
    };
    const home: Record<ToolKind, [number, number, number]> = {
      knife: [-3.6, 0, 1.4],
      pipette: [-2.35, 0, 2.7],
      tweezers: [1.45, 0, 2.75],
      spreader: [2.5, 0, 1.15],
      cover: [0.15, 0, 3.05],
      stain: [-1.9, 0, -1.6],
      slide: [0.2, 0, 1.85],
    };
    const toolObjs: Partial<Record<ToolKind, THREE.Group[]>> = {};
    for (const kind of Object.keys(home) as ToolKind[]) {
      const g = buildTool(kind);
      g.position.set(...home[kind]);
      if (kind === "knife") {
        g.rotation.y = -0.5;
        knifeRef.current = g;
      }
      toolsGroup.add(g);
      toolObjs[kind] = [g];
      if (kind === "slide" && !slideRef.current) slideRef.current = g;
      if (kind === "cover" && !coverRef.current) coverRef.current = g;
    }
    // anjom qo'shish — stolga "sakrab" tushadi
    spawnRef.current = (kind: string) => {
      const k = kind as ToolKind;
      if (!home[k]) return;
      const g = buildTool(k);
      const n = (toolObjs[k]?.length ?? 0);
      g.position.set(home[k][0] + (n % 3) * 1.15 - 0.6, 0, home[k][2] + 1.25 + Math.floor(n / 3) * 0.9);
      if (k === "knife") g.rotation.y = -0.5;
      g.scale.setScalar(0.01);
      toolsGroup.add(g);
      toolObjs[k] = [...(toolObjs[k] ?? []), g];
      popRef.current.push({ obj: g, t0: performance.now() / 1000 });
    };

    // ====== NAMUNA ======
    const specGroup = new THREE.Group();
    specGroupRef.current = specGroup;
    specGroup.userData = { kind: "specimen", label: "🧫 Namuna", icon: "🧫", desc: "Tayyorlanadigan namuna" };
    handle.scene.add(specGroup);

    // bo'yash tomchisi
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: "#6b21a8", transparent: true, opacity: 0.9 }));
    drop.visible = false;
    handle.scene.add(drop);
    dropRef.current = drop;

    // 💧 kichik NAMUNA tomchisi (pipetka/surtma/surish usullarida) — faqat U oynachaga o'tadi
    const sampleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshStandardMaterial({ color: "#d98cc8", roughness: 0.35, transparent: true, opacity: 0.92 }));
    sampleMesh.visible = false;
    sampleMesh.position.set(-1.2, 0.62, 1.3);
    sampleMesh.userData = { kind: "sample", label: "💧 Namuna tomchisi", icon: "💧", desc: "Oynachaga qo'yiladigan kichik namuna" };
    handle.scene.add(sampleMesh);
    sampleRef.current = sampleMesh;

    // ✂️ kesilgan tilim — ENDI USHLANADI VA SILJIYDI!
    const slice = new THREE.Group();
    const sliceMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.6), new THREE.MeshStandardMaterial({ color: "#d98cc8", roughness: 0.55 }));
    sliceMesh.name = "sliceMesh";
    sliceMesh.position.y = 0.12;
    sliceMesh.castShadow = true;
    slice.add(sliceMesh);
    slice.visible = false;
    slice.position.set(-1.2, 0, 1.6);
    slice.userData = { kind: "slice", label: "✂️ Kesilgan mitti namuna", icon: "✂️", desc: "Uni oling va PREPARAT OYNACHASI oldiga olib boring!" };
    slice.traverse((o) => {
      o.userData.pickRoot = slice;
    });
    handle.scene.add(slice);
    sliceRef.current = slice;

    const rebuildSpec = (spec: Specimen | null, cut: boolean) => {
      while (specGroup.children.length) {
        const c = specGroup.children[0] as THREE.Mesh;
        if (c.geometry) c.geometry.dispose();
        specGroup.remove(c);
      }
      if (!spec) return;
      const color = new THREE.Color(spec.rang);
      if (spec.texture === "onion") {
        for (let i = 0; i < (cut ? 3 : 6); i++) {
          const arc = new THREE.Mesh(new THREE.CylinderGeometry(1.15 - i * 0.13, 1.15 - i * 0.13, 0.1, 26, 1, false, 0, Math.PI * 1.15), new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, i * 0.03), roughness: 0.55 }));
          arc.position.y = 0.25 + i * 0.12;
          arc.rotation.y = i * 0.35;
          specGroup.add(arc);
        }
      } else if (spec.texture === "leaf") {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.25, 22, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
        leaf.scale.set(1, 0.16, 0.62);
        leaf.position.y = 0.35;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), new THREE.MeshStandardMaterial({ color: "#4c7a3d" }));
        stem.rotation.z = Math.PI / 2;
        stem.position.set(1.45, 0.32, 0);
        specGroup.add(leaf, stem);
      } else if (spec.texture === "muscle") {
        for (let i = 0; i < 4; i++) {
          const fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.1, 12), new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, i * 0.035), roughness: 0.6 }));
          fiber.rotation.z = Math.PI / 2;
          fiber.position.set(0, 0.3 + (i % 2) * 0.5, -0.42 + Math.floor(i / 2) * 0.85);
          specGroup.add(fiber);
        }
      } else if (spec.texture === "blood") {
        const glassSlide = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 1.15), glassMaterial("#d8ecf5", 0.45));
        glassSlide.position.y = 0.16;
        const smear = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.035, 0.72), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.35 }));
        smear.position.y = 0.235;
        specGroup.add(glassSlide, smear);
      } else if (spec.texture === "bone") {
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 18), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
        bone.rotation.z = Math.PI / 2;
        bone.position.y = 0.55;
        const marrow = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.22, 14), new THREE.MeshStandardMaterial({ color: "#c98a6b", roughness: 0.6 }));
        marrow.rotation.z = Math.PI / 2;
        marrow.position.y = 0.55;
        specGroup.add(bone, marrow);
      } else if (spec.texture === "nerve") {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
        body.position.y = 0.62;
        specGroup.add(body);
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2;
          const dend = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.09, 1.25, 8), new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, -0.06), roughness: 0.55 }));
          dend.position.set(Math.cos(ang) * 0.85, 0.55, Math.sin(ang) * 0.85);
          dend.rotation.z = Math.PI / 2 - 0.35;
          dend.rotation.y = -ang;
          specGroup.add(dend);
        }
      } else if (spec.texture === "fat") {
        for (let i = 0; i < 5; i++) {
          const dropM = new THREE.Mesh(new THREE.SphereGeometry(0.42 + (i % 3) * 0.12, 16, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.35 }));
          dropM.position.set(((i * 0.9) % 2.2) - 1.1, 0.45 + (i % 2) * 0.35, ((i * 1.3) % 1.8) - 0.9);
          specGroup.add(dropM);
        }
      } else if (spec.texture === "fungi") {
        for (let i = 0; i < 9; i++) {
          const hypha = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.9, 8), new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, (i % 3) * 0.05), roughness: 0.55 }));
          hypha.rotation.z = Math.PI / 2 - 0.5 + (i % 3) * 0.35;
          hypha.rotation.y = i * 0.72;
          hypha.position.set(((i * 0.62) % 1.6) - 0.8, 0.4 + (i % 4) * 0.16, ((i * 0.83) % 1.5) - 0.75);
          specGroup.add(hypha);
        }
      } else if (spec.texture === "bacteria") {
        for (let i = 0; i < 26; i++) {
          const rod = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, (i % 4) * 0.03), roughness: 0.45 }));
          rod.position.set(((i * 0.71) % 2.6) - 1.3, 0.18 + (i % 3) * 0.12, ((i * 0.97) % 2.2) - 1.1);
          rod.rotation.set(Math.random() * 0.6, i * 0.8, Math.random() * 0.6);
          specGroup.add(rod);
        }
      } else {
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
        core.scale.y = 0.55;
        core.position.y = 0.42;
        specGroup.add(core);
      }
      if (sliceRef.current) {
        const sm = sliceRef.current.getObjectByName("sliceMesh") as THREE.Mesh | undefined;
        if (sm) (sm.material as THREE.MeshStandardMaterial).color.set(color);
        sliceRef.current.visible = cut;
        sliceRef.current.position.set(-0.15, 0, 1.75);
        sliceRef.current.rotation.set(0, 0.5, 0);
      }
    };
    rebuildRef.current = rebuildSpec;

    // ====== MIKROSKOP KO'RINISHI — sahna ichida (kamera oldidagi dumaloq oyna) ======
    const tex = document.createElement("canvas");
    tex.width = 512;
    tex.height = 512;
    texRef.current = tex;
    const viewPlane = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 48),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tex), transparent: true, opacity: 0 }),
    );
    viewPlane.position.set(0, 0, -1.75);
    viewPlane.visible = false;
    handle.camera.add(viewPlane);
    handle.scene.add(handle.camera);
    viewPlaneRef.current = viewPlane;
    // atrofi (qora halqa)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.95, 48), new THREE.MeshBasicMaterial({ color: "#0b1220", transparent: true, opacity: 0 }));
    ring.position.set(0, 0, -1.74);
    ring.visible = false;
    handle.camera.add(ring);

    // ====== bosish / siljitish ======
    const detachPointer = attachPointer(handle, canvas, {
      getRoots: () => [...toolsGroup.children, specGroup, micro, ...(sliceRef.current ? [sliceRef.current] : []), ...(sampleRef.current ? [sampleRef.current] : [])],
      moveRef,
      onPick: (root) => {
        const kind = root.userData.kind as string;
        setPickInfo({ icon: root.userData.icon ?? "🔧", label: root.userData.label ?? kind, desc: root.userData.desc ?? "" });
        if (kind === "microscope" && stateRef.current.stage >= 5) {
          // 🎥 kamera ko'z joyiga uchadi
          flyTo(EYE_POS.clone().add(new THREE.Vector3(0.05, 0.95, 1.95)), EYE_POS);
          setAtEye(true);
          push("🎥 Kamera mikroskop ko'zi oldiga to'g'irlandi — '👁 Ko'rish' ni bosing");
        }
      },
    });

    const flyTo = (to: THREE.Vector3, toT: THREE.Vector3) => {
      flyRef.current = {
        t0: performance.now() / 1000,
        from: handle.camera.position.clone(),
        to,
        fromT: handle.controls.target.clone(),
        toT,
      };
    };
    flyToRef.current = flyTo;

    // ====== yaqinlik (frame hook) ======
    const dist2 = (a: THREE.Vector3, b: THREE.Vector3) => {
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      return Math.sqrt(dx * dx + dz * dz);
    };
    const nearest = (kind: string, p: THREE.Vector3) => {
      let best: THREE.Object3D | null = null;
      let bd = Infinity;
      for (const g of toolsGroup.children) {
        if (g.userData.kind !== kind) continue;
        const d = dist2(g.position, p);
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      return { obj: best, d: bd };
    };

    const stop = attachFrameHooks(handle, [
      (t) => {
        // kamera uchishi
        const fly = flyRef.current;
        if (fly) {
          const k = Math.min(1, (t - fly.t0) / 1.15);
          const e = k * k * (3 - 2 * k);
          handle.camera.position.lerpVectors(fly.from, fly.to, e);
          handle.controls.target.lerpVectors(fly.fromT, fly.toT, e);
          handle.controls.update();
          if (k >= 1) flyRef.current = null;
        }
        // pop-in animatsiyalar
        popRef.current = popRef.current.filter((p) => {
          const k = Math.min(1, (t - p.t0) / 0.5);
          const e = 1 + Math.sin(k * Math.PI) * 0.12;
          p.obj.scale.setScalar(k * e);
          return k < 1;
        });
        // bo'yash tomchisi
        const stainA = stainAnimRef.current;
        if (stainA) {
          const e = t - stainA.t0;
          const sp = specGroup.position;
          const st = nearest("stain", sp).obj;
          const from = st ? st.position.clone().add(new THREE.Vector3(0.1, 1.5, 0)) : sp.clone().add(new THREE.Vector3(0, 2, 0));
          if (e < 0.75 && dropRef.current) {
            dropRef.current.visible = true;
            const k = e / 0.75;
            dropRef.current.position.lerpVectors(from, sp.clone().add(new THREE.Vector3(0, 0.75, 0)), k * k);
          } else {
            if (dropRef.current) dropRef.current.visible = false;
            stainAnimRef.current = null;
          }
        }
        // namuna → oynacha / oynacha → mikroskop ko'chishi
        const tr = transferRef.current;
        if (tr) {
          const e = Math.min(1, (t - tr.t0) / 0.9);
          const k = e * e * (3 - 2 * e);
          if (tr.kind === "toSlide" && slideRef.current) {
            // ✅ REAL HAYOT: KATTA namuna stolida qoladi — faqat KICHIK namuna oynachaga o'tadi!
            const target = slideRef.current.position.clone().add(new THREE.Vector3(0, 0.22, 0));
            if (sliceRef.current && sliceRef.current.visible) {
              sliceRef.current.position.lerp(target, 0.16);
              if (e > 0.72) sliceRef.current.visible = false;
            }
            if (sampleRef.current && sampleRef.current.visible) {
              sampleRef.current.position.lerp(target, 0.18);
              if (e > 0.72) sampleRef.current.visible = false;
            }
            // 🪟 yopqich shisha 45° burchakda sekin tushadi (havo pufakchasi yo'q!)
            if (coverRef.current && e > 0.45) {
              const cv = coverRef.current;
              cv.position.lerp(slideRef.current.position.clone().add(new THREE.Vector3(0, 0.42, 0)), 0.1);
              cv.rotation.x += (Math.PI / 4 - cv.rotation.x) * 0.12;
              cv.rotation.y += (0 - cv.rotation.y) * 0.12;
            }
          } else if (tr.kind === "toMicro") {
            const slideObj = slideRef.current;
            if (slideObj) {
              const targetPos = micro.position.clone().add(new THREE.Vector3(-0.02, 1.95, 0.28));
              slideObj.position.lerp(targetPos, 0.12);
              slideObj.rotation.y += (0 - slideObj.rotation.y) * 0.12;
            }
          }
          if (e >= 1) transferRef.current = null;
        }
        // kesish/surtish/surish animatsiyalari
        const cut = cutAnimRef.current;
        if (cut && cut.mode !== "pipette") {
          const e = t - cut.t0;
          const sp = specGroup.position;
          const approach = (k: number) => {
            knifeRef.current!.position.x = -3.6 + (sp.x + 0.45 + 3.6) * k;
            knifeRef.current!.position.y = 0.45 + 1.75 * k;
            knifeRef.current!.rotation.y = -0.5;
          };
          const knife = knifeRef.current;
          if (knife) {
            if (cut.mode === "cut") {
              if (e < 0.5) approach(e / 0.5);
              else if (e < 0.85) knife.position.y = 2.2 - 1.85 * ((e - 0.5) / 0.35);
              else if (e < 1.7) {
                const k = (e - 0.85) / 0.85;
                const sl = sliceRef.current;
                if (sl && sl.visible) {
                  sl.position.x = sp.x - 0.15 - k * 1.15;
                  sl.position.y = Math.max(0.28, 1.15 - k * 1.35);
                  sl.rotation.z = k * 1.35;
                }
                knife.position.y = 0.35 + k * 0.6;
              } else cutAnimRef.current = null;
            } else if (cut.mode === "smear") {
              if (e < 0.5) approach(e / 0.5);
              else if (e < 1.8) {
                const k = (e - 0.5) / 1.3;
                knife.position.x = sp.x - 1.0 + k * 2.1;
                knife.position.y = 0.42;
                knife.rotation.y = -0.35 + k * 0.7;
              } else if (e < 2.2) knife.position.y = 0.42 + ((e - 1.8) / 0.4) * 1.3;
              else cutAnimRef.current = null;
            } else {
              if (e < 0.5) approach(e / 0.5);
              else if (e < 1.7) {
                const k = (e - 0.5) / 1.2;
                knife.position.x = sp.x + Math.sin(k * Math.PI * 4) * 0.5;
                knife.position.y = 0.5 + Math.abs(Math.sin(k * Math.PI * 4)) * 0.12;
              } else if (e < 2.1) knife.position.y = 0.5 + ((e - 1.7) / 0.4) * 1.4;
              else cutAnimRef.current = null;
            }
          } else cutAnimRef.current = null;
        } else if (cutAnimRef.current?.mode === "pipette") {
          // 💧 pipetka animatsiyasi
          const e = t - cutAnimRef.current.t0;
          const sp = specGroup.position;
          const pip = toolsGroup.children.find((ch) => ch.userData.kind === "pipette");
          if (!pip) {
            cutAnimRef.current = null;
          } else {
            const home = new THREE.Vector3(-2.35, 0, 2.7);
            if (e < 0.6) {
              const k = e / 0.6;
              pip.position.lerp(new THREE.Vector3(sp.x + 0.45, 1.55, sp.z + 0.35), 0.12 + k * 0.06);
              pip.rotation.z += (0.42 - pip.rotation.z) * 0.12;
            } else if (e < 1.15) {
              pip.position.y += (0.95 - pip.position.y) * 0.14;
            } else if (e < 1.8) {
              pip.position.y += (1.85 - pip.position.y) * 0.1;
              pip.rotation.z += (0 - pip.rotation.z) * 0.1;
            } else if (e < 2.4) {
              pip.position.lerp(home, 0.06);
            } else {
              pip.position.copy(home);
              cutAnimRef.current = null;
            }
          }
        } else if (knifeRef.current) {
          const knife = knifeRef.current;
          knife.rotation.y += (-0.5 + Math.sin(t * 0.8) * 0.12 - knife.rotation.y) * 0.06;
          knife.position.x += (-3.6 - knife.position.x) * 0.03;
          knife.position.y += (0.45 - knife.position.y) * 0.03;
        }
        if (microRef.current) microRef.current.rotation.y = Math.sin(t * 0.22) * 0.14;

        // 🟢 YAQINLIK — tugmalar faqat YAQIN keltirilganda chiqadi ("masofadan bolmasin")
        const st2 = stateRef.current;
        const sp = specGroup.position;
        const knifeNear = st2.stage === 1 && specGroup.visible && nearest("knife", sp).d < 2.4;
        const stainNear = st2.stage === 2 && specGroup.visible && nearest("stain", sp).d < 2.4;
        // ✂️ KESILGAN TILIM oynachaga olib boriladi (surtma/surishda — namunaning o'zi)
        const piecePos = st2.mode === "cut" && sliceRef.current?.visible ? sliceRef.current.position : sp;
        const slideSpec = st2.stage === 3 && slideRef.current ? dist2(slideRef.current.position, piecePos) < 2.8 : false;
        const slideMicro = st2.stage === 4 && slideRef.current ? dist2(slideRef.current.position, micro.position) < 3.0 : false;
        const nr = nearRef.current;
        if (nr.knife !== knifeNear || nr.stain !== stainNear || nr.slideSpec !== slideSpec || nr.slideMicro !== slideMicro) {
          nr.knife = knifeNear;
          nr.stain = stainNear;
          nr.slideSpec = slideSpec;
          nr.slideMicro = slideMicro;
          setNear({ knife: knifeNear, stain: stainNear, slideSpec, slideMicro, atEye: false });
        }
      },
    ]);

    return () => {
      stop();
      detachPointer();
      handle.dispose();
      handleRef.current = null;
      viewPlaneRef.current = null;
      texRef.current = null;
      spawnRef.current = null;
      rebuildRef.current = null;
      flyToRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // namuna/stage sinxroni
  useEffect(() => {
    const st = specGroupRef.current;
    if (!st) return;
    st.visible = Boolean(specimen) && stage >= 1;
    const mode = prepMode(specimen);
    rebuildRef.current?.(specimen, stage >= 2 && mode === "cut");
    // 💧 kichik namuna (pipetka/surtma/surish) — bosqich 2+ da ko'rinadi
    const sm = sampleRef.current;
    if (sm) {
      sm.visible = Boolean(specimen) && stage >= 2 && stage <= 4 && mode !== "cut";
      if (specimen) {
        (sm.material as THREE.MeshStandardMaterial).color.set(specimen.rang);
        if (stage === 2) sm.position.set(-1.2, 0.62, 1.3);
      }
    }
    // namuna KATTA holicha qoladi — faqat kichik namuna oynachaga o'tadi (real hayot!)
    if (st && specimen && stage >= 4 && mode !== "cut") st.visible = true;
  }, [specimen, stage]);


  // ---------- harakatlar (tugmalar faqat yaqinlikda!) ----------
  const doAction = () => {
    if (!specimen || stage !== 1) return;
    cutAnimRef.current = { t0: performance.now() / 1000, mode: prepMode(specimen) };
    setStage(2);
    push(
      ACTION_LABEL[prepMode(specimen)] +
        " — animatsiya bajarildi ✅ " +
        (prepMode(specimen) === "cut"
          ? "Endi ✂️ KESILGAN MITTI NAMUNANI sudrab oling va 🧫 PREPARAT OYNACHASI oldiga olib boring!"
          : "Endi namunani 🧫 PREPARAT OYNACHASI oldiga olib boring!"),
    );
  };
  const doStain = () => {
    if (!specimen || stage !== 2) return;
    stainAnimRef.current = { t0: performance.now() / 1000 };
    setStage(3);
    push(`💧 Bo'yovchi tomchisi tushdi (${specimen.stain}) — hujayralar yorqinroq ko'rina boshladi`);
  };
  const doToSlide = () => {
    if (!specimen || stage !== 3) return;
    transferRef.current = { t0: performance.now() / 1000, kind: "toSlide" };
    setStage(4);
    push("💧 1 tomchi suv tushdi → 🧫 namuna yoyildi → 🩣 1 tomchi YOD (yadrolar ko'rinadi) → 🪟 yopqich shisha 45° bilan tushdi (havo pufakchasi YO'Q!)");
  };
  const doToMicro = () => {
    if (stage !== 4) return;
    transferRef.current = { t0: performance.now() / 1000, kind: "toMicro" };
    setStage(5);
    push("🔬 Oynacha mikroskop stoliga joylashtirildi — endi MIKROSKOPKA BOSING");
  };
  const doView = () => {
    if (stage < 5 || !specimen) return;
    if (!atEye) {
      flyToRef.current?.(EYE_POS.clone().add(new THREE.Vector3(0.05, 0.95, 1.95)), EYE_POS);
      setAtEye(true);
      push("🎥 Kamera mikroskop ko'zi oldiga to'g'irlandi — yana '👁 Ko'rish' ni bosing");
      return;
    }
    setViewing(true);
    setStage(6);
    const plane = viewPlaneRef.current;
    if (plane) {
      plane.visible = true;
      const mat = plane.material as THREE.MeshBasicMaterial;
      mat.opacity = 0;
      const fadeIn = window.setInterval(() => {
        mat.opacity = Math.min(1, mat.opacity + 0.12);
        if (mat.opacity >= 1) window.clearInterval(fadeIn);
      }, 40);
    }
    const ring = (plane?.parent as THREE.Object3D)?.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.RingGeometry) as THREE.Mesh | undefined;
    if (ring) {
      ring.visible = true;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.95;
    }
    push("👁 Mikroskop ko'rinishi — namuna markazda! (fokus/yorug'lik bilan sozlang)");
  };
  const doExitView = () => {
    setViewing(false);
    setStage(5);
    setAtEye(false);
    const plane = viewPlaneRef.current;
    if (plane) plane.visible = false;
    const ring = (plane?.parent as THREE.Object3D)?.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.RingGeometry) as THREE.Mesh | undefined;
    if (ring) ring.visible = false;
    flyToRef.current?.(new THREE.Vector3(0, 6.2, 12.4), new THREE.Vector3(0, 1.2, 0));
    push("◀ Umumiy ko'rinishga qaytdik");
  };

  const catalog: CatalogItem[] = [
    ...SPECIMENS.map((s) => ({ id: `s:${s.id}`, icon: s.name.slice(0, 2), name: s.name, group: "Namunalar", desc: s.tavsif })),
    { id: "a:knife", icon: "🔪", name: "Skalpel (pichoqcha)", group: "Anjomlar", desc: "Kesish/surtish uchun" },
    { id: "a:pipette", icon: "💧", name: "Pipetka", group: "Anjomlar", desc: "Tomchi olish uchun" },
    { id: "a:tweezers", icon: "🤏", name: "Pinset", group: "Anjomlar", desc: "Mayda namuna ushlab olish" },
    { id: "a:spreader", icon: "🩹", name: "Surtma tayoqchasi", group: "Anjomlar", desc: "Surtma yoyish" },
    { id: "a:cover", icon: "🪟", name: "Yopqich shisha", group: "Anjomlar", desc: "Namunani yopish" },
    { id: "a:stain", icon: "💧", name: "Bo'yovchi", group: "Anjomlar", desc: "Bo'yash uchun" },
    { id: "a:slide", icon: "🧫", name: "Preparat oynachasi", group: "Anjomlar", desc: "Namuna qo'yiladigan shisha" },
    { id: "t:reset", icon: "↺", name: "Boshidan boshlash", group: "Boshqaruv" },
  ];

  const handleAdd = (id: string) => {
    if (id.startsWith("s:")) {
      const s = SPECIMENS.find((x) => x.id === id.slice(2));
      if (s) {
        setSpecimen(s);
        setStage(1);
        setAtEye(false);
        setViewing(false);
        push(`🔬 Namuna tanlandi: ${s.name} — ish stoliga tushdi. Endi kerakli ANJOMNI YAQIN keltiring!`);
        const sg = specGroupRef.current;
        if (sg) {
          sg.position.set(-1.2, 0, 1.1);
          sg.scale.setScalar(0.01);
          popRef.current.push({ obj: sg, t0: performance.now() / 1000 });
        }
      }
    } else if (id.startsWith("a:")) {
      spawnRef.current?.(id.slice(2));
      push(`➕ Anjom qo'shildi — stolga tushdi, sudrab ishlating!`);
    } else if (id === "t:reset") {
      setStage(0);
      setSpecimen(null);
      setLog([]);
      setAtEye(false);
      setViewing(false);
    }
  };

  return (
    <StageBox title="🧫 Namuna tayyorlash va mikroskop (simulyator)" catalog={catalog} onAdd={handleAdd} guide={GUIDE_BIOLOGY}>
      <div className="relative">
        <canvas ref={canvasRef} className="lab-canvas h-[340px] w-full rounded-2xl bg-slate-100" />
        <CameraPad handleRef={handleRef} />
        <PickCard
          info={pickInfo}
          moving={moving}
          onMove={() => {
            // siljitish rejimi — endi to'g'ridan-to'g'ri sudrash ham ishlaydi
            setMoving(!moving);
            moveRef.current = moving ? null : moveRef.current;
          }}
          onClose={() => {
            setPickInfo(null);
            moveRef.current = null;
            setMoving(false);
          }}
        />
        {/* 🔔 YAQINLIK tugmalari — faqat yaqin keltirilganda chiqadi */}
        {stage >= 1 && stage <= 5 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-1.5">
            {near.knife && stage === 1 && (
              <button onClick={doAction} className="pointer-events-auto rounded-2xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-lg active:scale-95">
                {ACTION_LABEL[prepMode(specimen)]}
              </button>
            )}
            {near.stain && stage === 2 && (
              <button onClick={doStain} className="pointer-events-auto rounded-2xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white shadow-lg active:scale-95">
                💧 Bo'yash
              </button>
            )}
            {near.slideSpec && stage === 3 && (
              <button onClick={doToSlide} className="pointer-events-auto rounded-2xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-lg active:scale-95">
                🧫 Kesilgan namunani oynachaga qo'yish
              </button>
            )}
            {near.slideMicro && stage === 4 && (
              <button onClick={doToMicro} className="pointer-events-auto rounded-2xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-lg active:scale-95">
                🔬 Mikroskopga joylashtirish
              </button>
            )}
            {stage === 5 && atEye && !viewing && (
              <button onClick={doView} className="pointer-events-auto rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg active:scale-95">
                👁 Ko'rish
              </button>
            )}
          </div>
        )}
      </div>

      {/* bosqichlar ko'rsatkichi */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1 text-[11px]">
        {["Namuna", "Tayyorlash", "Bo'yash", "Oynacha", "Mikroskop", "Ko'rish"].map((s, i) => (
          <span key={s} className={`rounded-full px-2 py-1 ${stage >= i + 1 ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {viewing && (
        <div className="mt-2 rounded-2xl bg-slate-900 p-2.5 text-white">
          <p className="text-center text-[10px] uppercase tracking-widest text-slate-400">👁 Mikroskop ko'rinishi (sahna ichida)</p>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            {[4, 10, 40, 100].map((n) => (
              <button key={n} onClick={() => setObj(n)} className={`${labChip} ${objective === n ? "bg-teal-600 text-white" : "bg-slate-700 text-slate-200"}`}>
                🔍 {n}×
              </button>
            ))}
            <button onClick={() => setFocus((f) => Math.max(0, +(f - 0.15).toFixed(2)))} className={`${labChip} bg-slate-700 text-slate-200`}>🎯 Makrovint −</button>
            <button onClick={() => setFocus((f) => Math.min(1, +(f + 0.15).toFixed(2)))} className={`${labChip} bg-slate-700 text-slate-200`}>🎯 Mikrovint +</button>
            <button onClick={() => setLight((l) => Math.max(0.1, +(l - 0.15).toFixed(2)))} className={`${labChip} bg-slate-700 text-slate-200`}>💡 Diyafragma −</button>
            <button onClick={() => setLight((l) => Math.min(1, +(l + 0.15).toFixed(2)))} className={`${labChip} bg-slate-700 text-slate-200`}>💡 +</button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-[10px] text-slate-400">🎯 Stolcha (X/Y):</span>
            <button onClick={() => setPan((p2) => ({ ...p2, x: Math.max(-0.35, p2.x - 0.06) }))} className={`${labChip} bg-slate-700 text-slate-200`}>⬅</button>
            <button onClick={() => setPan((p2) => ({ ...p2, x: Math.min(0.35, p2.x + 0.06) }))} className={`${labChip} bg-slate-700 text-slate-200`}>➡</button>
            <button onClick={() => setPan((p2) => ({ ...p2, y: Math.max(-0.35, p2.y - 0.06) }))} className={`${labChip} bg-slate-700 text-slate-200`}>⬆</button>
            <button onClick={() => setPan((p2) => ({ ...p2, y: Math.min(0.35, p2.y + 0.06) }))} className={`${labChip} bg-slate-700 text-slate-200`}>⬇</button>
            {!cellMode && objective === 100 && (
              <button
                onClick={() => {
                  setCellMode(true);
                  push("🧬 HUJAYRA ICHIGA KIRILDI — yadro, mitoxondriya va xloroplastlar jonli!");
                }}
                className={`${labChip} bg-emerald-600 text-white`}
              >
                🧬 Hujayra ichiga kirish
              </button>
            )}
            {cellMode && <span className={`${labChip} bg-emerald-700 text-white`}>🧬 Hujayra ichida (organoidlar)</span>}
            <button
              onClick={() => {
                if (cellMode) setCellMode(false);
                else doExitView();
              }}
              className={`${labChip} bg-rose-600 text-white`}
            >
              ◀ {cellMode ? "Mikroskopga qaytish" : "Chiqish"}
            </button>
          </div>
        </div>
      )}

      <p className="px-1 pb-1 pt-2 text-center text-xs text-slate-400">
        🖐 Anjomni <b>sudrab</b> namunaga YAQIN keltiring — <b>tugma o'sha payt</b> chiqadi · 🎮 joystik — atrofni ko'rish
        <br />
        🌍 Real hayot: suv tomchisi → namuna → <b>yod</b> (yadrolar ko'rinadi) → <b>yopqich shisha 45°</b> (pufakcha bo'lmasin!) → mikroskop ×100 → <b>hujayra ichiga kirish</b>
      </p>

      {log.length > 0 && (
        <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-2xl bg-slate-50 p-2.5">
          {log.map((l, i) => (
            <p key={i} className="text-[11px] text-slate-600">
              {l}
            </p>
          ))}
        </div>
      )}
    </StageBox>
  );
}
