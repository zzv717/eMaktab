// ---------------------------------------------------------------------------
// 🤖 Sun'iy intellekt — test savoli generatori.
// OpenAI-mos API (OpenAI / Groq / DeepSeek / Gemini-proxy) bilan ishlaydi.
// Sozlamalar bot_settings da: ai_base, ai_model, ai_key (admin panel orqali).
// ---------------------------------------------------------------------------

import { getSetting } from "@/lib/payments";

export interface GeneratedQuestion {
  question: string;
  options: string[]; // 4 ta variant
  correctIndex: number; // 0..3
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

/** Test savoli yaratadi: kitob (nomi+muallif+betlar) yoki mavzu bo'yicha. */
export async function generateTestQuestion(input: {
  mode: "book" | "topic";
  bookTitle?: string;
  bookAuthor?: string;
  pages?: string;
  topic?: string;
}): Promise<GeneratedQuestion> {
  const cfg = await getAiConfig();
  if (!cfg.key) {
    throw new Error("AI kaliti sozlanmagan (admin panel → 🤖 AI sozlamalari)");
  }

  const source =
    input.mode === "book"
      ? `Kitob: "${input.bookTitle}" (muallif: ${input.bookAuthor || "noma'lum"}), betlar: ${input.pages || "umumiy"}`
      : `Mavzu: ${input.topic}`;

  const system =
    "Sen o'zbek tilida maktab o'quvchilari uchun qisqa test savoli tuzuvchi yordamchisan. " +
    "Javobni FAQAT JSON ko'rinishida qaytar: " +
    '{"question":"savol matni","options":["variant1","variant2","variant3","variant4"],"correctIndex":0}. ' +
    "4 ta variant bo'lsin, bittasi to'g'ri (correctIndex 0..3). Savol aniq va sodda bo'lsin.";
  const user = `${source} asosida bitta test savoli tuz.`;

  const res = await fetch(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify({
      model: cfg.model,
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
  const raw = data.choices?.[0]?.message?.content ?? "";
  // JSON ajratib olamiz (javobda ```json ... ``` bo'lishi mumkin)
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
  return { question: String(parsed.question).slice(0, 500), options, correctIndex };
}
