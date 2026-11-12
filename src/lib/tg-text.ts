// 🧹 Telegram matnlarini xavfsiz tayyorlash (sof funksiyalar — testlar uchun ham)
/**
 * Telegram matnini xavfsiz qisqartirish: UTF-16 juftligini (emoji) yarmidan kesmaydi
 * va yolg'iz surrogat belgilarni olib tashlaydi. Aks holda Telegram
 * "Text must be encoded in UTF-8" (can't parse InlineKeyboardButton) deb rad etadi.
 */
export function safeTgText(input: string, maxCodePoints?: number): string {
  // Yolg'iz (juftsiz) surrogatlarni olib tashlash
  let s = String(input ?? "").replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
  if (maxCodePoints !== undefined) {
    const cps = Array.from(s);
    if (cps.length > maxCodePoints) s = cps.slice(0, maxCodePoints).join("");
  }
  return s;
}
