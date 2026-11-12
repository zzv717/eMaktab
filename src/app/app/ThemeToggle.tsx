"use client";

// 🌙 Kunduz/tungi rejim tugmasi. Tanlov localStorage'da saqlanadi.
import { useEffect, useState } from "react";

const KEY = "emaktab-theme";

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("theme-dark", dark);
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY) === "dark";
    setDark(saved);
    applyTheme(saved);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* saqlab bo'lmasa ham rejim ishlaydi */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Kunduz rejimga o'tish" : "Tungi rejimga o'tish"}
      className="fixed right-3 top-3 z-50 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm active:scale-[0.97]"
    >
      {dark ? "☀️ Kunduz" : "🌙 Tungi"}
    </button>
  );
}
