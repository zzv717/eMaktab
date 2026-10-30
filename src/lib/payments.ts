// ---------------------------------------------------------------------------
// 💎 Pro to'lov tizimi — chek asosida.
//
// Qanday ishlaydi:
// 1) O'qituvchi 💎 Pro olish → tarif tanlaydi (1 oy / 3 oy / 1 yil);
// 2) Karta rekvizitlariga to'lov qilib, CHEK RASMINI + tranzaksiya raqamini yuboradi;
// 3) To'lov "pending" bo'ladi → ADMIN ga xabar + rasm + [✅ Tasdiqlash][❌ Rad etish];
// 4) Admin tasdiqlasa — Pro AVTOMATIK ochiladi va foydalanuvchiga xabar ketadi.
//
// Soxta cheklarga qarshi:
// - bir xil chek rasmi (Telegram file_unique_id) ikkinchi marta qabul qilinmaydi;
// - bir xil tranzaksiya raqami ikkinchi marta qabul qilinmaydi;
// - admin xabarida kutilayotgan summa, foydalanuvchining oldingi to'lovlari va
//   ogohlantirishlar ko'rsatiladi (haqiqiy kirimni admin bank ilovasidan solishtiradi).
// ---------------------------------------------------------------------------

import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { botSettings, botUsers, payments, type Payment } from "@/db/schema";
import { isAdmin, planUntilFromPeriod } from "@/lib/admin";

export const PAY_KEYS = {
  card: "pay_card",
  holder: "pay_holder",
  price1: "pay_price_1m",
  price3: "pay_price_3m",
  priceY: "pay_price_1y",
} as const;

export type PlanPeriod = "1m" | "3m" | "1y";

export const PLAN_TITLES: Record<PlanPeriod, string> = {
  "1m": "1 oy",
  "3m": "3 oy",
  "1y": "1 yil",
};

export function planPeriods(): PlanPeriod[] {
  return ["1m", "3m", "1y"];
}

// ---------------------------------------------------------------------------
// Sozlamalar
// ---------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(botSettings).where(eq(botSettings.key, key)).limit(1);
  const v = rows[0]?.value;
  return v && v.trim() ? v.trim() : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(botSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: botSettings.key, set: { value, updatedAt: new Date() } });
}

export async function getPaySettings(): Promise<{
  card: string | null;
  holder: string | null;
  prices: Record<PlanPeriod, number | null>;
}> {
  const [card, holder, p1, p3, py] = await Promise.all([
    getSetting(PAY_KEYS.card),
    getSetting(PAY_KEYS.holder),
    getSetting(PAY_KEYS.price1),
    getSetting(PAY_KEYS.price3),
    getSetting(PAY_KEYS.priceY),
  ]);
  const num = (s: string | null) => {
    const n = Number((s ?? "").replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    card,
    holder,
    prices: { "1m": num(p1), "3m": num(p3), "1y": num(py) },
  };
}

export function formatSum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
}

/** Rekvizitlar to'liqmi? (karta + narxlar) */
export function paySettingsReady(s: Awaited<ReturnType<typeof getPaySettings>>): boolean {
  return Boolean(s.card) && planPeriods().every((p) => s.prices[p] !== null);
}

// ---------------------------------------------------------------------------
// To'lov yozuvi bilan ishlash
// ---------------------------------------------------------------------------

export async function createDraftPayment(
  telegramId: number,
  plan: PlanPeriod,
  amount: number | null,
): Promise<Payment> {
  // Eski tugallanmagan qoralamalarni yig'amiz (bir vaqtda bitta jarayon)
  await db
    .delete(payments)
    .where(and(eq(payments.telegramId, telegramId), eq(payments.status, "draft")));
  const [row] = await db
    .insert(payments)
    .values({ telegramId, plan, amount, status: "draft" })
    .returning();
  return row;
}

export async function getPayment(id: number): Promise<Payment | null> {
  const rows = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findPaymentByReceiptUid(uid: string): Promise<Payment | null> {
  if (!uid) return null;
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.receiptUniqueId, uid))
    .limit(1);
  return rows[0] ?? null;
}

export async function findPaymentByRef(ref: string): Promise<Payment | null> {
  const r = (ref || "").trim();
  // Takrorlik tekshiruvi FAQAT haqiqiy tranzaksiya ID'lari uchun (kamida 4 raqam).
  // "Uzcard" kabi umumiy izohlar — soxta chek emas, bloklanmaydi.
  if (r.length < 3 || !/\d{4,}/.test(r)) return null;
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.receiptRef, r))
    .limit(1);
  return rows[0] ?? null;
}

export async function attachReceipt(
  id: number,
  fileId: string | null,
  uniqueId: string | null,
): Promise<void> {
  await db
    .update(payments)
    .set({ receiptFileId: fileId, receiptUniqueId: uniqueId })
    .where(eq(payments.id, id));
}

export async function attachRef(id: number, ref: string): Promise<void> {
  await db.update(payments).set({ receiptRef: ref.slice(0, 64) }).where(eq(payments.id, id));
}

export async function submitPayment(id: number): Promise<void> {
  await db.update(payments).set({ status: "pending" }).where(eq(payments.id, id));
}

export async function rejectPayment(id: number, note?: string): Promise<void> {
  await db
    .update(payments)
    .set({ status: "rejected", adminNote: note ?? null, reviewedAt: new Date() })
    .where(eq(payments.id, id));
}

/**
 * To'lovni tasdiqlash — Pro AVTOMATIK ochiladi (tarif muddati bilan).
 * Qaytaradi: user topilsa — yangi planUntil, aks holda null.
 */
export async function approvePayment(
  id: number,
): Promise<{ ok: boolean; telegramId: number; until: Date | null; plan: string }> {
  const p = await getPayment(id);
  if (!p) return { ok: false, telegramId: 0, until: null, plan: "" };
  const until = planUntilFromPeriod(p.plan);
  await db
    .update(payments)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(payments.id, id));
  await db
    .update(botUsers)
    .set({ plan: "pro", planUntil: until, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, p.telegramId));
  return { ok: true, telegramId: p.telegramId, until, plan: p.plan };
}

export async function listPayments(limit = 8, offset = 0): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .orderBy(desc(payments.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function countPayments(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(payments);
  return r?.n ?? 0;
}

export async function countPendingPayments(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(payments).where(eq(payments.status, "pending"));
  return r?.n ?? 0;
}

/** Foydalanuvchining oldingi (tasdiqlangan) to'lovlari soni — admin xabari uchun. */
export async function paymentHistoryCount(telegramId: number): Promise<{ total: number; approved: number }> {
  const rows = await db.select().from(payments).where(eq(payments.telegramId, telegramId));
  return {
    total: rows.length,
    approved: rows.filter((r) => r.status === "approved").length,
  };
}

/** Barcha admin chatlari (to'lov xabarlari shu yerga ketadi). */
export async function adminChatIds(): Promise<number[]> {
  const rows = await db
    .select({ chatId: botUsers.chatId, telegramId: botUsers.telegramId, username: botUsers.username })
    .from(botUsers);
  return rows.filter((r) => isAdmin(r)).map((r) => r.chatId);
}

export function payStatusIcon(status: string): string {
  return status === "approved" ? "✅" : status === "rejected" ? "❌" : status === "pending" ? "⏳" : "📝";
}
