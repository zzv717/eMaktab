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
  fetchTeacherGroups,
  fetchDiaryDays,
  dedupeShiftLessons,
  lessonMatchesTeacherLoad,
  loginEmaktab,
  scheduleFromDiaryDays,
  setLessonConducted,
  fetchPlanImportOptions,
  resolvePlanSubjectId,
  importLessonPlan,
  planPeriodOptions,
  type PlanOption,
  fetchHomeworkRows,
  setHomeworkMaqom,
  sessionFromCookies,
  submitCaptchaLogin,
  type LoginFormState,
  shiftDayKey,
  tashkentDayKey,
  type ClassInfo,
  type ClassLink,
  type DaySchedule,
  type EmaktabSession,
  type Lesson,
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
  formatTeacherWeek,
  formatWeek,
} from "@/lib/format";
import {
  answerCallbackQuery,
  beginFlow,
  type ReplyMarkup,
  cancelKeyboard,
  cleanupPreviousFlow,
  MENU_TEXT,
  mainReplyKeyboard,
  teacherReplyKeyboard,
  classCabinetKeyboard,
  classSelectKeyboard,
  deleteMessage,
  downloadTelegramFile,
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
  // Faqat haqiqiy sinf rahbari (TEACHERV2: isClassTeacher=true) —
  // dars o'tadigan sinflar hisobga olinmaydi.
  return user.role === "teacher" && parseClasses(user).some((c) => c.isClassTeacher === true);
}

function menuFor(user: BotUser) {
  return isTeacher(user)
    ? teacherReplyKeyboard(isClassTeacher(user))
    : mainReplyKeyboard();
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

async function sendLong(chatId: number, text: string, replyMarkup?: ReplyMarkup) {
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
  replyMarkup?: ReplyMarkup,
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

async function updateProgress(chatId: number, msg: ProgressMsg, text: string, replyMarkup?: ReplyMarkup) {
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

// Sinflar ro'yxati: isClassTeacher/subjects maydonlari to'liq bo'lsa — kesh ishlatiladi;
// aks holda TEACHERV2'dan (emaktab.uz/teachers) yangilanadi.
function classesComplete(list: ClassLink[] | null | undefined): boolean {
  return Boolean(list && list.length > 0 && list.every((c) => c.isClassTeacher !== undefined));
}

async function getTeacherClasses(user: BotUser, session: EmaktabSession): Promise<ClassLink[]> {
  const cached = sessionCache.get(user.telegramId);
  if (classesComplete(cached?.classes)) return cached!.classes!;
  const fromDb = parseClasses(user);
  if (classesComplete(fromDb)) {
    if (cached) cached.classes = fromDb;
    return fromDb;
  }

  // 1-usul (asosiy): TEACHERV2 state — isClassTeacher + fanlar bilan.
  let classes: ClassLink[] = [];
  const groups = await fetchTeacherGroups(session);
  if (groups.length > 0) {
    classes = groups.map((g) => ({
      classId: g.classId,
      className: g.className,
      isClassTeacher: g.isClassTeacher,
      subjects: g.subjects,
    }));
  } else {
    // 2-usul (fallback): "Mening sinflarim" havolalari.
    classes = await fetchTeacherClasses(session);
    const cts = new Set(session.classTeacherGroupIds ?? []);
    const has = (id: string) =>
      cts.has(id) || [...cts].some((x) => x.includes(id) || id.includes(x));
    classes = classes.map((c) => ({ ...c, isClassTeacher: has(c.classId) }));
  }

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
  let children = session.persons.length > 1 || session.role === "parent" ? session.persons : [];
  // Ota-ona uchun kamida bitta farzand bo'lishi shart ("Bolalar" bo'limi doim ishlashi uchun).
  if (session.role === "parent" && children.length === 0 && session.active.personId) {
    children = [
      {
        personId: session.active.personId,
        fullName: session.active.fullName || session.fullName,
        schoolId: session.active.schoolId,
        groupId: session.active.groupId,
        schoolName: session.active.schoolName,
        groupName: session.active.groupName,
      },
    ];
  }

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

  // Har bir yangi so'rov — yangi oqim: faqat oldingi so'rov xabarlari o'chadi.
  if (chatId) {
    const keep: number[] = [];
    const cbMsgId = update.callback_query?.message?.message_id;
    if (cbMsgId) keep.push(cbMsgId);
    beginFlow(update.update_id ?? Date.now(), keep);
    await cleanupPreviousFlow(chatId);
  }

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
          { replyMarkup: kb([[{ text: "🏠 Asosiy sahifa", callback_data: "menu:home" }]]) },
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

  // --- Ish reja fayli (dokument) ---
  if (message.document && (user.state ?? "").startsWith("c:")) {
    await handleCtpDocument(chatId, user, message);
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

  // --- A'zoga login-parol biriktirish (state machine) ---
  if (user.state === "m_attach_login") {
    if (!text || text.startsWith("/")) {
      await sendMessage(chatId, "Iltimos, eMaktab <b>login</b>ini matn sifatida yuboring.", {
        replyMarkup: cancelKeyboard(),
      });
      return;
    }
    await deleteMessage(chatId, message.message_id);
    await db
      .update(botUsers)
      .set({ tempLogin: text.trim(), state: "m_attach_password", updatedAt: new Date() })
      .where(eq(botUsers.telegramId, from.id));
    await sendMessage(
      chatId,
      "🔒 Endi eMaktab <b>parol</b>ini yuboring.\n\n" +
        "⚠️ <i>Xavfsizlik uchun bu xabar avtomatik o'chiriladi va parol shifrlanib saqlanadi.</i>",
      { replyMarkup: cancelKeyboard() },
    );
    return;
  }

  if (user.state === "m_attach_password") {
    const login = user.tempLogin;
    await deleteMessage(chatId, message.message_id);
    type AttachCtx = { kind: "student" | "parent"; classId: string; memberId: string; name: string };
    let ctx: AttachCtx | null = null;
    try {
      if (user.tempSessionEnc) ctx = JSON.parse(decryptSecret(user.tempSessionEnc)) as AttachCtx;
    } catch {
      ctx = null;
    }
    if (!login || !text || !ctx) {
      await resetState(from.id);
      await sendMessage(
        chatId,
        "⚠️ Xatolik yuz berdi (kod: A0) — jarayon ma'lumotlari topilmadi.\nQaytadan urinib ko'ring.",
        { replyMarkup: isAuthenticated(user) ? menuFor(user) : mainMenuKeyboard(false) },
      );
      return;
    }
    const password = text;
    const progress = await startProgress(chatId, "eMaktab bilan tekshirilmoqda");
    const result = await loginEmaktab(login, password);

    if (result.status === "ok") {
      const fullName = result.session.fullName || ctx.name;
      const existing = await db
        .select()
        .from(memberAccounts)
        .where(
          and(
            eq(memberAccounts.teacherTelegramId, from.id),
            eq(memberAccounts.kind, ctx.kind),
            eq(memberAccounts.memberId, ctx.memberId),
          ),
        );
      if (existing.length > 0) {
        await db
          .update(memberAccounts)
          .set({
            emaktabLogin: login,
            emaktabPasswordEnc: encryptSecret(password),
            fullName,
            activatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(memberAccounts.id, existing[0].id));
      } else {
        await db.insert(memberAccounts).values({
          teacherTelegramId: from.id,
          classId: ctx.classId,
          memberId: ctx.memberId,
          kind: ctx.kind,
          fullName,
          emaktabLogin: login,
          emaktabPasswordEnc: encryptSecret(password),
          activatedAt: new Date(),
        });
      }
      await resetState(from.id);
      await finishProgress(chatId, progress, "Login-parol biriktirish");
      const actCallback = ctx.kind === "parent" ? `cab:act_parents:${ctx.classId}` : `cab:act_students:${ctx.classId}`;
      await sendLong(
        chatId,
        `✅ <b>${escapeHtml(ctx.name)}</b> uchun login-parol <b>saqlandi</b>!\n\n` +
          `Keyingi safar “Faollashtirish” tugmasi bosilganda shu login orqali avtomatik kiriladi.`,
        kb([
          [{ text: "🔁 Faollashtirishni davom ettirish", callback_data: actCallback }],
          [{ text: "⬅️ Sinf kabineti", callback_data: `cab:refresh:${ctx.classId}` }],
          [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
        ]),
      );
      return;
    }

    if (result.status === "captcha_required") {
      await failProgress(chatId, progress, "Login-parol biriktirish");
      await resetState(from.id);
      await sendMessage(
        chatId,
        "⚠️ eMaktab captcha so'radi — hozircha avtomatik kira olmadik.\n" +
          "Keyinroq “Login-parol biriktiring” tugmasi orqali qayta urinib ko'ring.",
        { replyMarkup: isAuthenticated(user) ? menuFor(user) : mainMenuKeyboard(false) },
      );
      return;
    }

    // Login/parol noto'g'ri — qaytadan login so'raymiz.
    await failProgress(chatId, progress, "Login-parol biriktirish");
    await db
      .update(botUsers)
      .set({ state: "m_attach_login", tempLogin: null, updatedAt: new Date() })
      .where(eq(botUsers.telegramId, from.id));
    await sendMessage(
      chatId,
      `❌ ${escapeHtml(result.message)}\n\nQaytadan eMaktab <b>login</b>ini yuboring (yoki /cancel bilan bekor qiling).`,
      { replyMarkup: cancelKeyboard() },
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

  // --- Menyu tugmalari va qisqa buyruqlar (faqat ulanganlar uchun) ---
  if (isAuthenticated(user)) {
    if (text === "/grades" || text === MENU_TEXT.grades) {
      await sendGradesView(chatId, user, 14);
      return;
    }
    if (text === "/schedule" || text === MENU_TEXT.schedule || text === MENU_TEXT.today) {
      if (isTeacher(user)) await sendTeacherDayView(chatId, user, 0);
      else await sendDayView(chatId, user, 0);
      return;
    }
    if (text === "/news" || text === MENU_TEXT.news) {
      await sendNewsView(chatId, user);
      return;
    }
    if (text === MENU_TEXT.week) {
      if (isTeacher(user)) await sendTeacherWeekView(chatId, user);
      else await sendWeekView(chatId, user);
      return;
    }
    if (text === MENU_TEXT.conduct) {
      if (isTeacher(user)) await sendConductStart(chatId, user);
      return;
    }
    if (text === MENU_TEXT.ctp) {
      if (isTeacher(user)) await sendCtpStart(chatId, user);
      return;
    }
    if (text === MENU_TEXT.maqom) {
      if (isTeacher(user)) await sendMaqomStart(chatId, user);
      return;
    }
    if (text === MENU_TEXT.profile) {
      await sendProfileView(chatId, user);
      return;
    }
    if (text === MENU_TEXT.myClass) {
      await openClassCabinet(chatId, user);
      return;
    }
    if (text === MENU_TEXT.parents) {
      const homeroom = await homeroomClass(user);
      if (!homeroom) {
        await sendMessage(chatId, "🏫 Sizga biriktirilgan sinf topilmadi (sinf rahbari emassiz).", {
          replyMarkup: menuFor(user),
        });
        return;
      }
      const progress = await startProgress(chatId, "Ota-onalar ro'yxati yuklanmoqda");
      try {
        const info = await getClassInfo(user, homeroom.classId);
        const text2 = formatMemberList("Ota-onalar faolligi", info.className, info.parents);
        await finishProgress(chatId, progress, "Ota-onalar ro'yxati");
        await sendLong(chatId, text2, classCabinetKeyboard(homeroom.classId));
      } catch (error) {
        await failProgress(chatId, progress, "Ota-onalar ro'yxati");
        await sendEmaktabError(chatId, user, error);
      }
      return;
    }
    if (text === MENU_TEXT.checkAll) {
      const homeroom = await homeroomClass(user);
      if (!homeroom) {
        await sendMessage(chatId, "🏫 Sizga biriktirilgan sinf topilmadi (sinf rahbari emassiz).", {
          replyMarkup: menuFor(user),
        });
        return;
      }
      await runActivation(chatId, user, "student", homeroom.classId);
      await runActivation(chatId, user, "parent", homeroom.classId);
      return;
    }
    if (text === "/settings" || text === MENU_TEXT.settings) {
      const children = parseChildren(user);
      const rows: Array<Array<{ text: string; callback_data: string }>> = [];
      if (children.length > 0 || user.role === "parent") {
        rows.push([{ text: "👶 Bolalar", callback_data: "settings:children" }]);
      }
      rows.push([{ text: "🔄 Login/parolni yangilash", callback_data: "settings:relogin" }]);
      rows.push([{ text: "🚪 Chiqish (Logout)", callback_data: "settings:logout" }]);
      await sendLong(chatId, formatAccount(user), kb(rows));
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

/** Faol farzand (ota-ona uchun) — aralashtirib yubormaslik uchun aynan tanlangan. */
function activeChild(user: BotUser): ChildContext | null {
  const children = parseChildren(user);
  if (children.length === 0) return null;
  return children.find((c) => c.personId === user.personId) ?? (children.length === 1 ? children[0] : null);
}

function personLabel(user: BotUser): string {
  return activeChild(user)?.fullName || user.fullName || user.emaktabLogin || "";
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

/** Tanlangan farzandning bugungi darslari + so'nggi baholari (faqat O'SHA farzandniki). */
async function sendChildOverview(chatId: number, user: BotUser, child: ChildContext) {
  const progress = await startProgress(chatId, "Farzand ma'lumotlari yuklanmoqda");
  try {
    const today = tashkentDayKey();
    const nextKey = shiftDayKey(today, 1);
    const { schedule, grades } = await withSession(user, async (s) => {
      const schedule = await fetchSchedule(s, today, nextKey);
      const grades = await fetchGrades(s, 14);
      return { schedule, grades };
    });
    const day = schedule.find((d) => d.date === today);
    let text = formatDay(day, "Bugungi dars jadvali", child.fullName || personLabel(user));
    const recent = grades.slice(0, 20);
    if (recent.length > 0) {
      text += `\n\n${formatGrades(recent, "So'nggi 14 kun baholari", child.fullName || personLabel(user))}`;
    }
    text += `\n\n<i>👶 Boshqa farzandni ko'rish uchun: Sozlamalar → Bolalar</i>`;
    await finishProgress(chatId, progress, "Farzand ma'lumotlari");
    await sendLong(
      chatId,
      text,
      kb([
        [{ text: "👶 Bolalar", callback_data: "settings:children" }],
        [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
      ]),
    );
  } catch (error) {
    await failProgress(chatId, progress, "Farzand ma'lumotlari");
    await sendEmaktabError(chatId, user, error);
  }
}

// ---------------------------------------------------------------------------
// ✅ Darsni o'tildi qilish + 📄 Ish reja joylashtirish (o'qituvchi oqimlari)
// ---------------------------------------------------------------------------

const ADMIN_NICK = "@zzv717";

/** Haqiqiy o'qituvchi yuklamasi (TEACHERV2 guruhlari + jurnal yozuvlari). */
async function teacherLoad(user: BotUser): Promise<ClassLink[]> {
  return withSession(user, async (s) => {
    const groups = await fetchTeacherGroups(s);
    return groups.map((g) => ({
      classId: g.classId,
      className: g.className,
      isClassTeacher: g.isClassTeacher,
      subjects: g.subjects,
    }));
  }).catch(() => [] as ClassLink[]);
}

function adminFailNote(reason?: string | null): string {
  return (
    `\n\n💡 <i>Yordam uchun admin bilan bog'laning: <b>${ADMIN_NICK}</b></i>` +
    (reason ? `\n\n🔍 <i>Sabab: ${escapeHtml(reason)}</i>` : "")
  );
}

async function sendConductStart(chatId: number, user: BotUser) {
  const classes = await teacherLoad(user);
  if (classes.length === 0) {
    await sendMessage(chatId, "⚠️ Sinflar topilmadi. Keyinroq qayta urinib ko'ring.", { replyMarkup: menuFor(user) });
    return;
  }
  const rows = classes.map((c) => [{ text: `🏫 ${c.className}`, callback_data: `cond:${c.classId}` }]);
  rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
  await sendMessage(
    chatId,
    `✅ <b>Darsni o'tildi qilish</b>\n\n1️⃣ Sinifni tanlang:`,
    { replyMarkup: kb(rows) },
  );
}

async function sendCtpStart(chatId: number, user: BotUser) {
  const classes = await teacherLoad(user);
  if (classes.length === 0) {
    await sendMessage(chatId, "⚠️ Sinflar topilmadi. Keyinroq qayta urinib ko'ring.", { replyMarkup: menuFor(user) });
    return;
  }
  const rows = classes.map((c) => [{ text: `🏫 ${c.className}`, callback_data: `ctp:${c.classId}` }]);
  rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
  await sendMessage(
    chatId,
    `📄 <b>Ish reja joylashtirish</b>\n\n1️⃣ Sinifni tanlang:`,
    { replyMarkup: kb(rows) },
  );
}

/** Maqom berish — uy vazifasi maqomi (1-sinf tanlash). */
async function sendMaqomStart(chatId: number, user: BotUser) {
  const classes = await teacherLoad(user);
  if (classes.length === 0) {
    await sendMessage(chatId, "⚠️ Sinflar topilmadi. Keyinroq qayta urinib ko'ring.", { replyMarkup: menuFor(user) });
    return;
  }
  const rows = classes.map((c) => [{ text: `🏫 ${c.className}`, callback_data: `maqom:${c.classId}` }]);
  rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
  await sendMessage(
    chatId,
    `📝 <b>Maqom berish</b>\n\n1️⃣ Sinifni tanlang:`,
    { replyMarkup: kb(rows) },
  );
}

/** Sinf va fan tanlovi uchun callback konteksti. */
async function classSubjects(user: BotUser, classId: string): Promise<ClassLink | null> {
  const classes = await teacherLoad(user);
  return classes.find((c) => classIdMatch(c.classId, classId)) ?? null;
}

/** Sinf darslarini (joriy/sana) olish — o'qituvchi yuklamasi asosida. */
async function classDayLessons(user: BotUser, className: string, dayKey: string) {
  const { days } = await buildTeacherWeek(user, dayKey, dayKey);
  const day = days.find((d) => d.date === dayKey);
  return (day?.lessons ?? []).filter((l) => l.groupName === className);
}

async function handleConductCallback(chatId: number, user: BotUser, data: string, editTo: (text: string, markup: ReturnType<typeof kb>) => Promise<void>) {
  if (data === "t:conduct") {
    await sendConductStart(chatId, user);
    return;
  }
  // cond:{classId} — fan tanlash
  if (/^cond:\d+$/.test(data)) {
    const classId = data.slice(5);
    const cl = await classSubjects(user, classId);
    if (!cl) {
      await sendMessage(chatId, "⚠️ Sinf topilmadi.", { replyMarkup: menuFor(user) });
      return;
    }
    const subjects = cl.subjects ?? [];
    if (subjects.length === 0) {
      await sendMessage(chatId, "⚠️ Bu sinf uchun fanlar topilmadi.", { replyMarkup: menuFor(user) });
      return;
    }
    const rows = subjects.map((s, i) => [{ text: `📖 ${s}`, callback_data: `conds:${classId}:${i}` }]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await editTo(`✅ <b>Darsni o'tildi qilish</b> — ${escapeHtml(cl.className)}\n\n2️⃣ Fanni tanlang:`, kb(rows));
    return;
  }
  // conds:{classId}:{subjIdx} — sana tanlash
  if (/^conds:\d+:\d+$/.test(data)) {
    const [classId, subjIdxS] = data.slice(6).split(":");
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < 6; i++) {
      const dayKey = shiftDayKey(tashkentDayKey(), -i);
      rows.push([
        {
          text: i === 0 ? `📅 Bugun (${dayKey.slice(8)}.${dayKey.slice(5, 7)})` : `📅 ${dayKey.slice(8)}.${dayKey.slice(5, 7)}`,
          callback_data: `condd:${classId}:${subjIdxS}:${dayKey}`,
        },
      ]);
    }
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await editTo(`✅ <b>Darsni o'tildi qilish</b>\n\n3️⃣ Dars sanasini tanlang:`, kb(rows));
    return;
  }
  // condd:{classId}:{subjIdx}:{dayKey} — dars tanlash
  if (/^condd:\d+:\d+:\d{4}-\d{2}-\d{2}$/.test(data)) {
    const rest = data.slice(6);
    const dayKey = rest.slice(-10);
    const [classId, subjIdxS] = rest.slice(0, -11).split(":");
    const cl = await classSubjects(user, classId);
    const subject = cl?.subjects?.[Number(subjIdxS)] ?? "";
    const lessons = await classDayLessons(user, cl?.className ?? "", dayKey);
    const filtered = subject ? lessons.filter((l) => l.subject === subject) : lessons;
    if (filtered.length === 0) {
      await sendMessage(chatId, "⚠️ Bu kunda dars topilmadi.", { replyMarkup: menuFor(user) });
      return;
    }
    const rows = filtered.map((l) => [
      {
        text: `${l.startTime ?? ""} ${l.number}. ${l.subject}`.slice(0, 48),
        callback_data: `condl:${classId}:${subjIdxS}:${dayKey}:${l.number}`,
      },
    ]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await editTo(`✅ <b>Darsni o'tildi qilish</b> — ${dayKey.slice(8)}.${dayKey.slice(5, 7)}\n\n4️⃣ Darsni tanlang:`, kb(rows));
    return;
  }
  // condl:{classId}:{subjIdx}:{dayKey}:{lessonNo} — tasdiqlash
  if (/^condl:\d+:\d+:\d{4}-\d{2}-\d{2}:\d+$/.test(data)) {
    const rest = data.slice(6);
    const m = rest.match(/^(\d+):(\d+):(\d{4}-\d{2}-\d{2}):(\d+)$/)!;
    const [, classId, subjIdxS, dayKey, lessonNo] = m;
    const rows = [
      [{ text: "✅ Ha, o'tildi deb belgilash", callback_data: `condgo:${classId}:${subjIdxS}:${dayKey}:${lessonNo}` }],
      [{ text: "🔙 Bekor qilish", callback_data: "menu:home" }],
    ];
    await editTo(
      `✅ <b>Darsni o'tildi qilish</b>\n\n` +
        `📅 Sana: <b>${dayKey.slice(8)}.${dayKey.slice(5, 7)}.${dayKey.slice(0, 4)}</b>\n` +
        `📝 Dars № ${escapeHtml(lessonNo)}\n\n` +
        `<i>Dars eMaktabda "o'tildi" deb belgilansinmi?</i>`,
      kb(rows),
    );
    return;
  }
  // condgo: — bajarish
  if (/^condgo:\d+:\d+:\d{4}-\d{2}-\d{2}:\d+$/.test(data)) {
    const rest = data.slice(7);
    const m = rest.match(/^(\d+):(\d+):(\d{4}-\d{2}-\d{2}):(\d+)$/)!;
    const [, classId, subjIdxS, dayKey, lessonNo] = m;
    const progress = await startProgress(chatId, "Dars maqomi belgilanmoqda");
    try {
      const cl = await classSubjects(user, classId);
      const subject = cl?.subjects?.[Number(subjIdxS)] ?? "";
      const result = await withSession(user, (s) =>
        setLessonConducted(s, {
          classId,
          className: cl?.className ?? "",
          subjectName: subject,
          date: dayKey,
          lessonNumber: Number(lessonNo),
        }),
      );
      if (result.ok) {
        await finishProgress(chatId, progress, "Dars maqomi");
        await sendMessage(
          chatId,
          `✅ <b>Dars o'tildi deb belgilandi!</b>\n\n📅 ${dayKey.slice(8)}.${dayKey.slice(5, 7)}.${dayKey.slice(0, 4)} — ${escapeHtml(subject)}${cl?.className ? ` (${escapeHtml(cl.className)})` : ""}`,
          { replyMarkup: menuFor(user) },
        );
      } else {
        await failProgress(chatId, progress, "Dars maqomi");
        await sendMessage(chatId, `❌ <b>Dars maqomini belgilab bo'lmadi.</b>${adminFailNote(result.reason)}`, {
          replyMarkup: menuFor(user),
        });
      }
    } catch (error) {
      await failProgress(chatId, progress, "Dars maqomi");
      await sendMessage(chatId, `❌ <b>Dars maqomini belgilab bo'lmadi.</b>${adminFailNote(String(error).slice(0, 120))}`, {
        replyMarkup: menuFor(user),
      });
    }
    return;
  }
  // ---- Ish reja (CTP) ----
  if (data === "t:ctp") {
    await sendCtpStart(chatId, user);
    return;
  }
  if (/^ctp:\d+$/.test(data)) {
    const classId = data.slice(4);
    const cl = await classSubjects(user, classId);
    if (!cl || (cl.subjects ?? []).length === 0) {
      await sendMessage(chatId, "⚠️ Fanlar topilmadi.", { replyMarkup: menuFor(user) });
      return;
    }
    const rows = cl.subjects!.map((s, i) => [{ text: `📖 ${s}`, callback_data: `ctps:${classId}:${i}` }]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await editTo(`📄 <b>Ish reja joylashtirish</b> — ${escapeHtml(cl.className)}\n\n2️⃣ Fanni tanlang:`, kb(rows));
    return;
  }
  if (/^ctps:\d+:\d+$/.test(data)) {
    const [classId, subjIdxS] = data.slice(5).split(":");
    const opts = await withSession(user, (s) => fetchPlanImportOptions(s, { groupId: classId })).catch(
      () => ({ periods: [] as PlanOption[], subgroups: [] as PlanOption[] }),
    );
    const periods = planPeriodOptions(opts.periods);
    const rows = periods.map((p, i) => [
      {
        text: `📆 ${p.name}`.slice(0, 60),
        callback_data: `ctpq:${classId}:${subjIdxS}:${i}`,
      },
    ]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await editTo(`📄 <b>Ish reja joylashtirish</b>\n\n3️⃣ O'quv davrini (chorak) tanlang:`, kb(rows));
    return;
  }
  // ctpq:{classId}:{subjIdx}:{pIdx} — chorak tanlandi → guruh yoki fayl
  if (/^ctpq:\d+:\d+:\d+$/.test(data)) {
    const m = data.match(/^ctpq:(\d+):(\d+):(\d+)$/)!;
    const [, classId, subjIdxS, pIdxS] = m;
    const opts = await withSession(user, (s) => fetchPlanImportOptions(s, { groupId: classId })).catch(
      () => ({ periods: [] as PlanOption[], subgroups: [] as PlanOption[] }),
    );
    const subgroups = opts.subgroups.length ? opts.subgroups : [];
    if (subgroups.length > 0) {
      const all: PlanOption[] = [{ value: "", name: "Butun sinf" }, ...subgroups];
      const rows = all.slice(0, 10).map((g, i) => [
        { text: `👥 ${g.name}`.slice(0, 60), callback_data: `ctpsg:${classId}:${subjIdxS}:${pIdxS}:${i}` },
      ]);
      rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
      await editTo(`📄 <b>Ish reja joylashtirish</b>\n\n4️⃣ O'quv guruhini tanlang:`, kb(rows));
      return;
    }
    await db
      .update(botUsers)
      .set({ state: `c:${classId}:${subjIdxS}:${pIdxS}:-1`, updatedAt: new Date() })
      .where(eq(botUsers.telegramId, user.telegramId));
    await editTo(
      `📄 <b>Ish reja joylashtirish</b>\n\n5️⃣ Endi <b>.xls</b> yoki <b>.xlsx</b> faylni shu chatga yuboring.\n\n⏳ <i>Fayl kelganda bot "Iltimos kuting…" deb javob beradi.</i>`,
      kb([[{ text: "❌ Bekor qilish", callback_data: "menu:cancel" }]]),
    );
    return;
  }
  // ctpsg:{classId}:{subjIdx}:{pIdx}:{sgIdx} — guruh tanlandi → fayl
  if (/^ctpsg:\d+:\d+:\d+:\d+$/.test(data)) {
    const m = data.match(/^ctpsg:(\d+):(\d+):(\d+):(\d+)$/)!;
    const [, classId, subjIdxS, pIdxS, sgIdxS] = m;
    await db
      .update(botUsers)
      .set({ state: `c:${classId}:${subjIdxS}:${pIdxS}:${sgIdxS}`, updatedAt: new Date() })
      .where(eq(botUsers.telegramId, user.telegramId));
    await editTo(
      `📄 <b>Ish reja joylashtirish</b>\n\n5️⃣ Endi <b>.xls</b> yoki <b>.xlsx</b> faylni shu chatga yuboring.\n\n⏳ <i>Fayl kelganda bot "Iltimos kuting…" deb javob beradi.</i>`,
      kb([[{ text: "❌ Bekor qilish", callback_data: "menu:cancel" }]]),
    );
    return;
  }
}

/** Maqom berish oqimi: sinf → fan → uy vazifasi sanasi → avtomatik zanjir. */
async function handleMaqomCallback(
  chatId: number,
  user: BotUser,
  data: string,
  editTo: (text: string, markup: ReturnType<typeof kb>) => Promise<void>,
) {
  if (data === "t:maqom") {
    await sendMaqomStart(chatId, user);
    return;
  }
  // maqom:{classId} — fan tanlash
  if (/^maqom:\d+$/.test(data)) {
    const classId = data.slice(6);
    const cl = await classSubjects(user, classId);
    if (!cl) {
      await sendMessage(chatId, "⚠️ Sinf topilmadi.", { replyMarkup: menuFor(user) });
      return;
    }
    const subjects = cl.subjects ?? [];
    if (subjects.length === 0) {
      await sendMessage(chatId, "⚠️ Bu sinf uchun fanlar topilmadi.", { replyMarkup: menuFor(user) });
      return;
    }
    const rows = subjects.map((s, i) => [{ text: `📖 ${s}`, callback_data: `maqoms:${classId}:${i}` }]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await editTo(`📝 <b>Maqom berish</b> — ${escapeHtml(cl.className)}\n\n2️⃣ Fanni tanlang:`, kb(rows));
    return;
  }
  // maqoms:{classId}:{subjIdx} — uy vazifasi sanalari ro'yxati
  if (/^maqoms:\d+:\d+$/.test(data)) {
    const [classId, subjIdxS] = data.slice(7).split(":");
    const cl = await classSubjects(user, classId);
    const subject = cl?.subjects?.[Number(subjIdxS)] ?? "";
    if (!cl || !subject) {
      await sendMessage(chatId, "⚠️ Fan topilmadi.", { replyMarkup: menuFor(user) });
      return;
    }
    const res = await withSession(user, (s) =>
      fetchHomeworkRows(s, {
        schoolId: s.active.schoolId,
        className: cl.className,
        subjectName: subject,
        teacherName: s.fullName,
      }),
    );
    if (res.reason) {
      await sendMessage(chatId, `⚠️ ${escapeHtml(res.reason)}`, { replyMarkup: menuFor(user) });
      return;
    }
    if (res.rows.length === 0) {
      await sendMessage(chatId, "⚠️ Bu fan bo'yicha uy vazifasi topilmadi.", { replyMarkup: menuFor(user) });
      return;
    }
    const rows = res.rows.slice(0, 12).map((r) => [
      {
        text: `${r.maqomDone ? "🟢" : "🔴"} ${r.dateText} — ${r.description.slice(0, 24)}`.slice(0, 62),
        // Diqqat: callback_data ≤ 64 bayt — shuning uchun lessonId kiritilmaydi.
        callback_data: `maqomw:${classId}:${subjIdxS}:${r.workId}`,
      },
    ]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await editTo(
      `📝 <b>Maqom berish</b> — ${escapeHtml(cl.className)} · ${escapeHtml(subject)}\n\n3️⃣ Uy vazifasi sanasini tanlang:\n\n🔴 — maqom berilmagan · 🟢 — yakunlangan`,
      kb(rows),
    );
    return;
  }
  // maqomw:{classId}:{subjIdx}:{workId} — zanjirni bajarish
  if (/^maqomw:\d+:\d+:\d+$/.test(data)) {
    const m = data.match(/^maqomw:(\d+):(\d+):(\d+)$/)!;
    const [, classId, subjIdxS, workId] = m;
    const cl = await classSubjects(user, classId);
    const subject = cl?.subjects?.[Number(subjIdxS)] ?? "";
    const progress = await startProgress(chatId, "Maqom belgilanmoqda");
    try {
      const result = await withSession(user, (s) =>
        setHomeworkMaqom(s, { schoolId: s.active.schoolId, workId }),
      );
      if (result.ok) {
        await finishProgress(chatId, progress, "Maqom");
        await sendMessage(
          chatId,
          `✅ <b>Muvaffaqiyatli!</b>\n\n📝 Uy vazifasi maqomi berildi — <b>Bajarildi</b>\n🏫 ${escapeHtml(cl?.className ?? "")}${subject ? ` · ${escapeHtml(subject)}` : ""}\n\n❓ <b>Maqom berishni davom ettirasizmi?</b>`,
          {
            replyMarkup: kb([
              [{ text: "➡️ Keyingisi", callback_data: `maqoms:${classId}:${subjIdxS}` }],
              [{ text: "❌ Bekor qilish", callback_data: "menu:home" }],
            ]),
          },
        );
      } else {
        await failProgress(chatId, progress, "Maqom");
        await sendMessage(chatId, `❌ <b>Maqomni belgilab bo'lmadi.</b>${adminFailNote(result.reason)}`, {
          replyMarkup: menuFor(user),
        });
      }
    } catch (error) {
      await failProgress(chatId, progress, "Maqom");
      await sendMessage(chatId, `❌ <b>Maqomni belgilab bo'lmadi.</b>${adminFailNote(String(error).slice(0, 120))}`, {
        replyMarkup: menuFor(user),
      });
    }
    return;
  }
}

/** Yuborilgan ish-reja faylini qabul qilish (faqat o'qituvchi, ctp_file holatida). */
async function handleCtpDocument(chatId: number, user: BotUser, message: TelegramMessage) {
  const doc = message.document!;
  const fileName = (doc.file_name ?? "ish-reja").toLowerCase();
  const st = user.state ?? "";
  const m = st.match(/^c:(\d+):(\d+):(\d+):(-?\d+)$/);
  if (!m) return;
  if (!fileName.endsWith(".xls") && !fileName.endsWith(".xlsx")) {
    await sendMessage(chatId, "⚠️ Faqat <b>.xls</b> yoki <b>.xlsx</b> fayl yuboring.", { replyMarkup: menuFor(user) });
    return;
  }
  const [, classId, subjIdxS, pIdxS, sgIdxS] = m;
  const cl = await classSubjects(user, classId);
  const subjectName = cl?.subjects?.[Number(subjIdxS)] ?? "";
  const afterButtons = kb([
    [{ text: "➡️ Davom etish", callback_data: `ctp:${classId}` }],
    [{ text: "❌ Bekor qilish", callback_data: "menu:home" }],
  ]);
  const progress = await startProgress(chatId, "Iltimos kuting…");
  try {
    await sendMessage(chatId, "⏳ <b>Ish reja joylanmoqda…</b>");
    const file = await downloadTelegramFile(doc.file_id);
    if (!file) {
      await failProgress(chatId, progress, "Ish reja");
      await sendMessage(
        chatId,
        `❌ <b>Ish reja joylashtirilmadi.</b>\n\n⚠️ Telegram faylini yuklab bo'lmadi.\n<i>Iltimos, tekshirib qaytadan joylashtiring.</i>${adminFailNote("faylni yuklab bo'lmadi")}`,
        { replyMarkup: afterButtons },
      );
      return;
    }
    const tk = tashkentDayKey();
    const year = Number(tk.slice(0, 4)) + (Number(tk.slice(5, 7)) >= 8 ? 0 : -1);
    const result = await withSession(user, async (s) => {
      const schoolId = s.active.schoolId;
      const subjectId = await resolvePlanSubjectId(s, { schoolId, groupId: classId, subjectName });
      if (!subjectId) return { ok: false, reason: `fan ID topilmadi (${subjectName})` };
      const opts = await fetchPlanImportOptions(s, { groupId: classId });
      const periods = planPeriodOptions(opts.periods);
      const period = periods[Number(pIdxS)]?.value ?? "0";
      const sgIdx = Number(sgIdxS ?? "-1");
      const sgList: PlanOption[] = [{ value: "", name: "Butun sinf" }, ...opts.subgroups];
      const subgroup = sgIdx >= 0 ? sgList[sgIdx]?.value ?? "" : "";
      return importLessonPlan(s, {
        schoolId,
        groupId: classId,
        subjectId,
        subjectName,
        period,
        subgroup,
        year,
        fileName: doc.file_name ?? "ish-reja.xlsx",
        bytes: file.bytes,
      });
    });
    if (result.ok) {
      await finishProgress(chatId, progress, "Ish reja");
      await sendMessage(
        chatId,
        `✅ <b>Muvaffaqiyatli!</b>\n\n📄 Ish reja joylandi (ko'chirib o'tkazildi)\n🏫 ${escapeHtml(cl?.className ?? "")} — 📖 ${escapeHtml(subjectName)}\n📄 ${escapeHtml(doc.file_name ?? "")}\n\n❓ <b>Yangi fan uchun ish reja joylashtirasizmi?</b>`,
        { replyMarkup: afterButtons },
      );
    } else {
      await failProgress(chatId, progress, "Ish reja");
      await sendMessage(
        chatId,
        `❌ <b>Ish reja joylashtirilmadi.</b>\n\n⚠️ ${escapeHtml(result.reason ?? "Noma'lum xato")}\n\n<i>Iltimos, tekshirib qaytadan joylashtiring.</i>${adminFailNote(result.reason)}`,
        { replyMarkup: afterButtons },
      );
    }
  } catch (error) {
    await failProgress(chatId, progress, "Ish reja");
    await sendMessage(
      chatId,
      `❌ <b>Ish reja joylashtirilmadi.</b>\n\n<i>Iltimos, tekshirib qaytadan joylashtiring.</i>${adminFailNote(String(error).slice(0, 120))}`,
      { replyMarkup: afterButtons },
    );
  } finally {
    await db
      .update(botUsers)
      .set({ state: "idle", updatedAt: new Date() })
      .where(eq(botUsers.telegramId, user.telegramId));
  }
}

/** Sinf rahbari bo'lgan sinf (haqiqiy sinf rahbarligi — TEACHERV2 isClassTeacher). */
async function homeroomClass(user: BotUser): Promise<ClassLink | null> {
  const classes = await withSession(user, (s) => getTeacherClasses(user, s)).catch(() => [] as ClassLink[]);
  return classes.find((c) => c.isClassTeacher === true) ?? null;
}

/** Sinf kabinetini ochadi — faqat sinf rahbari sinflari uchun. */
async function openClassCabinet(chatId: number, user: BotUser) {
  const all = await withSession(user, (s) => getTeacherClasses(user, s)).catch(() => [] as ClassLink[]);
  const classes = all.filter((c) => c.isClassTeacher === true);
  if (classes.length === 0) {
    const taught = all.map((c) => escapeHtml(c.className)).join(", ") || "—";
    await sendMessage(
      chatId,
      `🏫 <b>Sinf kabineti topilmadi.</b>\n\n` +
        `Siz hozircha hech bir sinfning rahbari emassiz.\n` +
        `Dars o'tadigan sinflaringiz: ${taught}\n\n` +
        `<i>Sinf kabineti faqat sinf rahbariga biriktirilgan sinf uchun ochiladi.</i>`,
      { replyMarkup: menuFor(user) },
    );
    return;
  }
  if (classes.length === 1) {
    await sendClassCabinet(chatId, user, classes[0].classId);
    return;
  }
  await sendMessage(
    chatId,
    `🏫 <b>Sinfni tanlang:</b>`,
    {
      replyMarkup: kb([
        ...classes.map((c) => [{ text: `🏫 ${c.className}`, callback_data: `cabsel:${c.classId}` }]),
        [{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }],
      ]),
    },
  );
}

// Sinf IDlari qisqa/uzun formatda bo'lishi mumkin — bir-birining ichida bo'lsa mos.
function classIdMatch(a: string | null | undefined, b: string): boolean {
  if (!a) return true;
  return a === b || a.includes(b) || b.includes(a);
}

interface TeacherWeekResult {
  days: DaySchedule[];
  missing: string[];
}

/**
 * Haqiqiy dars jadvalini yig'adi.
 * Manba: sinf a'zolarining (biriktirilgan login/parol) eMaktab diary'si —
 * u yerda darslar SOAT va FAN bilan keladi. Sinflar TEACHERV2 (guruhlar +
 * jurnal yozuvlari) va "Mening sinflarim" dan YIG'ILADI — hech biri tushib
 * qolmaydi. Fan nomlari erkin moslashtiriladi, soatlar FAQAT diary'dan.
 */
async function buildTeacherWeek(user: BotUser, fromDay: string, toDay: string): Promise<TeacherWeekResult> {
  // To'liq o'qituvchi yuklamasi (keshsiz, jonli).
  let classes = await withSession(user, async (s) => {
    const groups = await fetchTeacherGroups(s);
    const list: ClassLink[] = groups.map((g) => ({
      classId: g.classId,
      className: g.className,
      isClassTeacher: g.isClassTeacher,
      subjects: g.subjects,
    }));
    const known = (id: string) => list.some((c) => classIdMatch(c.classId, id));
    for (const c of await fetchTeacherClasses(s).catch(() => [] as ClassLink[])) {
      if (!known(c.classId)) list.push({ ...c, subjects: [] });
    }
    return list;
  }).catch(() => [] as ClassLink[]);
  if (classes.length === 0) {
    classes = await withSession(user, (s) => getTeacherClasses(user, s)).catch(() => [] as ClassLink[]);
  }

  const merged = new Map<string, DaySchedule>();
  const missing: string[] = [];
  const globalSubjects = [...new Set(classes.flatMap((c) => c.subjects ?? []))];

  const saved = await db
    .select()
    .from(memberAccounts)
    .where(eq(memberAccounts.teacherTelegramId, user.telegramId));

  for (const cl of classes) {
    const subjects = (cl.subjects ?? []).length > 0 ? cl.subjects! : globalSubjects;
    const candidates = saved
      .filter((s) => classIdMatch(s.classId, cl.classId) && s.emaktabLogin && s.emaktabPasswordEnc)
      .sort((a, b) => (a.kind === "student" ? 0 : 1) - (b.kind === "student" ? 0 : 1))
      .slice(0, 4);

    // Bir nechta ishlaydigan a'zodan kunlar kesimida yig'amiz (bo'sh kunlar to'lsin).
    const perDate = new Map<string, { weekday: number; byKey: Map<string, Lesson> }>();
    let gotData = false;
    for (const acc of candidates) {
      try {
        const password = decryptSecret(acc.emaktabPasswordEnc!);
        const res = await loginEmaktab(acc.emaktabLogin!, password);
        if (res.status !== "ok") continue;
        const diaryDays = await fetchDiaryDays(res.session, fromDay, toDay);
        const sched = scheduleFromDiaryDays(diaryDays);
        if (sched.length === 0) {
          gotData = true; // kirildi, lekin kunlar bo'sh
          continue;
        }
        gotData = true;
        for (const day of sched) {
          let slot = perDate.get(day.date);
          if (!slot) {
            slot = { weekday: day.weekday, byKey: new Map() };
            perDate.set(day.date, slot);
          }
          for (const l of day.lessons) {
            const key = `${l.number}|${l.subject}|${l.startTime ?? ""}`;
            if (!slot.byKey.has(key)) slot.byKey.set(key, l);
          }
        }
      } catch {
        // keyingi a'zo bilan davom
      }
    }
    if (!gotData) missing.push(cl.className);

    // Saralash: avval smena aralashuvi + duplikatlar tozalanadi, keyin fan/ism mosligi.
    const rawDays = [...perDate.entries()].map(([date, slot]) => ({
      date,
      weekday: slot.weekday,
      lessons: dedupeShiftLessons([...slot.byKey.values()]),
    }));
    const anyTeacherInfo = rawDays.some((d) => d.lessons.some((l) => (l.teacher ?? "").trim().length > 0));
    let kept = 0;
    for (const day of rawDays) {
      for (const l of day.lessons) {
        const ok = lessonMatchesTeacherLoad(l.subject, l.teacher, subjects, user.fullName ?? "");
        // Fan ham, ism ham yo'q — tekshirib bo'lmaydi: faqat umuman ism yo'q bo'lsa saqlaymiz.
        const unverified = !ok && subjects.length === 0 && !anyTeacherInfo && (l.teacher ?? "").trim().length === 0;
        if (!ok && !unverified) continue;
        kept++;
        const existing = merged.get(day.date);
        if (existing) {
          existing.lessons.push({ ...l, groupName: cl.className });
        } else {
          merged.set(day.date, {
            date: day.date,
            weekday: day.weekday,
            lessons: [{ ...l, groupName: cl.className }],
          });
        }
      }
    }
    void kept;
  }

  const days = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) d.lessons.sort((a, b) => (a.number || 99) - (b.number || 99));
  return { days, missing };
}

async function sendTeacherWeekView(chatId: number, user: BotUser) {
  const progress = await startProgress(chatId, "Haftalik jadval yuklanmoqda");
  try {
    const today = tashkentDayKey();
    const dow = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7; // 0 = Dushanba
    const fromDay = shiftDayKey(today, -dow);
    const toDay = shiftDayKey(fromDay, 6);
    const { days, missing } = await buildTeacherWeek(user, fromDay, toDay);
    const text = formatTeacherWeek(days, fromDay, toDay, personLabel(user), missing);
    await finishProgress(chatId, progress, "Haftalik jadval");
    await sendLong(chatId, text, teacherDayKeyboard());
  } catch (error) {
    await failProgress(chatId, progress, "Haftalik jadval");
    await sendEmaktabError(chatId, user, error);
  }
}

async function sendTeacherDayView(chatId: number, user: BotUser, dayShift: number) {
  const progress = await startProgress(chatId, "Darslar yuklanmoqda");
  try {
    const dayKey = shiftDayKey(tashkentDayKey(), dayShift);
    // Faqat shu kun — keyingi kun ma'lumoti aralashib ketmasin (duplikat manbai).
    const { days, missing } = await buildTeacherWeek(user, dayKey, dayKey);
    const day = days.find((d) => d.date === dayKey);
    const lessons = day?.lessons ?? [];
    const title = dayShift === 0 ? "Bugungi darslaringiz" : "Ertangi darslaringiz";
    let text = formatTeacherDay(lessons, dayKey, title, personLabel(user));
    if (lessons.length === 0 && missing.length > 0) {
      text +=
        `\n\n💡 <i>${missing.map((c) => escapeHtml(c)).join(", ")} uchun ma'lumot olinmadi — ` +
        `“⚡ Barchani tekshirish” orqali sinf a'zolarini faollashtirsangiz, darslar avtomatik chiqadi.</i>`;
    }
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

    // 1. Bazada saqlangan (biriktirilgan) login/parollar.
    const savedAll = await db
      .select()
      .from(memberAccounts)
      .where(and(eq(memberAccounts.teacherTelegramId, user.telegramId), eq(memberAccounts.kind, kind)));
    const saved = savedAll.filter((s) => !s.classId || s.classId === classId);
    const savedByMember = new Map(saved.filter((s) => s.memberId).map((s) => [s.memberId as string, s]));

    const okNames: string[] = [];
    const failMembers: Array<{ memberId: string; fullName: string; reason: string }> = [];
    const doneMembers = new Set<string>();
    const triedLogins = new Set<string>();

    let processed = 0;
    const total = members.length;

    const step = async () => {
      processed++;
      await updateProgress(
        chatId,
        progress,
        `⏳ <b>${escapeHtml(kindLabel)} faollashtirilmoqda...</b>\n${processed}/${total}\n\n<i>Iltimos kuting...</i>`,
      );
    };

    // 2. Har bir a'zo: avval biriktirilgan login/parol bilan kirib ko'ramiz.
    for (const m of members) {
      await step();
      const acc = savedByMember.get(m.memberId);
      if (acc?.emaktabLogin && acc.emaktabPasswordEnc) {
        triedLogins.add(acc.emaktabLogin);
        try {
          const password = decryptSecret(acc.emaktabPasswordEnc);
          const res = await loginEmaktab(acc.emaktabLogin, password);
          if (res.status === "ok") {
            okNames.push(m.fullName);
            doneMembers.add(m.memberId);
            await db
              .update(memberAccounts)
              .set({ activatedAt: new Date(), updatedAt: new Date() })
              .where(eq(memberAccounts.id, acc.id));
            continue;
          }
          failMembers.push({
            memberId: m.memberId,
            fullName: m.fullName,
            reason: res.status === "invalid_credentials" ? "login/parol ishlamayapti" : "kirib bo'lmadi",
          });
        } catch (error) {
          failMembers.push({
            memberId: m.memberId,
            fullName: m.fullName,
            reason: error instanceof Error ? error.message.slice(0, 40) : "xatolik",
          });
        }
        continue;
      }
      // Biriktirilgan login yo'q — keyin (3-bosqichda) eMaktab sahifasidagi
      // ochiq login/parollar bilan urinamiz; bo'lmasa "biriktirish" taklif qilamiz.
    }

    // 3. eMaktab sahifasidagi ochiq login/parollar bilan yangi akkauntlar.
    for (const cred of info.credentials) {
      if (triedLogins.has(cred.login)) continue;
      triedLogins.add(cred.login);
      await step();
      try {
        const res = await loginEmaktab(cred.login, cred.password);
        if (res.status === "ok") {
          const name = res.session.fullName || cred.login;
          const matched = members.find((m) => normalizeName(m.fullName) === normalizeName(name));
          if (matched) {
            okNames.push(matched.fullName);
            doneMembers.add(matched.memberId);
          } else {
            okNames.push(name);
          }
          const existing = matched
            ? await db
                .select()
                .from(memberAccounts)
                .where(
                  and(
                    eq(memberAccounts.teacherTelegramId, user.telegramId),
                    eq(memberAccounts.kind, kind),
                    eq(memberAccounts.memberId, matched.memberId),
                  ),
                )
            : [];
          if (existing.length > 0) {
            await db
              .update(memberAccounts)
              .set({
                emaktabLogin: cred.login,
                emaktabPasswordEnc: encryptSecret(cred.password),
                fullName: name,
                activatedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(memberAccounts.id, existing[0].id));
          } else {
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
          }
        }
      } catch (error) {
        // bir xato — davom etamiz
        void error;
      }
    }

    // 4. Hali kira olmaganlar: ular uchun "login-parol biriktiring" tugmalari.
    for (const m of members) {
      if (!doneMembers.has(m.memberId)) {
        const already = failMembers.find((f) => f.memberId === m.memberId);
        if (!already) {
          failMembers.push({ memberId: m.memberId, fullName: m.fullName, reason: "login/parol topilmadi" });
        }
      }
    }

    const allDone = members.length > 0 && failMembers.length === 0;
    const report = formatActivationReport(kindLabel, okNames, failMembers, members.length);
    await finishProgress(chatId, progress, `${kindLabel} faollashtirish`);

    // Kirilmaganlar ostida "🔑 Login-parol biriktiring" tugmalari.
    const kindCode = kind === "parent" ? "p" : "s";
    const actCallback = kind === "parent" ? `cab:act_parents:${classId}` : `cab:act_students:${classId}`;
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (const f of failMembers.slice(0, 30)) {
      rows.push([
        {
          text: `🔑 ${f.fullName.slice(0, 40)} — Login-parol biriktiring`,
          callback_data: `ma:${kindCode}:${classId}:${f.memberId}`,
        },
      ]);
    }
    rows.push([{ text: "🔁 Qaytadan tekshirish", callback_data: actCallback }]);
    rows.push([{ text: "⬅️ Sinf kabineti", callback_data: `cab:refresh:${classId}` }]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await sendLong(chatId, report, kb(rows));
    void allDone;
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

  // --- Darsni o'tildi qilish / Ish reja / Maqom oqimlari (o'qituvchi) ---
  if (
    data === "t:conduct" ||
    data === "t:ctp" ||
    data === "t:maqom" ||
    data.startsWith("cond") ||
    data.startsWith("ctp") ||
    data.startsWith("maqom")
  ) {
    const editTo = async (text: string, markup: ReturnType<typeof kb>) => {
      if (messageId) await editMessageText(chatId, messageId, text, { replyMarkup: markup });
      else await sendMessage(chatId, text, { replyMarkup: markup });
    };
    if (data === "t:maqom" || data.startsWith("maqom")) {
      await handleMaqomCallback(chatId, fresh, data, editTo);
    } else {
      await handleConductCallback(chatId, fresh, data, editTo);
    }
    return;
  }

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
  if (data === "t:week") {
    await sendTeacherWeekView(chatId, fresh);
    return;
  }
  if (data === "profile") {
    await sendProfileView(chatId, fresh);
    return;
  }

  if (data === "cab:open") {
    await openClassCabinet(chatId, fresh);
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

  if (data.startsWith("ma:")) {
    // Login-parol biriktirish: ma:{s|p}:{classId}:{memberId}
    const parts = data.split(":");
    const kind: "student" | "parent" = parts[1] === "p" ? "parent" : "student";
    const classId = parts[2] ?? "";
    const memberId = parts[3] ?? "";
    let memberName = "a'zo";
    try {
      const info = await getClassInfo(fresh, classId);
      const members = kind === "student" ? info.students : info.parents;
      memberName = members.find((m) => m.memberId === memberId)?.fullName ?? memberName;
    } catch {
      // ism topilmasa — umumiy nom bilan davom etamiz
    }
    await db
      .update(botUsers)
      .set({
        state: "m_attach_login",
        tempLogin: null,
        tempSessionEnc: encryptSecret(JSON.stringify({ kind, classId, memberId, name: memberName })),
        updatedAt: new Date(),
      })
      .where(eq(botUsers.telegramId, fresh.telegramId));
    await showView(
      cb,
      `🔑 <b>${escapeHtml(memberName)}</b> uchun eMaktab <b>login</b>ini yuboring:\n\n` +
        `<i>Keyin parolni kiritasiz. Ular shifrlanib saqlanadi va keyingi faollashtirishda avtomatik ishlatiladi.</i>`,
      cancelKeyboard(),
    );
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
    if (children.length > 0 || fresh.role === "parent") {
      rows.push([{ text: "👶 Bolalar", callback_data: "settings:children" }]);
    }
    rows.push([{ text: "🔄 Login/parolni yangilash", callback_data: "settings:relogin" }]);
    rows.push([{ text: "🚪 Chiqish (Logout)", callback_data: "settings:logout" }]);
    rows.push([{ text: "🏠 Asosiy menyu", callback_data: "menu:home" }]);
    await showView(cb, formatAccount(fresh), kb(rows));
    return;
  }

  if (data === "settings:children") {
    const children = parseChildren(fresh);
    if (children.length === 0) {
      await showView(
        cb,
        "👶 <b>Bolalar</b>\n\nBu akkauntga hozircha farzand bog'lanmagan.\n\n" +
          "eMaktabdan kirib, farzand bog'langanda bu yerda avtomatik ko'rinadi.",
        settingsKeyboard(),
      );
      return;
    }
    const rows = children.map((c, i) => [
      {
        text: `👶 ${c.fullName || c.personId}${c.personId === fresh.personId ? " ✅" : ""}`,
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

  // --- Farzandni tanlash (ota-onalar uchun) ---
  if (data.startsWith("child:")) {
    const idx = Number(data.slice("child:".length));
    const children = parseChildren(fresh);
    const selected = children[idx];
    if (!selected) {
      await sendMessage(chatId, "⚠️ Farzand topilmadi.", { replyMarkup: menuFor(fresh) });
      return;
    }
    invalidateSession(cb.from.id);
    // Faol farzand konteksti almashtiriladi — ota-ona ismi O'ZGARMAYDI (aralashtirmaslik uchun).
    await db
      .update(botUsers)
      .set({
        personId: selected.personId,
        schoolId: selected.schoolId,
        groupId: selected.groupId,
        schoolName: selected.schoolName,
        groupName: selected.groupName,
        updatedAt: new Date(),
      })
      .where(eq(botUsers.telegramId, cb.from.id));
    const updated = (await getUser(cb.from.id)) ?? fresh;
    await sendMessage(
      chatId,
      `👶 <b>${escapeHtml(selected.fullName)}</b> — ${escapeHtml(selected.groupName || "")} tanlandi.`,
    );
    await sendChildOverview(chatId, updated, selected);
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
