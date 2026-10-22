// ============================================================================
// Telegram bot mantig'i — foydalanuvchi oqimi (spec bo'yicha):
//
// 1. /start → bot_users jadvalini tekshiradi:
//    - Ro'yxatdan o'tmagan → xush kelibsiz + eMaktab login/parol so'raydi
//    - Ro'yxatdan o'tgan  → darhol asosiy menyuni (inline tugmalar) ochadi
// 2. Login/parol → ENCRYPTION_KEY bilan shifrlanib bazaga saqlanadi
// 3. Asosiy menyu:
//    📊 Baholar · 📚 Dars jadvali / Uy vazifalari · 📰 Yangiliklar · ⚙️ Sozlamalar
// 4. Sozlamalar → Logout: bazadagi eski ma'lumotlar tozalanadi va bot
//    yana login so'raydigan holatga qaytadi.
// ============================================================================

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { botUsers, loginTokens, type BotUser, type ChildContext } from "@/db/schema";
import { decryptSecret, encryptSecret, generateToken } from "@/lib/crypto";
import {
  EmaktabApiError,
  EmaktabAuthError,
  fetchGrades,
  fetchNews,
  fetchSchedule,
  loginEmaktab,
  shiftDayKey,
  tashkentDayKey,
  type EmaktabSession,
} from "@/lib/emaktab";
import {
  escapeHtml,
  formatAccount,
  formatDay,
  formatGrades,
  formatHomework,
  formatNews,
  formatPersonList,
  formatWeek,
} from "@/lib/format";
import {
  answerCallbackQuery,
  backKeyboard,
  cancelKeyboard,
  deleteMessage,
  editMessageText,
  gradesKeyboard,
  kb,
  logoutConfirmKeyboard,
  mainMenuKeyboard,
  newsKeyboard,
  scheduleKeyboard,
  sendMessage,
  settingsKeyboard,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
} from "@/lib/telegram";

const TOKEN_TTL_MS = 90 * 1000; // one-click link is valid for 90 seconds
const SESSION_CACHE_TTL_MS = 15 * 60 * 1000; // eMaktab sessiyasi 15 daqiqa keshlanadi

// ---------------------------------------------------------------------------
// Yordamchi funksiyalar
// ---------------------------------------------------------------------------

function appUrl(): string | null {
  const url = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

function isAuthenticated(user: BotUser): boolean {
  return Boolean(user.emaktabLogin && user.emaktabPasswordEnc);
}

function parseChildren(user: BotUser): ChildContext[] {
  try {
    const parsed = user.childrenJson ? JSON.parse(user.childrenJson) : null;
    return Array.isArray(parsed) ? (parsed as ChildContext[]) : [];
  } catch {
    return [];
  }
}

function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > limit && current) {
      parts.push(current);
      current = line;
    } else {
      current = current ? current + "\n" + line : line;
    }
  }
  if (current) parts.push(current);
  return parts;
}

async function sendLong(chatId: number, text: string, replyMarkup?: ReturnType<typeof kb>) {
  const parts = splitMessage(text);
  for (let i = 0; i < parts.length; i++) {
    await sendMessage(chatId, parts[i], {
      replyMarkup: i === parts.length - 1 ? replyMarkup : undefined,
    });
  }
}

/** Callback'dagi xabarni yangilaydi; muvaffaqiyatsiz bo'lsa yangi xabar yuboradi. */
async function showView(
  cb: TelegramCallbackQuery,
  text: string,
  replyMarkup?: ReturnType<typeof kb>,
) {
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId) return;

  const parts = splitMessage(text);
  if (parts.length > 1) {
    // Juda uzun xabar — edit qilmaymiz, yangi xabar(lar) yuboramiz.
    if (messageId) await deleteMessage(chatId, messageId);
    await sendLong(chatId, text, replyMarkup);
    return;
  }

  if (messageId) {
    try {
      await editMessageText(chatId, messageId, parts[0], { replyMarkup });
      return;
    } catch {
      // xabar o'zgarmagan yoki eskirgan bo'lsa — yangisini yuboramiz
    }
  }
  await sendMessage(chatId, parts[0], { replyMarkup });
}

// ---------------------------------------------------------------------------
// eMaktab sessiya keshi (har safar login qilmaslik uchun)
// ---------------------------------------------------------------------------

const sessionCache = new Map<number, { session: EmaktabSession; expiresAt: number }>();

function cacheSession(telegramId: number, session: EmaktabSession) {
  sessionCache.set(telegramId, { session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
}

function invalidateSession(telegramId: number) {
  sessionCache.delete(telegramId);
}

async function openSession(user: BotUser): Promise<EmaktabSession> {
  const cached = sessionCache.get(user.telegramId);
  if (cached && cached.expiresAt > Date.now()) return cached.session;

  const password = decryptSecret(user.emaktabPasswordEnc!);
  const result = await loginEmaktab(user.emaktabLogin!, password);
  if (result.status === "invalid_credentials" || result.status === "captcha_required") {
    // Login/parol endi ishlamayapti — foydalanuvchi qayta kirishi kerak.
    throw new EmaktabAuthError(result.message);
  }
  if (result.status !== "ok") {
    // Tarmoq/server xatosi — vaqtinchalik, ma'lumotlarni o'chirmaymiz.
    throw new EmaktabApiError(result.message);
  }

  // Agar DB'dagi kontekst eskirgan bo'lsa (masalan farzand almashtirilgan), saqlab qo'yamiz.
  const session = result.session;
  const activeChanged =
    session.active.personId !== user.personId ||
    session.active.schoolId !== user.schoolId ||
    session.active.groupId !== user.groupId;

  if (activeChanged && user.personId) {
    // Foydalanuvchi DB'da tanlagan kontekstni saqlab qolamiz (farzand almashtirish).
    const persons = session.persons;
    const preferred = persons.find((p) => p.personId === user.personId);
    if (preferred) {
      session.active = preferred;
    }
  }

  cacheSession(user.telegramId, session);
  return session;
}

/** eMaktab bilan ishlash: sessiya ochadi, xatolarni ushlaydi, bir marta qayta urinadi. */
async function withSession<T>(user: BotUser, fn: (session: EmaktabSession) => Promise<T>): Promise<T> {
  let session = await openSession(user);
  try {
    return await fn(session);
  } catch (error) {
    if (error instanceof EmaktabAuthError) {
      // Sessiya eskirgan — bir marta qayta login qilamiz.
      invalidateSession(user.telegramId);
      session = await openSession(user);
      return await fn(session);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// DB yordamchilari
// ---------------------------------------------------------------------------

async function getUser(telegramId: number): Promise<BotUser | undefined> {
  return db.query.botUsers.findFirst({ where: eq(botUsers.telegramId, telegramId) });
}

async function getOrCreateUser(
  message: TelegramMessage | undefined,
  from: { id: number; username?: string; first_name: string },
): Promise<BotUser> {
  const chatId = message?.chat.id ?? from.id;
  const existing = await getUser(from.id);
  if (existing) return existing;

  const [created] = await db
    .insert(botUsers)
    .values({
      telegramId: from.id,
      chatId,
      username: from.username,
      firstName: from.first_name,
    })
    .returning();
  return created;
}

async function startLoginFlow(telegramId: number, chatId: number) {
  await db
    .update(botUsers)
    .set({ state: "awaiting_login", tempLogin: null, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
  await sendMessage(
    chatId,
    "🔑 <b>eMaktab (kundalik.com) loginingizni</b> yuboring.\n\n" +
      "<i>Bu eMaktab saytidagi loginingiz (telefon raqam yoki email).</i>",
    { replyMarkup: cancelKeyboard() },
  );
}

async function resetState(telegramId: number) {
  await db
    .update(botUsers)
    .set({ state: "idle", tempLogin: null, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
}

async function logoutUser(telegramId: number) {
  invalidateSession(telegramId);
  await db
    .update(botUsers)
    .set({
      state: "idle",
      tempLogin: null,
      emaktabLogin: null,
      emaktabPasswordEnc: null,
      connectedAt: null,
      fullName: null,
      role: null,
      emaktabUserId: null,
      personId: null,
      schoolId: null,
      groupId: null,
      schoolName: null,
      groupName: null,
      childrenJson: null,
      updatedAt: new Date(),
    })
    .where(eq(botUsers.telegramId, telegramId));
}

// ---------------------------------------------------------------------------
// Xabar matnlari
// ---------------------------------------------------------------------------

const WELCOME_NEW = `👋 <b>Xush kelibsiz!</b>

Men <b>eMaktab</b> (kundalik.com) yordamchi botiman.

Men sizga quyidagilarni ko'rsataman:
📊 Baholaringiz
📚 Dars jadvali va uy vazifalari
📰 Maktab/sinf yangiliklari

Boshlash uchun eMaktab <b>login</b> va <b>parolingizni</b> bir marta kiritasiz — men ularni <b>shifrlab</b> saqlayman va keyin faqat tugmalar bilan foydalanasiz.

🔐 <i>Parolingiz xavfsiz: AES-256 shifrlangan holda bazada saqlanadi.</i>`;

const WELCOME_BACK = (name: string) =>
  `👋 Xush kelibsiz, <b>${escapeHtml(name)}</b>!\n\nKerakli bo'limni tanlang 👇`;

const HELP_TEXT = `📖 <b>Bot qo'llanmasi</b>

1️⃣ <b>Boshlash:</b> /start — agar ro'yxatdan o'tmagan bo'lsangiz, bot eMaktab login va parolingizni so'raydi.
2️⃣ <b>📊 Baholar:</b> so'nggi baholaringiz (fan, baho, sana, izoh).
3️⃣ <b>📚 Dars jadvali:</b> bugungi/ertangi darslar, o'qituvchilar va uy vazifalari.
4️⃣ <b>📰 Yangiliklar:</b> maktab va sinf e'lonlari.
5️⃣ <b>⚙️ Sozlamalar:</b> akkaunt ma'lumotlari, login yangilash yoki chiqish.

Buyruqlar: /start · /grades · /schedule · /news · /status · /logout · /cancel`;

// ---------------------------------------------------------------------------
// Asosiy handler
// ---------------------------------------------------------------------------

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.message) {
    await handleMessage(update.message);
  } else if (update.callback_query) {
    await handleCallback(update.callback_query);
  }
}

async function handleMessage(message: TelegramMessage) {
  const from = message.from;
  if (!from || from.is_bot) return;

  const text = (message.text ?? "").trim();
  const user = await getOrCreateUser(message, from);
  const chatId = message.chat.id;

  // --- Buyruqlar ---
  if (text === "/start") {
    await resetState(from.id);
    if (isAuthenticated(user)) {
      // Holat 2: allaqachon ro'yxatdan o'tgan — darhol asosiy menyu.
      await sendMessage(
        chatId,
        WELCOME_BACK(user.fullName || from.first_name),
        { replyMarkup: mainMenuKeyboard(true) },
      );
    } else {
      // Holat 1: hali ro'yxatdan o'tmagan — login so'raymiz.
      await db
        .update(botUsers)
        .set({ state: "awaiting_login", tempLogin: null, updatedAt: new Date() })
        .where(eq(botUsers.telegramId, from.id));
      await sendMessage(chatId, WELCOME_NEW, { replyMarkup: cancelKeyboard() });
      await sendMessage(chatId, "🔑 Iltimos, eMaktab <b>loginingizni</b> yuboring:");
    }
    return;
  }

  if (text === "/help") {
    await sendMessage(chatId, HELP_TEXT, { replyMarkup: mainMenuKeyboard(isAuthenticated(user)) });
    return;
  }

  if (text === "/cancel") {
    await resetState(from.id);
    await sendMessage(chatId, "✅ Bekor qilindi.", {
      replyMarkup: mainMenuKeyboard(isAuthenticated(user)),
    });
    return;
  }

  if (text === "/logout") {
    await logoutUser(from.id);
    await sendMessage(
      chatId,
      "🚪 Chiqildi. eMaktab ma'lumotlaringiz bazadan tozalandi.\n\nYangi login bilan kirish uchun /start ni bosing.",
      { replyMarkup: mainMenuKeyboard(false) },
    );
    return;
  }

  if (text === "/status") {
    await sendMessage(
      chatId,
      isAuthenticated(user)
        ? `✅ <b>Ulangan.</b>\n\n👤 ${escapeHtml(user.fullName || "—")}\n🏫 ${escapeHtml(user.schoolName || "—")} ${escapeHtml(user.groupName || "")}\n🔐 <code>${escapeHtml(user.emaktabLogin ?? "")}</code>`
        : "❌ Hali ulanmagansiz. /start buyrug'ini yuboring.",
      { replyMarkup: mainMenuKeyboard(isAuthenticated(user)) },
    );
    return;
  }

  // --- Login jarayoni (state machine) ---
  if (user.state === "awaiting_login") {
    if (!text || text.startsWith("/")) {
      await sendMessage(chatId, "Iltimos, eMaktab loginingizni <b>matn</b> sifatida yuboring.", {
        replyMarkup: cancelKeyboard(),
      });
      return;
    }
    // Login ham shaxsiy ma'lumot — xabarni o'chiramiz.
    await deleteMessage(chatId, message.message_id);
    await db
      .update(botUsers)
      .set({ tempLogin: text, state: "awaiting_password", updatedAt: new Date() })
      .where(eq(botUsers.telegramId, from.id));
    await sendMessage(
      chatId,
      "🔒 Endi eMaktab <b>parolingizni</b> yuboring.\n\n" +
        "⚠️ <i>Xavfsizlik uchun bu xabar yuborilgach avtomatik o'chiriladi va parol shifrlanib saqlanadi.</i>",
      { replyMarkup: cancelKeyboard() },
    );
    return;
  }

  if (user.state === "awaiting_password") {
    const login = user.tempLogin;
    // Parol xabarini darhol o'chiramiz.
    await deleteMessage(chatId, message.message_id);

    if (!login || !text) {
      await resetState(from.id);
      await sendMessage(chatId, "⚠️ Xatolik yuz berdi. Qaytadan boshlang: /start", {
        replyMarkup: mainMenuKeyboard(false),
      });
      return;
    }

    const password = text;
    const progressMsg = await sendMessage(chatId, "⏳ eMaktab bilan tekshirilmoqda...");

    const result = await loginEmaktab(login, password);

    if (result.status === "ok") {
      const session = result.session;
      const children = session.persons.length > 1 || session.role === "parent" ? session.persons : [];

      await db
        .update(botUsers)
        .set({
          emaktabLogin: login,
          emaktabPasswordEnc: encryptSecret(password),
          tempLogin: null,
          state: "idle",
          connectedAt: new Date(),
          fullName: session.fullName,
          role: session.role,
          emaktabUserId: session.userId || null,
          personId: session.active.personId,
          schoolId: session.active.schoolId,
          groupId: session.active.groupId,
          schoolName: session.active.schoolName,
          groupName: session.active.groupName,
          childrenJson: children.length > 0 ? JSON.stringify(children) : null,
          updatedAt: new Date(),
        })
        .where(eq(botUsers.telegramId, from.id));

      cacheSession(from.id, session);

      // "Tekshirilmoqda" xabarini tahrirlaymiz.
      if (progressMsg && typeof progressMsg === "object" && "message_id" in (progressMsg as object)) {
        try {
          await editMessageText(
            chatId,
            (progressMsg as { message_id: number }).message_id,
            `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n👤 ${escapeHtml(session.fullName)}\n🏫 ${escapeHtml(session.active.schoolName)} ${escapeHtml(session.active.groupName)}`,
          );
        } catch {
          /* ignore */
        }
      }

      await sendMessage(chatId, WELCOME_BACK(session.fullName), { replyMarkup: mainMenuKeyboard(true) });
      return;
    }

    if (result.status === "invalid_credentials") {
      await db
        .update(botUsers)
        .set({ state: "awaiting_login", tempLogin: null, updatedAt: new Date() })
        .where(eq(botUsers.telegramId, from.id));
      await sendMessage(
        chatId,
        `❌ ${escapeHtml(result.message)}\n\nQaytadan eMaktab <b>loginingizni</b> yuboring (yoki /cancel bilan bekor qiling).`,
        { replyMarkup: cancelKeyboard() },
      );
      return;
    }

    // captcha yoki umumiy xato
    await db
      .update(botUsers)
      .set({ state: "idle", tempLogin: null, updatedAt: new Date() })
      .where(eq(botUsers.telegramId, from.id));
    await sendMessage(chatId, `⚠️ ${escapeHtml(result.message)}`, {
      replyMarkup: mainMenuKeyboard(false),
    });
    return;
  }

  // --- Qisqa buyruq variantlari (faqat ulangan foydalanuvchilar uchun) ---
  if (isAuthenticated(user)) {
    if (text === "/grades" || text === "📊 Baholar") {
      await sendGradesView(chatId, user, 14);
      return;
    }
    if (text === "/schedule" || text === "📚 Dars jadvali") {
      await sendDayView(chatId, user, 0);
      return;
    }
    if (text === "/news" || text === "📰 Yangiliklar") {
      await sendNewsView(chatId, user);
      return;
    }
    await sendMessage(chatId, "Quyidagi menyudan tanlang 👇", {
      replyMarkup: mainMenuKeyboard(true),
    });
  } else {
    await startLoginFlow(from.id, chatId);
  }
}

// ---------------------------------------------------------------------------
// Ko'rinishlar (views)
// ---------------------------------------------------------------------------

function personLabel(user: BotUser): string {
  return user.fullName || user.emaktabLogin || "";
}

async function sendGradesView(chatId: number, user: BotUser, days: number) {
  const progress = await sendMessage(chatId, "⏳ Baholar yuklanmoqda...");
  try {
    const grades = await withSession(user, (s) => fetchGrades(s, days));
    const filtered = grades.slice(0, 40);
    const text = formatGrades(filtered, `So'nggi ${days} kun`, personLabel(user));
    await deleteIfPossible(chatId, progress);
    await sendLong(chatId, text, gradesKeyboard());
  } catch (error) {
    await deleteIfPossible(chatId, progress);
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendDayView(chatId: number, user: BotUser, dayShift: number) {
  const progress = await sendMessage(chatId, "⏳ Dars jadvali yuklanmoqda...");
  try {
    const dayKey = shiftDayKey(tashkentDayKey(), dayShift);
    const nextKey = shiftDayKey(dayKey, 1);
    const schedule = await withSession(user, (s) => fetchSchedule(s, dayKey, nextKey));
    const day = schedule.find((d) => d.date === dayKey);
    const title = dayShift === 0 ? "Bugungi dars jadvali" : dayShift === 1 ? "Ertangi dars jadvali" : "Dars jadvali";
    const text = formatDay(day, title, personLabel(user));
    await deleteIfPossible(chatId, progress);
    await sendLong(chatId, text, scheduleKeyboard());
  } catch (error) {
    await deleteIfPossible(chatId, progress);
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendWeekView(chatId: number, user: BotUser) {
  const progress = await sendMessage(chatId, "⏳ Haftalik jadval yuklanmoqda...");
  try {
    const from = shiftDayKey(tashkentDayKey(), -1);
    const to = shiftDayKey(tashkentDayKey(), 7);
    const schedule = await withSession(user, (s) => fetchSchedule(s, from, to));
    const text = formatWeek(schedule, personLabel(user));
    await deleteIfPossible(chatId, progress);
    await sendLong(chatId, text, scheduleKeyboard());
  } catch (error) {
    await deleteIfPossible(chatId, progress);
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendHomeworkView(chatId: number, user: BotUser) {
  const progress = await sendMessage(chatId, "⏳ Uy vazifalari yuklanmoqda...");
  try {
    const from = shiftDayKey(tashkentDayKey(), -2);
    const to = shiftDayKey(tashkentDayKey(), 10);
    const schedule = await withSession(user, (s) => fetchSchedule(s, from, to));
    const text = formatHomework(schedule, personLabel(user));
    await deleteIfPossible(chatId, progress);
    await sendLong(chatId, text, scheduleKeyboard());
  } catch (error) {
    await deleteIfPossible(chatId, progress);
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendNewsView(chatId: number, user: BotUser) {
  const progress = await sendMessage(chatId, "⏳ Yangiliklar yuklanmoqda...");
  try {
    const posts = await withSession(user, (s) => fetchNews(s, 8));
    const text = formatNews(posts, user.schoolName ?? undefined);
    await deleteIfPossible(chatId, progress);
    await sendLong(chatId, text, newsKeyboard());
  } catch (error) {
    await deleteIfPossible(chatId, progress);
    await sendEmaktabError(chatId, user, error);
  }
}

async function deleteIfPossible(chatId: number, progress: unknown) {
  if (progress && typeof progress === "object" && "message_id" in (progress as object)) {
    await deleteMessage(chatId, (progress as { message_id: number }).message_id);
  }
}

async function sendEmaktabError(chatId: number, user: BotUser, error: unknown) {
  if (error instanceof EmaktabAuthError) {
    await sendMessage(
      chatId,
      "⏰ eMaktab sessiyasi tugagan yoki login amalga oshmadi.\n\nIltimos, qayta kiring.",
      { replyMarkup: mainMenuKeyboard(false) },
    );
    await startLoginFlow(user.telegramId, chatId);
    return;
  }
  if (error instanceof EmaktabApiError) {
    await sendMessage(chatId, `⚠️ ${escapeHtml(error.message)}`, {
      replyMarkup: mainMenuKeyboard(true),
    });
    return;
  }
  console.error("eMaktab error", error);
  await sendMessage(
    chatId,
    "😔 eMaktab bilan bog'lanishda xatolik yuz berdi.\n\nBirozdan so'ng qayta urinib ko'ring.",
    { replyMarkup: mainMenuKeyboard(true) },
  );
}

// ---------------------------------------------------------------------------
// Callback'lar (inline tugmalar)
// ---------------------------------------------------------------------------

async function handleCallback(cb: TelegramCallbackQuery) {
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId) return;

  const data = cb.data ?? "";
  const user = await getOrCreateUser(cb.message, cb.from);

  // Avval callback'ga javob beramiz (Telegram kutib turmasligi uchun).
  try {
    await answerCallbackQuery(cb.id);
  } catch {
    /* ignore */
  }

  // --- Menyu navigatsiyasi ---
  if (data === "menu:home") {
    if (!isAuthenticated(user)) {
      await startLoginFlow(cb.from.id, chatId);
      return;
    }
    await showView(cb, `🏠 <b>Asosiy menyu</b>`, mainMenuKeyboard(true));
    return;
  }

  if (data === "menu:cancel") {
    await resetState(cb.from.id);
    await showView(cb, "✅ Bekor qilindi.", mainMenuKeyboard(isAuthenticated(user)));
    return;
  }

  if (data === "menu:connect") {
    await startLoginFlow(cb.from.id, chatId);
    return;
  }

  // Ulanmagan foydalanuvchi uchun himoya
  if (!isAuthenticated(user)) {
    await sendMessage(chatId, "🔒 Avval eMaktab hisobingizni ulang.", {
      replyMarkup: mainMenuKeyboard(false),
    });
    await startLoginFlow(cb.from.id, chatId);
    return;
  }

  // Fresh user (callback DB'dan olingan bo'lishi mumkin — yangilab olamiz)
  const fresh = (await getUser(cb.from.id)) ?? user;

  if (data === "menu:grades") {
    await sendGradesView(chatId, fresh, 14);
    return;
  }
  if (data === "grades:refresh") {
    await sendGradesView(chatId, fresh, 14);
    return;
  }
  if (data === "grades:month") {
    await sendGradesView(chatId, fresh, 30);
    return;
  }

  if (data === "menu:schedule") {
    await sendDayView(chatId, fresh, 0);
    return;
  }
  if (data === "sched:today") {
    await sendDayView(chatId, fresh, 0);
    return;
  }
  if (data === "sched:tomorrow") {
    await sendDayView(chatId, fresh, 1);
    return;
  }
  if (data === "sched:week") {
    await sendWeekView(chatId, fresh);
    return;
  }
  if (data === "sched:hw") {
    await sendHomeworkView(chatId, fresh);
    return;
  }

  if (data === "menu:news" || data === "news:refresh") {
    await sendNewsView(chatId, fresh);
    return;
  }

  if (data === "menu:settings") {
    const children = parseChildren(fresh);
    const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
    if (children.length > 1) {
      rows.push([{ text: "👶 Farzandni almashtirish", callback_data: "settings:children" }]);
    }
    if (appUrl()) {
      rows.push([{ text: "🔓 eMaktab saytini ochish", callback_data: "open_emaktab" }]);
    }
    rows.push([{ text: "🔄 Login/parolni yangilash", callback_data: "settings:relogin" }]);
    rows.push([{ text: "🚪 Chiqish (Logout)", callback_data: "settings:logout" }]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await showView(cb, formatAccount(fresh), kb(rows));
    return;
  }

  if (data === "settings:children") {
    const children = parseChildren(fresh);
    if (children.length <= 1) {
      await showView(cb, "👶 Bu akkauntga bitta farzand bog'langan.", settingsKeyboard(Boolean(appUrl())));
      return;
    }
    const rows = children.map((c, i) => [
      {
        text: `${c.fullName || c.personId}${c.personId === fresh.personId ? " ✅" : ""}`,
        callback_data: `child:${i}`,
      },
    ]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await showView(cb, formatPersonList(children, fresh.personId ?? ""), kb(rows));
    return;
  }

  if (data === "settings:account") {
    await showView(cb, formatAccount(fresh), settingsKeyboard(Boolean(appUrl())));
    return;
  }

  if (data === "settings:relogin") {
    await showView(
      cb,
      "🔄 <b>Login/parolni yangilash</b>\n\nYangi eMaktab login va parolingizni kiritasiz. Eski ma'lumotlar o'rinini yangisi egallaydi.",
      cancelKeyboard(),
    );
    await startLoginFlow(cb.from.id, chatId);
    return;
  }

  if (data === "settings:logout") {
    await showView(
      cb,
      "⚠️ <b>Chiqishni tasdiqlang</b>\n\n" +
        "Chiqsangiz, bazadagi eMaktab login va parolingiz <b>o'chiriladi</b>.\n" +
        "Qayta kirish uchun login-parolni qayta kiritishingiz kerak bo'ladi.",
      logoutConfirmKeyboard(),
    );
    return;
  }

  if (data === "settings:logout_confirm") {
    await logoutUser(cb.from.id);
    await showView(
      cb,
      "🚪 <b>Chiqildi.</b>\n\nBarcha eMaktab ma'lumotlaringiz bazadan tozalandi.\n\nYangi login bilan kirish uchun /start ni bosing yoki tugmani bosing.",
      kb([[{ text: "🔐 Qayta kirish", callback_data: "menu:connect" }]]),
    );
    return;
  }

  // --- Farzandni almashtirish (ota-onalar uchun) ---
  if (data.startsWith("child:")) {
    const idx = Number(data.slice("child:".length));
    const children = parseChildren(fresh);
    const selected = children[idx];
    if (!selected) {
      await sendMessage(chatId, "⚠️ Farzand topilmadi.", { replyMarkup: mainMenuKeyboard(true) });
      return;
    }
    invalidateSession(cb.from.id);
    await db
      .update(botUsers)
      .set({
        personId: selected.personId,
        schoolId: selected.schoolId,
        groupId: selected.groupId,
        fullName: selected.fullName,
        schoolName: selected.schoolName,
        groupName: selected.groupName,
        updatedAt: new Date(),
      })
      .where(eq(botUsers.telegramId, cb.from.id));
    await showView(
      cb,
      `👶 <b>${escapeHtml(selected.fullName)}</b> tanlandi.\n\n${escapeHtml(selected.schoolName)} ${escapeHtml(selected.groupName)}`,
      mainMenuKeyboard(true),
    );
    return;
  }

  // --- Bir bosishda eMaktabga kirish (one-click login sahifasi) ---
  if (data === "open_emaktab") {
    const base = appUrl();
    if (!base) {
      await sendMessage(
        chatId,
        "⚠️ APP_URL sozlanmaganligi sababli bir bosishda kirish ishlamayapti.\n\n" +
          "eMaktab'ga to'g'ridan-to'g'ri kirish: https://emaktab.uz",
        { replyMarkup: mainMenuKeyboard(true) },
      );
      return;
    }

    const token = generateToken(24);
    await db.insert(loginTokens).values({
      token,
      telegramId: cb.from.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    await sendMessage(chatId, "👇 90 soniya ichida tugmani bosing — brauzeringiz avtomatik eMaktabga kiradi:", {
      replyMarkup: kb([[{ text: "🔓 eMaktabga kirish", url: `${base}/e/${token}` }]]),
    });
    return;
  }

  // Noma'lum callback — menyu qaytaramiz.
  if (messageId) {
    try {
      await editMessageText(chatId, messageId, "🏠 <b>Asosiy menyu</b>", {
        replyMarkup: mainMenuKeyboard(isAuthenticated(user)),
      });
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// One-click login token (sahifa /e/[token] uchun)
// ---------------------------------------------------------------------------

export async function consumeLoginToken(token: string) {
  const row = await db.query.loginTokens.findFirst({ where: eq(loginTokens.token, token) });
  if (!row || row.used || row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  await db.update(loginTokens).set({ used: true }).where(eq(loginTokens.token, token));

  const user = await getUser(row.telegramId);
  if (!user?.emaktabLogin || !user?.emaktabPasswordEnc) {
    return null;
  }

  return {
    login: user.emaktabLogin,
    password: decryptSecret(user.emaktabPasswordEnc),
  };
}
