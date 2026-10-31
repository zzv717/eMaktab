// ---------------------------------------------------------------------------
// 🤖 Sun'iy intellekt — test savoli generatori (nechta savol + qiyinlik darajasi).
//
// Uch bosqichli zanjir (hammasi ishlaydi, tashqi kalit shart EMAS):
//   1) Admin 🤖 AI sozlamalaridagi kalit (OpenAI / Groq / DeepSeek — OpenAI-mos)
//   2) Bepul kalitsiz AI (text.pollinations.ai)
//   3) O'rnatilgan mahalliy generator (har doim ishlaydi)
//
// Qiyinlik darajasi foydalanuvchi tomonidan TANLANMAYDI — agent o'zi
// pastdan yuqoriga asta-sekin oshirib boradi (1..5).
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
  bookTitle?: string;
  bookAuthor?: string;
  pages?: string;
  topic?: string;
}

function sourceLine(input: QuestionInput): string {
  return input.mode === "book"
    ? `Kitob: "${input.bookTitle}" (muallif: ${input.bookAuthor || "noma'lum"}), betlar: ${input.pages || "umumiy"}`
    : `Mavzu: ${input.topic}`;
}

function buildPrompt(input: QuestionInput, difficulty: number, count: number) {
  const system =
    "Sen o'zbek tilida maktab o'quvchilari uchun test savollari tuzuvchi yordamchisan. " +
    `Javobni FAQAT JSON ko'rinishida qaytar (massiv): ` +
    '[{"question":"savol","options":["v1","v2","v3","v4"],"correctIndex":0}, ...]. ' +
    `Har bir savolda 4 ta variant bo'lsin, bittasi to'g'ri (correctIndex 0..3). ` +
    `Qiyinlik darajasi: ${difficulty}/5 — ${DIFFICULTY_LABELS[difficulty]}.`;
  const user = `${sourceLine(input)} asosida ${count} ta test savoli tuz.`;
  return { system, user };
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
    const options = Array.isArray(item.options)
      ? item.options.map((o) => String(o).slice(0, 120)).slice(0, 4)
      : [];
    if (!item.question || options.length < 4) continue;
    let correctIndex = Number(item.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) correctIndex = 0;
    out.push({
      question: String(item.question).slice(0, 500),
      options,
      correctIndex,
      difficulty,
      engine: "ai",
    });
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
// Qiyinlik darajasi bilan: osonga yaqin = eslab qolish, qiyinga yaqin = fikrlash.
// ---------------------------------------------------------------------------

export function localQuestion(input: QuestionInput, difficulty = 1, variant = 0): GeneratedQuestion {
  const shuffleWithCorrect = (correct: string, distractors: string[]): { options: string[]; correctIndex: number } => {
    const pool = [...new Set(distractors.filter((d) => d && d !== correct))].slice(0, 3);
    while (pool.length < 3) pool.push(`Variant ${pool.length + 1}`);
    const options = [correct, ...pool];
    const correctIndex = Math.floor(Math.random() * 4);
    [options[0], options[correctIndex]] = [options[correctIndex], options[0]];
    return { options, correctIndex };
  };

  const title = (input.bookTitle || "kitob").trim();
  const author = (input.bookAuthor || "").trim();
  const pages = (input.pages || "").trim();
  const topic = (input.topic || "bugungi mavzu").trim();

  if (input.mode === "book") {
    const famous = [
      "Alisher Navoiy", "Abdulla Qodiriy", "Cho'lpon", "G'afur G'ulom",
      "O'tkir Hoshimov", "Anatole France", "Mark Twain", "Lev Tolstoy",
    ];
    // variant 0: muallif · 1: betlar · 2: nom · 3+: takror (turli distraktorlar bilan)
    const kind = author ? variant % 3 : variant % 2;
    if (kind === 0 && author) {
      const { options, correctIndex } = shuffleWithCorrect(author, [...famous, `${title} muallifi boshqa`]);
      return { question: `«${title}» kitobining muallifi kim?`, options, correctIndex, difficulty, engine: "local" };
    }
    if ((kind === 1 || !author) && pages && /\d/.test(pages)) {
      const { options, correctIndex } = shuffleWithCorrect(pages, ["1-10", "21-30", "50-60", "100-110", "15-25"]);
      return {
        question: `«${title}» kitobidan qaysi betlar o'qildi?`,
        options,
        correctIndex,
        difficulty,
        engine: "local",
      };
    }
    const { options, correctIndex } = shuffleWithCorrect(title, ["Boshqa kitob", "Darslik", "Lug'at", "Risola"]);
    return {
      question: difficulty >= 3 ? `Biz o'qigan asar qaysi? (eslab turing)` : `Bugun qaysi kitob ustida ishladik?`,
      options,
      correctIndex,
      difficulty,
      engine: "local",
    };
  }

  // Mavzu bo'yicha — turli shakllar
  const hard = difficulty >= 3;
  const { options, correctIndex } = shuffleWithCorrect(topic, [
    "Ko'paytirish jadvali",
    "Ingliz tili alifbosi",
    "Dunyo xaritasi",
    "Kesimlar to'plami",
    "Zamonaviy adabiyot",
  ]);
  return {
    question: hard
      ? `Bugungi mashg'ulotda asosiy mavzu qaysi edi?`
      : `Bugun qaysi mavzu bo'yicha ishladik?`,
    options,
    correctIndex,
    difficulty,
    engine: "local",
  };
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
  let variant = 0;
  for (const band of bands) {
    if (band.size <= 0) continue;
    let got: GeneratedQuestion[] = [];
    // 1) Admin kaliti · 2) Bepul AI — bir band uchun bitta so'rov
    const attempts: Array<{ base: string; model: string; key: string | null }> = cfg.key
      ? [
          { base: cfg.base, model: cfg.model, key: cfg.key },
          { base: "https://text.pollinations.ai/openai", model: "openai", key: null },
        ]
      : [{ base: "https://text.pollinations.ai/openai", model: "openai", key: null }];
    for (const a of attempts) {
      try {
        const { system, user } = buildPrompt(input, band.difficulty, band.size);
        const raw = await chatCompletions(a.base, a.model, a.key, system, user);
        got = parseQuestionArray(raw, band.difficulty);
        if (got.length > 0) break;
      } catch {
        /* keyingi urinish */
      }
    }
    // yetishmaganini mahalliy generator to'ldiradi — hech qachon yiqilmaydi
    while (got.length < band.size) {
      got.push(localQuestion(input, band.difficulty, variant++));
    }
    out.push(...got.slice(0, band.size));
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
