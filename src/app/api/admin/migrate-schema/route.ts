import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bazaviy jadvalni masofadan to'g'rilash (idempotent — bir necha marta ishlatish mumkin).
//
// Nima uchun kerak: schema yangilanganda (masalan bot_users ga classes_json qo'shilganda)
// bazadagi jadval eski qoladi va so'rovlar "column ... does not exist" xatosi bilan yiqiladi.
// Bu endpoint aynan shu ishni bajaradi — `npm run db:push` ga teng.
//
// Himoya: ?secret= TELEGRAM_WEBHOOK_SECRET bilan mos bo'lishi shart.
const STATEMENTS: { name: string; run: string }[] = [
  {
    name: "create bot_users (agar butunlay yo'q bo'lsa)",
    run: `CREATE TABLE IF NOT EXISTS bot_users (
      id serial PRIMARY KEY,
      telegram_id bigint NOT NULL UNIQUE,
      chat_id bigint NOT NULL,
      username varchar(255),
      first_name varchar(255),
      state varchar(32) NOT NULL DEFAULT 'idle',
      temp_login varchar(255),
      emaktab_login varchar(255),
      emaktab_password_enc text,
      connected_at timestamptz,
      full_name varchar(255),
      role varchar(32),
      emaktab_user_id varchar(32),
      person_id varchar(32),
      school_id varchar(32),
      group_id varchar(32),
      school_name varchar(255),
      group_name varchar(64),
      children_json text,
      classes_json text,
      temp_password_enc text,
      temp_session_enc text,
      session_enc text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "create bot_messages",
    run: `CREATE TABLE IF NOT EXISTS bot_messages (
      id serial PRIMARY KEY,
      chat_id bigint NOT NULL,
      message_id bigint NOT NULL,
      flow varchar(40) NOT NULL DEFAULT '0',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { name: "bot_messages.flow", run: `ALTER TABLE bot_messages ADD COLUMN IF NOT EXISTS flow varchar(40) NOT NULL DEFAULT '0'` },
  // Eski jadval bo'lsa — yetishmayotgan ustunlar qo'shiladi (hammasi IF NOT EXISTS):
  { name: "bot_users.state", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS state varchar(32) NOT NULL DEFAULT 'idle'` },
  { name: "bot_users.username", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS username varchar(255)` },
  { name: "bot_users.first_name", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS first_name varchar(255)` },
  { name: "bot_users.temp_login", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS temp_login varchar(255)` },
  { name: "bot_users.emaktab_login", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS emaktab_login varchar(255)` },
  { name: "bot_users.emaktab_password_enc", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS emaktab_password_enc text` },
  { name: "bot_users.connected_at", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS connected_at timestamptz` },
  { name: "bot_users.full_name", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS full_name varchar(255)` },
  { name: "bot_users.role", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS role varchar(32)` },
  { name: "bot_users.emaktab_user_id", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS emaktab_user_id varchar(32)` },
  { name: "bot_users.person_id", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS person_id varchar(32)` },
  { name: "bot_users.school_id", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS school_id varchar(32)` },
  { name: "bot_users.group_id", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS group_id varchar(32)` },
  { name: "bot_users.school_name", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS school_name varchar(255)` },
  { name: "bot_users.group_name", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS group_name varchar(64)` },
  { name: "bot_users.children_json", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS children_json text` },
  { name: "bot_users.classes_json", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS classes_json text` },
  { name: "bot_users.temp_password_enc", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS temp_password_enc text` },
  { name: "bot_users.temp_session_enc", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS temp_session_enc text` },
  { name: "bot_users.session_enc", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS session_enc text` },
  { name: "bot_users.plan", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS plan varchar(16) NOT NULL DEFAULT 'free'` },
  { name: "bot_users.plan_until", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS plan_until timestamptz` },
  { name: "bot_users.last_seen_at", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz` },
  { name: "bot_users.temp_text", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS temp_text text` },
  { name: "bot_users.sys_admin", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS sys_admin varchar(8) NOT NULL DEFAULT 'no'` },
  { name: "bot_users.role_override", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS role_override varchar(16)` },
  { name: "nazoratchi_tutor.book", run: `ALTER TABLE nazoratchi_tutor ADD COLUMN IF NOT EXISTS book varchar(255)` },
  { name: "nazoratchi_links.test_level", run: `ALTER TABLE nazoratchi_links ADD COLUMN IF NOT EXISTS test_level bigint NOT NULL DEFAULT 1` },
  { name: "nazoratchi_tests.quiz_id", run: `ALTER TABLE nazoratchi_tests ADD COLUMN IF NOT EXISTS quiz_id varchar(24)` },
  { name: "nazoratchi_tests.q_index", run: `ALTER TABLE nazoratchi_tests ADD COLUMN IF NOT EXISTS q_index bigint NOT NULL DEFAULT 0` },
  { name: "nazoratchi_tests.difficulty", run: `ALTER TABLE nazoratchi_tests ADD COLUMN IF NOT EXISTS difficulty bigint NOT NULL DEFAULT 1` },
  { name: "bot_users.created_at", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()` },
  { name: "bot_users.updated_at", run: `ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()` },
  {
    name: "create member_accounts",
    run: `CREATE TABLE IF NOT EXISTS member_accounts (
      id serial PRIMARY KEY,
      teacher_telegram_id bigint NOT NULL,
      class_id varchar(32),
      member_id varchar(32),
      kind varchar(16) NOT NULL,
      full_name varchar(255),
      emaktab_login varchar(255),
      emaktab_password_enc text,
      activated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "create error_log (xato jurnali)",
    run: `CREATE TABLE IF NOT EXISTS error_log (
      id serial PRIMARY KEY,
      step varchar(64) NOT NULL,
      message text,
      detail text,
      telegram_id bigint,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "create payments (💎 Pro to'lovlari)",
    run: `CREATE TABLE IF NOT EXISTS payments (
      id serial PRIMARY KEY,
      telegram_id bigint NOT NULL,
      plan varchar(16) NOT NULL,
      amount bigint,
      status varchar(16) NOT NULL DEFAULT 'draft',
      receipt_file_id text,
      receipt_unique_id text,
      receipt_ref varchar(64),
      admin_note varchar(255),
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "create nazoratchi_links (ota-ona ↔ bola)",
    run: `CREATE TABLE IF NOT EXISTS nazoratchi_links (
      id serial PRIMARY KEY,
      parent_telegram_id bigint NOT NULL,
      child_telegram_id bigint NOT NULL,
      child_person_id varchar(32),
      child_name varchar(255),
      child_class varchar(64),
      status varchar(16) NOT NULL DEFAULT 'active',
      child_blocked varchar(8) NOT NULL DEFAULT 'no',
      created_at timestamptz NOT NULL DEFAULT now(),
      removed_at timestamptz
    )`,
  },
  {
    name: "create nazoratchi_tutor (repetitor soatlari)",
    run: `CREATE TABLE IF NOT EXISTS nazoratchi_tutor (
      id serial PRIMARY KEY,
      link_id bigint NOT NULL,
      subject varchar(64) NOT NULL,
      time varchar(5) NOT NULL,
      duration_min bigint NOT NULL DEFAULT 60,
      days varchar(32) NOT NULL DEFAULT '[1,2,3,4,5]',
      place varchar(120),
      active varchar(8) NOT NULL DEFAULT 'yes',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "create nazoratchi_tests (AI testlari)",
    run: `CREATE TABLE IF NOT EXISTS nazoratchi_tests (
      id serial PRIMARY KEY,
      link_id bigint NOT NULL,
      child_telegram_id bigint NOT NULL,
      parent_telegram_id bigint NOT NULL,
      mode varchar(8) NOT NULL,
      source varchar(255),
      question text NOT NULL,
      options text NOT NULL,
      correct_index bigint NOT NULL,
      child_answer bigint,
      answered_at timestamptz,
      is_correct varchar(8),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "create nazoratchi_events (bildirishnoma dedup)",
    run: `CREATE TABLE IF NOT EXISTS nazoratchi_events (
      id serial PRIMARY KEY,
      link_id bigint NOT NULL,
      day varchar(10) NOT NULL,
      type varchar(16) NOT NULL,
      key varchar(32) NOT NULL DEFAULT '0',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (link_id, day, type, key)
    )`,
  },
  {
    name: "create bot_settings (sozlamalar)",
    run: `CREATE TABLE IF NOT EXISTS bot_settings (
      key varchar(64) PRIMARY KEY,
      value text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { name: "drop login_tokens (eski)", run: `DROP TABLE IF EXISTS login_tokens` },
];

export async function GET(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = req.nextUrl.searchParams.get("secret");
  if (!secret || given !== secret) {
    return NextResponse.json(
      { ok: false, error: "forbidden", webhookSecretConfigured: Boolean(secret) },
      { status: 403 },
    );
  }

  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const stmt of STATEMENTS) {
    try {
      await db.execute(sql.raw(stmt.run));
      results.push({ name: stmt.name, ok: true });
    } catch (error) {
      results.push({ name: stmt.name, ok: false, error: String(error).slice(0, 200) });
    }
  }

  // Tekshiruv: bot_users ustunlari va member_accounts mavjudligi
  let botUsersColumns: string[] = [];
  let memberAccountsExists = false;
  try {
    const cols = await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'bot_users' order by ordinal_position`,
    );
    botUsersColumns = cols.rows.map((r) => String((r as { column_name: unknown }).column_name));
    const ma = await db.execute(
      sql`select to_regclass('member_accounts') as t`,
    );
    memberAccountsExists = Boolean((ma.rows[0] as { t: unknown } | undefined)?.t);
  } catch {
    /* tekshiruv ixtiyoriy */
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results, botUsersColumns, memberAccountsExists });
}
