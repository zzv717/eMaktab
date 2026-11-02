// ---------------------------------------------------------------------------
// 🤖 Sun'iy intellekt — test savoli generatori (nechta savol + qiyinlik darajasi).
//
// Uch bosqichli zanjir (hammasi ishlaydi, tashqi kalit shart EMAS):
//   1) Admin 🤖 AI sozlamalaridagi kalit (OpenAI / Groq / DeepSeek — OpenAI-mos)
//   2) Bepul kalitsiz AI (text.pollinations.ai) — 2 marta uriniladi
//   3) O'rnatilgan mahalliy generator (fan bo'yicha HAQIQIY savollar banki)
//
// Qiyinlik darajasi foydalanuvchi tomonidan TANLANMAYDI — agent o'zi
// pastdan yuqoriga asta-sekin oshirib boradi (1..5).
// Har bir savolda to'g'ri javob JOYI tasodifiy aralashtiriladi (doim A emas).
// ---------------------------------------------------------------------------

import { createHash } from "crypto";
import { getSetting } from "@/lib/payments";

export interface GeneratedQuestion {
  question: string;
  options: string[]; // 4 ta variant
  correctIndex: number; // 0..3
  /** 1 (oson) .. 5 (juda qiyin) — avtomatik belgilanadi */
  difficulty?: number;
  /** ai = to'liq sun'iy agent · local = o'rnatilgan generator (kalitsiz) */
  engine?: "ai" | "local";
}

export const AI_KEYS = {
  base: "ai_base",
  model: "ai_model",
  key: "ai_key",
} as const;

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "oson (asosiy tushunchalar)",
  2: "o'rtacha-oson",
  3: "o'rtacha",
  4: "qiyin",
  5: "juda qiyin (chuqur tahlil)",
};

export async function getAiConfig(): Promise<{ base: string; model: string; key: string | null }> {
  const [base, model, key] = await Promise.all([
    getSetting(AI_KEYS.base),
    getSetting(AI_KEYS.model),
    getSetting(AI_KEYS.key),
  ]);
  return {
    base: (base || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: model || "gpt-4o-mini",
    key,
  };
}

export interface QuestionInput {
  mode: "book" | "topic";
  subject?: string;
  bookTitle?: string;
  bookAuthor?: string;
  pages?: string;
  topic?: string;
  /** O'quvchi sinfi (masalan "5-V") — darajani moslash uchun */
  gradeLevel?: string;
}

function sourceLine(input: QuestionInput): string {
  const subject = input.subject ? `Fan: ${input.subject}. ` : "";
  const grade = input.gradeLevel ? `O'quvchi: ${input.gradeLevel}-sinf. ` : "";
  return input.mode === "book"
    ? `${subject}${grade}Kitob: "${input.bookTitle}" (muallif: ${input.bookAuthor || "noma'lum"}), betlar: ${input.pages || "umumiy"}`
    : `${subject}${grade}Mavzu: ${input.topic}`;
}

function buildPrompt(input: QuestionInput, difficulty: number, count: number) {
  const system =
    "Sen o'zbek tilida maktab o'quvchilari uchun test savollari tuzuvchi yordamchisan. " +
    "MUHIM QOIDALAR: " +
    "1) Har bir savol mavzu/kitob MAZMUNIGA bevosita oid bo'lsin — mavzu haqida umumiy savollar emas! " +
    "2) Variantlar bir-biridan farq qilsin, ularning biri aniq to'g'ri bo'lsin. " +
    "3) correctIndex qiymati savollar bo'ylab TURLI bo'lsin (0,1,2,3 aralash — doim 0 emas!). " +
    "4) Savollar takrorlanmasin. " +
    "5) Faqat JSON massiv qaytar, boshqa matn yo'q. " +
    'Format: [{"question":"savol","options":["v1","v2","v3","v4"],"correctIndex":0}, ...]. ' +
    `Qiyinlik darajasi: ${difficulty}/5 — ${DIFFICULTY_LABELS[difficulty]}.`;
  const user = `${sourceLine(input)} asosida ${count} ta test savoli tuz.`;
  return { system, user };
}

/** Variantlarni aralashtiradi — to'g'ri javob har doim bitta joyda turmaydi. */
function shuffleOptions(question: string, options: string[], correctIndex: number, difficulty: number, engine: "ai" | "local"): GeneratedQuestion | null {
  // Dublikat/bo'sh variantlarni tozalash
  const seen = new Set<string>();
  const cleaned = options.filter((o) => {
    const k = o.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (cleaned.length < 4 || !question.trim()) return null;
  const correct = cleaned[Math.min(3, Math.max(0, correctIndex))] ?? cleaned[0]!;
  const pool = cleaned.filter((o) => o !== correct).slice(0, 3);
  const arr = [correct, ...pool];
  const newIdx = Math.floor(Math.random() * 4);
  [arr[0], arr[newIdx]] = [arr[newIdx]!, arr[0]!];
  return { question: question.trim().slice(0, 500), options: arr.map((o) => o.slice(0, 120)), correctIndex: newIdx, difficulty, engine };
}

function parseQuestionArray(raw: string, difficulty: number): GeneratedQuestion[] {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("AI javobini o'qib bo'lmadi");
  const parsed = JSON.parse(m[0]) as Array<{
    question?: string;
    options?: unknown;
    correctIndex?: unknown;
  }>;
  const out: GeneratedQuestion[] = [];
  for (const item of parsed) {
    const options = Array.isArray(item.options) ? item.options.map((o) => String(o)) : [];
    const q = String(item.question ?? "");
    // Meta-savollarni ("qaysi mavzu bo'yicha ishladik") rad etamiz
    if (/qaysi mavzu|qaysi kitob ustida|bugun nimada ishla/i.test(q)) continue;
    const correctIndex = Number(item.correctIndex);
    const shuffled = shuffleOptions(
      q,
      options,
      Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex <= 3 ? correctIndex : 0,
      difficulty,
      "ai",
    );
    if (shuffled) out.push(shuffled);
  }
  return out;
}

async function chatCompletions(
  base: string,
  model: string,
  apiKey: string | null,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(40000),
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 3000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`AI API xatosi ${res.status}: ${body}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------------------
// 🧩 O'rnatilgan mahalliy generator — kalit/Internet bo'lmasa ham ishlaydi.
// Fan bo'yicha HAQIQIY savollar banki + matematika uchun jonli hisoblash.
// ---------------------------------------------------------------------------

const MATH_HINT = /matemat|algebra|geometr|hisob|kasr|arifmetik/i;
const ENG_HINT = /ingliz|english/i;
const RUS_HINT = /rus tili|ruscha|russian/i;
const LIT_HINT = /adabiyot|ona tili|o'zbek tili|she'riyat/i;
const GEO_HINT = /geograf/i;
const HIST_HINT = /tarix/i;
const SCI_HINT = /biolog|kimyo|fizika|tabiiy|fanlar|atrof-muhit/i;

type Bank = { q: string; correct: string; wrong: string[] }[];

const ENG_BANK: Bank = [
  { q: "«Apple» so'zining tarjimasi qaysi?", correct: "olma", wrong: ["uzum", "anor", "shaftoli"] },
  { q: "«Book» so'zining tarjimasi qaysi?", correct: "kitob", wrong: ["daftar", "qalam", "stol"] },
  { q: "«Water» so'zining tarjimasi qaysi?", correct: "suv", wrong: ["sut", "sharbat", "choy"] },
  { q: "«School» so'zining tarjimasi qaysi?", correct: "maktab", wrong: ["kutubxona", "bog'cha", "bozor"] },
  { q: "«Teacher» so'zining tarjimasi qaysi?", correct: "o'qituvchi", wrong: ["shifokor", "o'quvchi", "fermer"] },
  { q: "«Friend» so'zining tarjimasi qaysi?", correct: "do'st", wrong: ["qo'shni", "ota-ona", "birodar"] },
  { q: "«Sun» so'zining tarjimasi qaysi?", correct: "quyosh", wrong: ["oy", "yulduz", "bulut"] },
  { q: "«Mother» so'zining tarjimasi qaysi?", correct: "ona", wrong: ["ota", "opa", "singil"] },
  { q: "«House» so'zining tarjimasi qaysi?", correct: "uy", wrong: ["darvoza", "hovli", "yo'l"] },
  { q: "«Bread» so'zining tarjimasi qaysi?", correct: "non", wrong: ["guruch", "go'sht", "sabzavot"] },
  { q: "«Rainbow» so'zining tarjimasi qaysi?", correct: "kamalak", wrong: ["yomg'ir", "qor", "shamol"] },
  { q: "«Happy» so'zining tarjimasi qaysi?", correct: "baxtli", wrong: ["g'amgin", "charchagan", "kasal"] },
];

const RUS_BANK: Bank = [
  { q: "«Книга» so'zining tarjimasi qaysi?", correct: "kitob", wrong: ["daftar", "qalam", "stol"] },
  { q: "«Школа» so'zining tarjimasi qaysi?", correct: "maktab", wrong: ["uy", "bozor", "bog'cha"] },
  { q: "«Вода» so'zining tarjimasi qaysi?", correct: "suv", wrong: ["sut", "choy", "sharbat"] },
  { q: "«Друг» so'zining tarjimasi qaysi?", correct: "do'st", wrong: ["ota", "ustoz", "qo'shni"] },
  { q: "«Солнце» so'zining tarjimasi qaysi?", correct: "quyosh", wrong: ["oy", "bulut", "yulduz"] },
  { q: "«Мама» so'zining tarjimasi qaysi?", correct: "ona", wrong: ["opa", "ota", "buvi"] },
];

const LIT_BANK: Bank = [
  { q: "«Xamsa» asari muallifi kim?", correct: "Alisher Navoiy", wrong: ["Abdulla Qodiriy", "Cho'lpon", "G'afur G'ulom"] },
  { q: "«O'tkan kunlar» romani muallifi kim?", correct: "Abdulla Qodiriy", wrong: ["O'tkir Hoshimov", "Alisher Navoiy", "Hamza"] },
  { q: "«Shum bola» asari muallifi kim?", correct: "G'afur G'ulom", wrong: ["Cho'lpon", "Abdulla Qahhor", "Mirtemir"] },
  { q: "«Davr» romani muallifi kim?", correct: "O'tkir Hoshimov", wrong: ["Abdulla Qodiriy", "Said Ahmad", "Pirimqul Qodirov"] },
  { q: "«Kecha va kunduz» asari muallifi kim?", correct: "Cho'lpon", wrong: ["G'afur G'ulom", "Abdulla Qahhor", "Furqat"] },
  { q: "«Navoiy» dostoni (Hamid Ismoil) qaysi shoir haqida?", correct: "Alisher Navoiy", wrong: ["Bobur", "Furqat", "Muqimiy"] },
];

const GEO_BANK: Bank = [
  { q: "O'zbekiston poytaxti qaysi shahar?", correct: "Toshkent", wrong: ["Samarqand", "Buxoro", "Andijon"] },
  { q: "Turkiya poytaxti qaysi shahar?", correct: "Anqara", wrong: ["Istanbul", "Izmir", "Antaliya"] },
  { q: "Fransiya poytaxti qaysi shahar?", correct: "Parij", wrong: ["Lion", "Marsel", "Nitsa"] },
  { q: "Yaponiya poytaxti qaysi shahar?", correct: "Tokio", wrong: ["Kioto", "Osaka", "Nagoya"] },
  { q: "Misr poytaxti qaysi shahar?", correct: "Qohira", wrong: ["Iskandariya", "Luvr", "Bag'dod"] },
  { q: "Rossiya poytaxti qaysi shahar?", correct: "Moskva", wrong: ["Sankt-Peterburg", "Kazan", "Novosibirsk"] },
];

const HIST_BANK: Bank = [
  { q: "O'zbekiston mustaqilligi qachon e'lon qilingan?", correct: "1991-yil 31-avgust", wrong: ["1990-yil 20-iyun", "1992-yil 1-mart", "1989-yil 21-dekabr"] },
  { q: "Alisher Navoiy qaysi asrda yashab ijod qilgan?", correct: "XV asr", wrong: ["X asr", "XIX asr", "XX asr"] },
  { q: "Amir Temur davlatining poytaxti qaysi shahar bo'lgan?", correct: "Samarqand", wrong: ["Buxoro", "Xiva", "Toshkent"] },
  { q: "Buyuk ipak yo'li qaysi qit'alararo savdo yo'li hisoblanadi?", correct: "Osiyo va Yevropa", wrong: ["Afrika va Amerika", "Avstraliya va Osiyo", "Shimoliy va Janubiy Amerika"] },
];

const SCI_BANK: Bank = [
  { q: "Suvning kimyoviy formulasi qanday?", correct: "H₂O", wrong: ["CO₂", "O₂", "NaCl"] },
  { q: "Quyosh tizimidagi eng katta sayyora qaysi?", correct: "Yupiter", wrong: ["Yer", "Saturn", "Mars"] },
  { q: "Inson yuragi nechta kameradan iborat?", correct: "4 ta", wrong: ["2 ta", "3 ta", "6 ta"] },
  { q: "Fotosintez jarayoni qaysi organoidda kechadi?", correct: "Xloroplastda", wrong: ["Yadroda", "Ribosomada", "Vakuolada"] },
  { q: "Yer sun'iy yo'ldoshi qanday nomlanadi?", correct: "Oy", wrong: ["Quyosh", "Venera", "Mars"] },
  { q: "Havoning asosiy qismi qaysi gazdan iborat?", correct: "Azot", wrong: ["Kislorod", "Vodorod", "Karbonat angidrid"] },
  { q: "Odam organizmida qon aylanish tizimini kim kashf etgan?", correct: "Vilyam Garvey", wrong: ["Is'hoq Nyuton", "Albert Eynshteyn", "Lui Paster"] },
];

function bankQuestion(bank: Bank, difficulty: number, variant: number): GeneratedQuestion {
  const item = bank[Math.abs(variant) % bank.length]!;
  const shuffled = shuffleOptions(item.q, [item.correct, ...item.wrong], 0, difficulty, "local");
  // bank doim 4 ta to'liq variant beradi — shuffleOptions doim qaytaradi
  return shuffled!;
}

function mathQuestion(difficulty: number, variant: number): GeneratedQuestion {
  const rnd = (min: number, max: number) => min + ((Math.abs(variant) * 7 + Math.floor(Math.random() * (max - min + 1))) % (max - min + 1));
  const mk = (q: string, correct: number, distract: number[]): GeneratedQuestion => {
    const wrong = [...new Set(distract.map((n) => String(n)).filter((n) => n !== String(correct)))].slice(0, 3);
    while (wrong.length < 3) wrong.push(String(correct + wrong.length + 2));
    const shuffled = shuffleOptions(q, [String(correct), ...wrong], 0, difficulty, "local");
    return shuffled!;
  };
  const d = Math.min(5, Math.max(1, difficulty));
  if (d <= 2) {
    const a = rnd(12, 90);
    const b = rnd(11, 80);
    return mk(`${a} + ${b} = ?`, a + b, [a + b + 3, a + b - 5, a + b + 11]);
  }
  if (d === 3) {
    const a = rnd(12, 25);
    const b = rnd(4, 12);
    return mk(`${a} × ${b} = ?`, a * b, [a * b + b, a * b - a, a * b + 2]);
  }
  if (d === 4) {
    const a = rnd(12, 25);
    const b = rnd(4, 9);
    const c = rnd(10, 40);
    return mk(`${a} × ${b} + ${c} = ?`, a * b + c, [a * b + c + 5, a * b + c - 7, a * b + c + 12]);
  }
  // 5: tenglamani yechish ax + b = c
  const x = rnd(3, 12);
  const a = rnd(2, 9);
  const b = rnd(5, 30);
  return mk(`Agar ${a}x + ${b} = ${a * x + b} bo'lsa, x nechaga teng?`, x, [x + 1, x - 1, x + 2]);
}

/**
 * Mahalliy generator: fan bo'yicha haqiqiy savollar.
 * variant = takrorlanmaslik uchun raqam (har safar o'sadi).
 */
export function localQuestion(input: QuestionInput, difficulty = 1, variant = 0): GeneratedQuestion {
  const subject = (input.subject || "").trim();
  const d = Math.min(5, Math.max(1, difficulty));

  // 1) Fan bo'yicha tayyor banklar (haqiqiy savollar!)
  if (subject) {
    if (MATH_HINT.test(subject)) return mathQuestion(d, variant);
    if (ENG_HINT.test(subject)) return bankQuestion(ENG_BANK, d, variant);
    if (RUS_HINT.test(subject)) return bankQuestion(RUS_BANK, d, variant);
    if (LIT_HINT.test(subject)) return bankQuestion(LIT_BANK, d, variant);
    if (GEO_HINT.test(subject)) return bankQuestion(GEO_BANK, d, variant);
    if (HIST_HINT.test(subject)) return bankQuestion(HIST_BANK, d, variant);
    if (SCI_HINT.test(subject)) return bankQuestion(SCI_BANK, d, variant);
  }

  // 2) Kitob rejimi — kitob faktlari (muallif, nom, betlar)
  const title = (input.bookTitle || "").trim();
  const author = (input.bookAuthor || "").trim();
  const pages = (input.pages || "").trim();
  if (input.mode === "book" && title) {
    const famous = [
      "Alisher Navoiy", "Abdulla Qodiriy", "Cho'lpon", "G'afur G'ulom",
      "O'tkir Hoshimov", "Abdulla Qahhor", "Hamza Hakimzoda", "Pirimqul Qodirov",
    ];
    const kind = author ? variant % 3 : variant % 2;
    if (kind === 0 && author) {
      return bankQuestion(
        [{ q: `«${title}» kitobining muallifi kim?`, correct: author, wrong: famous.slice(0, 3) }],
        d,
        0,
      );
    }
    if ((kind === 1 || !author) && pages && /\d/.test(pages)) {
      return bankQuestion(
        [{ q: `«${title}» kitobidan qaysi betlar o'qildi?`, correct: pages, wrong: ["1-10", "21-30", "50-60"] }],
        d,
        0,
      );
    }
    return bankQuestion(
      [{ q: `Biz o'qigan asar qaysi?`, correct: title, wrong: ["Boshqa asar", "Darslik", "Lug'at"] }],
      d,
      0,
    );
  }

  // 3) Mavzu rejimi, fan noma'lum — umumiy bilimlar banki
  const generic = [...SCI_BANK, ...GEO_BANK, ...HIST_BANK];
  return bankQuestion(generic, d, variant);
}

// ---------------------------------------------------------------------------
// Asosiy API: N ta savol, qiyinlik pastdan yuqoriga asta-sekin.
// ---------------------------------------------------------------------------

/** testLevel (1..5) bo'yicha N ta savol yaratadi. */
export async function generateTestQuestions(
  input: QuestionInput,
  count: number,
  level = 1,
): Promise<GeneratedQuestion[]> {
  const cfg = await getAiConfig();
  const lvl = Math.min(5, Math.max(1, Math.round(level)));

  // 3 ta band: oson → o'rtacha → qiyin (asta-osa, birdan emas)
  const bands: Array<{ difficulty: number; size: number }> = [
    { difficulty: lvl, size: Math.ceil(count / 3) },
    { difficulty: Math.min(5, lvl + 1), size: Math.ceil((count - Math.ceil(count / 3)) / 2) },
    { difficulty: Math.min(5, lvl + 2), size: 0 },
  ];
  bands[2].size = count - bands[0].size - bands[1].size;

  const out: GeneratedQuestion[] = [];
  const seenQuestions = new Set<string>();
  let variant = 0;
  for (const band of bands) {
    if (band.size <= 0) continue;
    let got: GeneratedQuestion[] = [];
    // 1) Admin kaliti · 2) Bepul AI — har biriga 2 marta urinish
    const attempts: Array<{ base: string; model: string; key: string | null }> = cfg.key
      ? [
          { base: cfg.base, model: cfg.model, key: cfg.key },
          { base: "https://text.pollinations.ai/openai", model: "openai", key: null },
          { base: "https://text.pollinations.ai/openai", model: "openai", key: null },
        ]
      : [
          { base: "https://text.pollinations.ai/openai", model: "openai", key: null },
          { base: "https://text.pollinations.ai/openai", model: "openai", key: null },
        ];
    for (const a of attempts) {
      try {
        const { system, user } = buildPrompt(input, band.difficulty, band.size);
        const raw = await chatCompletions(a.base, a.model, a.key, system, user);
        got = parseQuestionArray(raw, band.difficulty);
        if (got.length >= band.size) break;
      } catch {
        /* keyingi urinish */
      }
    }
    // yetishmaganini mahalliy generator to'ldiradi — hech qachon yiqilmaydi
    while (got.length < band.size) {
      const q = localQuestion(input, band.difficulty, variant++);
      const fp = questionFingerprint(q);
      if (!seenQuestions.has(fp) || variant > band.size * 3) {
        got.push(q);
      }
    }
    for (const q of got.slice(0, band.size)) {
      const fp = questionFingerprint(q);
      if (seenQuestions.has(fp)) continue;
      seenQuestions.add(fp);
      out.push(q);
    }
    // bandda takrorlar tufayli joy to'lmagan bo'lsa — local bilan to'ldiramiz
    while (out.filter((q) => q.difficulty === band.difficulty).length < band.size && variant < 50) {
      const q = localQuestion(input, band.difficulty, variant++);
      const fp = questionFingerprint(q);
      if (!seenQuestions.has(fp)) {
        seenQuestions.add(fp);
        out.push(q);
      }
    }
  }
  return out.slice(0, count);
}

/** Bitta savol (eski API — muvofiqlik uchun). */
export async function generateTestQuestion(input: QuestionInput): Promise<GeneratedQuestion> {
  const [q] = await generateTestQuestions(input, 1, 3);
  return q;
}

export function questionFingerprint(q: GeneratedQuestion): string {
  return createHash("sha1").update(q.question).digest("hex").slice(0, 8);
}
