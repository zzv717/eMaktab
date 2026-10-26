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
  parseHomeworkRows,
  parseHomeworkSelects,
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
        } catch (e12) {
          (out as Record<string, unknown>).ju4 = "xato " + String(e12).slice(0, 25);
        }

      // ?hostonly=1|2 — yengil host/prefiks sinovi (faqat login + 4 ta POST + kontekst)
      if (sp.get("hostonly")) {
        const ck = Object.entries(result.session.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
        const hset = sp.get("hostonly");
        const targets: Array<[string, string]> =
          hset === "2"
            ? [
                ["https://emaktab.uz", "/webapi/odo/journals/journalmark/editmark/"],
                ["https://emaktab.uz", "/uz/odo/journals/journalmark/editmark/"],
                ["https://schools.emaktab.uz", "/v2/odo/journals/journalmark/editmark/"],
                ["https://smarty.emaktab.uz", "/api/odo/journals/journalmark/editmark/"],
              ]
            : [
                ["https://schools.emaktab.uz", "/odo/journals/journalmark/editmark/"],
                ["https://emaktab.uz", "/odo/journals/journalmark/editmark/"],
                ["https://odo.emaktab.uz", "/odo/journals/journalmark/editmark/"],
                ["https://smarty.emaktab.uz", "/webapi/odo/journals/journalmark/editmark/"],
              ];
        const res: string[] = [];
        for (const [host, path] of targets) {
          try {
            const rr = await fetch(`${host}${path}`, {
              method: "POST",
              headers: { "User-Agent": "Mozilla/5.0", Cookie: ck, "Content-Type": "application/json" },
              body: "{}",
              redirect: "manual",
              signal: AbortSignal.timeout(8000),
            });
            const bt = (await rr.text()).replace(/\s+/g, " ").trim().slice(0, 16);
            res.push(`${host.slice(8, 13)}|${path.slice(1, 7)}:${rr.status}«${bt}»`);
          } catch (e13) {
            res.push(`x${String(e13).slice(0, 12)}`);
          }
        }
        (out as Record<string, unknown>).jhost = res.join(" ");
        // kontekst: odo/ atrofidagi kod (faqat 1-chi to'plamda)
        if (hset !== "2") {
          try {
            const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
            const hj = await pageGet(result.session.cookies, jw);
            const srcs = [...new Set([...hj.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]))].slice(0, 5);
            const hits: string[] = [];
            const scan = (bb: string): void => {
              for (const mm of bb.matchAll(/odo\//g)) {
                const i = mm.index ?? 0;
                hits.push(bb.slice(Math.max(0, i - 50), i + 190).replace(/\s+/g, " "));
              }
            };
            scan(hj);
            for (const s2 of srcs) {
              const abs = s2.startsWith("http") ? s2 : `https://emaktab.uz${s2.startsWith("/") ? "" : "/"}${s2}`;
              try {
                const rr = await fetch(abs, {
                  headers: { "User-Agent": "Mozilla/5.0" },
                  redirect: "manual",
                  signal: AbortSignal.timeout(8000),
                });
                if (rr.status === 200) scan(await rr.text());
              } catch {
                /* o'tkazib yuboramiz */
              }
            }
            (out as Record<string, unknown>).ju4 = hits.slice(0, 2).join(" || ").slice(0, 380) || "-";
            (out as Record<string, unknown>).jsrc = srcs.map((u) => u.slice(-60)).join(" ").slice(0, 300);
          } catch (e14) {
            (out as Record<string, unknown>).ju4 = "xato " + String(e14).slice(0, 20);
          }
        }
        return NextResponse.json(out);
      }
      // ?jread=1 — jurnal sahifasi inline skriptlaridagi yozuv kodini o'qish
      if (sp.get("jread")) {
        try {
        const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
        const hj = await pageGet(result.session.cookies, jw);
        const outL: string[] = [];
        // xom HTML (inline skriptlar ham ichida)
        const inl = [hj];
        // yozuv endpointlari (editmark/editlesson/conducted/odo) va CTP chaqiruvlari alohida
        const k1 = /editmark|editlesson|conducted|otkazildi|\/odo\//gi;
        const k2 = /ctpApiUrl\s*[+:]|editctp|uploadctp|workplan|addHomework|CtpPopup|ctpcommon/gi;
        const grab = (re: RegExp): string[] => {
          const acc: string[] = [];
          for (const sc of inl) {
            for (const mm of sc.matchAll(re)) {
              const i = mm.index ?? 0;
              acc.push(sc.slice(Math.max(0, i - 30), i + 340).replace(/\s+/g, " "));
              if (acc.length >= 3) break;
            }
            if (acc.length >= 3) break;
          }
          return acc;
        };
        const g1 = grab(k1);
        const g2 = grab(k2);
        (out as Record<string, unknown>).j1 = g1.join(" ~~ ").slice(0, 900) || "-";
        (out as Record<string, unknown>).j2 = g2.join(" ~~ ").slice(0, 900) || "-";
        (out as Record<string, unknown>).jread = outL.length > 0 ? "ok" : "-";
        (out as Record<string, unknown>).jlen = `html=${hj.length}`;
        } catch (e15) {
          (out as Record<string, unknown>).jread = "xato " + String(e15).slice(0, 40);
        }
        return NextResponse.json(out);
      }
      // ?jmods=1 — jurnal sahifasidagi require/define modul IDlari
      if (sp.get("jmods")) {
        try {
          const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
          const hj = await pageGet(result.session.cookies, jw);
          const mods = new Set<string>();
          for (const m of hj.matchAll(/require\(\s*\[([^\]]{2,400})\]/g)) {
            for (const q of m[1].matchAll(/["']([^"']{2,60})["']/g)) mods.add(q[1]);
          }
          for (const m of hj.matchAll(/define\(\s*["']([^"']{2,60})["']/g)) mods.add(m[1]);
          for (const m of hj.matchAll(/data-main="([^"]{2,80})"/g)) mods.add("dm:" + m[1]);
          (out as Record<string, unknown>).jmods = [...mods].slice(0, 24).join(" ").slice(0, 800) || "-";
          // CTP/o'tkazildi atrof-kontekstlari (kengaytirilgan kalitlar)
          const kws2 = /CtpPopup|CtpCommon|ctppopup|lessonstate|lessonState|visitlog|factHours|isHeld|isTaught|o'tkazildi|otkazildi|conduct|editlesson|editvisit|attendance|journallesson/gi;
          const acc2: string[] = [];
          for (const mm of hj.matchAll(kws2)) {
            const i = mm.index ?? 0;
            acc2.push(hj.slice(Math.max(0, i - 50), i + 140).replace(/\s+/g, " "));
            if (acc2.length >= 3) break;
          }
          (out as Record<string, unknown>).jc = acc2.join(" ~~ ").slice(0, 700) || "-";
        } catch (e16) {
          (out as Record<string, unknown>).jmods = "xato " + String(e16).slice(0, 40);
        }
        return NextResponse.json(out);
      }
      // ?jfind=1 — keng qidiruv: MetaGroup/ctp/o'tkazildi/init naqshlari + schools journals sahifasi
      if (sp.get("jfind")) {
        try {
          const pages: Array<[string, string]> = [
            ["w", `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`],
            ["s", `https://schools.emaktab.uz/journals/?school=${encodeURIComponent(result.session.active.schoolId)}`],
          ];
          const groups: Array<[string, RegExp]> = [
            ["A", /MetaGroup|marksTable|journalTable|data-work|data-school|editmark/gi],
            ["B", /ctpApi|\bctp\b|Ctp|kalendar|ish.?reja|workplan|WorkPlan|editctp|uploadctp/gi],
            ["C", /o'tkaz|otkaz|conducted|visitlog|attendance|factHours|isHeld|journallesson|editlesson/gi],
            ["D", /require\(|requirejs|dnevnik\.blocks|blocks\.init|\$\.ajax/gi],
          ];
          const resL: string[] = [];
          for (const [pLabel, u] of pages) {
            const html = await pageGet(result.session.cookies, u);
            for (const [gLabel, re] of groups) {
              let found = 0;
              for (const mm of html.matchAll(re)) {
                const i = mm.index ?? 0;
                resL.push(`${pLabel}${gLabel}:` + html.slice(Math.max(0, i - 30), i + 110).replace(/\s+/g, " "));
                found++;
                if (found >= 1) break;
              }
              if (found === 0) resL.push(`${pLabel}${gLabel}:-`);
            }
          }
          (out as Record<string, unknown>).jfind = resL.join(" ~~ ").slice(0, 1300);
        } catch (e17) {
          (out as Record<string, unknown>).jfind = "xato " + String(e17).slice(0, 40);
        }
        return NextResponse.json(out);
      }
      // ?jdump=1 — haftalik jurnal HTML namunalari + tuzilma sanagichlari
      if (sp.get("jdump")) {
        try {
          const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
          const hj = await pageGet(result.session.cookies, jw);
          const counts = {
            table: (hj.match(/<table/gi) ?? []).length,
            td: (hj.match(/<td/gi) ?? []).length,
            dataMark: (hj.match(/data-mark/gi) ?? []).length,
            lesson: (hj.match(/lesson/gi) ?? []).length,
            script: (hj.match(/<script/gi) ?? []).length,
            form: (hj.match(/<form/gi) ?? []).length,
            odo: (hj.match(/odo\//gi) ?? []).length,
          };
          (out as Record<string, unknown>).jd = JSON.stringify(counts);
          (out as Record<string, unknown>).js1 = hj.slice(12000, 13400).replace(/\s+/g, " ");
          (out as Record<string, unknown>).js2 = hj.slice(26000, 27400).replace(/\s+/g, " ");
        } catch (e19) {
          (out as Record<string, unknown>).jd = "xato " + String(e19).slice(0, 40);
        }
        return NextResponse.json(out);
      }
      // ?jax=1 — $.get/$.post/fetch/require chaqiruv kontekstlari
      if (sp.get("jax")) {
        try {
          const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
          const hj = await pageGet(result.session.cookies, jw);
          const acc: string[] = [];
          for (const mm of hj.matchAll(/\$\.get\(|\$\.post\(|\$\.getJSON\(|fetch\(|XMLHttpRequest|require\(|requirejs\(/g)) {
            const i = mm.index ?? 0;
            acc.push(mm[0] + "@" + hj.slice(i, i + 160).replace(/\s+/g, " "));
            if (acc.length >= 8) break;
          }
          (out as Record<string, unknown>).jax = acc.join(" ~~ ").slice(0, 1400) || "-";
        } catch (e20) {
          (out as Record<string, unknown>).jax = "xato " + String(e20).slice(0, 40);
        }
        return NextResponse.json(out);
      }
      // ?jsp=1 — schools journals SPA: script src + href + bundle naqshlari
      if (sp.get("jsp")) {
        try {
          const su = `https://schools.emaktab.uz/journals/?school=${encodeURIComponent(result.session.active.schoolId)}`;
          const html = await pageGet(result.session.cookies, su);
          const srcs: string[] = [];
          const hrefs = [...new Set([...html.matchAll(/href="([^"]{4,90})"/gi)].map((m) => m[1]))]
            .filter((h) => /journal|group|lesson|odo/i.test(h))
            .slice(0, 10);
          const kws3 = /conducted|otkazildi|o'tkazildi|visitlog|editlesson|ctp|workplan|ish.?reja|upload/gi;
          const acc3: string[] = [];
          for (const mm of html.matchAll(kws3)) {
            const i = mm.index ?? 0;
            acc3.push(html.slice(Math.max(0, i - 40), i + 120).replace(/\s+/g, " "));
            if (acc3.length >= 3) break;
          }
          (out as Record<string, unknown>).jsrcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]))].slice(0, 16).join(" ").slice(0, 1200);
          (out as Record<string, unknown>).jsp = `len=${html.length} hrefs:${hrefs.join(" ").slice(0, 300)} | kw:${acc3.join(" ~~ ").slice(0, 400)}`;
        } catch (e21) {
          (out as Record<string, unknown>).jsp = "xato " + String(e21).slice(0, 40);
        }
        return NextResponse.json(out);
      }
      // ?jday=1 — kunlik jurnal (darslar, o'tkazildi, CTP) + haftalik sahifa oxiri
      if (sp.get("jday")) {
        try {
          const today = tashkentDayKey();
          const [yy, mm2, dd2] = today.split("-");
          const dayUrl = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/day/${Number(dd2)}/${Number(mm2)}/${yy}`;
          const html = await pageGet(result.session.cookies, dayUrl);
          const counts = {
            len: html.length,
            table: (html.match(/<table/gi) ?? []).length,
            dataMark: (html.match(/data-mark/gi) ?? []).length,
            odo: (html.match(/odo\//gi) ?? []).length,
            otkaz: (html.match(/tkazildi/gi) ?? []).length,
            ctp: (html.match(/ctp/gi) ?? []).length,
          };
          const kws4 = /editmark|editlesson|conducted|tkazildi|visitlog|data-work|data-school|journallesson|\bctp\b|CtpPopup|workplan/gi;
          const acc4: string[] = [];
          for (const mm of html.matchAll(kws4)) {
            const i = mm.index ?? 0;
            acc4.push(html.slice(Math.max(0, i - 40), i + 150).replace(/\s+/g, " "));
            if (acc4.length >= 3) break;
          }
          (out as Record<string, unknown>).jday = JSON.stringify(counts);
          (out as Record<string, unknown>).jdayk = acc4.join(" ~~ ").slice(0, 800) || "-";
        } catch (e22) {
          (out as Record<string, unknown>).jday = "xato " + String(e22).slice(0, 40);
        }
        return NextResponse.json(out);
      }
      // ?jtail=1 — haftalik jurnal sahifasi boshi va oxiri
      if (sp.get("jtail")) {
        try {
          const jw = `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`;
          const hj = await pageGet(result.session.cookies, jw);
          (out as Record<string, unknown>).jt1 = hj.slice(0, 1200).replace(/\s+/g, " ");
          (out as Record<string, unknown>).jt2 = hj.slice(-3000).replace(/\s+/g, " ").slice(0, 1600);
        } catch (e23) {
          (out as Record<string, unknown>).jt1 = "xato " + String(e23).slice(0, 40);
        }
        return NextResponse.json(out);
      }
      // ?jwsrc=1 — haftalik + kunlik sahifalarning to'liq script src ro'yxati
      if (sp.get("jwsrc")) {
        try {
          const today = tashkentDayKey();
          const [yy, mm2, dd2] = today.split("-");
          const pages: Array<[string, string]> = [
            ["w", `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`],
            ["d", `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/day/${Number(dd2)}/${Number(mm2)}/${yy}`],
          ];
          const resL: string[] = [];
          for (const [lab, u] of pages) {
            const html = await pageGet(result.session.cookies, u);
            const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]))];
            resL.push(`${lab}(${srcs.length}):` + srcs.map((x) => x.replace(/^https?:\/\/static\.emaktab\.uz/, "").split("?")[0]).join(" ").slice(0, 700));
          }
          (out as Record<string, unknown>).jwsrc = resL.join(" ~~ ").slice(0, 1400);
        } catch (e24) {
          (out as Record<string, unknown>).jwsrc = "xato " + String(e24).slice(0, 40);
        }
        return NextResponse.json(out);
      }






      // ?jurls=1 — sahifadagi barcha URL/yol naqshlari
      if (sp.get("jurls")) {
        try {
          const pages: Array<[string, string]> = [
            ["w", `https://emaktab.uz/journal/school/${encodeURIComponent(result.session.active.schoolId)}/group/2524942980748797372/week/26/10`],
            ["s", `https://schools.emaktab.uz/journals/?school=${encodeURIComponent(result.session.active.schoolId)}`],
          ];
          const resL: string[] = [];
          for (const [pLabel, u] of pages) {
            const html = await pageGet(result.session.cookies, u);
            const urls = new Set<string>();
            for (const m of html.matchAll(/(?:https?:)?\\?\/\\?\/[a-z0-9.-]*emaktab\.uz[^"'\\\s<]{0,70}/gi)) {
              urls.add(m[0].replace(/\\/g, "").slice(0, 70));
            }
            for (const m of html.matchAll(/["'](\/(?:api|v2|journal|journals|odo|userfeed|marks)[^"']{0,60})["']/gi)) {
              urls.add(m[1]);
            }
            resL.push(`${pLabel}:` + [...urls].slice(0, 14).join(" ").slice(0, 700));
          }
          (out as Record<string, unknown>).jurls = resL.join(" ~~ ").slice(0, 1400);
        } catch (e18) {
          (out as Record<string, unknown>).jurls = "xato " + String(e18).slice(0, 40);
        }
        return NextResponse.json(out);
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
      // ?hw=1 — uy vazifasi (schools.emaktab.uz/v2/homework) shartnoma kashfiyoti:
      // 1) ro'yxat sahifasi (filtr formasi, qatorlar), 2) uy vazifasi sahifasi (+ Maqom),
      // 3) tahrirlash sahifasi (Saqlash formasi). Qo'shimcha: school=, work=.
      if (sp.get("hw")) {
        const hw: Record<string, unknown> = {};
        const school = sp.get("school") ?? "1000006039552";
        const work = sp.get("work") ?? "2534034219628613169";
        const base = `https://schools.emaktab.uz/v2/homework?school=${school}`;
        // Diqqat: fetch_page HTML→markdown konvertatsiyasi <...> teglarini yutadi —
        // burchak qavslarni ‹ › ga almashtiramiz, markup shu tariqa saqlanib qoladi.
        const pick = (s: string | null, n: number) =>
          (s ?? "").slice(0, n).replace(/</g, "\u2039").replace(/>/g, "\u203a");
        try {
          const list = await pageGet(result.session.cookies, base);
          hw.listLen = list.length;
          hw.listForms = [...new Set((list.match(/<form[^>]*>/gi) ?? []).map((x) => pick(x, 180)))].slice(0, 6);
          const sels = [...list.matchAll(/<select[^>]*name="([^"]{1,40})"[^>]*>/gi)].slice(0, 8);
          hw.listSelects = sels.map((m) => {
            const tail = list.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 300);
            return `${m[1]} :: ${pick(tail.replace(/\s+/g, " "), 240)}`;
          });
          hw.listInputs = [
            ...new Set((list.match(/<(?:input|textarea)[^>]*>/gi) ?? []).map((x) => pick(x, 150))),
          ].slice(0, 18);
          hw.listLinks = [
            ...new Set((list.match(/(?:href|action)="[^"]{0,140}"/gi) ?? []).filter((h) => /homework|lesson|maqom/i.test(h))),
          ]
            .map((h) => pick(h, 150))
            .slice(0, 12);
          const tr = (list.match(/<tr[^>]*>[\s\S]{0,1500}?(?:berilgan|Bajarildi)[\s\S]{0,500}?<\/tr>/i) ?? [])[0];
          hw.listRow = tr ? pick(tr.replace(/\s+/g, " "), 900) : "qator topilmadi";
          const wri = list.indexOf("work=");
          hw.listRowCtx = wri >= 0 ? pick(list.slice(Math.max(0, wri - 700), wri + 1500).replace(/\s+/g, " "), 2100) : "-";
          hw.listJs = [
            ...new Set((list.match(/["'][^"']{0,70}(?:homework|maqom)[^"']{0,70}["']/gi) ?? []).map((x) => pick(x, 110))),
          ].slice(0, 10);
          hw.listEndpoints = [
            ...new Set([
              ...(list.match(/\$\.(?:post|get|ajax)\([^)]{0,120}/gi) ?? []),
              ...(list.match(/(?:url|action)\s*[:=]\s*['"][^'"]{0,100}/gi) ?? []),
            ]),
          ]
            .map((x) => pick(x, 150))
            .slice(0, 14);
        } catch (e) {
          hw.listErr = pick(String(e), 100);
        }
        try {
          const det = await pageGet(result.session.cookies, `${base}&work=${work}`);
          hw.detLen = det.length;
          const low = det.toLowerCase();
          const idxs: number[] = [];
          let p = 0;
          while (idxs.length < 3 && p < low.length) {
            const i = low.indexOf("maqom", p);
            if (i < 0) break;
            idxs.push(i);
            p = i + 5;
          }
          hw.maqomHits = idxs.length;
          hw.maqomCtx = idxs.map((i) => pick(det.slice(Math.max(0, i - 350), i + 700).replace(/\s+/g, " "), 850));
          hw.detForms = [...new Set((det.match(/<form[^>]*>/gi) ?? []).map((x) => pick(x, 180)))].slice(0, 6);
          hw.detJs = [
            ...new Set((det.match(/["'][^"']{0,70}(?:maqom|homework)[^"']{0,70}["']/gi) ?? []).map((x) => pick(x, 110))),
          ].slice(0, 10);
          hw.detEndpoints = [
            ...new Set([
              ...(det.match(/(?:href|action|onclick)="[^"]{0,140}"/gi) ?? []).filter((h) => /maqom|result|status|check/i.test(h)),
              ...(det.match(/\$\.(?:post|get|ajax)\([^)]{0,120}/gi) ?? []),
              ...(det.match(/(?:url|action)\s*[:=]\s*['"][^'"]{0,100}/gi) ?? []),
            ]),
          ]
            .map((x) => pick(x, 150))
            .slice(0, 14);
          hw.detScripts = [...new Set((det.match(/<script[^>]*src="[^"]{0,140}"/gi) ?? []))].map((x) => pick(x, 150)).slice(0, 14);
          hw.detRequire = [...new Set((det.match(/(?:require|define)\(\s*\[[^\]]{0,220}\]/g) ?? []))].map((x) => pick(x, 240)).slice(0, 6);
          hw.detAjax = [...new Set((det.match(/\$\.(?:post|get|ajax|getJSON)\([\s\S]{0,260}/g) ?? []))].map((x) => pick(x, 300)).slice(0, 6);
          const gis: number[] = [];
          let gp = 0;
          while (gis.length < 3 && gp < det.length) {
            const gi = det.indexOf("giveaway", gp);
            if (gi < 0) break;
            gis.push(gi);
            gp = gi + 8;
          }
          hw.giveawayCtx = gis.map((i) => pick(det.slice(Math.max(0, i - 400), i + 900).replace(/\s+/g, " "), 1150));
          const hwi = det.indexOf("homeworkDetails");
          hw.detModelCtx = hwi >= 0 ? pick(det.slice(Math.max(0, hwi - 200), hwi + 2500).replace(/\s+/g, " "), 2600) : "-";
          const csi = det.indexOf("changeStatusUrl");
          hw.detChangeCtx = csi >= 0 ? pick(det.slice(Math.max(0, csi - 200), csi + 1300).replace(/\s+/g, " "), 1450) : "-";
        } catch (e) {
          hw.detErr = pick(String(e), 100);
        }
        try {
          const ed = await pageGet(result.session.cookies, `${base}&work=${work}&view=Edit`);
          hw.edLen = ed.length;
          hw.edForms = [...new Set((ed.match(/<form[^>]*>/gi) ?? []).map((x) => pick(x, 180)))].slice(0, 6);
          hw.edInputs = [...new Set((ed.match(/<input[^>]*>/gi) ?? []).map((x) => pick(x, 150)))].slice(0, 26);
          hw.edSelects = [...new Set((ed.match(/<select[^>]*>/gi) ?? []).map((x) => pick(x, 130)))].slice(0, 10);
          const si = ed.search(/Saqlash/i);
          hw.saveCtx = si >= 0 ? pick(ed.slice(Math.max(0, si - 600), si + 300).replace(/\s+/g, " "), 800) : "Saqlash topilmadi";
          hw.edScripts = [...new Set((ed.match(/<script[^>]*src="[^"]{0,140}"/gi) ?? []))].map((x) => pick(x, 150)).slice(0, 14);
          hw.edRequire = [...new Set((ed.match(/(?:require|define)\(\s*\[[^\]]{0,220}\]/g) ?? []))].map((x) => pick(x, 240)).slice(0, 6);
          hw.edAjax = [...new Set((ed.match(/\$\.(?:post|get|ajax|getJSON)\([\s\S]{0,260}/g) ?? []))].map((x) => pick(x, 300)).slice(0, 6);
          const svs: number[] = [];
          let svp = 0;
          const edLow = ed.toLowerCase();
          while (svs.length < 4 && svp < ed.length) {
            const si2 = edLow.indexOf("save", svp);
            if (si2 < 0) break;
            svs.push(si2);
            svp = si2 + 4;
          }
          hw.saveCtxAll = svs.map((i) => pick(ed.slice(Math.max(0, i - 450), i + 850).replace(/\s+/g, " "), 1150));
          const hmi = ed.indexOf("homeworkeditforteacherModel");
          hw.edModelCtx = hmi >= 0 ? pick(ed.slice(Math.max(0, hmi - 200), hmi + 2500).replace(/\s+/g, " "), 2600) : "-";
        } catch (e) {
          hw.edErr = pick(String(e), 100);
        }
        // 4) Per-student maqom sahifasi (person=) — holat lug'ati va forma.
        try {
          const per = await pageGet(result.session.cookies, `${base}&work=${work}&person=1000022728595`);
          hw.perLen = per.length;
          hw.perForms = [...new Set((per.match(/<form[^>]*>/gi) ?? []).map((x) => pick(x, 180)))].slice(0, 6);
          hw.perInputs = [...new Set((per.match(/<(?:input|select|option|textarea)[^>]*>/gi) ?? []).map((x) => pick(x, 150)))].slice(0, 30);
          const pi = per.search(/Maqom/i);
          hw.perCtx = pi >= 0 ? pick(per.slice(Math.max(0, pi - 400), pi + 900).replace(/\s+/g, " "), 1150) : "-";
          const perAjaxRaw = per.match(/\$\.(?:post|get|ajax|getJSON)\([\s\S]{0,260}/g) ?? [];
          hw.perAjax = [...new Set(perAjaxRaw.map((x) => pick(x, 300)))].slice(0, 6);
        } catch (e) {
          hw.perErr = pick(String(e), 100);
        }
        return NextResponse.json({ ...out, hw });
      }
      // ?hwrun=1&work=… — maqom zanjirini jonli bajarish (rasmlardagi tartib).
      // Standart = dry (1–5-qadam, shu jumladan Saqlash; final completeall-cmd O'TKAZILMAYDI).
      // &fire=1 — final qadam ham bajariladi + natija qayta tekshiriladi.
      if (sp.get("hwrun")) {
        const steps: Record<string, unknown> = {};
        const school = sp.get("school") ?? "1000006039552";
        const work = sp.get("work") ?? "2534034219628613169";
        const lesson = sp.get("lesson") ?? "";
        const fire = sp.get("fire") === "1";
        try {
          if (lesson) {
            try {
              const les = await pageGet(
                result.session.cookies,
                `https://schools.emaktab.uz/v2/lesson?school=${school}&lesson=${lesson}`,
              );
              steps.lessonLen = les.length;
            } catch (e2) {
              steps.lessonErr = String(e2).slice(0, 60);
            }
          }
          const edit = await pageGet(
            result.session.cookies,
            `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}&view=Edit`,
          );
          const xss = (edit.match(/[?&]xss=([0-9a-f]{16,})/i) ?? [])[1] ?? "";
          const desc = (edit.match(/<textarea[^>]*id="description"[^>]*>([\s\S]*?)<\/textarea>/) ?? [])[1] ?? "";
          const tagById = (id: string) => (edit.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`, "i")) ?? [])[0] ?? "";
          const val = (t: string) => (t.match(/value="([^"]*)"/) ?? [])[1] ?? "";
          const chk = (t: string) => /\bchecked\b/i.test(t);
          let marktype = "2";
          for (const mm of edit.matchAll(/<input[^>]*name="marktype"[^>]*>/gi)) {
            if (/\bchecked\b/i.test(mm[0])) marktype = val(mm[0]) || marktype;
          }
          steps.xss = xss ? `${xss.slice(0, 8)}…` : "yo'q";
          const saveUrlRaw =
            (edit.match(/'(https?:[^']*\/v2\/ajax\?[^']*)'/) ?? [])[1] ??
            (edit.match(/"(https?:[^"]*\/v2\/ajax\?[^"]*)"/) ?? [])[1] ??
            "";
          const saveUrl = saveUrlRaw.replace(/\\\//g, "/");
          steps.saveUrl = saveUrl ? saveUrl.slice(0, 250) : "topilmadi";
          const token = (edit.match(/name="__RequestVerificationToken"[^>]*value="([^"]*)"/) ?? [])[1]
            ?? (edit.match(/value="([^"]*)"[^>]*name="__RequestVerificationToken"/) ?? [])[1]
            ?? "";
          steps.tokenLen = token.length;
          steps.desc = desc.slice(0, 40);
          steps.marktype = marktype;
          steps.withCheck = chk(tagById("withCheck"));
          steps.attachRequired = chk(tagById("attachRequired"));
          steps.journalVisible = chk(tagById("journalVisible0"));
          if (!xss) throw new Error("xss topilmadi");
          const body = new URLSearchParams({
            school,
            work,
            description: desc,
            timetoexecute: val(tagById("timeToExecute")),
            attachRequired: String(chk(tagById("attachRequired"))),
            marktype,
            markcount: "2",
            withCheck: String(chk(tagById("withCheck"))),
            journalVisible: String(chk(tagById("journalVisible0"))),
            linkUrl: "",
            shouldDeleteLink: "false",
          }).toString();
          const ck = Object.entries(result.session.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");
          const save = await fetch(saveUrl || `https://schools.emaktab.uz/v2/ajax?xss=${xss}`, {
            method: "POST",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
              Cookie: ck,
              Accept: "application/json, text/javascript, */*; q=0.01",
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
              Origin: "https://schools.emaktab.uz",
              Referer: `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}&view=Edit`,
            },
            body,
            redirect: "manual",
          });
          steps.saveStatus = save.status;
          steps.saveBody = (await save.text()).replace(/\s+/g, " ").slice(0, 350);
          const det = await pageGet(
            result.session.cookies,
            `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}`,
          );
          const modelUrl = ((det.match(/"(https:[^"]*completeall-cmd[^"]*)"/) ?? [])[1] ?? "").replace(/\\\//g, "/");
          steps.modelUrl = modelUrl ? modelUrl.slice(0, 130) : "topilmadi";
          steps.redBefore = (det.match(/tse bgR/g) ?? []).length;
          steps.greenBefore = (det.match(/tse bgG/g) ?? []).length;
          if (fire && modelUrl) {
            const gv = await fetch(modelUrl, {
              method: "POST",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                Cookie: ck,
                Accept: "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest",
                Origin: "https://schools.emaktab.uz",
                Referer: `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}`,
              },
              redirect: "manual",
            });
            steps.giveawayStatus = gv.status;
            steps.giveawayBody = (await gv.text()).replace(/\s+/g, " ").slice(0, 220);
            const det2 = await pageGet(
              result.session.cookies,
              `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}`,
            );
            steps.redAfter = (det2.match(/tse bgR/g) ?? []).length;
            steps.greenAfter = (det2.match(/tse bgG/g) ?? []).length;
          } else {
            steps.final = "dry — completeall-cmd o'tkazildi";
          }
        } catch (e) {
          steps.err = String(e).slice(0, 120);
        }
        return NextResponse.json({ ...out, hwrun: steps });
      }
      // ?hwtest=1 — Saqlash 403 diagnostikasi: javob headerlari + variantlar.
      if (sp.get("hwtest")) {
        const t: Record<string, unknown> = {};
        const school = sp.get("school") ?? "1000006039552";
        const work = sp.get("work") ?? "2534034219628613169";
        const ck = Object.entries(result.session.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        const ua =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
        try {
          const edit = await pageGet(
            result.session.cookies,
            `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}&view=Edit`,
          );
          const saveUrl =
            ((edit.match(/'(https?:[^']*\/v2\/ajax\?[^']*)'/) ?? [])[1] ?? "").replace(/\\\//g, "/");
          const xss = (saveUrl.match(/[?&]xss=([0-9a-f]{16,})/i) ?? [])[1] ?? "";
          const desc = (edit.match(/<textarea[^>]*id="description"[^>]*>([\s\S]*?)<\/textarea>/) ?? [])[1] ?? "";
          const baseBody = new URLSearchParams({
            school,
            work,
            description: desc,
            timetoexecute: "",
            attachRequired: "false",
            marktype: "2",
            markcount: "2",
            withCheck: "true",
            journalVisible: "false",
            linkUrl: "",
            shouldDeleteLink: "false",
          }).toString();
          t.saveUrl = saveUrl.slice(0, 200);
          const probePost = async (label: string, url: string, body: string, extraH: Record<string, string> = {}) => {
            try {
              const r = await fetch(url, {
                method: "POST",
                headers: {
                  "User-Agent": ua,
                  Cookie: ck,
                  Accept: "application/json, text/javascript, */*; q=0.01",
                  "Accept-Language": "uz-UZ,uz;q=0.9,en;q=0.8,ru;q=0.7",
                  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                  "X-Requested-With": "XMLHttpRequest",
                  Origin: "https://schools.emaktab.uz",
                  Referer: `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}&view=Edit`,
                  ...extraH,
                },
                body,
                redirect: "manual",
              });
              const raw = await r.text();
              const bodyText = raw
                .replace(/[^\x20-\x7E]/g, ".")
                .replace(/\s+/g, " ")
                .slice(0, 40);
              t[label] = `${r.status}/${raw.length}/${bodyText}`;
            } catch (e) {
              t[label] = `xato ${String(e).slice(0, 60)}`;
            }
          };
          await probePost("t2_xssAction", saveUrl, `${baseBody}&xss=${xss}&a=ework`);
          await probePost("t3_empty", saveUrl, "");
          await probePost(
            "t4_tse",
            `https://schools.emaktab.uz/v2/ajax?xss=${xss}&a=tse&sid=${school}`,
            `wid=${work}&pid=0&act=bogus`,
          );
          await probePost("t1_xssBody", saveUrl, `${baseBody}&xss=${xss}`);
          try {
            const g = await fetch(saveUrl, {
              headers: { "User-Agent": ua, Cookie: ck, Accept: "text/html,*/*" },
              redirect: "manual",
            });
            t.t5_get = `${g.status} :: ${(await g.text())
              .replace(/[^\x20-\x7E]/g, ".")
              .replace(/\s+/g, " ")
              .slice(0, 70)}`;
          } catch (e) {
            t.t5_get = `xato ${String(e).slice(0, 60)}`;
          }
        } catch (e) {
          t.err = String(e).slice(0, 120);
        }
        return new NextResponse(
          Object.entries(t)
            .map(([k, v]) => `${k}=${String(v).slice(0, 80)}`)
            .join(" || ")
            .slice(0, 1500),
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        );
      }
      // ?hwwhy=1 — 403 sahifasining matni (sababi) + cookie ro'yxati.
      if (sp.get("hwwhy")) {
        const lines: string[] = [];
        const school = sp.get("school") ?? "1000006039552";
        const work = sp.get("work") ?? "2534034219628613169";
        try {
          const edit = await pageGet(
            result.session.cookies,
            `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}&view=Edit`,
          );
          lines.push(`cookies=${Object.keys(result.session.cookies).join(",")}`);
          const saveUrl = (
            (edit.match(/'(https?:[^']*\/v2\/ajax\?[^']*)'/) ?? [])[1] ?? ""
          ).replace(/\\\//g, "/");
          const ck = Object.entries(result.session.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");
          const r = await fetch(saveUrl, {
            method: "POST",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
              Cookie: ck,
              Accept: "application/json, text/javascript, */*; q=0.01",
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
              Origin: "https://schools.emaktab.uz",
              Referer: `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}&view=Edit`,
            },
            body: "school=" + school + "&work=" + work + "&marktype=2&markcount=2",
            redirect: "manual",
          });
          const raw = await r.text();
          const txt = raw
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 300);
          lines.push(`status=${r.status} n=${raw.length}`);
          lines.push(`page=${txt}`);
        } catch (e) {
          lines.push(`err=${String(e).slice(0, 100)}`);
        }
        return new NextResponse(lines.join("\n"), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      // ?hwbi=1 — 403 sababini bisect qilish: real body vs ortiqcha headerlar.
      if (sp.get("hwbi")) {
        const lines: string[] = [];
        const school = sp.get("school") ?? "1000006039552";
        const work = sp.get("work") ?? "2534034219628613169";
        try {
          const edit = await pageGet(
            result.session.cookies,
            `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}&view=Edit`,
          );
          const saveUrl = (
            (edit.match(/'(https?:[^']*\/v2\/ajax\?[^']*)'/) ?? [])[1] ?? ""
          ).replace(/\\\//g, "/");
          const xss = (saveUrl.match(/[?&]xss=([0-9a-f]{16,})/i) ?? [])[1] ?? "";
          const desc = (edit.match(/<textarea[^>]*id="description"[^>]*>([\s\S]*?)<\/textarea>/) ?? [])[1] ?? "";
          const ck = Object.entries(result.session.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");
          const fullBody = new URLSearchParams({
            school,
            work,
            description: desc,
            timetoexecute: "",
            attachRequired: "false",
            marktype: "2",
            markcount: "2",
            withCheck: "true",
            journalVisible: "false",
            linkUrl: "",
            shouldDeleteLink: "false",
          }).toString();
          const cleanH = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            Cookie: ck,
            Accept: "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            Origin: "https://schools.emaktab.uz",
            Referer: `https://schools.emaktab.uz/v2/homework?school=${school}&work=${work}&view=Edit`,
          };
          const run = async (label: string, body: string, headers: Record<string, string>) => {
            const r = await fetch(saveUrl, {
              method: "POST",
              headers,
              body,
              redirect: "manual",
            });
            const raw = await r.text();
            lines.push(
              `${label}=${r.status}/${raw.length}/${raw.replace(/[^\x20-\x7E]/g, ".").slice(0, 90)}`,
            );
          };
          // A: real body + toza headerlar (bot shu variantni ishlatadi)
          await run("A_realbody_cleanH", fullBody, cleanH);
          // B: real body + v139 headerlari (token/sec-fetch/Accept-Language)
          await run(
            "B_realbody_fullH",
            `${fullBody}&__RequestVerificationToken=CfDJ8`,
            {
              ...cleanH,
              "Accept-Language": "uz-UZ,uz;q=0.9,en;q=0.8,ru;q=0.7",
              "sec-fetch-site": "same-origin",
              "sec-fetch-mode": "cors",
              "sec-fetch-dest": "empty",
            },
          );
          // C: kichik body + toza headerlar (nazorat — yuqorida 200 edi)
          await run("C_smallbody_cleanH", `school=${school}&work=${work}&marktype=2&markcount=2`, cleanH);
          lines.push(`xss=${xss.slice(0, 8)} desc=${desc.slice(0, 20)}`);
        } catch (e) {
          lines.push(`err=${String(e).slice(0, 100)}`);
        }
        return new NextResponse(lines.join("\n"), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      // ?hwlist=1&class=1-A&subj=Alifbe — filtrlangan ro'yxatni jonli tekshirish
      // (ISO vs DD/MM/YYYY sana formatlari solishtiriladi).
      if (sp.get("hwlist")) {
        const lines: string[] = [];
        const school = sp.get("school") ?? "1000006039552";
        const wantClass = sp.get("class") ?? "1-A";
        const wantSubj = sp.get("subj") ?? "Alifbe";
        try {
          const bare = await pageGet(
            result.session.cookies,
            `https://schools.emaktab.uz/v2/homework?school=${school}`,
          );
          const opts = parseHomeworkSelects(bare);
          const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
          const findVal = (arr: Array<{ label: string; value: string }>, label: string) =>
            arr.find((o) => norm(o.label) === norm(label))?.value ?? "";
          const gid = findVal(opts.groups, wantClass);
          const subj = findVal(opts.subjects, wantSubj);
          const teacher = findVal(opts.teachers, result.session.fullName);
          const year = findVal(opts.studyYears, "2026/2027") || "2026";
          lines.push(`gid=${gid} subj=${subj} teacher=${teacher} year=${year}`);
          const runQ = async (label: string, from: string, to: string) => {
            const qs = new URLSearchParams({
              school,
              studyYear: String(year),
              group: gid,
              subject: subj,
              datefrom: from,
              dateto: to,
            });
            if (teacher) qs.set("teacher", teacher);
            const html = await pageGet(
              result.session.cookies,
              `https://schools.emaktab.uz/v2/homework?${qs.toString()}`,
            );
            const rows = parseHomeworkRows(html);
            const sample = rows
              .slice(0, 3)
              .map((r) => `${r.dateText}|${r.maqom}|${r.workId}`)
              .join(" ;; ");
            lines.push(`${label}=${rows.length} :: ${sample}`);
          };
          await runQ("iso", "2026-08-01", "2027-07-31");
          await runQ("dmY", "01/08/2026", "31/07/2027");
        } catch (e) {
          lines.push(`err=${String(e).slice(0, 100)}`);
        }
        return new NextResponse(lines.join("\n"), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      // ?jgrep=1&k=a|b|c — journal.js'ni serverda grep (kontekstlar bilan).
      if (sp.get("jgrep")) {
        const ks =
          sp.get("k") ??
          "editLessonHeld|importKtp|/ctp/|getLastCtpCourse|updateMarkComment|editMark|planningPeriodId|planningPeriods";
        const out: string[] = [];
        try {
          const js = await fetch("https://static.emaktab.uz/client/journal.js").then((r) => r.text());
          out.push(`len=${js.length}`);
          for (const kw of ks.split("|").slice(0, 10)) {
            let idx = 0;
            let found = 0;
            while (found < 3) {
              const i = js.indexOf(kw, idx);
              if (i < 0) break;
              const ctx = js
                .slice(Math.max(0, i - 120), i + 220)
                .replace(/</g, "\u2039")
                .replace(/>/g, "\u203a")
                .replace(/[\x00-\x1F]/g, " ")
                .replace(/\s+/g, " ");
              out.push(`[${kw}#${found}] ${ctx}`);
              found++;
              idx = i + kw.length;
            }
            if (!found) out.push(`[${kw}]-topilmadi`);
          }
        } catch (e) {
          out.push(`err=${String(e).slice(0, 100)}`);
        }
        return new NextResponse(out.join("\n").slice(0, 5500), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      // ?hwlinks=1&lesson=… — dars sahifasidagi havolalar (Dars rejasi/ish reja yuklash).
      if (sp.get("hwlinks")) {
        const lines: string[] = [];
        const school = sp.get("school") ?? "1000006039552";
        const lesson = sp.get("lesson") ?? "2533832673993276697";
        try {
          const page = await pageGet(
            result.session.cookies,
            `https://schools.emaktab.uz/v2/lesson?school=${school}&lesson=${lesson}`,
          );
          lines.push(`len=${page.length}`);
          const links = [...page.matchAll(/<a[^>]*href="([^"]{2,160})"[^>]*>([\s\S]{0,80}?)<\/a>/gi)];
          const seen = new Set<string>();
          for (const m of links) {
            const href = m[1].replace(/&amp;/g, "&");
            const label = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
            const key = `${href}|${label}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (/plan|reja|ctp|ktp|ish|import|upload|jurnal|lesson/i.test(`${href} ${label}`)) {
              lines.push(`L ${label} -> ${href.slice(0, 120)}`);
            }
            if (lines.length > 40) break;
          }
          const forms = [...page.matchAll(/<form[^>]*>/gi)].slice(0, 6);
          for (const f of forms) {
            lines.push(`F ${f[0].slice(0, 140)}`);
          }
          const files = [...page.matchAll(/<input[^>]*type="file"[^>]*>/gi)].slice(0, 5);
          for (const f of files) {
            lines.push(`FILE ${f[0].slice(0, 140)}`);
          }
        } catch (e) {
          lines.push(`err=${String(e).slice(0, 100)}`);
        }
        return new NextResponse(lines.join("\n").slice(0, 5500), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
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
