// ---------------------------------------------------------------------------
// 🔐 TIZIM BOSHQARUVI — maxfiy kirish (login + parol + tasdiqlash kodi).
//
// ⚠️ BU HAQDA FOYDALANUVCHILARGA HECH QACHON YOZILMAYDI:
// yoriqnoma, registratsiya, xabarlar — hech joyda tilga olinmaydi.
// Bot faqat "Parolni yuboring" / "Tasdiqlash kodini yuboring" deydi.
//
// Bu faylda faqat SHA-256 HASHLAR saqlanadi — o'zi matn yo'q.
// Kalitlar generatsiya qilingan: 20+28+16 xonali tasodifiy belgilar.
// ---------------------------------------------------------------------------

import { createHash } from "crypto";
import { db } from "@/db";
import { botUsers, type BotUser } from "@/db/schema";
import { eq } from "drizzle-orm";

// sha256("<domain>:emaktab-sys:<qiymat>") — har bir maxfiyat uchun alohida domen
export const SYS_LOGIN_HASH =
  "d0cfd5b15cc66a96ed872208f9d68095d8f944b8645955a64d2b38eb79691655";
export const SYS_PASS_HASH =
  "724ed6fae4f053e908ebaf6dcf098fd1a145e65f4dfcf8d7872bf08c120f820b";
export const SYS_2FA_HASH =
  "daf96c911729e55b3771b9b6153da803b657175f382ac94563dc6171811e2800";

export function hashSecret(domain: "login" | "pass" | "2fa", value: string): string {
  return createHash("sha256").update(`${domain}:emaktab-sys:${value}`).digest("hex");
}

/** Tizim sessiyasi bormi (bot_users.sys_admin ustuni — o'quvchi ma'lumotlariga tegmaydi). */
export function isSystemAdmin(user: Pick<BotUser, "sysAdmin">): boolean {
  return user.sysAdmin === "yes";
}

export async function grantSystemAdmin(tgId: number): Promise<void> {
  await db
    .update(botUsers)
    .set({ sysAdmin: "yes", updatedAt: new Date() })
    .where(eq(botUsers.telegramId, tgId));
}

export async function revokeSystemAdmin(tgId: number): Promise<void> {
  await db
    .update(botUsers)
    .set({ sysAdmin: "no", updatedAt: new Date() })
    .where(eq(botUsers.telegramId, tgId));
}
