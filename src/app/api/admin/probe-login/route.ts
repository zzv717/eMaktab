import { NextRequest, NextResponse } from "next/server";
import {
  extractTeacherJournals,
  fetchClassMembers,
  fetchNews,
  fetchSchedule,
  fetchTeacherClasses,
  fetchTeacherGroups,
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
              (out as Record<string, unknown>).mem =
                [info.students[0], info.students[1], info.parents[0]]
                  .map((x) => (x ? x.fullName.slice(0, 28) : "-"))
                  .join(" | ");

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
        // smarty.emaktab.uz + smart-integration yollari (yozuv endpointlari)
        {
          const parts: string[] = [];
          try {
            const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
            const hj = await pageGet(result.session.cookies, jw);
            const smartPaths = new Set<string>();
            for (const mm of hj.matchAll(/smarty\.emaktab\.uz(\/[a-zA-Z0-9/_\-.]{2,70})/g)) smartPaths.add(mm[1].split("?")[0]);
            for (const mm of hj.matchAll(/smart-integration(\/[a-zA-Z0-9/_\-.]{0,70})/g)) smartPaths.add(`/api/v1/smart-integration${mm[1].split("?")[0]}`);
            (out as Record<string, unknown>).jsm = [...smartPaths].slice(0, 5).map((u) => u.slice(0, 44)).join(" ").slice(0, 190) || "-";
            // smarty root + keng ajax url satrlari
            const wide = new Set<string>();
            for (const mm of hj.matchAll(/url\s*:\s*["']([^"']{3,140})["']/gi)) {
              const u = mm[1].split("?")[0];
              if (/(smarty|smart|mark|conduct|visit|task|ctp|upload|lesson)/i.test(u)) wide.add(u.slice(0, 56));
            }
            (out as Record<string, unknown>).jwide = [...wide].slice(0, 4).join(" ").slice(0, 190) || "-";
            try {
              const ck = Object.entries(result.session.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
              const rr = await fetch("https://smarty.emaktab.uz/", {
                headers: { "User-Agent": "Mozilla/5.0", Cookie: ck },
                redirect: "manual",
              });
              const body = (await rr.text()).slice(0, 60).replace(/\s+/g, " ");
              (out as Record<string, unknown>).jsroot = `${rr.status} ${body}`.slice(0, 90);
            } catch (e7) {
              (out as Record<string, unknown>).jsroot = "x " + String(e7).slice(0, 25);
            }
            parts.push("ok");
          } catch (error) {
            parts.push(`xato ${String(error).slice(0, 20)}`);
          }
          check.sch = parts.join("|").slice(0, 80);
        }
        // Yangi TEACHERV2 parser jonli tekshiruvi
        try {
          const groups = await fetchTeacherGroups(result.session);
          (out as Record<string, unknown>).groups =
            groups.length > 0
              ? groups
                  .map((g) => `${g.className}${g.isClassTeacher ? "*" : ""}[${g.subjects.slice(0, 2).join("+")}]`)
                  .join(" ")
                  .slice(0, 80)
              : "yok";
          const htmlT = await pageGet(result.session.cookies, "https://emaktab.uz/teachers");
          const jl = extractTeacherJournals(htmlT);
          (out as Record<string, unknown>).jload =
            jl.length > 0
              ? jl
                  .slice(0, 4)
                  .map((j) => `${j.subjectName.slice(0, 14)}|${j.groupName || "?"}|${j.groupId.slice(-6)}`)
                  .join(" ")
                  .slice(0, 170)
              : "yok";
        } catch (e4) {
          (out as Record<string, unknown>).groups = "xato " + String(e4).slice(0, 25);
        }
        // O'quvchi kabineti jonli test: klass sahifasidagi ochiq login bilan kirish
        try {
          const info2 = await fetchClassMembers(result.session, "25249429", "1-A");
          const cred = info2.credentials[0];
          if (cred) {
            const lr = await loginEmaktab(cred.login, cred.password);
            (out as Record<string, unknown>).stud =
              lr.status === "ok"
                ? `ok ${lr.session?.role ?? "?"} ${lr.session?.fullName ?? ""}`.slice(0, 60)
                : lr.status;
          } else {
            (out as Record<string, unknown>).stud = "cred-yok";
          }
        } catch (e5) {
          (out as Record<string, unknown>).stud = "xato " + String(e5).slice(0, 25);
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
