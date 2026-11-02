// 📱 eMaktab ilovasi — kirish (login/parol + Face ID), asosiy ekran
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

type Profile = { login: string; name: string; role: string; school: string; group: string };
type Screen = "boot" | "login" | "setup" | "home";

const ROLE_LABEL: Record<string, string> = {
  student: "O'quvchi 🎒",
  parent: "Ota-ona 👪",
  teacher: "O'qituvchi 📖",
};

async function api<T>(url: string, body?: unknown, method?: "GET" | "POST"): Promise<T> {
  const m = method ?? (body === undefined ? "GET" : "POST");
  const res = await fetch(url, {
    method: m,
    headers: m === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: m === "POST" ? JSON.stringify(body ?? {}) : undefined,
    credentials: "same-origin",
  });
  try {
    return (await res.json()) as T;
  } catch {
    return { ok: false, error: `Server javob bermadi (${res.status})` } as T;
  }
}

export default function AppClient() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [faceOk, setFaceOk] = useState(false); // qurilma Face ID qo'llab-quvvatlaydimi
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Login form
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  // Face ID bilan kirish (kichik oyna)
  const [faceOpen, setFaceOpen] = useState(false);
  const [faceLogin, setFaceLogin] = useState("");

  // O'rnatish tugmasi (Android PWA)
  const installPrompt = useRef<{ prompt: () => Promise<void> } | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      installPrompt.current = e as unknown as { prompt: () => Promise<void> };
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api<{ ok: boolean; authed?: boolean; profile?: Profile; hasPasskey?: boolean }>("/api/pwa/me");
    if (me.authed && me.profile) {
      setProfile(me.profile);
      setHasPasskey(Boolean(me.hasPasskey));
      setScreen("home");
    } else {
      setScreen("login");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (browserSupportsWebAuthn()) {
          setFaceOk(await platformAuthenticatorIsAvailable());
        }
        const last = localStorage.getItem("pwa_last_login") ?? "";
        if (last) {
          setLogin(last);
          setFaceLogin(last);
        }
      } catch {
        /* ignore */
      }
      await refresh();
    })();
  }, [refresh]);

  const doPasswordLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ ok: boolean; error?: string; profile?: Profile; hasPasskey?: boolean }>("/api/pwa/login", {
        login: login.trim(),
        password,
      });
      if (!r.ok || !r.profile) {
        setError(r.error ?? "Login yoki parol noto'g'ri");
        return;
      }
      localStorage.setItem("pwa_last_login", r.profile.login);
      setPassword("");
      setProfile(r.profile);
      setHasPasskey(Boolean(r.hasPasskey));
      setScreen(r.hasPasskey ? "home" : "setup");
    } catch {
      setError("Tarmoq xatosi — qaytadan urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  const doRegisterPasskey = async () => {
    setBusy(true);
    setError("");
    try {
      const opt = await api<{ ok: boolean; error?: string; options?: unknown }>(
        "/api/pwa/passkey/options",
        {},
        "POST",
      );
      if (!opt.ok || !opt.options) {
        setError(opt.error ?? "Boshlab bo'lmadi");
        return;
      }
      const attResp = await startRegistration({ optionsJSON: opt.options as never });
      const ver = await api<{ ok: boolean; error?: string }>("/api/pwa/passkey/verify", { response: attResp });
      if (!ver.ok) {
        setError(ver.error ?? "Face ID o'rnatilmadi");
        return;
      }
      setHasPasskey(true);
      setNotice("✅ Face ID o'rnatildi! Endi bir zumda kirasiz.");
      setScreen("home");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(msg ? `Bekor qilindi yoki xatolik: ${msg.slice(0, 80)}` : "Bekor qilindi yoki xatolik");
    } finally {
      setBusy(false);
    }
  };

  const doFaceLogin = async () => {
    const l = faceLogin.trim();
    if (!l) {
      setError("Loginni kiriting");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const opt = await api<{ ok: boolean; found?: boolean; error?: string; options?: unknown }>(
        "/api/pwa/auth/options",
        { login: l },
      );
      if (!opt.ok || !opt.options) {
        setError(opt.error ?? "Face ID topilmadi — login/parol bilan kiring");
        return;
      }
      const assertion = await startAuthentication({ optionsJSON: opt.options as never });
      const ver = await api<{ ok: boolean; error?: string; profile?: Profile; hasPasskey?: boolean }>(
        "/api/pwa/auth/verify",
        { login: l, response: assertion },
      );
      if (!ver.ok || !ver.profile) {
        setError(ver.error ?? "Tasdiqlab bo'lmadi");
        return;
      }
      localStorage.setItem("pwa_last_login", ver.profile.login);
      setProfile(ver.profile);
      setHasPasskey(Boolean(ver.hasPasskey));
      setFaceOpen(false);
      setScreen("home");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(msg ? `Bekor qilindi yoki xatolik: ${msg.slice(0, 80)}` : "Bekor qilindi yoki xatolik");
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    await api("/api/pwa/logout", {});
    setProfile(null);
    setHasPasskey(false);
    setScreen("login");
  };

  // ---------------------------------------------------------------- UI

  const card = "mx-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.10)]";
  const btn =
    "w-full rounded-2xl px-4 py-3 text-base font-semibold transition active:scale-[0.98] disabled:opacity-50";
  const btnPrimary = `${btn} bg-teal-700 text-white hover:bg-teal-800`;
  const btnGhost = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
  const input =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

  if (screen === "boot") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <div className={card}>
          <p className="text-center text-5xl">📱</p>
          <p className="mt-4 text-center text-slate-500">Yuklanmoqda…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-10">
      {/* Sarlavha */}
      <div className="text-center">
        <p className="text-4xl">📘</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">eMaktab</h1>
        <p className="mt-1 text-sm text-slate-500">Maktab ilovasi · haqiqiy ma'lumotlar</p>
      </div>

      {error && (
        <div className={`${card} border border-rose-200 bg-rose-50 !p-4`}>
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}
      {notice && (
        <div className={`${card} border border-emerald-200 bg-emerald-50 !p-4`}>
          <p className="text-sm text-emerald-700">{notice}</p>
        </div>
      )}

      {/* -------- LOGIN -------- */}
      {screen === "login" && (
        <section className={card}>
          <h2 className="text-lg font-semibold text-slate-900">Kirish</h2>
          <p className="mt-1 text-sm text-slate-500">eMaktab login va parolingiz bilan kiring.</p>

          <div className="mt-5 space-y-3">
            <input
              className={input}
              placeholder="Login"
              autoCapitalize="none"
              autoCorrect="off"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
            <input
              className={input}
              type="password"
              placeholder="Parol"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && login && password && !busy) void doPasswordLogin();
              }}
            />
            <button className={btnPrimary} disabled={busy || !login || !password} onClick={() => void doPasswordLogin()}>
              {busy ? "⏳ Iltimos kuting…" : "🔐 Kirish"}
            </button>
          </div>

          {faceOk && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-200" /> yoki
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              {faceOpen ? (
                <div className="space-y-3">
                  <input
                    className={input}
                    placeholder="Login (Face ID uchun)"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={faceLogin}
                    onChange={(e) => setFaceLogin(e.target.value)}
                  />
                  <button className={btnPrimary} disabled={busy || !faceLogin} onClick={() => void doFaceLogin()}>
                    {busy ? "⏳ Tekshirilmoqda…" : "👆 Face ID bilan tasdiqlash"}
                  </button>
                </div>
              ) : (
                <button
                  className={btnGhost}
                  onClick={() => {
                    setFaceOpen(true);
                    setFaceLogin((v) => v || login);
                  }}
                >
                  👆 Face ID bilan kirish
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* -------- FACE ID O'RNATISH -------- */}
      {screen === "setup" && profile && (
        <section className={card}>
          <h2 className="text-lg font-semibold text-slate-900">Xush kelibsiz, {profile.name}!</h2>
          <p className="mt-2 text-sm text-slate-600">
            Keyingi safar tezroq kirish uchun <b>Face ID</b> (yuz/panja) o&apos;rnating. Bir marta
            tasdiqlasangiz kifoya — keyin bir zumda kirasiz.
          </p>
          <div className="mt-5 space-y-3">
            {faceOk ? (
              <button className={btnPrimary} disabled={busy} onClick={() => void doRegisterPasskey()}>
                {busy ? "⏳ Kuting…" : "🔒 Face ID o'rnatish"}
              </button>
            ) : (
              <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
                ⚠️ Bu qurilmada yuz/panja tekshiruvi topilmadi. Boshqa telefondan kirib oʻrnatishingiz mumkin.
              </p>
            )}
            <button className={btnGhost} disabled={busy} onClick={() => setScreen("home")}>
              Hozircha kerak emas
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            * Qurilmangizda yuz yoki barmoq izi sozlangan boʻlishi kerak. Xavfsizlik kaliti telefoningizda
            qoladi.
          </p>
        </section>
      )}

      {/* -------- ASOSIY EKRAN -------- */}
      {screen === "home" && profile && (
        <section className={card}>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-xl text-white">
              {profile.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{profile.name}</p>
              <p className="text-sm text-slate-500">{ROLE_LABEL[profile.role] ?? profile.role}</p>
            </div>
          </div>

          <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-slate-500">🏫 Maktab</span>
              <span className="text-right font-medium text-slate-800">{profile.school}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-slate-500">🎓 Sinf</span>
              <span className="text-right font-medium text-slate-800">{profile.group}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-slate-500">🔐 Kirish</span>
              <span className="text-right font-medium text-slate-800">{hasPasskey ? "Face ID ✅" : "Login/parol"}</span>
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {!hasPasskey && faceOk && (
              <button className={btnPrimary} disabled={busy} onClick={() => void doRegisterPasskey()}>
                {busy ? "⏳ Kuting…" : "🔒 Face ID o'rnatish"}
              </button>
            )}
            {canInstall && (
              <button
                className={btnGhost}
                onClick={() => {
                  void installPrompt.current?.prompt();
                  setCanInstall(false);
                }}
              >
                📲 Ilovani telefonga o'rnatish
              </button>
            )}
            <button className={btnGhost} onClick={() => void doLogout()}>
              🚪 Chiqish
            </button>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tez orada</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {["📊 Baholar", "📚 Dars jadvali", "👁 Nazoratchi", "📝 Testlar", "📰 Yangiliklar", "✅ Maqom"].map(
                (t) => (
                  <div
                    key={t}
                    className="rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-center text-sm text-slate-400"
                  >
                    {t}
                  </div>
                ),
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            iPhone: <b>Ulashish</b> → <b>Uy ekraniga qoʻshish</b>
          </p>
        </section>
      )}
    </main>
  );
}
