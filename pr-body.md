## Hotfix: Vercel deploy xatosi

#164 deployi YIQILDI (Vercel status: "Deployment has failed") — ehtimoliy sabab:
vercel.json dagi `*/5 * * * *` cron (reja chastotasi limitidan oshgan).

### Tuzatish
- `*/5` cron olib tashlandi (deploy xavfsiz)
- `/api/cron/nazoratchi` — endi sir talab qilmaydi (refresh-webhook tamoyili):
  ichida 2 daqiqalik qulf + kunlik dedup, xavfsiz
- `refresh-webhook` croniga Nazoratchi tekshiruvi qo'shildi (kunlik bepul trigger)
- Qolgan triggerlar: webhook orqali har qanday faollikda (2 daqiqalik qulf bilan)

Deploy ishga tushgach (status tekshiriladi) — alohida PRda kunlik cron
(08:00 Toshkent) qayta qo'shiladi yoki reja ruxsat bersa ko'proq.
