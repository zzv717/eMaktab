import { NextRequest, NextResponse } from "next/server";
import {
  extractAnyState,
  extractTalkUser,
  fetchClassMembers,
  fetchNews,
  fetchSchedule,
  fetchTeacherClasses,
  loginEmaktab,
  probeLogin,
  tashkentDayKey,
} from "@/lib/emaktab";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// eMaktab login sahifasining jonli holatini ko'rish (diagnostika).
// Dummy bilan strategiyalar sinovidan tashqari, ?login=&password= bilan HAQIQIY login ham sinaladi
// (parol javobda qaytarilmaydi). Himoya: ?secret= TELEGRAM_WEBHOOK_SECRET.
// Himoya: ?secret= TELEGRAM_WEBHOOK_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const sp = req.nextUrl.searchParams;
  if (!secret || sp.get("secret") !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // ?login=&password= — HAQIQIY login sinovi (faqat shu secret bilan).
  // Parol javobda qaytarilmaydi. Natija: status, ism, rol.
  const login = sp.get("login");
  const password = sp.get("password");
  if (login && password) {
    const result = await loginEmaktab(login, password);
    const out: Record<string, unknown> = {
      login: result.status,
      message: (result.status === "ok" ? "" : result.message).slice(0, 400),
    };
    if (result.status === "ok") {
      out.name = result.session.fullName;
      out.role = result.session.role;

      // ?check=1 — ma'lumot oqimlarini ham sinaymiz (menyu funksiyalari).
      if (sp.get("check")) {
        const check: Record<string, string> = {};
        const today = tashkentDayKey();
        let firstClassId = "";
        try {
          const classes = await fetchTeacherClasses(result.session);
          check.classes = String(classes.length);
          firstClassId = classes[0]?.classId ?? "";
          if (classes[0]) {
            try {
              const info = await fetchClassMembers(
                result.session,
                classes[0].classId,
                classes[0].className,
              );
              check.members = `${info.students.length}/${info.parents.length}`;
            } catch (error) {
              check.members = `xato ${(error instanceof Error ? error.message : String(error)).slice(0, 30)}`;
            }
          }
        } catch (error) {
          check.classes = `xato ${(error instanceof Error ? error.message : String(error)).slice(0, 30)}`;
        }
        try {
          const schedule = await fetchSchedule(result.session, today, today);
          check.schedule = String(schedule.length);
        } catch (error) {
          check.schedule = `xato ${(error instanceof Error ? error.message : String(error)).slice(0, 30)}`;
        }
        try {
          const news = await fetchNews(result.session, 3);
          check.news = String(news.length);
        } catch (error) {
          check.news = `xato ${(error instanceof Error ? error.message : String(error)).slice(0, 30)}`;
        }

        // Landing state shakli (o'qituvchi portali) — schedule qayerdaligini bilish uchun.
        try {
          const res = await fetch("https://emaktab.uz/teachers", {
            headers: {
              "User-Agent": "Mozilla/5.0",
              Cookie: Object.entries(result.session.cookies)
                .map(([k, v]) => `${k}=${v}`)
                .join("; "),
            },
            redirect: "follow",
          });
          const body = await res.text();
          const states = extractAnyState(body);
          check.shape = `${res.status} ${states.map((s) => s.marker.replace(/__/g, "")).join(",").slice(0, 280)}`;
          check.talk = extractTalkUser(body) ? "bor" : "yo'q";
        } catch (error) {
          check.shape = `xato ${(error instanceof Error ? error.message : String(error)).slice(0, 30)}`;
        }
        // Sinf sahifasi va myclasses — dars jadvali tarkibi keywordlar bilan.
        const cookieStr = Object.entries(result.session.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        for (const [label, url] of [
          ["cls", "https://schools.emaktab.uz/v2/class?class=" + firstClassId],
          ["myc", "https://schools.emaktab.uz/v2/myclasses"],
          ["jrn", "https://emaktab.uz/journal"],
        ] as const) {
          try {
            const r = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0", Cookie: cookieStr },
              redirect: "follow",
            });
            const b = await r.text();
            const lessons = (b.match(/"lessons"/g) ?? []).length;
            const subj = (b.match(/"subject"/g) ?? []).length;
            const mk = extractAnyState(b);
            check[label] = `${r.status} les=${lessons} subj=${subj} st=${mk.map((s) => s.marker.replace(/__/g, "").slice(0, 10)).join(",").slice(0, 60)}`;
          } catch (error) {
            check[label] = `xato ${String(error).slice(0, 25)}`;
          }
        }
        // Jadval API — o'qituvchi sinfi (group) bo'yicha.
        if (firstClassId && result.session.active.personId) {
          try {
            const u = `https://emaktab.uz/api/v2/persons/${result.session.active.personId}/groups/${firstClassId}/schedules?from=${today}&to=${today}&timestamp=${Date.now()}`;
            const r = await fetch(u, {
              headers: {
                "User-Agent": "Mozilla/5.0",
                Cookie: cookieStr,
                Accept: "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
                Referer: "https://emaktab.uz/userfeed",
              },
              redirect: "follow",
            });
            const b = await r.text();
            check.sch = `${r.status} ${b.slice(0, 60).replace(/\s+/g, " ")}`;
          } catch (error) {
            check.sch = `xato ${String(error).slice(0, 25)}`;
          }
        } else {
          check.sch = `pid=${result.session.active.personId ? 1 : 0} gid=${firstClassId ? 1 : 0}`;
        }
        out.check = check;
      }
    } else if (result.status === "captcha_required") {
      out.captcha = true;
      out.captchaUrl = result.captchaUrl ? "bor" : "yo'q";
      out.formState = result.formState ? "bor" : "yo'q";
    }
    return NextResponse.json(out);
  }

  // Oddiy holat: eMaktab login darvozasi holati (dummy bilan strategiyalar).
  const probe = await probeLogin();
  return NextResponse.json(probe);
}
