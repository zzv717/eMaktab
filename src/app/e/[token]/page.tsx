import type { Metadata } from "next";
import { consumeLoginToken } from "@/lib/bot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "eMaktabga kirish",
  robots: { index: false, follow: false },
};

const LOGIN_URL = "https://login.emaktab.uz/";

export default async function AutoLoginPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const credentials = await consumeLoginToken(token);

  if (!credentials) {
    return (
      <Shell>
        <div style={styles.icon}>⚠️</div>
        <h1 style={styles.title}>Havola muddati tugagan</h1>
        <p style={styles.text}>
          Bu bir martalik havola allaqachon ishlatilgan yoki 90 soniyalik muddati tugagan.
          Iltimos, Telegram botga qaytib, <b>“🔓 eMaktabga kirish”</b> tugmasini qayta bosing.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={styles.spinner} />
      <h1 style={styles.title}>eMaktabga ulanmoqda…</h1>
      <p style={styles.text}>Bir zum kuting, hisobingizga avtomatik kirish amalga oshirilmoqda.</p>

      <form id="auto-login-form" method="POST" action={LOGIN_URL} style={{ display: "none" }}>
        <input type="hidden" name="login" value={credentials.login} />
        <input type="hidden" name="password" value={credentials.password} />
        <input type="hidden" name="exceededAttempts" value="False" />
        <input type="hidden" name="ReturnUrl" value="" />
        <input type="hidden" name="FingerprintId" value="" />
        <noscript>
          <button type="submit" style={styles.button}>
            eMaktabga kirish
          </button>
        </noscript>
      </form>

      {/* Auto-submit as soon as the HTML is parsed, before React even hydrates. */}
      <script
         
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('auto-login-form').submit();`,
        }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={styles.body}>
      <style
         
        dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }}
      />
      <main style={styles.card}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg,#0f766e,#134e4a)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  card: {
    background: "white",
    borderRadius: 20,
    padding: "40px 32px",
    maxWidth: 420,
    width: "90%",
    textAlign: "center",
    boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
  },
  icon: { fontSize: 42, marginBottom: 8 },
  title: { fontSize: 22, margin: "12px 0 8px", color: "#0f172a" },
  text: { fontSize: 15, color: "#475569", lineHeight: 1.5 },
  spinner: {
    width: 42,
    height: 42,
    margin: "0 auto",
    borderRadius: "50%",
    border: "4px solid #d1fae5",
    borderTopColor: "#0f766e",
    animation: "spin 0.8s linear infinite",
  },
  button: {
    marginTop: 16,
    padding: "10px 20px",
    fontSize: 15,
    borderRadius: 10,
    border: "none",
    background: "#0f766e",
    color: "white",
    cursor: "pointer",
  },
};
