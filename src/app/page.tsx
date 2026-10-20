import { db } from "@/db";
import { botUsers } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getStats() {
  await db.execute(sql`select 1`);
  const totalRes = await db.execute<{ count: string }>(sql`select count(*)::text as count from ${botUsers}`);
  const connectedRes = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from ${botUsers} where emaktab_login is not null`,
  );
  return { total: Number(totalRes.rows[0]?.count ?? 0), connected: Number(connectedRes.rows[0]?.count ?? 0) };
}

function EnvRow({ label, value }: { label: string; value: boolean }) {
  return (
    <li className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className={value ? "font-medium text-emerald-600" : "font-medium text-rose-600"}>
        {value ? "✅ sozlangan" : "❌ sozlanmagan"}
      </span>
    </li>
  );
}

export default async function HomePage() {
  const stats = await getStats();

  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const hasSecret = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);
  const hasAppUrl = Boolean(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL);
  const hasEncKey = Boolean(process.env.ENCRYPTION_KEY);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Telegram bot</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          eMaktab × Telegram
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Foydalanuvchilar login va parolini botga bir marta yuboradi, so&#x2018;ngra bitta tugma orqali{" "}
          <b>eMaktab (kundalik.com)</b> hisobiga bir zumda kiradi.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-slate-50 p-4 text-center">
            <p className="text-2xl font-semibold text-slate-900">{stats.total}</p>
            <p className="text-xs text-slate-500">jami foydalanuvchi</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-center">
            <p className="text-2xl font-semibold text-slate-900">{stats.connected}</p>
            <p className="text-xs text-slate-500">eMaktabga ulangan</p>
          </div>
        </div>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">Sozlamalar holati (.env)</h2>
        <ul className="mt-2">
          <EnvRow label="TELEGRAM_BOT_TOKEN" value={hasToken} />
          <EnvRow label="TELEGRAM_WEBHOOK_SECRET" value={hasSecret} />
          <EnvRow label="APP_URL" value={hasAppUrl} />
          <EnvRow label="ENCRYPTION_KEY" value={hasEncKey} />
        </ul>

        <div className="mt-8 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">O&#x2018;rnatish qadamlari:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Telegram&#x2019;da <b>@BotFather</b> orqali bot yarating va tokenni <code>TELEGRAM_BOT_TOKEN</code>&#x2018;ga qo&#x2018;ying.
            </li>
            <li>
              Ilova joylashtirilgan domenni <code>APP_URL</code>&#x2018;ga yozing (masalan https://sizning-domen.com).
            </li>
            <li>
              Keyin bir marta <code>/api/telegram/set-webhook?secret=TELEGRAM_WEBHOOK_SECRET</code> manzilini oching
              — bu bot webhookini avtomatik ro&#x2018;yxatdan o&#x2018;tkazadi.
            </li>
            <li>Shundan so&#x2018;ng botga /start yuboring.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}
