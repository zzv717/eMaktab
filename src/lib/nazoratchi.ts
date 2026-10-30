// ---------------------------------------------------------------------------
// 👁 NAZORATCHI — ota-ona nazorati moduli.
//
// • Ota-ona va bola telefonlari KOD bilan ulanadi (bola uzi O'CHIRA olmaydi!);
// • Avtomatik bildirishnomalar: dars boshlanishi/tugashi, repetitor eslatmasi;
// • "📊 Bugungi baholar" tugmasi (eMaktabdan, aynan bugungi);
// • 📝 AI test: kitob (nomi+muallif+bet) yoki mavzu bo'yicha — ota-onaga JAVOB
//   bilan, bolaga VARIANT (to'g'ri javobsiz) bir vaqtda yuboriladi; bola
//   javob bergach natija ota-onaga ko'rinadi.
// ---------------------------------------------------------------------------

import { and, eq } from "drizzle-orm";
import { db, logEvent, logError } from "@/db";
import {
  botUsers,
  nazoratchiEvents,
  nazoratchiLinks,
  nazoratchiTests,
  nazoratchiTutor,
  type BotUser,
  type ChildContext,
  type NazoratchiLink,
} from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import {
  dayWeekday,
  fetchDiaryDays,
  fetchGrades,
  loginEmaktab,
  scheduleFromDiaryDays,
  tashkentDayKey,
  TZ_OFFSET_MS,
  type EmaktabSession,
  type Grade,
  type Lesson,
} from "@/lib/emaktab";
import { escapeHtml, formatGrades } from "@/lib/format";
import { kb, sendMessage, type ReplyMarkup } from "@/lib/telegram";
import { generateTestQuestion } from "@/lib/ai";
import { getSetting, setSetting } from "@/lib/payments";

// ---------------------------------------------------------------------------
// Vaqt yordamchilari (Toshkent)
// ---------------------------------------------------------------------------

export function nowTashkent(): { day: string; hhmm: string; weekday: number; minutes: number } {
  const d = new Date(Date.now() + TZ_OFFSET_MS);
  const day = d.toISOString().slice(0, 10);
  const hhmm = d.toISOString().slice(11, 16);
  return { day, hhmm, weekday: dayWeekday(day), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function hhmmToMinutes(hhmm: string): number | null {
  const m = (hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Ulanishlar (links)
// ---------------------------------------------------------------------------

export async function activeLinksForParent(parentTg: number): Promise<NazoratchiLink[]> {
  return db
    .select()
    .from(nazoratchiLinks)
    .where(and(eq(nazoratchiLinks.parentTelegramId, parentTg), eq(nazoratchiLinks.status, "active")));
}

export async function activeLinksForChild(childTg: number): Promise<NazoratchiLink[]> {
  return db
    .select()
    .from(nazoratchiLinks)
    .where(and(eq(nazoratchiLinks.childTelegramId, childTg), eq(nazoratchiLinks.status, "active")));
}

/** Nazoratchi kirishi bormi (kamida bitta faol ulanish)? */
export async function hasNazoratchiAccess(tgId: number): Promise<boolean> {
  const [a, b] = await Promise.all([activeLinksForParent(tgId), activeLinksForChild(tgId)]);
  return a.length > 0 || b.length > 0;
}

export async function getUserByTg(tgId: number): Promise<BotUser | null> {
  const rows = await db.select().from(botUsers).where(eq(botUsers.telegramId, tgId)).limit(1);
  return rows[0] ?? null;
}

function childLabel(l: NazoratchiLink): string {
  return l.childName || "Farzand";
}

// ---------------------------------------------------------------------------
// 🔗 Ulash (kod bilan)
// ---------------------------------------------------------------------------

export function makePairCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Ota-ona uchun ulash kodi yaratadi (10 daqiqa amal qiladi). */
export async function startParentPairing(user: BotUser): Promise<string> {
  const code = makePairCode();
  await db
    .update(botUsers)
    .set({ state: "nz:pair", tempText: `${code}:${Date.now()}`, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, user.telegramId));
  return code;
}

/** Bola kodni kiritadi — ulanish o'rnatiladi. */
export async function completePairing(
  childTg: number,
  code: string,
): Promise<{ ok: boolean; message: string }> {
  const c = (code || "").trim();
  if (!/^\d{6}$/.test(c)) return { ok: false, message: "⚠️ Kod 6 xonali raqam bo'lishi kerak." };
  // Faqat holati nz:pair va kodi mos kelgan ota-ona (tempText = "kod:timestamp")
  const parents = await db.select().from(botUsers).where(eq(botUsers.state, "nz:pair"));
  const parent = parents.find((p) => (p.tempText ?? "").split(":")[0] === c);
  if (!parent) {
    return { ok: false, message: "⚠️ Kod topilmadi yoki muddati tugagan. Ota-onangizdan yangi kod so'rang." };
  }
  const ts = Number((parent.tempText ?? "").split(":")[1] ?? "0");
  if (ts && Date.now() - ts > 10 * 60 * 1000) {
    await db
      .update(botUsers)
      .set({ state: "idle", tempText: null, updatedAt: new Date() })
      .where(eq(botUsers.telegramId, parent.telegramId));
    return { ok: false, message: "⚠️ Kod muddati tugagan (10 daqiqa). Ota-onangizdan yangi kod so'rang." };
  }
  if (parent.telegramId === childTg) {
    return { ok: false, message: "⚠️ O'zingizni ulab bo'lmaydi." };
  }
  // Takror ulanish bo'lmasin
  const existing = await activeLinksForChild(childTg);
  if (existing.some((l) => l.parentTelegramId === parent.telegramId)) {
    await db
      .update(botUsers)
      .set({ state: "idle", tempText: null, updatedAt: new Date() })
      .where(eq(botUsers.telegramId, parent.telegramId));
    return { ok: true, message: "✅ Siz allaqachon ulangansiz." };
  }
  const child = await getUserByTg(childTg);
  const [link] = await db
    .insert(nazoratchiLinks)
    .values({
      parentTelegramId: parent.telegramId,
      childTelegramId: childTg,
      childPersonId: child?.personId ?? null,
      childName: child?.fullName || child?.firstName || null,
      childClass: child?.groupName ?? null,
      status: "active",
    })
    .returning();
  await db
    .update(botUsers)
    .set({ state: "idle", tempText: null, updatedAt: new Date() })
    .where(eq(botUsers.telegramId, parent.telegramId));
  await logEvent("nz_link", `parent=${parent.telegramId} child=${childTg}`, childTg);

  // Farzandni eMaktabdagi shaxs bilan bog'lash — dars/baho to'g'ri topilishi uchun.
  let kids: ChildContext[] = [];
  try {
    kids = parent.childrenJson ? (JSON.parse(parent.childrenJson) as ChildContext[]) : [];
  } catch {
    kids = [];
  }
  const matched =
    kids.find((k) => k.personId && k.personId === child?.personId) ??
    (kids.length === 1 ? kids[0] : undefined);
  let pickRows: Array<Array<{ text: string; callback_data: string }>> | null = null;
  if (matched) {
    await db
      .update(nazoratchiLinks)
      .set({ childPersonId: matched.personId, childClass: matched.groupName ?? link.childClass })
      .where(eq(nazoratchiLinks.id, link.id));
  } else if (kids.length > 1) {
    // Bir nechta farzand — ota-ona qaysi ekanini tanlasin
    pickRows = kids.map((k) => [
      {
        text: `${k.groupName ? k.groupName + " · " : ""}${(k.schoolName || "Farzand").slice(0, 40)}`,
        callback_data: `nz:pl:${link.id}:${k.personId}`,
      },
    ]);
  }
  // Ota-onaga xabar (+ kerak bo'lsa tanlash tugmalari)
  const parentMsg =
    `🔗 <b>Farzandingiz ulandi:</b> ${escapeHtml(child?.fullName || child?.firstName || "Farzand")}\n\n` +
    `⚠️ Ulanishni faqat SIZ o'chira olasiz.\n` +
    (pickRows ? `\nBu qaysi farzandingiz? (dars jadvali va baholar shu orqali topiladi):` : `\nEndi avtomatik xabarlar boshlanadi.`);
  await sendSafe(
    parent.telegramId,
    parentMsg,
    pickRows ? kb(pickRows) : undefined,
    false,
    link.id,
  );

  return {
    ok: true,
    message:
      `✅ <b>Ulanish o'rnatildi!</b>\n\n` +
      `Endi ota-onangiz sizning darslaringiz, baholaringiz va testingizni nazorat qila oladi.\n` +
      `⚠️ <i>Bu ulanishni faqat ota-ona o'chiradi.</i>`,
  };
}

/** Ota-ona "Bu qaysi farzandingiz?" tugmasini bosadi — shaxsni biriktiramiz. */
export async function pickChildForLink(
  linkId: number,
  parentTg: number,
  personId: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(nazoratchiLinks)
    .where(and(eq(nazoratchiLinks.id, linkId), eq(nazoratchiLinks.parentTelegramId, parentTg)))
    .limit(1);
  const link = rows[0];
  if (!link) return false;
  const parent = await getUserByTg(parentTg);
  let kids: ChildContext[] = [];
  try {
    kids = parent?.childrenJson ? (JSON.parse(parent.childrenJson) as ChildContext[]) : [];
  } catch {
    kids = [];
  }
  const kid = kids.find((k) => k.personId === personId);
  await db
    .update(nazoratchiLinks)
    .set({
      childPersonId: personId,
      childClass: kid?.groupName ?? link.childClass,
    })
    .where(eq(nazoratchiLinks.id, linkId));
  await logEvent("nz_pick_child", `link=${linkId} person=${personId}`, parentTg);
  return true;
}

/** Ulanishni uzish — FAQAT ota-ona (yoki admin). */
export async function unlinkByParent(linkId: number, parentTg: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(nazoratchiLinks)
    .where(and(eq(nazoratchiLinks.id, linkId), eq(nazoratchiLinks.parentTelegramId, parentTg)))
    .limit(1);
  if (!rows[0]) return false;
  await db
    .update(nazoratchiLinks)
    .set({ status: "removed", removedAt: new Date() })
    .where(eq(nazoratchiLinks.id, linkId));
  await logEvent("nz_unlink", `link=${linkId} parent=${parentTg}`, parentTg);
  return true;
}

// ---------------------------------------------------------------------------
// ⏰ Repetitor sozlamalari
// ---------------------------------------------------------------------------

export async function tutorsForLink(linkId: number): Promise<
  Array<{ id: number; subject: string; time: string; durationMin: number; days: string; place: string | null }>
> {
  return db
    .select({
      id: nazoratchiTutor.id,
      subject: nazoratchiTutor.subject,
      time: nazoratchiTutor.time,
      durationMin: nazoratchiTutor.durationMin,
      days: nazoratchiTutor.days,
      place: nazoratchiTutor.place,
    })
    .from(nazoratchiTutor)
    .where(and(eq(nazoratchiTutor.linkId, linkId), eq(nazoratchiTutor.active, "yes")))
    .orderBy(nazoratchiTutor.time);
}

export function parseDays(days: string): number[] {
  try {
    const parsed = JSON.parse(days) as unknown;
    if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => n >= 0 && n <= 6);
  } catch {
    /* default */
  }
  return [1, 2, 3, 4, 5];
}

export function formatDays(days: string): string {
  const names = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
  return parseDays(days).map((d) => names[d] ?? d).join(" · ");
}

// ---------------------------------------------------------------------------
// 📝 Test oqimi
// ---------------------------------------------------------------------------

export interface TestDraft {
  mode: "book" | "topic";
  title?: string;
  author?: string;
  pages?: string;
  topic?: string;
  /** Ota-ona yaratayotgan bo'lsa — qaysi farzand (linkId) */
  linkId?: number;
}

export function parseTestDraft(json: string | null): TestDraft | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as TestDraft;
  } catch {
    return null;
  }
}

export function testSourceLabel(d: TestDraft): string {
  return d.mode === "book"
    ? `📚 ${d.title || "?"}${d.author ? ` (${d.author})` : ""}${d.pages ? ` — betlar: ${d.pages}` : ""}`
    : `🧑‍🏫 ${d.topic || "?"}`;
}

/** Test yaratadi: AI savol → bazaga yozadi → ikkala tomonga yuboradi. */
export async function createAndDeliverTest(
  link: NazoratchiLink,
  draft: TestDraft,
): Promise<{ ok: boolean; message: string }> {
  // Ota-onalar (bir nechta bo'lsa — hammasi)
  const links = await activeLinksForChild(link.childTelegramId);
  const parentIds = [...new Set(links.map((l) => l.parentTelegramId))];
  let question;
  try {
    question = await generateTestQuestion({
      mode: draft.mode,
      bookTitle: draft.title,
      bookAuthor: draft.author,
      pages: draft.pages,
      topic: draft.topic,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `⚠️ Test yaratib bo'lmadi: ${escapeHtml(msg)}\n\nAdmin bilan bog'laning yoki keyinroq qayta urinib ko'ring.`,
    };
  }
  const primaryParent = parentIds[0] ?? link.parentTelegramId;
  const [row] = await db
    .insert(nazoratchiTests)
    .values({
      linkId: link.id,
      childTelegramId: link.childTelegramId,
      parentTelegramId: primaryParent,
      mode: draft.mode,
      source: testSourceLabel(draft),
      question: question.question,
      options: JSON.stringify(question.options),
      correctIndex: question.correctIndex,
    })
    .returning();

  const letters = ["A", "B", "C", "D"];
  const optionText = question.options.map((o, i) => `${letters[i]}) ${o}`).join("\n");
  const sourceLine = testSourceLabel(draft);
  const engineNote =
    question.engine === "local"
      ? `\n\n<i>💡 Soddalashtirilgan savol (AI kalit kiritilsa — chuqurroq savollar: admin → 🤖 AI sozlamalari)</i>`
      : "";

  // Bolaga — TO'G'RI JAVOBSIZ variantlar
  const childKb = kb(
    question.options.map((_, i) => [
      { text: letters[i], callback_data: `nz:ans:${row.id}:${i}` },
    ]),
  );
  await sendSafe(
    link.childTelegramId,
    `📝 <b>Test savoli</b>\n${sourceLine}\n\n❓ ${escapeHtml(question.question)}\n\n${optionText}\n\n<i>To'g'ri javobni tanlang:</i>`,
    childKb,
    true,
    link.id,
  );

  // Ota-onalarga — JAVOB BILAN
  const parentText =
    `📝 <b>Test yuborildi</b> — 👤 ${escapeHtml(childLabel(link))}\n${sourceLine}\n\n` +
    `❓ ${escapeHtml(question.question)}\n\n${optionText}\n\n` +
    `✅ <b>To'g'ri javob: ${letters[question.correctIndex]}</b>\n\n` +
    `<i>Bola javob bergach natija shu yerga keladi.</i>${engineNote}`;
  for (const pid of parentIds) {
    await sendSafe(pid, parentText, undefined, false, link.id);
  }
  return { ok: true, message: "✅ Test yaratildi va yuborildi!" };
}

/** Bolaning javobi → natija ota-onalarga. */
export async function answerTest(
  testId: number,
  childTg: number,
  index: number,
): Promise<{ ok: boolean; message: string }> {
  const rows = await db.select().from(nazoratchiTests).where(eq(nazoratchiTests.id, testId)).limit(1);
  const t = rows[0];
  if (!t) return { ok: false, message: "❌ Test topilmadi." };
  if (t.childTelegramId !== childTg) return { ok: false, message: "⛔ Bu test sizga tegishli emas." };
  if (t.answeredAt) return { ok: false, message: "ℹ️ Bu testga allaqachon javob bergansiz." };

  const correct = index === t.correctIndex;
  await db
    .update(nazoratchiTests)
    .set({
      childAnswer: index,
      answeredAt: new Date(),
      isCorrect: correct ? "yes" : "no",
    })
    .where(eq(nazoratchiTests.id, testId));

  const letters = ["A", "B", "C", "D"];
  const options = JSON.parse(t.options) as string[];
  const sourceLine = t.source ?? "";

  // Ota-onalarga natija
  const links = await activeLinksForChild(childTg);
  const parentIds = [...new Set(links.map((l) => l.parentTelegramId))];
  const parentText =
    `📝 <b>Test natijasi</b> — 👤 ${escapeHtml(links[0]?.childName || "Farzand")}\n` +
    `${escapeHtml(sourceLine)}\n\n` +
    `${correct ? "✅ <b>TO'G'RI javob berdi!</b>" : "❌ <b>Noto'g'ri javob berdi.</b>"}\n` +
    `• Bolaning javobi: ${letters[index]}) ${escapeHtml(options[index] ?? "")}\n` +
    `• To'g'ri javob: ${letters[t.correctIndex]}) ${escapeHtml(options[t.correctIndex] ?? "")}`;
  for (const pid of parentIds) {
    await sendSafe(pid, parentText, undefined, false, links[0]?.id ?? 0);
  }

  // Bolaga qisqa natija
  return {
    ok: true,
    message: correct
      ? "✅ <b>To'g'ri javob!</b> Zo'r!"
      : `❌ <b>Noto'g'ri.</b> To'g'ri javob: <b>${letters[t.correctIndex]}</b>\n\nKeyingi safar albatta olasiz! 💪`,
  };
}

// ---------------------------------------------------------------------------
// 📊 Bugungi baholar (eMaktabdan)
// ---------------------------------------------------------------------------

async function withUserSession<T>(
  u: BotUser | null,
  fn: (s: EmaktabSession) => Promise<T>,
): Promise<T | null> {
  if (!u?.emaktabLogin || !u.emaktabPasswordEnc) return null;
  try {
    const pw = decryptSecret(u.emaktabPasswordEnc);
    const res = await loginEmaktab(u.emaktabLogin, pw);
    if (res.status !== "ok") return null;
    return await fn(res.session);
  } catch {
    return null;
  }
}

/** Farzandning bugungi baholari — avval bolaning o'z hisobi, keyin ota-onaniki. */
export async function childTodayGrades(link: NazoratchiLink): Promise<Grade[] | null> {
  const today = tashkentDayKey();
  const pick = (grades: Grade[]) => grades.filter((g) => g.date === today);
  const child = await getUserByTg(link.childTelegramId);
  const fromChild = await withUserSession(child, async (s) => pick(await fetchGrades(s, 3)));
  if (fromChild && fromChild.length > 0) return fromChild;
  const parent = await getUserByTg(link.parentTelegramId);
  const fromParent = await withUserSession(parent, async (s) => {
    // faqat shu farzandning personId si bilan
    const person =
      s.persons.find((p) => p.personId && p.personId === link.childPersonId) ??
      (s.persons.length === 1 ? s.persons[0] : null);
    if (!person) return null;
    return pick(await fetchGrades({ ...s, active: person }, 3));
  });
  if (fromParent && fromParent.length > 0) return fromParent;
  return fromChild ?? fromParent ?? null;
}

/** Farzandning bugungi baholari matni (Bugungi baholar tugmasi bosilganda). */
export async function childGradesText(link: NazoratchiLink): Promise<string> {
  const label = childLabel(link);
  const grades = await childTodayGrades(link);
  if (!grades) {
    return (
      `\u{1F4CA} <b>Bugungi baholar</b> \u2014 ${escapeHtml(label)}\n\n` +
      `\u26A0\uFE0F eMaktabdan ma'lumot olinmadi. Iltimos, keyinroq qayta urinib ko'ring.`
    );
  }
  if (grades.length === 0) {
    return `\u{1F4CA} <b>Bugungi baholar</b> \u2014 ${escapeHtml(label)}\n\nBugun hali baho qo'yilmagan. \u{1F331}`;
  }
  return formatGrades(grades, "Aynan bugungi baholar", label);
}

export async function childTodayLessons(link: NazoratchiLink): Promise<Lesson[] | null> {
  const today = tashkentDayKey();
  const pick = (lessons: Lesson[]) => lessons;
  const child = await getUserByTg(link.childTelegramId);
  const fromChild = await withUserSession(child, async (s) => {
    const days = await fetchDiaryDays(s, today, today);
    return pick(scheduleFromDiaryDays(days)[0]?.lessons ?? []);
  });
  if (fromChild && fromChild.length > 0) return fromChild;
  const parent = await getUserByTg(link.parentTelegramId);
  const fromParent = await withUserSession(parent, async (s) => {
    const person =
      s.persons.find((p) => p.personId && p.personId === link.childPersonId) ??
      (s.persons.length === 1 ? s.persons[0] : null);
    if (!person) return null;
    const days = await fetchDiaryDays({ ...s, active: person }, today, today);
    return pick(scheduleFromDiaryDays(days)[0]?.lessons ?? []);
  });
  return fromChild ?? fromParent ?? null;
}

// ---------------------------------------------------------------------------
// 📨 Xavfsiz yuborish (bloklashni aniqlash)
// ---------------------------------------------------------------------------

async function sendSafe(
  chatId: number,
  text: string,
  markup?: ReplyMarkup,
  isChild = false,
  linkId = 0,
): Promise<void> {
  try {
    await sendMessage(chatId, text, { replyMarkup: markup, untracked: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isChild && /blocked|deactivated/i.test(msg) && linkId > 0) {
      await db
        .update(nazoratchiLinks)
        .set({ childBlocked: "yes" })
        .where(eq(nazoratchiLinks.id, linkId));
      const link = await db
        .select()
        .from(nazoratchiLinks)
        .where(eq(nazoratchiLinks.id, linkId))
        .limit(1);
      const l = link[0];
      if (l) {
        await sendMessage(
          l.parentTelegramId,
          `⚠️ <b>Diqqat!</b> Farzandingiz (${escapeHtml(childLabel(l))}) botni <b>bloklab qo'ydi</b>.\n\n` +
            `Nazorat xabarlari bormayapti. Iltimos, farzandingiz bilan gaplashing — u botni qayta ishga tushirsin (/start) va blokdan chiqarsin.`,
          { untracked: true },
        );
      }
      await logEvent("nz_blocked", `link=${linkId} chat=${chatId}`, chatId);
    } else {
      await logError("nz_send", error, chatId);
    }
  }
}

// ---------------------------------------------------------------------------
// 🔔 Avtomatik bildirishnomalar (cron + webhook orqali ishlaydi)
// ---------------------------------------------------------------------------

const NOTIFY_LOCK_KEY = "nz_last_run";

async function alreadySent(linkId: number, day: string, type: string, key: string): Promise<boolean> {
  try {
    const [row] = await db
      .insert(nazoratchiEvents)
      .values({ linkId, day, type, key })
      .onConflictDoNothing()
      .returning();
    return !row; // yozuvi kirmadi = oldin yuborilgan
  } catch {
    return true; // xato bo'lsa — qayta yubormaymiz
  }
}

interface DueItem {
  type: string;
  key: string;
  toParent: string;
  toChild?: string;
  parentKb?: ReplyMarkup;
}

interface DayWindow {
  firstStart: string;
  firstSubject: string;
  lastEnd: string;
}

/** Kunlik dars oynasi (birinchi dars boshlanishi / oxirgi dars tugashi) — kesh bilan. */
async function dayWindow(link: NazoratchiLink, day: string): Promise<DayWindow | null> {
  const cacheKey = `nzs:${link.id}:${day}`;
  try {
    const cached = await getSetting(cacheKey);
    if (cached) return JSON.parse(cached) as DayWindow;
  } catch {
    /* kesh buzilgan bo'lsa — qayta olamiz */
  }
  const lessons = await childTodayLessons(link);
  const timed = (lessons ?? []).filter((l) => l.startTime && /^\d{1,2}:\d{2}/.test(l.startTime));
  if (timed.length === 0) return null;
  const sorted = [...timed].sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const win: DayWindow = {
    firstStart: first.startTime!,
    firstSubject: first.subject,
    lastEnd: last.endTime && /^\d{1,2}:\d{2}/.test(last.endTime) ? last.endTime : last.startTime!,
  };
  try {
    await setSetting(cacheKey, JSON.stringify(win));
  } catch {
    /* kesh yozilmasa ham davom etamiz */
  }
  return win;
}

async function dueForLink(link: NazoratchiLink, day: string, weekday: number, minutes: number): Promise<DueItem[]> {
  const out: DueItem[] = [];
  const label = escapeHtml(childLabel(link));

  // Darslar (eMaktabdan — kunlik kesh bilan, eMaktabni qiynamaymiz)
  const win = await dayWindow(link, day);
  if (win) {
    const firstMin = hhmmToMinutes(win.firstStart);
    const lastEndMin = hhmmToMinutes(win.lastEnd);

    if (firstMin !== null && minutes >= firstMin - 5 && minutes <= firstMin + 30) {
      out.push({
        type: "lesson_start",
        key: "0",
        toParent:
          `🎓 <b>Farzandingiz darsi boshlandi</b>\n` +
          `👤 ${label}\n` +
          `1-dars ${escapeHtml(win.firstStart)} — ${escapeHtml(win.firstSubject)}`,
        toChild: `🎓 <b>Bugungi darslaringiz boshlandi!</b>\n1-dars ${escapeHtml(win.firstStart)} — ${escapeHtml(win.firstSubject)}`,
      });
    }
    if (lastEndMin !== null && minutes >= lastEndMin && minutes <= lastEndMin + 45) {
      out.push({
        type: "lesson_end",
        key: "0",
        toParent:
          `🏁 <b>Farzandingiz darsi tugadi</b>\n` +
          `👤 ${label}\n` +
          `Soat ${escapeHtml(win.lastEnd)}\n\n` +
          `Bugungi baholarini ko'rish uchun tugmani bosing:`,
        toChild: `🏁 <b>Bugungi darslaringiz tugadi.</b> Xotirjam dam oling! 🏖`,
        parentKb: kb([[{ text: "📊 Bugungi baholar", callback_data: `nz:g:${link.id}` }]]),
      });
    }
  }

  // Repetitor
  const tutors = await tutorsForLink(link.id);
  for (const t of tutors) {
    const days = parseDays(t.days);
    if (!days.includes(weekday)) continue;
    const tMin = hhmmToMinutes(t.time);
    if (tMin === null) continue;
    const dur = Number(t.durationMin) || 60;
    const place = t.place ? ` (${escapeHtml(t.place)})` : "";
    if (minutes >= tMin - 15 && minutes <= tMin + 20) {
      out.push({
        type: "tutor",
        key: String(t.id),
        toParent:
          `👨‍🏫 <b>Repetitor eslatmasi</b>\n👤 ${label}\n` +
          `⏰ ${escapeHtml(t.time)} — ${escapeHtml(t.subject)}${place}`,
        toChild: `👨‍🏫 <b>Repetitor darsingiz bor!</b>\n⏰ ${escapeHtml(t.time)} — ${escapeHtml(t.subject)}${place}\n\nBorishni unutmang!`,
      });
    }
    const endMin = tMin + dur;
    if (minutes >= endMin && minutes <= endMin + 40) {
      out.push({
        type: "tutor_end",
        key: String(t.id),
        toParent:
          `👨‍🏫 Farzandingiz repetitordan chiqdi — ${escapeHtml(t.subject)}.\n` +
          `📝 Endi bugungi mavzu bo'yicha test yarating:`,
        toChild: `👨‍🏫 <b>Repetitor darsi tugadi!</b> (${escapeHtml(t.subject)})\n\nEndi bugungi mavzu bo'yicha test yarating:`,
        parentKb: kb([[{ text: "📝 Test yaratish", callback_data: "nz:test" }]]),
      });
    }
  }
  return out;
}

/** Barcha faol ulanishlar uchun tegishli xabarlarni yuboradi (dedup bilan). */
export async function runDueNotifications(): Promise<{ sent: number; skipped: boolean }> {
  // Yengil qulf: 2 daqiqada bir marta ishlaydi (webhook + cron birga chaqirsa ham)
  try {
    const now = Date.now();
    const last = Number((await getSetting(NOTIFY_LOCK_KEY)) ?? "0");
    if (now - last < 100 * 1000) return { sent: 0, skipped: true };
    await setSetting(NOTIFY_LOCK_KEY, String(now));
  } catch {
    /* qulf bo'lmasa ham davom etamiz */
  }

  const { day, weekday, minutes } = nowTashkent();
  const links = await db
    .select()
    .from(nazoratchiLinks)
    .where(eq(nazoratchiLinks.status, "active"));
  let sent = 0;
  // Bir nechta ota-ona ulangan bo'lsa — bolaga xabar BIR MARTA ketadi
  const childSent = new Set<string>();
  for (const link of links) {
    try {
      const items = await dueForLink(link, day, weekday, minutes);
      for (const item of items) {
        if (await alreadySent(link.id, day, item.type, item.key)) continue;
        await sendSafe(link.parentTelegramId, item.toParent, item.parentKb, false, link.id);
        const ck = `${link.childTelegramId}|${item.type}|${item.key}`;
        if (item.toChild && !childSent.has(ck)) {
          childSent.add(ck);
          await sendSafe(
            link.childTelegramId,
            item.toChild,
            item.type === "tutor_end"
              ? kb([[{ text: "📝 Test yaratish", callback_data: "nz:test" }]])
              : undefined,
            true,
            link.id,
          );
        }
        sent++;
      }
    } catch (error) {
      await logError("nz_notify", error, link.parentTelegramId);
    }
  }
  return { sent, skipped: false };
}

// ---------------------------------------------------------------------------
// 📖 Yoriqnoma
// ---------------------------------------------------------------------------

export const NAZORATCHI_GUIDE = `📖 <b>Yoriqnoma — Nazoratchi</b>

<b>👁 Nazoratchi nima?</b>
Ota-ona va bola telefonlarini bog'laydigan nazorat bo'limi. U orqali:
• darslar boshlanishi/tugashi haqida avtomatik xabar olasiz;
• repetitor soatlarini eslatib turadi;
• farzandingizning bugungi baholarini bir tugmada ko'rasiz;
• AI yordamida kitob/mavzu bo'yicha test yaratib, bolani sinab ko'rasiz.

<b>1️⃣ Telefonlarni ulash (bir marta)</b>
1. <b>Ota-ona</b>: 👁 Nazoratchi → <b>🔗 Ulanish (kod olish)</b> → 6 xonali <b>kod</b> olinadi.
2. Kodni farzandingizga yuboring.
3. <b>Bola</b>: 👁 Nazoratchi → <b>👶 Kodni kiritish</b> → kodni yozadi.
4. ✅ Tayyor! Endi xabarlar boshlanadi.
5. Agar bir nechta farzandingiz bo'lsa — bot <b>"Bu qaysi farzandingiz?"</b> deb so'raydi.

<b>🔒 Muhim:</b> ulanishni <b>faqat ota-ona</b> o'chiradi — bola o'chira olmaydi!
Agar bola botni bloklasa — ota-ona darhol ogohlantirish oladi.

<b>2️⃣ Avtomatik xabarlar</b>
• 🎓 <b>Dars boshlandi</b> — birinchi dars boshlanganda (eMaktab jadvalidan).
• 🏁 <b>Dars tugadi</b> — oxirgi dars tugagach + <b>📊 Bugungi baholar</b> tugmasi.
• 👨‍🏫 <b>Repetitor</b> — soati yetganda eslatma (agar qo'shilgan bo'lsa).

<b>3️⃣ Repetitor qo'shish</b>
👁 Nazoratchi → ⏰ Repetitor → ➕ Qo'shish → fan, soat, kunlar, joy.
Bola repetitorga ketganda va chiqqanda xabarlar boradi.

<b>4️⃣ 📝 Test (AI bilan)</b>
👁 Nazoratchi → 📝 Test → (bola o'zi yoki ota-ona farzand uchun)

• <b>Kitob bo'yicha</b>: kitob nomi → muallifi → betlar;
• <b>Mavzu bo'yicha</b>: bugungi mavzu (repetitordan keyin).

Sun'iy agent savol yaratadi va <b>bir vaqtda</b> yuboradi:
• 👨‍👩‍👧 Ota-onaga — <b>to'g'ri javob BILAN</b>;
• 👦 Bolaga — faqat variantlar (javob aytilmaydi).

Bola variantni bosadi → natija <b>darhol ota-onaga</b> ko'rinadi
(to'g'ri/xato, nima tanlagani).

<b>5️⃣ 📊 Bugungi baholar</b>
🏁 "Dars tugadi" xabari ostidagi tugma — eMaktabdagi <b>aynan bugungi</b>
baholar (fan va baho ko'rinishida).

<b>❓ Tez-tez so'raladigan savollar</b>
• <i>Farzandim telefoni yo'q — ishlaydimi?</i> Ha! Ota-ona hisobidan eMaktab
jadvali olinadi, xabarlar ota-onaga boradi. Test uchun bola Telegramda bo'lishi kerak.
• <i>Ikki ota-ona ulansa bo'ladimi?</i> Ha — har biri o'z kodini kiritadi.
• <i>Bola kodni o'zi o'chirsa?</i> Bo'lmaydi — uzish tugmasi faqat ota-onada.

[🏠 Asosiy sahifa]`;

// ---------------------------------------------------------------------------
// Klaviaturalar
// ---------------------------------------------------------------------------

export function nazoratchiHomeKeyboard(hasLinks: boolean, isParentSide: boolean): ReplyMarkup {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  rows.push([{ text: "📝 Test yaratish", callback_data: "nz:test" }]);
  if (isParentSide) {
    rows.push([
      { text: "📊 Bugungi baholar", callback_data: "nz:grades" },
      { text: "⏰ Repetitor", callback_data: "nz:tutor" },
    ]);
  }
  // Ulanish har doim ko'rinadi — yangi ota-ona ham, bola ham
  rows.push([{ text: "🔗 Ulanishlar", callback_data: "nz:links" }]);
  rows.push([
    { text: "🔗 Ulanish (kod olish)", callback_data: "nz:pair" },
    { text: "👶 Kodni kiritish", callback_data: "nz:codebtn" },
  ]);
  rows.push([
    { text: "📖 Yoriqnoma", callback_data: "nz:help" },
    { text: "🏠 Asosiy sahifa", callback_data: "menu:home" },
  ]);
  return kb(rows);
}
