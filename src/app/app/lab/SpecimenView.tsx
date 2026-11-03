// 🔬 Mikroskop ko'rinishi — namunalarning protsedural teksturasi (haqiqiy hujayra tuzilmalari)
"use client";

import { useEffect, useRef } from "react";
import type { Specimen } from "./engine";

/** Namuna teksturasini chizadi — kattalashtirish darajasiga qarab hujayra o'lchami o'zgaradi. */
function drawSpecimen(ctx: CanvasRenderingContext2D, w: number, h: number, kind: Specimen["texture"], zoom: number) {
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
  } else {
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
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawSpecimen(ctx, canvas.width, canvas.height, texture, zoom);
  }, [texture, zoom]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-full border-[10px] border-slate-800 bg-black shadow-inner">
      <canvas
        ref={canvasRef}
        width={640}
        height={640}
        className="h-full w-full"
        style={{
          filter: `blur(${(1 - focus) * 4}px) brightness(${0.55 + light * 0.85}) contrast(${1 + light * 0.15})`,
          transform: `scale(${1 + (zoom - 1) * 0.12})`,
          transition: "filter 0.25s, transform 0.25s",
        }}
      />
      <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]" />
    </div>
  );
}
