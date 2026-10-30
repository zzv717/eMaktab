## 👁 NAZORATCHI — yangi bo'lim (asosiy sahifada alohida tugma)

### 🔗 Telefonlarni ulash (ota-ona ↔ bola)
- Ota-ona 6 xonali **kod** oladi (10 daqiqa) → bolaga yuboradi → bola kodni kiritadi
- **Bola ulanishni o'chira OLMAYDI** — uzish faqat ota-ona panelida
- Bola botni **bloklasa** — ota-ona **darhol ogohlantirish** oladi (nazorat uzilmaydi)
- Bir nechta ota-ona ulana oladi (ona + ota); /logout ulanishni o'chirmaydi
- Bola eMaktabsiz ham kira oladi: login ekranida "👶 Nazoratchi kodini kiritish"

### 🔔 Avtomatik bildirishnomalar (eMaktab jadvalidan)
- 🎓 **Dars boshlandi** — birinchi dars soatida (8:00/8:30 — aniq eMaktab vaqti)
- 🏁 **Dars tugadi** — oxirgi dars tugagach + **[📊 Bugungi baholar]** tugmasi
  (bosilganda — aynan bugungi baholar, fan + baho, eMaktabdan)
- 👨‍🏫 **Repetitor** — soati yetganda eslatma (agar qo'shilgan bo'lsa) + dars tugagach test taklifi
- Manba: Vercel cron (har 5 daqiqa) + webhook faolligida qo'shimcha tekshiruv

### 📝 AI test (kutubxona / repetitor)
- Bola yaratadi: **Kitob** (nomi + muallif + betlar) yoki **Mavzu** (repetitorda o'tilgan)
- Sun'iy agent savol tuzadi va **ikkita telefonga bir vaqtda** yuboriladi:
  - Ota-onaga — **to'g'ri javob BILAN**
  - Bolaga — faqat variantlar (javob aytilmaydi)
- Bola variantni bosadi → **natija ota-onaga** ko'rinadi (to'g'ri/xato + nima tanlagani)
- Soxta javob oldini olish: bir marta javob beriladi, kim javob bergani tekshiriladi

### ⏰ Repetitor sozlamalari (ota-ona)
Fan + soat + kunlar + joy → avtomatik eslatmalar

### 📖 Yoriqnoma — to'liq qo'llanma (Nazoratchi ichida)

### Registratsiya bo'yicha tavsiya
- Asosiy kirish = eMaktab (ma'lumot shu yerda) — telefon OTP/Google/FaceID uni
  bosolmaydi; Telegram o'zi telefon raqamni tasdiqlaydi
- Bolalar uchun — **kod orqali kirish** (eMaktab talab qilinmaydi) — shu qo'shildi

### Texnik
- `nazoratchi_links/tutor/tests/events` jadvallari (migrate-schema)
- `src/lib/nazoratchi.ts` + `src/lib/ai.ts` (OpenAI-mos API, admin panelda sozlanadi)
- `/api/cron/nazoratchi` + vercel.json cron + webhook piggyback
- Admin statistikada: ulanishlar + testlar soni

### Sifat
- tsc ✅ · build ✅ · **182/182** test (9 ta yangi)
