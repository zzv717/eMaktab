// 📱 PWA — API yordamchisi (barcha panellar uchun)
export async function api<T>(url: string, body?: unknown, method?: "GET" | "POST"): Promise<T> {
  const m = method ?? (body === undefined ? "GET" : "POST");
  const res = await fetch(url, {
    method: m,
    headers: m === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: m === "POST" ? JSON.stringify(body ?? {}) : undefined,
    credentials: "same-origin",
  });
  try {
    return (await res.json()) as T;
  } catch {
    return { ok: false, error: `Server javob bermadi (${res.status})` } as T;
  }
}

export const MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];
export const WEEKDAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];

export function fmtDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1] ?? ""}`;
}

export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}
