// ============================================================================
// Telegram bot mantig'i — foydalanuvchi oqimi:
//
// 1. /start → bot_users jadvalini tekshiradi:
//    - Ro'yxatdan o'tmagan → xush kelibsiz + eMaktab login/parol so'raydi
//    - Ro'yxatdan o'tgan  → darhol asosiy menyuni (inline tugmalar) ochadi
// 2. Login/parol → ENCRYPTION_KEY bilan shifrlanib bazaga saqlanadi
// 3. Rol avtomatik aniqlanadi (o'quvchi / ota-ona / o'qituvchi) va menyu
//    shunga qarab o'zgaradi.
// 4. Barcha ma'lumotlar HAQIQIY eMaktabdan olinadi; jarayon botning o'zida
//    kechadi — "⏳ Iltimos kuting..." → "✅ Muvaffaqiyatli tugadi".
// 5. Sozlamalar → Logout: bazadagi eski ma'lumotlar tozalanadi va bot
//    yana login so'raydigan holatga qaytadi.
// ============================================================================

import { and, eq } from "drizzle-orm";
import { db, logError, logEvent } from "@/db";
import { botUsers, memberAccounts, type BotUser, type ChildContext } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  EmaktabApiError,
  EmaktabAuthError,
  fetchCaptchaChallenge,
  fetchCaptchaImage,
  fetchClassMembers,
  fetchGrades,
  fetchNews,
  fetchSchedule,
  fetchTeacherClasses,
  loginEmaktab,
  sessionFromCookies,
  submitCaptchaLogin,
  type LoginFormState,
  shiftDayKey,
  tashkentDayKey,
  type ClassInfo,
  type ClassLink,
  type EmaktabSession,
} from "@/lib/emaktab";
import {
  escapeHtml,
  formatAccount,
  formatActivationReport,
  formatDay,
  formatGrades,
  formatHomework,
  formatMemberList,
  formatNews,
  formatPersonList,
  formatProfile,
  formatTeacherDay,
  formatWeek,
} from "@/lib/format";
import {
  answerCallbackQuery,
  cancelKeyboard,
  classCabinetKeyboard,
  classSelectKeyboard,
  deleteMessage,
  editMessageText,
  gradesKeyboard,
  kb,
  logoutConfirmKeyboard,
  mainMenuKeyboard,
  newsKeyboard,
  profileKeyboard,
  scheduleKeyboard,
  sendMessage,
  sendPhoto,
  sendPhotoBytes,
  settingsKeyboard,
  teacherDayKeyboard,
  teacherMenuKeyboard,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
} from "@/lib/telegram";

const SESSION_CACHE_TTL_MS = 15 * 60 * 1000; // eMaktab sessiyasi 15 daqiqa keshlanadi

// ---------------------------------------------------------------------------
// Yordamchi funksiyalar
// ---------------------------------------------------------------------------

// DB xatosining haqiqiy sababini ko'rsatadi (drizzle xatolarida asosiy sabab
// error.cause ichida bo'ladi — masalan "column classes_json does not exist").
function describeDbError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 3 && current; i++) {
    parts.push((current instanceof Error ? current.message : String(current)).slice(0, 250));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join("\n↓ ").slice(0, 500);
}

// Saqlangan parolni ochib bo'lmadi (odatda ENCRYPTION_KEY o'zgarganida).
class StoredCredentialsError extends Error {
  constructor() {
    super("Saqlangan eMaktab parolini ochib bo'lmadi");
    this.name = "StoredCredentialsError";
  }
}

function canDecryptStored(payload: string | null): boolean {
  if (!payload) return false;
  try {
    decryptSecret(payload);
    return true;
  } catch {
    return false;
  }
}

function isAuthenticated(user: BotUser): boolean {
  return Boolean(user.emaktabLogin && user.emaktabPasswordEnc);
}

function isTeacher(user: BotUser): boolean {
  return user.role === "teacher";
}

function isClassTeacher(user: BotUser): boolean {
  return user.role === "teacher" && Boolean(user.classesJson);
}

function menuFor(user: BotUser) {
  return isTeacher(user) ? teacherMenuKeyboard(true, isClassTeacher(user)) : mainMenuKeyboard(true);
}

function parseChildren(user: BotUser): ChildContext[] {
  try {
    const parsed = user.childrenJson ? JSON.parse(user.childrenJson) : null;
    return Array.isArray(parsed) ? (parsed as ChildContext[]) : [];
  } catch {
    return [];
  }
}

function parseClasses(user: BotUser): ClassLink[] {
  try {
    const parsed = user.classesJson ? JSON.parse(user.classesJson) : null;
    return Array.isArray(parsed) ? (parsed as ClassLink[]) : [];
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

type ProgressMsg = { message_id: number } | null;

async function startProgress(chatId: number, label: string): Promise<ProgressMsg> {
  try {
    const res = (await sendMessage(chatId, `⏳ <b>${escapeHtml(label)}</b>\n\n<i>Iltimos kuting...</i>`)) as {
      message_id?: number;
    };
    return res && typeof res.message_id === "number" ? { message_id: res.message_id } : null;
  } catch {
    return null;
  }
}

async function updateProgress(chatId: number, msg: ProgressMsg, text: string, replyMarkup?: ReturnType<typeof kb>) {
  if (!msg) return;
  try {
    await editMessageText(chatId, msg.message_id, text, { replyMarkup });
  } catch {
    /* ignore */
  }
}

async function finishProgress(chatId: number, msg: ProgressMsg, label: string) {
  await updateProgress(chatId, msg, `✅ <b>${escapeHtml(label)}</b> — <b>muvaffaqiyatli tugadi</b>`);
}

async function failProgress(chatId: number, msg: ProgressMsg, label: string) {
  await updateProgress(chatId, msg, `❌ <b>${escapeHtml(label)}</b> — xatolik yuz berdi`);
}

// ---------------------------------------------------------------------------
// eMaktab sessiya keshi (har safar login qilmaslik uchun)
// ---------------------------------------------------------------------------

const sessionCache = new Map<number, { session: EmaktabSession; classes: ClassLink[] | null; expiresAt: number }>();

function cacheSession(telegramId: number, session: EmaktabSession, classes: ClassLink[] | null = null) {
  sessionCache.set(telegramId, { session, classes, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
}

function invalidateSession(telegramId: number) {
  sessionCache.delete(telegramId);
}

async function openSession(user: BotUser): Promise<EmaktabSession> {
  const cached = sessionCache.get(user.telegramId);
  if (cached && cached.expiresAt > Date.now()) return cached.session;

  // 1) Saqlangan cookie'lar bilan (login qilmaslik uchun). Eskirgan bo'lsa — to'liq login.
  if (user.sessionEnc && user.emaktabLogin) {
    try {
      const cookies = JSON.parse(decryptSecret(user.sessionEnc)) as Record<string, string>;
      const session = await sessionFromCookies(cookies, user.emaktabLogin);
      if (user.personId && session.active.personId !== user.personId) {
        const preferred = session.persons.find((p) => p.personId === user.personId);
        if (preferred) session.active = preferred;
      }
      cacheSession(user.telegramId, session);
      return session;
    } catch (error) {
      console.error("saved eMaktab session invalid, re-login", error);
    }
  }

  // 2) To'liq login.
  let password: string;
  try {
    if (!user.emaktabPasswordEnc) throw new Error("missing");
    password = decryptSecret(user.emaktabPasswordEnc);
  } catch {
    throw new StoredCredentialsError();
  }
  const result = await loginEmaktab(user.emaktabLogin!, password);
  if (result.status === "invalid_credentials" || result.status === "captcha_required") {
    throw new EmaktabAuthError(result.message);
  }
  if (result.status !== "ok") {
    throw new EmaktabApiError(result.message);
  }

  const session = result.session;
  // DB'da saqlangan faol kontekstni (farzand tanlovi) saqlab qolamiz.
  if (user.personId && session.active.personId !== user.personId) {
    const preferred = session.persons.find((p) => p.personId === user.personId);
    if (preferred) session.active = preferred;
  }
  cacheSession(user.telegramId, session);

  // Cookie'larni saqlaymiz — keyingi safar login qilish shart emas (captcha kamroq chiqadi).
  try {
    await db
      .update(botUsers)
      .set({ sessionEnc: encryptSecret(JSON.stringify(session.cookies)), updatedAt: new Date() })
      .where(eq(botUsers.telegramId, user.telegramId));
  } catch (error) {
    console.error("save eMaktab cookies", error);
  }

  return session;
}

/** eMaktab bilan ishlash: sessiya ochadi, xatolarni ushlaydi, bir marta qayta urinadi. */
async function withSession<T>(user: BotUser, fn: (session: EmaktabSession) => Promise<T>): Promise<T> {
  let session = await openSession(user);
  try {
    return await fn(session);
  } catch (error) {
    if (error instanceof EmaktabAuthError) {
      invalidateSession(user.telegramId);
      session = await openSession(user);
      return await fn(session);
    }
    throw error;
  }
}

async function getTeacherClasses(user: BotUser, session: EmaktabSession): Promise<ClassLink[]> {
  const cached = sessionCache.get(user.telegramId);
  if (cached?.classes) return cached.classes;
  const fromDb = parseClasses(user);
  if (fromDb.length > 0) {
    if (cached) cached.classes = fromDb;
    return fromDb;
  }
  const classes = await fetchTeacherClasses(session);
  cacheSession(user.telegramId, session, classes);
  await db
    .update(botUsers)
    .set({ classesJson: classes.length > 0 ? JSON.stringify(classes) : null, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, user.telegramId));
  return classes;
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
    .set({
      state: "idle",
      tempLogin: null,
      tempPasswordEnc: null,
      tempSessionEnc: null,
      updatedAt: new Date(),
    })
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
      classesJson: null,
      tempPasswordEnc: null,
      tempSessionEnc: null,
      sessionEnc: null,
      updatedAt: new Date(),
    })
    .where(eq(botUsers.telegramId, telegramId));
}

// ---------------------------------------------------------------------------
// Login yakunlash (umumiy — oddiy login va captcha oqimi uchun)
// ---------------------------------------------------------------------------

/** Login muvaffaqiyatli yakunlandi — bazaga saqlaydi va menyuni ko'rsatadi. */
async function finishLoginSuccess(
  chatId: number,
  from: { id: number; first_name: string },
  login: string,
  password: string,
  session: EmaktabSession,
  progress: ProgressMsg,
) {
  const children = session.persons.length > 1 || session.role === "parent" ? session.persons : [];

  // O'qituvchi uchun sinflarni ham olamiz (rol menyusi uchun).
  let classes: ClassLink[] = [];
  if (session.role === "teacher") {
    try {
      classes = await fetchTeacherClasses(session);
    } catch (error) {
      // Login allaqachon muvaffaqiyatli — sinflar keyinroq ham olinadi.
      console.error("fetchTeacherClasses at login", error);
      classes = [];
    }
  }

  await db
    .update(botUsers)
    .set({
      emaktabLogin: login,
      emaktabPasswordEnc: encryptSecret(password),
      tempLogin: null,
      tempPasswordEnc: null,
      tempSessionEnc: null,
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
      classesJson: session.role === "teacher" && classes.length > 0 ? JSON.stringify(classes) : null,
      sessionEnc: encryptSecret(JSON.stringify(session.cookies)),
      updatedAt: new Date(),
    })
    .where(eq(botUsers.telegramId, from.id));

  cacheSession(from.id, session, session.role === "teacher" ? classes : null);
  await finishProgress(chatId, progress, "Ulanish");

  const roleLabel =
    session.role === "teacher" ? "O'qituvchi 📖" : session.role === "parent" ? "Ota-ona 👪" : "O'quvchi 🎒";
  await sendMessage(
    chatId,
    `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n👤 ${escapeHtml(session.fullName)}\n🎭 ${roleLabel}\n` +
      `🏫 ${escapeHtml(session.active.schoolName)} ${escapeHtml(session.active.groupName)}`,
  );
  await sendMessage(chatId, WELCOME_BACK(session.fullName), {
    replyMarkup: isTeacher({ role: session.role } as BotUser)
      ? teacherMenuKeyboard(true, classes.length > 0)
      : mainMenuKeyboard(true),
  });
}

/** Captcha rasmini yuboradi va kodni so'raydi. */
async function handleCaptchaChallenge(
  chatId: number,
  from: { id: number; first_name: string },
  login: string,
  password: string,
  result: { captchaUrl?: string; formState?: LoginFormState; message: string },
  progress?: ProgressMsg,
) {
  let captchaUrl = result.captchaUrl ?? "";
  let formState = result.formState;
  if (!captchaUrl || !formState) {
    // Javobda rasm/forma to'liq bo'lmasa — yangi captcha challenge olamiz.
    const fresh = await fetchCaptchaChallenge();
    if (!fresh) {
      await logEvent("captcha_no_image", "yangi captcha ham topilmadi", from.id);
      return;
    }
    captchaUrl = fresh.captchaUrl;
    formState = fresh.form;
  }

  await db
    .update(botUsers)
    .set({
      tempLogin: login,
      tempPasswordEnc: encryptSecret(password),
      tempSessionEnc: encryptSecret(JSON.stringify(formState)),
      state: "awaiting_captcha",
      updatedAt: new Date(),
    })
    .where(eq(botUsers.telegramId, from.id));

  if (progress) {
    await updateProgress(chatId, progress, "🖼 Captcha kiritilmoqda...");
  }
  const captchaCaption = "🖼 <b>eMaktab rasmli kod (captcha) so'rayapti.</b>";
  // Rasmni avval bayt sifatida yuklab olamiz va Telegram'ga to'g'ridan-to'g'ri yuboramiz —
  // tashqi URL sifatida yuborilsa Telegram uni ocholmay qolishi mumkin (ishlaydigan botlar shunday qiladi).
  const img = await fetchCaptchaImage(captchaUrl);
  if (img && img.byteLength > 0) {
    try {
      await sendPhotoBytes(chatId, img, { caption: captchaCaption });
    } catch (error) {
      await logError("captcha_send_bytes", error, from.id);
      await sendPhoto(chatId, captchaUrl, { caption: captchaCaption });
    }
  } else {
    await logEvent("captcha_fetch_empty", captchaUrl, from.id);
    await sendPhoto(chatId, captchaUrl, { caption: captchaCaption });
  }
  await sendMessage(
    chatId,
    "Rasmdagi <b>barcha belgilarni</b> (harf va raqamlarni) matn sifatida yuboring.\n\n" +
      "<i>Agar rasm ochilmasa — /start bosing, yangi rasm yuboraman.</i>",
    { replyMarkup: cancelKeyboard() },
  );
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
2️⃣ Rolingiz avtomatik aniqlanadi (o'quvchi / ota-ona / o'qituvchi) va menyu shunga qarab o'zgaradi.
3️⃣ Barcha ma'lumotlar eMaktab'dan olinadi, jarayon bot ichida kechadi.

Buyruqlar: /start · /grades · /schedule · /news · /status · /logout · /cancel`;

// ---------------------------------------------------------------------------
// Asosiy handler — hech qachon jim qolmaydi
// ---------------------------------------------------------------------------

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (error) {
    console.error("Telegram update handler failed", error);
    await logError("handle_update", error, update.message?.from?.id ?? update.callback_query?.from?.id);
    if (chatId) {
      try {
        const detail = error instanceof Error ? error.message : String(error);
        await sendMessage(
          chatId,
          `😔 <b>Kutilmagan xatolik yuz berdi.</b>\n\n<code>${escapeHtml(detail.slice(0, 500))}</code>\n\n` +
            `Iltimos, qayta urinib ko'ring yoki /start ni bosing.`,
          { replyMarkup: mainMenuKeyboard(true) },
        );
      } catch {
        /* ignore */
      }
    }
  }
}

async function handleMessage(message: TelegramMessage) {
  const from = message.from;
  if (!from || from.is_bot) return;

  const text = (message.text ?? "").trim();
  const chatId = message.chat.id;

  // DB ishlamasa — sababini ochiq aytamiz (bot jim qolmaydi).
  let user: BotUser;
  try {
    user = await getOrCreateUser(message, from);
  } catch (error) {
    console.error("DB error", error);
    await logError("get_or_create_user", error, from.id);
    await sendMessage(
      chatId,
      "⚠️ <b>Bazada xatolik yuz berdi.</b>\n\n" +
        `<code>${escapeHtml(describeDbError(error))}</code>\n\n` +
        "Agar <code>does not exist</code> yozuvi ko'rinsa — bazaviy jadval eskirgan, migratsiya kerak. " +
        "Aks holda — Vercel'da <code>DATABASE_URL</code> ni tekshiring (ichida placeholder qolmagan bo'lsin).",
    );
    return;
  }

  // --- Buyruqlar ---
  if (text === "/start") {
    await resetState(from.id);
    if (isAuthenticated(user)) {
      // Saqlangan parol ochilmasa (kalit o'zgargan) — darhol qayta ulanishni taklif qilamiz.
      if (!canDecryptStored(user.emaktabPasswordEnc)) {
        await sendMessage(
          chatId,
          "🔐 <b>Saqlangan eMaktab parolingizni ochib bo'lmadi</b> (shifrlash kaliti o'zgargan).\n\n" +
            "Qayta ulanish uchun eMaktab <b>login</b> va <b>parolingizni</b> qayta yuboring.",
          { replyMarkup: cancelKeyboard() },
        );
        await startLoginFlow(user.telegramId, chatId);
        return;
      }
      await sendMessage(chatId, WELCOME_BACK(user.fullName || from.first_name), {
        replyMarkup: menuFor(user),
      });
    } else {
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
    await sendMessage(chatId, HELP_TEXT, {
      replyMarkup: isAuthenticated(user) ? menuFor(user) : mainMenuKeyboard(false),
    });
    return;
  }

  if (text === "/cancel") {
    await resetState(from.id);
    await sendMessage(chatId, "✅ Bekor qilindi.", {
      replyMarkup: isAuthenticated(user) ? menuFor(user) : mainMenuKeyboard(false),
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
        ? `✅ <b>Ulangan.</b>\n\n👤 ${escapeHtml(user.fullName || "—")}\n` +
            `🎭 ${escapeHtml(user.role || "—")}\n` +
            `🏫 ${escapeHtml(user.schoolName || "—")} ${escapeHtml(user.groupName || "")}\n` +
            `🔐 <code>${escapeHtml(user.emaktabLogin ?? "")}</code>`
        : "❌ Hali ulanmagansiz. /start buyrug'ini yuboring.",
      { replyMarkup: isAuthenticated(user) ? menuFor(user) : mainMenuKeyboard(false) },
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
    await deleteMessage(chatId, message.message_id);

    if (!login || !text) {
      await logEvent(
        "guard_password_missing",
        `login=${login ? "bor" : "yo'q"} text=${text ? "bor" : "yo'q"}`,
        from.id,
      );
      await resetState(from.id);
      await sendMessage(
        chatId,
        "⚠️ Xatolik yuz berdi (kod: P0) — login yoki parol topilmadi.\nQaytadan boshlang: /start",
        { replyMarkup: mainMenuKeyboard(false) },
      );
      return;
    }

    const password = text;
    const progress = await startProgress(chatId, "eMaktab bilan tekshirilmoqda");
    const result = await loginEmaktab(login, password);

    if (result.status === "ok") {
      await finishLoginSuccess(chatId, from, login, password, result.session, progress);
      return;
    }

    if (result.status === "captcha_required" && result.captchaUrl && result.formState) {
      await handleCaptchaChallenge(chatId, from, login, password, result, progress);
      return;
    }

    if (result.status === "invalid_credentials") {
      await failProgress(chatId, progress, "Tekshirish");
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

    await failProgress(chatId, progress, "Tekshirish");
    await db
      .update(botUsers)
      .set({ state: "idle", tempLogin: null, updatedAt: new Date() })
      .where(eq(botUsers.telegramId, from.id));
    await sendMessage(chatId, `⚠️ ${escapeHtml(result.message)}`, {
      replyMarkup: mainMenuKeyboard(false),
    });
    return;
  }

  if (user.state === "awaiting_captcha") {
    const code = text?.trim() ?? "";
    await deleteMessage(chatId, message.message_id);

    if (!code || !user.tempLogin || !user.tempPasswordEnc || !user.tempSessionEnc) {
      await logEvent(
        "guard_captcha_missing",
        `code=${code ? "bor" : "yo'q"} login=${user.tempLogin ? "bor" : "yo'q"} pass=${
          user.tempPasswordEnc ? "bor" : "yo'q"
        } form=${user.tempSessionEnc ? "bor" : "yo'q"}`,
        from.id,
      );
      await resetState(from.id);
      await sendMessage(
        chatId,
        "⚠️ Xatolik yuz berdi (kod: C0) — captcha sessiyasi eskirgan.\nQaytadan boshlang: /start",
        { replyMarkup: mainMenuKeyboard(false) },
      );
      return;
    }

    const login = user.tempLogin;
    let password: string;
    let form: LoginFormState;
    try {
      password = decryptSecret(user.tempPasswordEnc);
      form = JSON.parse(decryptSecret(user.tempSessionEnc)) as LoginFormState;
    } catch {
      await resetState(from.id);
      await sendMessage(chatId, "🔐 Sessiya ma'lumotlari buzilgan. Qaytadan boshlang: /start", {
        replyMarkup: mainMenuKeyboard(false),
      });
      return;
    }

    const progress = await startProgress(chatId, "eMaktab bilan tekshirilmoqda");
    const result = await submitCaptchaLogin(login, password, form, code);

    if (result.status === "ok") {
      await finishLoginSuccess(chatId, from, login, password, result.session, progress);
      return;
    }

    if (result.status === "captcha_required" && result.captchaUrl && result.formState) {
      await handleCaptchaChallenge(chatId, from, login, password, result, progress);
      return;
    }

    await failProgress(chatId, progress, "Tekshirish");
    await resetState(from.id);
    await sendMessage(chatId, `❌ ${escapeHtml(result.message)}\n\nQaytadan boshlang: /start`, {
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
      if (isTeacher(user)) await sendTeacherDayView(chatId, user, 0);
      else await sendDayView(chatId, user, 0);
      return;
    }
    if (text === "/news" || text === "📰 Yangiliklar") {
      await sendNewsView(chatId, user);
      return;
    }
    await sendMessage(chatId, "Quyidagi menyudan tanlang 👇", { replyMarkup: menuFor(user) });
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
  const progress = await startProgress(chatId, "Baholar yuklanmoqda");
  try {
    const grades = await withSession(user, (s) => fetchGrades(s, days));
    const filtered = grades.slice(0, 40);
    const text = formatGrades(filtered, `So'nggi ${days} kun`, personLabel(user));
    await finishProgress(chatId, progress, "Baholar");
    await sendLong(chatId, text, gradesKeyboard());
  } catch (error) {
    await failProgress(chatId, progress, "Baholar");
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendDayView(chatId: number, user: BotUser, dayShift: number) {
  const progress = await startProgress(chatId, "Dars jadvali yuklanmoqda");
  try {
    const dayKey = shiftDayKey(tashkentDayKey(), dayShift);
    const nextKey = shiftDayKey(dayKey, 1);
    const schedule = await withSession(user, (s) => fetchSchedule(s, dayKey, nextKey));
    const day = schedule.find((d) => d.date === dayKey);
    const title = dayShift === 0 ? "Bugungi dars jadvali" : "Ertangi dars jadvali";
    const text = formatDay(day, title, personLabel(user));
    await finishProgress(chatId, progress, "Dars jadvali");
    await sendLong(chatId, text, scheduleKeyboard());
  } catch (error) {
    await failProgress(chatId, progress, "Dars jadvali");
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendTeacherDayView(chatId: number, user: BotUser, dayShift: number) {
  const progress = await startProgress(chatId, "Darslar yuklanmoqda");
  try {
    const dayKey = shiftDayKey(tashkentDayKey(), dayShift);
    const nextKey = shiftDayKey(dayKey, 1);
    const schedule = await withSession(user, (s) => fetchSchedule(s, dayKey, nextKey));
    const day = schedule.find((d) => d.date === dayKey);
    const title = dayShift === 0 ? "Bugungi darslaringiz" : "Ertangi darslaringiz";
    const text = formatTeacherDay(
      day?.lessons ?? [],
      dayKey,
      title,
      personLabel(user),
    );
    await finishProgress(chatId, progress, "Darslar");
    await sendLong(chatId, text, teacherDayKeyboard());
  } catch (error) {
    await failProgress(chatId, progress, "Darslar");
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendWeekView(chatId: number, user: BotUser) {
  const progress = await startProgress(chatId, "Haftalik jadval yuklanmoqda");
  try {
    const from = shiftDayKey(tashkentDayKey(), -1);
    const to = shiftDayKey(tashkentDayKey(), 7);
    const schedule = await withSession(user, (s) => fetchSchedule(s, from, to));
    const text = formatWeek(schedule, personLabel(user));
    await finishProgress(chatId, progress, "Haftalik jadval");
    await sendLong(chatId, text, scheduleKeyboard());
  } catch (error) {
    await failProgress(chatId, progress, "Haftalik jadval");
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendHomeworkView(chatId: number, user: BotUser) {
  const progress = await startProgress(chatId, "Uy vazifalari yuklanmoqda");
  try {
    const from = shiftDayKey(tashkentDayKey(), -2);
    const to = shiftDayKey(tashkentDayKey(), 10);
    const schedule = await withSession(user, (s) => fetchSchedule(s, from, to));
    const text = formatHomework(schedule, personLabel(user));
    await finishProgress(chatId, progress, "Uy vazifalari");
    await sendLong(chatId, text, scheduleKeyboard());
  } catch (error) {
    await failProgress(chatId, progress, "Uy vazifalari");
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendNewsView(chatId: number, user: BotUser) {
  const progress = await startProgress(chatId, "Yangiliklar yuklanmoqda");
  try {
    // Barcha yangiliklar (sahifalab olinadi) — faqat bir nechtasi emas.
    const posts = await withSession(user, (s) => fetchNews(s, 50));
    const text = formatNews(posts, user.schoolName ?? undefined);
    await finishProgress(chatId, progress, "Yangiliklar");
    await sendLong(chatId, text, newsKeyboard());
  } catch (error) {
    await failProgress(chatId, progress, "Yangiliklar");
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendProfileView(chatId: number, user: BotUser) {
  const progress = await startProgress(chatId, "Profil yuklanmoqda");
  try {
    let classes: ClassLink[] = [];
    if (isTeacher(user)) {
      classes = await withSession(user, (s) => getTeacherClasses(user, s));
    }
    const text = formatProfile(user, classes);
    await finishProgress(chatId, progress, "Profil");
    await sendLong(chatId, text, profileKeyboard());
  } catch (error) {
    await failProgress(chatId, progress, "Profil");
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendEmaktabError(chatId: number, user: BotUser, error: unknown) {
  if (error instanceof StoredCredentialsError) {
    await sendMessage(
      chatId,
      "🔐 <b>Saqlangan eMaktab parolingizni ochib bo'lmadi.</b>\n\n" +
        "Bu — shifrlash kaliti (<code>ENCRYPTION_KEY</code>) o'zgargani uchun bo'ladi.\n" +
        "Xavfsizlik uchun qayta ulanish kerak — eMaktab <b>login</b> va <b>parolingizni</b> qayta yuboring.\n\n" +
        "⚠️ <i>Eslatma: ENCRYPTION_KEY ni o'zgartirmang — o'zgarsa, saqlangan parollar ochilmaydi.</i>",
      { replyMarkup: cancelKeyboard() },
    );
    await startLoginFlow(user.telegramId, chatId);
    return;
  }
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
      replyMarkup: isAuthenticated(user) ? menuFor(user) : mainMenuKeyboard(false),
    });
    return;
  }
  console.error("eMaktab error", error);
  await sendMessage(
    chatId,
    `😔 eMaktab bilan bog'lanishda xatolik yuz berdi.\n\n<code>${escapeHtml(
      (error instanceof Error ? error.message : String(error)).slice(0, 400),
    )}</code>\n\nBirozdan so'ng qayta urinib ko'ring.`,
    { replyMarkup: isAuthenticated(user) ? menuFor(user) : mainMenuKeyboard(false) },
  );
}

// ---------------------------------------------------------------------------
// Sinf kabineti
// ---------------------------------------------------------------------------

async function sendClassCabinet(chatId: number, user: BotUser, classId: string) {
  const progress = await startProgress(chatId, "Sinf kabineti ochilmoqda");
  try {
    const classes = await withSession(user, (s) => getTeacherClasses(user, s));
    const cl = classes.find((c) => c.classId === classId);
    if (!cl) throw new EmaktabApiError("Sinf topilmadi.");
    const info = await withSession(user, (s) => fetchClassMembers(s, cl.classId, cl.className));
    await cacheClassInfo(user.telegramId, info);
    const text =
      `🏫 <b>Sinf kabineti</b> — ${escapeHtml(info.className)}\n\n` +
      `👨‍🎓 O'quvchilar: <b>${info.students.length}</b> ta\n` +
      `👥 Ota-onalar: <b>${info.parents.length}</b> ta\n` +
      `👨‍🏫 Xodimlar: <b>${info.staff.length}</b> ta\n\n` +
      `Kerakli bo'limni tanlang 👇`;
    await finishProgress(chatId, progress, "Sinf kabineti");
    await sendLong(chatId, text, classCabinetKeyboard(classId));
  } catch (error) {
    await failProgress(chatId, progress, "Sinf kabineti");
    await sendEmaktabError(chatId, user, error);
  }
}

const classInfoCache = new Map<string, ClassInfo>();

function cacheKey(telegramId: number, info: ClassInfo) {
  return `${telegramId}:${info.classId}`;
}

async function cacheClassInfo(telegramId: number, info: ClassInfo) {
  classInfoCache.set(cacheKey(telegramId, info), info);
  // 30 daqiqadan keyin tozalanadi
  setTimeout(() => classInfoCache.delete(cacheKey(telegramId, info)), 30 * 60 * 1000);
}

async function getClassInfo(user: BotUser, classId: string): Promise<ClassInfo> {
  const cached = classInfoCache.get(cacheKey(user.telegramId, { classId } as ClassInfo));
  if (cached) return cached;
  const classes = await withSession(user, (s) => getTeacherClasses(user, s));
  const cl = classes.find((c) => c.classId === classId);
  if (!cl) throw new EmaktabApiError("Sinf topilmadi.");
  const info = await withSession(user, (s) => fetchClassMembers(s, cl.classId, cl.className));
  await cacheClassInfo(user.telegramId, info);
  return info;
}

// ---------------------------------------------------------------------------
// Faollashtirish (haqiqiy login/parol bilan eMaktab'ga avtomatik kirish)
// ---------------------------------------------------------------------------

async function runActivation(chatId: number, user: BotUser, kind: "student" | "parent", classId: string) {
  const kindLabel = kind === "student" ? "O'quvchilar" : "Ota-onalar";
  const progress = await startProgress(chatId, `${kindLabel} faollashtirilmoqda`);

  try {
    const info = await getClassInfo(user, classId);
    const members = kind === "student" ? info.students : info.parents;

    // 1. Bazada saqlangan login/parollar (oldingi faollashtirishlardan).
    const saved = await db
      .select()
      .from(memberAccounts)
      .where(and(eq(memberAccounts.teacherTelegramId, user.telegramId), eq(memberAccounts.kind, kind)));

    const okNames: string[] = [];
    const failLines: string[] = [];
    const doneMembers = new Set<string>();

    let processed = 0;
    const total = Math.max(members.length, saved.length);

    // 2. Saqlangan akkauntlarni qayta tekshirish (login bo'lib kirib chiqamiz).
    for (const acc of saved) {
      processed++;
      await updateProgress(
        chatId,
        progress,
        `⏳ <b>${escapeHtml(kindLabel)} faollashtirilmoqda...</b>\n${processed}/${total}\n\n<i>Iltimos kuting...</i>`,
      );
      try {
        const password = decryptSecret(acc.emaktabPasswordEnc!);
        const res = await loginEmaktab(acc.emaktabLogin!, password);
        if (res.status === "ok") {
          okNames.push(acc.fullName || acc.emaktabLogin || acc.memberId || "?");
          if (acc.memberId) doneMembers.add(acc.memberId);
          await db
            .update(memberAccounts)
            .set({ activatedAt: new Date(), updatedAt: new Date() })
            .where(eq(memberAccounts.id, acc.id));
        } else {
          failLines.push(`${acc.fullName || acc.emaktabLogin}: ${res.status === "invalid_credentials" ? res.message : "kirib bo'lmadi"}`);
        }
      } catch (error) {
        failLines.push(`${acc.fullName || acc.emaktabLogin}: ${error instanceof Error ? error.message : "xatolik"}`);
      }
    }

    // 3. eMaktab sahifasidagi login/parollar bilan yangi akkauntlarni faollashtirish.
    //    Har bir login bilan kirib, eMaktabdagi ismni olamiz va shu ism bilan saqlaymiz.
    const usedLogins = new Set(saved.map((s) => s.emaktabLogin));
    let credentialsMissing = info.credentials.length === 0;

    for (const cred of info.credentials) {
      if (usedLogins.has(cred.login)) continue;
      processed++;
      await updateProgress(
        chatId,
        progress,
        `⏳ <b>${escapeHtml(kindLabel)} faollashtirilmoqda...</b>\n${processed}/${total}\n\n<i>Iltimos kuting...</i>`,
      );
      try {
        const res = await loginEmaktab(cred.login, cred.password);
        if (res.status === "ok") {
          const name = res.session.fullName || cred.login;
          okNames.push(name);
          const matched = members.find((m) => normalizeName(m.fullName) === normalizeName(name));
          if (matched) doneMembers.add(matched.memberId);
          await db
            .insert(memberAccounts)
            .values({
              teacherTelegramId: user.telegramId,
              classId: info.classId,
              memberId: matched?.memberId ?? null,
              kind,
              fullName: name,
              emaktabLogin: cred.login,
              emaktabPasswordEnc: encryptSecret(cred.password),
              activatedAt: new Date(),
            })
            .onConflictDoNothing();
          usedLogins.add(cred.login);
        } else {
          failLines.push(
            `${cred.login}: ${res.status === "invalid_credentials" ? res.message : "kirib bo'lmadi"}`,
          );
        }
      } catch (error) {
        failLines.push(`${cred.login}: ${error instanceof Error ? error.message : "xatolik"}`);
      }
    }

    // 4. Hech qanday parol topilmagan a'zolar haqida halol xabar.
    for (const m of members) {
      if (!doneMembers.has(m.memberId)) {
        failLines.push(`${m.fullName}: login/parol topilmadi`);
      }
    }
    if (credentialsMissing && saved.length === 0) {
      failLines.push("eMaktab sinf sahifasida login/parollar ochiq emas");
    }

    const report = formatActivationReport(kindLabel, okNames, failLines, credentialsMissing && okNames.length === 0);
    await finishProgress(chatId, progress, `${kindLabel} faollashtirish`);
    await sendLong(chatId, report, classCabinetKeyboard(classId));
  } catch (error) {
    await failProgress(chatId, progress, `${kindLabel} faollashtirish`);
    await sendEmaktabError(chatId, user, error);
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Callback'lar (inline tugmalar)
// ---------------------------------------------------------------------------

async function handleCallback(cb: TelegramCallbackQuery) {
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId) return;

  const data = cb.data ?? "";

  // Avval callback'ga javob beramiz (Telegram kutib turmasligi uchun).
  try {
    await answerCallbackQuery(cb.id);
  } catch {
    /* ignore */
  }

  // DB xatosi bo'lsa — jim qolmaymiz.
  let user: BotUser;
  try {
    user = await getOrCreateUser(cb.message, cb.from);
  } catch (error) {
    console.error("DB error", error);
    await logError("get_or_create_user", error, cb.from.id);
    await sendMessage(
      chatId,
      "⚠️ <b>Bazada xatolik yuz berdi.</b>\n\n" +
        `<code>${escapeHtml(describeDbError(error))}</code>\n\n` +
        "Agar <code>does not exist</code> yozuvi ko'rinsa — bazaviy jadval eskirgan, migratsiya kerak. " +
        "Aks holda — Vercel'da <code>DATABASE_URL</code> ni tekshiring.",
    );
    return;
  }

  // --- Menyu navigatsiyasi ---
  if (data === "menu:home") {
    if (!isAuthenticated(user)) {
      await startLoginFlow(cb.from.id, chatId);
      return;
    }
    await showView(cb, `🏠 <b>Asosiy menyu</b>`, menuFor(user));
    return;
  }

  if (data === "menu:cancel") {
    await resetState(cb.from.id);
    await showView(cb, "✅ Bekor qilindi.", isAuthenticated(user) ? menuFor(user) : mainMenuKeyboard(false));
    return;
  }

  if (data === "menu:connect") {
    await startLoginFlow(cb.from.id, chatId);
    return;
  }

  if (!isAuthenticated(user)) {
    await sendMessage(chatId, "🔒 Avval eMaktab hisobingizni ulang.", {
      replyMarkup: mainMenuKeyboard(false),
    });
    await startLoginFlow(cb.from.id, chatId);
    return;
  }

  const fresh = (await getUser(cb.from.id)) ?? user;

  // --- O'quvchi / ota-ona bo'limlari ---
  if (data === "menu:grades" || data === "grades:refresh") {
    await sendGradesView(chatId, fresh, 14);
    return;
  }
  if (data === "grades:month") {
    await sendGradesView(chatId, fresh, 30);
    return;
  }

  if (data === "menu:schedule" || data === "sched:today") {
    if (isTeacher(fresh)) await sendTeacherDayView(chatId, fresh, 0);
    else await sendDayView(chatId, fresh, 0);
    return;
  }
  if (data === "sched:tomorrow") {
    if (isTeacher(fresh)) await sendTeacherDayView(chatId, fresh, 1);
    else await sendDayView(chatId, fresh, 1);
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

  // --- O'qituvchi bo'limlari ---
  if (data === "t:today") {
    await sendTeacherDayView(chatId, fresh, 0);
    return;
  }
  if (data === "t:tomorrow") {
    await sendTeacherDayView(chatId, fresh, 1);
    return;
  }
  if (data === "profile") {
    await sendProfileView(chatId, fresh);
    return;
  }

  if (data === "cab:open") {
    const classes = await withSession(fresh, (s) => getTeacherClasses(fresh, s)).catch(() => [] as ClassLink[]);
    if (classes.length === 0) {
      await sendMessage(chatId, "🏫 Sinf topilmadi.", { replyMarkup: menuFor(fresh) });
      return;
    }
    if (classes.length === 1) {
      await sendClassCabinet(chatId, fresh, classes[0].classId);
      return;
    }
    await showView(
      cb,
      `🏫 <b>Sinfni tanlang:</b>`,
      kb([
        ...classes.map((c) => [{ text: `🏫 ${c.className}`, callback_data: `cabsel:${c.classId}` }]),
        [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
      ]),
    );
    return;
  }

  if (data.startsWith("cabsel:")) {
    await sendClassCabinet(chatId, fresh, data.slice("cabsel:".length));
    return;
  }

  if (data.startsWith("cab:refresh:")) {
    const classId = data.slice("cab:refresh:".length);
    classInfoCache.delete(cacheKey(fresh.telegramId, { classId } as ClassInfo));
    await sendClassCabinet(chatId, fresh, classId);
    return;
  }

  if (data.startsWith("cab:students:")) {
    const classId = data.slice("cab:students:".length);
    const progress = await startProgress(chatId, "O'quvchilar ro'yxati yuklanmoqda");
    try {
      const info = await getClassInfo(fresh, classId);
      const text = formatMemberList("O'quvchilar ro'yxati", info.className, info.students);
      await finishProgress(chatId, progress, "O'quvchilar ro'yxati");
      await sendLong(chatId, text, classCabinetKeyboard(classId));
    } catch (error) {
      await failProgress(chatId, progress, "O'quvchilar ro'yxati");
      await sendEmaktabError(chatId, fresh, error);
    }
    return;
  }

  if (data.startsWith("cab:parents:")) {
    const classId = data.slice("cab:parents:".length);
    const progress = await startProgress(chatId, "Ota-onalar ro'yxati yuklanmoqda");
    try {
      const info = await getClassInfo(fresh, classId);
      const text = formatMemberList("Ota-onalar ro'yxati", info.className, info.parents);
      await finishProgress(chatId, progress, "Ota-onalar ro'yxati");
      await sendLong(chatId, text, classCabinetKeyboard(classId));
    } catch (error) {
      await failProgress(chatId, progress, "Ota-onalar ro'yxati");
      await sendEmaktabError(chatId, fresh, error);
    }
    return;
  }

  if (data.startsWith("cab:act_students:")) {
    await runActivation(chatId, fresh, "student", data.slice("cab:act_students:".length));
    return;
  }
  if (data.startsWith("cab:act_parents:")) {
    await runActivation(chatId, fresh, "parent", data.slice("cab:act_parents:".length));
    return;
  }

  // --- Sozlamalar ---
  if (data === "menu:settings" || data === "settings:account") {
    const children = parseChildren(fresh);
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    if (children.length > 1) {
      rows.push([{ text: "👶 Farzandni almashtirish", callback_data: "settings:children" }]);
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
      await showView(cb, "👶 Bu akkauntga bitta farzand bog'langan.", settingsKeyboard());
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

  if (data === "settings:relogin") {
    await showView(
      cb,
      "🔄 <b>Login/parolni yangilash</b>\n\nYangi eMaktab login va parolingizni kiritasiz. Eski ma'lumotlar o'rnini yangisi egallaydi.",
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
      await sendMessage(chatId, "⚠️ Farzand topilmadi.", { replyMarkup: menuFor(fresh) });
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
      menuFor(fresh),
    );
    return;
  }

  // Noma'lum callback — menyu qaytaramiz.
  if (messageId) {
    try {
      await editMessageText(chatId, messageId, "🏠 <b>Asosiy menyu</b>", { replyMarkup: menuFor(user) });
    } catch {
      /* ignore */
    }
  }
}
