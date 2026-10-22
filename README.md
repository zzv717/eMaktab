# 🎒 eMaktab Telegram Bot

**eMaktab (kundalik.com)** — O'zbekiston maktablarining elektron kundaligi uchun Telegram bot.

Bot o'quvchi/ota-onaning eMaktab hisobini Telegram'ga ulaydi va quyidagilarni **inline tugmalar** orqali ko'rsatadi:

| Tugma | Vazifa |
|---|---|
| 📊 **Baholar** | eMaktab tizimidan so'nggi baholarni tortib keladi va tartibli ko'rinishda chiqaradi (fan, baho, sana, izoh, o'rtacha) |
| 📚 **Dars jadvali / Uy vazifalari** | Bugungi yoki ertangi darslarni, o'qituvchilar nomini va berilgan uy vazifalarini ko'rsatadi (haftalik jadval ham bor) |
| 📰 **Yangiliklar** | Maktab yoki sinf bo'yicha e'lon qilingan yangiliklarni yetkazadi |
| ⚙️ **Sozlamalar** | Akkunt ma'lumotlari, login/parolni yangilash, **Logout** (eski ma'lumotlar bazadan tozalanadi va bot qayta login so'raydi) |

Qo'shimcha: **bir bosishda eMaktabga kirish** — bot brauzer uchun bir martalik havola yaratadi va eMaktab login formasi avtomatik to'ldiriladi.

---

## 🔄 Foydalanuvchi oqimi (spec)

### `/start` buyrug'i
1. Bot `bot_users` jadvalini tekshiradi: bu Telegram ID avval ro'yxatdan o'tganmi?
2. **Ro'yxatdan o'tmagan bo'lsa:**
   - Xush kelibsiz xabari + eMaktab (kundalik.com) **login** va **parol**ini kiritishni so'raydi;
   - Foydalanuvchi login, keyin parol yuboradi (bu xabarlar darhol chatdan o'chiriladi);
   - Bot ma'lumotlarni **`ENCRYPTION_KEY`** yordamida **AES-256-GCM** bilan shifrlab, `bot_users` jadvaliga saqlaydi va eMaktab'da haqiqiy ekanligini tekshiradi.
3. **Ro'yxatdan o'tgan bo'lsa:**
   - Qayta ro'yxatdan o'tkazmaydi — **darhol asosiy menyuni** ochadi.

### Asosiy menyu
```
[ 📊 Baholar ]  [ 📚 Dars jadvali ]
[ 📰 Yangiliklar ]  [ ⚙️ Sozlamalar ]
```

---

## 🛠 Texnik tuzilma

```
src/
├── app/
│   ├── api/telegram/webhook/     # Telegram webhook endpointi
│   ├── api/telegram/set-webhook/ # Webhook'ni bir martalik sozlash
│   ├── api/health/               # Sog'liqni tekshirish
│   └── e/[token]/                # Bir bosishda eMaktabga kirish sahifasi
├── db/
│   ├── schema.ts                 # bot_users, login_tokens jadvallari (Drizzle ORM)
│   └── index.ts                  # PostgreSQL (Supabase) ulanishi
└── lib/
    ├── bot.ts                    # Bot mantig'i: /start, state-machine, menyu handlerlari
    ├── emaktab.ts                # eMaktab klienti: login, baholar, jadval, yangiliklar
    ├── crypto.ts                 # AES-256-GCM shifrlash (ENCRYPTION_KEY)
    ├── format.ts                 # Telegram HTML formatlash
    └── telegram.ts               # Telegram Bot API klienti + klaviaturalar
```

### eMaktab integratsiyasi
eMaktab cookie-based autentifikatsiya ishlatadi (rasmiy OAuth partner API emas):

1. `POST https://login.emaktab.uz/login` — form login → `UZDnevnikAuth_a`, `t0` cookie'lari;
2. Cookie'lar bilan so'rovlar:
   - `GET /api/userfeed` — bosh sahifa state (`window.__USER__START__PAGE__INITIAL__STATE__`): jadval, baholar, kontekst;
   - `GET /api/v2/marks/diary?personId&schoolId&startDate&finishDate` — kundalik (baholar, darslar, uy vazifalari);
   - `GET /api/v2/persons/{p}/groups/{g}/schedules` — dars jadvali;
   - `GET /api/userfeed/posts` — yangiliklar lentasi (maktab/sinf e'lonlari);
   - `GET /api/v2/users/me`, `/api/v2/users/me/context`, `/api/v2/users/me/children` — profil.

> ⚠️ eMaktab IDlari (personId/schoolId/groupId) 19+ xonali — ular doimo **string** sifatida saqlanadi.

### Xavfsizlik
- Parol hech qachon ochiq matnda saqlanmaydi — **AES-256-GCM** + `ENCRYPTION_KEY` (scrypt-derived key);
- Login/parol yozilgan xabarlar Telegram chatidan **darhol o'chiriladi**;
- One-click kirish uchun **bir martalik**, 90 soniyali token ishlatiladi.

---

## ⚙️ O'rnatish

### 1. O'zgaruvchilar (`.env`)

```env
TELEGRAM_BOT_TOKEN=...        # @BotFather dan
DATABASE_URL=...              # PostgreSQL (Supabase) connection string
ENCRYPTION_KEY=...            # Maxfiy satr — parollarni shifrlash kaliti
APP_URL=...                   # Ilovaning ommaviy URL (one-click kirish uchun)
TELEGRAM_WEBHOOK_SECRET=...   # Webhook himoyasi uchun maxfiy satr
```

`.env.example` faylini namuna sifatida ko'ring.

### 2. Bazani tayyorlash

```bash
npm install
npm run db:push      # drizzle-kit orqali jadvallarni yaratadi/yangilaydi
```

### 3. Ishga tushirish

```bash
npm run dev          # ishlab chiqish
npm run build && npm start   # production
```

### 4. Webhook'ni ulash

Deploy qilgandan so'ng bir marta oching:

```
GET https://<APP_URL>/api/telegram/set-webhook?secret=<TELEGRAM_WEBHOOK_SECRET>
```

Bot ishlaydi! Telegram'da `/start` yuboring.

---

## 🧪 Testlar

Parserlar haqiqiy eMaktab API namunalari (`scripts/sample-userfeed.html`) bilan tekshiriladi:

```bash
npx tsx scripts/verify-parsing.ts
```

---

## 📦 Asosiy buyruqlar

| Buyruq | Tavsif |
|---|---|
| `/start` | Ro'yxatdan o'tish / asosiy menyu |
| `/grades` | So'nggi baholar |
| `/schedule` | Bugungi dars jadvali |
| `/news` | Yangiliklar |
| `/status` | Ulanish holati |
| `/logout` | Chiqish (ma'lumotlar tozalanadi) |
| `/cancel` | Joriy amalni bekor qilish |
| `/help` | Qo'llanma |
