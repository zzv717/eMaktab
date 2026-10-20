import {
  bigint,
  boolean,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// One row per Telegram user who has talked to the bot.
// Stores the conversation state (for the simple step-by-step login flow)
// and, once connected, the eMaktab credentials (password is encrypted, never stored in plain text).
export const botUsers = pgTable("bot_users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),

  // Conversation state machine: idle | awaiting_login | awaiting_password
  state: varchar("state", { length: 32 }).notNull().default("idle"),
  tempLogin: varchar("temp_login", { length: 255 }),

  // eMaktab account, saved only after credentials are verified successfully.
  emaktabLogin: varchar("emaktab_login", { length: 255 }),
  emaktabPasswordEnc: text("emaktab_password_enc"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Short-lived, single-use tokens used to open the "one click" auto-login page
// from a Telegram button without ever putting the password in the URL/chat again.
export const loginTokens = pgTable("login_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
