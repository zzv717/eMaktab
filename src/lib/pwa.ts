// ============================================================================
// 📱 PWA (mobil ilova) — WebAuthn / Passkey (Face ID · Touch ID · Windows Hello)
//
// Kirish oqimi:
//   1) eMaktab login/parol (haqiqiy eMaktabdan tekshiriladi)
//   2) Bir marta passkey (yuz/panja) o'rnatiladi
//   3) Keyingi safar Face ID bilan bir zumda kirish
//
// Xavfsizlik: challenge va sessiya cookie'lari AES-256-GCM bilan shifrlangan
// (src/lib/crypto). Passkey xususiy kaliti qurilmada qoladi — serverda faqat
// ochiq kalit saqlanadi.
// ============================================================================

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pwaAccounts, pwaCredentials, type PwaCredential } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { EmaktabAuthError, loginEmaktab, sessionFromCookies, type EmaktabSession } from "@/lib/emaktab";

export const PWA_SESSION_COOKIE = "pwa_sid";
export const PWA_CHALLENGE_COOKIE = "pwa_chal";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 daqiqa

export type PwaProfile = {
  login: string;
  name: string;
  role: string;
  school: string;
  group: string;
};

/** So'rov asosida RP ID va origin (preview/live domen uchun moslashuvchan). */
export function pwaRpConfig(req: NextRequest | Request): { rpID: string; expectedOrigin: string } {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]!.trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]!.trim();
  const rpID = host.replace(/:\d+$/, "");
  return { rpID, expectedOrigin: `${proto}://${host}` };
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    maxAge,
  };
}

// ---------------------------------------------------------------------------
// Sessiya cookie
// ---------------------------------------------------------------------------

export function issueSessionCookie(res: NextResponse, profile: PwaProfile): void {
  const payload = encryptSecret(JSON.stringify({ ...profile, exp: Date.now() + SESSION_TTL_MS }));
  res.cookies.set(PWA_SESSION_COOKIE, encodeURIComponent(payload), cookieOpts(SESSION_TTL_MS / 1000));
}

export function readSession(req: NextRequest | Request): PwaProfile | null {
  try {
    const raw = (req as NextRequest).cookies?.get(PWA_SESSION_COOKIE)?.value;
    if (!raw) return null;
    const data = JSON.parse(decryptSecret(decodeURIComponent(raw))) as PwaProfile & { exp: number };
    if (!data.exp || data.exp < Date.now()) return null;
    return { login: data.login, name: data.name, role: data.role, school: data.school, group: data.group };
  } catch {
    return null;
  }
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(PWA_SESSION_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
  res.cookies.set(PWA_CHALLENGE_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
}

// ---------------------------------------------------------------------------
// Challenge cookie (bir martalik, 5 daqiqa)
// ---------------------------------------------------------------------------

export function issueChallengeCookie(
  res: NextResponse,
  challenge: string,
  purpose: "reg" | "auth",
  login: string,
): void {
  const payload = encryptSecret(
    JSON.stringify({ c: challenge, purpose, login, exp: Date.now() + CHALLENGE_TTL_MS }),
  );
  res.cookies.set(PWA_CHALLENGE_COOKIE, encodeURIComponent(payload), cookieOpts(CHALLENGE_TTL_MS / 1000));
}

export function readChallenge(
  req: NextRequest | Request,
  purpose: "reg" | "auth",
  login: string,
): string | null {
  try {
    const raw = (req as NextRequest).cookies?.get(PWA_CHALLENGE_COOKIE)?.value;
    if (!raw) return null;
    const data = JSON.parse(decryptSecret(decodeURIComponent(raw))) as {
      c: string;
      purpose: string;
      login: string;
      exp: number;
    };
    if (!data.exp || data.exp < Date.now()) return null;
    if (data.purpose !== purpose || data.login.toLowerCase() !== login.toLowerCase()) return null;
    return data.c;
  } catch {
    return null;
  }
}

/** Challenge ishlatilgandan keyin o'chirish (replay himoyasi). */
export function consumeChallenge(res: NextResponse): void {
  res.cookies.set(PWA_CHALLENGE_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
}

// ---------------------------------------------------------------------------
// Passkey saqlash
// ---------------------------------------------------------------------------

/** userID — deterministik (har bir login uchun barqaror), 64 baytdan kam. */
export function pwaUserId(login: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHash("sha256").update(`pwa:${login.toLowerCase()}`).digest());
}

export async function credentialsForLogin(login: string): Promise<PwaCredential[]> {
  return db
    .select()
    .from(pwaCredentials)
    .where(eq(pwaCredentials.emaktabLogin, login.toLowerCase()));
}

export async function credentialById(credentialId: string): Promise<PwaCredential | null> {
  const rows = await db
    .select()
    .from(pwaCredentials)
    .where(eq(pwaCredentials.credentialId, credentialId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveCredential(input: {
  login: string;
  credentialId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports?: string[];
  deviceType?: string;
  backedUp?: string;
  profile: PwaProfile;
}): Promise<void> {
  await db.insert(pwaCredentials).values({
    emaktabLogin: input.login.toLowerCase(),
    credentialId: input.credentialId,
    publicKey: Buffer.from(input.publicKey).toString("base64"),
    counter: input.counter,
    transports: input.transports ? JSON.stringify(input.transports).slice(0, 128) : null,
    deviceType: input.deviceType ?? null,
    backedUp: input.backedUp ?? null,
    profileJson: JSON.stringify(input.profile),
    lastUsedAt: new Date(),
  });
}

export async function updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
  await db
    .update(pwaCredentials)
    .set({ counter, lastUsedAt: new Date() })
    .where(eq(pwaCredentials.credentialId, credentialId));
}

export async function deleteCredentialFor(login: string, credentialId: string): Promise<boolean> {
  const deleted = await db
    .delete(pwaCredentials)
    .where(and(eq(pwaCredentials.emaktabLogin, login.toLowerCase()), eq(pwaCredentials.credentialId, credentialId)))
    .returning({ id: pwaCredentials.id });
  return deleted.length > 0;
}

// ---------------------------------------------------------------------------
// PWA hisobi (eMaktab kirish — serverda shifrlangan)
// ---------------------------------------------------------------------------

export async function saveAccount(
  login: string,
  password: string,
  profile: PwaProfile,
  sessionCookies?: Record<string, string>,
): Promise<void> {
  const key = login.toLowerCase();
  const values = {
    passwordEnc: encryptSecret(password),
    profileJson: JSON.stringify(profile),
    sessionEnc: sessionCookies ? encryptSecret(JSON.stringify(sessionCookies)) : undefined,
    lastLoginAt: new Date(),
  };
  const updated = await db.update(pwaAccounts).set(values).where(eq(pwaAccounts.emaktabLogin, key)).returning({ id: pwaAccounts.id });
  if (updated.length === 0) {
    await db.insert(pwaAccounts).values({ emaktabLogin: key, passwordEnc: values.passwordEnc, profileJson: values.profileJson, sessionEnc: values.sessionEnc ?? null });
  }
}

export async function getAccount(login: string): Promise<{ passwordEnc: string; profileJson: string | null; sessionEnc: string | null } | null> {
  const rows = await db
    .select({ passwordEnc: pwaAccounts.passwordEnc, profileJson: pwaAccounts.profileJson, sessionEnc: pwaAccounts.sessionEnc })
    .from(pwaAccounts)
    .where(eq(pwaAccounts.emaktabLogin, login.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

async function saveSessionCookies(login: string, cookies: Record<string, string>): Promise<void> {
  try {
    await db
      .update(pwaAccounts)
      .set({ sessionEnc: encryptSecret(JSON.stringify(cookies)) })
      .where(eq(pwaAccounts.emaktabLogin, login.toLowerCase()));
  } catch {
    /* saqlanmasa ham davom etamiz */
  }
}

// ---------------------------------------------------------------------------
// eMaktab sessiyasi (kesh bilan — ma'lumot route'lari uchun)
// ---------------------------------------------------------------------------

const sessCache = new Map<string, { session: EmaktabSession; exp: number }>();
const SESS_CACHE_TTL = 20 * 60 * 1000;

/** Botdagi openSession bilan bir xil: kesh → saqlangan cookie → to'liq login. */
async function openPwaSession(
  key: string,
  acc: { passwordEnc: string; sessionEnc: string | null },
): Promise<EmaktabSession> {
  const cached = sessCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.session;

  // 1) Saqlangan cookie'lar bilan (login qilmaslik — captcha kamroq chiqadi)
  if (acc.sessionEnc) {
    try {
      const cookies = JSON.parse(decryptSecret(acc.sessionEnc)) as Record<string, string>;
      const session = await sessionFromCookies(cookies, key);
      sessCache.set(key, { session, exp: Date.now() + SESS_CACHE_TTL });
      return session;
    } catch {
      /* cookie eskirgan — to'liq login */
    }
  }

  // 2) To'liq login → cookie'larni saqlaymiz
  let password = "";
  try {
    password = decryptSecret(acc.passwordEnc);
  } catch {
    throw new EmaktabAuthError("Hisob ma'lumotlari buzilgan — qayta kiring");
  }
  const res = await loginEmaktab(key, password);
  if (res.status === "invalid_credentials") {
    throw new EmaktabAuthError("Login yoki parol noto'g'ri — qayta kiring");
  }
  if (res.status === "captcha_required") {
    throw new EmaktabAuthError("eMaktab captcha so'rayapti — 1-2 daqiqadan keyin qayta urinib ko'ring");
  }
  if (res.status !== "ok") {
    throw new EmaktabAuthError(res.message || "eMaktabga ulanib bo'lmadi");
  }
  sessCache.set(key, { session: res.session, exp: Date.now() + SESS_CACHE_TTL });
  await saveSessionCookies(key, res.session.cookies);
  return res.session;
}

export async function withEmaktabSession<T>(
  login: string,
  fn: (s: EmaktabSession) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string; auth?: boolean }> {
  const key = login.toLowerCase();
  const acc = await getAccount(key);
  if (!acc) return { ok: false, error: "Hisob topilmadi — qayta kiring (login/parol bilan)", auth: true };

  // Xuddi botdagi withSession: bir marta qayta urinadi
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const session = await openPwaSession(key, acc);
      return { ok: true, data: await fn(session) };
    } catch (error) {
      if (error instanceof EmaktabAuthError) {
        sessCache.delete(key);
        if (attempt === 1) return { ok: false, error: error.message, auth: true };
        continue;
      }
      return { ok: false, error: error instanceof Error ? error.message.slice(0, 140) : "Xatolik" };
    }
  }
  return { ok: false, error: "eMaktabga ulanib bo'lmadi — qayta kiring", auth: true };
}

/** Sessiyada farzand kontekstini tanlash (ota-ona uchun). */
export function withPerson(session: EmaktabSession, personId?: string | null): EmaktabSession {
  if (!personId) return session;
  const p = session.persons.find((x) => x.personId === personId);
  return p ? { ...session, active: p } : session;
}

/** Credential satridan tekshirish uchun ko'rinish. */
export function credPublic(cred: PwaCredential): {
  id: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports?: string[];
} {
  let transports: string[] | undefined;
  try {
    transports = cred.transports ? (JSON.parse(cred.transports) as string[]) : undefined;
  } catch {
    transports = undefined;
  }
  return {
    id: cred.credentialId,
    publicKey: Uint8Array.from(Buffer.from(cred.publicKey, "base64")),
    counter: cred.counter,
    transports,
  };
}

export function profileFromCredJson(json: string | null, fallbackLogin: string): PwaProfile {
  try {
    if (json) return JSON.parse(json) as PwaProfile;
  } catch {
    /* ignore */
  }
  return { login: fallbackLogin, name: fallbackLogin, role: "-", school: "-", group: "-" };
}
