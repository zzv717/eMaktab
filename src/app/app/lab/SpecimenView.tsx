// 🔬 Mikroskop ko'rinishi — namunalarning protsedural teksturasi (haqiqiy hujayra tuzilmalari)
"use client";

import { useEffect, useRef } from "react";
import type { Specimen } from "./engine";

/** Namuna teksturasini chizadi — kattalashtirish darajasiga qarab hujayra o'lchami o'zgaradi. */
export function drawSpecimen(ctx: CanvasRenderingContext2D, w: number, h: number, kind: Specimen["texture"], zoom: number) {
  const rnd = mulberry32(42);
  ctx.fillStyle = "#f5f1e8";
  ctx.fillRect(0, 0, w, h);
  const cell = Math.max(18, (kind === "blood" ? 16 : 56) * zoom);

  if (kind === "onion") {
    // g'isht shaklidagi o'simlik hujayralari
    ctx.fillStyle = "#e8d3ea";
    for (let y = -cell; y < h + cell; y += cell * 0.72) {
      for (let x = -cell; x < w + cell; x += cell) {
        const off = (Math.round(y / (cell * 0.72)) % 2) * cell * 0.5;
        ctx.strokeStyle = "#9b6bb0";
        ctx.lineWidth = Math.max(1.2, zoom * 1.1);
        ctx.strokeRect(x + off + 2, y + 2, cell - 4, cell * 0.72 - 4);
        ctx.fillStyle = "rgba(221,180,232,0.35)";
        ctx.fillRect(x + off + 3, y + 3, cell - 6, cell * 0.72 - 6);
        ctx.beginPath();
        ctx.arc(x + off + cell * 0.5, y + cell * 0.36, cell * 0.11, 0, Math.PI * 2);
        ctx.fillStyle = "#5b2c6f";
        ctx.fill();
      }
    }
  } else if (kind === "cheek") {
    // yumaloq hayvon hujayralari
    for (let i = 0; i < Math.floor((w * h) / (cell * cell * 1.4)); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = cell * (0.36 + rnd() * 0.22);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.72 + rnd() * 0.3), rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(233,180,200,0.55)";
      ctx.fill();
      ctx.strokeStyle = "#b0567c";
      ctx.lineWidth = Math.max(1, zoom);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + (rnd() - 0.5) * r * 0.4, y + (rnd() - 0.5) * r * 0.4, r * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = "#6a3d7d";
      ctx.fill();
    }
  } else if (kind === "leaf") {
    ctx.fillStyle = "#b9d9a2";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.floor((w * h) / (cell * cell * 0.8)); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.22 * (0.7 + rnd() * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(58,124,58,0.55)";
      ctx.fill();
    }
    // stomalar
    for (let i = 0; i < 4 + Math.floor(zoom); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = cell * 0.55;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.62, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.strokeStyle = "#2f6b2f";
      ctx.lineWidth = Math.max(1.5, zoom * 1.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.28, r * 0.5, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = "#254d25";
      ctx.fill();
    }
  } else if (kind === "blood") {
    ctx.fillStyle = "#f2e3d8";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.floor((w * h) / (cell * cell * 0.55)); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = cell * 0.42;
      const grd = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.15, x, y, r);
      grd.addColorStop(0, "#e56b6b");
      grd.addColorStop(0.75, "#b02a2a");
      grd.addColorStop(1, "#7c1d1d");
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = cell * 0.85;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#c9b6e0";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = "#5b3d8f";
      ctx.fill();
    }
  } else if (kind === "muscle") {
    ctx.fillStyle = "#d98f7e";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += cell * 0.55) {
      ctx.fillStyle = y % (cell * 1.1) < cell * 0.55 ? "rgba(178,82,62,0.55)" : "rgba(240,190,175,0.6)";
      ctx.fillRect(0, y, w, cell * 0.5);
      ctx.strokeStyle = "rgba(120,42,28,0.6)";
      ctx.lineWidth = Math.max(1, zoom * 0.9);
      ctx.beginPath();
      ctx.moveTo(0, y + cell * 0.52);
      ctx.lineTo(w, y + cell * 0.52);
      ctx.stroke();
    }
  } else if (kind === "root") {
    // root — bo'linayotgan hujayralar (mitoz)
    ctx.fillStyle = "#ead9a8";
    ctx.fillRect(0, 0, w, h);
    for (let y = -cell * 0.5; y < h + cell; y += cell * 0.8) {
      for (let x = -cell * 0.5; x < w + cell; x += cell * 0.9) {
        ctx.strokeStyle = "#a8873c";
        ctx.lineWidth = Math.max(1, zoom);
        ctx.strokeRect(x, y, cell * 0.86, cell * 0.76);
        const phase = rnd();
        if (phase < 0.14) {
          // metafaza — xromosomalar ekvatorda
          ctx.fillStyle = "#5b2c6f";
          for (let c = 0; c < 4; c++) ctx.fillRect(x + cell * 0.18 + c * cell * 0.16, y + cell * 0.34, cell * 0.1, cell * 0.16);
        } else if (phase < 0.24) {
          // anafaza — ikki tomonga
          ctx.fillStyle = "#5b2c6f";
          for (let c = 0; c < 3; c++) {
            ctx.fillRect(x + cell * 0.12 + c * cell * 0.12, y + cell * 0.16, cell * 0.08, cell * 0.14);
            ctx.fillRect(x + cell * 0.52 + c * cell * 0.12, y + cell * 0.5, cell * 0.08, cell * 0.14);
          }
        } else {
          ctx.beginPath();
          ctx.arc(x + cell * 0.43, y + cell * 0.38, cell * 0.13, 0, Math.PI * 2);
          ctx.fillStyle = "#7b4f9e";
          ctx.fill();
        }
      }
    }
  } else if (kind === "nerve") {
    // 🧠 asab hujayrasi — yulduz shaklidagi tanasi + uzun o'simtalar
    ctx.fillStyle = "#f3e6c8";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.floor((w * h) / (cell * cell * 3.2)); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = cell * 0.34;
      // dendritlar
      ctx.strokeStyle = "#b8873c";
      ctx.lineWidth = Math.max(1.2, zoom * 1.1);
      for (let b = 0; b < 6; b++) {
        const ang = rnd() * Math.PI * 2;
        const len = cell * (1.2 + rnd() * 1.4);
        ctx.beginPath();
        ctx.moveTo(x, y);
        const mx = x + Math.cos(ang) * len * 0.6;
        const my = y + Math.sin(ang) * len * 0.6;
        const ex = x + Math.cos(ang + (rnd() - 0.5) * 0.8) * len;
        const ey = y + Math.sin(ang + (rnd() - 0.5) * 0.8) * len;
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
      }
      // tana
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.85, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(216,180,106,0.85)";
      ctx.fill();
      ctx.strokeStyle = "#8a5f22";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + r * 0.12, y, r * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = "#6b4620";
      ctx.fill();
    }
  } else if (kind === "bone") {
    // 🦴 suyak — osteon halqalari
    ctx.fillStyle = "#efe6d2";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.floor((w * h) / (cell * cell * 1.6)); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      for (let ring = 3; ring >= 1; ring--) {
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.16 * ring, 0, Math.PI * 2);
        ctx.strokeStyle = ring % 2 ? "#b8a077" : "#d3c19b";
        ctx.lineWidth = Math.max(1.4, zoom * 1.2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.075, 0, Math.PI * 2);
      ctx.fillStyle = "#5c4626";
      ctx.fill();
    }
  } else if (kind === "fat") {
    // 🧈 yog' hujayralari — katta tomchilar, yadro chetda
    ctx.fillStyle = "#f7ecd0";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.floor((w * h) / (cell * cell * 1.15)); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = cell * (0.42 + rnd() * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(246,224,150,0.9)";
      ctx.fill();
      ctx.strokeStyle = "#c9a94e";
      ctx.lineWidth = Math.max(1.3, zoom);
      ctx.stroke();
      // yadro chetda
      ctx.beginPath();
      ctx.arc(x + r * 0.72, y + r * 0.2, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = "#8a6a2c";
      ctx.fill();
    }
  } else if (kind === "fungi") {
    // 🍄 qo'ziqorin — gifalar to'ri + sporalar
    ctx.fillStyle = "#e8ddf2";
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    for (let i = 0; i < 26 + Math.floor(zoom * 6); i++) {
      let x = rnd() * w;
      let y = rnd() * h;
      ctx.strokeStyle = "rgba(122,72,178,0.75)";
      ctx.lineWidth = Math.max(1.6, zoom * 1.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let seg = 0; seg < 6; seg++) {
        x += (rnd() - 0.5) * cell * 1.6;
        y += (rnd() - 0.5) * cell * 1.6;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < Math.floor((w * h) / (cell * cell * 2.2)); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.13 * (0.7 + rnd() * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(90,46,140,0.8)";
      ctx.fill();
    }
  } else {
    // 🦠 bakteriyalar — tayoqchalar va sharlar
    ctx.fillStyle = "#dff2e8";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.floor((w * h) / (cell * cell * 0.5)); i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const ang = rnd() * Math.PI * 2;
      const rod = rnd() > 0.45;
      if (rod) {
        const L = cell * (0.32 + rnd() * 0.22);
        const W = cell * 0.13;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.roundRect(-L / 2, -W / 2, L, W, W / 2);
        ctx.fillStyle = "rgba(36,138,98,0.82)";
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.11 * (0.8 + rnd() * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(36,138,98,0.82)";
        ctx.fill();
      }
    }
  }
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function SpecimenView({
  texture,
  zoom, // 1 = ×40, 2.2 = ×100, 4.5 = ×400
  focus, // 0..1 (1 = aniq)
  light, // 0..1
}: {
  texture: Specimen["texture"];
  zoom: number;
  focus: number;
  light: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef({ x: 420, y: 420 }); // katta kartadagi ko'rinadigan oyna
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Katta namuna kartasi (2x) — sudrab boshqa joylarini ko'rish mumkin
    const big = document.createElement("canvas");
    big.width = 1480;
    big.height = 1480;
    const bctx = big.getContext("2d");
    if (!bctx) return;
    drawSpecimen(bctx, big.width, big.height, texture, zoom);
    const render = () => {
      panRef.current.x = Math.max(0, Math.min(big.width - canvas.width, panRef.current.x));
      panRef.current.y = Math.max(0, Math.min(big.height - canvas.height, panRef.current.y));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(big, panRef.current.x, panRef.current.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    };
    render();

    // 🖐 SENSOR bilan sudrab ko'rish (joystik shart emas)
    const el = wrapRef.current;
    if (!el) return;
    const onDown = (ev: PointerEvent) => {
      dragRef.current = { x: ev.clientX, y: ev.clientY };
      el.setPointerCapture(ev.pointerId);
      el.style.cursor = "grabbing";
    };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const k = big.width / canvas.width;
      panRef.current.x -= (ev.clientX - d.x) * k;
      panRef.current.y -= (ev.clientY - d.y) * k;
      d.x = ev.clientX;
      d.y = ev.clientY;
      render();
    };
    const onUp = () => {
      dragRef.current = null;
      el.style.cursor = "grab";
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [texture, zoom]);

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative mx-auto aspect-square w-full max-w-[320px] cursor-grab overflow-hidden rounded-full border-[10px] border-slate-800 bg-black shadow-inner"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          width={640}
          height={640}
          className="h-full w-full"
          style={{
            filter: `blur(${(1 - focus) * 4}px) brightness(${0.55 + light * 0.85}) contrast(${1 + light * 0.15})`,
            transition: "filter 0.25s",
          }}
        />
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]" />
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">🖐 Barmoq bilan <b>sudrab</b> namunaning boshqa joylarini ko'ring</p>
    </div>
  );
}
