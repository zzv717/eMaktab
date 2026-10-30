// ---------------------------------------------------------------------------
// 🤖 Sun'iy intellekt — test savoli generatori.
//
// Uch bosqichli zanjir (hammasi ishlaydi, tashqi kalit shart EMAS):
//   1) Admin 🤖 AI sozlamalaridagi kalit (OpenAI / Groq / DeepSeek — OpenAI-mos)
//   2) Bepul kalitsiz AI (text.pollinations.ai)
//   3) O'rnatilgan mahalliy generator (har doim ishlaydi)
// ---------------------------------------------------------------------------

import { getSetting } from "@/lib/payments";

export interface GeneratedQuestion {
  question: string;
  options: string[]; // 4 ta variant
  correctIndex: number; // 0..3
  /** ai = to'liq sun'iy agent · local = o'rnatilgan generator (kalitsiz) */
  engine?: "ai" | "local";
}

export const AI_KEYS = {
  base: "ai_base",
  model: "ai_model",
  key: "ai_key",
} as const;

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

interface QuestionInput {
  mode: "book" | "topic";
  bookTitle?: string;
  bookAuthor?: string;
  pages?: string;
  topic?: string;
}

function buildPrompt(input: QuestionInput): { system: string; user: string; source: string } {
  const source =
    input.mode === "book"
      ? `Kitob: "${input.bookTitle}" (muallif: ${input.bookAuthor || "noma'lum"}), betlar: ${input.pages || "umumiy"}`
      : `Mavzu: ${input.topic}`;
  const system =
    "Sen o'zbek tilida maktab o'quvchilari uchun qisqa test savoli tuzuvchi yordamchisan. " +
    "Javobni FAQAT JSON ko'rinishida qaytar: " +
    '{"question":"savol matni","options":["variant1","variant2","variant3","variant4"],"correctIndex":0}. ' +
    "4 ta variant bo'lsin, bittasi to'g'ri (correctIndex 0..3). Savol aniq va sodda bo'lsin.";
  return { system, user: `${source} asosida bitta test savoli tuz.`, source };
}

function parseQuestion(raw: string): GeneratedQuestion {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI javobini o'qib bo'lmadi");
  const parsed = JSON.parse(m[0]) as {
    question?: string;
    options?: unknown;
    correctIndex?: unknown;
  };
  const options = Array.isArray(parsed.options)
    ? parsed.options.map((o) => String(o).slice(0, 120)).slice(0, 4)
    : [];
  if (!parsed.question || options.length < 4) {
    throw new Error("AI to'liq savol bermadi");
  }
  let correctIndex = Number(parsed.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) correctIndex = 0;
  return { question: String(parsed.question).slice(0, 500), options, correctIndex, engine: "ai" };
}

/** O'rnatilgan mahalliy generator — kalit/Internet bo'lmasa ham ishlaydi. */
export function localQuestion(input: QuestionInput): GeneratedQuestion {
  const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const shuffleWithCorrect = (correct: string, distractors: string[]): { options: string[]; correctIndex: number } => {
    const pool = [...new Set(distractors.filter((d) => d && d !== correct))].slice(0, 3);
    while (pool.length < 3) pool.push(`Variant ${pool.length + 1}`);
    const options = [correct, ...pool];
    const correctIndex = Math.floor(Math.random() * 4);
    [options[0], options[correctIndex]] = [options[correctIndex], options[0]];
    return { options, correctIndex };
  };

  if (input.mode === "book") {
    const title = (input.bookTitle || "kitob").trim();
    const author = (input.bookAuthor || "").trim();
    const pages = (input.pages || "").trim();
    // 1) Muallif haqida savol (author bo'lsa)
    if (author) {
      const famous = ["Alisher Navoiy", "Abdulla Qodiriy", "Cho'lpon", "G'afur G'ulom", "O'tkir Hoshimov", "Anatole France", "Mark Twain", "Lev Tolstoy"];
      const { options, correctIndex } = shuffleWithCorrect(author, [...famous, `${title} muallifi boshqa`]);
      return {
        question: `«${title}» kitobining muallifi kim?`,
        options,
        correctIndex,
        engine: "local",
      };
    }
    // 2) Betlar haqida savol (pages bo'lsa)
    if (pages && /\d/.test(pages)) {
      const { options, correctIndex } = shuffleWithCorrect(pages, ["1-10", "21-30", "50-60", "100-110"]);
      return {
        question: `«${title}» kitobidan qaysi betlar o'qildi?`,
        options,
        correctIndex,
        engine: "local",
      };
    }
    const { options, correctIndex } = shuffleWithCorrect(title, ["Boshqa kitob", "Darslik", "Lug'at"]);
    return {
      question: `Bugun qaysi kitob ustida ishladik?`,
      options,
      correctIndex,
      engine: "local",
    };
  }

  // Mavzu bo'yicha — bolaning o'zi aytgan mavzuni tekshiruvchi savol
  const topic = (input.topic || "bugungi mavzu").trim();
  const { options, correctIndex } = shuffleWithCorrect(topic, [
    "Ko'paytirish jadvali",
    "Ingliz tili alifbosi",
    "Dunyo xaritasi",
    "Kesimlar to'plami",
  ]);
  return {
    question: `Bugun qaysi mavzu bo'yicha ishladik?`,
    options,
    correctIndex,
    engine: "local",
  };
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
    signal: AbortSignal.timeout(25000),
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 500,
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

/** Test savoli yaratadi — 3 bosqichli zanjir bilan, uchinchi bosqich HAR DOIM ishlaydi. */
export async function generateTestQuestion(input: QuestionInput): Promise<GeneratedQuestion> {
  const cfg = await getAiConfig();
  const { system, user } = buildPrompt(input);

  // 1) Admin kaliti (to'liq sifat)
  if (cfg.key) {
    try {
      return parseQuestion(await chatCompletions(cfg.base, cfg.model, cfg.key, system, user));
    } catch {
      /* keyingi bosqichga o'tamiz */
    }
  }

  // 2) Bepul kalitsiz AI
  try {
    return parseQuestion(
      await chatCompletions("https://text.pollinations.ai/openai", "openai", null, system, user),
    );
  } catch {
    /* keyingi bosqichga o'tamiz */
  }

  // 3) Mahalliy generator — hech qachon yiqilmaydi
  return localQuestion(input);
}
