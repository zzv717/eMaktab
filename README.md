# 🎒 eMaktab Telegram Bot

**eMaktab (kundalik.com)** — O'zbekiston maktablarining elektron kundaligi uchun Telegram bot.

Barcha jarayon **botning o'zida** kechadi — brauzerga yoki boshqa ilovaga o'tish shart emas. Har bir so'rovda bot **"⏳ Iltimos kuting..."** deb turadi va tugagach **"✅ Muvaffaqiyatli tugadi"** deb xabar beradi. Barcha ma'lumotlar **haqiqiy eMaktab'dan** olinadi.

## 🎭 Rollar avtomatik aniqlanadi

Bot eMaktabga kirgandan so'ng rolni (o'quvchi / ota-ona / o'qituvchi) avtomatik aniqlaydi va menyu shunga qarab o'zgaradi.

### O'quvchi / Ota-ona menyusi
| Tugma | Vazifa |
|---|---|
| 📊 **Baholar** | So'nggi baholar (fan, baho, sana, izoh, o'rtacha) |
| 📚 **Dars jadvali** | Bugun/ertaga/haftalik darslar + uy vazifalari |
| 📰 **Yangiliklar** | Maktab/sinf e'lonlari |
| ⚙️ **Sozlamalar** | Akkunt, farzand almashtirish, logout |

### O'qituvchi menyusi
| Tugma | Vazifa |
|---|---|
| 📅 **Bugungi darslar** | Bugun qaysi soatda, qaysi sinfga, qaysi fan darsi borligi |
| 📆 **Ertangi darslar** | Ertangi darslar |
| 🏫 **Sinf kabineti** | (sinf rahbarida) — quyida batafsil |
| 📰 **Yangiliklar** | Maktab/sinf yangiliklari |
| 👤 **Profil** | O'qituvchi profili (F.I.Sh., maktab, sinflar) |
| ⚙️ **Sozlamalar** | Login yangilash, logout |

### 🏫 Sinf kabineti (sinf rahbari uchun)
| Tugma | Vazifa |
|---|---|
| 👨‍🎓 **O'quvchilar ro'yxati** | eMaktabdagi haqiqiy ro'yxat |
| 👪 **Ota-onalar ro'yxati** | eMaktabdagi haqiqiy ro'yxat |
| ✅ **O'quvchilarni faollashtirish** | Bot o'quvchilarning eMaktab hisobiga o'zi avtomatik kirib chiqadi (login/parol saqlanadi) |
| ✅ **Ota-onalarni faollashtirish** | Xuddi shunday, ota-onalar uchun |

> Faollashtirish jarayoni bir necha daqiqa ketishi mumkin — bot davomida "⏳ Iltimos kuting..." deb turadi va oxirida kim muvaffaqiyatli bo'lgani/bo'lmaganini halol ko'rsatadi. Login/parollar bazada **AES-256 shifrlangan** holda saqlanadi va keyingi safar qayta ishlatiladi.

---

## 🔄 `/start` oqimi

1. Bot `bot_users` jadvalini tekshiradi: bu Telegram ID avval ro'yxatdan o'tganmi?
2. **Ro'yxatdan o'tmagan bo'lsa** → xush kelibsiz + eMaktab login/parol so'raydi. Kiritilgan ma'lumotlar `ENCRYPTION_KEY` bilan shifrlanib bazaga saqlanadi (login/parol xabarlari chatdan darhol o'chiriladi).
3. **Ro'yxatdan o'tgan bo'lsa** → qayta so'ramaydi, darhol menyuni ochadi.

---

## 🛠 Texnik tuzilma

```
src/
├── app/
│   ├── api/telegram/webhook/     # Telegram webhook endpointi
│   ├── api/telegram/set-webhook/ # Webhook'ni bir martalik sozlash
│   └── api/health/               # Sog'liqni tekshirish (DB ulanishi)
├── db/
│   ├── schema.ts                 # bot_users, member_accounts (Drizzle ORM)
│   └── index.ts                  # PostgreSQL (Supabase)
└── lib/
    ├── bot.ts                    # Bot mantig'i, rollar, menyu handlerlari
    ├── emaktab.ts                # eMaktab klienti (login, baholar, jadval, yangiliklar, sinflar)
    ├── crypto.ts                 # AES-256-GCM shifrlash (ENCRYPTION_KEY)
    ├── format.ts                 # Telegram HTML formatlash
    └── telegram.ts               # Telegram Bot API klienti + klaviaturalar
```

### eMaktab integratsiyasi (cookie-based, rasmiy OAuth emas)
- `POST https://login.emaktab.uz/login` — form login → cookie'lar
- `GET /api/userfeed` — bosh sahifa state (jadval, baholar, kontekst, rollar)
- `GET /api/v2/marks/diary` — baholar, darslar, uy vazifalari
- `GET /api/userfeed/posts` — yangiliklar lentasi
- `GET https://schools.emaktab.uz/v2/myclasses` — o'qituvchi sinflari
- `GET https://schools.emaktab.uz/v2/class?class=ID` — sinf kabineti (o'quvchilar/ota-onalar)

> ⚠️ eMaktab IDlari 19+ xonali — ular doimo **string** sifatida saqlanadi.

### Xavfsizlik
- Parollar **AES-256-GCM** + `ENCRYPTION_KEY` bilan shifrlanadi
- Login/parol yozilgan xabarlar chatdan **darhol o'chiriladi**
- Bot hech qachon jim qolmaydi — xatolik bo'lsa sababini ko'rsatadi

---

## ⚙️ O'rnatish

### 1. `.env` fayli

```env
TELEGRAM_BOT_TOKEN=...        # @BotFather dan
DATABASE_URL=...              # PostgreSQL (Supabase) connection string
ENCRYPTION_KEY=...            # Maxfiy satr — parollarni shifrlash kaliti
APP_URL=...                   # Ilovaning ommaviy URL (webhook uchun)
TELEGRAM_WEBHOOK_SECRET=...   # Webhook himoyasi uchun maxfiy satr
```

### 2. Bazani tayyorlash

```bash
npm install
npm run db:push      # jadvallarni yaratadi/yangiladi
```

### 3. Ishga tushirish

```bash
npm run dev          # ishlab chiqish
npm run build && npm start   # production
```

### 4. Webhook'ni ulash

```
GET https://<APP_URL>/api/telegram/set-webhook?secret=<TELEGRAM_WEBHOOK_SECRET>
```

`{"ok": true}` qaytsa — tayyor! Telegram'da `/start` yuboring.

---

## 🧪 Testlar

```bash
npx tsx scripts/verify-parsing.ts   # 48 ta test — haqiqiy API namunalari bilan
```

## 📦 Buyruqlar

`/start` · `/grades` · `/schedule` · `/news` · `/status` · `/logout` · `/cancel` · `/help`
