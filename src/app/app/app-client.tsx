// 📱 eMaktab ilovasi — kirish (login/parol + Face ID) + ma'lumot panellari
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { api } from "./api";
import {
  ConductPanel,
  CtpPanel,
  GradesPanel,
  GuidePanel,
  MaqomPanel,
  NazoratchiPanel,
  NewsPanel,
  SchedulePanel,
  SettingsPanel,
  SinfimPanel,
  TestsPanel,
} from "./panels";
import LabPanel from "./lab/LabPanel";

type Profile = { login: string; name: string; role: string; school: string; group: string };
type Screen = "boot" | "login" | "setup" | "home";
type View =
  | "home"
  | "grades"
  | "schedule"
  | "news"
  | "nazoratchi"
  | "tests"
  | "maqom"
  | "sinfim"
  | "conduct"
  | "ctp"
  | "lab"
  | "settings"
  | "guide";

const ROLE_LABEL: Record<string, string> = {
  student: "O'quvchi 🎒",
  parent: "Ota-ona 👪",
  teacher: "O'qituvchi 📖",
};

export default function AppClient() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [view, setView] = useState<View>("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [faceOk, setFaceOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Login form
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  // eMaktab rasmli kod (captcha) so'rasa — foydalanuvchi kodni o'zi kiritadi
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaNonce, setCaptchaNonce] = useState(() => Date.now());
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);

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

  // Login muvaffaqiyatli bo'lgandan keyingi umumiy o'tish (parol va captcha uchun)
  const applyLoginOk = (r: { profile?: Profile; hasPasskey?: boolean }) => {
    if (!r.profile) return;
    localStorage.setItem("pwa_last_login", r.profile.login);
    setPassword("");
    setCaptchaOpen(false);
    setCaptchaCode("");
    setProfile(r.profile);
    setHasPasskey(Boolean(r.hasPasskey));
    setScreen(r.hasPasskey ? "home" : "setup");
  };

  const doPasswordLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ ok: boolean; error?: string; captcha?: boolean; captchaImage?: string | null; profile?: Profile; hasPasskey?: boolean }>(
        "/api/pwa/login",
        { login: login.trim(), password },
      );
      if (r.captcha) {
        setCaptchaOpen(true);
        setCaptchaCode("");
        setCaptchaImage(r.captchaImage ?? null);
        setCaptchaNonce(Date.now());
        setError(r.error ?? "Rasmdagi kodni kiriting");
        return;
      }
      if (!r.ok || !r.profile) {
        setError(r.error ?? "Login yoki parol noto'g'ri");
        return;
      }
      applyLoginOk(r);
    } catch {
      setError("Tarmoq xatosi — qaytadan urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  const doCaptchaLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ ok: boolean; error?: string; captcha?: boolean; captchaImage?: string | null; profile?: Profile; hasPasskey?: boolean }>(
        "/api/pwa/login/captcha",
        { code: captchaCode.trim() },
      );
      if (r.captcha) {
        setCaptchaCode("");
        setCaptchaImage(r.captchaImage ?? null);
        setCaptchaNonce(Date.now());
        setError(r.error ?? "Kod noto'g'ri. Qaytadan kiriting.");
        return;
      }
      if (!r.ok || !r.profile) {
        setCaptchaOpen(false);
        setError(r.error ?? "Kirish amalga oshmadi");
        return;
      }
      applyLoginOk(r);
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
    setView("home");
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

  const VIEW_TITLES: Record<View, string> = {
    home: "",
    grades: "📊 Baholar",
    schedule: "📚 Dars jadvali",
    news: "📰 Yangiliklar",
    nazoratchi: "👁 Nazoratchi",
    tests: "📝 Testlar",
    maqom: "✅ Maqom",
    sinfim: "🏫 Sinfim",
    conduct: "✅ Darsni o'tildi qilish",
    ctp: "📄 Ish reja joylashtirish",
    lab: "🧪 Laboratoriya va fanlar",
    settings: "⚙️ Sozlamalar",
    guide: "📖 Yoriqnoma",
  };

  const isTeacher = profile?.role === "teacher";
  // Botdagi menyu bilan bir xil — barcha bo'limlar
  const menuItems: { id: View; label: string }[] = isTeacher
    ? [
        { id: "schedule", label: "📚 Dars jadvali" },
        { id: "maqom", label: "✅ Maqom" },
        { id: "conduct", label: "✅ Darsni o'tildi" },
        { id: "ctp", label: "📄 Ish reja" },
        { id: "sinfim", label: "🏫 Sinfim" },
        { id: "nazoratchi", label: "👁 Nazoratchi" },
        { id: "tests", label: "📝 Testlar" },
        { id: "lab", label: "🧪 Laboratoriya" },
        { id: "news", label: "📰 Yangiliklar" },
        { id: "settings", label: "⚙️ Sozlamalar" },
        { id: "guide", label: "📖 Yoriqnoma" },
      ]
    : [
        { id: "grades", label: "📊 Baholar" },
        { id: "schedule", label: "📚 Dars jadvali" },
        { id: "nazoratchi", label: "👁 Nazoratchi" },
        { id: "tests", label: "📝 Testlar" },
        { id: "lab", label: "🧪 Laboratoriya" },
        { id: "news", label: "📰 Yangiliklar" },
        { id: "settings", label: "⚙️ Sozlamalar" },
        { id: "guide", label: "📖 Yoriqnoma" },
      ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-8">
      {/* Sarlavha */}
      <div className="text-center">
        <p className="text-4xl">📘</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">eMaktab</h1>
        <p className="mt-1 text-sm text-slate-500">Maktab ilovasi · haqiqiy ma'lumotlar</p>
      </div>

      {error && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}
      {notice && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
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
            {!captchaOpen && (
              <button className={btnPrimary} disabled={busy || !login || !password} onClick={() => void doPasswordLogin()}>
                {busy ? "⏳ Iltimos kuting…" : "🔐 Kirish"}
              </button>
            )}
          </div>

          {captchaOpen && (
            <div className="mt-4 space-y-3 rounded-2xl bg-amber-50 p-4">
              <p className="text-sm font-medium text-slate-800">eMaktab rasmdagi kodni so&apos;rayapti:</p>
              {/* eslatma: rasm faqat shu sessiya uchun serverdan olinadi */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={captchaImage ?? `/api/pwa/login/captcha-image?t=${captchaNonce}`}
                alt="Captcha"
                className="h-14 w-auto rounded-lg bg-white p-1"
              />
              <input
                className={input}
                placeholder="Rasmdagi belgilar"
                autoCapitalize="none"
                autoCorrect="off"
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && captchaCode.trim() && !busy) void doCaptchaLogin();
                }}
              />
              <div className="flex gap-2">
                <button className={btnPrimary} disabled={busy || !captchaCode.trim()} onClick={() => void doCaptchaLogin()}>
                  {busy ? "⏳ Tekshirilmoqda…" : "✅ Tasdiqlash"}
                </button>
                <button
                  className={btnGhost}
                  disabled={busy}
                  onClick={() => {
                    setCaptchaOpen(false);
                    setCaptchaCode("");
                    setError("");
                  }}
                >
                  Bekor qilish
                </button>
              </div>
            </div>
          )}

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

      {/* -------- ASOSIY EKRAN / PANELLAR -------- */}
      {screen === "home" && profile && (
        <section>
          {/* Profil kartochkasi */}
          <div className={card}>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-xl text-white">
                {profile.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{profile.name}</p>
                <p className="text-sm text-slate-500">{ROLE_LABEL[profile.role] ?? profile.role}</p>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm">
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
          </div>

          {/* Panel ochiq bo'lsa */}
          {view !== "home" ? (
            <div className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => setView("home")}
                >
                  ⬅️ Orqaga
                </button>
                <p className="font-semibold text-slate-900">{VIEW_TITLES[view]}</p>
                <div className="w-[86px]" />
              </div>
              {view === "grades" && <GradesPanel />}
              {view === "schedule" && <SchedulePanel />}
              {view === "news" && <NewsPanel />}
              {view === "nazoratchi" && <NazoratchiPanel />}
              {view === "tests" && <TestsPanel />}
              {view === "maqom" && <MaqomPanel />}
              {view === "sinfim" && <SinfimPanel />}
              {view === "conduct" && <ConductPanel />}
              {view === "ctp" && <CtpPanel />}
              {view === "lab" && <LabPanel />}
              {view === "settings" && <SettingsPanel profile={profile} hasPasskey={hasPasskey} />}
              {view === "guide" && <GuidePanel />}
            </div>
          ) : (
            <>
              {/* Menyu tugmalari */}
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {menuItems.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setView(m.id)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-teal-600 hover:text-teal-800 active:scale-[0.97]"
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-2.5">
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

              <p className="mt-5 text-center text-xs text-slate-400">
                iPhone: <b>Ulashish</b> → <b>Uy ekraniga qoʻshish</b>
              </p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
