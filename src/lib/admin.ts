// ---------------------------------------------------------------------------
// Admin boshqaruv tizimi — faqat admin ko'radigan statistika, foydalanuvchilar,
// 💎 Pro tarifi va e'lonlar. Boshqalar uchun bu bo'lim UMUMAN ko'rinmaydi.
// ---------------------------------------------------------------------------

import { and, count, desc, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  botUsers,
  errorLogs,
  memberAccounts,
  nazoratchiLinks,
  nazoratchiTests,
  type BotUser,
} from "@/db/schema";

// Kodda doimiy admin (Telegram username — kichik/katta harf farqsiz).
// Qo'shimcha: env orqali ham qo'shish mumkin (kod o'zgartirmasdan):
//   TELEGRAM_ADMIN_IDS=123456789,987654321
//   TELEGRAM_ADMIN_USERNAMES=zzv717
const CODE_ADMIN_USERNAMES = ["zzv717"];

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Foydalanuvchi adminmi? (faqat admin uchun — boshqalarga hech narsa ko'rinmaydi) */
export function isAdmin(
  user: Pick<BotUser, "telegramId" | "username">,
  liveUsername?: string | null,
): boolean {
  const ids = envList("TELEGRAM_ADMIN_IDS");
  if (ids.includes(String(user.telegramId))) return true;
  const names = [
    ...envList("TELEGRAM_ADMIN_USERNAMES"),
    ...CODE_ADMIN_USERNAMES,
  ].map((n) => n.toLowerCase());
  const unames = [user.username, liveUsername]
    .filter((u): u is string => Boolean(u))
    .map((u) => u.toLowerCase());
  return names.some((n) => unames.includes(n));
}

// ---------------------------------------------------------------------------
// 💎 Pro tarifi
// ---------------------------------------------------------------------------

export function planActive(user: Pick<BotUser, "plan" | "planUntil">): boolean {
  if (user.plan !== "pro") return false;
  if (!user.planUntil) return true; // cheksiz
  return user.planUntil.getTime() > Date.now();
}

/** "1m" | "3m" | "1y" | "inf" → muddat oxiri (null = cheksiz). */
export function planUntilFromPeriod(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "1m":
      return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    case "3m":
      return new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
    case "1y":
      return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    default:
      return null; // inf — cheksiz
  }
}

export function planLabel(user: Pick<BotUser, "plan" | "planUntil">): string {
  if (!planActive(user)) return "🆓 Bepul";
  if (!user.planUntil) return "💎 Pro — cheksiz";
  const d = user.planUntil;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `💎 Pro — ${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} gacha`;
}

// ---------------------------------------------------------------------------
// Statistika
// ---------------------------------------------------------------------------

export interface AdminStats {
  total: number;
  connected: number;
  teachers: number;
  students: number;
  parents: number;
  newToday: number;
  active24h: number;
  pro: number;
  memberAccounts: number;
  events24h: number;
  nzLinks: number;
  nzTests: number;
}

export async function collectAdminStats(): Promise<AdminStats> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  const [totalR] = await db.select({ n: count() }).from(botUsers);
  const [connR] = await db
    .select({ n: count() })
    .from(botUsers)
    .where(isNotNull(botUsers.emaktabLogin));
  const roleRows = await db
    .select({ role: botUsers.role, n: count() })
    .from(botUsers)
    .groupBy(botUsers.role);
  const [newR] = await db
    .select({ n: count() })
    .from(botUsers)
    .where(gte(botUsers.createdAt, dayStart));
  const [actR] = await db
    .select({ n: count() })
    .from(botUsers)
    .where(gte(botUsers.lastSeenAt, dayAgo));
  const [proR] = await db
    .select({ n: count() })
    .from(botUsers)
    .where(
      and(
        eq(botUsers.plan, "pro"),
        or(isNull(botUsers.planUntil), gte(botUsers.planUntil, now)),
      ),
    );
  const [memR] = await db.select({ n: count() }).from(memberAccounts);
  const [evR] = await db
    .select({ n: count() })
    .from(errorLogs)
    .where(gte(errorLogs.createdAt, dayAgo));
  const [nzLinkR] = await db
    .select({ n: count() })
    .from(nazoratchiLinks)
    .where(eq(nazoratchiLinks.status, "active"));
  const [nzTestR] = await db.select({ n: count() }).from(nazoratchiTests);

  const roleCount = (r: string) => roleRows.find((x) => x.role === r)?.n ?? 0;
  return {
    total: totalR?.n ?? 0,
    connected: connR?.n ?? 0,
    teachers: roleCount("teacher"),
    students: roleCount("student"),
    parents: roleCount("parent"),
    newToday: newR?.n ?? 0,
    active24h: actR?.n ?? 0,
    pro: proR?.n ?? 0,
    memberAccounts: memR?.n ?? 0,
    events24h: evR?.n ?? 0,
    nzLinks: nzLinkR?.n ?? 0,
    nzTests: nzTestR?.n ?? 0,
  };
}

export function formatAdminStats(stats: AdminStats): string {
  return (
    `🛠 <b>Admin panel</b>\n\n` +
    `📊 <b>Statistika</b>\n` +
    `• 👥 Bot foydalanuvchilari: <b>${stats.total}</b> ta (bugun yangi: ${stats.newToday})\n` +
    `• 🔗 eMaktabga ulangan: <b>${stats.connected}</b> ta\n` +
    `• 🧭 Rollar: 👨‍🏫 ${stats.teachers} · 🎒 ${stats.students} · 👪 ${stats.parents}\n` +
    `• 🕐 Faol (24 soat): <b>${stats.active24h}</b> ta\n` +
    `• 💎 Pro: <b>${stats.pro}</b> ta\n` +
    `• 🧾 Sinf hisoblari (o'quvchi/ota-ona): <b>${stats.memberAccounts}</b> ta\n` +
    `• 👁 Nazoratchi: <b>${stats.nzLinks}</b> ulanish · <b>${stats.nzTests}</b> test\n` +
    `• 🧯 Xato/hodisalar (24 soat): <b>${stats.events24h}</b> ta`
  );
}

// ---------------------------------------------------------------------------
// Foydalanuvchilar ro'yxati / tahriri
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  id: number;
  telegramId: number;
  username: string | null;
  fullName: string | null;
  firstName: string | null;
  role: string | null;
  emaktabLogin: string | null;
  plan: string;
  planUntil: Date | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  groupName: string | null;
  schoolName: string | null;
  childrenJson: string | null;
  connectedAt: Date | null;
}

const userCols = {
  id: botUsers.id,
  telegramId: botUsers.telegramId,
  username: botUsers.username,
  fullName: botUsers.fullName,
  firstName: botUsers.firstName,
  role: botUsers.role,
  emaktabLogin: botUsers.emaktabLogin,
  plan: botUsers.plan,
  planUntil: botUsers.planUntil,
  createdAt: botUsers.createdAt,
  lastSeenAt: botUsers.lastSeenAt,
  groupName: botUsers.groupName,
  schoolName: botUsers.schoolName,
  childrenJson: botUsers.childrenJson,
  connectedAt: botUsers.connectedAt,
};

export async function listUsers(offset: number, limit: number): Promise<AdminUserRow[]> {
  return db
    .select(userCols)
    .from(botUsers)
    .orderBy(desc(botUsers.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function countUsers(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(botUsers);
  return r?.n ?? 0;
}

export async function getAdminUser(id: number): Promise<AdminUserRow | null> {
  const rows = await db.select(userCols).from(botUsers).where(eq(botUsers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function setUserPlan(id: number, plan: string, until: Date | null): Promise<void> {
  await db
    .update(botUsers)
    .set({ plan, planUntil: until, updatedAt: new Date() })
    .where(eq(botUsers.id, id));
}

// ---------------------------------------------------------------------------
// 📢 E'lon (broadcast)
// ---------------------------------------------------------------------------

export type BroadcastAudience = "all" | "conn" | "pro";

export async function broadcastTargets(audience: BroadcastAudience): Promise<
  Array<{ chatId: number; name: string }>
> {
  let rows: Array<{ chatId: number; fullName: string | null; firstName: string | null; plan: string; planUntil: Date | null }>;
  if (audience === "conn") {
    rows = await db
      .select({
        chatId: botUsers.chatId,
        fullName: botUsers.fullName,
        firstName: botUsers.firstName,
        plan: botUsers.plan,
        planUntil: botUsers.planUntil,
      })
      .from(botUsers)
      .where(isNotNull(botUsers.emaktabLogin));
  } else if (audience === "pro") {
    rows = await db
      .select({
        chatId: botUsers.chatId,
        fullName: botUsers.fullName,
        firstName: botUsers.firstName,
        plan: botUsers.plan,
        planUntil: botUsers.planUntil,
      })
      .from(botUsers)
      .where(
        and(
          eq(botUsers.plan, "pro"),
          or(isNull(botUsers.planUntil), gte(botUsers.planUntil, new Date())),
        ),
      );
  } else {
    rows = await db
      .select({
        chatId: botUsers.chatId,
        fullName: botUsers.fullName,
        firstName: botUsers.firstName,
        plan: botUsers.plan,
        planUntil: botUsers.planUntil,
      })
      .from(botUsers)
  }
  return rows.map((r) => ({ chatId: r.chatId, name: r.fullName || r.firstName || String(r.chatId) }));
}

// ---------------------------------------------------------------------------
// 🚨 Xato/hodisalar jurnali
// ---------------------------------------------------------------------------

export async function recentEvents(limit = 8): Promise<Array<{ step: string; message: string | null; createdAt: Date }>> {
  return db
    .select({ step: errorLogs.step, message: errorLogs.message, createdAt: errorLogs.createdAt })
    .from(errorLogs)
    .orderBy(desc(errorLogs.createdAt))
    .limit(limit);
}
