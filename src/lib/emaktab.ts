// ============================================================================
// eMaktab (kundalik.com) klienti
// ----------------------------------------------------------------------------
// eMaktab cookie-based autentifikatsiyadan foydalanadi:
//   1. POST https://login.emaktab.uz/login  → 302 + cookie'lar (UZDnevnikAuth_a, t0, ...)
//   2. Cookie'lar bilan https://emaktab.uz/api/... endpointlariga so'rov yuboriladi.
//
// Ma'lumot uchun asosiy manbalar (cookie auth, OAuth kerak emas):
//   - GET  /api/userfeed                     → bosh sahifa state (jadval + baholar + kontekst)
//   - GET  /api/v2/marks/diary               → kunlik kundalik (baholar, darslar, uy vazifalari)
//   - GET  /api/v2/persons/{p}/groups/{g}/schedules → dars jadvali
//   - GET  /api/userfeed/posts               → yangiliklar lentasi (maktab/sinf e'lonlari)
//   - GET  /api/v2/users/me, /api/v2/users/me/context, /api/v2/users/me/children
//
// Barcha ID'lar (personId/schoolId/groupId) 19+ xonali — ular doimo STRING sifatida
// saqlanadi va yuboriladi (Number.MAX_SAFE_INTEGER dan katta).
// ============================================================================

const WEB_BASE = "https://emaktab.uz";
const LOGIN_URL = "https://login.emaktab.uz/login";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// O'zbekiston (Toshkent) uchun UTC+5 — eMaktab ham shu offsetni qaytaradi (utcOffset: 300).
export const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Modellar
// ---------------------------------------------------------------------------

export type EmaktabLoginStatus =
  | { status: "ok"; session: EmaktabSession }
  | { status: "invalid_credentials"; message: string }
  | { status: "captcha_required"; message: string }
  | { status: "error"; message: string };

export interface PersonContext {
  personId: string;
  schoolId: string;
  groupId: string;
  fullName: string;
  schoolName: string;
  groupName: string;
}

export interface EmaktabSession {
  cookies: Record<string, string>;
  userId: string;
  role: "student" | "parent" | "teacher";
  fullName: string;
  /** Faol o'quvchi konteksti (ota-ona uchun — tanlangan farzand). */
  active: PersonContext;
  /** Barcha kontekstlar (ota-ona akkauntida bir nechta farzand bo'lishi mumkin). */
  persons: PersonContext[];
}

export interface Lesson {
  number: number;
  subject: string;
  teacher: string | null;
  theme: string | null;
  startTime: string | null; // "08:00"
  endTime: string | null; // "08:45"
  room: string | null;
  isCanceled: boolean;
  homework: string | null;
  homeworkDone: boolean;
  marks: number[];
  isImportantWork: boolean;
}

export interface DaySchedule {
  date: string; // YYYY-MM-DD (Toshkent vaqti)
  weekday: number; // 0 = Dushanba
  lessons: Lesson[];
}

export interface Grade {
  date: string; // YYYY-MM-DD (Toshkent vaqti)
  subject: string;
  values: number[];
  workType: string | null;
  comment: string | null;
  isFinal: boolean;
}

export interface NewsPost {
  id: string | null;
  title: string | null;
  text: string;
  author: string | null;
  community: string | null;
  date: string | null; // YYYY-MM-DD
  url: string | null;
}

// ---------------------------------------------------------------------------
// Cookie yordamchilari
// ---------------------------------------------------------------------------

function mergeCookies(jar: Record<string, string>, res: Response) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];

  for (const cookieStr of raw) {
    const pair = cookieStr.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    jar[name] = value;
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// Vaqt yordamchilari (Toshkent, UTC+5)
// ---------------------------------------------------------------------------

export function tashkentDayKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function tashkentDayKeyFromTs(tsSec: number): string {
  return tashkentDayKey(new Date(tsSec * 1000));
}

/** YYYY-MM-DD (Toshkent) kunining 00:00:00 UTC timestamp'i (soniyada). */
export function dayStartTs(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - TZ_OFFSET_MS) / 1000);
}

export function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days) - TZ_OFFSET_MS);
  return tashkentDayKey(shifted);
}

export function dayWeekday(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  // Toshkentdagi hafta kuni UTC bilan bir xil (offset kun chegarasini yiqitmaydi,
  // chunki dayKey allaqachon mahalliy sana).
  return (utc.getUTCDay() + 6) % 7; // 0 = Dushanba
}

// ---------------------------------------------------------------------------
// Xatolar
// ---------------------------------------------------------------------------

export class EmaktabAuthError extends Error {
  constructor(message = "eMaktab sessiyasi tugagan") {
    super(message);
    this.name = "EmaktabAuthError";
  }
}

export class EmaktabApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmaktabApiError";
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  "login.login.error.emailorpassword": "Login yoki parol noto'g'ri.",
  "login.login.error.captcha": "Rasmdagi kod noto'g'ri kiritildi.",
};

function extractLoginErrors(html: string): { hasErrors: boolean; text?: string; exceededAttempts?: boolean } | null {
  const jsonMatch = html.match(/JSON\.parse\('([^']*)'\)/);
  if (!jsonMatch) return null;
  try {
    const decoded = jsonMatch[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    const data = JSON.parse(decoded) as {
      hasErrors?: boolean;
      firstErrorText?: string | null;
      exceededAttempts?: boolean;
      isWrongCaptcha?: boolean;
    };
    return {
      hasErrors: Boolean(data.hasErrors),
      text: data.firstErrorText ? ERROR_MESSAGES[data.firstErrorText] : undefined,
      exceededAttempts: Boolean(data.exceededAttempts),
    };
  } catch {
    return null;
  }
}

/**
 * eMaktab'ga kiradi va cookie'larni qaytaradi.
 * Muvaffaqiyat: 302 redirect yoki UZDnevnikAuth_a cookie'si paydo bo'lishi.
 */
async function performLogin(login: string, password: string): Promise<Record<string, string>> {
  const jar: Record<string, string> = {};

  // 1. Login sahifasini olish — sst va boshqa cookie'lar shu yerda beriladi.
  const getRes = await fetch(LOGIN_URL, {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "uz-UZ,uz;q=0.9,en;q=0.8,ru;q=0.7",
    },
  });
  mergeCookies(jar, getRes);

  // 2. Formani yuborish (brauzer bilan bir xil).
  const body = new URLSearchParams({
    exceededAttempts: "False",
    ReturnUrl: "",
    FingerprintId: "",
    login,
    password,
  });

  const postRes = await fetch(LOGIN_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "uz-UZ,uz;q=0.9,en;q=0.8,ru;q=0.7",
      Referer: LOGIN_URL,
      Origin: "https://login.emaktab.uz",
      Cookie: cookieHeader(jar),
    },
    body: body.toString(),
  });
  mergeCookies(jar, postRes);

  // 3. Natijani baholash.
  const redirected = postRes.status >= 300 && postRes.status < 400;
  const hasAuthCookie = Boolean(jar["UZDnevnikAuth_a"]);

  if (redirected || hasAuthCookie) {
    return jar;
  }

  const html = await postRes.text();
  const errors = extractLoginErrors(html);
  if (errors?.exceededAttempts) {
    throw new EmaktabAuthError("captcha");
  }
  if (errors?.hasErrors) {
    throw new EmaktabAuthError(errors.text ?? "Login yoki parol noto'g'ri.");
  }
  throw new EmaktabAuthError("unknown");
}

/**
 * Login/parolni tekshiradi va to'liq sessiya (cookie + profil konteksti) qaytaradi.
 */
export async function loginEmaktab(login: string, password: string): Promise<EmaktabLoginStatus> {
  try {
    const cookies = await performLogin(login, password);
    const session = await buildSession(cookies, login);
    return { status: "ok", session };
  } catch (error) {
    if (error instanceof EmaktabAuthError) {
      if (error.message === "captcha") {
        return {
          status: "captcha_required",
          message:
            "Urinishlar soni ko'p bo'lgani uchun eMaktab rasmiy saytida (login.emaktab.uz) rasmli kodni kiritish talab qilinmoqda. Birozdan so'ng qayta urinib ko'ring.",
        };
      }
      if (error.message === "unknown") {
        return {
          status: "error",
          message: "eMaktab serveridan kutilmagan javob keldi. Birozdan so'ng qayta urinib ko'ring.",
        };
      }
      return { status: "invalid_credentials", message: error.message };
    }
    console.error("loginEmaktab failed", error);
    return {
      status: "error",
      message: "eMaktab bilan bog'lanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring.",
    };
  }
}

// ---------------------------------------------------------------------------
// API so'rovlari
// ---------------------------------------------------------------------------

async function apiGet(
  cookies: Record<string, string>,
  path: string,
  params?: Record<string, string | number>,
): Promise<{ status: number; text: string; contentType: string }> {
  const url = new URL(WEB_BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "uz-UZ,uz;q=0.9,en;q=0.8,ru;q=0.7",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${WEB_BASE}/userfeed`,
      Cookie: cookieHeader(cookies),
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new EmaktabAuthError();
  }
  const text = await res.text();
  return {
    status: res.status,
    text,
    contentType: res.headers.get("content-type") ?? "",
  };
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function nameFromPerson(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const p = obj as Record<string, unknown>;
  const first = str(p.firstName ?? p.first_name ?? "");
  const last = str(p.lastName ?? p.last_name ?? "");
  const middle = str(p.middleName ?? "");
  return [last, first, middle].filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------------------
// Bosh sahifa state (`window.__USER__START__PAGE__INITIAL__STATE__`)
// ---------------------------------------------------------------------------

type StartState = {
  userSchedule?: {
    children?: Array<{
      schoolId?: string;
      groupId?: string;
      personId?: string;
      schedule?: { days?: unknown[] };
    }>;
  };
  userMarks?: {
    children?: Array<{
      schoolId?: string;
      groupId?: string;
      personId?: string;
      marks?: unknown[];
    }>;
  };
  userContext?: {
    contextPersons?: unknown[];
  };
};

export function extractStartState(html: string): StartState | null {
  const marker = "window.__USER__START__PAGE__INITIAL__STATE__";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const eq = html.indexOf("=", idx);
  if (eq === -1) return null;

  // Birinchi '{' dan boshlab to'liq JSON obyektini qo'lda skanerlaymiz
  // (HTML ichida JS kod davom etgani uchun sodda JSON.parse ishlamaydi).
  const start = html.indexOf("{", eq);
  if (start === -1) return null;
  try {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(html.slice(start, i + 1)) as StartState;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchStartState(cookies: Record<string, string>): Promise<StartState | null> {
  try {
    const res = await apiGet(cookies, "/api/userfeed");
    if (res.status !== 200) return null;

    if (res.contentType.includes("json")) {
      const data = parseJson(res.text) as StartState | null;
      if (data && typeof data === "object") return data;
    }
    return extractStartState(res.text);
  } catch (error) {
    if (error instanceof EmaktabAuthError) throw error;
    console.error("fetchStartState failed", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sessiya qurish (profil konteksti)
// ---------------------------------------------------------------------------

export function personsFromStartState(state: StartState | null): PersonContext[] {
  if (!state) return [];
  const persons: PersonContext[] = [];
  const contextPersons = state.userContext?.contextPersons ?? [];

  for (const raw of contextPersons) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const personId = str(p.personId);
    if (!personId) continue;
    const school = (p.school ?? {}) as Record<string, unknown>;
    const group = (p.group ?? {}) as Record<string, unknown>;
    persons.push({
      personId,
      schoolId: str(school.id) || str(p.schoolId),
      groupId: str(group.id) || str(p.groupId),
      fullName: nameFromPerson(p) || str(p.shortName),
      schoolName: str(school.name),
      groupName: str(group.name),
    });
  }

  // Agar contextPersons bo'sh bo'lsa — userSchedule.children dan yig'amiz.
  if (persons.length === 0) {
    for (const ch of state.userSchedule?.children ?? []) {
      if (!ch?.personId) continue;
      persons.push({
        personId: str(ch.personId),
        schoolId: str(ch.schoolId),
        groupId: str(ch.groupId),
        fullName: "",
        schoolName: "",
        groupName: "",
      });
    }
  }
  return persons;
}

async function buildSession(cookies: Record<string, string>, login: string): Promise<EmaktabSession> {
  let persons: PersonContext[] = [];
  let fullName = login;
  let role: EmaktabSession["role"] = "student";

  const state = await fetchStartState(cookies);
  persons = personsFromStartState(state);

  // Qo'shimcha: users/me + context + children (fallback uchun).
  try {
    const meRes = await apiGet(cookies, "/api/v2/users/me");
    if (meRes.status === 200) {
      const me = parseJson(meRes.text) as Record<string, unknown> | null;
      const name = me ? nameFromPerson(me) : "";
      if (name) fullName = name;
    }
  } catch (error) {
    if (error instanceof EmaktabAuthError) throw error;
  }

  if (persons.length === 0) {
    try {
      const ctxRes = await apiGet(cookies, "/api/v2/users/me/context");
      if (ctxRes.status === 200) {
        const ctx = parseJson(ctxRes.text) as unknown;
        const list = Array.isArray(ctx) ? ctx : ctx ? [ctx] : [];
        for (const raw of list) {
          if (!raw || typeof raw !== "object") continue;
          const p = raw as Record<string, unknown>;
          const personId = str(p.personId ?? p.person_id);
          if (!personId) continue;
          persons.push({
            personId,
            schoolId: str(p.schoolId ?? p.school_id),
            groupId: str(p.eduGroupId ?? p.edu_group_id ?? p.groupId),
            fullName,
            schoolName: str(p.schoolName ?? p.school_name),
            groupName: str(p.groupName ?? p.group_name),
          });
        }
      }
    } catch (error) {
      if (error instanceof EmaktabAuthError) throw error;
    }
  }

  try {
    const childrenRes = await apiGet(cookies, "/api/v2/users/me/children");
    if (childrenRes.status === 200) {
      const children = parseJson(childrenRes.text);
      if (Array.isArray(children) && children.length > 0) {
        role = "parent";
        for (const raw of children) {
          if (!raw || typeof raw !== "object") continue;
          const c = raw as Record<string, unknown>;
          const personId = str(c.personId ?? c.person_id ?? c.person);
          if (!personId) continue;
          persons.push({
            personId,
            schoolId: str(c.schoolId ?? c.school_id),
            groupId: str(c.eduGroupId ?? c.group_id ?? c.groupId),
            fullName: str(c.shortName ?? c.name ?? c.fullName) || nameFromPerson(c),
            schoolName: str(c.schoolName ?? c.school_name),
            groupName: str(c.groupName ?? c.group_name),
          });
        }
      }
    }
  } catch (error) {
    if (error instanceof EmaktabAuthError) throw error;
  }

  // Dublikatlarni tozalash (personId bo'yicha).
  const seen = new Set<string>();
  persons = persons.filter((p) => {
    if (!p.personId || seen.has(p.personId)) return false;
    seen.add(p.personId);
    return true;
  });

  if (persons.length === 0) {
    throw new EmaktabApiError(
      "eMaktab profilingizda o'quvchi konteksti topilmadi. Iltimos, emaktab.uz saytida profilingizni tekshiring.",
    );
  }

  const userIdCookie = cookies["t0"] ?? "";
  return {
    cookies,
    userId: userIdCookie,
    role,
    fullName: fullName || login,
    active: persons[0],
    persons,
  };
}

// ---------------------------------------------------------------------------
// Kunlik kundalik (marks/diary) — baholar + darslar + uy vazifalari
// ---------------------------------------------------------------------------

type DiaryLesson = {
  number?: number;
  place?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  hours?: { startHour?: string | number; startMinute?: string | number; endHour?: string | number; endMinute?: string | number };
  isCanceled?: boolean;
  theme?: string | null;
  subject?: { name?: string } | string;
  teacher?: { firstName?: string; lastName?: string } | string | null;
  teacherName?: string | null;
  teachers?: Array<{ firstName?: string; lastName?: string; name?: string }>;
  homework?: { text?: string | null; isCompleted?: boolean } | null;
  workMarks?: Array<{ marks?: Array<{ value?: string | number }> }>;
  importantWorks?: unknown[];
  comment?: string | null;
};

type DiaryDay = {
  date?: string | number;
  lessons?: DiaryLesson[];
  marks?: Array<Record<string, unknown>>;
  hasImportantWork?: boolean;
};

async function fetchDiaryDays(
  session: EmaktabSession,
  fromDay: string,
  toDay: string,
): Promise<DiaryDay[]> {
  const res = await apiGet(session.cookies, "/api/v2/marks/diary", {
    personId: session.active.personId,
    schoolId: session.active.schoolId,
    startDate: dayStartTs(fromDay),
    finishDate: dayStartTs(toDay) + 24 * 3600 - 1,
    timestamp: Date.now(),
  });
  if (res.status !== 200) return [];
  const data = parseJson(res.text) as { days?: DiaryDay[] } | null;
  return Array.isArray(data?.days) ? data!.days! : [];
}

function lessonTime(hours?: DiaryLesson["hours"], fallbackStart?: string | null, fallbackEnd?: string | null): { start: string | null; end: string | null } {
  if (hours && hours.startHour !== undefined && hours.startHour !== null) {
    const pad = (v: string | number | undefined) => String(v ?? 0).padStart(2, "0");
    return {
      start: `${pad(hours.startHour)}:${pad(hours.startMinute)}`,
      end: `${pad(hours.endHour)}:${pad(hours.endMinute)}`,
    };
  }
  const fmt = (ts?: string | number | null) => {
    if (!ts) return null;
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    const d = new Date(n * 1000 + TZ_OFFSET_MS);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };
  return { start: fmt(fallbackStart), end: fmt(fallbackEnd) };
}

function lessonFromDiary(raw: DiaryLesson): Lesson {
  const subject =
    typeof raw.subject === "string"
      ? raw.subject
      : raw.subject?.name || "Noma'lum fan";

  let teacher: string | null = null;
  if (typeof raw.teacher === "string" && raw.teacher) teacher = raw.teacher;
  else if (raw.teacher && typeof raw.teacher === "object") {
    teacher = nameFromPerson(raw.teacher) || null;
  } else if (raw.teacherName) teacher = String(raw.teacherName);
  else if (Array.isArray(raw.teachers) && raw.teachers.length > 0) {
    teacher = raw.teachers.map((t) => t.name || nameFromPerson(t)).filter(Boolean).join(", ") || null;
  }

  const marks: number[] = [];
  for (const wm of raw.workMarks ?? []) {
    for (const m of wm?.marks ?? []) {
      const v = Number(m?.value);
      if (Number.isFinite(v)) marks.push(v);
    }
  }

  const time = lessonTime(raw.hours, raw.startTime, raw.endTime);

  return {
    number: Number(raw.number) || 0,
    subject,
    teacher,
    theme: raw.theme || null,
    startTime: time.start,
    endTime: time.end,
    room: raw.place || null,
    isCanceled: Boolean(raw.isCanceled),
    homework: raw.homework?.text?.trim() || null,
    homeworkDone: Boolean(raw.homework?.isCompleted),
    marks,
    isImportantWork: Array.isArray(raw.importantWorks) && raw.importantWorks.length > 0,
  };
}

function dayKeyFromDiaryDate(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return tashkentDayKey();
  const n = Number(value);
  if (Number.isFinite(n) && n > 1e8) return tashkentDayKeyFromTs(n > 1e12 ? n / 1000 : n);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return tashkentDayKey();
}

export function scheduleFromDiaryDays(days: DiaryDay[]): DaySchedule[] {
  return days
    .map((day) => {
      const date = dayKeyFromDiaryDate(day.date);
      const lessons = (day.lessons ?? []).map(lessonFromDiary).sort((a, b) => a.number - b.number);
      return { date, weekday: dayWeekday(date), lessons };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function gradesFromDiaryDays(days: DiaryDay[]): Grade[] {
  const grades: Grade[] = [];
  for (const day of days) {
    const dayKey = dayKeyFromDiaryDate(day.date);

    // 1. day.marks (klassik struktura)
    for (const raw of day.marks ?? []) {
      const markRaw = raw as Record<string, unknown>;
      const values: number[] = [];
      const marksArr = Array.isArray(markRaw.marks) ? markRaw.marks : [markRaw];
      for (const m of marksArr) {
        const rec = (m ?? {}) as Record<string, unknown>;
        const v = Number(rec.value ?? rec.mark ?? rec.markValue);
        if (Number.isFinite(v)) values.push(v);
      }
      const subject =
        typeof markRaw.subject === "string"
          ? markRaw.subject
          : str((markRaw.subject as Record<string, unknown> | undefined)?.name) || "Noma'lum fan";
      if (values.length === 0) continue;
      grades.push({
        date: markRaw.lessonDate ? dayKeyFromDiaryDate(markRaw.lessonDate as string | number) : dayKey,
        subject,
        values,
        workType: str(markRaw.markTypeText) || null,
        comment: str(markRaw.comment) || null,
        isFinal: Boolean(markRaw.isFinal),
      });
    }

    // 2. day.lessons[].workMarks (kundalik darajasidagi baholar)
    for (const lesson of day.lessons ?? []) {
      const values: number[] = [];
      for (const wm of lesson.workMarks ?? []) {
        for (const m of wm?.marks ?? []) {
          const v = Number(m?.value);
          if (Number.isFinite(v)) values.push(v);
        }
      }
      if (values.length === 0) continue;
      grades.push({
        date: dayKey,
        subject: typeof lesson.subject === "string" ? lesson.subject : lesson.subject?.name || "Noma'lum fan",
        values,
        workType: lesson.theme || null,
        comment: lesson.comment || null,
        isFinal: false,
      });
    }
  }
  return grades.sort((a, b) => b.date.localeCompare(a.date));
}

function scheduleFromStartState(state: StartState | null, personId: string): DaySchedule[] {
  if (!state) return [];
  const child =
    state.userSchedule?.children?.find((c) => str(c.personId) === personId) ??
    state.userSchedule?.children?.[0];
  const days = (child?.schedule?.days ?? []) as DiaryDay[];
  return scheduleFromDiaryDays(days);
}

function gradesFromStartState(state: StartState | null, personId: string): Grade[] {
  if (!state) return [];
  const child =
    state.userMarks?.children?.find((c) => str(c.personId) === personId) ??
    state.userMarks?.children?.[0];
  // userMarks.children[].marks — har bir yozuvda sana va marks[] massivi bor.
  const grades: Grade[] = [];
  for (const raw of child?.marks ?? []) {
    const markRaw = raw as Record<string, unknown>;
    const values: number[] = [];
    for (const m of (Array.isArray(markRaw.marks) ? markRaw.marks : []) as Array<Record<string, unknown>>) {
      const v = Number(m?.value ?? m?.mark);
      if (Number.isFinite(v)) values.push(v);
    }
    if (values.length === 0) continue;
    grades.push({
      date: dayKeyFromDiaryDate(markRaw.lessonDate as string | number ?? markRaw.date as string | number),
      subject: str((markRaw.subject as Record<string, unknown> | undefined)?.name) || "Noma'lum fan",
      values,
      workType: str(markRaw.markTypeText) || null,
      comment: null,
      isFinal: Boolean(markRaw.isFinal),
    });
  }
  return grades.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Ommaviy so'rovlar
// ---------------------------------------------------------------------------

export interface Overview {
  schedule: DaySchedule[];
  grades: Grade[];
  persons: PersonContext[];
  source: "api" | "diary" | "state";
}

/**
 * Bir so'rovda jadval + baholarni oladi. Avval /api/userfeed (bosh sahifa state),
 * bo'lmasa /api/v2/marks/diary orqali.
 */
export async function fetchOverview(session: EmaktabSession, fromDay: string, toDay: string): Promise<Overview> {
  // 1-urinish: bosh sahifa state (jadval + so'nggi baholar).
  const state = await fetchStartState(session.cookies);
  if (state) {
    const schedule = scheduleFromStartState(state, session.active.personId);
    const grades = gradesFromStartState(state, session.active.personId);
    const persons = personsFromStartState(state);
    if (schedule.length > 0 || grades.length > 0) {
      return { schedule, grades, persons, source: "state" };
    }
  }

  // 2-urinish: diary endpointi (sana oralig'i bo'yicha).
  const days = await fetchDiaryDays(session, fromDay, toDay);
  return {
    schedule: scheduleFromDiaryDays(days),
    grades: gradesFromDiaryDays(days),
    persons: [],
    source: "diary",
  };
}

/** Berilgan sana oralig'idagi dars jadvalini oladi. */
export async function fetchSchedule(
  session: EmaktabSession,
  fromDay: string,
  toDay: string,
): Promise<DaySchedule[]> {
  // 1-urinish: maxsus schedules endpointi (o'qituvchi nomlari bilan).
  if (session.active.groupId) {
    try {
      const res = await apiGet(
        session.cookies,
        `/api/v2/persons/${session.active.personId}/groups/${session.active.groupId}/schedules`,
        { from: fromDay, to: toDay },
      );
      if (res.status === 200) {
        const data = parseJson(res.text) as { days?: DiaryDay[] } | DiaryDay[] | null;
        const days = Array.isArray(data) ? data : data?.days;
        if (Array.isArray(days) && days.length > 0) {
          return scheduleFromDiaryDays(days);
        }
      }
    } catch (error) {
      if (error instanceof EmaktabAuthError) throw error;
    }
  }

  // 2-urinish: diary.
  const days = await fetchDiaryDays(session, fromDay, toDay);
  const schedule = scheduleFromDiaryDays(days);
  if (schedule.length > 0) return schedule;

  // 3-urinish: bosh sahifa state.
  const state = await fetchStartState(session.cookies);
  return scheduleFromStartState(state, session.active.personId);
}

/** So'nggi baholarni oladi (oxirgi `days` kun). */
export async function fetchGrades(session: EmaktabSession, days = 14): Promise<Grade[]> {
  const toDay = tashkentDayKey();
  const fromDay = shiftDayKey(toDay, -days);
  const diaryDays = await fetchDiaryDays(session, fromDay, toDay);
  const grades = gradesFromDiaryDays(diaryDays);
  if (grades.length > 0) return grades;

  const state = await fetchStartState(session.cookies);
  return gradesFromStartState(state, session.active.personId);
}

// ---------------------------------------------------------------------------
// Yangiliklar
// ---------------------------------------------------------------------------

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function parseFeedDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n > 1e8) return tashkentDayKeyFromTs(n > 1e12 ? n / 1000 : n);
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return tashkentDayKey(new Date(parsed));
  return null;
}

export function newsFromUnknown(data: unknown): NewsPost[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { posts?: unknown[] })?.posts)
      ? (data as { posts: unknown[] }).posts
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : Array.isArray((data as { feed?: unknown[] })?.feed)
            ? (data as { feed: unknown[] }).feed
            : [];

  const posts: NewsPost[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const text = pickString(p.text, p.message, p.content, p.body, p.description, p.htmlContent);
    const title = pickString(p.title, p.subject, p.header);
    if (!text && !title) continue;

    const authorObj = (p.author ?? p.user ?? p.sender ?? p.createdBy) as Record<string, unknown> | undefined;
    const communityObj = (p.community ?? p.club ?? p.group ?? p.network ?? p.wall) as Record<string, unknown> | undefined;

    posts.push({
      id: pickString(p.id, p.postId),
      title,
      text: text ?? "",
      author: (authorObj ? nameFromPerson(authorObj) : null) ?? pickString(p.authorName, p.userName),
      community: (communityObj ? pickString(communityObj.name, communityObj.title) : null) ?? pickString(p.communityName, p.clubName, p.groupName),
      date: parseFeedDate(p.date ?? p.createdDate ?? p.publishDate ?? p.createdAt ?? p.publishedAt),
      url: pickString(p.url, p.pageUrl, p.link),
    });
  }
  return posts;
}

/** Maktab/sinf yangiliklarini (e'lonlarini) oladi. */
export async function fetchNews(session: EmaktabSession, limit = 8): Promise<NewsPost[]> {
  const attempts: Array<() => Promise<unknown>> = [
    async () => {
      const res = await apiGet(session.cookies, "/api/userfeed/posts", { count: limit, offset: 0 });
      return res.status === 200 ? parseJson(res.text) : null;
    },
    async () => {
      const res = await apiGet(session.cookies, "/api/userfeed/posts");
      return res.status === 200 ? parseJson(res.text) : null;
    },
    async () => {
      const res = await apiGet(session.cookies, "/api/posts", { count: limit, offset: 0 });
      return res.status === 200 ? parseJson(res.text) : null;
    },
    async () => {
      const res = await apiGet(session.cookies, "/api/posts");
      return res.status === 200 ? parseJson(res.text) : null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const data = await attempt();
      const posts = newsFromUnknown(data);
      if (posts.length > 0) return posts.slice(0, limit);
    } catch (error) {
      if (error instanceof EmaktabAuthError) throw error;
      // keyingi urinishga o'tamiz
    }
  }
  return [];
}
