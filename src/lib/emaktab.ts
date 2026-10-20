// Lightweight client that talks to the real eMaktab (login.emaktab.uz) login form
// the exact same way a browser would, so we can verify a login/password pair once.
// We deliberately do NOT try to keep a long-lived server-side session/cookie jar:
// eMaktab's auth cookies are issued per-domain and HttpOnly, so a session created by
// our server can't be transplanted into the user's real browser anyway. Instead the
// "one click" experience is achieved by letting the user's own browser submit the
// real login form for them (see /e/[token]).

const LOGIN_URL = "https://login.emaktab.uz/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export type EmaktabVerifyResult =
  | { status: "ok" }
  | { status: "invalid_credentials"; message: string }
  | { status: "captcha_required"; message: string }
  | { status: "error"; message: string };

function mergeCookies(jar: Map<string, string>, res: Response) {
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
    jar.set(name, value);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

const ERROR_MESSAGES: Record<string, string> = {
  "login.login.error.emailorpassword": "Login yoki parol noto'g'ri.",
  "login.login.error.captcha": "Rasmdagi kod noto'g'ri kiritildi.",
};

export async function verifyEmaktabCredentials(login: string, password: string): Promise<EmaktabVerifyResult> {
  try {
    const jar = new Map<string, string>();

    const getRes = await fetch(LOGIN_URL, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
    });
    mergeCookies(jar, getRes);

    const body = new URLSearchParams({
      login,
      password,
      exceededAttempts: "False",
      ReturnUrl: "",
      FingerprintId: "",
    });

    const postRes = await fetch(LOGIN_URL, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: LOGIN_URL,
        Cookie: cookieHeader(jar),
      },
      body: body.toString(),
    });
    mergeCookies(jar, postRes);

    // A redirect away from the login page means the credentials were accepted.
    if (postRes.status >= 300 && postRes.status < 400) {
      return { status: "ok" };
    }

    const html = await postRes.text();
    const jsonMatch = html.match(/JSON\.parse\('([^']*)'\)/);

    if (jsonMatch) {
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

        if (data.exceededAttempts) {
          return {
            status: "captcha_required",
            message:
              "Urinishlar soni ko'p bo'lgani uchun eMaktab rasmiy saytida (login.emaktab.uz) rasmli kodni kiritish talab qilinmoqda. Birozdan so'ng qayta urinib ko'ring.",
          };
        }

        if (data.hasErrors) {
          const text = data.firstErrorText ? ERROR_MESSAGES[data.firstErrorText] : undefined;
          return { status: "invalid_credentials", message: text ?? "Login yoki parol noto'g'ri." };
        }

        return { status: "ok" };
      } catch {
        // fall through to generic error below
      }
    }

    return { status: "error", message: "eMaktab serveridan kutilmagan javob keldi. Birozdan so'ng qayta urinib ko'ring." };
  } catch (error) {
    console.error("verifyEmaktabCredentials failed", error);
    return { status: "error", message: "eMaktab bilan bog'lanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring." };
  }
}
