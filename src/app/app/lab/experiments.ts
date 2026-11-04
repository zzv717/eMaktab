// 📋 Tajribalar kutubxonasi — bosqichma-bosqich ilmiy tajribalar (o'zbekcha)
// Har bir tajriba: maqsad, jihozlar, xavfsizlik, qadamlar, kutilgan natija, tushuntirish, formula.

export type Difficulty = "Boshlang'ich" | "O'rta" | "Yuqori";

export interface Experiment {
  id: string;
  title: string;
  subject: "Kimyo" | "Fizika" | "Biologiya";
  difficulty: Difficulty;
  objective: string;
  equipment: string[];
  safety: string;
  steps: string[];
  expected: string;
  explanation: string;
  formula?: string;
  /** qaysi lab rejimida ochilishi kerak */
  openIn: "chem" | "phys" | "bio";
}

export const EXPERIMENTS: Experiment[] = [
  // ===================== 🧪 KIMYO =====================
  {
    id: "chem-nacl",
    title: "⚡ Na + Cl → NaCl sintezi (oshxona tuzi)",
    subject: "Kimyo",
    difficulty: "Boshlang'ich",
    objective: "Ikki element birlashib yangi modda hosil qilishini ko'rish — sintez reaksiyasi.",
    equipment: ["Natriy (Na)", "Xlor (Cl)", "Stakan", "Aralashtirish tayoqchasi"],
    safety: "Haqiqiy laboratoriyada natriy suv bilan portlaydi! Bu VIRTUAL tajriba.",
    steps: [
      "1️⃣ Katalogdan stakanni qo'shing.",
      "2️⃣ Na va Cl elementlarining shishalarini stakanga quying.",
      "3️⃣ 🥄 'Aralashtirish' tugmasini bosing.",
      "4️⃣ Pastda tenglamani kuzating: Na + Cl → NaCl.",
    ],
    expected: "Eritma rangi o'zgaradi va pastda 'Na + Cl → NaCl' tenglamasi chiqadi.",
    explanation: "Natriy (metall) va xlor (metallmas) elektron almashinuvi orqali ION bog' hosil qiladi — bu oshxona tuzi (NaCl).",
    formula: "Na + Cl → NaCl",
    openIn: "chem",
  },
  {
    id: "chem-h2o",
    title: "💧 Suv hosil bo'lishi — stoxiometriya (2H + O)",
    subject: "Kimyo",
    difficulty: "O'rta",
    objective: "Reaksiya uchun atomlar NISBATI muhimligini tushunish (2 ta vodorod : 1 ta kislorod).",
    equipment: ["Vodorod (H)", "Kislorod (O)", "Probirka"],
    safety: "Haqiqiy H₂ + O₂ aralashmasi portlovchi! Faqat virtual sinang.",
    steps: [
      "1️⃣ Probirkaga 1 qism H va 1 qism O quying → reaksiya BO'LMAYDI (nisbat noto'g'ri!).",
      "2️⃣ Endi 2 qism H va 1 qism O quying.",
      "3️⃣ 🥄 Aralashtiring — '2H + O → H₂O' chiqadi!",
    ],
    expected: "1:1 nisbatda hech narsa bo'lmaydi; 2:1 nisbatda suv hosil bo'ladi.",
    explanation: "Suv molekulasida 2 ta vodorod va 1 ta kislorod atomi bor (H₂O). Kimyoviy tenglama atomlar sonini SAQLAYDI — massaning saqlanish qonuni!",
    formula: "2H + O → H₂O",
    openIn: "chem",
  },
  {
    id: "chem-titration",
    title: "🧪 Titrlash — HCl + NaOH neytrallanish",
    subject: "Kimyo",
    difficulty: "Yuqori",
    objective: "Kislota va ishqorning bir-birini zararsizlantirishini, indikator orqali nuqta topishni o'rganish.",
    equipment: ["HCl", "NaOH", "Fenolftalein (fen)", "Stakan", "Pipetka"],
    safety: "Kislota/ishqor teriga tushsa — sovuq suv bilan yuving!",
    steps: [
      "1️⃣ Stakanga HCl quying.",
      "2️⃣ 2 tomchi fenolftalein qo'shing — eritma RANGSIZ (pH < 8.2).",
      "3️⃣ NaOH ni tomchilab quying, har safar aralashtiring.",
      "4️⃣ pH 8.2 da eritma OCH PUSHTI bo'ladi 💗 — shu neytrallanish nuqtasi!",
      "5️⃣ Ortiqcha NaOH quyilsa — TO'Q PUSHTI (Over-titrated) ⚠️.",
    ],
    expected: "Rangsiz → och pushti → (ortiqcha) to'q pushti. Pastda tenglama chiqadi.",
    explanation: "Neytrallanishda kislota va ishqor tuz + suvga aylanadi. Fenolftalein pH 8.2 dan yuqorida pushti rangga o'tadi — shuning uchun aynan shu nuqtani ko'rsatadi.",
    formula: "HCl + NaOH → NaCl + H₂O",
    openIn: "chem",
  },
  // ===================== ⚡ FIZIKA =====================
  {
    id: "phys-ohm",
    title: "⚡ Om qonuni — I = U/R",
    subject: "Fizika",
    difficulty: "Boshlang'ich",
    objective: "Tok kuchi, kuchlanish va qarshilik orqasidagi bog'lanishni topish.",
    equipment: ["Batareya (9V)", "Rezistor", "Ampermetr", "Simlar"],
    safety: "Qisqa tutashuv qilmang (+ va − ni bevosita ulamang).",
    steps: [
      "1️⃣ Batareya + rezistor + ampermetrni ketma-ket ulang.",
      "2️⃣ Kalitni yoping — ampermetr strelkasi egiladi.",
      "3️⃣ Rezistor qiymatini o'zgartiring — tok kuchi qanday o'zgaradi?",
      "4️⃣ Formulani tekshiring: I = U/R.",
    ],
    expected: "Qarshilik oshsa — tok kamayadi. Ampermetr ko'rsatgichi shunga mos ravishda o'zgaradi.",
    explanation: "Om qonuni — elektr zanjirining asosiy qonuni. Strelka inersiya bilan harakatlanadi (haqiqiy asbob kabi!).",
    formula: "I = U / R",
    openIn: "phys",
  },
  {
    id: "phys-circuits",
    title: "🔗 Alohida zanjirlar mustaqil ishlaydi",
    subject: "Fizika",
    difficulty: "O'rta",
    objective: "Parallel zanjirlar bir-biriga bog'liq emasligini ko'rish.",
    equipment: ["2 ta batareya", "Isitgich", "Gurj", "Kalit", "Simlar"],
    safety: "Qisqa tutashuvda uchqun chiqadi — ehtiyot bo'ling!",
    steps: [
      "1️⃣ 1-batareya + isitgichni ulang → isitgich YONADI.",
      "2️⃣ Gurjni ulamang turib qoldiring — isitgich ishlashda davom etadi!",
      "3️⃣ 2-batareya + gurjni ALOHIDA ulang → gurj ham ishlaydi.",
      "4️⃣ Bitta kalitni oching — ikkinchisi uzilmaydi.",
    ],
    expected: "Har bir yopiq zanjir o'zi mustaqil ishlaydi; ochiq zanjirda tok o'tmaydi.",
    explanation: "Uyda ham har bir jihoz alohida zanjirda. Shuning uchun uzilgan televizor chiroqni o'chirmaydi!",
    openIn: "phys",
  },
  {
    id: "phys-hooke",
    title: "🌀 Hooke qonuni — F = k·x",
    subject: "Fizika",
    difficulty: "Boshlang'ich",
    objective: "Prujina cho'zilishi bilan kuch orasidagi chiziqli bog'lanishni topish.",
    equipment: ["Prujina", "Turli og'irliklar", "Lineyka"],
    safety: "Ogirliklarni ehtiyot bilan iling.",
    steps: [
      "1️⃣ Prujinaga 1 kg og'irlik iling — cho'zilishni o'lchang.",
      "2️⃣ 2 kg iling — cho'zilish 2 barobar oshadi!",
      "3️⃣ k ni hisoblang: k = F/x.",
      "4️⃣ Grafik chizing — u TO'G'RI CHIZIQ chiqadi.",
    ],
    expected: "Og'irlik ortganda cho'zilish proporsional ortadi (chiziqli grafik).",
    explanation: "Hooke qonuni — prujina, amortizator, tarozi va soat mexanizmi shu qonun bilan ishlaydi.",
    formula: "F = k · x",
    openIn: "phys",
  },
  // ===================== 🧫 BIOLOGIYA =====================
  {
    id: "bio-onion",
    title: "🧅 Piyaz hujayrasi — preparat tayyorlash",
    subject: "Biologiya",
    difficulty: "Boshlang'ich",
    objective: "O'simlik hujayrasini mikroskopda ko'rish uchun to'g'ri preparat tayyorlashni o'rganish.",
    equipment: ["Piyaz bo'lagi", "Skalpel", "Pinset", "Preparat oynachasi", "Yopqich shisha", "Suv", "Yod"],
    safety: "Skalpel bilan ehtiyot bo'ling — o'tkir!",
    steps: [
      "1️⃣ Skalpel bilan piyozni kesing, pinset bilan 1 qatlam pardani ajrating.",
      "2️⃣ Oynachaga 1 tomchi SUV tomizib, pardani ichiga yoying.",
      "3️⃣ 1 tomchi YOD tomizing (yadrolar ko'rinadi!).",
      "4️⃣ Yopqich shishani 45° bilan sekin tushiring (havo pufakchasi bo'lmasin!).",
      "5️⃣ Mikroskopga qo'ying — ×100 da 'Hujayra ichiga kirish' ni sinang.",
    ],
    expected: "To'rtburchak hujayralar, yadro yod bilan to'q rangda ko'rinadi.",
    explanation: "Yod yadro (DNK) ni bo'yaydi. Yopqich shisha 45° tushirilganda havo pufakchasi qolmaydi — real laboratoriya qoidasi!",
    openIn: "bio",
  },
  {
    id: "bio-mitosis",
    title: "🧬 Mitoz — hujayra bo'linishi bosqichlari",
    subject: "Biologiya",
    difficulty: "O'rta",
    objective: "Profaza → Metafaza → Anafaza → Telofaza bosqichlarini kuzatish.",
    equipment: ["Mitoz rejimi (Biologiya)", "Ildiz uchi namunasi"],
    safety: "—",
    steps: [
      "1️⃣ Biologiyada '🧬 Mitoz' rejimini oching.",
      "2️⃣ Bosqichlarni birma-bir bosing va xromosomalar harakatini kuzating.",
      "3️⃣ Anafazada xromosomalar IKKI tomonga ajralishiga e'tibor bering.",
      "4️⃣ Natijada 2 ta bir xil hujayra hosil bo'ladi!",
    ],
    expected: "Har bosqichda xromosomalar aniq shaklda harakatlanadi va hujayra 2 ga bo'linadi.",
    explanation: "Mitoz — organizm o'sishi va jarohat bitishi. Agar mitoz NORMADAN TEZ ketsa — bu SARATON (o'sma) belgisi!",
    openIn: "bio",
  },
  {
    id: "bio-blood",
    title: "🩸 Qon surtmasi — mikroskopda ko'rish",
    subject: "Biologiya",
    difficulty: "Yuqori",
    objective: "Qon hujayralarini (eritrotsitlar, leykotsitlar) ajratib ko'rish.",
    equipment: ["Qon namunasi", "Surtma tayoqchasi", "Bo'yovchi", "Mikroskop"],
    safety: "Haqiqiy qon bilan faqat tibbiy qo'lqopda ishlang!",
    steps: [
      "1️⃣ '🩸 Qon surtmasi' namunasini tanlang.",
      "2️⃣ Surtma tayoqchasi bilan surtma tayyorlang (yaqin keltirib tugma chiqadi!).",
      "3️⃣ Bo'yovchi tomizib, mikroskopga qo'ying.",
      "4️⃣ ×100 da ko'ring: donador eritrotsitlar va yirik leykotsitlar.",
    ],
    expected: "Ko'p miqdorda sarg'ish disklar (eritrotsit), kam sonli yirik hujayralar (leykotsit).",
    explanation: "Eritrotsitlar kislorod tashiydi, leykotsitlar — himoya qiladi. Shifokorlar bezgakni aynan surtma orqali aniqlaydi!",
    openIn: "bio",
  },
];

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  "Boshlang'ich": "bg-emerald-100 text-emerald-800",
  "O'rta": "bg-amber-100 text-amber-800",
  "Yuqori": "bg-rose-100 text-rose-800",
};
