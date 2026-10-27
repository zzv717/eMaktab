import { createHash } from "crypto";

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
const LOGIN_BASE = "https://login.emaktab.uz/";
const LOGIN_URL = "https://login.emaktab.uz/login";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
// Login uchun mobil UA — ishlaydigan botlar (kbot2) aynan shundan foydalanadi.
const LOGIN_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

// O'zbekiston (Toshkent) uchun UTC+5 — eMaktab ham shu offsetni qaytaradi (utcOffset: 300).
export const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Modellar
// ---------------------------------------------------------------------------

export type EmaktabLoginStatus =
  | { status: "ok"; session: EmaktabSession }
  | { status: "invalid_credentials"; message: string }
  | {
      status: "captcha_required";
      message: string;
      /** Captcha rasm manzili — foydalanuvchiga ko'rsatiladi. */
      captchaUrl?: string;
      /** Captcha yechilgandan keyin POST qilish uchun forma holati. */
      formState?: LoginFormState;
    }
  | { status: "error"; message: string };

/** Login formasi holati — captcha yechilguncha saqlanadi. */
export interface LoginFormState {
  cookies: Record<string, string>;
  hidden: Record<string, string>;
  postUrl: string;
  captchaUrl: string | null;
}

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
  /** O'qituvchi bo'lsa — sinf rahbari bo'lgan sinflar IDlari. */
  classTeacherGroupIds: string[];
}

export interface Lesson {
  number: number;
  subject: string;
  teacher: string | null;
  /** Dars o'tiladigan sinf (o'qituvchi jadvali uchun). */
  groupName: string | null;
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

type LoginErrorState = {
  hasErrors: boolean;
  text?: string;
  exceededAttempts?: boolean;
  isWrongCaptcha?: boolean;
};

function extractLoginErrors(html: string): LoginErrorState | null {
  // BARCHA JSON.parse bloblarini ko'rib chiqamiz — login modeli birinchisi bo'lmasligi mumkin.
  const blobRe = /JSON\.parse\('([^']*)'\)/g;
  let best: LoginErrorState | null = null;
  let m: RegExpExecArray | null;
  while ((m = blobRe.exec(html)) !== null) {
    try {
      const decoded = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
      const data = JSON.parse(decoded) as {
        hasErrors?: boolean;
        firstErrorText?: string | null;
        exceededAttempts?: boolean;
        isWrongCaptcha?: boolean;
      };
      const looksLikeLoginModel =
        "hasErrors" in data || "firstErrorText" in data || "exceededAttempts" in data || "isWrongCaptcha" in data;
      if (!looksLikeLoginModel) continue;
      const state: LoginErrorState = {
        hasErrors: Boolean(data.hasErrors),
        text: data.firstErrorText ? ERROR_MESSAGES[data.firstErrorText] : undefined,
        exceededAttempts: Boolean(data.exceededAttempts),
        isWrongCaptcha: Boolean(data.isWrongCaptcha),
      };
      if (state.hasErrors || state.exceededAttempts || state.isWrongCaptcha || state.text) return state;
      best = best ?? state;
    } catch {
      /* JSON buzilgan bo'lsa — keyingi blobga o'tamiz */
    }
  }
  if (best) return best;

  // Raw fallback: model ochiq matnda ko'rinsa ham tanimaymiz.
  if (/"hasErrors"\s*:\s*true/i.test(html) || /exceededAttempts\s*[:=]\s*true/i.test(html) || /isWrongCaptcha\s*[:=]\s*true/i.test(html)) {
    const rawText = html.match(/"firstErrorText"\s*:\s*"([^"]{2,80})"/i)?.[1];
    return {
      hasErrors: /"hasErrors"\s*:\s*true/i.test(html),
      text: rawText ? ERROR_MESSAGES[rawText] ?? rawText : undefined,
      exceededAttempts: /exceededAttempts\s*[:=]\s*true/i.test(html),
      isWrongCaptcha: /isWrongCaptcha\s*[:=]\s*true/i.test(html),
    };
  }

  // HTML fallback: eMaktab xatoni JSON blob emas, oddiy HTML'da ham ko'rsatadi.
  const htmlError = html.match(
    /class="[^"]*(?:validation-summary-errors|field-validation-error|login__body__error|input-validation-error)[^"]*"[^>]*>([\s\S]{0,120}?)</i,
  );
  const htmlText = htmlError?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const exceeded = /exceededAttempts\s*[:=]\s*true/i.test(html);
  const wrongCaptcha = /isWrongCaptcha\s*[:=]\s*true|wrong.?captcha|noto'g'ri captcha/i.test(html);
  if (htmlText || exceeded || wrongCaptcha) {
    return { hasErrors: Boolean(htmlText), text: htmlText || undefined, exceededAttempts: exceeded, isWrongCaptcha: wrongCaptcha };
  }
  return null;
}

/** hasErrors atrofidagi xom matn (diagnostika — model qanday ekanini ko'rish uchun). */
export function ctxOf(body: string): string {
  const i = body.search(/hasErrors|firstErrorText|exceededAttempts/i);
  if (i < 0) return body.slice(0, 70).replace(/\s+/g, " ");
  return body.slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, " ");
}

/** Javob tarkibidagi qisqa belgilar (diagnostika uchun). */
function bodyMarkers(body: string): string {
  const bits: string[] = [];
  if (/JSON\.parse\(/.test(body)) bits.push("json");
  if (captchaVisible(body)) bits.push("captchaImg");
  if (hasLoginForm(body)) bits.push("form");
  if (extractCaptchaUrl(body, "https://login.emaktab.uz/")) bits.push("captchaUrl");
  const err = extractLoginErrors(body);
  if (err) bits.push(`err=${err.text ? err.text.slice(0, 30) : err.hasErrors ? "1" : "0"}`);
  return bits.join("|").slice(0, 60);
}

// ---------------------------------------------------------------------------
// Login sahifasi parserlari (jamoaviy ochiq kodga mos: bakhromov-coder/kundalik)
// ---------------------------------------------------------------------------

function attrOf(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
}

/** Formadagi barcha type="hidden" maydonlar (atribut tartibi va qo'shtirnoq turidan mustasno). */
export function parseHiddenInputs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const tags = html.match(/<input\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const type = (attrOf(tag, "type") ?? "").toLowerCase();
    if (type !== "hidden") continue;
    const name = attrOf(tag, "name");
    if (!name) continue;
    out[name] = attrOf(tag, "value") ?? "";
  }
  return out;
}

/** Birinchi <form> elementining action qiymati. */
export function formAction(html: string): string | null {
  const m = html.match(/<form\b[^>]*>/i);
  if (!m) return null;
  return attrOf(m[0], "action");
}

/** Sahifada hali kirish formasi turibdimi (input name="password") — ya'ni kirilmadi. */
export function hasLoginForm(html: string): boolean {
  const tags = html.match(/<input\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if ((attrOf(tag, "name") ?? "").toLowerCase() === "password") return true;
  }
  return false;
}

/** Captcha ochiq ko'rinayotganmi (login__body__captcha, lekin _hidden emas). */
export function captchaVisible(html: string): boolean {
  const tags = html.match(/<div\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const cls = (attrOf(tag, "class") ?? "").split(/\s+/);
    if (cls.includes("login__body__captcha") && !cls.includes("login__body__captcha_hidden")) {
      return true;
    }
  }
  return false;
}

/** Barqaror FingerprintId (brauzerda JS to'ldiradi; biz hisob uchun bir xil qiymat beramiz). */
function deviceFingerprint(login: string): string {
  return createHash("sha256").update(`${login}|emaktab-telegram-bot`).digest("hex").slice(0, 32);
}

type FollowedResponse = { status: number; body: string; finalUrl: string };

/**
 * So'rov yuboradi va redirect'larni QO'LDA kuzatadi — chunki undici fetch
 * avtomatik redirect'da Set-Cookie'larni yo'qotadi (cookie jar yo'q).
 * Har bir qadamda cookie'lar yig'iladi.
 */
export async function fetchFollowing(
  url: string,
  init: { method?: string; body?: BodyInit; headers?: Record<string, string> },
  jar: Record<string, string>,
  maxHops = 10,
): Promise<FollowedResponse> {
  let currentUrl = url;
  let method = init.method ?? "GET";
  let body = init.body;
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetch(currentUrl, {
      method,
      body,
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uz-UZ,uz;q=0.9,en;q=0.8,ru;q=0.7",
        ...init.headers,
        Cookie: cookieHeader(jar),
      },
    });
    mergeCookies(jar, res);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      currentUrl = new URL(loc, currentUrl).toString();
      method = "GET";
      body = undefined;
      continue;
    }
    return { status: res.status, body: await res.text(), finalUrl: currentUrl };
  }
  throw new EmaktabAuthError("unknown");
}

/** Sahifadagi captcha rasm manzilini topadi. */
export function extractCaptchaUrl(html: string, baseUrl: string): string | null {
  const m = html.match(/(?:https?:\/\/[^"'\s>]+)?\/captcha\/[^"'\s>]+/i);
  if (!m) return null;
  try {
    return new URL(m[0].replace(/&amp;/g, "&"), baseUrl).toString();
  } catch {
    return null;
  }
}

type LoginAttempt =
  | { status: "ok"; cookies: Record<string, string>; finalUrl?: string; markers?: string }
  | { status: "captcha"; form: LoginFormState }
  | { status: "invalid_credentials"; message: string }
  | { status: "error"; message: string; markers?: string; body?: string };

function formStateFrom(page: FollowedResponse, jar: Record<string, string>): LoginFormState {
  const action = formAction(page.body);
  return {
    cookies: jar,
    hidden: parseHiddenInputs(page.body),
    postUrl: action ? new URL(action, page.finalUrl).toString() : page.finalUrl,
    captchaUrl: extractCaptchaUrl(page.body, page.finalUrl),
  };
}

/** Forma qaytgan javobni baholaydi. */
function classifyFormResult(result: FollowedResponse, jar: Record<string, string>): LoginAttempt {
  if (captchaVisible(result.body)) {
    return { status: "captcha", form: formStateFrom(result, jar) };
  }
  const errors = extractLoginErrors(result.body);
  if (errors?.exceededAttempts || errors?.isWrongCaptcha) {
    return { status: "captcha", form: formStateFrom(result, jar) };
  }
  if (errors?.hasErrors) {
    return {
      status: "invalid_credentials",
      message: errors.text ?? "Login yoki parol noto'g'ri.",
    };
  }
  // Xatosiz qayta forma + captcha belgilari — captcha talab qilinmoqda
  if (extractCaptchaUrl(result.body, result.finalUrl)) {
    return { status: "captcha", form: formStateFrom(result, jar) };
  }
  return {
    status: "error",
    message: `eMaktab formani qaytardi (status ${result.status}, ${result.finalUrl}) [${bodyMarkers(result.body)}]`,
    markers: bodyMarkers(result.body),
    body: result.body,
  };
}

/** Captcha bilan bog'liq maydonlar (faqat Captcha.Input yechim bilan yuboriladi). */
function isCaptchaField(name: string): boolean {
  return /captcha/i.test(name);
}

/** Captcha maydonlarisiz nusxa (lavalex usuli — token'siz ishlaydi). */
export function stripCaptchaFields(hidden: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(hidden)) {
    if (isCaptchaField(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Yangi captcha challenge oladi (forma + mos rasm). Eski sessiya yo'qolganda
 * yoki javobda rasm bo'lmaganda ishlatiladi — Captcha.Id va rasm uuid'si mos keladi.
 */
export async function fetchCaptchaChallenge(): Promise<{ form: LoginFormState; captchaUrl: string } | null> {
  const jar: Record<string, string> = {};
  const page = await fetchFollowing(
    LOGIN_URL,
    { headers: { Referer: LOGIN_URL, "User-Agent": LOGIN_USER_AGENT } },
    jar,
  );
  if (!hasLoginForm(page.body)) return null;
  const form = formStateFrom(page, jar);
  const url = form.captchaUrl ?? extractCaptchaUrl(page.body, page.finalUrl);
  if (!url) return null;
  return { form: { ...form, captchaUrl: url }, captchaUrl: url };
}

/**
 * Captcha rasmini bayt sifatida yuklab oladi — Telegram'ga to'g'ridan-to'g'ri yuklash uchun
 * (tashqi URL sifatida yuborilsa Telegram uni ocholmay qolishi mumkin).
 */
export async function fetchCaptchaImage(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": LOGIN_USER_AGENT, Referer: LOGIN_URL },
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Captcha rasm URL'idagi uuid (Captcha.Id uchun zaxira). */
function idFromCaptchaUrl(url: string | null): string {
  if (!url) return "";
  const m = url.match(/\/captcha\/[^/]+\/([^/?#]+)/);
  return m ? m[1] : "";
}

type PostMode = "plain" | "hidden" | "captcha";

/**
 * Login formasi POST'i — uch xil strategiya:
 *  - "plain":   isbotlangan minimal maydonlar to'plami (kbot2 — captcha'siz o'tadi)
 *  - "hidden":  formadagi yashirin maydonlar, captcha maydonlarisiz (lavalex usuli)
 *  - "captcha": yashirin maydonlar + Captcha.Input (foydalanuvchi yechgan kod)
 */
async function postLogin(
  form: LoginFormState,
  login: string,
  password: string,
  opts: { mode: PostMode; captchaValue?: string },
): Promise<LoginAttempt> {
  let fields: Record<string, string>;

  if (opts.mode === "plain") {
    fields = {
      exceededAttempts: "False",
      ReturnUrl: "",
      FingerprintId: "",
      login,
      password,
    };
  } else if (opts.mode === "captcha") {
    fields = { ...form.hidden, login, password };
    fields["Captcha.Input"] = (opts.captchaValue ?? "").trim();
    if (!fields["Captcha.Id"]) fields["Captcha.Id"] = idFromCaptchaUrl(form.captchaUrl);
    if (!fields["captcha__value"]) fields["captcha__value"] = fields["Captcha.Input"];
  } else {
    fields = { ...stripCaptchaFields(form.hidden), login, password };
    if (!fields["FingerprintId"]) fields["FingerprintId"] = deviceFingerprint(login);
    if (!("exceededAttempts" in fields)) fields["exceededAttempts"] = "False";
    if (!("ReturnUrl" in fields)) fields["ReturnUrl"] = "";
  }

  // POST aniq /login manziliga (kbot2 isbotlangan usuli). Forma action'i bo'sh yoki
  // "/" bo'lsa — server POST'ni qayta ishlamay, shunchaki sahifani qaytaradi
  // (hasErrors:false bilan — biz uni 'formani qaytardi' deb noto'g'ri talqin qilardik).
  const actionUrl = new URL(form.postUrl);
  if (actionUrl.pathname === "/" || actionUrl.pathname === "") {
    actionUrl.pathname = "/login";
  }
  const postUrl = actionUrl.toString();

  const result = await fetchFollowing(
    postUrl,
    {
      method: "POST",
      body: new URLSearchParams(fields).toString(),
      headers: {
        "User-Agent": LOGIN_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: LOGIN_URL,
        Origin: "https://login.emaktab.uz",
      },
    },
    form.cookies,
  );

  // Muvaffaqiyat belgilari: auth cookie yoki (forma yo'q + xato yo'q).
  const authCookie = Boolean(
    form.cookies["UZDnevnikAuth_a"] ?? form.cookies["UZDnevnikAuth_s"],
  );
  const errors = extractLoginErrors(result.body);
  if (!errors?.hasErrors && (authCookie || !hasLoginForm(result.body))) {
    return {
      status: "ok",
      cookies: form.cookies,
      finalUrl: result.finalUrl,
      markers: bodyMarkers(result.body),
    };
  }
  return classifyFormResult(result, form.cookies);
}

/**
 * Login sahifasini ochadi va login urinishlarini qiladi.
 * Strategiyalar (ishlaydigan botlardan olingan):
 *   1. "plain"  — minimal 5 maydon (kbot2 usuli): captcha talab qilinmasa shu o'tadi
 *   2. "hidden" — yashirin maydonlar (captcha maydonlarisiz)
 *   3. captcha challenge — eMaktab captcha so'rasa, foydalanuvchi rasmni yechadi
 */
async function attemptLogin(login: string, password: string): Promise<LoginAttempt> {
  let diag = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const jar: Record<string, string> = {};

    let page = await fetchFollowing(
      LOGIN_BASE,
      { headers: { Referer: LOGIN_BASE, "User-Agent": LOGIN_USER_AGENT } },
      jar,
    );
    if (!hasLoginForm(page.body)) {
      const alt = await fetchFollowing(
        LOGIN_URL,
        { headers: { Referer: LOGIN_URL, "User-Agent": LOGIN_USER_AGENT } },
        jar,
      );
      if (hasLoginForm(alt.body)) page = alt;
    }
    if (!hasLoginForm(page.body)) {
      diag = `login formasi topilmadi (status ${page.status}, ${page.finalUrl})`;
      console.error("attemptLogin:", diag, page.body.slice(0, 300));
      continue;
    }

    const form = formStateFrom(page, jar);
    if (captchaVisible(page.body)) {
      return { status: "captcha", form };
    }

    // 1) Minimal maydonlar (isbotlangan usul)
    const plain = await postLogin(form, login, password, { mode: "plain" });
    if (plain.status !== "error") return plain;

    // 2) Yashirin maydonlar bilan
    const hidden = await postLogin(form, login, password, { mode: "hidden" });
    if (hidden.status !== "error") return hidden;

    diag = hidden.message;
    console.error("attemptLogin: strategiyalar o'tmadi", diag);
  }

  return {
    status: "error",
    message: `eMaktab bilan ulanib bo'lmadi (${diag || "noma'lum sabab"})`,
  };
}

async function toLoginStatus(
  attempt: LoginAttempt,
  login: string,
): Promise<EmaktabLoginStatus> {
  if (attempt.status === "ok") {
    const session = await buildSession(attempt.cookies, login, {
      finalUrl: attempt.finalUrl,
      markers: attempt.markers,
    });
    return { status: "ok", session };
  }
  if (attempt.status === "captcha") {
    return {
      status: "captcha_required",
      message: "eMaktab rasmli kod (captcha) talab qilmoqda.",
      captchaUrl: attempt.form.captchaUrl ?? undefined,
      formState: attempt.form,
    };
  }
  return attempt;
}

function wrapLoginError(error: unknown): EmaktabLoginStatus {
  if (error instanceof EmaktabAuthError) {
    if (error.message === "captcha") {
      return {
        status: "captcha_required",
        message:
          "Urinishlar soni ko'p bo'lgani uchun eMaktab rasmli kodni kiritish talab qilinmoqda. Birozdan so'ng qayta urinib ko'ring.",
      };
    }
    if (error.message === "unknown" || error.message.startsWith("unknown:")) {
      return {
        status: "error",
        message: `eMaktab serveridan kutilmagan javob keldi. Birozdan so'ng qayta urinib ko'ring. (${error.message})`,
      };
    }
    return { status: "invalid_credentials", message: error.message };
  }
  if (error instanceof EmaktabApiError) {
    // Haqiqiy sababni yashirmaymiz (masalan "kontekst topilmadi [me=200 ctx=404]").
    return { status: "error", message: error.message };
  }
  console.error("loginEmaktab failed", error);
  return {
    status: "error",
    message: `eMaktab bilan bog'lanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring. (${(error instanceof Error ? error.message : String(error)).slice(0, 120)})`,
  };
}

/**
 * eMaktab'ga kiradi.
 * Muvaffaqiyat: login formasi yo'qolishi yoki UZDnevnikAuth cookie'si.
 * Agar eMaktab captcha so'rasa — captcha_required + rasm manzili qaytadi
 * (foydalanuvchi kodni yozadi, submitCaptchaLogin bilan yakunlanadi).
 */
export async function loginEmaktab(login: string, password: string): Promise<EmaktabLoginStatus> {
  try {
    return await toLoginStatus(await attemptLogin(login, password), login);
  } catch (error) {
    return wrapLoginError(error);
  }
}

/** Captcha kodini yuborib, loginni yakunlaydi. */
export async function submitCaptchaLogin(
  login: string,
  password: string,
  form: LoginFormState,
  captchaValue: string,
): Promise<EmaktabLoginStatus> {
  try {
    return await toLoginStatus(
      await postLogin(form, login, password, { mode: "captcha", captchaValue }),
      login,
    );
  } catch (error) {
    return wrapLoginError(error);
  }
}

/** Saqlangan cookie'lardan sessiya quradi (cookie eskirgan bo'lsa EmaktabAuthError). */
export async function sessionFromCookies(
  cookies: Record<string, string>,
  login: string,
): Promise<EmaktabSession> {
  return buildSession(cookies, login);
}

// ---------------------------------------------------------------------------
// Masofaviy diagnostika (probe) — eMaktab login sahifasining holatini ko'rish
// ---------------------------------------------------------------------------

export interface LoginProbe {
  step: string;
  status: number;
  finalUrl: string;
  hasForm: boolean;
  captchaVisible: boolean;
  captchaUrl: string | null;
  hiddenNames: string[];
  errorState: unknown;
  snippet: string;
}

/** Masofaviy tekshiruv natijasi — iloji boricha ixcham (masofadan to'liq ko'rinadi). */
export interface CompactProbe {
  get: {
    status: number;
    form: boolean;
    captcha: boolean;
    captchaUrl: string | null;
    hidden: string;
    act: string;
  };
  strategies: Array<{ mode: string; r: string; m?: string; mk?: string; ctx?: string }>;
  oauth: string;
}

/** OAuth "API kalit" yo'lini sinaydi (connect/token). Faqat diagnostika uchun. */
async function probeOauth(): Promise<string> {
  try {
    const res = await fetch(`${LOGIN_BASE}/connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": LOGIN_USER_AGENT,
      },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "uzdnevnik",
        client_secret: "",
        username: "diagnostika_test",
        password: "diagnostika_test",
      }).toString(),
    });
    const body = (await res.text()).replace(/\s+/g, " ").slice(0, 60);
    return `token ${res.status} ${body}`;
  } catch (error) {
    return `token xato ${String(error).slice(0, 50)}`;
  }
}

export async function probeLogin(): Promise<CompactProbe> {
  const jar: Record<string, string> = {};
  const page = await fetchFollowing(
    LOGIN_BASE,
    { headers: { Referer: LOGIN_BASE, "User-Agent": LOGIN_USER_AGENT } },
    jar,
  );
  const get: CompactProbe["get"] = {
    status: page.status,
    form: hasLoginForm(page.body),
    captcha: captchaVisible(page.body),
    captchaUrl: extractCaptchaUrl(page.body, page.finalUrl),
    hidden: Object.keys(parseHiddenInputs(page.body)).join(","),
    act: formAction(page.body) ?? "(bo'sh)",
  };

  const strategies: CompactProbe["strategies"] = [];
  if (get.form) {
    for (const mode of ["plain", "hidden"] as const) {
      const form = formStateFrom(page, jar);
      try {
        const outcome = await postLogin(form, "diagnostika_test", "diagnostika_test", { mode });
        const message =
          outcome.status === "invalid_credentials"
            ? outcome.message
            : outcome.status === "captcha"
              ? `captcha! rasm=${outcome.form.captchaUrl ?? "?"}`
              : outcome.status === "ok"
                ? "OK?!"
                : outcome.message;
        strategies.push({
          mode,
          r: outcome.status,
          m: message.slice(0, 40),
          mk: outcome.status === "error" ? outcome.markers ?? "" : "",
          ctx: ctxOf(outcome.status === "error" ? outcome.body ?? "" : "").slice(0, 70),
        });
        if (outcome.status !== "error") break;
      } catch (error) {
        strategies.push({ mode, r: "exception", m: String(error).slice(0, 70) });
      }
    }
  }

  return { get, strategies, oauth: await probeOauth() };
}

// ---------------------------------------------------------------------------
// API so'rovlari
// ---------------------------------------------------------------------------

async function apiGet(
  cookies: Record<string, string>,
  path: string,
  params?: Record<string, string | number>,
  base: string = WEB_BASE,
): Promise<{ status: number; text: string; contentType: string }> {
  const url = new URL(base + path);
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

/**
 * Chuqur qidiruv: kalit nomi namunasiga mos keladigan birinchi STRING qiymatni topadi.
 * (masalan schoolId / school_id / school.id — noma'lum shakllarda ham).
 */
export function deepFind(obj: unknown, keyPattern: RegExp, depth = 0): string {
  if (depth > 4 || !obj || typeof obj !== "object") return "";
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const v = deepFind(item, keyPattern, depth + 1);
      if (v) return v;
    }
    return "";
  }
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (keyPattern.test(k) && typeof v === "string" && v) return v;
    if (keyPattern.test(k) && typeof v === "number") return String(v);
  }
  for (const v of Object.values(rec)) {
    const r = deepFind(v, keyPattern, depth + 1);
    if (r) return r;
  }
  return "";
}

/** Xavfsiz ro'yxat: massiv bo'lmasa — bo'sh (for..of TypeError bermasligi uchun). */
function safeList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

/** HTML ichidagi JS o'zgaruvchidan ({ dan boshlab) to'liq JSON obyektni skanerlaydi. */
export function parseJsonObjectAt(html: string, start: number): unknown | null {
  if (start < 0 || start >= html.length) return null;
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
          return JSON.parse(html.slice(start, i + 1)) as unknown;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function extractStartState(html: string): StartState | null {
  const marker = "window.__USER__START__PAGE__INITIAL__STATE__";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const eq = html.indexOf("=", idx);
  if (eq === -1) return null;
  const start = html.indexOf("{", eq);
  return parseJsonObjectAt(html, start) as StartState | null;
}

/**
 * Sahifadagi BARCHA window.__...__ = {...} state'larini topadi.
 * Turli rollar (o'quvchi/o'qituvchi) turli markerlar ishlatadi.
 */
export function extractAnyState(html: string): Array<{ marker: string; data: unknown }> {
  const out: Array<{ marker: string; data: unknown }> = [];
  const re = /window\.(__[A-Z0-9_]+__)\s*=\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const braceAt = html.indexOf("{", m.index + m[0].length);
    if (braceAt === -1) continue;
    const next = html.indexOf("window.__", m.index + 5);
    if (next !== -1 && braceAt > next) continue;
    const data = parseJsonObjectAt(html, braceAt);
    if (data && typeof data === "object") out.push({ marker: m[1], data });
  }
  return out;
}

async function fetchStartPage(
  cookies: Record<string, string>,
): Promise<{ state: StartState | null; talkUser: TalkUser | null; dbg: string }> {
  try {
    const res = await apiGet(cookies, "/api/userfeed");
    if (res.status !== 200) return { state: null, talkUser: null, dbg: `feed=${res.status}` };

    if (res.contentType.includes("json")) {
      const data = parseJson(res.text) as StartState | null;
      const ok = data && typeof data === "object";
      return {
        state: ok ? data : null,
        talkUser: null,
        dbg: `feed=json${ok ? ` uctx=${safeList((data as StartState)?.userContext?.contextPersons).length}` : ""}`,
      };
    }
    const state = extractStartState(res.text);
    return {
      state,
      talkUser: extractTalkUser(res.text),
      dbg: `feed=html st=${state ? 1 : 0} uctx=${safeList(state?.userContext?.contextPersons).length}`,
    };
  } catch (error) {
    if (error instanceof EmaktabAuthError) throw error;
    console.error("fetchStartPage failed", error);
    return { state: null, talkUser: null, dbg: `feed=xato:${(error instanceof Error ? error.message : String(error)).slice(0, 30)}` };
  }
}

/** HTML bosh sahifa (userfeed) — __USER__START__PAGE__INITIAL__STATE__ shu yerda. */
async function fetchUserfeedHtml(
  cookies: Record<string, string>,
): Promise<{ state: StartState | null; talkUser: TalkUser | null; dbg: string }> {
  try {
    // fetchFollowing — 302 redirect'larni kuzatadi (apiGet 302 ni xato deb tashlaydi).
    const res = await fetchFollowing(
      `${WEB_BASE}/userfeed`,
      { headers: { "User-Agent": USER_AGENT, Referer: `${WEB_BASE}/` } },
      cookies,
    );
    const state = extractStartState(res.body);
    return {
      state,
      talkUser: extractTalkUser(res.body),
      dbg: `uf=${res.status} st=${state ? 1 : 0} uctx=${safeList(state?.userContext?.contextPersons).length}`,
    };
  } catch (error) {
    // Fallback — hech qachon tashlamaydi.
    return { state: null, talkUser: null, dbg: `uf=xato:${(error instanceof Error ? error.message : String(error)).slice(0, 20)}` };
  }
}

async function fetchStartState(cookies: Record<string, string>): Promise<StartState | null> {
  const { state } = await fetchStartPage(cookies);
  return state;
}

// ---------------------------------------------------------------------------
// Chat foydalanuvchisi state (`window.__TALK__INITIAL__STATE__`) — rollarni aniqlash uchun
// ---------------------------------------------------------------------------

export interface TalkUser {
  userId: string;
  roles: string[];
  /** eMaktabdagi haqiqiy to'liq ism (mavjud bo'lsa). */
  name: string;
  /** O'qituvchi dars beradigan sinflar: { [groupId]: {...} } */
  teacherGroupIds: string[];
  /** Sinf rahbari bo'lgan sinflar IDlari. */
  classTeacherGroupIds: string[];
  schoolIds: string[];
}

function toIdList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "object" && v !== null ? str((v as Record<string, unknown>).id ?? (v as Record<string, unknown>).groupId) : str(v)))
      .filter(Boolean);
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>);
  }
  return [];
}

export function extractTalkUser(html: string): TalkUser | null {
  const marker = "window.__TALK__INITIAL__STATE__";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  // Sahifada `X = X || {json}` ko'rinishidagi e'lon ham bo'ladi — JSON'ni topamiz.
  let jsonStart = -1;
  const assignIdx = html.indexOf("=", idx);
  if (assignIdx !== -1) {
    // Birinchi '{' — obyekt boshlanishi (undan oldin `X = X ||` turgan bo'lishi mumkin)
    const firstBrace = html.indexOf("{", assignIdx);
    const markerAgain = html.indexOf(marker, assignIdx);
    if (firstBrace !== -1 && (markerAgain === -1 || firstBrace < markerAgain + marker.length + 20)) {
      jsonStart = firstBrace;
    }
  }
  if (jsonStart === -1) return null;

  try {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = jsonStart; i < html.length; i++) {
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
          const data = JSON.parse(html.slice(jsonStart, i + 1)) as { user?: Record<string, unknown> };
          const u = data.user;
          if (!u || typeof u !== "object") return null;
          return {
            userId: str(u.id ?? u.userId),
            roles: Array.isArray(u.roles) ? u.roles.map((r) => str(r)) : [],
            name:
              nameFromPerson(u) ||
              str(u.fullName ?? u.fullNameRu ?? u.name ?? u.shortName) ||
              [str(u.lastName), str(u.firstName)].filter(Boolean).join(" ").trim(),
            teacherGroupIds: toIdList(u.teacherGroups),
            classTeacherGroupIds: toIdList(u.classTeacherGroups),
            schoolIds: Array.isArray(u.schoolIds) ? u.schoolIds.map((s) => str(s)) : [],
          };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sessiya qurish (profil konteksti)
// ---------------------------------------------------------------------------

/**
 * Noma'lum JSON shaklidan person-ga o'xshash obyektlarni chuqur yig'adi
 * (masalan {result:{items:[...]}} yoki boshqa o'ramlar).
 */
export function collectPersonLike(raw: unknown, depth = 0): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (depth > 4 || !raw || typeof raw !== "object") return out;
  if (Array.isArray(raw)) {
    for (const item of raw) out.push(...collectPersonLike(item, depth + 1));
    return out;
  }
  const obj = raw as Record<string, unknown>;
  const personId = obj.personId ?? obj.person_id;
  if (personId !== undefined && personId !== null && personId !== "") {
    out.push(obj);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") out.push(...collectPersonLike(v, depth + 1));
  }
  return out;
}

export function personsFromStartState(state: StartState | null): PersonContext[] {
  if (!state) return [];
  const persons: PersonContext[] = [];
  const contextPersons = safeList(state.userContext?.contextPersons);

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
    for (const raw of safeList(state.userSchedule?.children)) {
      if (!raw || typeof raw !== "object") continue;
      const ch = raw as Record<string, unknown>;
      const personId = str(ch.personId ?? ch.person_id);
      if (!personId) continue;
      persons.push({
        personId,
        schoolId: str(ch.schoolId ?? ch.school_id),
        groupId: str(ch.groupId ?? ch.group_id),
        fullName: "",
        schoolName: "",
        groupName: "",
      });
    }
  }
  return persons;
}

async function buildSession(
  cookies: Record<string, string>,
  login: string,
  meta?: { finalUrl?: string; markers?: string },
): Promise<EmaktabSession> {
  let persons: PersonContext[] = [];
  let fullName = login;
  let role: EmaktabSession["role"] = "student";
  let classTeacherGroupIds: string[] = [];

  const dbg: string[] = [
    `fu=${(meta?.finalUrl ?? "").slice(-40)} mk=${meta?.markers ?? ""} ck=${Object.keys(cookies).join(",").slice(0, 160)}`,
  ];
  let talkUser: TalkUser | null = null;
  try {
  const startPage = await fetchStartPage(cookies);
  let { state } = startPage;
  talkUser = startPage.talkUser;
  dbg.push(startPage.dbg);
  persons = personsFromStartState(state);

  // Agar /api/userfeed dan kontekst kelmagan bo'lsa — HTML /userfeed sahifasidan urinamiz
  // (haqiqiy sahifadagi __USER__START__PAGE__INITIAL__STATE__ aynan shu yerda).
  if (persons.length === 0) {
    const uf = await fetchUserfeedHtml(cookies);
    dbg.push(uf.dbg);
    if (uf.state && personsFromStartState(uf.state).length > 0) {
      state = uf.state;
      talkUser = uf.talkUser ?? talkUser;
      persons = personsFromStartState(state);
    } else if (uf.talkUser && !talkUser) {
      talkUser = uf.talkUser;
    }
  }

  // Yakuniy sahifa (masalan /teachers — o'qituvchi portali) — state aynan shu yerda.
  if (persons.length === 0 && meta?.finalUrl) {
    try {
      const land = await fetchFollowing(
        meta.finalUrl,
        { headers: { Referer: `${WEB_BASE}/` } },
        cookies,
      );
      const states = extractAnyState(land.body);
      dbg.push(`land=${land.status} st=${states.length}`);
      for (const s of states) {
        if (s.marker.includes("TEACHER")) role = "teacher";
        for (const raw of collectPersonLike(s.data)) {
          const p = raw as Record<string, unknown>;
          const personId = str(p.personId ?? p.person_id);
          if (!personId) continue;
          const school = (p.school ?? {}) as Record<string, unknown>;
          const group = (p.group ?? {}) as Record<string, unknown>;
          persons.push({
            personId,
            schoolId:
              str(school.id) ||
              str(p.schoolId ?? p.school_id) ||
              deepFind(s.data, /^school_?id$/i),
            groupId:
              str(group.id) || str(p.groupId ?? p.group_id) || deepFind(s.data, /^(group|class)_?id$/i),
            fullName: nameFromPerson(p) || str(p.shortName ?? p.name ?? p.fullName),
            schoolName: str(school.name) || deepFind(s.data, /^school_?name$/i),
            groupName: str(group.name),
          });
        }
      }
      if (!talkUser) talkUser = extractTalkUser(land.body);
    } catch (error) {
      dbg.push(`land=xato:${(error instanceof Error ? error.message : String(error)).slice(0, 20)}`);
    }
  }

  // Yakuniy URL /teachers bo'lsa — bu o'qituvchi portali.
  if ((meta?.finalUrl ?? "").toLowerCase().includes("teacher")) role = "teacher";

  // Rolni chat state'idagi roles/teacherGroups/classTeacherGroups dan aniqlaymiz.
  if (talkUser) {
    const roles = talkUser.roles.map((r) => r.toLowerCase());
    if (roles.includes("teacher") || talkUser.teacherGroupIds.length > 0) {
      role = "teacher";
    }
    classTeacherGroupIds = talkUser.classTeacherGroupIds;
  }

  // Qo'shimcha: users/me + context + children (fallback uchun).
  try {
    const meRes = await apiGet(cookies, "/api/v2/users/me");
    dbg.push(`me=${meRes.status}`);
    if (meRes.status === 200) {
      const meRaw = parseJson(meRes.text) as Record<string, unknown> | null;
      const me =
        meRaw && typeof meRaw.user === "object" && meRaw.user
          ? (meRaw.user as Record<string, unknown>)
          : meRaw;
      const name = me
        ? nameFromPerson(me) || str(me.fullName ?? me.shortName ?? me.name)
        : "";
      if (name) fullName = name;
    }
  } catch (error) {
    if (error instanceof EmaktabAuthError) throw error;
  }

  // Chat state'idagi haqiqiy ism (users/me ishlamasa).
  if (fullName === login && talkUser?.name) fullName = talkUser.name;

  if (persons.length === 0) {
    try {
      const ctxRes = await apiGet(cookies, "/api/v2/users/me/context");
      dbg.push(`ctx=${ctxRes.status}`);
      if (ctxRes.status === 200) {
        const ctx = parseJson(ctxRes.text) as unknown;
        let list: unknown[] = [];
        if (Array.isArray(ctx)) list = ctx;
        else if (ctx && typeof ctx === "object") {
          const obj = ctx as Record<string, unknown>;
          if (Array.isArray(obj.contextPersons)) list = obj.contextPersons;
          else if (Array.isArray(obj.persons)) list = obj.persons;
          else list = [ctx];
        }
        // Noma'lum o'ram shakllari uchun: personId kalitli obyektlarni chuqur yig'amiz.
        if (!list.some((x) => x && typeof x === "object" && ("personId" in (x as object) || "person_id" in (x as object)))) {
          list = [...list, ...collectPersonLike(ctx)];
        }
        dbg.push(`ctx=${ctxRes.status} n=${list.length}`);
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
    dbg.push(`kids=${childrenRes.status}`);
    if (childrenRes.status === 200) {
      const childrenRaw = parseJson(childrenRes.text) as unknown;
      let childList: unknown[] = [];
      if (Array.isArray(childrenRaw)) childList = childrenRaw;
      else if (childrenRaw && typeof childrenRaw === "object") {
        const obj = childrenRaw as Record<string, unknown>;
        if (Array.isArray(obj.children)) childList = obj.children;
        else if (Array.isArray(obj.persons)) childList = obj.persons;
        else childList = collectPersonLike(childrenRaw);
      }
      if (childList.length > 0) {
        role = "parent";
        for (const raw of childList) {
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

  // schoolId bo'sh qolgan bo'lsa — talkUser.schoolIds yoki state'dagi schoolId dan to'ldiramiz.
  // (u bo'sh bo'lsa — /api/v2/marks/diary 400 beradi: "schoolId is invalid")
  const schoolFallback =
    talkUser?.schoolIds?.[0] ?? deepFind(startPage.state ?? {}, /^school_?id$/i);
  if (schoolFallback) {
    for (const p of persons) {
      if (!p.schoolId) p.schoolId = schoolFallback;
    }
  }

  // Dublikatlarni tozalash (personId bo'yicha).
  const seen = new Set<string>();
  persons = persons.filter((p) => {
    if (!p.personId || seen.has(p.personId)) return false;
    seen.add(p.personId);
    return true;
  });

  // Ism hali ham login bo'lsa — kontekstdagi haqiqiy ismni olamiz (o'quvchi/o'qituvchi uchun).
  if (fullName === login && role !== "parent" && persons[0]?.fullName) {
    fullName = persons[0].fullName;
  }

  // O'qituvchi uchun personId bo'lmasligi mumkin — kontekstni minimallashtiramiz.
  if (persons.length === 0 && role === "teacher") {
    persons.push({
      personId: talkUser?.userId || cookies["t0"] || "",
      schoolId: talkUser?.schoolIds[0] || "",
      groupId: "",
      fullName,
      schoolName: "",
      groupName: "",
    });
  }

  if (persons.length === 0) {
    throw new EmaktabApiError(
      "eMaktab profilingizda o'quvchi konteksti topilmadi. " +
        `[diag: ${dbg.join(" ")} talk=${talkUser ? 1 : 0} ism=${fullName === login ? 0 : 1}]`,
    );
  }

  } catch (error) {
    if (error instanceof EmaktabAuthError) {
      throw new EmaktabApiError(
        `sessiya tugagan [ck=${Object.keys(cookies).join(",").slice(0, 70)}]`,
      );
    }
    throw error;
  }

  const userIdCookie = cookies["t0"] ?? talkUser?.userId ?? "";
  return {
    cookies,
    userId: userIdCookie,
    role,
    fullName: fullName || login,
    active: persons[0],
    persons,
    classTeacherGroupIds,
  };
}


// ---------------------------------------------------------------------------
// Kunlik kundalik (marks/diary) — baholar + darslar + uy vazifalari
// ---------------------------------------------------------------------------

export type DiaryLesson = {
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
  group?: { name?: string; id?: string } | string | null;
  groupName?: string | null;
  eduGroup?: { name?: string } | null;
  homework?: { text?: string | null; isCompleted?: boolean } | null;
  workMarks?: Array<{ marks?: Array<{ value?: string | number }> }>;
  importantWorks?: unknown[];
  comment?: string | null;
};

export type DiaryDay = {
  date?: string | number;
  lessons?: DiaryLesson[];
  marks?: Array<Record<string, unknown>>;
  hasImportantWork?: boolean;
};

export async function fetchDiaryDays(
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

function hhmmFromHourParts(h?: string | number | null, m?: string | number | null): string | null {
  const hs = String(h ?? "").trim();
  const ms = String(m ?? "").trim();
  // "8:30" yoki "08:30" ko'rinishidagi birlashtirilgan qiymat
  const combo = hs.match(/^(\d{1,2}):(\d{2})$/);
  if (combo) return `${combo[1].padStart(2, "0")}:${combo[2]}`;
  if (!/^\d{1,2}$/.test(hs) && h !== 0 && h !== "0") return null;
  if (!/^\d{1,2}$/.test(ms) && m !== 0 && m !== "0" && m !== undefined && m !== null && ms !== "") return null;
  return `${hs.padStart(2, "0")}:${(ms === "" ? "0" : ms).padStart(2, "0")}`;
}

function lessonTime(hours?: DiaryLesson["hours"], fallbackStart?: string | null, fallbackEnd?: string | null): { start: string | null; end: string | null } {
  if (hours && hours.startHour !== undefined && hours.startHour !== null) {
    const start = hhmmFromHourParts(hours.startHour, hours.startMinute) ?? "00:00";
    const end = hhmmFromHourParts(hours.endHour, hours.endMinute) ?? "00:00";
    return { start, end };
  }
  const fmt = (ts?: string | number | null) => {
    if (!ts) return null;
    const s = String(ts).trim();
    // "8:30" / "08:30" ko'rinishidagi matn
    const combo = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (combo) return `${combo[1].padStart(2, "0")}:${combo[2]}`;
    let n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n > 1e12) n = n / 1000; // millisekund bo'lsa — sekundga
    const d = new Date(n * 1000 + TZ_OFFSET_MS);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };
  return { start: fmt(fallbackStart), end: fmt(fallbackEnd) };
}

function lessonFromDiary(raw: DiaryLesson): Lesson {
  const rawRec = raw as unknown as Record<string, unknown>;
  const subject =
    typeof raw.subject === "string"
      ? raw.subject
      : raw.subject?.name || (rawRec.subjectName as string | undefined) || "Noma'lum fan";

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

  let groupName: string | null = null;
  if (typeof raw.group === "string" && raw.group) groupName = raw.group;
  else if (raw.group && typeof raw.group === "object") groupName = raw.group.name || null;
  else if (raw.groupName) groupName = String(raw.groupName);
  else if (raw.eduGroup && typeof raw.eduGroup === "object") groupName = raw.eduGroup.name || null;

  return {
    number: Number(raw.number ?? rawRec.lessonNumber ?? rawRec.period) || 0,
    subject,
    teacher,
    groupName,
    theme: raw.theme || null,
    startTime: time.start,
    endTime: time.end,
    room: raw.place || (rawRec.room as string | undefined) || (rawRec.cabinet as string | undefined) || (rawRec.roomNumber as string | undefined) || null,
    isCanceled: Boolean(raw.isCanceled),
    homework: raw.homework?.text?.trim() || null,
    homeworkDone: Boolean(raw.homework?.isCompleted),
    marks,
    isImportantWork: Array.isArray(raw.importantWorks) && raw.importantWorks.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Yozuv API'lari — "Dars o'tkazildi" belgisi va ish reja fayli (odo)
// Endpoint naqshlari eMaktab SPA skriptlaridan olingan:
//   /odo/journals/journalmark/editmark/   (jurnal, baholar)
// Host hali to'liq tasdiqlanmagani uchun bir nechta haqiqiy hostda sinab ko'riladi
// (smarty / emaktab / schools / api). Muvaffaqiyatsiz bo'lsa — aniq sabab qaytariladi.
// ---------------------------------------------------------------------------

export interface WriteResult {
  ok: boolean;
  reason?: string | null;
}

const ODO_HOSTS = [
  "https://smarty.emaktab.uz",
  "https://emaktab.uz",
  "https://schools.emaktab.uz",
  "https://api.emaktab.uz",
];

interface OdoCall {
  status: number;
  body: string;
  host: string;
}

/** Berilgan odo yo'lini hostlar bo'ylab POST qiladi. 404/405 = yo'q, keyingi host. */
async function odoPost(
  cookies: Record<string, string>,
  path: string,
  json: unknown,
): Promise<OdoCall | null> {
  const ck = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  let last: OdoCall | null = null;
  for (const host of ODO_HOSTS) {
    try {
      const rr = await fetch(`${host}${path}`, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Cookie: ck,
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Referer: "https://emaktab.uz/userfeed",
        },
        body: JSON.stringify(json),
        redirect: "manual",
      });
      const text = (await rr.text()).replace(/\s+/g, " ").slice(0, 220);
      last = { status: rr.status, body: text, host: host.slice(8) };
      if (rr.status >= 200 && rr.status < 300) return last; // muvaffaqiyat
      if (rr.status !== 404 && rr.status !== 405) return last; // endpoint bor, javob muhim
    } catch {
      /* keyingi host */
    }
  }
  return last;
}

/** Multipart fayl yuborish (ish reja fayli uchun). */
async function odoUpload(
  cookies: Record<string, string>,
  path: string,
  fields: Record<string, string>,
  file: { fileName: string; bytes: Buffer },
): Promise<OdoCall | null> {
  const ck = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  let last: OdoCall | null = null;
  for (const host of ODO_HOSTS) {
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append(
        "file",
        new Blob([new Uint8Array(file.bytes)], {
          type:
            file.fileName.toLowerCase().endsWith(".xlsx") ||
            file.fileName.toLowerCase().endsWith(".xlsm")
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/vnd.ms-excel",
        }),
        file.fileName,
      );
      const rr = await fetch(`${host}${path}`, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Cookie: ck,
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
          Referer: "https://emaktab.uz/userfeed",
        },
        body: fd,
        redirect: "manual",
      });
      const text = (await rr.text()).replace(/\s+/g, " ").slice(0, 220);
      last = { status: rr.status, body: text, host: host.slice(8) };
      if (rr.status >= 200 && rr.status < 300) return last;
      if (rr.status !== 404 && rr.status !== 405) return last;
    } catch {
      /* keyingi host */
    }
  }
  return last;
}

/**
 * Darsni o'tkazildi deb belgilash ("Dars o'tkazildi" — eMaktab talabi).
 * Yo'l nomzodlari SPA naqshidan: /odo/journals/journal{lesson,mark}/...
 */
export async function setLessonConducted(
  s: EmaktabSession,
  p: {
    classId: string;
    className: string;
    subjectName: string;
    date: string;
    lessonNumber: number;
  },
): Promise<WriteResult> {
  const payload = {
    groupId: p.classId,
    className: p.className,
    subjectName: p.subjectName,
    date: p.date,
    lessonNumber: p.lessonNumber,
    conducted: true,
    isConducted: true,
  };
  const tried: string[] = [];
  for (const path of [
    "/odo/journals/journallesson/editlesson/",
    "/odo/journals/journallesson/setconducted/",
    "/odo/journals/journalmark/editmark/",
  ]) {
    const r = await odoPost(s.cookies, path, payload);
    if (!r) continue;
    tried.push(`${path.slice(6, 26)}→${r.status}`);
    if (r.status >= 200 && r.status < 300) return { ok: true, reason: null };
    // 400/422 = endpoint bor, format talabi ochildi
    if (r.status === 400 || r.status === 422) {
      return { ok: false, reason: `server talabi: ${r.body.slice(0, 120)}` };
    }
  }
  return {
    ok: false,
    reason: `endpoint topilmadi (${tried.join(" ") || "sinovlar bo'sh"})`,
  };
}

/** Ish reja (kalendarlik-reja) faylini joylashtirish. Faqat .xls/.xlsx qabul qilinadi. */
export async function uploadCtpFile(
  s: EmaktabSession,
  p: {
    classId: string;
    className: string;
    subjectName: string;
    fileName: string;
    bytes: Buffer;
  },
): Promise<WriteResult> {
  const fields = {
    groupId: p.classId,
    className: p.className,
    subjectName: p.subjectName,
    fileName: p.fileName,
    type: "ctp",
  };
  const tried: string[] = [];
  for (const path of [
    "/odo/journals/journalctp/uploadctp/",
    "/odo/journals/journaltask/uploadtask/",
    "/odo/journals/journalctp/editctp/",
  ]) {
    const r = await odoUpload(s.cookies, path, fields, {
      fileName: p.fileName,
      bytes: p.bytes,
    });
    if (!r) continue;
    tried.push(`${path.slice(6, 28)}→${r.status}`);
    if (r.status >= 200 && r.status < 300) return { ok: true, reason: null };
    if (r.status === 400 || r.status === 422) {
      return { ok: false, reason: `server talabi: ${r.body.slice(0, 120)}` };
    }
  }
  return {
    ok: false,
    reason: `endpoint topilmadi (${tried.join(" ") || "sinovlar bo'sh"})`,
  };
}

// ==========================================================================
// Uy vazifasi maqomi (schools.emaktab.uz/v2/homework) — HAQIQIY shartnoma
// (homeworkDetails.js + homeworkeditforteacher.js dan olingan):
//   1) GET  /v2/homework?school&studyYear&group&subject&teacher&datefrom&dateto — ro'yxat
//   2) GET  /v2/lesson?school&lesson — dars sahifasi (rasmdagi tartib)
//   3) GET  /v2/homework?school&work&view=Edit — tahrirlash formasi
//   4) POST /v2/ajax?xss=… — "Saqlash" (editWork.url, x-www-form-urlencoded)
//   5) GET  /v2/homework?school&work — model (completeall-cmd manzili)
//   6) POST /v2/homeworks/completeall-cmd?xss=…&school&work — "+ (Maqom)"
// ==========================================================================

const HW_BASE = "https://schools.emaktab.uz/v2/homework";

export interface HomeworkRow {
  workId: string;
  lessonId: string;
  /** "3 noyabr 2026" */
  dateText: string;
  /** "1 dars" */
  lessonNo: string;
  description: string;
  subject: string;
  className: string;
  /** "29 / 0 / 0" */
  hisobot: string;
  /** "berilgan" | "Bajarildi" | ... */
  maqom: string;
  /** true = yopilgan/Bajarildi (yashil) */
  maqomDone: boolean;
}

export interface HomeworkSelectValue {
  label: string;
  value: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
}

function htmlText2(s: string): string {
  return decodeEntities(stripTags(s)).replace(/\s+/g, " ").trim();
}

/** Filtr formasi select'lari: label → value (yil/sinf/fan/o'qituvchi). */
export function parseHomeworkSelects(html: string): {
  studyYears: HomeworkSelectValue[];
  groups: HomeworkSelectValue[];
  subjects: HomeworkSelectValue[];
  teachers: HomeworkSelectValue[];
} {
  const grab = (name: string): HomeworkSelectValue[] => {
    const block = (
      html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`, "i")) ?? []
    )[1];
    if (!block) return [];
    const out: HomeworkSelectValue[] = [];
    for (const m of block.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)) {
      out.push({ value: m[1], label: htmlText2(m[2]) });
    }
    return out;
  };
  return {
    studyYears: grab("studyYear"),
    groups: grab("group"),
    subjects: grab("subject"),
    teachers: grab("teacher"),
  };
}

/** Ro'yxat jadvalidagi uy vazifasi qatorlari (rasmdagi "berilgan"/"Bajarildi" bilan). */
export function parseHomeworkRows(html: string): HomeworkRow[] {
  const rows: HomeworkRow[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = m[1];
    const workId = (row.match(/homework\?[^"]*work=(\d+)/) ?? row.match(/work=(\d+)/) ?? [])[1];
    const lessonId = (row.match(/lesson\?[^"]*lesson=(\d+)/) ?? row.match(/lesson=(\d+)/) ?? [])[1];
    if (!workId || !lessonId) continue;
    const descM = (row.match(/work=\d+[^>]*>([\s\S]*?)<\/a>/) ?? [])[1] ?? "";
    const dateM = (row.match(/lesson=\d+[^>]*>([\s\S]*?)<\/a>/) ?? [])[1] ?? "";
    const strong = (dateM.match(/<strong>([\s\S]*?)<\/strong>/) ?? [])[1] ?? "";
    const lessonNo = htmlText2(dateM.replace(/<strong>[\s\S]*?<\/strong>/, " "));
    const tds = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
    const maqomTag = tds[5]?.[1] ?? "";
    const maqom = tds[5] ? htmlText2(tds[5][2]) : "";
    rows.push({
      workId,
      lessonId,
      dateText: htmlText2(strong),
      lessonNo,
      description: htmlText2(descM),
      subject: tds[1] ? htmlText2(tds[1][2]) : "",
      className: tds[2] ? htmlText2(tds[2][2]) : "",
      hisobot: tds[4] ? htmlText2(tds[4][2]) : "",
      maqom,
      maqomDone: /bgG/.test(maqomTag) || /bajarildi/i.test(maqom),
    });
  }
  return rows;
}

export interface HomeworkEditForm {
  xss: string;
  /** To'liq Saqlash manzili (editWork.url — a=…&sid=… parametrlari bilan). */
  saveUrl: string;
  description: string;
  timetoexecute: string;
  attachRequired: boolean;
  withCheck: boolean;
  marktype: string;
  journalVisible: boolean;
}

/** Tahrirlash sahifasi formasi (Saqlash shu qiymatlarni o'zgarmasdan yuboradi). */
export function parseHomeworkEditForm(html: string): HomeworkEditForm | null {
  const saveUrlRaw =
    (html.match(/'(https?:[^']*\/v2\/ajax\?[^']*)'/) ?? [])[1] ??
    (html.match(/"(https?:[^"]*\/v2\/ajax\?[^"]*)"/) ?? [])[1] ??
    "";
  const saveUrl = decodeEntities(saveUrlRaw.replace(/\\\//g, "/"));
  const xss = ((saveUrl || html).match(/[?&]xss=([0-9a-f]{16,})/i) ?? [])[1];
  const desc = (html.match(/<textarea[^>]*id="description"[^>]*>([\s\S]*?)<\/textarea>/) ?? [])[1];
  if (!xss || desc === undefined) return null;
  const tagById = (id: string): string =>
    (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`, "i")) ?? [])[0] ?? "";
  const valueOf = (tag: string): string => (tag.match(/value="([^"]*)"/) ?? [])[1] ?? "";
  const checkedOf = (tag: string): boolean => /\bchecked\b/i.test(tag);
  let marktype = "2";
  for (const m of html.matchAll(/<input[^>]*name="marktype"[^>]*>/gi)) {
    if (/\bchecked\b/i.test(m[0])) marktype = valueOf(m[0]) || marktype;
  }
  return {
    xss,
    saveUrl,
    description: decodeEntities(desc),
    timetoexecute: valueOf(tagById("timeToExecute")),
    attachRequired: checkedOf(tagById("attachRequired")),
    withCheck: checkedOf(tagById("withCheck")),
    marktype,
    journalVisible: checkedOf(tagById("journalVisible0")),
  };
}

/** homeworkDetails.js modeli: "+ (Maqom)" — completeall-cmd manzili. */
export function parseHomeworkDetailModel(html: string): {
  url: string;
  text: string;
  status: number;
} | null {
  const raw = (html.match(/"(https:[^"]*completeall-cmd[^"]*)"/) ?? [])[1];
  if (!raw) return null;
  const url = decodeEntities(raw.replace(/\\\//g, "/"));
  const text = (html.match(/"text":"([^"]*)"/) ?? [])[1] ?? "Bajarildi";
  const status = Number((html.match(/"status":(\d+)/) ?? [])[1] ?? "6");
  return { url, text, status };
}

async function hwPost(
  cookies: Record<string, string>,
  url: string,
  body: string,
  referer?: string,
): Promise<{ status: number; text: string }> {
  const ck = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const rr = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: ck,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://schools.emaktab.uz",
      Referer: referer ?? HW_BASE,
    },
    body,
    redirect: "manual",
  });
  return { status: rr.status, text: (await rr.text()).slice(0, 600) };
}

function studyYearStartValue(): string {
  const k = tashkentDayKey();
  const y = Number(k.slice(0, 4));
  const m = Number(k.slice(5, 7));
  return String(m >= 8 ? y : y - 1);
}

/** Filtrlangan uy vazifasi ro'yxati (sinf/fan/o'qituvchi select'lari bo'yicha aniqlanadi). */
export async function fetchHomeworkRows(
  s: EmaktabSession,
  p: {
    schoolId: string;
    className: string;
    subjectName: string;
    teacherName?: string;
  },
): Promise<{ rows: HomeworkRow[]; reason?: string }> {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  const bare = await pageGet(s.cookies, `${HW_BASE}?school=${p.schoolId}`);
  const opts = parseHomeworkSelects(bare);
  const findVal = (arr: HomeworkSelectValue[], label: string): string =>
    arr.find((o) => norm(o.label) === norm(label))?.value ?? "";
  const gid = findVal(opts.groups, p.className);
  const subj = findVal(opts.subjects, p.subjectName);
  const teacher = p.teacherName ? findVal(opts.teachers, p.teacherName) : "";
  if (!gid) return { rows: [], reason: `sinf filtrda topilmadi (${p.className})` };
  if (!subj) return { rows: [], reason: `fan filtrda topilmadi (${p.subjectName})` };
  const y = studyYearStartValue();
  const yearVal = findVal(opts.studyYears, `${y}/${Number(y) + 1}`) || y;
  const qs = new URLSearchParams({
    school: p.schoolId,
    studyYear: String(yearVal),
    group: gid,
    subject: subj,
    datefrom: `${y}-08-01`,
    dateto: `${Number(y) + 1}-07-31`,
  });
  if (teacher) qs.set("teacher", teacher);
  const html = await pageGet(s.cookies, `${HW_BASE}?${qs.toString()}`);
  return { rows: parseHomeworkRows(html) };
}

/**
 * Uy vazifasi maqomini berish — rasmlardagi to'liq zanjir:
 * dars sahifasi → tahrirlash → Saqlash → uy vazifasi sahifasi → "+ (Maqom)".
 */
export async function setHomeworkMaqom(
  s: EmaktabSession,
  p: { schoolId: string; workId: string; lessonId?: string },
): Promise<WriteResult> {
  const school = p.schoolId;
  try {
    if (p.lessonId) {
      try {
        await pageGet(
          s.cookies,
          `https://schools.emaktab.uz/v2/lesson?school=${school}&lesson=${p.lessonId}`,
        );
      } catch {
        /* dars sahifasi — faqat ko'rish qadami, xato bo'lsa zanjir davom etadi */
      }
    }
    const editUrl = `${HW_BASE}?school=${school}&work=${p.workId}&view=Edit`;
    const edit = await pageGet(s.cookies, editUrl);
    const form = parseHomeworkEditForm(edit);
    if (!form) return { ok: false, reason: "tahrirlash formasi topilmadi" };
    const saveBody = new URLSearchParams({
      school,
      work: p.workId,
      description: form.description,
      timetoexecute: form.timetoexecute,
      attachRequired: String(form.attachRequired),
      marktype: form.marktype,
      markcount: "2",
      withCheck: String(form.withCheck),
      journalVisible: String(form.journalVisible),
      linkUrl: "",
      shouldDeleteLink: "false",
    }).toString();
    const save = await hwPost(s.cookies, form.saveUrl, saveBody, editUrl);
    if (save.status < 200 || save.status >= 300) {
      return { ok: false, reason: `saqlash: HTTP ${save.status}` };
    }
    try {
      const sj = JSON.parse(save.text) as { errors?: string[] };
      if (Array.isArray(sj.errors) && sj.errors.length) {
        return { ok: false, reason: `saqlash: ${sj.errors.join("; ").slice(0, 120)}` };
      }
    } catch {
      /* bo'sh/javobsiz javob — davom etamiz */
    }
    const det = await pageGet(s.cookies, `${HW_BASE}?school=${school}&work=${p.workId}`);
    const model = parseHomeworkDetailModel(det);
    if (!model) return { ok: false, reason: "maqom (completeall-cmd) topilmadi" };
    const gv = await hwPost(s.cookies, model.url, "", `${HW_BASE}?school=${school}&work=${p.workId}`);
    if (gv.status < 200 || gv.status >= 300) {
      return { ok: false, reason: `maqom: HTTP ${gv.status}` };
    }
    try {
      const gj = JSON.parse(gv.text) as Record<string, unknown>;
      if (gj && typeof gj === "object" && !Array.isArray(gj) && gj.error) {
        return { ok: false, reason: `maqom: ${String(gj.error).slice(0, 120)}` };
      }
    } catch {
      /* JSON emas javob — 200 yetarli */
    }
    return { ok: true, reason: null };
  } catch (error) {
    return { ok: false, reason: String(error).slice(0, 140) };
  }
}

// ==========================================================================
// "Tayyor rejani import qilish" sehrgari — REAL shartnoma
// (fileuploader.js + fileimporttuner.js dan olingan):
//   GET  /v2/journals/planning/getperiods-cmd?group=    — choraklar
//   GET  /v2/journals/planning/getsubjects-cmd?school&group= — fanlar (ID)
//   GET  /v2/journals/planning/getsubgroups-cmd?group=  — guruhlar (1/2/Butun)
//   1) GET  /v2/journals/planning/import?...            — sehrgar (1-bosqich)
//   2) POST multipart (multifile1 + firstRow + step1)   — fayl yuklash
//   3) POST sozlamalar (select_N mapping + step2)       — 2-bosqich
//   4) Tekshirish jadvali (yashil/qizil nazorat)        — 3-bosqich
//   5) POST step3="Import qilish"                       — ko'chirib o'tkazish
// ==========================================================================

const WIZ_BASE = "https://schools.emaktab.uz/v2/journals/planning";
// fileuploader.js: url.replace('planning/import', 'getperiods-cmd') —
// ya'ni -cmd manzillari planning bo'limisiz: /v2/journals/{cmd}-cmd
const WIZ_CMD_BASE = "https://schools.emaktab.uz/v2/journals";

export interface PlanOption {
  value: string;
  name: string;
}

async function wizGetJson(cookies: Record<string, string>, path: string, q: Record<string, string>): Promise<PlanOption[]> {
  const qs = new URLSearchParams(q).toString();
  const r = await fetchFollowing(`${WIZ_CMD_BASE}/${path}?${qs}`, {}, cookies);
  try {
    const parsed = JSON.parse(r.body) as unknown;
    const rawArr: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: unknown[] })?.items)
        ? (parsed as { items: unknown[] }).items
        : Array.isArray((parsed as { results?: unknown[] })?.results)
          ? (parsed as { results: unknown[] }).results
          : [];
    return rawArr.map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const value = o.value ?? o.Value ?? o.id ?? o.Id ?? "";
      const name = o.name ?? o.Name ?? o.title ?? o.Title ?? "";
      return { value: String(value), name: String(name) };
    });
  } catch {
    return [];
  }
}

/**
 * Choraklar ro'yxati — barqaror tartib: Yil davomida, 1–4-chorak.
 * Haqiqiy qiymatlar (uzun ID) topilsa — o'sha ishlatiladi, aks holda sintez.
 */
export function planPeriodOptions(periods: PlanOption[]): PlanOption[] {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  const used = new Set<number>();
  const pick = (test: (n: string, p: PlanOption) => boolean): PlanOption | null => {
    const idx = periods.findIndex((p, i) => !used.has(i) && test(norm(p.name), p));
    if (idx < 0) return null;
    used.add(idx);
    return periods[idx];
  };
  const out: PlanOption[] = [];
  out.push(pick((n, p) => /yil/.test(n) || p.value === "0") ?? { value: "0", name: "Yil davomida" });
  const roman = ["", "i", "ii", "iii", "iv"];
  for (let i = 1; i <= 4; i++) {
    out.push(
      pick((n) => /chorak|choraq/.test(n) && (new RegExp(`(^|[^0-9])${i}([^0-9]|$)`).test(n) || n.startsWith(`${roman[i]} `) || n.startsWith(`${roman[i]}-`))) ?? {
        value: String(i),
        name: `${i}-chorak`,
      },
    );
  }
  return out;
}

/** Sehrgar yordamchi ma'lumotlari: choraklar, guruhlar. */
export async function fetchPlanImportOptions(
  s: EmaktabSession,
  p: { groupId: string },
): Promise<{ periods: PlanOption[]; subgroups: PlanOption[] }> {
  const periods = await wizGetJson(s.cookies, "getperiods-cmd", { group: p.groupId });
  const subgroups = await wizGetJson(s.cookies, "getsubgroups-cmd", { group: p.groupId });
  return { periods, subgroups };
}

/** Fan nomidan sehrgar subjectId'sini topish (getsubjects-cmd). */
export async function resolvePlanSubjectId(
  s: EmaktabSession,
  p: { schoolId: string; groupId: string; subjectName: string },
): Promise<string> {
  const subs = await wizGetJson(s.cookies, "getsubjects-cmd", { school: p.schoolId, group: p.groupId });
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  return subs.find((o) => norm(o.name) === norm(p.subjectName))?.value ?? "";
}

interface WizFormRow {
  header: string;
  selectName: string;
}

/** 2-bosqich: fayl ustunlari jadvali (header → select_N). */
export function parseImportMappingRows(html: string): WizFormRow[] {
  const rows: WizFormRow[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const inner = m[1];
    const sel = (inner.match(/<select[^>]*name="(select_\d+)"/i) ?? [])[1];
    if (!sel) continue;
    const tds = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    const header = tds[0] ? htmlText2(tds[0][1]) : "";
    rows.push({ header, selectName: sel });
  }
  return rows;
}

/** Ustun sarlavhasidan eMaktab maydonini tanlash: 0=raqam, 1=mavzu, 2=vazifa, -1=yo'q. */
export function mapImportColumn(header: string): string {
  const h = header.toLowerCase();
  if (/raqam/.test(h)) return "0";
  if (/mavzu|tema/.test(h)) return "1";
  if (/vazif/.test(h)) return "2";
  return "-1";
}

export interface PlanCheckResult {
  ok: boolean;
  /** Birinchi qizil xabar (bo'lsa). */
  redText: string | null;
  /** Yashil (tayyor/ko'chirish mumkin) belgilar soni. */
  greenCount: number;
  redCount: number;
}

/** 3-bosqich tekshirish jadvali: yashil/qizil nazorat (4-rasm). */
export function parseImportCheck(html: string): PlanCheckResult {
  const body = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ");
  const msgMatch = body.match(/[^.!?]{0,140}(?:oshib ketgan|yaroqsiz|mavjud emas|kechiktirilgan)[^.!?]{0,80}/i);
  const xatoMatch = body.match(/[^.!?]{0,100}Xato[^.!?]{0,80}/i);
  const redText = msgMatch ? msgMatch[0].trim() : xatoMatch ? xatoMatch[0].trim() : "Noma'lum xato";
  const redCount = (body.match(/Xato|mumkin emas|oshib ketgan/gi) ?? []).length;
  const greenCount = (body.match(/ko'chirish mumkin|import qilishga[^.]{0,20}tayyor|import qilish mumkin(?! emas)/gi) ?? []).length;
  return {
    ok: redCount === 0 && greenCount > 0,
    redText: redCount > 0 ? redText.slice(0, 180) : null,
    greenCount,
    redCount,
  };
}

/**
 * Ish reja (tayyor reja) importi — sehrgarning to'liq zanjiri.
 * Xavfsizlik: faqat yashil (tayyor) belgilar bo'lsa import bajariladi.
 */
export async function importLessonPlan(
  s: EmaktabSession,
  p: {
    schoolId: string;
    groupId: string;
    subjectId: string;
    subjectName: string;
    period: string;
    subgroup: string;
    year: number;
    fileName: string;
    bytes: Buffer;
  },
): Promise<WriteResult & { check?: PlanCheckResult }> {
  try {
    const u1 = `${WIZ_BASE}/import?period=0&subject=0&group=0&school=${p.schoolId}&year=${p.year}&teacher=0&subgroup=0`;
    const p1 = await pageGet(s.cookies, u1);
    const form = parseWizFormSimple(p1);
    if (!form) return { ok: false, reason: "sehrgar 1-bosqich formasi topilmadi" };
    // 1→2: fayl yuklash
    const fd = new FormData();
    for (const fl of form.fields) {
      if (fl.name === form.fileField || fl.type === "file") continue;
      if ((fl.type === "radio" || fl.type === "checkbox") && !fl.checked) continue;
      if (fl.type === "submit") continue;
      fd.append(fl.name, fl.value);
    }
    const firstRow = form.fields.find((x) => x.name === "firstRow" && x.checked);
    if (firstRow) fd.append("firstRow", firstRow.value);
    fd.append(
      form.fileField,
      new Blob([new Uint8Array(p.bytes)], {
        type: p.fileName.toLowerCase().endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.ms-excel",
      }),
      p.fileName,
    );
    const s1next = form.fields.find((x) => x.type === "submit" && /Keyingi/i.test(x.value));
    if (s1next) fd.append(s1next.name, s1next.value);
    const p2r = await fetchFollowing(form.action, { method: "POST", body: fd }, s.cookies);
    const p2 = p2r.body;
    const f2 = parseWizFormSimple(p2);
    if (!f2) return { ok: false, reason: "sehrgar 2-bosqich formasi topilmadi" };
    // 2→3: sozlamalar + ustun mapping
    const fd2 = new FormData();
    for (const fl of f2.fields) {
      if ((fl.type === "radio" || fl.type === "checkbox") && !fl.checked) continue;
      if (fl.type === "submit") continue;
      fd2.append(fl.name, fl.value);
    }
    const mapping: Record<string, string> = {};
    for (const row of parseImportMappingRows(p2)) {
      mapping[row.selectName] = mapImportColumn(row.header);
    }
    for (const sl of f2.selects) {
      let chosen = sl.options.find((o) => o.selected && o.value)?.value;
      if (/^select_\d+$/i.test(sl.name)) {
        chosen = mapping[sl.name] ?? chosen ?? "-1";
      } else if (/year/i.test(sl.name)) {
        chosen = String(p.year);
      } else if (/group/i.test(sl.name)) {
        chosen = p.groupId;
      } else if (/subject/i.test(sl.name)) {
        chosen = p.subjectId;
      } else if (/subgroup/i.test(sl.name)) {
        chosen = p.subgroup || chosen || "";
      } else if (/period/i.test(sl.name)) {
        chosen = p.period;
      }
      fd2.append(sl.name, chosen ?? "");
    }
    const s2next = f2.fields.find((x) => x.type === "submit" && /Keyingi/i.test(x.value));
    if (s2next) fd2.append(s2next.name, s2next.value);
    const p3r = await fetchFollowing(f2.action, { method: "POST", body: fd2 }, s.cookies);
    const p3 = p3r.body;
    const check = parseImportCheck(p3);
    if (!check.ok) {
      return {
        ok: false,
        reason: check.redText ?? "tekshiruvdan o'tmadi",
        check,
      };
    }
    // 4-qadam: import
    const f3 = parseWizFormSimple(p3);
    if (!f3) return { ok: false, reason: "import formasi topilmadi", check };
    const fd3 = new FormData();
    for (const fl of f3.fields) {
      if ((fl.type === "radio" || fl.type === "checkbox") && !fl.checked) continue;
      if (fl.type === "submit") continue;
      fd3.append(fl.name, fl.value);
    }
    for (const sl of f3.selects) {
      fd3.append(sl.name, sl.options.find((o) => o.selected)?.value ?? sl.options[0]?.value ?? "");
    }
    const impBtn = f3.fields.find((x) => x.type === "submit" && /Import/i.test(x.value));
    if (impBtn) fd3.append(impBtn.name, impBtn.value);
    const p4r = await fetchFollowing(f3.action, { method: "POST", body: fd3 }, s.cookies);
    const p4txt = p4r.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    if (/xato|error/i.test(p4txt) && !/muvaffaq|tayyor|ko'chirildi/i.test(p4txt)) {
      return { ok: false, reason: "import xatosi", check };
    }
    return { ok: true, reason: null, check };
  } catch (error) {
    return { ok: false, reason: String(error).slice(0, 140) };
  }
}

/** Sehrgar formasi (oddiy parser — input/select/submit). */
export function parseWizFormSimple(html: string): {
  action: string;
  method: string;
  fields: Array<{ name: string; value: string; type: string; checked: boolean }>;
  selects: Array<{ name: string; options: Array<{ value: string; label: string; selected: boolean }> }>;
  fileField: string;
} | null {
  for (const fm of html.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = fm[1];
    const inner = fm[2];
    const hasFile = /type="file"/i.test(inner);
    const hasNext = /Keyingi|name="step3"|Import qilish/i.test(inner);
    if (!hasFile && !hasNext) continue;
    const action = (attrs.match(/action="([^"]*)"/i) ?? [])[1]?.replace(/&amp;/g, "&") ?? "";
    const method = (attrs.match(/method="([^"]*)"/i) ?? [])[1] ?? "get";
    const fields: Array<{ name: string; value: string; type: string; checked: boolean }> = [];
    for (const im of inner.matchAll(/<input([^>]*)>/gi)) {
      const a = im[1];
      const name = (a.match(/name="([^"]*)"/i) ?? [])[1];
      if (!name) continue;
      fields.push({
        name,
        value: (a.match(/value="([^"]*)"/i) ?? [])[1] ?? "",
        type: (a.match(/type="([^"]*)"/i) ?? [])[1] ?? "text",
        checked: /\bchecked\b/i.test(a),
      });
    }
    const selects = [...inner.matchAll(/<select([^>]*)>([\s\S]*?)<\/select>/gi)].map((sm) => ({
      name: (sm[1].match(/name="([^"]*)"/i) ?? [])[1] ?? "",
      options: [...sm[2].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)].map((om) => ({
        value: (om[1].match(/value="([^"]*)"/i) ?? [])[1] ?? "",
        label: htmlText2(om[2]),
        selected: /\bselected\b/i.test(om[1]),
      })),
    }));
    const fileField =
      ((inner.match(/<input[^>]*type="file"[^>]*>/i) ?? [])[0] ?? "").match(/name="([^"]*)"/i)?.[1] ?? "";
    return { action, method, fields, selects, fileField };
  }
  return null;
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
  const kids = state.userSchedule?.children ?? [];
  // Qat'iy qoida: faqat tanlangan farzand. Ko'p farzand bo'lsa — boshqasinikini KO'RSATMAYMIZ.
  const child = kids.find((c) => str(c.personId) === personId) ?? (kids.length === 1 ? kids[0] : undefined);
  const days = (child?.schedule?.days ?? []) as DiaryDay[];
  return scheduleFromDiaryDays(days);
}

function gradesFromStartState(state: StartState | null, personId: string): Grade[] {
  if (!state) return [];
  const kids = state.userMarks?.children ?? [];
  const child = kids.find((c) => str(c.personId) === personId) ?? (kids.length === 1 ? kids[0] : undefined);
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
/**
 * Klass sahifasidan uzun group id topadi (joni: 25249429 → 2524942980748797372).
 * schedules API qisqa id bilan 404 beradi, uzun id bilan ishlaydi!
 */
async function resolveLongGroupId(cookies: Record<string, string>, shortGid: string): Promise<string> {
  if (!shortGid) return "";
  try {
    const html = await pageGet(cookies, `${SCHOOLS_BASE}/v2/class?class=${encodeURIComponent(shortGid)}`);
    const m = html.match(new RegExp(`\\b${shortGid}\\d{6,}\\b`));
    return m?.[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * Yassi darslar ro'yxati (schedules/timetables API) → DaySchedule[].
 * Kun: date/lessonDate (ISO yoki timestamp) bo'lmasa — dayOfWeek'dan (0=Dushanba).
 */
export function scheduleFromFlatLessons(
  items: Array<Record<string, unknown>>,
  fromDay: string,
  toDay: string,
): DaySchedule[] {
  const range: string[] = [];
  for (let d = fromDay; d <= toDay; d = shiftDayKey(d, 1)) range.push(d);
  const byDate = new Map<string, Lesson[]>();
  for (const raw of items) {
    const lesson = lessonFromDiary(raw as unknown as DiaryLesson);
    let date = "";
    const dRaw = raw.date ?? raw.lessonDate ?? raw.dayDate;
    if (typeof dRaw === "string" && /^\d{4}-\d{2}-\d{2}/.test(dRaw)) date = dRaw.slice(0, 10);
    else if (dRaw !== undefined && dRaw !== null && dRaw !== "") {
      const n = Number(dRaw);
      if (Number.isFinite(n) && n > 1e8) date = tashkentDayKeyFromTs(n > 1e12 ? n / 1000 : n);
    }
    if (!date) {
      const dow = Number(raw.dayOfWeek ?? raw.day_of_week ?? raw.weekDay);
      if (!Number.isFinite(dow)) continue;
      // API kundalik kelishuv: 0=Dushanba ... 6=Yakshanba (dayWeekday ham shunday).
      date = range.find((d) => dayWeekday(d) === dow) ?? "";
    }
    if (!date || date < fromDay || date > toDay) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(lesson);
  }
  return [...byDate.entries()]
    .map(([date, lessons]) => ({
      date,
      weekday: dayWeekday(date),
      lessons: lessons.sort((a, b) => a.number - b.number),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** schedules/timetables API javobini DaySchedule[] ga o'giradi (har xil shakllar). */
function scheduleFromApiPayload(data: unknown, fromDay: string, toDay: string): DaySchedule[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (data[0] && typeof data[0] === "object" && "lessons" in (data[0] as object)) {
      // kunlar ko'rinishidagi massiv
      return scheduleFromDiaryDays(data as DiaryDay[]);
    }
    return scheduleFromFlatLessons(data as Array<Record<string, unknown>>, fromDay, toDay);
  }
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.days) && rec.days.length > 0) {
    return scheduleFromDiaryDays(rec.days as DiaryDay[]);
  }
  for (const key of ["schedules", "lessons", "data"]) {
    const arr = rec[key];
    if (Array.isArray(arr) && arr.length > 0) {
      return scheduleFromFlatLessons(arr as Array<Record<string, unknown>>, fromDay, toDay);
    }
  }
  return [];
}

const API_HOST = "https://api.emaktab.uz";

/**
 * O'qituvchi darslari: berilgan kundagi darslar.
 * 1) api.emaktab.uz/v2 schedules + timetables (to'liq API host — boshqa yo'llar 404 edi)
 * 2) emaktab.uz/api/v2 (eski urinishlar)
 * 3) marks/diary
 * 4) bosh sahifa state
 */
export async function fetchSchedule(
  session: EmaktabSession,
  fromDay: string,
  toDay: string,
): Promise<DaySchedule[]> {
  const gids = [session.active.groupId].filter(Boolean) as string[];
  if (session.active.groupId) {
    const longGid = await resolveLongGroupId(session.cookies, session.active.groupId);
    if (longGid && !gids.includes(longGid)) gids.push(longGid);
  }
  const pid = session.active.personId;

  // 1/2-urinish: schedules va timetables — ikkala hostda (api.emaktab.uz to'liq API bo'lishi mumkin).
  for (const base of [`${API_HOST}/v2`, `${WEB_BASE}/api/v2`]) {
    for (const gid of gids) {
      try {
        if (pid) {
          const res = await apiGet(
            session.cookies,
            `/persons/${pid}/groups/${gid}/schedules`,
            { from: fromDay, to: toDay },
            base,
          );
          if (res.status === 200) {
            const schedule = scheduleFromApiPayload(parseJson(res.text), fromDay, toDay);
            if (schedule.length > 0) return schedule;
          }
        }
        // timetables — haftalik shablon (dayOfWeek bo'yicha).
        const res2 = await apiGet(session.cookies, `/edu-groups/${gid}/timetables`, undefined, base);
        if (res2.status === 200) {
          const schedule = scheduleFromApiPayload(parseJson(res2.text), fromDay, toDay);
          if (schedule.length > 0) return schedule;
        }
      } catch {
        // api.emaktab.uz hali tekshirilmagan — xatoni yutamiz, diary bosqichida
        // haqiqiy sessiya tugasa EmaktabAuthError baribir tashlanadi.
      }
    }
  }

  // 3-urinish: diary.
  const days = await fetchDiaryDays(session, fromDay, toDay);
  const schedule = scheduleFromDiaryDays(days);
  if (schedule.length > 0) return schedule;

  // 4-urinish: bosh sahifa state.
  const state = await fetchStartState(session.cookies);
  return scheduleFromStartState(state, session.active.personId);
}

/**
 * O'qituvchining O'Z darslari: boshqa o'qituvchilarning darslarini saralaydi
 * (ism ma'lum bo'lsa). Ism yozuvlari bo'lmasa — jadval o'zgarishsiz qaytadi.
 */
export async function fetchTeacherSchedule(
  session: EmaktabSession,
  fromDay: string,
  toDay: string,
  teacherName?: string | null,
): Promise<DaySchedule[]> {
  const schedule = await fetchSchedule(session, fromDay, toDay);
  if (!teacherName || schedule.length === 0) return schedule;
  const tokens = teacherName
    .toLowerCase()
    .replace(/['\u2019\u2018\u02BB\u02BC]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return schedule;
  const hasTeacherInfo = schedule.some((d) => d.lessons.some((l) => (l.teacher ?? "").trim().length > 0));
  if (!hasTeacherInfo) return schedule;
  const matches = (t: string | null) => {
    if (!t) return true; // ism yozilmagan darslar — yashirmaymiz
    const norm = t.toLowerCase().replace(/['\u2019\u2018\u02BB\u02BC]/g, "");
    return tokens.some((tok) => norm.includes(tok));
  };
  return schedule.map((d) => ({
    ...d,
    lessons: d.lessons.filter((l) => matches(l.teacher)),
  }));
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

/** Maktab/sinf yangiliklarini (e'lonlarini) oladi — sahifalab, imkon boricha HAMMASINI. */
export async function fetchNews(session: EmaktabSession, limit = 50): Promise<NewsPost[]> {
  const endpoints = ["/api/userfeed/posts", "/api/posts"];

  for (const base of endpoints) {
    const all: NewsPost[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < 8; page++) {
      let data: unknown;
      try {
        const res = await apiGet(session.cookies, base, { count: 20, offset: page * 20 });
        if (res.status !== 200) break;
        data = parseJson(res.text);
      } catch (error) {
        if (error instanceof EmaktabAuthError) throw error;
        break;
      }

      const posts = newsFromUnknown(data);
      if (posts.length === 0) break;

      let added = 0;
      for (const p of posts) {
        const key = p.id || `${p.title}|${p.date}|${p.text.slice(0, 40)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(p);
        added++;
      }
      if (added === 0) break; // takroriy sahifa
      if (all.length >= limit) break;
    }

    if (all.length > 0) return all.slice(0, limit);
  }

  return [];
}

// ---------------------------------------------------------------------------
// O'qituvchi: sinflar, sinf kabineti (schools.emaktab.uz)
// ---------------------------------------------------------------------------

export interface ClassLink {
  classId: string;
  className: string;
  /** TEACHERV2 state'dan: aynan shu sinf rahbarimi (dars o'tadigan sinf emas). */
  isClassTeacher?: boolean;
  /** O'qituvchi shu sinfda o'tadigan fanlar nomlari (TEACHERV2 journal[]). */
  subjects?: string[];
}

export interface ClassMember {
  memberId: string; // eMaktab user id (user?user=NNN)
  fullName: string;
}

export interface ClassCredentials {
  login: string;
  password: string;
}

export interface ClassInfo {
  classId: string;
  className: string;
  students: ClassMember[];
  parents: ClassMember[];
  staff: ClassMember[];
  /** eMaktab sahifasida ochiq ko'rinadigan login/parol juftliklari (bo'sh bo'lishi mumkin). */
  credentials: ClassCredentials[];
  /** Sahifada topilgan "faollashtirish" havolalari (bo'sh bo'lishi mumkin). */
  activationLinks: string[];
}

const SCHOOLS_BASE = "https://schools.emaktab.uz";

/** schools.emaktab.uz sahifalarini (HTML) olish. */
export async function pageGet(cookies: Record<string, string>, url: string): Promise<string> {
  // fetchFollowing — SSO/redirect zanjirlarini kuzatadi (schools.emaktab.uz o'z
  // redirect'ini beradi; uni xato deb tashlash sessiyani 'tugagan' deb ko'rsatardi).
  const res = await fetchFollowing(
    url,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uz-UZ,uz;q=0.9,en;q=0.8,ru;q=0.7",
      },
    },
    cookies,
  );
  if (res.status === 401 || res.status === 403) {
    throw new EmaktabAuthError();
  }
  // Redirect oxiri login sahifasiga bo'lsa — sessiya qabul qilinmagan.
  if (hasLoginForm(res.body) && res.finalUrl.includes("login.emaktab.uz")) {
    throw new EmaktabAuthError();
  }
  return res.body;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

interface HtmlAnchor {
  href: string;
  title: string;
  text: string;
}

function extractAnchors(html: string): HtmlAnchor[] {
  const out: HtmlAnchor[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const hrefM = attrs.match(/href\s*=\s*"([^"]*)"/i) ?? attrs.match(/href\s*=\s*'([^']*)'/i);
    const titleM = attrs.match(/title\s*=\s*"([^"]*)"/i) ?? attrs.match(/title\s*=\s*'([^']*)'/i);
    out.push({
      href: (hrefM?.[1] ?? "").replace(/&amp;/g, "&"),
      title: (titleM?.[1] ?? "").trim(),
      text: stripTags(inner),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// TEACHERV2 (emaktab.uz/teachers sahifasi state'i):
//   { groups: { "groups": [ { id, name, isClassTeacher, journal: [{subjectName}...] } ] } }
// — sinf rahbari va fanlar haqida haqiqiy ma'lumot.
// ---------------------------------------------------------------------------
export interface TeacherGroup {
  classId: string;
  className: string;
  isClassTeacher: boolean;
  subjects: string[];
}

export function extractTeacherGroups(html: string): TeacherGroup[] {
  const out: TeacherGroup[] = [];
  const marker = html.search(/TEACHERV2__INITIAL/);
  if (marker < 0) return out;
  const gStart = html.indexOf('{"groups":[', marker);
  if (gStart < 0) return out;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let endIdx = -1;
  for (let i = gStart; i < html.length && i < gStart + 400000; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx <= gStart) return out;
  try {
    const parsed = JSON.parse(html.slice(gStart, endIdx + 1)) as {
      groups?: Array<Record<string, unknown>>;
    };
    for (const g of parsed.groups ?? []) {
      const id = String(g.id ?? "").trim();
      const name = String(g.name ?? "").trim();
      if (!id || !name) continue;
      const subjects: string[] = [];
      const journal = Array.isArray(g.journal) ? g.journal : [];
      for (const j of journal) {
        const rec = j as Record<string, unknown>;
        const sn = typeof rec?.subjectName === "string" ? rec.subjectName.trim() : "";
        if (sn && !subjects.includes(sn)) subjects.push(sn);
      }
      out.push({
        classId: id,
        className: name,
        isClassTeacher: g.isClassTeacher === true,
        subjects,
      });
    }
  } catch {
    // JSON buzilgan — bo'sh qaytamiz
  }
  return out;
}

export async function fetchTeacherGroups(session: EmaktabSession): Promise<TeacherGroup[]> {
  try {
    const html = await pageGet(session.cookies, `${WEB_BASE}/teachers`);
    const groups = extractTeacherGroups(html);
    return mergeTeacherGroups(groups, extractTeacherJournals(html));
  } catch {
    return [];
  }
}

/** TEACHERV2 state'dagi jurnal yozuvlari: fan + guruh (journalUrl ichidan gid). */
export interface TeacherJournalEntry {
  groupId: string;
  groupName: string;
  subjectName: string;
}

function unescJsonStr(s: string): string {
  return s
    .replace(/\\u0026/g, "&")
    .replace(/\\u0027/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * TEACHERV2 state bo'ylab `"journalUrl": "..."` yozuvlarini topib, yonidagi
 * subjectName/guruh nomini oladi. groups[] ro'yxatiga kirmagan guruhlar
 * (masalan qo'shimcha sinflar) shu yerda ko'rinadi.
 */
export function extractTeacherJournals(html: string): TeacherJournalEntry[] {
  const out: TeacherJournalEntry[] = [];
  const marker = html.search(/TEACHERV2__INITIAL/);
  const region = marker >= 0 ? html.slice(marker, marker + 600000) : html;
  const re = /"journalUrl"\s*:\s*"([^"]{10,300})"/g;
  let m: RegExpExecArray | null;
  const nearest = (before: string, after: string, key: RegExp): string => {
    // Avval old tomondan eng YAQIN qiymat, bo'lmasa orqadan
    const b = [...before.matchAll(new RegExp(key.source, "g"))];
    if (b.length > 0) return b[b.length - 1][1] ?? "";
    const a = after.match(key);
    return a?.[1] ?? "";
  };
  while ((m = re.exec(region)) !== null) {
    const url = m[1].replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
    const gidM = url.match(/\/group\/(\d{6,25})/) ?? url.match(/[?&]group=(\d{6,25})/);
    const gid = gidM?.[1] ?? "";
    if (!gid) continue;
    const before = region.slice(Math.max(0, m.index - 300), m.index);
    const after = region.slice(m.index + m[0].length, m.index + m[0].length + 300);
    const subjectName = unescJsonStr(nearest(before, after, /"subjectName"\s*:\s*"([^"]{1,80})"/)).trim();
    if (!subjectName) continue;
    const groupName = unescJsonStr(
      nearest(before, after, /"groupName"\s*:\s*"([^"]{1,40})"/) ||
        nearest(before, after, /"name"\s*:\s*"([A-Za-z0-9\-]{2,10})"/),
    ).trim();
    out.push({ groupId: gid, groupName, subjectName });
  }
  return out;
}

/** Guruhlar ro'yxatini jurnal yozuvlari bilan birlashtiradi (fanlar + yangi guruhlar). */
export function mergeTeacherGroups(groups: TeacherGroup[], journals: TeacherJournalEntry[]): TeacherGroup[] {
  const out = groups.map((g) => ({ ...g, subjects: [...g.subjects] }));
  const find = (gid: string) =>
    out.find((g) => g.classId === gid || g.classId.includes(gid) || gid.includes(g.classId));
  for (const j of journals) {
    let g = find(j.groupId);
    if (!g) {
      g = {
        classId: j.groupId,
        className: j.groupName || j.groupId,
        isClassTeacher: false,
        subjects: [],
      };
      out.push(g);
    }
    if (j.subjectName && !g.subjects.includes(j.subjectName)) g.subjects.push(j.subjectName);
    if (!g.className && j.groupName) g.className = j.groupName;
  }
  return out;
}

/**
 * Bir kundagi darslarni smena aralashuvidan tozalaydi:
 * 1) bir xil (raqam + fan) takrorlanganda — eng ertadagisi (kunduzgi smena) qoladi;
 * 2) fan kun davomida ham erta, ham tushdan keyin uchrasa — faqat 12:00 oldinlar qoladi
 *    (o'qituvchi darslari doim kunduzgi smenada).
 * Barcha darslar tushdan keyin bo'lsa — o'zgarmaydi.
 */
export function dedupeShiftLessons(lessons: Lesson[]): Lesson[] {
  const t = (l: Lesson) => (l.startTime && /^\d{1,2}:\d{2}/.test(l.startTime) ? l.startTime : "z");
  const isMorning = (l: Lesson) => Boolean(l.startTime) && l.startTime! < "12:00";
  const isAfternoon = (l: Lesson) => Boolean(l.startTime) && l.startTime! >= "12:00";
  // 1) raqam+fan duplikati → eng ertasi (soatli oldin, soatsiz keyin)
  const byNumSubj = new Map<string, Lesson>();
  for (const l of [...lessons].sort((a, b) => t(a).localeCompare(t(b)))) {
    const key = `${l.number}|${l.subject}`;
    if (!byNumSubj.has(key)) byNumSubj.set(key, l);
  }
  let kept = [...byNumSubj.values()];
  // 2) smena aralashuvi → faqat kunduzgi (12:00 oldin)
  const bySubj = new Map<string, Lesson[]>();
  for (const l of kept) {
    const arr = bySubj.get(l.subject) ?? [];
    arr.push(l);
    bySubj.set(l.subject, arr);
  }
  kept = [];
  for (const arr of bySubj.values()) {
    const hasMorning = arr.some(isMorning);
    const hasAfternoon = arr.some(isAfternoon);
    for (const l of arr) {
      if (hasMorning && hasAfternoon) {
        if (isMorning(l)) kept.push(l);
      } else {
        kept.push(l);
      }
    }
  }
  return kept.sort((a, b) => t(a).localeCompare(t(b)) || (a.number || 99) - (b.number || 99));
}

function normLoose(s: string): string {
  return s
    .toLowerCase()
    .replace(/['\u2019\u2018\u02BB\u02BC]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dars o'qituvchining yuklamasiga tegishlimi?
 * - fan nomi qat'iy teng bo'lmasa ham ichma-ich bo'lsa — mos ("Informatika va AT" ⊃ "Informatika");
 * - yoki darsdagi o'qituvchi ismi mos kelsa — mos;
 * - aks holda — emas. Bo'sh fan/ism bilan tasdiqlab bo'lmaydi → emas.
 */
export function lessonMatchesTeacherLoad(
  subject: string,
  teacher: string | null | undefined,
  subjects: string[],
  teacherName: string,
): boolean {
  const ls = normLoose(subject ?? "");
  const taught = subjects.map(normLoose).filter(Boolean);
  if (ls) {
    for (const sn of taught) {
      if (ls === sn) return true;
      const shorter = ls.length <= sn.length ? ls : sn;
      if (shorter.length >= 4 && (ls.includes(sn) || sn.includes(ls))) return true;
    }
  }
  const t = normLoose(teacher ?? "");
  if (!t) return false;
  const tokens = normLoose(teacherName ?? "")
    .split(/\s+/)
    .filter((x) => x.length >= 4);
  return tokens.some((tok) => t.includes(tok));
}

/**
 * "Mening sinflarim" sahifasidan o'qituvchi sinflarini oladi.
 * Sahifa HTML: `/v2/class?class=ID` havolalari, matni sinf nomi (masalan "9-A").
 */
export async function fetchTeacherClasses(session: EmaktabSession): Promise<ClassLink[]> {
  const html = await pageGet(session.cookies, `${SCHOOLS_BASE}/v2/myclasses`);
  const out: ClassLink[] = [];
  const seen = new Set<string>();
  for (const a of extractAnchors(html)) {
    const m = a.href.match(/\/v2\/class\?class=([0-9]+)/);
    if (!m) continue;
    const classId = m[1];
    const className = a.text || a.title;
    if (!className || seen.has(classId)) continue;
    seen.add(classId);
    out.push({ classId, className });
  }
  return out;
}

// "Foydalanuvchi sahifasiga o'ting" kabi amal-havolalar matni — ism EMAS.
const GENERIC_LINK_TEST =
  /sahifasiga|foydalanuvchi|ko['\u2019]?rish|kirish|batafsil|tahrirlash|o['\u2019]?chirish|faollash|o['\u2019]?ting|malumot|ma['\u2019]lumot|\u2192|\u203a|\u00ab|\u00bb|\.\.\./i;
const GENERIC_LINK_GI =
  /sahifasiga|foydalanuvchi|ko['\u2019]?rish|kirish|batafsil|tahrirlash|o['\u2019]?chirish|faollash|o['\u2019]?ting|malumot|ma['\u2019]lumot|\u2192|\u203a|\u00ab|\u00bb|\.\.\./gi;

export function looksLikeName(s: string | undefined | null): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (GENERIC_LINK_TEST.test(t)) return false;
  if (/^[\d\s+()\-.,;/]+$/.test(t)) return false;
  return /[A-Za-z\u0400-\u04FF\u02BB\u02BC'\u2019]/.test(t);
}

function bestName(...candidates: Array<string | undefined | null>): string {
  for (const c of candidates) {
    if (looksLikeName(c)) return (c as string).trim();
  }
  return "";
}

/** Satr (li/tr) matnidan ismni tiklash: amal-havolalar matnini tashlab qolganidan ism. */
function rowNameFallback(rowHtml: string): string {
  const cleaned = stripTags(rowHtml)
    .replace(/Foydalanuvchi sahifasiga o['\u2019]?ting/gi, " ")
    .replace(GENERIC_LINK_GI, " ")
    .replace(/\s+/g, " ")
    .trim();
  return bestName(cleaned);
}

function memberFromAnchors(html: string): ClassMember[] {
  const byId = new Map<string, ClassMember>();
  const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>|<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [html];
  for (const row of rows) {
    const rowName = rowNameFallback(row);
    for (const a of extractAnchors(row)) {
      const m = a.href.match(/user\?user=([0-9]+)/);
      if (!m) continue;
      const name = bestName(a.title, a.text, rowName);
      const prev = byId.get(m[1]);
      if (prev) {
        // Dublikat: nomli variant ustunlik qiladi ("Foydalanuvchi sahifasiga o'ting" emas!)
        if (name && !looksLikeName(prev.fullName)) prev.fullName = name;
        continue;
      }
      byId.set(m[1], { memberId: m[1], fullName: name || `Noma'lum (#${m[1]})` });
    }
  }
  return [...byId.values()];
}

function extractMembersByUlClass(html: string, ulClass: string): ClassMember[] {
  const ulRe = new RegExp(`<ul[^>]*class="[^"]*${ulClass}[^"]*"[^>]*>([\\s\\S]*?)<\\/ul>`, "i");
  const ulM = html.match(ulRe);
  if (!ulM) return [];
  return memberFromAnchors(ulM[1]);
}

export function extractAllUserLinks(html: string): ClassMember[] {
  return memberFromAnchors(html);
}

function extractCredentials(html: string): ClassCredentials[] {
  // Sahifa JSON state'ida yoki forma maydonlarida login/parol ochiq tursa — yig'amiz.
  const out: ClassCredentials[] = [];
  const pairs: Array<[string, string]> = [];
  const loginRe = /"(?:login|userName|userLogin|username)"\s*:\s*"([^"]+)"/gi;
  const passRe = /"(?:password|userPassword|pass)"\s*:\s*"([^"]+)"/gi;
  const logins: string[] = [];
  const passes: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = loginRe.exec(html)) !== null) logins.push(m[1]);
  while ((m = passRe.exec(html)) !== null) passes.push(m[1]);
  for (let i = 0; i < Math.min(logins.length, passes.length); i++) {
    pairs.push([logins[i], passes[i]]);
  }
  // Forma maydonlari: <input name="login" value="...">, <input name="password" value="...">
  const inputRe = /<input\b[^>]*name\s*=\s*"(login|password)"[^>]*>/gi;
  const formValues: Record<string, string> = {};
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    const name = m[1].toLowerCase();
    const vM = tag.match(/value\s*=\s*"([^"]*)"/i);
    if (vM && vM[1]) formValues[name] = vM[1];
  }
  if (formValues.login && formValues.password) {
    pairs.push([formValues.login, formValues.password]);
  }
  const seen = new Set<string>();
  for (const [login, password] of pairs) {
    if (!login || !password || seen.has(login)) continue;
    seen.add(login);
    out.push({ login, password });
  }
  return out;
}

function extractActivationLinks(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of extractAnchors(html)) {
    if (/activate|faollash|activat/i.test(a.href) && !seen.has(a.href)) {
      seen.add(a.href);
      out.push(a.href);
    }
  }
  return out;
}

/**
 * Sinf kabineti: o'quvchilar, ota-onalar va xodimlar ro'yxatlari (HAQIQIY ma'lumot).
 */
export async function fetchClassMembers(
  session: EmaktabSession,
  classId: string,
  className: string,
): Promise<ClassInfo> {
  const base = `${SCHOOLS_BASE}/v2/class?class=${encodeURIComponent(classId)}`;
  const mainHtml = await pageGet(session.cookies, base);

  // Asosiy sahifa: peopleSmall = o'quvchilar, peopleS = xodimlar (o'qituvchilar).
  let students = extractMembersByUlClass(mainHtml, "peopleSmall");
  const staff = extractMembersByUlClass(mainHtml, "peopleS");
  let parents: ClassMember[] = [];
  let credentials = extractCredentials(mainHtml);
  let activationLinks = extractActivationLinks(mainHtml);

  // Ota-onalar alohida view'da bo'lishi mumkin.
  for (const group of ["parents", "students"] as const) {
    try {
      const html = await pageGet(session.cookies, `${base}&view=members&group=${group}`);
      const members = extractAllUserLinks(html);
      if (group === "parents") {
        // O'quvchi va xodimlar havolalari ("Foydalanuvchi sahifasiga o'ting") ota-ona EMAS.
        const excludeIds = new Set([...students, ...staff].map((s) => s.memberId));
        parents = members.filter((m) => !excludeIds.has(m.memberId));
      } else if (students.length === 0 && members.length > 0) {
        students = members;
      }
      credentials = credentials.concat(extractCredentials(html));
      activationLinks = activationLinks.concat(extractActivationLinks(html));
    } catch (error) {
      if (error instanceof EmaktabAuthError) throw error;
      // sahifa bo'lmasa — davom etamiz
    }
  }

  // Agar ota-onalar hali topilmasa — asosiy sahifadagi barcha userlardan
  // o'quvchi va xodimlarni ayirib ko'ramiz.
  if (parents.length === 0) {
    const all = extractAllUserLinks(mainHtml);
    const known = new Set([...students, ...staff].map((m) => m.memberId));
    const rest = all.filter((m) => !known.has(m.memberId));
    if (rest.length > 0) parents = rest;
  }

  // Dublikatlarni tozalash.
  const dedupe = (list: ClassMember[]) => {
    const seen = new Set<string>();
    return list.filter((m) => (seen.has(m.memberId) ? false : (seen.add(m.memberId), true)));
  };

  const credSeen = new Set<string>();
  credentials = credentials.filter((c) => (credSeen.has(c.login) ? false : (credSeen.add(c.login), true)));

  return {
    classId,
    className,
    students: dedupe(students),
    parents: dedupe(parents),
    staff: dedupe(staff),
    credentials,
    activationLinks: [...new Set(activationLinks)],
  };
}
