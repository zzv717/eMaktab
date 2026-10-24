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
          let sampled = false;
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

                // 1) JOURNAL state — BARCHA kalitlar + URL qiymatlar
                {
                  try {
                    const jj = Object.entries(st as Record<string, unknown>);
                    (out as Record<string, unknown>).jstate = jj
                      .map(([k]) => k)
                      .join(",")
                      .slice(0, 160);
                    const urls = jj
                      .filter(([k, v]) => /url|api/i.test(k) && typeof v === "string" && v.length > 0)
                      .map(([k, v]) => `${k}=${(v as string).slice(0, 45)}`)
                      .join(" ;; ")
                      .slice(0, 170);
                    (out as Record<string, unknown>).jurls = urls || "-";
                  } catch {
                    (out as Record<string, unknown>).jstate = "xato";
                  }
                }
                // 2) myclasses "curator/руководитель/classTeacher" konteksti
                {
                  try {
                    const hm = await pageGet(result.session.cookies, "https://schools.emaktab.uz/v2/myclasses");
                    const found: string[] = [];
                    for (const re of [/руководитель/gi, /curator/gi, /klass_rahbar/gi, /classTeacher/gi]) {
                      for (const mm of hm.matchAll(re)) {
                        const ix2 = mm.index ?? 0;
                        found.push(
                          `[${mm[0]}]` +
                            hm
                              .slice(Math.max(0, ix2 - 45), ix2 + 55)
                              .replace(/<[^>]*>/g, " ")
                              .replace(/\s+/g, " "),
                        );
                        if (found.length >= 3) break;
                      }
                      if (found.length >= 3) break;
                    }
                    (out as Record<string, unknown>).cura = found.join(" ||| ").slice(0, 170) || "-";
                    // /teachers barcha markerlar + kalitlar
                    try {
                      const ht = await pageGet(result.session.cookies, "https://emaktab.uz/teachers");
                      const markers = [...new Set([...ht.matchAll(/window\.__([A-Z0-9_]{3,40})__/g)].map((m) => m[1]))];
                      (out as Record<string, unknown>).markers = markers.join(",").slice(0, 140) || "-";
                      const kparts: string[] = [];
                      for (const name of markers.slice(0, 5)) {
                        const mm2 = ht.match(new RegExp(name + "__?\\s*=\\s*"));
                        if (!mm2 || mm2.index === undefined) continue;
                        const sIdx = ht.indexOf("{", mm2.index);
                        let depth = 0, inStr = false, esc = false, eIdx = -1;
                        for (let i = sIdx; i < ht.length && i < sIdx + 200000; i++) {
                          const ch = ht[i];
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
                            if (depth === 0) { eIdx = i; break; }
                          }
                        }
                        if (eIdx > sIdx) {
                          try {
                            const st2 = JSON.parse(ht.slice(sIdx, eIdx + 1)) as Record<string, unknown>;
                            kparts.push(`${name.slice(0, 10)}:{${Object.keys(st2).slice(0, 6).join(",").slice(0, 50)}}`);
                          } catch {
                            // JSON emas — regex bilan kalitlar + xom namuna
                            const slice = ht.slice(sIdx, Math.min(eIdx + 1, sIdx + 3000));
                            const keys = [...new Set([...slice.matchAll(/["']?([A-Za-z_][A-Za-z0-9_]{2,25})["']?\s*:/g)].map((m) => m[1]))].slice(0, 14);
                            kparts.push(`${name.slice(0, 10)}:{${keys.join(",").slice(0, 70)}}`);
                            if (name.startsWith("TEACHER") && !(out as Record<string, unknown>).tv2) {
                              const allKeys = [...new Set([...slice.matchAll(/["']?([A-Za-z_][A-Za-z0-9_]{2,25})["']?\s*:/g)].map((m) => m[1]))];
                              (out as Record<string, unknown>).tv2 = slice.replace(/\s+/g, " ").slice(0, 190);
                              (out as Record<string, unknown>).tv2k = allKeys.join(",").slice(0, 190);
                              (out as Record<string, unknown>).tv2b = slice.replace(/\s+/g, " ").slice(150, 380);
                            }
                          }
                        }
                      }
                      (out as Record<string, unknown>).mkeys = kparts.join(" ").slice(0, 200) || "-";
                    } catch (e2) {
                      (out as Record<string, unknown>).markers = "xato " + String(e2).slice(0, 25);
                    }
                    const hrefs = [...new Set([...hm.matchAll(/href="([^"]*\/v2\/class[^"]*)"/gi)].map((m) => m[1]))].slice(0, 3);
                    (out as Record<string, unknown>).mhref = hrefs.map((h) => h.slice(0, 50)).join(" | ").slice(0, 150) || "-";
                  } catch {
                    (out as Record<string, unknown>).cura = "xato";
                  }
                }
                // 3) members xom satr (pageGet bilan) + personId → diary
                {
                  try {
                    const hv = await pageGet(result.session.cookies, "https://schools.emaktab.uz/v2/class?class=25249429");
                    const ix2 = hv.search(/user\?user=[0-9]+/);
                    (out as Record<string, unknown>).mrow = (ix2 >= 0 ? hv.slice(Math.max(0, ix2 - 130), ix2 + 50) : "-").replace(/\s+/g, " ").slice(0, 170);
                    const pm = (ix2 >= 0 ? hv.slice(Math.max(0, ix2 - 250), ix2 + 250) : "").match(/(?:pid|person|child|member|user)=(\d{7,})/i);
                    if (pm) {
                      parts.push(`pid:${pm[1]}`);
                      const dUrl = `https://emaktab.uz/api/v2/marks/diary?personId=${pm[1]}&schoolId=${encodeURIComponent(result.session.active.schoolId)}&startDate=${Math.floor((Date.now() - 7 * 86400000) / 1000)}&finishDate=${Math.floor((Date.now() + 86400000) / 1000)}&timestamp=${Date.now()}`;
                      const rd = await fetch(dUrl, {
                        headers: { "User-Agent": "Mozilla/5.0", Cookie: cookieStr, Accept: "application/json", Referer: "https://emaktab.uz/v2/" },
                        redirect: "manual",
                      });
                      const bd = await rd.text();
                      const dd2 = (bd.match(/"date"/g) ?? []).length;
                      const ll2 = (bd.match(/"lessonNumber"|"subject"/g) ?? []).length;
                      parts.push(`dS:${rd.status}d${dd2}l${ll2}`);
                      if (dd2 > 0) {
                        (out as Record<string, unknown>).dsample = bd.slice(Math.max(0, bd.indexOf('"date"') - 10), bd.indexOf('"date"') + 150).replace(/\s+/g, " ").slice(0, 160);
                      }
                    } else {
                      parts.push("pid:-");
                    }
                  } catch {
                    parts.push("mem:x");
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
