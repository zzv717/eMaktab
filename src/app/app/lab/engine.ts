// 🧪🔬⚡ Laboratoriya fanlari — haqiqiy hisob-kitob dvigateli (3D sahifalar shu yerdan foydalanadi)
// Kimyo: reaksiya qoidalari (pH, rang, cho'kma, gaz, harorat)
// Fizika: MNA (Kirchgof) bo'yicha zanjir yechimi, Hooke, ingichka linza
// Biologiya: organoidlar va bo'linish bosqichlari kontenti

// ============================== 🧪 KIMYO ==============================

export type ReagentKind = "acid" | "base" | "carbonate" | "salt" | "indicator" | "metal" | "water";

export interface Reagent {
  id: string;
  name: string;
  formula: string;
  kind: ReagentKind;
  /** kislota-ishqor kuchi (ekvivalent/L hisobida) */
  strength: number;
  /** sof eritma rangi (suv oqimiga qo'shilganda) */
  color: string;
  /** qo'shimcha ion rangi (masalan Cu2+ ko'k) */
  ionColor?: string;
  info: string;
}

export const REAGENTS: Reagent[] = [
  { id: "hcl", name: "Suyultirilgan xlorid kislota", formula: "HCl", kind: "acid", strength: 1, color: "#e8f4ff", info: "Kuchli kislota. Metallar va ishqorlar bilan reaksiyaga kirishadi." },
  { id: "h2so4", name: "Suyultirilgan oltingugurt kislota", formula: "H₂SO₄", kind: "acid", strength: 1, color: "#eef7ff", info: "Kuchli kislota. Suv bilan aralashtirganda kuchli issiqlik ajraladi." },
  { id: "ch3cooh", name: "Sirkka kislota", formula: "CH₃COOH", kind: "acid", strength: 0.4, color: "#f2f7ee", info: "Kuchsiz kislota (o'ziga xos hidli)." },
  { id: "naoh", name: "Natriy gidroksid", formula: "NaOH", kind: "base", strength: 1, color: "#f0fff6", info: "Kuchli ishqor. Terini kuydiradi — ehtiyot bo'ling!" },
  { id: "caoh2", name: "Kalsiy gidroksid (ohak suvi)", formula: "Ca(OH)₂", kind: "base", strength: 0.5, color: "#f4fbf7", info: "Ohak suvi. CO₂ ga sutrang bo'ladi — sinaladigan gaz!" },
  { id: "nh3", name: "Ammiak eritmasi", formula: "NH₃·H₂O", kind: "base", strength: 0.5, color: "#f2fdf8", info: "Kuchsiz ishqor, o'ziga xos hidli." },
  { id: "na2co3", name: "Natriy karbonat (soda)", formula: "Na₂CO₃", kind: "carbonate", strength: 0.5, color: "#f6fbff", info: "Kislotalar bilan CO₂ gazi ajratadi." },
  { id: "caco3", name: "Kalsiy karbonat (tosh ohak)", formula: "CaCO₃", kind: "carbonate", strength: 0.5, color: "#f7f7f2", info: "Tabiiy ohak toshi. Kislotalar bilan ko'piklanadi." },
  { id: "nacl", name: "Natriy xlorid eritmasi", formula: "NaCl", kind: "salt", strength: 0, color: "#f4fbff", ionColor: "#dfeaf2", info: "Osh tuzi eritmasi." },
  { id: "agno3", name: "Kumush nitrat", formula: "AgNO₃", kind: "salt", strength: 0, color: "#f7f8fc", ionColor: "#e7e9f2", info: "Xlorid ionlari bilan oq cho'kma (AgCl) beradi." },
  { id: "cuso4", name: "Mis sulfat eritmasi", formula: "CuSO₄", kind: "salt", strength: 0, color: "#4f9fe0", ionColor: "#3f8fd8", info: "Ko'k rangli tuz. Faol metallar bilan almashinish reaksiyasiga kirishadi." },
  { id: "fecl3", name: "Temir(III) xlorid", formula: "FeCl₃", kind: "salt", strength: 0, color: "#d9a23e", ionColor: "#c98f2e", info: "Sariq-qo'ng'ir rangli tuz." },
  { id: "fen", name: "Fenolftalein (indikator)", formula: "C₂₀H₁₄O₄", kind: "indicator", strength: 0, color: "#f2f6ff", info: "pH < 8.2 — rangsiz, pH > 8.2 — PUSHTI rang!" },
  { id: "litmus", name: "Lakmus (indikator)", formula: "—", kind: "indicator", strength: 0, color: "#8a63c9", ionColor: "#7a55b8", info: "Kislota — QIZIL, ishqor — KO'K rang." },
  { id: "mo", name: "Metil sariq (indikator)", formula: "—", kind: "indicator", strength: 0, color: "#f2b705", ionColor: "#e0a600", info: "pH < 3.1 — QIZIL, pH > 4.4 — SARIQ rang." },
  { id: "btb", name: "Bromtimol ko'k (indikator)", formula: "—", kind: "indicator", strength: 0, color: "#3fae7a", ionColor: "#2f9e6a", info: "Kislota — SARIQ, neytral — YASHIL, ishqor — KO'K." },
  { id: "zn", name: "Rux metalli", formula: "Zn", kind: "metal", strength: 0, color: "#b9c2cc", info: "Faol metall. Kislotalar bilan vodorod gazi ajratadi." },
  { id: "mg", name: "Magniy metalli", formula: "Mg", kind: "metal", strength: 0, color: "#c9d2da", info: "Juda faol metall. Kislotalar bilan tez reaksiyaga kirishadi." },
  { id: "fe", name: "Temir parchasi", formula: "Fe", kind: "metal", strength: 0, color: "#8f9aa6", info: "Mis tuzlaridan misni siqib chiqaradi." },
  { id: "h2o", name: "Distillangan suv", formula: "H₂O", kind: "water", strength: 0, color: "#e9f5ff", info: "Sof suv — pH ≈ 7." },
];

export const REAGENT_MAP: Record<string, Reagent> = Object.fromEntries(REAGENTS.map((r) => [r.id, r]));

export type PourEvent = {
  text: string;
  kind: "gas" | "precipitate" | "color" | "heat" | "info";
};

export interface VesselContent {
  reagentId: string;
  ml: number;
}

export interface VesselState {
  contents: VesselContent[];
  temperature: number;
}

export interface SimResult {
  /** 0–14 yoki null (bo'sh idish) */
  ph: number | null;
  /** yakuniy suyuqlik rangi (hex) */
  color: string;
  /** 3D uchun: cho'kma (rang + nomi) */
  precipitate: { color: string; name: string } | null;
  /** 3D uchun: gaz (kobleriklar) */
  gas: { name: string } | null;
  temperature: number;
  umumiyMl: number;
  hodisalar: PourEvent[];
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${m.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Idishdagi aralashmaning holatini haqiqiy kimyo qoidalari bilan hisoblaydi.
 * Sof funksiya — test qilinadi.
 */
export function simulate(contents: VesselContent[], baseTemp = 20): SimResult {
  const hodisalar: PourEvent[] = [];
  if (contents.length === 0) {
    return { ph: null, color: "#e9f5ff", precipitate: null, gas: null, temperature: baseTemp, umumiyMl: 0, hodisalar };
  }
  const ml = (id: string) => contents.filter((c) => c.reagentId === id).reduce((s, c) => s + c.ml, 0);
  const total = contents.reduce((s, c) => s + c.ml, 0);
  const k = (id: string) => (ml(id) / 1000) * (REAGENT_MAP[id]?.strength ?? 0);

  const acidEq = ["hcl", "h2so4", "ch3cooh"].reduce((s, id) => s + k(id), 0);
  const baseEq = ["naoh", "caoh2", "nh3"].reduce((s, id) => s + k(id), 0);
  const carbEq = ["na2co3", "caco3"].reduce((s, id) => s + k(id), 0);

  // --- Harorat: neytrallanish (egzotermik) + kislota/metall + kislota/karbonat
  let temp = baseTemp;
  const neutral = Math.min(acidEq, baseEq);
  const acidMetall = ml("zn") + ml("mg") > 0 && acidEq > 0 ? Math.min(acidEq, 0.004 * (ml("zn") + ml("mg"))) : 0;
  const acidCarb = Math.min(acidEq - neutral, carbEq);
  const heatUnits = neutral * 900 + acidMetall * 1400 + Math.max(0, acidCarb) * 500;
  temp += Math.min(38, heatUnits * (60 / Math.max(120, total))); // suyultirishga qarab
  if (neutral > 0) hodisalar.push({ text: `Neytrallanish reaksiyasi — issiqlik ajraldi (+${Math.round(temp - baseTemp)}°C)`, kind: "heat" });

  // --- pH
  const excessAcid = acidEq - neutral - carbEq * 1.0;
  const excessBase = baseEq - neutral;
  let ph: number;
  const L = Math.max(30, total) / 1000; // umumiy hajm (L taxminan)
  if (excessAcid > 0.0001) ph = Math.max(0.3, -Math.log10(excessAcid / L));
  else if (excessBase > 0.0001) ph = Math.min(13.7, 14 + Math.log10(excessBase / L));
  else if (carbEq > 0 && acidEq === 0) ph = 8.4;
  else ph = 7;

  // --- Gaz: kislota + karbonat → CO₂; kislota + faol metall → H₂
  let gas: SimResult["gas"] = null;
  if (carbEq > 0 && acidEq > neutral) {
    gas = { name: "CO₂ (karbonat angidrid)" };
    hodisalar.push({ text: "CO₂ gazi ajralib chiqdi — kuchli ko'piklanish! 🫧", kind: "gas" });
    // Ohak suvi bo'lsa — sutsimonlashish (CaCO₃ cho'kmasi)
    if (ml("caoh2") > 0) {
      hodisalar.push({ text: "Ohak suvi sutsimon tus oldi — CaCO₃ cho'kmasi! 🥛", kind: "precipitate" });
    }
  } else if (acidEq > 0 && (ml("zn") > 0 || ml("mg") > 0)) {
    gas = { name: "H₂ (vodorod)" };
    hodisalar.push({ text: "Vodorod gazi ajralib chiqdi — mayda pufakchalar! 🫧", kind: "gas" });
  }

  // --- Cho'kmalar (eruvchanlik qoidalari)
  let precipitate: SimResult["precipitate"] = null;
  const hasCl = ml("hcl") > 0 || ml("nacl") > 0 || ml("fecl3") > 0;
  if (ml("agno3") > 0 && hasCl) {
    precipitate = { color: "#f2f2ee", name: "AgCl (oq cho'kma)" };
    hodisalar.push({ text: "Oq cho'kma tushdi — AgCl (kumush xlorid) ⚪", kind: "precipitate" });
  } else if (ml("cuso4") > 0 && (ml("naoh") > 0 || ml("caoh2") > 0)) {
    precipitate = { color: "#7fb4e8", name: "Cu(OH)₂ (ko'k cho'kma)" };
    hodisalar.push({ text: "Ko'k cho'kma tushdi — Cu(OH)₂ 🔵", kind: "precipitate" });
  } else if (ml("caoh2") > 0 && ml("na2co3") > 0) {
    precipitate = { color: "#efeee6", name: "CaCO₃ (oq cho'kma)" };
    hodisalar.push({ text: "Oq cho'kma tushdi — CaCO₃ ⚪", kind: "precipitate" });
  } else if (ml("cuso4") > 0 && (ml("fe") > 0 || ml("zn") > 0)) {
    precipitate = { color: "#b06a3b", name: "Cu (mis cho'kmasi)" };
    hodisalar.push({ text: "Metall yuzasida qo'ng'ir qatlam — mis siqib chiqarildi! 🟤", kind: "precipitate" });
  }

  // --- Yakuniy rang
  let color = "#eef6ff";
  for (const c of contents) {
    const r = REAGENT_MAP[c.reagentId];
    if (!r) continue;
    const w = c.ml / Math.max(1, total);
    color = mixHex(color, r.ionColor ?? r.color, Math.min(1, w * 2.2));
  }
  // Indikator ranglari pH bo'yicha
  if (ml("fen") > 0) {
    if (ph > 8.2) {
      color = mixHex(color, "#e8399a", 0.75);
      hodisalar.push({ text: "Fenolftalein PUSHTI rangga o'zgardi — muhit ishqoriy! 💗", kind: "color" });
    } else {
      hodisalar.push({ text: "Fenolftalein rangsiz qoldi — muhit kislotali yoki neytral.", kind: "color" });
    }
  }
  if (ml("litmus") > 0) {
    const target = ph < 5 ? "#c9303f" : ph > 8 ? "#2f6fd0" : "#8a63c9";
    color = mixHex(color, target, 0.8);
    hodisalar.push({ text: `Lakmus rangi: ${ph < 5 ? "QIZIL (kislotali)" : ph > 8 ? "KO'K (ishqoriy)" : "simsimsi (neytral)"}`, kind: "color" });
  }
  if (ml("mo") > 0) {
    const target = ph < 3.1 ? "#cf2e2e" : ph > 4.4 ? "#f2b705" : "#e07b28";
    color = mixHex(color, target, 0.8);
    hodisalar.push({ text: `Metil sariq: ${ph < 3.1 ? "QIZIL" : ph > 4.4 ? "SARIQ" : "TO'Q SARIQ"} (${ph.toFixed(1)} pH)`, kind: "color" });
  }
  if (ml("btb") > 0) {
    const target = ph < 6 ? "#e8c22e" : ph > 7.6 ? "#2f6fd0" : "#3fae7a";
    color = mixHex(color, target, 0.8);
    hodisalar.push({ text: `Bromtimol ko'k: ${ph < 6 ? "SARIQ" : ph > 7.6 ? "KO'K" : "YASHIL"} (${ph.toFixed(1)} pH)`, kind: "color" });
  }

  return { ph, color, precipitate, gas, temperature: Math.round(temp * 10) / 10, umumiyMl: total, hodisalar };
}

// ============================== ⚡ FIZIKA ==============================

export interface CircuitComp {
  id: string;
  type: "battery" | "resistor" | "bulb" | "switch" | "ammeter";
  a: number;
  b: number;
  /** batareya: volt; rezistor: Om; lampochka: nominal V */
  value: number;
  closed?: boolean;
}

export interface CircuitSolution {
  ok: boolean;
  nodeVoltages: number[];
  /** komponent id → tok (A) */
  currents: Record<string, number>;
  /** lampochka id → yorug'lik 0..1 */
  brightness: Record<string, number>;
  totalCurrent: number;
  error?: string;
}

/**
 * Kichik zanjir uchun MNA (Kirchgof) yechimi — haqiqiy hisob.
 * Batareya ideal + kichik ichki qarshilik (0.4 Om) bilan.
 */
export interface CircuitWire {
  fromComp: string;
  fromTerm: "a" | "b";
  toComp: string;
  toTerm: "a" | "b";
}

/** Simlar orqali terminal tugunlarini birlashtiradi (union-find) va zanjir komponentlarini qaytaradi. */
export function applyWires(comps: CircuitComp[], wires: CircuitWire[]): CircuitComp[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (x: string, y: string) => parent.set(find(x), find(y));
  for (const w of wires) union(`${w.fromComp}:${w.fromTerm}`, `${w.toComp}:${w.toTerm}`);
  const roots = new Map<string, number>();
  const nodeId = (key: string) => {
    const r = find(key);
    if (!roots.has(r)) roots.set(r, roots.size + 1);
    return roots.get(r)!;
  };
  return comps.map((c) => ({ ...c, a: nodeId(`${c.id}:a`), b: nodeId(`${c.id}:b`) }));
}

export function solveCircuit(comps: CircuitComp[]): CircuitSolution {
  const empty: CircuitSolution = { ok: false, nodeVoltages: [], currents: {}, brightness: {}, totalCurrent: 0 };
  const active = comps.filter((c) => !(c.type === "switch" && !c.closed));
  const nodes = new Set<number>();
  for (const c of active) {
    nodes.add(c.a);
    nodes.add(c.b);
  }
  if (nodes.size < 2) return { ...empty, error: "Zanjir yopiq emas." };

  // Yopiq yo'l bor-yo'qligi: har bir batareya uchun uning TASHQARISIDAN a→b yo'l topilishi shart
  const pathExists = (from: number, to: number, excludeId: string) => {
    const adj = new Map<number, number[]>();
    for (const c of active) {
      if (c.id === excludeId) continue;
      if (!adj.has(c.a)) adj.set(c.a, []);
      if (!adj.has(c.b)) adj.set(c.b, []);
      adj.get(c.a)!.push(c.b);
      adj.get(c.b)!.push(c.a);
    }
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === to) return true;
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    return false;
  };
  const batteries0 = active.filter((c) => c.type === "battery");
  if (batteries0.length > 0 && !batteries0.some((b) => pathExists(b.a, b.b, b.id))) {
    return { ...empty, error: "Zanjir yopiq emas — qurilmalarni simlar bilan ulang." };
  }
  const nodeList = [...nodes].sort((x, y) => x - y);
  const idx = new Map(nodeList.map((n, i) => [n, i]));
  const n = nodeList.length;
  const batteries = active.filter((c) => c.type === "battery");
  if (batteries.length === 0) return { ...empty, error: "Zanjirda manba (batareya) yo'q." };
  const size = n - 1;
  if (size > 24) return { ...empty, error: "Zanjir juda katta." };

  // A·V = I (Kirchgof, tugun usuli). Batareya = Norton ekvivalenti:
  // ichki qarshilik || tok manbai I = E/r ichki.
  const A: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const z: number[] = Array(size).fill(0);
  const gnd = idx.get(nodeList[0])!;
  const remap = (node: number) => {
    const i = idx.get(node)!;
    return i === gnd ? -1 : i - 1;
  };
  const stampBetween = (u: number, v: number, g: number) => {
    const i = remap(u);
    const j = remap(v);
    if (i >= 0) A[i][i] += g;
    if (j >= 0) A[j][j] += g;
    if (i >= 0 && j >= 0) {
      A[i][j] -= g;
      A[j][i] -= g;
    }
  };
  const inject = (node: number, amps: number) => {
    const i = remap(node);
    if (i >= 0) z[i] += amps;
  };
  const injectBetween = (from: number, to: number, amps: number) => {
    // tok manbai: from dan to ga — bir tomon +I, ikkinchisi -I (massa bo'lsa ham to'g'ri)
    inject(to, amps);
    inject(from, -amps);
  };

  for (const c of active) {
    if (c.type === "battery") {
      const r = 0.4; // ichki qarshilik
      stampBetween(c.a, c.b, 1 / r);
      const i = c.value / r;
      injectBetween(c.b, c.a, i); // tok manbai b dan a ga
    } else if (c.type === "resistor") {
      stampBetween(c.a, c.b, 1 / Math.max(0.1, c.value));
    } else if (c.type === "bulb") {
      // lampochka: R = V_nom² / P, P = 2 Vt (kichik laboratoriya lampochkasi)
      stampBetween(c.a, c.b, 1 / Math.max(1, (c.value * c.value) / 2));
    } else if (c.type === "ammeter") {
      stampBetween(c.a, c.b, 1 / 0.01);
    } else if (c.type === "switch") {
      stampBetween(c.a, c.b, 1 / 0.001);
    }
  }

  // Gauss eliminatsiya
  for (let col = 0; col < size; col++) {
    let piv = col;
    for (let r = col + 1; r < size; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-9) return { ...empty, error: "Zanjir to'liq yopiq emas (ochiq joy bor)." };
    [A[col], A[piv]] = [A[piv], A[col]];
    [z[col], z[piv]] = [z[piv], z[col]];
    for (let r = 0; r < size; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c2 = col; c2 < size; c2++) A[r][c2] -= f * A[col][c2];
      z[r] -= f * z[col];
    }
  }
  const x = z.map((v, i) => v / A[i][i]);

  const nodeVoltages: number[] = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const r = remap(nodeList[i]);
    nodeVoltages[i] = r >= 0 ? x[r] : 0;
  }

  const currents: Record<string, number> = {};
  const brightness: Record<string, number> = {};
  let totalCurrent = 0;
  for (const c of active) {
    const va = nodeVoltages[idx.get(c.a)!];
    const vb = nodeVoltages[idx.get(c.b)!];
    const v = va - vb;
    if (c.type === "battery") {
      // tashqi zanjirga berilgan tok = manba tokidan ichki qarshilik tokini ayirib
      const delivered = (c.value - v) / 0.4;
      currents[c.id] = Math.abs(delivered);
      totalCurrent += Math.abs(delivered);
    } else if (c.type === "bulb") {
      const r = Math.max(1, (c.value * c.value) / 2);
      const i = v / r;
      currents[c.id] = i;
      brightness[c.id] = Math.max(0, Math.min(1, Math.abs(i * v) / 2));
    } else {
      let r = 0.01;
      if (c.type === "resistor") r = Math.max(0.1, c.value);
      currents[c.id] = v / r;
    }
  }
  if (totalCurrent > 8) return { ...empty, error: "⚠️ Qisqa tutashuv! Tok juda katta." };

  return { ok: true, nodeVoltages, currents, brightness, totalCurrent };
}

/** Hooke qonuni: F = k·x; statik cho'zilish x = m·g/k */
export function springPhysics(massKg: number, k: number, g = 9.81) {
  const x = (massKg * g) / Math.max(0.5, k);
  const period = 2 * Math.PI * Math.sqrt(massKg / Math.max(0.5, k));
  return { force: massKg * g, extension: x, period };
}

/** Ingichka linza tenglamasi: 1/f = 1/do + 1/di; kattalashtirish m = −di/do */
export function lensPhysics(focalCm: number, objectCm: number, concave = false) {
  const f = concave ? -Math.abs(focalCm) : Math.abs(focalCm);
  const inv = 1 / f - 1 / objectCm;
  const image = Math.abs(inv) < 1e-6 ? Infinity : 1 / inv;
  const magnification = Number.isFinite(image) ? -image / objectCm : Infinity;
  return { focal: f, image, magnification, real: image > 0, virtual: image < 0 };
}

// ============================== 🔬 BIOLOGIYA ==============================

export interface Organelle {
  id: string;
  name: string;
  funksiya: string;
  rang: string;
  /** qaysi hujayra turi: hayvon / o'simlik / ikkalasi */
  turi: "animal" | "plant" | "both";
}

export const ORGANELLES: Organelle[] = [
  { id: "membrane", name: "Hujayra membranasi", funksiya: "Yog' ikki qavatidan iborat 'to'r' — ichkariga va tashqariga modda almashuvini nazorat qiladi.", rang: "#9fd8c8", turi: "both" },
  { id: "wall", name: "Hujayra devori", funksiya: "Sellyulozadan iborat mustahkam qobiq — hujayraga shakl va himoya beradi (faqat o'simlikda).", rang: "#c9a86a", turi: "plant" },
  { id: "cytoplasm", name: "Sitoplazma", funksiya: "Jelga o'xshash suyuqlik — barcha organoidlar shu yuzada joylashgan.", rang: "#dcecf5", turi: "both" },
  { id: "nucleus", name: "Yadro", funksiya: "Hujayraning 'miyasi' — DNK shu yerda saqlanadi va barcha jarayonlarni boshqaradi.", rang: "#7b6fd0", turi: "both" },
  { id: "nucleolus", name: "Yadrocha", funksiya: "Yadro ichidagi zich tuzilma — ribosomalar uchun RNK ishlab chiqaradi.", rang: "#5b4fb8", turi: "both" },
  { id: "mito", name: "Mitoxondriya", funksiya: "'Hujayra elektr stansiyasi' — nafas olish orqali ATF energiyasini hosil qiladi.", rang: "#e2704f", turi: "both" },
  { id: "ribo", name: "Ribosomalar", funksiya: "Mayda donachalar — aminokislotalardan oqsil yig'adi.", rang: "#77a06a", turi: "both" },
  { id: "er", name: "YUPQA endoplazmatik to'r", funksiya: "Oqsillarni tashiydi va moddiy almashinuv yo'llarini tashkil qiladi.", rang: "#6fa8d6", turi: "both" },
  { id: "golgi", name: "Golji majmuasi", funksiya: "Yassi pufakchalar stoykasi — oqsillarni 'qadoqlab', manzilga yuboradi.", rang: "#e8b13c", turi: "both" },
  { id: "lyso", name: "Lizosomalar", funksiya: "Ichidagi fermentlar eski va keraksiz qismlarni 'hazm' qiladi.", rang: "#c86b98", turi: "animal" },
  { id: "vac", name: "Vakuola", funksiya: "Suv va zaxira moddalar ombori (o'simlikda — katta markaziy vakuola).", rang: "#7fc4e8", turi: "both" },
  { id: "chloro", name: "Xloroplast", funksiya: "Xlorofill yordamida quyosh energiyasidan oziq modda hosil qiladi (fotosintez).", rang: "#4c9a4c", turi: "plant" },
  { id: "centriole", name: "Sentriollar", funksiya: "Hujayra bo'linishida xromosomalarni tortib oluvchi iplarni tashkil qiladi.", rang: "#8d99ae", turi: "animal" },
];

export interface DivisionStage {
  id: string;
  name: string;
  tavsif: string;
  /** xromosomalar holati: 0 = cho'zinchoq iplar, 1 = zichlashgan X shakl, 2 = ekvator, 3 = kutublarga, 4 = ikkita yadro, 5 = bo'linish */
  phase: number;
}

export const MITOSIS: DivisionStage[] = [
  { id: "inter", name: "1. Interfaza", tavsif: "Hujayra o'sadi va DNK ko'payadi — bo'linga tayyorlanmoqda.", phase: 0 },
  { id: "pro", name: "2. Profaza", tavsif: "Xromosomalar zichlashib ko'rinadi, yadro pardasi yo'qoladi.", phase: 1 },
  { id: "meta", name: "3. Metafaza", tavsif: "Xromosomalar hujayra ekvatoriga tekis joylashadi.", phase: 2 },
  { id: "ana", name: "4. Anafaza", tavsif: "Xromatidalar kutublarga qarab ajralib ketadi.", phase: 3 },
  { id: "telo", name: "5. Telofaza", tavsif: "Har bir kutubda yangi yadro hosil bo'ladi.", phase: 4 },
  { id: "cyto", name: "6. Sitokinez", tavsif: "Hujayra bo'linadi — ikkita bir xil hujayra hosil bo'ladi!", phase: 5 },
];

export const MEIOSIS: DivisionStage[] = [
  { id: "inter1", name: "1. Interfaza I", tavsif: "DNK ko'payadi — hujayra meiozga tayyorlanadi.", phase: 0 },
  { id: "pro1", name: "2. Profaza I (krossingover!)", tavsif: "Gomolog xromosomalar juftlashadi va DNK almashinadi — irsiy xilma-xillik shu yerda tug'iladi!", phase: 1 },
  { id: "meta1", name: "3. Metafaza I", tavsif: "Gomolog juftlar ekvatorga joylashadi (tasodifiy tartibda).", phase: 2 },
  { id: "ana1", name: "4. Anafaza I", tavsif: "Gomolog xromosomalar ajraladi — xromosomalar soni yarimga kamayadi.", phase: 3 },
  { id: "telo1", name: "5. Telofaza I", tavsif: "Ikkita haploid hujayra hosil bo'ladi.", phase: 4 },
  { id: "mei2", name: "6. Meioz II (mitoz kabi)", tavsif: "Xromatidalar ajraladi — jami 4 ta HAPLOID jinsiy hujayra hosil bo'ladi!", phase: 5 },
];
