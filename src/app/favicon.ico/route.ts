import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// 🎨 /favicon.ico — brauzerlar/WebView/Telegram preview HAR sahifa ochilishida
// avtomatik so'raydi; fayl bo'lmasa Vercel loglarida 404 to'planadi.
// Asosiy rasm bilan bir xil ikonkani PNG ko'rinishida qaytaramiz (barcha
// zamonaviy brauzerlar PNG faviconni qabul qiladi).
let cached: Buffer | null = null;

export async function GET() {
  try {
    if (!cached) {
      cached = await readFile(join(process.cwd(), "public", "icons", "icon-512.png"));
    }
    return new NextResponse(new Uint8Array(cached), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
