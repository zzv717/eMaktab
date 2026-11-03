// 🔬 3D Biologiya — hujayra tuzilishi, mitoz va meyoz (bosqichlar real)
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MEIOSIS, MITOSIS, ORGANELLES, type DivisionStage, type Organelle } from "./engine";
import { attachFrameHooks, createScene, type SceneHandle } from "./three-utils";
import PrepLab from "./PrepLab";

type Mode = "cell" | "prep" | "mitosis" | "meiosis";

export default function BioLab() {
  const [mode, setMode] = useState<Mode>("cell");
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["cell", "🔬 Hujayra tuzilishi"],
            ["prep", "🧫 Namuna + mikroskop"],
            ["mitosis", "🧬 Mitoz"],
            ["meiosis", "🧬 Meyoz"],
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
      {mode === "cell" && <CellLab />}
      {mode === "prep" && <PrepLab />}
      {mode === "mitosis" && <DivisionLab stages={MITOSIS} meiosis={false} />}
      {mode === "meiosis" && <DivisionLab stages={MEIOSIS} meiosis={true} />}
    </div>
  );
}

const card = "rounded-3xl bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]";
const chip = "rounded-full px-3 py-1.5 text-sm font-medium transition";

// ============================== 🔬 HUJAYRA TUZILISHI ==============================

function CellLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const opacityRef = useRef(0.82);
  const highlightRef = useRef<string | null>(null);
  const plantRef = useRef(false);

  const [plant, setPlant] = useState(false);
  const [opacity, setOpacity] = useState(0.82);
  const [info, setInfo] = useState<Organelle | null>(ORGANELLES.find((o) => o.id === "nucleus") ?? null);

  opacityRef.current = opacity;
  highlightRef.current = info?.id ?? null;
  plantRef.current = plant;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 8.5 });
    handleRef.current = handle;

    const build = () => {
      // eskisini tozalash
      for (const child of [...handle.scene.children]) {
        if (child.userData?.lab === "cell") handle.scene.remove(child);
      }
      const root = new THREE.Group();
      root.userData.lab = "cell";
      const isPlant = plantRef.current;

      // membrana
      const mem = new THREE.Mesh(
        new THREE.SphereGeometry(3.05, 48, 32),
        new THREE.MeshPhysicalMaterial({ color: "#9fd8c8", transparent: true, opacity: 0.22, transmission: 0.55, roughness: 0.25, thickness: 0.6, side: THREE.DoubleSide }),
      );
      mem.name = "membrane";
      root.add(mem);
      if (isPlant) {
        const wall = new THREE.Mesh(
          new THREE.SphereGeometry(3.45, 40, 28),
          new THREE.MeshStandardMaterial({ color: "#c9a86a", transparent: true, opacity: 0.3, roughness: 0.7, side: THREE.DoubleSide }),
        );
        wall.name = "wall";
        root.add(wall);
      }
      // sitoplazma
      const cyto = new THREE.Mesh(
        new THREE.SphereGeometry(2.98, 40, 28),
        new THREE.MeshStandardMaterial({ color: "#dcecf5", transparent: true, opacity: 0.35, roughness: 0.6 }),
      );
      cyto.name = "cytoplasm";
      root.add(cyto);

      // yadro + yadrocha
      const nuc = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 24), new THREE.MeshStandardMaterial({ color: "#7b6fd0", roughness: 0.45, transparent: true, opacity: 0.92 }));
      nuc.position.set(-0.55, 0.35, 0.4);
      nuc.name = "nucleus";
      root.add(nuc);
      const nuc2 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: "#5b4fb8", roughness: 0.5 }));
      nuc2.position.copy(nuc.position).add(new THREE.Vector3(0.15, 0.12, 0.18));
      nuc2.name = "nucleolus";
      root.add(nuc2);

      // mitoxondriyalar
      for (let i = 0; i < (isPlant ? 5 : 7); i++) {
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.62, 8, 16), new THREE.MeshStandardMaterial({ color: "#e2704f", roughness: 0.5 }));
        const ang = (i / 7) * Math.PI * 2;
        m.position.set(Math.cos(ang) * (1.9 + (i % 3) * 0.35), Math.sin(ang * 1.4) * 1.4, Math.sin(ang) * 1.7);
        m.rotation.set(Math.random(), ang, Math.random() * 0.6);
        m.name = "mito";
        root.add(m);
      }
      // ribosomalar
      for (let i = 0; i < 26; i++) {
        const r = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), new THREE.MeshStandardMaterial({ color: "#77a06a", roughness: 0.7 }));
        const ang = Math.random() * Math.PI * 2;
        const rad = 1.2 + Math.random() * 1.55;
        r.position.set(Math.cos(ang) * rad, (Math.random() - 0.5) * 2.6, Math.sin(ang) * rad);
        r.name = "ribo";
        root.add(r);
      }
      // ER
      for (let i = 0; i < 3; i++) {
        const pts: THREE.Vector3[] = [];
        for (let j = 0; j <= 10; j++) {
          const t = j / 10;
          pts.push(new THREE.Vector3(-0.2 + Math.sin(t * 5 + i) * 0.85 + i * 0.28, -1.15 + t * 1.75, 1.15 + Math.cos(t * 4 + i) * 0.5));
        }
        const er = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.11, 8, false), new THREE.MeshStandardMaterial({ color: "#6fa8d6", roughness: 0.55 }));
        er.name = "er";
        root.add(er);
      }
      // Golji
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.52 - i * 0.045, 0.115, 10, 28), new THREE.MeshStandardMaterial({ color: "#e8b13c", roughness: 0.5 }));
        t.position.set(1.25, -0.75 + i * 0.24, -0.85);
        t.rotation.x = Math.PI / 2.25;
        t.name = "golgi";
        root.add(t);
      }
      if (!isPlant) {
        // lizosomalar
        for (let i = 0; i < 5; i++) {
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10), new THREE.MeshStandardMaterial({ color: "#c86b98", roughness: 0.5 }));
          l.position.set(-1.75 + (i % 3) * 0.55, -1.35 + Math.floor(i / 3) * 0.55, -1.15 + (i % 2) * 0.6);
          l.name = "lyso";
          root.add(l);
        }
        // sentriollar
        for (let i = 0; i < 2; i++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 12), new THREE.MeshStandardMaterial({ color: "#8d99ae", metalness: 0.35, roughness: 0.45 }));
          c.position.set(0.95 + i * 0.34, 1.15, 0.55);
          c.rotation.set(i ? Math.PI / 2 : 0, 0, i ? 0 : Math.PI / 5);
          c.name = "centriole";
          root.add(c);
        }
        // kichik vakuolalar
        for (let i = 0; i < 2; i++) {
          const v = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), new THREE.MeshStandardMaterial({ color: "#7fc4e8", transparent: true, opacity: 0.55, roughness: 0.25 }));
          v.position.set(1.65 - i * 0.55, 1.3 - i * 1.1, 1.35);
          v.name = "vac";
          root.add(v);
        }
      } else {
        // katta markaziy vakuola
        const v = new THREE.Mesh(new THREE.SphereGeometry(1.55, 32, 22), new THREE.MeshStandardMaterial({ color: "#7fc4e8", transparent: true, opacity: 0.45, roughness: 0.2 }));
        v.position.set(0.55, -0.25, -0.15);
        v.name = "vac";
        root.add(v);
        // xloroplastlar
        for (let i = 0; i < 6; i++) {
          const c = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), new THREE.MeshStandardMaterial({ color: "#4c9a4c", roughness: 0.5 }));
          c.scale.set(1.65, 0.72, 1);
          const ang = (i / 6) * Math.PI * 2;
          c.position.set(Math.cos(ang) * 2.35, Math.sin(ang * 1.6) * 1.65, Math.sin(ang) * 1.55);
          c.name = "chloro";
          root.add(c);
        }
      }
      handle.scene.add(root);
    };
    build();
    const rebuildRef = { current: build };

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      ptr.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ptr, handle.camera);
      const root = handle.scene.children.find((c) => c.userData?.lab === "cell");
      if (!root) return;
      const hits = ray.intersectObjects(root.children, true);
      if (hits.length === 0) return;
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.name) o = o.parent;
      const found = ORGANELLES.find((x) => x.id === o?.name);
      if (found) setInfo(found);
    };
    canvas.addEventListener("click", onClick);

    const stop = attachFrameHooks(handle, [
      (t) => {
        const root = handle.scene.children.find((c) => c.userData?.lab === "cell");
        if (!root) return;
        root.rotation.y = t * 0.12;
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (["membrane", "wall", "cytoplasm"].includes(mesh.name)) return;
          const hl = highlightRef.current === mesh.name;
          mat.emissive = new THREE.Color(hl ? "#ffd76a" : "#000000");
          mat.emissiveIntensity = hl ? 0.55 + Math.sin(t * 4) * 0.18 : 0;
        });
        const mem = root.getObjectByName("membrane") as THREE.Mesh | undefined;
        const wall = root.getObjectByName("wall") as THREE.Mesh | undefined;
        const cyto = root.getObjectByName("cytoplasm") as THREE.Mesh | undefined;
        if (mem) ((mem.material as THREE.MeshPhysicalMaterial).opacity = 0.1 + opacityRef.current * 0.16);
        if (wall) ((wall.material as THREE.MeshStandardMaterial).opacity = 0.08 + opacityRef.current * 0.26);
        if (cyto) ((cyto.material as THREE.MeshStandardMaterial).opacity = 0.05 + opacityRef.current * 0.34);
      },
    ]);

    const onRebuild = () => rebuildRef.current();
    window.addEventListener("biolab-rebuild", onRebuild);
    return () => {
      stop();
      window.removeEventListener("biolab-rebuild", onRebuild);
      canvas.removeEventListener("click", onClick);
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("biolab-rebuild"));
  }, [plant]);

  return (
    <div>
      <div className={`${card} mb-3 p-2`}>
        <canvas ref={canvasRef} className="h-[300px] w-full rounded-2xl" />
        <p className="px-2 pb-1 pt-1.5 text-center text-xs text-slate-400">
          🖐 Aylantiring · organoidni <b>bosing</b> — ma'lumot chiqadi
        </p>
      </div>

      <div className={`${card} mb-3`}>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPlant(false)} className={`${chip} ${!plant ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>
            🐾 Hayvon hujayrasi
          </button>
          <button onClick={() => setPlant(true)} className={`${chip} ${plant ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>
            🌿 O'simlik hujayrasi
          </button>
        </div>
        <p className="mt-3 text-sm font-medium text-slate-700">Qatlam shaffofligi (membranani ochish):</p>
        <input type="range" min={0} max={1} step={0.02} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-teal-700" />
      </div>

      {info && (
        <div className={`${card} mb-3`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Organoid</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{info.name}</p>
          <p className="mt-1 text-sm text-slate-600">{info.funksiya}</p>
        </div>
      )}

      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Organoidlar ro'yxati</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ORGANELLES.filter((o) => (plant ? o.turi !== "animal" : o.turi !== "plant")).map((o) => (
            <button
              key={o.id}
              onClick={() => setInfo(o)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                info?.id === o.id ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================== 🧬 MITOZ / MEYOZ ==============================

function DivisionLab({ stages, meiosis }: { stages: DivisionStage[]; meiosis: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);
  const meiosisRef = useRef(meiosis);
  meiosisRef.current = meiosis;

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const stage = stages[Math.min(idx, stages.length - 1)];
  phaseRef.current = stage.phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas, { camZ: 8.5 });

    const cellMat = new THREE.MeshPhysicalMaterial({ color: "#9fd8c8", transparent: true, opacity: 0.22, transmission: 0.5, roughness: 0.3, thickness: 0.5, side: THREE.DoubleSide });
    const cell1 = new THREE.Mesh(new THREE.SphereGeometry(2.9, 40, 28), cellMat);
    const cell2 = new THREE.Mesh(new THREE.SphereGeometry(2.9, 40, 28), cellMat.clone());
    handle.scene.add(cell1, cell2);

    const nucMat = new THREE.MeshStandardMaterial({ color: "#7b6fd0", transparent: true, opacity: 0.35, roughness: 0.5 });
    const nuc1 = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 18), nucMat);
    const nuc2 = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 18), nucMat.clone());
    handle.scene.add(nuc1, nuc2);

    // xromosomalar: har biri ikkita xromatiddan (chap/o'ng)
    const chroms: { left: THREE.Mesh; right: THREE.Mesh; id: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: ["#e05a33", "#2f80ed", "#16a34a", "#c96f4a", "#8b5cf6", "#d9a23e"][i], roughness: 0.45 });
      const left = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.85, 6, 12), mat);
      const right = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.85, 6, 12), mat.clone());
      left.castShadow = true;
      right.castShadow = true;
      handle.scene.add(left, right);
      chroms.push({ left, right, id: i });
    }

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const stop = attachFrameHooks(handle, [
      (t, dt) => {
        const ph = phaseRef.current;
        const isMei = meiosisRef.current;
        // hujayra shakli
        if (ph < 5) {
          cell1.visible = true;
          cell2.visible = false;
          cell1.scale.set(1, 1, 1);
          cell1.position.x = 0;
        } else {
          // sitokinez — ikkiga bo'linadi
          cell1.visible = true;
          cell2.visible = true;
          cell1.position.x = lerp(0, -1.75, 0.75);
          cell2.position.x = lerp(0, 1.75, 0.75);
          cell1.scale.set(0.78, 0.92, 0.78);
          cell2.scale.set(0.78, 0.92, 0.78);
        }
        // yadrolar
        const showNuc = ph === 0 || ph === 4 || ph === 5;
        nuc1.visible = showNuc;
        nuc2.visible = ph >= 4;
        nuc1.position.set(ph >= 4 ? (ph === 5 ? -1.75 : -1.5) : 0, 0, 0);
        nuc2.position.set(ph === 5 ? 1.75 : 1.5, 0, 0);
        nuc1.scale.setScalar(ph === 0 ? 1 : 0.85);
        nuc2.scale.setScalar(0.85);

        // xromosomalar holati
        chroms.forEach((c, i) => {
          const ang = (i / 6) * Math.PI * 2;
          const scatter = new THREE.Vector3(Math.cos(ang) * 1.35, Math.sin(ang * 1.7) * 1.15, Math.sin(ang) * 1.15);
          let lTarget: THREE.Vector3;
          let rTarget: THREE.Vector3;
          let lRot = new THREE.Euler(0, ang, 0.5);
          if (ph === 0) {
            // iplar — deyarli ko'rinmaydi
            lTarget = scatter.clone().multiplyScalar(0.4);
            rTarget = scatter.clone().multiplyScalar(0.4).add(new THREE.Vector3(0.18, 0, 0));
            c.left.scale.setScalar(0.35);
            c.right.scale.setScalar(0.35);
          } else if (ph === 1) {
            lTarget = scatter;
            rTarget = scatter.clone().add(new THREE.Vector3(0.32, 0, 0));
            c.left.scale.setScalar(1);
            c.right.scale.setScalar(1);
          } else if (ph === 2) {
            // ekvator
            lTarget = new THREE.Vector3(-0.18, 0, (i - 2.5) * 0.62);
            rTarget = new THREE.Vector3(0.18, 0, (i - 2.5) * 0.62);
            lRot = new THREE.Euler(0, 0, 0);
          } else if (ph === 3) {
            if (isMei) {
              // meioz I — butun X kutublarga
              const side = i < 3 ? -1 : 1;
              lTarget = new THREE.Vector3(side * 1.75 - 0.18, 0, (i % 3 - 1) * 0.62);
              rTarget = new THREE.Vector3(side * 1.75 + 0.18, 0, (i % 3 - 1) * 0.62);
            } else {
              // mitoz — xromatidalar ajraladi
              const side = i < 3 ? -1 : 1;
              lTarget = new THREE.Vector3(side * 1.75, 0, (i - 2.5) * 0.38);
              rTarget = new THREE.Vector3(side * 1.75, 0, (i - 2.5) * 0.38 + 0.2);
            }
            lRot = new THREE.Euler(0, 0, 0);
          } else {
            // telofaza/sitokinez — kutublar atrofida
            const side = i < 3 ? -1 : 1;
            const x = ph === 5 ? side * 1.75 : side * 1.55;
            lTarget = new THREE.Vector3(x - 0.16, scatter.y * 0.4, scatter.z * 0.5);
            rTarget = new THREE.Vector3(x + 0.16, scatter.y * 0.4, scatter.z * 0.5);
          }
          c.left.position.lerp(lTarget, Math.min(1, dt * 3.2));
          c.right.position.lerp(rTarget, Math.min(1, dt * 3.2));
          c.left.rotation.x = lerp(c.left.rotation.x, lRot.x, Math.min(1, dt * 3));
          c.left.rotation.z = lerp(c.left.rotation.z, lRot.z, Math.min(1, dt * 3));
          c.right.rotation.copy(c.left.rotation);
          const hide = ph === 0;
          c.left.visible = !hide;
          c.right.visible = !hide;
        });
      },
    ]);

    return () => {
      stop();
      handle.dispose();
    };
  }, []);

  // avtomatik ijro
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIdx((i) => (i + 1) % stages.length), 3200);
    return () => window.clearInterval(timer);
  }, [playing, stages.length]);

  return (
    <div>
      <div className={`${card} mb-3 p-2`}>
        <canvas ref={canvasRef} className="h-[290px] w-full rounded-2xl" />
        <p className="px-2 pb-1 pt-1.5 text-center text-xs text-slate-400">
          {meiosis ? "🧬 Meyoz — 4 ta haploid jinsiy hujayra" : "🧬 Mitoz — 2 ta bir xil hujayra"} · 🖐 aylantiring
        </p>
      </div>

      <div className={`${card} mb-3`}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-slate-900">{stage.name}</p>
          <button onClick={() => setPlaying((p) => !p)} className={`${chip} ${playing ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>
            {playing ? "⏸ Pauza" : "▶️ Ijro"}
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">{stage.tavsif}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {stages.map((s2, i) => (
            <button
              key={s2.id}
              onClick={() => {
                setIdx(i);
                setPlaying(false);
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${i === idx ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {s2.name.split(" ")[0]}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={stages.length - 1}
          step={1}
          value={idx}
          onChange={(e) => {
            setIdx(Number(e.target.value));
            setPlaying(false);
          }}
          className="mt-3 w-full accent-teal-700"
        />
      </div>

      <div className={`${card} mb-3`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bu nimaga kerak?</p>
        <p className="mt-1.5 text-sm text-slate-600">
          {meiosis
            ? "Meyoz — jinsiy hujayralar (spermatozoid va tuxumhujayra) hosil bo'ladi. Krossingover va tasodifiy ajralish tufayli har bir bola ota-onalardan FARQLI irsiy to'plam oladi."
            : "Mitoz — o'sish va shikastlangan to'qimalarni tiklash uchun hujayralar sonini ko'paytiradi. Natijada genetik jihatdan bir xil ikkita hujayra hosil bo'ladi."}
        </p>
      </div>
    </div>
  );
}
