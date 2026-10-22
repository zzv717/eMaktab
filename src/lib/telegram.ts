// Minimal Telegram Bot API client built on top of global fetch.
// No external SDK needed – we only use a handful of methods.

const API_BASE = "https://api.telegram.org";

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

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export function kb(rows: InlineButton[][]) {
  return { inline_keyboard: rows };
}

export async function sendMessage(
  chatId: number,
  text: string,
  options?: { replyMarkup?: ReturnType<typeof kb>; disablePreview?: boolean },
) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: options?.disablePreview ?? true,
    reply_markup: options?.replyMarkup,
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  options?: { replyMarkup?: ReturnType<typeof kb> },
) {
  return callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: options?.replyMarkup,
  });
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

export async function setWebhook(url: string, secretToken: string) {
  return callTelegram("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
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
    rows.push([{ text: "🏫 Sinf kabineti", callback_data: "cab:open" }]);
  }
  rows.push([
    { text: "📰 Yangiliklar", callback_data: "menu:news" },
    { text: "👤 Profil", callback_data: "profile" },
  ]);
  rows.push([{ text: "⚙️ Sozlamalar", callback_data: "menu:settings" }]);
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
      { text: "📆 Ertaga", callback_data: "t:tomorrow" },
    ],
    [
      { text: "🔄 Yangilash", callback_data: "t:today" },
      { text: "📰 Yangiliklar", callback_data: "menu:news" },
    ],
    [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
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
export function classCabinetKeyboard() {
  return kb([
    [
      { text: "👨‍🎓 O'quvchilar ro'yxati", callback_data: "cab:students" },
      { text: "👥 Ota-onalar ro'yxati", callback_data: "cab:parents" },
    ],
    [
      { text: "✅ O'quvchilarni faollashtirish", callback_data: "cab:act_students" },
      { text: "✅ Ota-onalarni faollashtirish", callback_data: "cab:act_parents" },
    ],
    [{ text: "🔄 Ro'yxatni yangilash", callback_data: "cab:refresh" }],
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
