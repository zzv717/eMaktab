// 📱 PWA — 👁 Nazoratchi (ulangan farzandlar, repetitorlar, testlar holati)
import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { botUsers, nazoratchiTests, type NazoratchiLink } from "@/db/schema";
import { activeLinksForChild, activeLinksForParent, tutorsForLink } from "@/lib/nazoratchi";
import { readSession } from "@/lib/pwa";

export const dynamic = "force-dynamic";

type QuizSummary = {
  quizId: string;
  source: string;
  date: string;
  total: number;
  answered: number;
  correct: number;
};

async function quizzesForLinks(linkIds: number[]): Promise<QuizSummary[]> {
  if (linkIds.length === 0) return [];
  const rows = await db
    .select()
    .from(nazoratchiTests)
    .where(inArray(nazoratchiTests.linkId, linkIds))
    .orderBy(desc(nazoratchiTests.id))
    .limit(200);
  const map = new Map<string, QuizSummary>();
  for (const r of rows) {
    const qid = r.quizId ?? `q${r.id}`;
    let q = map.get(qid);
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
  return [...map.values()];
}

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Avval kiring" }, { status: 401 });

  // PWA foydalanuvchisi botdagi hisobi bilan bog'langanmi?
  const rows = await db
    .select()
    .from(botUsers)
    .where(sql`lower(${botUsers.emaktabLogin}) = ${session.login.toLowerCase()}`)
    .limit(1);
  const u = rows[0];
  if (!u?.telegramId) {
    return NextResponse.json({ ok: true, linked: false });
  }

  const asParent = await activeLinksForParent(u.telegramId);
  const asChild = await activeLinksForChild(u.telegramId);
  const links: NazoratchiLink[] = [...asParent, ...asChild];
  const out: Array<{
    id: number;
    childName: string;
    parentName: string;
    status: string;
    childBlocked: string;
    testLevel: number;
    tutors: Awaited<ReturnType<typeof tutorsForLink>>;
    quizzes: QuizSummary[];
  }> = [];
  for (const l of links) {
    out.push({
      id: l.id,
      childName: l.childName ?? "",
      parentName: u.fullName ?? "",
      status: l.status,
      childBlocked: l.childBlocked,
      testLevel: (l as unknown as { testLevel?: number }).testLevel ?? 1,
      tutors: await tutorsForLink(l.id),
      quizzes: await quizzesForLinks([l.id]),
    });
  }
  return NextResponse.json({
    ok: true,
    linked: true,
    role: u.role,
    telegramId: u.telegramId,
    links: out,
  });
}
