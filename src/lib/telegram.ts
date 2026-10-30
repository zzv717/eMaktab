// Minimal Telegram Bot API client built on top of global fetch.
// No external SDK needed – we only use a handful of methods.

import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { botMessages } from "@/db/schema";

const API_BASE = "https://api.telegram.org";

// ---------------------------------------------------------------------------
// Xabarni tozalash oqimi: har bir yangi so'rov (update) o'z oqimiga ega;
// yangi so'rov boshlanganda — faqat OLDINGI so'rovga tegishli xabarlar o'chadi.
// ---------------------------------------------------------------------------
let currentFlow = "0";
const keepIds = new Set<number>();

export function beginFlow(flow: string | number, keep: number[] = []) {
  currentFlow = String(flow);
  keepIds.clear();
  for (const id of keep) keepIds.add(id);
}

async function trackMessage(chatId: number, messageId: number) {
  try {
    if (!Number.isFinite(messageId)) return;
    const existing = await db
      .select({ id: botMessages.id })
      .from(botMessages)
      .where(and(eq(botMessages.chatId, chatId), eq(botMessages.messageId, messageId)));
    if (existing.length > 0) {
      await db
        .update(botMessages)
        .set({ flow: currentFlow })
        .where(eq(botMessages.id, existing[0].id));
    } else {
      await db.insert(botMessages).values({ chatId, messageId, flow: currentFlow });
    }
  } catch {
    // tracking xatosi asosiy oqimni buzmasin
  }
}

/** Eski oqim xabarlarini o'chiradi; joriy oqimniki va saqlanadiganlar qoladi. */
export async function cleanupPreviousFlow(chatId: number) {
  try {
    const rows = await db.select().from(botMessages).where(eq(botMessages.chatId, chatId));
    const old = rows.filter((r) => r.flow !== currentFlow && !keepIds.has(Number(r.messageId)));
    for (const r of old) {
      try {
        await callTelegram("deleteMessage", { chat_id: chatId, message_id: Number(r.messageId) });
      } catch {
        // 48 soatdan oshgan yoki allaqachon o'chirilgan — e'tiborsiz
      }
    }
    if (old.length > 0) {
      await db.delete(botMessages).where(inArray(botMessages.id, old.map((r) => r.id)));
    }
    for (const kid of keepIds) {
      await trackMessage(chatId, kid);
    }
  } catch {
    // baza xatosi — tozalash o'tkazib yuboriladi
  }
}

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

async function callTelegram<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram API error on ${method}: ${json.description ?? res.statusText}`);
  }
  return json.result as T;
}

/** Rasm yuboradi (manzil yoki file_id) — captcha rasmlari uchun. */
export async function sendPhoto(
  chatId: number,
  photo: string,
  opts?: { caption?: string; replyMarkup?: ReplyMarkup | ReturnType<typeof kb> },
): Promise<void> {
  await callTelegram("sendPhoto", {
    chat_id: chatId,
    photo,
    ...(opts?.caption ? { caption: opts.caption, parse_mode: "HTML" } : {}),
    ...(opts?.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
  });
}

/**
 * Rasmni bayt (bufer) sifatida yuboradi — Telegram serveriga to'g'ridan-to'g'ri yuklanadi.
 * Captcha rasmlari uchun: tashqi URL orqali yuborishda Telegram uni ocholmay qolishi mumkin,
 * shuning uchun avval rasmni o'zimiz yuklab olamiz va shu yerga yuboramiz.
 */
export async function sendPhotoBytes(
  chatId: number,
  data: Uint8Array,
  opts?: { caption?: string; replyMarkup?: ReplyMarkup | ReturnType<typeof kb> },
): Promise<void> {
  const token = getToken();
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("photo", new Blob([data as unknown as BlobPart], { type: "image/png" }), "captcha.png");
  if (opts?.caption) {
    form.set("caption", opts.caption);
    form.set("parse_mode", "HTML");
  }
  if (opts?.replyMarkup) {
    form.set("reply_markup", JSON.stringify(opts.replyMarkup));
  }
  const res = await fetch(`${API_BASE}/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram API error on sendPhoto: ${json.description ?? res.statusText}`);
  }
}

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export function kb(rows: InlineButton[][]) {
  return { inline_keyboard: rows };
}

// ---------------------------------------------------------------------------
// "Menu tugmalar" (reply keyboard) — Telegram xabar yozish joyida doimiy ko'rinadi.
// ---------------------------------------------------------------------------
export type ReplyButton = { text: string };

export function replyKb(rows: ReplyButton[][], placeholder = "Xabar yozing...") {
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: placeholder,
  };
}

/** Menyu tugmalari matnlari — bot.ts shu matnlarni qabul qiladi. */
export const MENU_TEXT = {
  today: "📅 Bugungi darslar",
  tomorrow: "📆 Ertangi darslar",
  week: "📆 Haftalik jadval",
  admin: "🛠 Admin panel",
  conduct: "✅ Darsni o'tildi qilish",
  ctp: "📄 Ish reja joylashtirish",
  maqom: "📝 Maqom berish",
  myClass: "🏫 Sinfim — O'quvchilar",
  parents: "👪 Ota-onalar faolligi",
  checkAll: "⚡ Barchani tekshirish",
  profile: "👤 Profil",
  news: "📰 Yangiliklar",
  settings: "⚙️ Sozlamalar",
  grades: "📊 Baholar",
  schedule: "📚 Dars jadvali",
  guide: "📖 Yoriqnoma",
  home: "🏠 Asosiy menyu",
} as const;

/** O'qituvchi menyusi — reply keyboard (sinf rahbariga qarab). */
export function teacherReplyKeyboard(isClassTeacher: boolean, admin = false) {
  const rows: ReplyButton[][] = [
    [{ text: MENU_TEXT.today }, { text: MENU_TEXT.tomorrow }],
    [{ text: MENU_TEXT.week }, { text: MENU_TEXT.conduct }],
    [{ text: MENU_TEXT.ctp }, { text: MENU_TEXT.maqom }],
  ];
  if (isClassTeacher) {
    rows.push([{ text: MENU_TEXT.myClass }, { text: MENU_TEXT.parents }]);
    rows.push([{ text: MENU_TEXT.checkAll }, { text: MENU_TEXT.profile }]);
    rows.push([{ text: MENU_TEXT.news }, { text: MENU_TEXT.settings }]);
  } else {
    rows.push([{ text: MENU_TEXT.news }, { text: MENU_TEXT.profile }]);
    rows.push([{ text: MENU_TEXT.settings }]);
  }
  if (admin) rows.push([{ text: MENU_TEXT.admin }]);
  rows.push([{ text: MENU_TEXT.guide }]);
  return replyKb(rows);
}

/** O'quvchi/ota-ona menyusi — reply keyboard. */
export function mainReplyKeyboard(admin = false) {
  const rows: ReplyButton[][] = [
    [{ text: MENU_TEXT.grades }, { text: MENU_TEXT.schedule }],
    [{ text: MENU_TEXT.news }, { text: MENU_TEXT.settings }],
  ];
  if (admin) rows.push([{ text: MENU_TEXT.admin }]);
  rows.push([{ text: MENU_TEXT.guide }]);
  return replyKb(rows);
}

export type ReplyMarkup = Record<string, unknown>;

export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    replyMarkup?: ReplyMarkup | ReturnType<typeof kb>;
    disablePreview?: boolean;
    /** true — oqim kuzatuvi YO'Q (masalan e'lonlar: keyinchalik avto-o'chirilmaydi). */
    untracked?: boolean;
  },
): Promise<{ message_id?: number } | undefined> {
  const result = await callTelegram<{ message_id?: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: options?.disablePreview ?? true,
    reply_markup: options?.replyMarkup,
  });
  if (result?.message_id !== undefined && !options?.untracked) {
    await trackMessage(chatId, result.message_id);
  }
  return result;
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  options?: { replyMarkup?: ReplyMarkup | ReturnType<typeof kb> },
) {
  const result = await callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: options?.replyMarkup,
  });
  // Tahrirlangan xabar joriy oqimga tegishli — keyingi tozalashda o'chadi.
  await trackMessage(chatId, messageId);
  return result;
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export async function deleteMessage(chatId: number, messageId: number) {
  try {
    await callTelegram("deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch {
    // Best effort only (message may already be too old or deleted).
  }
}

export async function setWebhook(
  url: string,
  secretToken: string,
  opts?: { dropPendingUpdates?: boolean },
) {
  return callTelegram("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: opts?.dropPendingUpdates ?? false,
  });
}

export async function deleteWebhook() {
  return callTelegram("deleteWebhook", {});
}

export async function getWebhookInfo() {
  return callTelegram("getWebhookInfo", {});
}

// -- Telegram update types (only the fields we actually use) --

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  document?: { file_id: string; file_unique_id?: string; file_name?: string; mime_type?: string };
  photo?: Array<{ file_id: string; file_unique_id?: string; width?: number; height?: number }>;
}

/** Telegram faylini yuklab oladi (bot token serverda — brauzer kerak emas). */
export async function downloadTelegramFile(
  fileId: string,
): Promise<{ bytes: Buffer; fileName: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const info = (await infoRes.json()) as { ok?: boolean; result?: { file_path?: string } };
    const path = info.result?.file_path;
    if (!info.ok || !path) return null;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!fileRes.ok) return null;
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    return { bytes, fileName: path.split("/").pop() ?? "file" };
  } catch {
    return null;
  }
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ==========================================
// Menyu klaviaturalari (inline tugmalar)
// ==========================================

/** O'quvchi/ota-ona asosiy menyusi. */
export function mainMenuKeyboard(connected: boolean) {
  return kb(
    connected
      ? [
          [
            { text: "📊 Baholar", callback_data: "menu:grades" },
            { text: "📚 Dars jadvali", callback_data: "menu:schedule" },
          ],
          [
            { text: "📰 Yangiliklar", callback_data: "menu:news" },
            { text: "⚙️ Sozlamalar", callback_data: "menu:settings" },
          ],
          [{ text: "📖 Yoriqnoma", callback_data: "menu:guide" }],
        ]
      : [[{ text: "🔐 eMaktabni ulash (login)", callback_data: "menu:connect" }]],
  );
}

/** O'qituvchi asosiy menyusi. */
export function teacherMenuKeyboard(connected: boolean, isClassTeacher: boolean) {
  if (!connected) {
    return kb([[{ text: "🔐 eMaktabni ulash (login)", callback_data: "menu:connect" }]]);
  }
  const rows: Array<Array<{ text: string; callback_data: string }>> = [
    [
      { text: "📅 Bugungi darslar", callback_data: "t:today" },
      { text: "📆 Ertangi darslar", callback_data: "t:tomorrow" },
    ],
  ];
  if (isClassTeacher) {
    rows.push([
      { text: "📆 Haftalik jadval", callback_data: "t:week" },
      { text: "🏫 Sinf kabineti", callback_data: "cab:open" },
    ]);
  } else {
    rows.push([{ text: "📆 Haftalik jadval", callback_data: "t:week" }]);
  }
  rows.push([
    { text: "📰 Yangiliklar", callback_data: "menu:news" },
    { text: "👤 Profil", callback_data: "profile" },
  ]);
  rows.push([{ text: "⚙️ Sozlamalar", callback_data: "menu:settings" }]);
  rows.push([{ text: "📖 Yoriqnoma", callback_data: "menu:guide" }]);
  return kb(rows);
}

/** Dars jadvali / uy vazifalari bo'limi (o'quvchi). */
export function scheduleKeyboard() {
  return kb([
    [
      { text: "📅 Bugun", callback_data: "sched:today" },
      { text: "📆 Ertaga", callback_data: "sched:tomorrow" },
    ],
    [
      { text: "🗓 Haftalik", callback_data: "sched:week" },
      { text: "📝 Uy vazifalari", callback_data: "sched:hw" },
    ],
    [{ text: "🔄 Yangilash", callback_data: "sched:today" }],
    [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
  ]);
}

/** O'qituvchi darslari. */
export function teacherDayKeyboard() {
  return kb([
    [
      { text: "📅 Bugun", callback_data: "t:today" },
      { text: "📆 Ertangi", callback_data: "t:tomorrow" },
    ],
    [
      { text: "📆 Haftalik jadval", callback_data: "t:week" },
      { text: "🔄 Yangilash", callback_data: "t:today" },
    ],
    [
      { text: "📰 Yangiliklar", callback_data: "menu:news" },
    ],
    [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
  ]);
}

// ==========================================
// 🛠 Admin panel klaviaturalari (faqat admin ko'radi)
// ==========================================

export function adminHomeKeyboard() {
  return kb([
    [{ text: "👥 Foydalanuvchilar", callback_data: "adm:u:0" }],
    [
      { text: "💳 To'lovlar", callback_data: "adm:pay" },
      { text: "⚙️ To'lov sozlamalari", callback_data: "adm:payset" },
    ],
    [
      { text: "📢 Xabar yuborish", callback_data: "adm:bc" },
      { text: "🚨 Jurnal", callback_data: "adm:log" },
    ],
    [{ text: "🔄 Yangilash", callback_data: "adm:home" }],
    [{ text: "🏠 Asosiy sahifa", callback_data: "menu:home" }],
  ]);
}

export function adminUsersKeyboard(
  rows: Array<{ id: number; label: string }>,
  page: number,
  pages: number,
) {
  const kbRows: Array<Array<{ text: string; callback_data: string }>> = rows.map((r) => [
    { text: r.label, callback_data: `adm:d:${r.id}` },
  ]);
  const nav: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) nav.push({ text: "⬅️", callback_data: `adm:u:${page - 1}` });
  nav.push({ text: `${page + 1}/${Math.max(pages, 1)}`, callback_data: "adm:noop" });
  if (page < pages - 1) nav.push({ text: "➡️", callback_data: `adm:u:${page + 1}` });
  kbRows.push(nav);
  kbRows.push([
    { text: "⬅️ Admin panel", callback_data: "adm:home" },
    { text: "🔄 Yangilash", callback_data: `adm:u:${page}` },
  ]);
  return kb(kbRows);
}

export function adminUserKeyboard(id: number, isPro: boolean) {
  return kb([
    isPro
      ? [{ text: "💎 Pro olib tashlash", callback_data: `adm:pn:${id}` }]
      : [{ text: "💎 Pro berish", callback_data: `adm:pr:${id}` }],
    [
      { text: "⬅️ Ro'yxat", callback_data: "adm:u:0" },
      { text: "🔄 Yangilash", callback_data: `adm:d:${id}` },
    ],
    [{ text: "🛠 Admin panel", callback_data: "adm:home" }],
  ]);
}

export function adminProPeriodKeyboard(id: number) {
  return kb([
    [
      { text: "1 oy", callback_data: `adm:p:${id}:1m` },
      { text: "3 oy", callback_data: `adm:p:${id}:3m` },
    ],
    [
      { text: "1 yil", callback_data: `adm:p:${id}:1y` },
      { text: "♾ Cheksiz", callback_data: `adm:p:${id}:inf` },
    ],
    [{ text: "⬅️ Orqaga", callback_data: `adm:d:${id}` }],
  ]);
}

export function adminBroadcastKeyboard() {
  return kb([
    [{ text: "📤 Barchaga", callback_data: "adm:bca:all" }],
    [{ text: "✅ Faqat ulanganlarga", callback_data: "adm:bca:conn" }],
    [{ text: "💎 Faqat Pro", callback_data: "adm:bca:pro" }],
    [{ text: "⬅️ Admin panel", callback_data: "adm:home" }],
  ]);
}

export function adminBroadcastConfirmKeyboard() {
  return kb([
    [
      { text: "✅ Yuborish", callback_data: "adm:bcs" },
      { text: "❌ Bekor qilish", callback_data: "adm:bcx" },
    ],
  ]);
}

// ==========================================
// 💎 Pro / to'lov klaviaturalari
// ==========================================

/** 💎 Pro olish — tarif tanlash. */
export function proPlanKeyboard(prices: Record<string, number | null>) {
  const row = (period: string, title: string) => ({
    text: prices[period] ? `${title} — ${String(prices[period]).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm` : title,
    callback_data: `prop:${period}`,
  });
  return kb([
    [row("1m", "📅 1 oy"), row("3m", "📅 3 oy")],
    [row("1y", "📅 1 yil")],
    [{ text: "🏠 Asosiy sahifa", callback_data: "menu:home" }],
  ]);
}

/** Chek yuborilgandan keyin tasdiqlash. */
export function payConfirmKeyboard(pid: number) {
  return kb([
    [
      { text: "✅ Yuborish", callback_data: `pay:s:${pid}` },
      { text: "❌ Bekor qilish", callback_data: `pay:c:${pid}` },
    ],
  ]);
}

/** Admin uchun to'lovni tasdiqlash/rad etish. */
export function payAdminKeyboard(pid: number) {
  return kb([
    [
      { text: "✅ Tasdiqlash", callback_data: `adm:payok:${pid}` },
      { text: "❌ Rad etish", callback_data: `adm:payno:${pid}` },
    ],
    [{ text: "💳 To'lovlar", callback_data: "adm:pay" }],
    [{ text: "🛠 Admin panel", callback_data: "adm:home" }],
  ]);
}

/** Admin: to'lov sozlamalari. */
export function paySettingsKeyboard() {
  return kb([
    [
      { text: "💳 Karta raqami", callback_data: "adm:sv:card" },
      { text: "👤 Karta egasi", callback_data: "adm:sv:holder" },
    ],
    [
      { text: "💰 1 oy narxi", callback_data: "adm:sv:price1" },
      { text: "💰 3 oy narxi", callback_data: "adm:sv:price3" },
    ],
    [{ text: "💰 1 yil narxi", callback_data: "adm:sv:priceY" }],
    [{ text: "⬅️ Admin panel", callback_data: "adm:home" }],
  ]);
}

/** 💎 Pro ekranidagi asosiy tugmalar. */
export function proBuyKeyboard() {
  return kb([
    [{ text: "💎 Pro olish", callback_data: "prop:buy" }],
    [{ text: "🏠 Asosiy sahifa", callback_data: "menu:home" }],
  ]);
}

/** Baholar bo'limi. */
export function gradesKeyboard() {
  return kb([
    [
      { text: "🔄 Yangilash", callback_data: "grades:refresh" },
      { text: "📊 So'nggi 30 kun", callback_data: "grades:month" },
    ],
    [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
  ]);
}

/** Yangiliklar bo'limi. */
export function newsKeyboard() {
  return kb([
    [{ text: "🔄 Yangilash", callback_data: "news:refresh" }],
    [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
  ]);
}

/** Sinf kabineti (sinf rahbari uchun). */
export function classCabinetKeyboard(classId: string) {
  return kb([
    [
      { text: "👨‍🎓 O'quvchilar ro'yxati", callback_data: `cab:students:${classId}` },
      { text: "👥 Ota-onalar ro'yxati", callback_data: `cab:parents:${classId}` },
    ],
    [
      { text: "✅ O'quvchilarni faollashtirish", callback_data: `cab:act_students:${classId}` },
      { text: "✅ Ota-onalarni faollashtirish", callback_data: `cab:act_parents:${classId}` },
    ],
    [{ text: "🔄 Ro'yxatni yangilash", callback_data: `cab:refresh:${classId}` }],
    [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
  ]);
}

/** Bir nechta sinf bo'lsa — sinf tanlash. */
export function classSelectKeyboard(classes: Array<{ classId: string; className: string }>) {
  const rows = classes.map((c) => [
    { text: `🏫 ${c.className}`, callback_data: `cabsel:${c.classId}` },
  ]);
  rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
  return kb(rows);
}

/** Profil bo'limi. */
export function profileKeyboard() {
  return kb([
    [{ text: "🔄 Yangilash", callback_data: "profile" }],
    [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
  ]);
}

/** Sozlamalar bo'limi. */
export function settingsKeyboard() {
  return kb([
    [{ text: "💎 Pro holati", callback_data: "prop:status" }],
    [{ text: "🔄 Login/parolni yangilash", callback_data: "settings:relogin" }],
    [{ text: "🚪 Chiqish (Logout)", callback_data: "settings:logout" }],
    [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
  ]);
}

/** Chiqishni tasdiqlash. */
export function logoutConfirmKeyboard() {
  return kb([
    [
      { text: "✅ Ha, chiqaman", callback_data: "settings:logout_confirm" },
      { text: "🔙 Bekor qilish", callback_data: "menu:settings" },
    ],
  ]);
}

/** Ro'yxatdan o'tish jarayoni uchun bekor qilish. */
export function cancelKeyboard() {
  return kb([[{ text: "❌ Bekor qilish", callback_data: "menu:cancel" }]]);
}

/** Umumiy "ortga/menyu" navigatsiyasi. */
export function backKeyboard(callbackData: string = "menu:home", label: string = "🏠 Asosiy menyu") {
  return kb([[{ text: label, callback_data: callbackData }]]);
}
