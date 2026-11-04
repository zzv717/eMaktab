# 📋 eMaktab Laboratoriya — Texnik audit hisoboti (2026-11-04)

## 1. Umumiy holat
- **Framework:** Next.js 16 · React 19 · TypeScript 5.9 · Three.js 0.187 · Tailwind CSS 4
- **Ma'lumotlar bazasi:** PostgreSQL (Supabase) + Drizzle ORM
- **Bot:** Telegram (avtoemaktabrobot) + PWA ilova
- **Testlar:** `scripts/verify-parsing.ts` — **409 test o'tdi (0 yiqildi)**
- **Deploy:** Vercel (`e-maktab-azizbek-9ad4.vercel.app`) — avtomatik, `main` ga merge bo'lganda

## 2. Laboratoriya arxitekturasi
| Fayl | Vazifa |
|---|---|
| `src/app/app/lab/LabPanel.tsx` | Fanlar tanlash (Kimyo/Fizika/Biologiya) + 📋 Tajribalar |
| `src/app/app/lab/ChemLab.tsx` | Kimyo — idishlar, reaktivlar, sintez, titrlash, indikatorlar |
| `src/app/app/lab/PhysLab.tsx` | Fizika — elektr zanjiri (MNA yechimi), pruja, optika |
| `src/app/app/lab/BioLab.tsx` | Biologiya — hujayra, mitoz, meyoz, namuna tayyorlash |
| `src/app/app/lab/PrepLab.tsx` | Mikroskop oqimi (6 bosqich, hujayra ichiga kirish) |
| `src/app/app/lab/engine.ts` | Ilmiy hisoblar: 118 element, reaksiyalar, pH, zanjir yechimi |
| `src/app/app/lab/three-utils.ts` | 3D sahna: **laboratoriya xonasi**, kamera, drag, materiallar |
| `src/app/app/lab/Guides.tsx` | 📖 Yoriqnoma (har bir fan uchun, real hayot bog'lanishlari) |
| `src/app/app/lab/experiments.ts` | 📋 Tajribalar kutubxonasi (bosqichma-bosqich) |

## 3. Yaratilgan yangiliklar (shu versiyada)
1. **3D laboratoriya xonasi** — kafel pol, devorlar, derazalar, shift yoritgichlari, eshik, shkaflar, lavabo, yong'in susishtirgichi, birinchi yordam to'plami, "CHIQISH" va "EHTIYOT" belgilari (hammasi protsedural, og'ir assetlar YO'Q).
2. **Elementlar ma'lumoti** — har bir element uchun **haqiqiy elektron konfiguratsiya** (Aufbau + istisnolar), **davr** va **guruh** hisoblanadi.
3. **📋 Tajribalar kutubxonasi** — 9 ta tajriba (Kimyo/Fizika/Biologiya), har birida: maqsad, jihozlar, xavfsizlik, qadamlar, kutilgan natija, tushuntirish, formula.
4. **UI O'ZBEKCHA** qoldirildi (foydalanuvchi talabi asosida).

## 4. Xavfsizlik va ma'lumotlar
- **Bazaga HECH QANDAY o'zgarish kiritilmadi** (migratsiya yo'q — nol xavf).
- Autentifikatsiya, rollar, API endpointlar o'zgartirilmagan.
- Maxfiy kalitlar kodda emas, `.env` da (`.env.example` ko'rsatmalari bilan).

## 5. Cheklovlar (keyingi bosqichlar uchun)
- Rus/Ingliz lokalizatsiya — **foydalanuvchi talabi bilan emas** (o'zbekcha qoladi).
- Ba'zi element massalari ko'rsatilmagan (davr/guruh/konfiguratsiya bor).
- Titrlash/damlatish bosqichlari soddalashtirilgan (to'liq buretka simulyatsiyasi keyin).
- O'qituvchi topshirqlari bo'limi — keyingi versiyada.

## 6. Sinov yo'riqnomasi
```bash
npm install
./node_modules/.bin/tsc --noEmit    # TypeScript — toza
npm run build                        # Production build
npx tsx scripts/verify-parsing.ts    # 409 test
```
