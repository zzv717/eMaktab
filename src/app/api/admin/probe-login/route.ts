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
        // Jurnal sahifasi window.__X__ markerlari + data-kalitlar
        {
          const parts: string[] = [];
          try {
            const pad2 = (n: number) => String(n).padStart(2, "0");
            const now = new Date(Date.now() + 5 * 3600 * 1000);
            const jrUrl = `https://emaktab.uz/journal/school/${result.session.active.schoolId}/group/${firstClassId}/week/${pad2(now.getUTCDate())}/${now.getUTCMonth() + 1}`;
            const r0 = await fetch(jrUrl, {
              headers: { "User-Agent": "Mozilla/5.0", Cookie: cookieStr, Accept: "text/html" },
              redirect: "follow",
            });
            const html = await r0.text();
            // JOURNAL__INITIAL__STATE top-level kalitlari
            const m = html.match(/JOURNAL__INITIAL__STATE__?\s*=\s*/);
            if (m && m.index !== undefined) {
              const startIdx = html.indexOf("{", m.index);
              let depth = 0, inStr = false, esc = false, endIdx = -1;
              for (let i = startIdx; i < html.length && i < startIdx + 500000; i++) {
                const ch = html[i];
                if (inStr) {
                  if (esc) esc = false;
                  else if (ch === "\\") esc = true;
                  else if (ch === '"') inStr = false;
                  continue;
                }
                if (ch === '"') inStr = true;
                else if (ch === "{") depth++;
                else if (ch === "}") {
                  depth--;
                  if (depth === 0) { endIdx = i; break; }
                }
              }
              try {
                const st = JSON.parse(html.slice(startIdx, endIdx + 1)) as Record<string, unknown>;
                const pick = (k: string) => {
                  const v = (st as Record<string, unknown>)[k];
                  return typeof v === "string" ? v.slice(0, 60) : "";
                };
                (out as Record<string, unknown>).api = pick("apiUrl") + " | " + pick("smartApiUrl");
                (out as Record<string, unknown>).urls = pick("domianUrl") + " | " + pick("journalMemoUrl") + " | " + pick("exportUrl");
                (out as Record<string, unknown>).ctp = pick("ctpApiUrl") + " | " + String((st as Record<string, unknown>).lessonId ?? "");
                (out as Record<string, unknown>).jh = pick("journalType") + " | " + pick("journalHeader");
                (out as Record<string, unknown>).jkeys = Object.keys(st).slice(20).join(",").slice(0, 100);

                // A'zo personId (=user id?) bilan diary — darslar bormi?
                {
                  const weekAgo = Math.floor((Date.now() - 7 * 86400000) / 1000);
                  const tomorrow = Math.floor((Date.now() + 86400000) / 1000);
                  try {
                    const rr = await fetch(
                      `https://emaktab.uz/api/v2/marks/diary?personId=1000020821210&schoolId=${encodeURIComponent(result.session.active.schoolId)}&startDate=${weekAgo}&finishDate=${tomorrow}&timestamp=${Date.now()}`,
                      {
                        headers: {
                          "User-Agent": "Mozilla/5.0",
                          Cookie: cookieStr,
                          Accept: "application/json, text/plain, */*",
                          Referer: "https://emaktab.uz/v2/user",
                        },
                        redirect: "follow",
                      },
                    );
                    const bb = await rr.text();
                    const dd2 = (bb.match(/"date"/g) ?? []).length;
                    const ll2 = (bb.match(/"lessonNumber"|"lessonId"|"subject"/g) ?? []).length;
                    parts.push(`dS:${rr.status}d${dd2}l${ll2}`);
                    if (dd2 > 0 || ll2 > 0) {
                      const ix2 = bb.search(/"date"/);
                      (out as Record<string, unknown>).sample = bb.slice(Math.max(0, ix2 - 20), ix2 + 130).replace(/\s+/g, " ").slice(0, 150);
                    }
                  } catch {
                    parts.push("dS:x");
                  }
                }
                // api/v2 subjects/lessons oilasi (jurnal state'dagi "subjects":null → XHR to'ldiradi!)
                {
                  const lg = "2524942980748797372";
                  const ts = Date.now();
                  const tries3: Array<[string, string]> = [
                    ["su1", `https://emaktab.uz/api/v2/subjects?groupId=${lg}`],
                    ["su2", `https://emaktab.uz/api/v2/groups/${lg}/subjects`],
                    ["ls1", `https://emaktab.uz/api/v2/lessons?groupId=${lg}&from=${ts - 7 * 86400000}&to=${ts}`],
                    ["ls2", `https://emaktab.uz/api/v2/groups/${lg}/lessons`],
                    ["le1", `https://emaktab.uz/api/v2/lesson-log-entries?personId=${encodeURIComponent(result.session.active.personId)}&groupId=${lg}`],
                  ];
                  for (const [lbl, uu] of tries3) {
                    try {
                      const rr = await fetch(uu, {
                        headers: {
                          "User-Agent": "Mozilla/5.0",
                          Cookie: cookieStr,
                          Accept: "application/json, text/plain, */*",
                          "X-Requested-With": "XMLHttpRequest",
                          Referer: "https://emaktab.uz/journal",
                        },
                        redirect: "follow",
                      });
                      const bb = await rr.text();
                      const dd2 = (bb.match(/"name"|subject|lesson|theme/gi) ?? []).length;
                      parts.push(`${lbl}:${rr.status}x${dd2}`);
                    } catch {
                      parts.push(`${lbl}:x`);
                    }
                  }
                }
              } catch {
                parts.push("json-xato");
              }
            }
          } catch (error) {
            parts.push(`xato ${String(error).slice(0, 20)}`);
          }
          check.sch = parts.join("|").slice(0, 80);
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
