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

export type BotUser = typeof botUsers.$inferSelect;
export type MemberAccount = typeof memberAccounts.$inferSelect;
export type ChildContext = {
  personId: string;
  schoolId: string;
  groupId: string;
  fullName: string;
  schoolName: string;
  groupName: string;
};
