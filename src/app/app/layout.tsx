import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "eMaktab",
  description: "eMaktab ilovasi — kirish, Face ID, dars jadvali va baholar",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/icon-512.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "eMaktab",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-teal-50 via-slate-50 to-slate-100">
      {children}
      <script
        dangerouslySetInnerHTML={{
          __html: `if('serviceWorker' in navigator){addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{})})}`,
        }}
      />
    </div>
  );
}
