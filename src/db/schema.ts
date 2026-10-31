import {
  bigint,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// One row per Telegram user who has talked to the bot.
// Stores the conversation state (for the simple step-by-step login flow)
// and, once connected, the eMaktab credentials (password is encrypted, never stored in plain text).
//
// NOTE: eMaktab entity IDs (personId/schoolId/groupId) are 19+ digit numbers that exceed
// JavaScript's Number.MAX_SAFE_INTEGER, so they are stored as strings.
export const botUsers = pgTable("bot_users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),

  // Conversation state machine: idle | awaiting_login | awaiting_password
  state: varchar("state", { length: 32 }).notNull().default("idle"),
  tempLogin: varchar("temp_login", { length: 255 }),
  // Captcha oqimi uchun vaqtinchalik (shifrlangan): parol + forma holati
  tempPasswordEnc: text("temp_password_enc"),
  tempSessionEnc: text("temp_session_enc"),

  // eMaktab account, saved only after credentials are verified successfully.
  emaktabLogin: varchar("emaktab_login", { length: 255 }),
  emaktabPasswordEnc: text("emaktab_password_enc"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),

  // Profile snapshot fetched from eMaktab right after a successful login.
  // Used to address API calls (personId/schoolId/groupId) and to greet the user.
  fullName: varchar("full_name", { length: 255 }),
  role: varchar("role", { length: 32 }), // student | parent | teacher
  emaktabUserId: varchar("emaktab_user_id", { length: 32 }),
  personId: varchar("person_id", { length: 32 }),
  schoolId: varchar("school_id", { length: 32 }),
  groupId: varchar("group_id", { length: 32 }),
  schoolName: varchar("school_name", { length: 255 }),
  groupName: varchar("group_name", { length: 64 }),

  // For parent accounts with several children: JSON array of
  // [{ personId, schoolId, groupId, fullName, schoolName, groupName }, ...]
  // The active child's values are duplicated into the columns above.
  childrenJson: text("children_json"),

  // For teachers: JSON array of taught classes [{ classId, className }, ...]
  classesJson: text("classes_json"),

  // eMaktab cookie'lari (shifrlangan) — qayta login qilmaslik uchun
  sessionEnc: text("session_enc"),

  // 💎 Pro (pullik) tarif: free | pro. planUntil — amal qilish muddati (null = cheksiz).
  plan: varchar("plan", { length: 16 }).notNull().default("free"),
  planUntil: timestamp("plan_until", { withTimezone: true }),
  // Oxirgi faollik (admin statistikasi uchun) — har bir xabar/kallbackda yangilanadi.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // Admin oqimlari uchun vaqtinchalik matn (masalan e'lon qoralamasi).
  tempText: text("temp_text"),
  // Tizim boshqaruvi sessiyasi (maxfiy login+parol+2FA orqali beriladi) — "no" | "yes"
  sysAdmin: varchar("sys_admin", { length: 8 }).notNull().default("no"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// eMaktab credentials of class members (students/parents), saved by a class teacher
// after the "faollashtirish" (activation) flow so the teacher can re-activate
// or verify accounts again later. Passwords are AES-256-GCM encrypted (ENCRYPTION_KEY).
export const memberAccounts = pgTable("member_accounts", {
  id: serial("id").primaryKey(),
  teacherTelegramId: bigint("teacher_telegram_id", { mode: "number" }).notNull(),
  classId: varchar("class_id", { length: 32 }),
  // eMaktab user id of the member (from schools.emaktab.uz user?user=NNN links)
  memberId: varchar("member_id", { length: 32 }),
  kind: varchar("kind", { length: 16 }).notNull(), // student | parent
  fullName: varchar("full_name", { length: 255 }),
  emaktabLogin: varchar("emaktab_login", { length: 255 }),
  emaktabPasswordEnc: text("emaktab_password_enc"),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Bot yuborgan xabarlar — yangi so'rov boshlanganda oldingi so'rov xabarlarini
// avtomatik o'chirish uchun kuzatiladi (har bir xabar o'z "flow" tegiga ega).
export const botMessages = pgTable("bot_messages", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  messageId: bigint("message_id", { mode: "number" }).notNull(),
  flow: varchar("flow", { length: 40 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 💎 Pro to'lovlari — foydalanuvchi chek yuboradi, admin tasdiqlaydi (yoki rad etadi).
// Soxta cheklarga qarshi: receipt_unique_id (Telegram fayl) va receipt_ref
// (tranzaksiya raqami) bo'yicha takrorlanish tekshiriladi.
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  // tanlangan tarif: 1m | 3m | 1y
  plan: varchar("plan", { length: 16 }).notNull(),
  // kutilayotgan summa (so'm) — tanlangan tarif narxi
  amount: bigint("amount", { mode: "number" }),
  // draft (chek kutilmoqda) | pending (admin tasdiqlashini kutmoqda) | approved | rejected
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  receiptFileId: text("receipt_file_id"),
  receiptUniqueId: text("receipt_unique_id"),
  receiptRef: varchar("receipt_ref", { length: 64 }),
  adminNote: varchar("admin_note", { length: 255 }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 👁 Nazoratchi — ota-ona va bola telefonlarini ulash, avtomatik xabarlar,
// repetitor/kutubxona testlari. Ulanishni FAQAT ota-ona uzadi (bola o'chira olmaydi).
export const nazoratchiLinks = pgTable("nazoratchi_links", {
  id: serial("id").primaryKey(),
  parentTelegramId: bigint("parent_telegram_id", { mode: "number" }).notNull(),
  childTelegramId: bigint("child_telegram_id", { mode: "number" }).notNull(),
  // bola eMaktab personId (baholar/jadval uchun) — ulash paytida olinadi
  childPersonId: varchar("child_person_id", { length: 32 }),
  childName: varchar("child_name", { length: 255 }),
  childClass: varchar("child_class", { length: 64 }),
  // active | removed (faqat ota-ona yoki admin o'chiradi!)
  status: varchar("status", { length: 16 }).notNull().default("active"),
  // bola botni bloklagan bo'lsa — ogohlantirish uchun
  childBlocked: varchar("child_blocked", { length: 8 }).notNull().default("no"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
});

// Repetitor (yoki qo'shimcha mashg'ulot) sozlamalari — ota-ona kiritadi.
export const nazoratchiTutor = pgTable("nazoratchi_tutor", {
  id: serial("id").primaryKey(),
  linkId: bigint("link_id", { mode: "number" }).notNull(),
  subject: varchar("subject", { length: 64 }).notNull(),
  time: varchar("time", { length: 5 }).notNull(), // HH:MM
  durationMin: bigint("duration_min", { mode: "number" }).notNull().default(60),
  // hafta kunlari: [1,3,5] = Dushanba, Chorshanba, Juma (0=Dushanba)
  days: varchar("days", { length: 32 }).notNull().default("[1,2,3,4,5]"),
  place: varchar("place", { length: 120 }),
  active: varchar("active", { length: 8 }).notNull().default("yes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 📝 AI testlari — kitob yoki mavzu bo'yicha. Ota-onaga JAVOB bilan, bolaga VARIANT.
export const nazoratchiTests = pgTable("nazoratchi_tests", {
  id: serial("id").primaryKey(),
  linkId: bigint("link_id", { mode: "number" }).notNull(),
  childTelegramId: bigint("child_telegram_id", { mode: "number" }).notNull(),
  parentTelegramId: bigint("parent_telegram_id", { mode: "number" }).notNull(),
  mode: varchar("mode", { length: 8 }).notNull(), // book | topic
  source: varchar("source", { length: 255 }), // "Kitob (muallif, betlar)" yoki mavzu
  question: text("question").notNull(),
  options: text("options").notNull(), // JSON ["A","B","C","D"]
  correctIndex: bigint("correct_index", { mode: "number" }).notNull(),
  childAnswer: bigint("child_answer", { mode: "number" }), // tanlangan variant
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  isCorrect: varchar("is_correct", { length: 8 }), // yes | no
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Bildirishnoma dedup — bir xil xabar kuniga bir marta.
export const nazoratchiEvents = pgTable("nazoratchi_events", {
  id: serial("id").primaryKey(),
  linkId: bigint("link_id", { mode: "number" }).notNull(),
  day: varchar("day", { length: 10 }).notNull(), // YYYY-MM-DD
  type: varchar("type", { length: 16 }).notNull(), // lesson_start | lesson_end | tutor | tutor_end
  key: varchar("key", { length: 32 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Bot sozlamalari (kalit-qiymat) — masalan to'lov rekvizitlari:
// pay_card, pay_holder, pay_price_1m, pay_price_3m, pay_price_1y.
export const botSettings = pgTable("bot_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Xato va muhim hodisalar jurnali — masofadan diagnostika uchun (user xato yubormasa ham ko'ramiz).
export const errorLogs = pgTable("error_log", {
  id: serial("id").primaryKey(),
  step: varchar("step", { length: 64 }).notNull(),
  message: text("message"),
  detail: text("detail"),
  telegramId: bigint("telegram_id", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ErrorLog = typeof errorLogs.$inferSelect;

export type BotUser = typeof botUsers.$inferSelect;
export type MemberAccount = typeof memberAccounts.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type BotSetting = typeof botSettings.$inferSelect;
export type NazoratchiLink = typeof nazoratchiLinks.$inferSelect;
export type NazoratchiTutor = typeof nazoratchiTutor.$inferSelect;
export type NazoratchiTest = typeof nazoratchiTests.$inferSelect;
export type NazoratchiEvent = typeof nazoratchiEvents.$inferSelect;
export type ChildContext = {
  personId: string;
  schoolId: string;
  groupId: string;
  fullName: string;
  schoolName: string;
  groupName: string;
};
