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
async function fetchFollowing(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> },
  jar: Record<string, string>,
  maxHops = 5,
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
  | { status: "ok"; cookies: Record<string, string> }
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
    return { status: "ok", cookies: form.cookies };
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
    const session = await buildSession(attempt.cookies, login);
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
  console.error("loginEmaktab failed", error);
  return {
    status: "error",
    message: "eMaktab bilan bog'lanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring.",
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

async function fetchStartPage(
  cookies: Record<string, string>,
): Promise<{ state: StartState | null; talkUser: TalkUser | null }> {
  try {
    const res = await apiGet(cookies, "/api/userfeed");
    if (res.status !== 200) return { state: null, talkUser: null };

    if (res.contentType.includes("json")) {
      const data = parseJson(res.text) as StartState | null;
      return { state: data && typeof data === "object" ? data : null, talkUser: null };
    }
    return { state: extractStartState(res.text), talkUser: extractTalkUser(res.text) };
  } catch (error) {
    if (error instanceof EmaktabAuthError) throw error;
    console.error("fetchStartPage failed", error);
    return { state: null, talkUser: null };
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
  let classTeacherGroupIds: string[] = [];

  const { state, talkUser } = await fetchStartPage(cookies);
  persons = personsFromStartState(state);

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
      const childrenRaw = parseJson(childrenRes.text) as unknown;
      let childList: unknown[] = [];
      if (Array.isArray(childrenRaw)) childList = childrenRaw;
      else if (childrenRaw && typeof childrenRaw === "object") {
        const obj = childrenRaw as Record<string, unknown>;
        if (Array.isArray(obj.children)) childList = obj.children;
        else if (Array.isArray(obj.persons)) childList = obj.persons;
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
      "eMaktab profilingizda o'quvchi konteksti topilmadi. Iltimos, emaktab.uz saytida profilingizni tekshiring.",
    );
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
  group?: { name?: string; id?: string } | string | null;
  groupName?: string | null;
  eduGroup?: { name?: string } | null;
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

  let groupName: string | null = null;
  if (typeof raw.group === "string" && raw.group) groupName = raw.group;
  else if (raw.group && typeof raw.group === "object") groupName = raw.group.name || null;
  else if (raw.groupName) groupName = String(raw.groupName);
  else if (raw.eduGroup && typeof raw.eduGroup === "object") groupName = raw.eduGroup.name || null;

  return {
    number: Number(raw.number) || 0,
    subject,
    teacher,
    groupName,
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
async function pageGet(cookies: Record<string, string>, url: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "uz-UZ,uz;q=0.9,en;q=0.8,ru;q=0.7",
      Cookie: cookieHeader(cookies),
    },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new EmaktabAuthError();
  }
  return res.text();
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

function extractMembersByUlClass(html: string, ulClass: string): ClassMember[] {
  const out: ClassMember[] = [];
  const seen = new Set<string>();
  const ulRe = new RegExp(`<ul[^>]*class="[^"]*${ulClass}[^"]*"[^>]*>([\\s\\S]*?)<\\/ul>`, "i");
  const ulM = html.match(ulRe);
  if (!ulM) return out;
  for (const a of extractAnchors(ulM[1])) {
    const m = a.href.match(/user\?user=([0-9]+)/);
    if (!m) continue;
    const fullName = a.title || a.text;
    if (!fullName || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ memberId: m[1], fullName });
  }
  return out;
}

function extractAllUserLinks(html: string): ClassMember[] {
  const out: ClassMember[] = [];
  const seen = new Set<string>();
  for (const a of extractAnchors(html)) {
    const m = a.href.match(/user\?user=([0-9]+)/);
    if (!m) continue;
    const fullName = a.title || a.text;
    if (!fullName || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ memberId: m[1], fullName });
  }
  return out;
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
        const staffIds = new Set(staff.map((s) => s.memberId));
        parents = members.filter((m) => !staffIds.has(m.memberId));
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
