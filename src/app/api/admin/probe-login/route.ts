import { NextRequest, NextResponse } from "next/server";
import {
  fetchClassMembers,
  fetchNews,
  fetchSchedule,
  fetchTeacherClasses,
  loginEmaktab,
  pageGet,
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

              // O'QUVCHI diary — uning darslari = sinf jadvali (teacher ko'ra oladi!)
              const firstStu = info.students[0];
              check.stid = firstStu?.memberId ?? "yok";
              if (firstStu) {
                try {
                  const dayTs2 = Math.floor(new Date(`${today}T00:00:00+05:00`).getTime() / 1000);
                  const u2 = `https://emaktab.uz/api/v2/marks/diary?personId=${encodeURIComponent(firstStu.memberId)}&schoolId=${result.session.active.schoolId}&startDate=${dayTs2 - 7 * 24 * 3600}&finishDate=${dayTs2 + 24 * 3600 - 1}&timestamp=${Date.now()}`;
                  const ck2 = Object.entries(result.session.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
                  const r2 = await fetch(u2, {
                    headers: {
                      "User-Agent": "Mozilla/5.0",
                      Cookie: ck2,
                      Accept: "application/json, text/plain, */*",
                      "X-Requested-With": "XMLHttpRequest",
                      Referer: "https://emaktab.uz/userfeed",
                    },
                    redirect: "follow",
                  });
                  const b2 = await r2.text();
                  const daysN = (b2.match(/"date"/g) ?? []).length;
                  const lesN = (b2.match(/"lessons"/g) ?? []).length;
                  const subjN = (b2.match(/"subject"/g) ?? []).length;
                  check.dia2 = `${r2.status} d=${daysN} l=${lesN} s=${subjN} ${b2.slice(0, 45).replace(/\s+/g, " ")}`;
                } catch (error) {
                  check.dia2 = `xato ${String(error).slice(0, 25)}`;
                }
              }

              // sinf sahifasida uzun gid (17-20 xonali) bormi?
              try {
                const classHtml = await pageGet(result.session.cookies, `https://schools.emaktab.uz/v2/class?class=${encodeURIComponent(classes[0].classId)}`);
                const longIds = [...new Set(classHtml.match(/\b\d{17,20}\b/g) ?? [])].slice(0, 4);
                check.gid = longIds.join(",").slice(0, 70) || "yok";
              } catch (error) {
                check.gid = `xato ${String(error).slice(0, 20)}`;
              }
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

        // Sinf sahifasi va myclasses — havola naqshlari.
        const cookieStr = Object.entries(result.session.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        for (const [label, url] of [
          ["cls", "https://schools.emaktab.uz/v2/class?class=" + firstClassId],
          ["myc", "https://schools.emaktab.uz/v2/myclasses"],
          ["tea", "https://emaktab.uz/teachers"],
        ] as const) {
          try {
            const r = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0", Cookie: cookieStr },
              redirect: "follow",
            });
            const b = await r.text();
            // Havola naqshlari — saytning haqiqiy tuzilmasi.
            const paths = [
              ...new Set(
                (b.match(/(?:href|action)="([^"]{4,120})"/g) ?? [])
                  .map((h) => h.replace(/^(?:href|action)="/, "").slice(0, -1))
                  .map((h) => {
                    try {
                      return h.startsWith("http") ? new URL(h).pathname : h.split("?")[0];
                    } catch {
                      return h.split("?")[0];
                    }
                  })
                  .filter(
                    (h) =>
                      /^\/[a-z]/i.test(h) &&
                      !/(static|\/css|\/img|\/assets|\/styles|\/blocks|\/fonts|\.css|\.ico|\.png|\.svg|\.js)/i.test(h),
                  ),
              ),
            ];
            check[label] = `${r.status} ${paths.slice(0, 8).join(" ").slice(0, 90)}`;
          } catch (error) {
            check[label] = `xato ${String(error).slice(0, 25)}`;
          }
        }
        // Token olish urinishlari (api.emaktab.uz uchun Bearer)
        {
          const parts: string[] = [];
          const login = sp.get("login") ?? "";
          const passwordRaw = sp.get("password") ?? "";
          const cookieVal = (k: string) => cookieStr.split("; ").find((p) => p.startsWith(k + "="))?.slice(k.length + 1) ?? "";
          const body = `grant_type=password&username=${encodeURIComponent(login)}&password=${encodeURIComponent(passwordRaw)}`;
          for (const [lbl, url] of [
            ["o1", "https://login.emaktab.uz/oauth/token"],
            ["o2", "https://emaktab.uz/oauth/token"],
            ["o3", "https://login.emaktab.uz/connect/token"],
          ] as const) {
            try {
              const r = await fetch(url, {
                method: "POST",
                headers: {
                  "User-Agent": "Mozilla/5.0",
                  "Content-Type": "application/x-www-form-urlencoded",
                  Accept: "application/json",
                },
                body,
                redirect: "follow",
              });
              const b = await r.text();
              const hasTok = b.includes("access_token") ? 1 : 0;
              parts.push(`${lbl}:${r.status}t${hasTok}${b.slice(0, 18).replace(/[\s{}"]|[\\]/g, "")}`);
            } catch {
              parts.push(`${lbl}:x`);
            }
          }
          // Cookie qiymatlari Bearer sifatida
          for (const [lbl, ck] of [["b1", "sst"], ["b2", "UZDnevnikAuth_a"], ["b3", "t0"]] as const) {
            try {
              const r = await fetch("https://api.emaktab.uz/v2/users/me", {
                headers: {
                  "User-Agent": "Mozilla/5.0",
                  Accept: "application/json",
                  Authorization: `Bearer ${cookieVal(ck)}`,
                },
                redirect: "follow",
              });
              const b = await r.text();
              parts.push(`${lbl}:${r.status}${b.includes("access") || b.includes("userName") || b.includes("person") ? "y" : "n"}`);
            } catch {
              parts.push(`${lbl}:x`);
            }
          }
          check.sch = parts.join(" ").slice(0, 140);
        }
        try {
          const dayTs = Math.floor(new Date(`${today}T00:00:00+05:00`).getTime() / 1000);
          const u = `https://emaktab.uz/api/v2/marks/diary?personId=${result.session.active.personId}&schoolId=${result.session.active.schoolId}&startDate=${dayTs - 7 * 24 * 3600}&finishDate=${dayTs + 24 * 3600 - 1}&timestamp=${Date.now()}`;
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
          const dayCount = (b.match(/"date"/g) ?? []).length;
          const lessonCount = (b.match(/"lessons"/g) ?? []).length;
          let keys = "";
          try {
            keys = Object.keys(JSON.parse(b) as Record<string, unknown>).join(",").slice(0, 60);
          } catch {}
          check.dia = `${r.status} d=${dayCount} l=${lessonCount} k:${keys}`;
        } catch (error) {
          check.dia = `xato ${String(error).slice(0, 25)}`;
        }
        // Jurnal to'liq URL (fixture'dagi naqsh: /journal/school/{sid}/group/{gid}/week/{dd}/{m})
        const pad2 = (n: number) => String(n).padStart(2, "0");
        const now = new Date(Date.now() + 5 * 3600 * 1000); // Toshkent
        const monday = new Date(now);
        monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
        const tryUrls: Array<[string, string]> = [
          ["jr1", `https://emaktab.uz/journal/school/${result.session.active.schoolId}/group/${firstClassId}/week/${pad2(now.getUTCDate())}/${now.getUTCMonth() + 1}`],
          ["jr2", `https://emaktab.uz/journal/school/${result.session.active.schoolId}/group/${firstClassId}/week/${pad2(monday.getUTCDate())}/${monday.getUTCMonth() + 1}`],
        ];
        check.ids = `sid=${result.session.active.schoolId ? result.session.active.schoolId.slice(0, 8) : 0} gid=${firstClassId ? firstClassId.slice(0, 8) : 0}`;
        for (const [label, url] of tryUrls) {
          try {
            const r = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0", Cookie: cookieStr },
              redirect: "follow",
            });
            const b = await r.text();
            const lessons = (b.match(/lessons|lesson|urok|урок/gi) ?? []).length;
            const subj = (b.match(/subject|predmet|предмет|тема|theme/gi) ?? []).length;
            const dates = (b.match(/subjectName|teacherName|lessonTime|roomNumber|hours|theme/gi) ?? []).length;
            const marks = (b.match(/ratingsMarks|workMark|journal/gi) ?? []).length;
            const paths = [
              ...new Set(
                (b.match(/(?:href|action)="([^"]{4,120})"/g) ?? [])
                  .map((h) => h.replace(/^(?:href|action)="/, "").slice(0, -1))
                  .map((h) => {
                    try {
                      return h.startsWith("http") ? new URL(h).pathname : h.split("?")[0];
                    } catch {
                      return h.split("?")[0];
                    }
                  })
                  .filter((h) => /^\/[a-z]/i.test(h) && !h.includes("static")),
              ),
            ];
            check[label] = `${r.status} l=${lessons} s=${subj} d=${dates} m=${marks}`;
          } catch (error) {
            check[label] = `xato ${String(error).slice(0, 25)}`;
          }
        }
        // Muhimlar birinchi (javob uzunligi cheklangani uchun).
        out.check = {
          sch: check.sch,
          dia2: check.dia2,
          stid: check.stid,
          gid: check.gid,
          schedule: check.schedule,
          dia: check.dia,
          ids: check.ids,
          jr1: check.jr1,
          jr2: check.jr2,
          classes: check.classes,
          members: check.members,
          news: check.news,
        };
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
