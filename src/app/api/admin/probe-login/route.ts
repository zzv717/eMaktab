import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberAccounts } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import {
  extractTeacherJournals,
  fetchClassMembers,
  fetchDiaryDays,
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

      // ?diag=1 — bazadagi o'quvchi hisoblaridan XOM diary (duplikat/smena tahlili)
      if (sp.get("diag")) {
        try {
          const rows = await db.select().from(memberAccounts).limit(30);
          const outLines: string[] = [`rows=${rows.length}`];
          let used = 0;
          let attempts = 0;
          for (const r of rows) {
            if (used >= 1 || attempts >= 8) break;
            if (!r.emaktabLogin || !r.emaktabPasswordEnc) {
              outLines.push(`${r.kind}:${r.classId ?? "?"}:nologin`);
              continue;
            }
            attempts++;
            let pw = "";
            try {
              pw = decryptSecret(r.emaktabPasswordEnc);
            } catch {
              outLines.push(`${r.emaktabLogin.slice(0, 4)}:decrypt-xato`);
              continue;
            }
            const lr = await loginEmaktab(r.emaktabLogin, pw);
            if (lr.status !== "ok") {
              outLines.push(`${r.emaktabLogin.slice(0, 4)}:${lr.status}`);
              continue;
            }
            used++;
            const days = await fetchDiaryDays(lr.session, "2026-10-25", "2026-10-27");
            const segs: string[] = [];
            for (const d of days as Array<Record<string, unknown>>) {
              const les = ((d.lessons ?? []) as Array<Record<string, unknown>>)
                .map((l) => {
                  const h = (l.hours ?? {}) as Record<string, unknown>;
                  const subj = typeof l.subject === "string" ? l.subject : ((l.subject as Record<string, unknown> | undefined)?.name as string | undefined) ?? "?";
                  return `${l.number ?? "?"}:${String(subj).slice(0, 7)}@${h.startHour ?? "-"}:${String(h.startMinute ?? "-").padStart(2, "0")}`;
                })
                .join(",");
              segs.push(`${String(d.date).slice(0, 12)}→[${les}]`.slice(0, 200));
            }
            outLines.push(
              `${r.classId ?? "?"}/${r.emaktabLogin.slice(0, 4)}x${days.length}d:${segs.join(" ; ")}`.slice(0, 260),
            );
          }
            (out as Record<string, unknown>).dia = (outLines.join(" | ") || "hisob-yok").slice(0, 300);
          } catch (e8) {
            (out as Record<string, unknown>).dia = "xato " + String(e8).slice(0, 40);
          }
        }
        // requirejs: data-main + inline require.config (modul fayllari manzili)
        try {
          const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
          const hj = await pageGet(result.session.cookies, jw);
          const dm = [...hj.matchAll(/data-main="([^"]{2,80})"/gi)].map((m) => m[1]);
          const cfg = hj.match(/require(?:js)?\.config\(\s*\{[\s\S]{0,160}/);
          (out as Record<string, unknown>).jreq =
            `dm:${dm.join(",").slice(0, 50)} cfg:${(cfg?.[0] ?? "-").replace(/\s+/g, " ").slice(0, 90)}`.slice(0, 170);
        } catch (e9) {
          (out as Record<string, unknown>).jreq = "xato " + String(e9).slice(0, 25);
        }
        // "odo/" konteksti + host/prefiks variantlari
        try {
          const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
          const hj = await pageGet(result.session.cookies, jw);
          const srcs = [...new Set([...hj.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]))].slice(0, 3);
          const hits: string[] = [];
          const scan = (bb: string): void => {
            for (const mm of bb.matchAll(/odo\//g)) {
              const i = mm.index ?? 0;
              hits.push(bb.slice(Math.max(0, i - 40), i + 55).replace(/\s+/g, " "));
            }
          };
          scan(hj);
          for (const s2 of srcs) {
            const abs = s2.startsWith("http") ? s2 : `https://emaktab.uz${s2.startsWith("/") ? "" : "/"}${s2}`;
            try {
              const rr = await fetch(abs, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "manual" });
              if (rr.status === 200) scan(await rr.text());
            } catch {
              /* o'tkazib yuboramiz */
            }
          }
          (out as Record<string, unknown>).ju4 = hits.slice(0, 3).join(" || ").slice(0, 300) || "-";
          // host/prefiks variantlari — bo'sh POST (endpoint mavjudligi)
          const ck = Object.entries(result.session.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
          const res: string[] = [];
          const targets: Array<[string, string]> = [
            ["https://schools.emaktab.uz", "/odo/journals/journalmark/editmark/"],
            ["https://emaktab.uz", "/odo/journals/journalmark/editmark/"],
            ["https://odo.emaktab.uz", "/odo/journals/journalmark/editmark/"],
            ["https://smarty.emaktab.uz", "/webapi/odo/journals/journalmark/editmark/"],
            ["https://emaktab.uz", "/webapi/odo/journals/journalmark/editmark/"],
            ["https://emaktab.uz", "/uz/odo/journals/journalmark/editmark/"],
            ["https://schools.emaktab.uz", "/v2/odo/journals/journalmark/editmark/"],
            ["https://smarty.emaktab.uz", "/api/odo/journals/journalmark/editmark/"],
          ];
          for (const [host, path] of targets) {
            try {
              const rr = await fetch(`${host}${path}`, {
                method: "POST",
                headers: { "User-Agent": "Mozilla/5.0", Cookie: ck, "Content-Type": "application/json" },
                body: "{}",
                redirect: "manual",
              });
              const bt = (await rr.text()).replace(/\s+/g, " ").slice(0, 18);
              res.push(`${host.slice(8, 13)}${path.slice(1, 7)}:${rr.status}«${bt}»`);
            } catch {
              res.push("x");
            }
          }
          (out as Record<string, unknown>).jhost = res.join(" ").slice(0, 340);
        } catch (e12) {
          (out as Record<string, unknown>).ju4 = "xato " + String(e12).slice(0, 25);
        }

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
        // smarty/smart-integration atrofidagi KOD konteksti (yo'l qo'shimchalari)
        {
          const parts: string[] = [];
          try {
            const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
            const hj = await pageGet(result.session.cookies, jw);
            const windows: string[] = [];
            const grab = (label: string, txt: string, re: RegExp): void => {
              for (const mm of txt.matchAll(re)) {
                if (windows.length >= 4) break;
                windows.push(`${label}~${txt.slice(Math.max(0, mm.index - 25), mm.index + 65).replace(/\s+/g, " ")}`);
              }
            };
            grab("pg", hj, /smarty|smart-integration/gi);
            const srcs = [...new Set([...hj.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]))].slice(0, 5);
            let fi = 0;
            for (const s2 of srcs) {
              if (windows.length >= 4) break;
              const abs = s2.startsWith("http") ? s2 : `https://emaktab.uz${s2.startsWith("/") ? "" : "/"}${s2}`;
              try {
                const rr = await fetch(abs, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "manual" });
                if (rr.status === 200) {
                  grab(`f${fi}`, await rr.text(), /smarty|smart-integration/gi);
                  fi++;
                }
              } catch {
                /* o'tkazib yuboramiz */
              }
            }
            (out as Record<string, unknown>).jsm2 = windows.join(" || ").slice(0, 190) || "-";
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
