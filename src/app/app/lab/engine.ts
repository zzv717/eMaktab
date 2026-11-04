// 🧪🔬⚡ Laboratoriya fanlari — haqiqiy hisob-kitob dvigateli (3D sahifalar shu yerdan foydalanadi)
// Kimyo: reaksiya qoidalari (pH, rang, cho'kma, gaz, harorat)
// Fizika: MNA (Kirchgof) bo'yicha zanjir yechimi, Hooke, ingichka linza
// Biologiya: organoidlar va bo'linish bosqichlari kontenti

// ============================== 🧪 KIMYO ==============================

export type ReagentKind = "acid" | "base" | "carbonate" | "salt" | "indicator" | "metal" | "water" | "element";

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
  { id: "agno3", name: "Kumush nitrat", formula: "AgNO₃", kind: "salt", strength: 0.5, color: "#f7f8fc", ionColor: "#e7e9f2", info: "Xlorid ionlari bilan oq cho'kma (AgCl) beradi." },
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
  { id: "alcl3", name: "Alyuminiy xlorid", formula: "AlCl₃", kind: "salt", strength: 0.5, color: "#f2f6fb", ionColor: "#e3ebf4", info: "Ikkita xossali (amfoter) — kam ishqorda oq cho'kma, ko'p ishqorda ERIYDI!" },
  { id: "ki", name: "Kaliy yodid", formula: "KI", kind: "salt", strength: 0.5, color: "#f6f2ff", ionColor: "#ebe4fb", info: "Yodid ionlari — qo'rg'oshin bilan sariq cho'kma beradi." },
  { id: "pbno32", name: "Qo'rg'oshin nitrat", formula: "Pb(NO₃)₂", kind: "salt", strength: 0.5, color: "#f7f8fc", ionColor: "#e9ebf3", info: "KI bilan PbI₂ — 'oltin yomg'ir' tajribasi (issiqda eriydi!)" },
  { id: "cu", name: "Mis parchasi", formula: "Cu", kind: "metal", strength: 0, color: "#c97b4a", info: "Vodoroddan past — kislotalar bilan REAKSIYAGA KIRMAYDI (faollik qatori)." },
  { id: "al", name: "Alyuminiy folga", formula: "Al", kind: "metal", strength: 0, color: "#c3ccd6", info: "Ishqorlarda erib, H₂ gazi ajratadi! Kislota bilan ham reaksiyaga kirishadi." },
  { id: "kmno4", name: "Kaliy permanganat", formula: "KMnO₄", kind: "salt", strength: 0.5, color: "#7b2d8e", ionColor: "#6b21a8", info: "Kuchli oksidlovchi — binafsha rang. H₂O₂ bilan RANGSIZLANADI va kislorod ajratadi!" },
  { id: "h2o2", name: "Vodorod periksidi", formula: "H₂O₂", kind: "salt", strength: 0.5, color: "#eef7ff", info: "Kuchli oksidlovchi/yokuvchi. KMnO₄ bilan mo'jizaviy reaksiya beradi." },
  { id: "feso4", name: "Temir(II) sulfat", formula: "FeSO₄", kind: "salt", strength: 0.5, color: "#8fc98f", ionColor: "#7ab87a", info: "Yashil rangli tuz. Ishqor bilan yashil cho'kma — keyin qo'ng'irga o'zgaradi!" },
  { id: "na2s2o3", name: "Natriy tiosulfat", formula: "Na₂S₂O₃", kind: "salt", strength: 0.5, color: "#f2f6fb", info: "Kislota bilan SEKIN reaksiya — bir necha soniyada loyqalanish (soat reaksiyasi!)" },
];

export const REAGENT_MAP: Record<string, Reagent> = Object.fromEntries(REAGENTS.map((r) => [r.id, r]));

// ============================== 🧬 118 KIMYOVIY ELEMENT (Mendeleyev jadvali) ==============================

export type ElementCat = "metall" | "metallmas" | "yarim" | "nobil";

export interface Element118 {
  id: string;
  symbol: string;
  /** o'zbekcha nomi */
  name: string;
  /** tartib raqami */
  num: number;
  cat: ElementCat;
  /** metall uchun musbat valentlik, metallmas uchun manfiy valentlik moduli */
  valence: number;
  color: string;
  info: string;
}

const CAT_INFO: Record<ElementCat, string> = {
  metall: "Oddiy modda — metall. Yaltirab turuvchi, elektr va issiqlik o'tkazuvchi.",
  metallmas: "Oddiy modda — metallmas. Kimyoviy faol modda.",
  yarim: "Yarim o'tkazgich element — elektronika asosi.",
  nobil: "Nobil gaz — juda kam reaksiyaga kirishadi.",
};

const EL_COLOR: Record<string, string> = {
  h: "#eaf3fb", c: "#3c3c3c", n: "#dcebf7", o: "#dff3ff", f: "#e9f7c8", cl: "#cfe27a",
  br: "#a5452e", i: "#7b2d8e", s: "#f2d54e", p: "#d9534f", cu: "#c97b4a", au: "#f6c945",
  cs: "#e5c46b", hg: "#cfd4dd", se: "#c46a2e", at: "#5b4a6b", he: "#e6eef7", ne: "#e6eef7",
  ar: "#e6eef7", kr: "#e6eef7", xe: "#e6eef7", rn: "#e6eef7", og: "#e6eef7",
};

const EL_INFO: Record<string, string> = {
  h: "Eng yengil element — suyultirilganda raketa yonilg'isi!",
  he: "Og'irshovchi gaz — sharlar va zeppelinlar uchun.",
  li: "Eng yengil metall — telefon batareyalarida ishlatiladi.",
  c: "Hayot asosi — olmos va grafit shu elementdan!",
  n: "Havo tarkibining 78% — o'simliklar uchun o'g'it asosi.",
  o: "Nafas olish uchun zarur — havo tarkibining 21%.",
  na: "Faol metall — suv bilan portlaydi! Osh tuzi (NaCl) tarkibida.",
  mg: "Yengil metall — fonar va pirotexnikada yonadi.",
  al: "Yengil metall — samolyot va folga materiali.",
  si: "Qum va kompyuter chip'lari shu elementdan!",
  p: "Suyaklar tarkibida va olovli yong'indagilar uchun.",
  s: "Sariq sarg'ish modda — oltingugurt kislota asosi.",
  cl: "Yashil-sariq gaz — suvni zararsizlantirishda ishlatiladi.",
  k: "Juda faol metall — o'simliklar o'g'itida (K).",
  ca: "Suyak va tish tarkibidagi metall.",
  fe: "Temir — po'lat va qurilma materiali.",
  cu: "Mis — elektr simlari va tangalar materiali.",
  zn: "Rux — galvanizatsiya va batareyalarda.",
  ag: "Kumush — zargarlik va elektr kontaktlari.",
  au: "Oltin — zargarlik va elektronikada, oksidlanmaydi!",
  hg: "Yagona suyuq metall — termometrlarda.",
  pb: "Qo'rg'oshin — og'ir metall, o'q o'qlari va akkumulyatorlar.",
  u: "Uran — atom elektr stansiyasi yonilg'isi.",
};

function elColor(id: string, cat: ElementCat): string {
  return EL_COLOR[id] ?? (cat === "metall" ? "#c3ccd6" : cat === "metallmas" ? "#e8e2d8" : cat === "yarim" ? "#8fa3b8" : "#e6eef7");
}

/** 118 element — Mendeleyev jadvali (id = kichik belgi) */
function mkElements(): Element118[] {
  const rows: Array<[string, string, number, ElementCat, number]> = [
    ["h", "Vodorod", 1, "metallmas", 1], ["he", "Geliy", 2, "nobil", 0],
    ["li", "Litiy", 3, "metall", 1], ["be", "Berilliy", 4, "metall", 2], ["b", "Bor", 5, "yarim", 3],
    ["c", "Uglerod", 6, "metallmas", 4], ["n", "Azot", 7, "metallmas", 3], ["o", "Kislorod", 8, "metallmas", 2],
    ["f", "Ftor", 9, "metallmas", 1], ["ne", "Neon", 10, "nobil", 0],
    ["na", "Natriy", 11, "metall", 1], ["mg", "Magniy", 12, "metall", 2], ["al", "Alyuminiy", 13, "metall", 3],
    ["si", "Kremniy", 14, "yarim", 4], ["p", "Fosfor", 15, "metallmas", 3], ["s", "Oltingugurt", 16, "metallmas", 2],
    ["cl", "Xlor", 17, "metallmas", 1], ["ar", "Argon", 18, "nobil", 0],
    ["k", "Kaliy", 19, "metall", 1], ["ca", "Kalsiy", 20, "metall", 2], ["sc", "Skandiy", 21, "metall", 3],
    ["ti", "Titan", 22, "metall", 4], ["v", "Vanadiy", 23, "metall", 5], ["cr", "Xrom", 24, "metall", 3],
    ["mn", "Marganets", 25, "metall", 2], ["fe", "Temir", 26, "metall", 3], ["co", "Kobalt", 27, "metall", 2],
    ["ni", "Nikel", 28, "metall", 2], ["cu", "Mis", 29, "metall", 2], ["zn", "Rux", 30, "metall", 2],
    ["ga", "Galliy", 31, "metall", 3], ["ge", "Germaniy", 32, "yarim", 4], ["as", "Arsen", 33, "yarim", 3],
    ["se", "Selen", 34, "metallmas", 2], ["br", "Brom", 35, "metallmas", 1], ["kr", "Kripton", 36, "nobil", 0],
    ["rb", "Rubidiy", 37, "metall", 1], ["sr", "Stronsiy", 38, "metall", 2], ["y", "Ittriy", 39, "metall", 3],
    ["zr", "Zirkoniy", 40, "metall", 4], ["nb", "Niobiy", 41, "metall", 5], ["mo", "Molibden", 42, "metall", 6],
    ["tc", "Texnesiy", 43, "metall", 7], ["ru", "Ruteniy", 44, "metall", 4], ["rh", "Rodiy", 45, "metall", 3],
    ["pd", "Palladiy", 46, "metall", 2], ["ag", "Kumush", 47, "metall", 1], ["cd", "Kadmiy", 48, "metall", 2],
    ["in", "Indiy", 49, "metall", 3], ["sn", "Qalay", 50, "metall", 4], ["sb", "Surma", 51, "yarim", 3],
    ["te", "Tellur", 52, "metallmas", 2], ["i", "Yod", 53, "metallmas", 1], ["xe", "Ksenon", 54, "nobil", 0],
    ["cs", "Seziy", 55, "metall", 1], ["ba", "Bariy", 56, "metall", 2], ["la", "Lantan", 57, "metall", 3],
    ["ce", "Seriy", 58, "metall", 3], ["pr", "Prazeodim", 59, "metall", 3], ["nd", "Neodim", 60, "metall", 3],
    ["pm", "Prometiy", 61, "metall", 3], ["sm", "Samarium", 62, "metall", 3], ["eu", "Evropiy", 63, "metall", 3],
    ["gd", "Gadoliniy", 64, "metall", 3], ["tb", "Terbiy", 65, "metall", 3], ["dy", "Disprozium", 66, "metall", 3],
    ["ho", "Golmiy", 67, "metall", 3], ["er", "Erbium", 68, "metall", 3], ["tm", "Tulium", 69, "metall", 3],
    ["yb", "Itterbiy", 70, "metall", 3], ["lu", "Lutesiy", 71, "metall", 3], ["hf", "Gafniy", 72, "metall", 4],
    ["ta", "Tantal", 73, "metall", 5], ["w", "Volfram", 74, "metall", 6], ["re", "Reniy", 75, "metall", 7],
    ["os", "Osmiy", 76, "metall", 4], ["ir", "Iridiy", 77, "metall", 3], ["pt", "Platina", 78, "metall", 2],
    ["au", "Oltin", 79, "metall", 3], ["hg", "Simob", 80, "metall", 2], ["tl", "Taliy", 81, "metall", 3],
    ["pb", "Qo'rg'oshin", 82, "metall", 2], ["bi", "Vismut", 83, "metall", 3], ["po", "Polonium", 84, "yarim", 2],
    ["at", "Astatin", 85, "metallmas", 1], ["rn", "Radon", 86, "nobil", 0], ["fr", "Fransiy", 87, "metall", 1],
    ["ra", "Radiy", 88, "metall", 2], ["ac", "Aktiniy", 89, "metall", 3], ["th", "Toriy", 90, "metall", 4],
    ["pa", "Protaktiniy", 91, "metall", 5], ["u", "Uran", 92, "metall", 6], ["np", "Neptuniy", 93, "metall", 5],
    ["pu", "Plutoniy", 94, "metall", 4], ["am", "Amerisiy", 95, "metall", 3], ["cm", "Kuriy", 96, "metall", 3],
    ["bk", "Berkelium", 97, "metall", 3], ["cf", "Kalifornium", 98, "metall", 3], ["es", "Eynshteyniy", 99, "metall", 3],
    ["fm", "Fermiy", 100, "metall", 3], ["md", "Mendeleviy", 101, "metall", 3], ["no", "Nobeliy", 102, "metall", 3],
    ["lr", "Lavrensiy", 103, "metall", 3], ["rf", "Rutherfordiy", 104, "metall", 4], ["db", "Dubniy", 105, "metall", 5],
    ["sg", "Seaborgiy", 106, "metall", 6], ["bh", "Boriy", 107, "metall", 7], ["hs", "Hassiy", 108, "metall", 6],
    ["mt", "Meytneriy", 109, "metall", 4], ["ds", "Darmstadiy", 110, "metall", 4], ["rg", "Rentgeniy", 111, "metall", 4],
    ["cn", "Kopernisium", 112, "metall", 2], ["nh", "Nihoniy", 113, "metall", 3], ["fl", "Fleroviy", 114, "metall", 2],
    ["mc", "Moskoviy", 115, "metall", 4], ["lv", "Livermorium", 116, "metall", 4], ["ts", "Tennessin", 117, "metallmas", 1],
    ["og", "Oganeson", 118, "nobil", 0],
  ];
  return rows.map(([id, name, num, cat, valence]) => ({
    id,
    symbol: id[0].toUpperCase() + id.slice(1),
    name,
    num,
    cat,
    valence,
    color: elColor(id, cat),
    info: EL_INFO[id] ?? CAT_INFO[cat],
  }));
}

export const ELEMENTS: Element118[] = mkElements();
export const ELEMENT_MAP: Record<string, Element118> = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]));

/** Reaktivni REAGENTS yoki 118 ELEMENT ichidan topadi */
export function getReagent(id: string): Reagent | undefined {
  const r = REAGENT_MAP[id];
  if (r) return r;
  const e = ELEMENT_MAP[id];
  if (!e) return undefined;
  return {
    id: e.id,
    name: e.name,
    formula: e.symbol,
    kind: "element",
    strength: 0,
    color: e.color,
    info: e.info,
  };
}

const SUB = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
const sub = (n: number) => (n <= 1 ? "" : String(n).split("").map((d) => SUB[Number(d)]).join(""));

/**
 * Ikki elementdan ikki tomonlama birikma formulasini tuzadi (valentliklar bo'yicha).
 * Na(+1) + Cl(−1) → NaCl ; Mg(+2) + O(−2) → MgO ; Na(+1) + O(−2) → Na₂O
 */
export function binaryFormula(a: Element118, b: Element118): string {
  // Kation (oldin yoziladigan element): metall > yarim > metallmas; teng bo'lsa — kichik tartib raqami
  const score = (e: Element118) => (e.cat === "metall" ? 0 : e.cat === "yarim" ? 1 : 2);
  const metal = score(a) < score(b) || (score(a) === score(b) && a.num < b.num) ? a : b;
  const nonmetal = metal === a ? b : a;
  const va = Math.max(1, metal.valence);
  const vb = Math.max(1, nonmetal.valence);
  const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
  const d = g(va, vb);
  return `${metal.symbol}${sub(vb / d)}${nonmetal.symbol}${sub(va / d)}`;
}

/** Faol metall + kislota tenglamasi (H₂) */
function metalAcidEq(e: Element118): string {
  const s = e.symbol;
  if (e.valence === 1) return `2${s} + 2HCl → 2${s}Cl + H₂↑`;
  if (e.valence === 2) return `${s} + 2HCl → ${s}Cl₂ + H₂↑`;
  return `2${s} + 6HCl → 2${s}Cl₃ + 3H₂↑`;
}

export type PourEvent = {
  text: string;
  kind: "gas" | "precipitate" | "color" | "heat" | "info";
  /** kimyoviy tenglama — pastda ko'rsatiladi (Na + Cl → NaCl) */
  equation?: string;
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
  if (neutral > 0) hodisalar.push({ text: `Neytrallanish reaksiyasi — issiqlik ajraldi (+${Math.round(temp - baseTemp)}°C)`, kind: "heat", equation: "NaOH + HCl → NaCl + H₂O" });

  // --- pH
  const excessAcid = acidEq - neutral - carbEq * 1.0;
  const excessBase = baseEq - neutral;
  let ph: number;
  const L = Math.max(30, total) / 1000; // umumiy hajm (L taxminan)
  if (excessAcid > 0.0001) ph = Math.max(0.3, -Math.log10(excessAcid / L));
  else if (excessBase > 0.0001) ph = Math.min(13.7, 14 + Math.log10(excessBase / L));
  else if (carbEq > 0 && acidEq === 0) ph = 8.4;
  else ph = 7;

  // --- Gaz: kislota + karbonat → CO₂; kislota/ishqor + faol metall → H₂
  let gas: SimResult["gas"] = null;
  const alMl = ml("al");
  if (carbEq > 0 && acidEq > neutral) {
    gas = { name: "CO₂ (karbonat angidrid)" };
    hodisalar.push({ text: "CO₂ gazi ajralib chiqdi — kuchli ko'piklanish! 🫧", kind: "gas", equation: "Na₂CO₃ + 2HCl → 2NaCl + H₂O + CO₂↑" });
    // Ohak suvi bo'lsa — sutsimonlashish (CaCO₃ cho'kmasi)
    if (ml("caoh2") > 0) {
      hodisalar.push({ text: "Ohak suvi sutsimon tus oldi — CaCO₃ cho'kmasi! 🥛", kind: "precipitate", equation: "Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O" });
    }
  } else if ((acidEq > 0 && (ml("zn") > 0 || ml("mg") > 0 || alMl > 0)) || (baseEq > 0 && alMl > 0)) {
    gas = { name: "H₂ (vodorod)" };
    hodisalar.push({ text: "Vodorod gazi ajralib chiqdi — mayda pufakchalar! 🫧", kind: "gas", equation: "Zn + 2HCl → ZnCl₂ + H₂↑" });
    if (baseEq > 0 && alMl > 0 && acidEq === 0) {
      hodisalar.push({ text: "Alyuminiy ishqorda eridi — Na[Al(OH)₄] hosil bo'ldi! 🧪", kind: "info" });
    }
  }
  // Mis kislota bilan reaksiyaga kirmaydi (faollik qatori!)
  if (ml("cu") > 0 && acidEq > 0 && ml("zn") === 0 && ml("mg") === 0 && ml("al") === 0) {
    hodisalar.push({ text: "⛔ Mis kislota bilan reaksiyaga KIRMAYDI — vodoroddan past turadi (faollik qatori).", kind: "info", equation: "Cu + HCl → reaksiya yo'q" });
  }

  // --- Cho'kmalar (eruvchanlik qoidalari)
  let precipitate: SimResult["precipitate"] = null;

  // --- Maxsus reaksiyalar (rang o'zgarishi, gaz, sekin reaksiyalar)
  if (ml("kmno4") > 0 && ml("h2o2") > 0) {
    hodisalar.push({ text: "🟣➡️⬜ Binafsha RANGSIZLANDI! KMnO₄ parchalandi — MnO₂ cho'kmasi va O₂ gazi ajraldi! 🫧", kind: "gas", equation: "2KMnO₄ + 3H₂O₂ → 2MnO₂ + 3O₂↑ + 2KOH + 2H₂O" });
    gas = { name: "O₂ (kislorod)" };
  }
  if (ml("na2s2o3") > 0 && acidEq > 0) {
    hodisalar.push({ text: "⏱ SOAT REAKSIYASI: suyuqlik bir necha soniyadan keyin loyqalanadi — oltingugurt cho'kadi! (SO₂ hidi seziladi)", kind: "info", equation: "Na₂S₂O₃ + 2HCl → 2NaCl + S↓ + SO₂↑ + H₂O" });
  }
  if (ml("feso4") > 0 && baseEq > 0 && ml("alcl3") === 0) {
    precipitate = { color: "#6b8f4e", name: "Fe(OH)₂ (yashil cho'kma)" };
    hodisalar.push({ text: "🟢 Yashil cho'kma tushdi — Fe(OH)₂ (havo ta'sirida qo'ng'irga o'zgaradi!)", kind: "precipitate", equation: "FeSO₄ + 2NaOH → Fe(OH)₂↓ + Na₂SO₄" });
  }

  const hasCl = ml("hcl") > 0 || ml("nacl") > 0 || ml("fecl3") > 0;
  if (ml("agno3") > 0 && hasCl) {
    precipitate = { color: "#f2f2ee", name: "AgCl (oq cho'kma)" };
    hodisalar.push({ text: "Oq cho'kma tushdi — AgCl (kumush xlorid) ⚪", kind: "precipitate", equation: "AgNO₃ + HCl → AgCl↓ + HNO₃" });
  } else if (ml("cuso4") > 0 && (ml("naoh") > 0 || ml("caoh2") > 0)) {
    precipitate = { color: "#7fb4e8", name: "Cu(OH)₂ (ko'k cho'kma)" };
    hodisalar.push({ text: "Ko'k cho'kma tushdi — Cu(OH)₂ 🔵", kind: "precipitate", equation: "CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄" });
  } else if (ml("caoh2") > 0 && ml("na2co3") > 0) {
    precipitate = { color: "#efeee6", name: "CaCO₃ (oq cho'kma)" };
    hodisalar.push({ text: "Oq cho'kma tushdi — CaCO₃ ⚪", kind: "precipitate", equation: "Ca(OH)₂ + Na₂CO₃ → CaCO₃↓ + 2NaOH" });
  } else if (ml("cuso4") > 0 && (ml("fe") > 0 || ml("zn") > 0)) {
    precipitate = { color: "#b06a3b", name: "Cu (mis cho'kmasi)" };
    hodisalar.push({ text: "Metall yuzasida qo'ng'ir qatlam — mis siqib chiqarildi! 🟤", kind: "precipitate", equation: "Fe + CuSO₄ → FeSO₄ + Cu↓" });
  } else if (ml("alcl3") > 0 && baseEq > 0) {
    // AMFOTER: kam ishqor → Al(OH)₃ cho'kmasi; ortiqcha ishqor → ERIYDI (tartib muhim!)
    const alNeed = k("alcl3") * 3;
    if (baseEq < alNeed * 0.92) {
      precipitate = { color: "#f0f2f0", name: "Al(OH)₃ (oq cho'kma)" };
      hodisalar.push({ text: "Oq cho'kma tushdi — Al(OH)₃ (alyuminiy gidroksidi) ⚪", kind: "precipitate", equation: "AlCl₃ + 3NaOH → Al(OH)₃↓ + 3NaCl" });
    } else {
      hodisalar.push({ text: "🌀 Cho'kma ERTALAB/KEYIN ERIYDI — ortiqcha ishqor Al(OH)₃ ni eritdi (amfoter xossa!) — tiniq eritma.", kind: "precipitate", equation: "Al(OH)₃ + NaOH → Na[Al(OH)₄]" });
    }
  } else if (ml("agno3") > 0 && ml("nh3") > 0 && !hasCl) {
    // AgNO3 + NH3: kam miqdor → Ag2O qo'ng'ir cho'kma; ortiqcha NH3 → kompleks hosil bo'lib ERIYDI
    const nh3Eq = k("nh3");
    const agEq = k("agno3");
    if (nh3Eq < agEq * 1.4) {
      precipitate = { color: "#8a5a2b", name: "Ag₂O (qo'ng'ir cho'kma)" };
      hodisalar.push({ text: "Qo'ng'ir cho'kma tushdi — Ag₂O (kumush oksidi) 🟤", kind: "precipitate", equation: "2AgNO₃ + 2NH₃·H₂O → Ag₂O↓ + 2NH₄NO₃ + H₂O" });
    } else {
      hodisalar.push({ text: "🌀 Cho'kma ERIYDI — ortiqcha ammiak kumush bilan tiniq kompleks hosil qildi [Ag(NH₃)₂]⁺!", kind: "precipitate", equation: "Ag₂O + 4NH₃·H₂O → 2[Ag(NH₃)₂]⁺ + 2OH⁻ + 3H₂O" });
    }
  } else if (ml("pbno32") > 0 && ml("ki") > 0) {
    // OLTIN YOMG'IR: PbI₂ — issiqda eriydi, soviganda qayta kristallashadi
    if (temp >= 45) {
      hodisalar.push({ text: "🔥 Sariq cho'kma ISSIQDA ERIYDI — PbI₂ issiq suvda eruvchan (soviganda qayta chiqadi!)", kind: "precipitate", equation: "Pb(NO₃)₂ + 2KI → PbI₂↓ + 2KNO₃" });
    } else {
      precipitate = { color: "#e8c22e", name: "PbI₂ (oltin-sariq cho'kma)" };
      hodisalar.push({ text: "✨ OLTIN YOMG'IR! Sariq PbI₂ kristallari tushdi — isitib ko'ring: eriydi! 🟡", kind: "precipitate", equation: "Pb(NO₃)₂ + 2KI → PbI₂↓ + 2KNO₃" });
    }
  }

  // --- 🧬 ELEMENTLAR SINTEZI (118 element) — Na + Cl → NaCl
  const ids = [...new Set(contents.map((c) => c.reagentId))];
  const asElem = (id: string) => {
    const e = ELEMENT_MAP[id];
    if (!e) return null;
    const k = getReagent(id)?.kind;
    return k === "element" || k === "metal" ? e : null;
  };
  const metalEls = ids.map(asElem).filter((e): e is Element118 => !!e && e.cat === "metall" && e.valence > 0);
  // BARCHA elementlar juftlasha oladi: metall+metallmas, H + Cl → HCl va h.k. (nobil gazlar bundan mustasno)
  const allEls = ids.map(asElem).filter((e): e is Element118 => !!e && e.cat !== "nobil" && e.valence > 0);
  const synthPairs: Array<[Element118, Element118]> = [];
  for (let i = 0; i < allEls.length; i++) {
    for (let j = i + 1; j < allEls.length; j++) {
      synthPairs.push([allEls[i], allEls[j]]);
    }
  }
  // metall + metallmas birinchi, so'ng qolganlari (masalan H + Cl)
  synthPairs.sort((x, y) => {
    const rank = (p: [Element118, Element118]) => (p[0].cat === "metall" || p[1].cat === "metall" ? 0 : 1);
    return rank(x) - rank(y);
  });
  const pairScore = (e: Element118) => (e.cat === "metall" ? 0 : e.cat === "yarim" ? 1 : 2);
  for (const [x, y] of synthPairs.slice(0, 3)) {
    // tenglama chap tomoni formuladagi tartibda (Na + Cl → NaCl)
    const [m, n] = pairScore(x) < pairScore(y) || (pairScore(x) === pairScore(y) && x.num < y.num) ? [x, y] : [y, x];
    const f = binaryFormula(m, n);
    hodisalar.push({
      text: `⚡ SINTEZ reaksiyasi — ${f} hosil bo'ldi! (${m.symbol} + ${n.symbol})`,
      kind: "color",
      equation: `${m.symbol} + ${n.symbol} → ${f}`,
    });
  }
  // Faol metall + kislota → H₂ (zn/mg/fe maxsus qoidada bor — qolgan elementlar uchun)
  const ACTIVITY = new Set(["li", "k", "ba", "ca", "na", "rb", "cs", "sr", "mn", "cr", "al", "cd", "co", "ni", "sn", "pb"]);
  for (const m of metalEls) {
    if (acidEq > 0 && ACTIVITY.has(m.id)) {
      hodisalar.push({ text: `🫧 ${m.name} kislota bilan reaksiyaga kirdi — vodorod gazi ajraldi!`, kind: "gas", equation: metalAcidEq(m) });
      gas = { name: "H₂ (vodorod)" };
      temp += 4;
    }
    if (["li", "na", "k", "rb", "cs"].includes(m.id) && ml("h2o") > 0) {
      hodisalar.push({ text: `🔥 ${m.name} SUV bilan portlovchi reaksiya — H₂ gazi va ishqor!`, kind: "gas", equation: `2${m.symbol} + 2H₂O → 2${m.symbol}OH + H₂↑` });
      gas = { name: "H₂ (vodorod)" };
      temp += 12;
    }
  }

  // --- Yakuniy rang
  let color = "#eef6ff";
  for (const c of contents) {
    const r = getReagent(c.reagentId);
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

export interface StepEvent {
  /** necha ml quyilgandan keyin */
  afterMl: number;
  reagentId: string;
  yangiHodisalar: PourEvent[];
}

/**
 * Ketma-ket quyish jurnalini yuritadi — TARTIB muhim bo'lgan tajribalar uchun.
 * Har bir qadamdan keyin qaysi YANGI hodisalar bo'lganini qaytaradi.
 */
export function simulateSteps(contents: VesselContent[]): { steps: StepEvent[]; final: SimResult } {
  const steps: StepEvent[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (let i = 1; i <= contents.length; i++) {
    const prefix = contents.slice(0, i);
    total += contents[i - 1].ml;
    const r = simulate(prefix);
    const yangi = r.hodisalar.filter((h) => {
      const key = h.kind + "|" + h.text;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    steps.push({ afterMl: total, reagentId: contents[i - 1].reagentId, yangiHodisalar: yangi });
  }
  return { steps, final: simulate(contents) };
}

// ============================== ⚡ FIZIKA ==============================

export type CircuitCompType =
  | "battery"
  | "resistor"
  | "bulb"
  | "switch"
  | "ammeter"
  | "led"
  | "motor"
  | "buzzer"
  | "galv"
  | "rheostat"
  | "heater";

export type CompFault = "open" | "short" | "dead" | null;

export interface CircuitComp {
  id: string;
  type: CircuitCompType;
  a: number;
  b: number;
  /** batareya: volt; rezistor/reostat/isitgich: Om; lampochka/LED: nominal V */
  value: number;
  closed?: boolean;
  /** nosozlik: ochiq (sindirilgan), qisqa, o'lik (batareya) */
  fault?: CompFault;
}

export interface CircuitSolution {
  ok: boolean;
  nodeVoltages: number[];
  /** komponent id → tok (A) */
  currents: Record<string, number>;
  /** lampochka/LED id → yorug'lik 0..1 */
  brightness: Record<string, number>;
  /** motor id → tezlik 0..1 */
  motorSpeed: Record<string, number>;
  /** gurj id → ishlamoqda */
  buzzerOn: Record<string, boolean>;
  /** galvanometr id → strelka -1..1 */
  galvNeedle: Record<string, number>;
  /** isitgich id → qizib ketish 0..1 */
  heatGlow: Record<string, number>;
  /** LED teskari ulangan */
  ledReversed: Record<string, boolean>;
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
  const empty: CircuitSolution = {
    ok: false,
    nodeVoltages: [],
    currents: {},
    brightness: {},
    motorSpeed: {},
    buzzerOn: {},
    galvNeedle: {},
    heatGlow: {},
    ledReversed: {},
    totalCurrent: 0,
  };
  // nosozliklar: 'open' — zanjirdan chiqarilgan; 'dead' — manba o'lik
  const active = comps.filter((c) => !(c.type === "switch" && !c.closed) && c.fault !== "open");
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
    const isShort = c.fault === "short";
    if (c.type === "battery") {
      const r = 0.4; // ichki qarshilik
      stampBetween(c.a, c.b, 1 / r);
      const e = c.fault === "dead" ? 0 : c.value;
      const i = e / r;
      injectBetween(c.b, c.a, i); // tok manbai b dan a ga
    } else if (c.type === "resistor" || c.type === "rheostat" || c.type === "heater") {
      stampBetween(c.a, c.b, 1 / (isShort ? 0.01 : Math.max(0.1, c.value)));
    } else if (c.type === "bulb" || c.type === "led") {
      // lampochka: R = V_nom² / P, P = 2 Vt; LED: R ≈ V²/1.2
      const p = c.type === "bulb" ? 2 : 1.2;
      stampBetween(c.a, c.b, 1 / (isShort ? 0.01 : Math.max(1, (c.value * c.value) / p)));
    } else if (c.type === "motor") {
      stampBetween(c.a, c.b, 1 / (isShort ? 0.01 : 8));
    } else if (c.type === "buzzer") {
      stampBetween(c.a, c.b, 1 / (isShort ? 0.01 : 24));
    } else if (c.type === "ammeter" || c.type === "galv") {
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
  const motorSpeed: Record<string, number> = {};
  const buzzerOn: Record<string, boolean> = {};
  const galvNeedle: Record<string, number> = {};
  const heatGlow: Record<string, number> = {};
  const ledReversed: Record<string, boolean> = {};
  let totalCurrent = 0;
  for (const c of active) {
    const va = nodeVoltages[idx.get(c.a)!];
    const vb = nodeVoltages[idx.get(c.b)!];
    const v = va - vb;
    if (c.type === "battery") {
      const e = c.fault === "dead" ? 0 : c.value;
      const delivered = (e - v) / 0.4;
      currents[c.id] = Math.abs(delivered);
      totalCurrent += Math.abs(delivered);
    } else if (c.type === "bulb" || c.type === "led") {
      const p = c.type === "bulb" ? 2 : 1.2;
      const r = Math.max(1, (c.value * c.value) / p);
      const i = v / r;
      currents[c.id] = i;
      if (c.type === "bulb") {
        brightness[c.id] = Math.max(0, Math.min(1, Math.abs(i * v) / 2));
      } else {
        // LED: faqat to'g'ri yo'nalishda yonadi (anod a → katod b)
        const fwd = i > 0.001;
        ledReversed[c.id] = !fwd && Math.abs(i) > 0.0005;
        brightness[c.id] = fwd ? Math.max(0, Math.min(1, Math.abs(i * v) / 1.2)) : 0;
      }
    } else if (c.type === "motor") {
      const r = c.fault === "short" ? 0.01 : 8;
      const i = v / r;
      currents[c.id] = i;
      motorSpeed[c.id] = Math.max(0, Math.min(1, Math.abs(i) / 0.5));
    } else if (c.type === "buzzer") {
      const r = c.fault === "short" ? 0.01 : 24;
      const i = v / r;
      currents[c.id] = i;
      buzzerOn[c.id] = Math.abs(i) > 0.02;
    } else if (c.type === "galv") {
      const i = v / 0.01;
      currents[c.id] = i;
      galvNeedle[c.id] = Math.max(-1, Math.min(1, i / 0.05));
    } else if (c.type === "heater") {
      const r = c.fault === "short" ? 0.01 : Math.max(0.1, c.value);
      const i = v / r;
      currents[c.id] = i;
      heatGlow[c.id] = Math.max(0, Math.min(1, (i * i * r) / 8));
    } else {
      let r = 0.01;
      if (c.type === "resistor" || c.type === "rheostat") r = Math.max(0.1, c.value);
      currents[c.id] = v / r;
    }
  }
  if (totalCurrent > 8) return { ...empty, error: "⚠️ Qisqa tutashuv! Tok juda katta." };

  return { ok: true, nodeVoltages, currents, brightness, motorSpeed, buzzerOn, galvNeedle, heatGlow, ledReversed, totalCurrent };
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

export interface Specimen {
  id: string;
  name: string;
  tavsif: string;
  /** mikroskop ostidagi ko'rinish turi */
  texture: "onion" | "cheek" | "leaf" | "blood" | "muscle" | "root" | "nerve" | "bone" | "fat" | "fungi" | "bacteria";
  rang: string;
  /** bo'yovchi (stain) kerakmi */
  stain: string;
}

export const SPECIMENS: Specimen[] = [
  { id: "onion", name: "🧅 Piyoz epidermasi", tavsif: "O'simlik hujayralari — to'g'ri burchakli 'g'isht' shaklida, xloroplastsiz.", texture: "onion", rang: "#d98cc8", stain: "Yod eritmasi (sariq)" },
  { id: "leaf", name: "🌿 Barg qatlami", tavsif: "Fotosintez zavodi — xloroplastlar va nafas olish teshikchalari (stoma).", texture: "leaf", rang: "#5fa05f", stain: "Suv (jonli)" },
  { id: "cheek", name: "👄 Og'iz shilliq qavati", tavsif: "Hayvon hujayralari — yumaloq, yadro markazda, devorsiz.", texture: "cheek", rang: "#e8b6c8", stain: "Metilen ko'ki" },
  { id: "blood", name: "🩸 Qon surtmasi", tavsif: "Eritrotsitlar (yadrosiz donachalar) va leykotsitlar (himoyachi hujayralar).", texture: "blood", rang: "#c94b4b", stain: "Romanovsky-Gyenza" },
  { id: "muscle", name: "💪 Mushak to'qimasi", tavsif: "Siyqish iplari — o'ziga xos yo'lbars chiziqlari bilan.", texture: "muscle", rang: "#c97b6a", stain: "Gematoxilin" },
  { id: "root", name: "🌱 Ildiz uchi", tavsif: "O'sish zonasi — hujayralar FAOL bo'linmoqda (mitoz bosqichlarini ko'rasiz!).", texture: "root", rang: "#d9c27b", stain: "Yod eritmasi" },
  { id: "nerve", name: "🧠 Asab hujayrasi", tavsif: "Yulduz shaklidagi tanasi va uzun o'simtalari — signallarni tez uzatadi!", texture: "nerve", rang: "#d8b46a", stain: "Kumush nitrat" },
  { id: "bone", name: "🦴 Suyak to'qimasi", tavsif: "Osteon halqalari — mustahkam tuzilish, markazda kanal bor.", texture: "bone", rang: "#e2d8bf", stain: "Gematoxilin" },
  { id: "fat", name: "🧈 Yog' hujayralari", tavsif: "Katta yog' tomchisi yadroni chetiga surib yuboradi — energiya ombori!", texture: "fat", rang: "#f2e2a8", stain: "Sudan III" },
  { id: "fungi", name: "🍄 Qo'ziqorin (gifa)", tavsif: "Uzun ipqatorlar (gifa) to'ri — zamburug'lar o'simlik emas!", texture: "fungi", rang: "#b89ad8", stain: "Metilen ko'ki" },
  { id: "bacteria", name: "🦠 Bakteriyalar", tavsif: "Mayda tayoqchalar va sharlar — ko'zga ko'rinmas olam!", texture: "bacteria", rang: "#7fc9a8", stain: "Gram bo'yash" },
];

export const MEIOSIS: DivisionStage[] = [
  { id: "inter1", name: "1. Interfaza I", tavsif: "DNK ko'payadi — hujayra meiozga tayyorlanadi.", phase: 0 },
  { id: "pro1", name: "2. Profaza I (krossingover!)", tavsif: "Gomolog xromosomalar juftlashadi va DNK almashinadi — irsiy xilma-xillik shu yerda tug'iladi!", phase: 1 },
  { id: "meta1", name: "3. Metafaza I", tavsif: "Gomolog juftlar ekvatorga joylashadi (tasodifiy tartibda).", phase: 2 },
  { id: "ana1", name: "4. Anafaza I", tavsif: "Gomolog xromosomalar ajraladi — xromosomalar soni yarimga kamayadi.", phase: 3 },
  { id: "telo1", name: "5. Telofaza I", tavsif: "Ikkita haploid hujayra hosil bo'ladi.", phase: 4 },
  { id: "mei2", name: "6. Meioz II (mitoz kabi)", tavsif: "Xromatidalar ajraladi — jami 4 ta HAPLOID jinsiy hujayra hosil bo'ladi!", phase: 5 },
];
