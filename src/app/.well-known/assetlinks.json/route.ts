// 🔗 Android Digital Asset Links — imzolash sertifikati BARMAG'I bazadan olinadi
// (keystore CI'da yaratilgani uchun statik emas).
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET() {
  const fp = await getSetting("android_signing_fp");
  const target = [
    {
      namespace: "android_app",
      package_name: "uz.emaktab.app",
      sha256_cert_fingerprints: fp ? [fp] : [],
    },
  ];
  return NextResponse.json(target, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
