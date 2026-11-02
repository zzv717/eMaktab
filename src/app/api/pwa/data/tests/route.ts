// 📱 PWA — 📝 Testlar (tarix + yangi test yaratish — Telegramga yuboriladi)
import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { botUsers, nazoratchiLinks, nazoratchiTests } from "@/db/schema";
import {
  activeLinksForChild,
  activeLinksForParent,
  createAndDeliverTest,
  type TestDraft,
} from "@/lib/nazoratchi";
import { readSession } from "@/lib/pwa";

export const dynamic = "force-dynamic";

/** Foydalanuvchining (ota-ona/bola) ulanishlarini tekshirish. */
async function ownLink(login: string, linkId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(botUsers)
    .where(sql`lower(${botUsers.emaktabLogin}) = ${login.toLowerCase()}`)
    .limit(1);
  const u = rows[0];
  if (!u?.telegramId) return false;
  const links = [
    ...(await activeLinksForParent(u.telegramId)),
    ...(await activeLinksForChild(u.telegramId)),
  ];
  return links.some((l) => l.id === linkId);
}

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  const linkId = Number(req.nextUrl.searchParams.get("linkId") ?? "0");
  if (!linkId || !(await ownLink(session.login, linkId))) {
    return NextResponse.json({ ok: false, error: "Ruxsat yo'q" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(nazoratchiTests)
    .where(eq(nazoratchiTests.linkId, linkId))
    .orderBy(desc(nazoratchiTests.id))
    .limit(300);
  const map = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const qid = r.quizId ?? `q${r.id}`;
    let q = map.get(qid) as
      | { quizId: string; source: string; date: string; total: number; answered: number; correct: number }
      | undefined;
    if (!q) {
      q = {
        quizId: qid,
        source: r.source ?? "",
        date: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt ?? Date.now()))
          .toISOString()
          .slice(0, 10),
        total: 0,
        answered: 0,
        correct: 0,
      };
      map.set(qid, q);
    }
    q.total++;
    if (r.answeredAt) {
      q.answered++;
      if (r.isCorrect === "yes") q.correct++;
    }
  }
  return NextResponse.json({ ok: true, quizzes: [...map.values()] });
}

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });
  let body: {
    linkId?: number;
    count?: number;
    mode?: "book" | "topic";
    title?: string;
    author?: string;
    pages?: string;
    topic?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const linkId = Number(body.linkId ?? 0);
  const count = Number(body.count ?? 0);
  if (!linkId || !(await ownLink(session.login, linkId))) {
    return NextResponse.json({ ok: false, error: "Ruxsat yo'q" }, { status: 403 });
  }
  if (!Number.isInteger(count) || count < 10 || count > 50) {
    return NextResponse.json({ ok: false, error: "10 yoki undan yuqori son kiriting (maksimal 50)" }, { status: 400 });
  }
  if (body.mode !== "book" && body.mode !== "topic") {
    return NextResponse.json({ ok: false, error: "Usulni tanlang" }, { status: 400 });
  }
  const linkRows = await db
    .select()
    .from(nazoratchiLinks)
    .where(eq(nazoratchiLinks.id, linkId))
    .limit(1);
  const link = linkRows[0];
  if (!link) return NextResponse.json({ ok: false, error: "Ulanish topilmadi" }, { status: 404 });

  const draft: TestDraft = {
    mode: body.mode,
    count,
    title: (body.title ?? "").trim() || undefined,
    author: (body.author ?? "").trim() || undefined,
    pages: (body.pages ?? "").trim() || undefined,
    topic: (body.topic ?? "").trim() || undefined,
  };
  if (body.mode === "book" && !draft.title) {
    return NextResponse.json({ ok: false, error: "Kitob nomini kiriting" }, { status: 400 });
  }
  if (body.mode === "topic" && !draft.topic) {
    return NextResponse.json({ ok: false, error: "Mavzuni kiriting" }, { status: 400 });
  }
  const res = await createAndDeliverTest(link, draft);
  return NextResponse.json({ ok: res.ok, message: res.message });
}
