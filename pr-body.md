Nazoratchi uchun kafolatli kunlik triggerlar (Toshkent vaqti):
- `0 3 * * *` UTC = **08:00** — "Dars boshlandi" oynasi ichida
- `0 8 * * *` UTC = **13:00** — "Dars tugadi" oynasi ichida

*/5 cron deployni yiqargani uchun faqat KUNLIK (mavjud cron bir xil) ishlatiladi.
Agar shu deploy ham yiqilsa — reja limiti, bitta cron qoldiriladi (deploy xatosi
jonli botga ta'sir qilmaydi).
