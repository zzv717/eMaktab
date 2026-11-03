// 🧫 Namuna tayyorlash va mikroskop — pichoqcha bilan kesish, bo'yash, mikroskopda ko'rish
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SPECIMENS, type Specimen } from "./engine";
import { attachFrameHooks, attachPointer, benchTop, createScene, glassMaterial, type SceneHandle } from "./three-utils";
import { CameraPad, PickCard, StageBox, labChip, type CatalogItem, type PickInfo } from "./StageBox";
import SpecimenView from "./SpecimenView";

type Stage = 0 | 1 | 2 | 3 | 4;

const STAGE_LABEL = ["① Namunani tanlang", "② Pichoqcha bilan kesing", "③ Bo'yovchi qo'shing", "④ Preparatni mikroskopga qo'ying", "⑤ Mikroskopda ko'ring"];

export default function PrepLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [specimen, setSpecimen] = useState<Specimen | null>(null);
  const [stage, setStage] = useState<Stage>(0);
  const [mag, setMag] = useState(1); // 1=×40, 2.2=×100, 4.5=×400
  const [focus, setFocus] = useState(0.72);
  const [light, setLight] = useState(0.7);
  const [log, setLog] = useState<string[]>([]);
  const [pickInfo, setPickInfo] = useState<PickInfo | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const [moving, setMoving] = useState(false);
  const moveRef = useRef<THREE.Object3D | null>(null);
  const cutAnimRef = useRef<{ t0: number; mode: "cut" | "smear" | "scrape" } | null>(null);
  const knifeRef = useRef<THREE.Group | null>(null);
  const sliceRef = useRef<THREE.Mesh | null>(null);
  const stateRef = useRef({ stage: 0, hasSpecimen: false, specimenX: -1.2 });
  const rebuildRef = useRef<((s: Specimen | null, cut: boolean) => void) | null>(null);
  stateRef.current = { stage, hasSpecimen: Boolean(specimen), specimenX: -1.2 };

  const push = (l: string) => setLog((x) => [l, ...x].slice(0, 20));

  // ---------- 3D sahna ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 9.5 });
    handleRef.current = handle;
    handle.scene.add(benchTop(14, 9));

    // 🔬 YAXSHILANGAN MIKROSKOP MODELI (asos, yoy, stol, revolver, linzalar, ko'zgu)
    const micro = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: "#3b4a63", metalness: 0.55, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: "#22303f", metalness: 0.35, roughness: 0.5 });
    // asos (2 qatlamli)
    const base1 = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.32, 2.0), metal);
    base1.position.y = 0.16;
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 1.6), dark);
    base2.position.y = 0.46;
    // yoy (egri tayanch)
    const armLower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.6, 18), metal);
    armLower.position.set(-0.95, 1.35, -0.25);
    const armUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 1.6, 18), metal);
    armUpper.position.set(-0.62, 2.75, -0.45);
    armUpper.rotation.z = -0.35;
    // korpus nayi
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.55, 20), metal);
    tube.position.set(-0.12, 3.35, -0.12);
    tube.rotation.z = 0.38;
    // ko'z linzasi (egri)
    const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.72, 18), dark);
    eyepiece.position.set(0.28, 4.18, -0.02);
    eyepiece.rotation.z = 0.38;
    const eyeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 18), new THREE.MeshStandardMaterial({ color: "#0f2a3f", metalness: 0.7, roughness: 0.15 }));
    eyeLens.position.set(0.42, 4.5, 0.04);
    eyeLens.rotation.z = 0.38;
    // ish stoli + qisqichlar + teshik
    const stage3d = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 1.45), new THREE.MeshStandardMaterial({ color: "#64748b", metalness: 0.45, roughness: 0.42 }));
    stage3d.position.set(-0.02, 1.72, 0.28);
    for (const sx of [-0.62, 0.62]) {
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.16), new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.6, roughness: 0.3 }));
      clip.position.set(sx, 1.83, 0.1);
      micro.add(clip);
    }
    const aperture = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), dark);
    aperture.position.set(-0.02, 1.8, 0.28);
    // revolver + 3 ta linza (har xil uzunlikda)
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
    // fokus g'ildiraklari (ikkala tomonda)
    for (const sx of [-1.32, 1.18]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 18), new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.55, roughness: 0.35 }));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(sx, 1.42, 0.62);
      const knobS = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.24, 14), new THREE.MeshStandardMaterial({ color: "#cbd5e1", metalness: 0.6 }));
      knobS.rotation.x = Math.PI / 2;
      knobS.position.set(sx, 1.42, 0.88);
      micro.add(knob, knobS);
    }
    // oynacha (ko'zgu) + yorug'lik
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
    micro.userData = { kind: "microscope" };
    micro.traverse((o) => (o.userData.pickRoot = micro));
    handle.scene.add(micro);

    // namuna
    const specGroup = new THREE.Group();
    specGroup.userData = { kind: "specimen" };
    handle.scene.add(specGroup);

    // pichoqcha — YAXSHILANGAN MODEL (yog'och dastasi + po'lat pichoq + bolster)
    const knife = new THREE.Group();
    knifeRef.current = knife;
    const handleM = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 1.35, 16), new THREE.MeshStandardMaterial({ color: "#6e4226", roughness: 0.55 }));
    handleM.rotation.z = Math.PI / 2;
    handleM.position.x = -0.55;
    const bolster = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.18, 16), new THREE.MeshStandardMaterial({ color: "#b08d4f", metalness: 0.75, roughness: 0.3 }));
    bolster.rotation.z = Math.PI / 2;
    bolster.position.x = 0.16;
    for (const rx of [-0.95, -0.2]) {
      const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.44, 10), new THREE.MeshStandardMaterial({ color: "#c9a86a", metalness: 0.8, roughness: 0.25 }));
      rivet.rotation.x = Math.PI / 2;
      rivet.position.set(rx, 0, 0);
      knife.add(rivet);
    }
    // po'lat pichoq — tig' bilan (Shape + Extrude)
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
    knife.add(handleM, bolster, blade);
    knife.position.set(-3.6, 0.45, 1.4);
    knife.rotation.y = -0.5;
    knife.userData = { kind: "knife" };
    knife.traverse((o) => (o.userData.pickRoot = knife));
    handle.scene.add(knife);

    // preparat shishasi (slide)
    const slide = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.06, 0.85), glassMaterial("#d8ecf5", 0.42));
    slide.position.set(0.2, 0.35, 1.85);
    slide.userData = { kind: "slide" };
    slide.traverse((o) => (o.userData.pickRoot = slide));
    handle.scene.add(slide);

    // bo'yovchi shisha
    const stain = new THREE.Group();
    const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 1.05, 16), new THREE.MeshPhysicalMaterial({ color: "#e8d8f2", transparent: true, opacity: 0.6, transmission: 0.35, roughness: 0.2 }));
    sb.position.y = 0.72;
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.22, 12), new THREE.MeshStandardMaterial({ color: "#6b21a8" }));
    sc.position.y = 1.36;
    stain.add(sb, sc);
    stain.position.set(-1.9, 0, -1.6);
    stain.userData = { kind: "stain" };
    stain.traverse((o) => (o.userData.pickRoot = stain));
    handle.scene.add(stain);

    // kesilgan tilim (animatsiyada tushadi)
    const slice = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.6), new THREE.MeshStandardMaterial({ color: "#d98cc8", roughness: 0.55 }));
    slice.visible = false;
    slice.position.set(-1.2, 1.2, 1.1);
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
          specGroup.add(arc);
        }
      } else if (spec.texture === "leaf") {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.5, 26, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
        leaf.scale.set(1, 0.16, 0.72);
        leaf.position.y = 0.35;
        specGroup.add(leaf);
      } else if (spec.texture === "blood") {
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.85, 22, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.32 }));
        drop.scale.set(1, 0.32, 1);
        drop.position.y = 0.32;
        specGroup.add(drop);
      } else if (spec.texture === "muscle") {
        for (let i = 0; i < (cut ? 3 : 5); i++) {
          const fiber = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.9, 6, 12), new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, i * 0.025), roughness: 0.5 }));
          fiber.rotation.z = Math.PI / 2;
          fiber.position.set(0, 0.3 + (i % 2) * 0.24, -0.55 + i * 0.28);
          specGroup.add(fiber);
        }
      } else {
        const root = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 2.3, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
        root.position.y = 0.55;
        root.rotation.z = 0.35;
        specGroup.add(root);
      }
      specGroup.position.set(-1.2, 0, 1.1);
      if (sliceRef.current) {
        (sliceRef.current.material as THREE.MeshStandardMaterial).color.set(color);
        sliceRef.current.visible = cut;
        sliceRef.current.position.set(-0.15, 0.28, 1.35);
        sliceRef.current.rotation.set(0, 0.5, 0);
      }
    };
    rebuildSpec(null, false);
    rebuildRef.current = rebuildSpec;

    // bosish/siljitish
    const detachPointer = attachPointer(handle, canvas, {
      getRoots: () => [specGroup, knife, slide, stain, micro],
      moveRef,
      onPick: (root) => {
        const kind = root.userData.kind as string;
        const labels: Record<string, PickInfo> = {
          specimen: { icon: "🧫", label: "Namuna", desc: "Pichoqcha bilan kesiladi" },
          knife: { icon: "🔪", label: "Pichoqcha", desc: "Namunani kesish uchun" },
          slide: { icon: "🧫", label: "Preparat shishasi", desc: "Kesilgan namuna shu yerga qo'yiladi" },
          stain: { icon: "💧", label: "Bo'yovchi", desc: "Namunani bo'yash uchun" },
          microscope: { icon: "🔬", label: "Mikroskop", desc: "Preparatni ko'rish uchun" },
        };
        setPickInfo(labels[kind] ?? null);
        window.dispatchEvent(new CustomEvent("prep-tap", { detail: kind }));
      },
    });

    const stop = attachFrameHooks(handle, [
      (t) => {
        const idle = !cutAnimRef.current;
        if (idle) {
          knife.rotation.y = -0.5 + Math.sin(t * 0.8) * 0.12;
          knife.position.x += (-3.6 - knife.position.x) * 0.04;
          knife.position.y += (0.45 - knife.position.y) * 0.04;
        }
        micro.rotation.y = Math.sin(t * 0.22) * 0.16;
        // 🔪 TAYYORLASH ANIMATSIYASI — kesish / surtma / surish (namuna turiga qarab)
        const cut = cutAnimRef.current;
        if (cut) {
          const e = t - cut.t0;
          const sp = stateRef.current.specimenX ?? -1.2;
          const approach = (k: number) => {
            knife.position.x = -3.6 + (sp + 0.45 + 3.6) * k;
            knife.position.y = 0.45 + 1.75 * k;
            knife.rotation.y = -0.5;
          };
          if (cut.mode === "cut") {
            if (e < 0.5) {
              approach(e / 0.5);
            } else if (e < 0.85) {
              const k = (e - 0.5) / 0.35;
              knife.position.y = 2.2 - 1.85 * k;
              knife.rotation.y = -0.5;
            } else if (e < 1.7) {
              const k = (e - 0.85) / 0.85;
              const sl = sliceRef.current;
              if (sl && sl.visible) {
                sl.position.x = -0.15 - k * 1.15;
                sl.position.y = Math.max(0.28, 1.15 - k * 1.35);
                sl.rotation.z = k * 1.35;
              }
              knife.position.y = 0.35 + k * 0.6;
            } else {
              cutAnimRef.current = null;
            }
          } else if (cut.mode === "smear") {
            // 🩸 QON SURTMASI — kesilmaydi! Pichoq tomchini sekin surib yupqa qatlam qiladi
            if (e < 0.5) {
              approach(e / 0.5);
            } else if (e < 1.8) {
              const k = (e - 0.5) / 1.3;
              knife.position.x = sp - 1.0 + k * 2.1;
              knife.position.y = 0.42;
              knife.rotation.y = -0.35 + k * 0.7;
            } else if (e < 2.2) {
              const k = (e - 1.8) / 0.4;
              knife.position.y = 0.42 + k * 1.3;
            } else {
              cutAnimRef.current = null;
            }
          } else {
            // 👄 OG'IZ SHILLIQ QAVATI — surib olinadi (kesilmaydi)
            if (e < 0.5) {
              approach(e / 0.5);
            } else if (e < 1.7) {
              const k = (e - 0.5) / 1.2;
              knife.position.x = sp + Math.sin(k * Math.PI * 4) * 0.5;
              knife.position.y = 0.5 + Math.abs(Math.sin(k * Math.PI * 4)) * 0.12;
            } else if (e < 2.1) {
              const k = (e - 1.7) / 0.4;
              knife.position.y = 0.5 + k * 1.4;
            } else {
              cutAnimRef.current = null;
            }
          }
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

  // namuna tanlanganda 3D ni yangilash
  useEffect(() => {
    rebuildRef.current?.(specimen, stage >= 1 && prepKind(specimen) === "cut");
  }, [specimen, stage]);

  // 3D bosishlar
  useEffect(() => {
    const onTap = (e: Event) => {
      const kind = (e as CustomEvent).detail as string;
      const st = stateRef.current;
      if (kind === "specimen" && st.stage === 0 && st.hasSpecimen) doCut();
      else if (kind === "knife" && st.hasSpecimen) doCut();
      else if (kind === "stain" && st.stage >= 1) doStain();
      else if (kind === "slide" && st.stage >= 2) doLoad();
      else if (kind === "microscope" && st.stage >= 3) setStage(4);
    };
    window.addEventListener("prep-tap", onTap);
    return () => window.removeEventListener("prep-tap", onTap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specimen]);

  const pick = (s: Specimen) => {
    setSpecimen(s);
    setStage(0);
    push(`🔬 Namuna tanlandi: ${s.name} — ${s.stain} bilan bo'yaladi`);
  };
  /** Namuna tayyorlash turi: qon → surtma, og'iz → surish, qolganlari → kesish */
  const prepKind = (s: Specimen | null): "cut" | "smear" | "scrape" =>
    !s ? "cut" : s.texture === "blood" ? "smear" : s.texture === "cheek" ? "scrape" : "cut";
  const PREP_LABEL: Record<string, string> = {
    cut: "🔪 Kesish",
    smear: "🩸 Surtma tayyorlash",
    scrape: "👄 Surib olish",
  };
  const doCut = () => {
    if (!specimen || stage !== 0) return;
    const mode = prepKind(specimen);
    cutAnimRef.current = { t0: performance.now() / 1000, mode };
    setStage(1);
    push(
      mode === "cut"
        ? `🔪 ${specimen.name} dan pichoqcha bilan yupqa qatlam kesildi (animatsiya!)`
        : mode === "smear"
          ? `🩸 Qon KESILMAYDI — tomchi pichoq bilan surilib, yupqa surtma tayyorlandi!`
          : `👄 Og'iz hujayralari KESILMAYDI — sirtidan ehtiyotkorlik bilan surib olindi!`,
    );
  };
  const doStain = () => {
    if (!specimen || stage !== 1) return;
    setStage(2);
    push(`💧 Bo'yovchi qo'shildi (${specimen.stain}) — hujayralar yaxshi ko'rina boshladi`);
  };
  const doLoad = () => {
    if (!specimen || stage !== 2) return;
    setStage(3);
    push("🧫 Preparat mikroskop stoliga qo'yildi — ko'zdan olib ko'ring!");
  };

  const catalog: CatalogItem[] = [
    ...SPECIMENS.map((s) => ({ id: `s:${s.id}`, icon: s.name.slice(0, 2), name: s.name, group: "Namunalar", desc: s.tavsif })),
    { id: "t:knife", icon: "🔪", name: "Pichoqcha — tayyorlash (kesish/surtish)", group: "Asboblar", desc: "Qon va og'iz namunalari KESILMAYDI — surtma/surish usuli" },
    { id: "t:stain", icon: "💧", name: "Bo'yovchi qo'shish", group: "Asboblar" },
    { id: "t:load", icon: "🧫", name: "Mikroskopga qo'yish", group: "Asboblar" },
    { id: "t:view", icon: "🔬", name: "Ko'rish (ko'zdan)", group: "Asboblar" },
    { id: "t:reset", icon: "↺", name: "Boshidan boshlash", group: "Boshqaruv" },
  ];
  const handleAdd = (id: string) => {
    if (id.startsWith("s:")) {
      const s = SPECIMENS.find((x) => x.id === id.slice(2));
      if (s) pick(s);
    } else if (id === "t:knife") doCut();
    else if (id === "t:stain") doStain();
    else if (id === "t:load") doLoad();
    else if (id === "t:view") stage >= 3 && setStage(4);
    else if (id === "t:reset") {
      setStage(0);
      setSpecimen(null);
      setLog([]);
    }
  };

  return (
    <StageBox title="🧫 Namuna tayyorlash va mikroskop" catalog={catalog} onAdd={handleAdd}>
      <div className="relative">
        <canvas ref={canvasRef} className="lab-canvas h-[290px] w-full rounded-2xl bg-slate-100" />
        <CameraPad handleRef={handleRef} />
        <PickCard
          info={pickInfo}
          moving={moving}
          onMove={() => {
            const kind = pickInfo?.label ?? "";
            const root =
              kind === "Pichoqcha" ? knifeRef.current : kind === "Namuna" ? null : null;
            // barcha asboblar siljitiladi (soddalik uchun pichoqcha/namuna)
            const target = root ?? knifeRef.current;
            if (target) {
              moveRef.current = moving ? null : target;
              setMoving(!moving);
            }
          }}
          onClose={() => {
            setPickInfo(null);
            moveRef.current = null;
            setMoving(false);
          }}
        />
      </div>
      <p className="px-1 pb-1 pt-1.5 text-center text-xs text-slate-400">
        🖐 Asbobni <b>bosing</b> — nomi chiqadi · 🔀 Siljitish bilan joylashtiring · 🎮 joystik — atrofni ko'rish
      </p>

      {/* Bosqichlar */}
      <div className="rounded-3xl bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tayyorlash bosqichlari</p>
        <div className="mt-2 space-y-1.5">
          {STAGE_LABEL.map((l, i) => (
            <div key={l} className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm ${i === stage ? "bg-teal-50 font-semibold text-teal-800" : i < stage ? "text-slate-400 line-through" : "text-slate-500"}`}>
              <span>{i < stage ? "✅" : i === stage ? "👉" : "⬜"}</span>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!specimen && <p className="text-xs text-slate-400">Avval <b>＋ Qo'shish</b> → <b>Namunalar</b> bo'limidan namuna tanlang.</p>}
          {specimen && stage === 0 && (
            <button onClick={doCut} className="rounded-2xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.97]">{PREP_LABEL[prepKind(specimen)]}</button>
          )}
          {stage === 1 && (
            <button onClick={doStain} className="rounded-2xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.97]">💧 Bo'yash</button>
          )}
          {stage === 2 && (
            <button onClick={doLoad} className="rounded-2xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.97]">🧫 Mikroskopga qo'yish</button>
          )}
          {stage === 3 && (
            <button onClick={() => setStage(4)} className="rounded-2xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.97]">🔬 Ko'zdan ko'rish</button>
          )}
          {stage >= 3 && (
            <button onClick={() => setStage(3)} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 active:scale-[0.97]">↩️ Orqaga</button>
          )}
        </div>
      </div>

      {/* Mikroskop ko'rinishi */}
      {stage === 4 && specimen && (
        <div className="rounded-3xl bg-slate-900 p-4 shadow-[0_12px_36px_rgba(15,23,42,0.18)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">🔬 Mikroskop ko'rinishi — {specimen.name}</p>
          <div className="mt-3">
            <SpecimenView texture={specimen.texture} zoom={mag} focus={focus} light={light} />
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-slate-300">Kattalashtirish (obyektiv):</p>
              <div className="mt-1.5 flex gap-1.5">
                {(
                  [
                    [1, "×40"],
                    [2.2, "×100"],
                    [4.5, "×400"],
                  ] as const
                ).map(([z, l]) => (
                  <button key={l} onClick={() => setMag(z)} className={`${labChip} ${mag === z ? "bg-teal-500 text-white" : "bg-slate-700 text-slate-200"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-300">Fokus (aniqlik): {Math.round(focus * 100)}%</p>
              <input type="range" min={0.15} max={1} step={0.01} value={focus} onChange={(e) => setFocus(Number(e.target.value))} className="w-full accent-teal-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-300">Yorug'lik: {Math.round(light * 100)}%</p>
              <input type="range" min={0.15} max={1} step={0.01} value={light} onChange={(e) => setLight(Number(e.target.value))} className="w-full accent-teal-400" />
            </div>
            <p className="rounded-2xl bg-slate-800 p-3 text-xs text-slate-300">💡 {specimen.tavsif}</p>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="rounded-3xl bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Jurnal</p>
          <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
            {log.map((l, i) => (
              <p key={i} className="rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{l}</p>
            ))}
          </div>
        </div>
      )}
    </StageBox>
  );
}
