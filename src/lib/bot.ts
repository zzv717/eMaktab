import { eq } from "drizzle-orm";
import { db } from "@/db";
import { botUsers, loginTokens } from "@/db/schema";
import { decryptSecret, encryptSecret, generateToken } from "@/lib/crypto";
import { verifyEmaktabCredentials } from "@/lib/emaktab";
import {
  answerCallbackQuery,
  deleteMessage,
  kb,
  sendMessage,
  studentKeyboard,
  teacherKeyboard,
  classLeaderKeyboard,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
} from "@/lib/telegram";

const TOKEN_TTL_MS = 90 * 1000; // one-click link is valid for 90 seconds

function appUrl(): string {
  const url = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error("APP_URL (or NEXT_PUBLIC_APP_URL) must be set to build the one-click login link");
  }
  return url.replace(/\/+$/, "");
}

async function getOrCreateUser(message: TelegramMessage | undefined, from: { id: number; username?: string; first_name: string }) {
  const chatId = message?.chat.id ?? from.id;
  const existing = await db.query.botUsers.findFirst({ where: eq(botUsers.telegramId, from.id) });
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

function mainMenu(connected: boolean) {
  return kb(
    connected
      ? [
          [{ text: "🔓 eMaktabga kirish", callback_data: "open_emaktab" }],
          [{ text: "🔁 Login/parolni yangilash", callback_data: "connect" }],
          [{ text: "🚪 Ulanishni uzish", callback_data: "logout" }],
        ]
      : [[{ text: "🔐 eMaktabni ulash", callback_data: "connect" }]],
  );
}

const WELCOME = `Salom! 👋

Men <b>eMaktab</b> (kundalik.com) uchun yordamchi botman.

Qanday ishlaydi:
1️⃣ Login va parolingizni menga <b>bir marta</b> yuborasiz (men ularni shifrlab saqlayman).
2️⃣ Keyingi safarlarda esa shunchaki menyu tugmalaridan foydalanasiz.

Boshlash uchun pastdagi tugmani bosing 👇`;

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

  if (text === "/start" || text === "/help") {
    await resetState(from.id);
    await sendMessage(
      message.chat.id,
      `🤖 <b>Avto eMaktab botidan foydalanish bo'yicha qo'llanma:</b>\n\n` +
      `1️⃣ *Kirish:* /login buyrug'i orqali eMaktab (kundalik.com) login va parolingizni kiriting.\n` +
      `2️⃣ *Baholar:* Asosiy menyudagi "Baholar" tugmasini bosib joriy baholaringizni ko'ring.\n` +
      `3️⃣ *Dars jadvali:* Kunlik darslar jadvalini kuzatib boring.\n\n` +
      WELCOME,
      { replyMarkup: mainMenu(Boolean(user.emaktabLogin)) }
    );
    return;
  }

  if (text === "/cancel") {
    await resetState(from.id);
    await sendMessage(message.chat.id, "Bekor qilindi.", { replyMarkup: mainMenu(Boolean(user.emaktabLogin)) });
    return;
  }

  if (text === "/logout") {
    await logoutUser(from.id);
    await sendMessage(message.chat.id, "Ulanish o'chirildi. Login va parolingiz bazadan o'chirildi.", {
      replyMarkup: mainMenu(false),
    });
    return;
  }

  if (text === "/login") {
    await startLoginFlow(from.id, message.chat.id);
    return;
  }

  if (text === "/status") {
    await sendMessage(
      message.chat.id,
      user.emaktabLogin
        ? `✅ Ulangan. eMaktab login: <code>${escapeHtml(user.emaktabLogin)}</code>`
        : "❌ Hali ulanmagansiz. /login buyrug'ini yuboring.",
      { replyMarkup: mainMenu(Boolean(user.emaktabLogin)) },
    );
    return;
  }

  // --- TUGMALAR VA MENYU BUYruqlari ---
  if (text === "📅 Dars jadvali" || text === "/schedule") {
    await sendMessage(message.chat.id, "📅 <b>Bugungi dars jadvali:</b>\n\n1. Matematika (08:30)\n2. Ona tili (09:20)\n3. Ingliz tili (10:10)\n4. Fizika (11:00)");
    return;
  }

  if (text === "📊 Baholar" || text === "/grades") {
    await sendMessage(message.chat.id, "📊 <b>Bugungi baholaringiz:</b>\n\n* Matematika: <b>5</b> (Uyga vazifa uchun)\n* Ona tili: <b>4</b> (Darsda faol qatnashgani uchun)");
    return;
  }

  if (text === "📚 Darslar" || text === "/myclasses") {
    await sendMessage(message.chat.id, "📚 <b>Bugungi darslaringiz (O'qituvchi):</b>\n\n* 2-soat: 9-'A' sinf (Matematika)\n* 3-soat: 9-'B' sinf (Geometriya)");
    return;
  }

  if (text === "🎓 Sinf rahbari") {
    await sendMessage(message.chat.id, "🎓 <b>Sinf rahbariyati paneli:</b>\nKerakli bo'limni tanlang:", {
      replyMarkup: classLeaderKeyboard
    });
    return;
  }

  if (text === "🔙 Orqaga") {
    await sendMessage(message.chat.id, "Asosiy menyuga qaytdingiz:", { replyMarkup: teacherKeyboard });
    return;
  }

  if (text === "👨‍🎓 O'quvchilar ro'yxati") {
    await sendMessage(message.chat.id, "👨‍🎓 <b>Sinf o'quvchilari ro'yxati:</b>\n\n1. Aliyev Anvar - 9-'A'\n2. Karimova Malika - 9-'A'\n3. Toshmatov Bekzod - 9-'A'");
    return;
  }

  if (text === "👥 Ota-onalar ro'yxati") {
    await sendMessage(message.chat.id, "👥 <b>Ota-onalar ro'yxati:</b>\n\n1. Aliyev Ota (Tel: +998901234567)\n2. Karimova Ona (Tel: +998939876543)");
    return;
  }

  if (text === "👥 Sinfim faolligi") {
    await sendMessage(message.chat.id, "📊 <b>Sinfim faolligi:</b>\n\nO'rtacha o'zlashtirish: <b>4.2</b>\nDavomat: <b>95%</b>");
    return;
  }

  if (text === "📖 Qo'llanma") {
    await sendMessage(message.chat.id, "📖 <b>Qo'llanma:</b>\n\nBu bot orqali siz eMaktab (kundalik.com) tizimidagi baholaringiz, dars jadvalingiz va o'quvchilar ro'yxatini to'g'ridan-to'g'ri Telegram chatida ko'rishingiz mumkin.");
    return;
  }

  if (text === "👤 Akkount") {
    await sendMessage(message.chat.id, `👤 <b>Sizning akkountingiz:</b>\n\nTelegram ID: <code>${from.id}</code>\nIsm: ${from.first_name}`);
    return;
  }

  if (text === "👨‍💻 Admin bilan bog'lanish") {
    await sendMessage(message.chat.id, "👨‍💻 Muammolar bo'yicha adminga murojaat qiling: @admin_username");
    return;
  }

  // --- LOGIN VA PAROL YIG'ISH JARAYONI (STATE MACHINE) ---
  if (user.state === "awaiting_login") {
    if (!text) {
      await sendMessage(message.chat.id, "Iltimos, eMaktab loginingizni matn sifatida yuboring.");
      return;
    }
    await db
      .update(botUsers)
      .set({ tempLogin: text, state: "awaiting_password", updatedAt: new Date() })
      .where(eq(botUsers.telegramId, from.id));
    await sendMessage(
      message.chat.id,
      "Endi eMaktab <b>parolingizni</b> yuboring.\n\n🔒 Xavfsizlik uchun bu xabar yuborilgandan so'ng darhol chatdan o'chirib tashlanadi.",
    );
    return;
  }

  if (user.state === "awaiting_password") {
    const login = user.tempLogin;
    await deleteMessage(message.chat.id, message.message_id);

    if (!login) {
      await resetState(from.id);
      await sendMessage(message.chat.id, "Xatolik yuz berdi, qaytadan boshlang: /login");
      return;
    }

    const password = text;
    await sendMessage(message.chat.id, "⏳ eMaktab bilan tekshirilmoqda...");

    const result = await verifyEmaktabCredentials(login, password);

    if (result.status === "ok") {
      // Rolni aniqlash (Hozircha sinov uchun teacher, keyinchalik API natijasiga ko'ra o'zgaradi)
      const userRole: 'student' | 'teacher' = 'teacher'; 

      await db
        .update(botUsers)
        .set({
          emaktabLogin: login,
          emaktabPasswordEnc: encryptSecret(password),
          tempLogin: null,
          state: "idle",
          connectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(botUsers.telegramId, from.id));

      const replyMarkup = userRole === 'teacher' ? teacherKeyboard : studentKeyboard;
      const welcomeText = userRole === 'teacher' 
        ? `✨ Xush kelibsiz, ustoz!\n\nO'qituvchi paneliga xush kelibsiz.` 
        : `✨ Xush kelibsiz, hurmatli o'quvchi!\n\nKerakli bo'limni tanlang:`;

      await sendMessage(message.chat.id, welcomeText, { replyMarkup });
      return;
    }

    if (result.status === "invalid_credentials") {
      await db
        .update(botUsers)
        .set({ state: "awaiting_login", tempLogin: null, updatedAt: new Date() })
        .where(eq(botUsers.telegramId, from.id));
      await sendMessage(
        message.chat.id,
        `❌ ${result.message}\n\nQaytadan eMaktab loginingizni yuboring (yoki /cancel bilan bekor qiling).`,
      );
      return;
    }

    await db.update(botUsers).set({ state: "idle", tempLogin: null, updatedAt: new Date() }).where(eq(botUsers.telegramId, from.id));
    await sendMessage(message.chat.id, `⚠️ ${result.message}`, { replyMarkup: mainMenu(Boolean(user.emaktabLogin)) });
    return;
  }

  // Default fallback.
  await sendMessage(message.chat.id, "Buyruqni tushunmadim. /start ni bosing.", {
    replyMarkup: mainMenu(Boolean(user.emaktabLogin)),
  });
}

async function handleCallback(cb: TelegramCallbackQuery) {
  const chatId = cb.message?.chat.id;
  if (!chatId) return;

  const user = await getOrCreateUser(cb.message, cb.from);

  if (cb.data === "connect") {
    await answerCallbackQuery(cb.id);
    await startLoginFlow(cb.from.id, chatId);
    return;
  }

  if (cb.data === "logout") {
    await logoutUser(cb.from.id);
    await answerCallbackQuery(cb.id, "Ulanish o'chirildi");
    await sendMessage(chatId, "Ulanish o'chirildi. Login va parolingiz bazadan o'chirildi.", {
      replyMarkup: mainMenu(false),
    });
    return;
  }

  if (cb.data === "open_emaktab") {
    if (!user.emaktabLogin || !user.emaktabPasswordEnc) {
      await answerCallbackQuery(cb.id, "Avval hisobingizni ulang", true);
      await sendMessage(chatId, "Hali ulanmagansiz. Pastdagi tugma orqali ulang:", {
        replyMarkup: mainMenu(false),
      });
      return;
    }

    const token = generateToken(24);
    await db.insert(loginTokens).values({
      token,
      telegramId: cb.from.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    await answerCallbackQuery(cb.id);
    await sendMessage(chatId, "👇 90 soniya ichida tugmani bosing — brauzeringiz avtomatik eMaktabga kiradi:", {
      replyMarkup: kb([[{ text: "🔓 eMaktabga kirish", url: `${appUrl()}/e/${token}` }]]),
    });
    return;
  }

  await answerCallbackQuery(cb.id);
}

async function startLoginFlow(telegramId: number, chatId: number) {
  await db
    .update(botUsers)
    .set({ state: "awaiting_login", tempLogin: null, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
  await sendMessage(chatId, "eMaktab (kundalik.com) <b>loginingizni</b> yuboring:");
}

async function resetState(telegramId: number) {
  await db
    .update(botUsers)
    .set({ state: "idle", tempLogin: null, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, telegramId));
}

async function logoutUser(telegramId: number) {
  await db
    .update(botUsers)
    .set({
      state: "idle",
      tempLogin: null,
      emaktabLogin: null,
      emaktabPasswordEnc: null,
      connectedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(botUsers.telegramId, telegramId));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export async function consumeLoginToken(token: string) {
  const row = await db.query.loginTokens.findFirst({ where: eq(loginTokens.token, token) });
  if (!row || row.used || row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  await db.update(loginTokens).set({ used: true }).where(eq(loginTokens.token, token));

  const user = await db.query.botUsers.findFirst({ where: eq(botUsers.telegramId, row.telegramId) });
  if (!user?.emaktabLogin || !user.emaktabPasswordEnc) {
    return null;
  }

  return {
    login: user.emaktabLogin,
    password: decryptSecret(user.emaktabPasswordEnc),
  };
}