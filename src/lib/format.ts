// Telegram xabarlarini (HTML) formatlash — baholar, jadval, yangiliklar, sozlamalar.
import type { DaySchedule, Grade, Lesson, NewsPost, PersonContext } from "@/lib/emaktab";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

const WEEKDAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

export function formatDate(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return `${d}-${MONTHS[(m ?? 1) - 1]}, ${y}`;
}

export function formatDayTitle(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${d}-${MONTHS[(m ?? 1) - 1]} (${WEEKDAYS[weekday]})`;
}

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? "";
}

function gradeEmoji(value: number): string {
  if (value >= 5) return "🌟";
  if (value === 4) return "🟢";
  if (value === 3) return "🟡";
  return "🔴";
}

// ---------------------------------------------------------------------------
// Baholar
// ---------------------------------------------------------------------------

export function formatGrades(grades: Grade[], periodLabel: string, studentName?: string): string {
  const header = studentName
    ? `📊 <b>Baholar</b> — ${escapeHtml(studentName)}\n`
    : `📊 <b>Baholar</b>\n`;
  let text = `${header}<i>${escapeHtml(periodLabel)}</i>\n`;

  if (grades.length === 0) {
    return text + `\nBu davrda yangi baholar topilmadi.`;
  }

  const byDate = new Map<string, Grade[]>();
  for (const g of grades) {
    const list = byDate.get(g.date) ?? [];
    list.push(g);
    byDate.set(g.date, list);
  }

  let total = 0;
  let count = 0;

  for (const [date, list] of [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    text += `\n🗓 <b>${escapeHtml(formatDayTitle(date))}</b>\n`;
    for (const g of list) {
      const values = g.values.map((v) => `${gradeEmoji(v)} <b>${v}</b>`).join(", ");
      const parts = [`• ${escapeHtml(g.subject)} — ${values}`];
      if (g.workType) parts.push(`   <i>${escapeHtml(g.workType)}</i>`);
      if (g.comment) parts.push(`   💬 ${escapeHtml(g.comment)}`);
      text += parts.join("\n") + "\n";
      for (const v of g.values) {
        total += v;
        count++;
      }
    }
  }

  if (count > 0) {
    text += `\n📈 O'rtacha baho: <b>${(total / count).toFixed(2)}</b> (${count} ta baho)`;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Dars jadvali / uy vazifalari
// ---------------------------------------------------------------------------

function formatLesson(lesson: Lesson): string {
  const time = lesson.startTime
    ? `🕘 ${lesson.startTime}${lesson.endTime ? `–${lesson.endTime}` : ""}\n`
    : "";
  const groupSuffix = lesson.groupName ? ` — ${escapeHtml(lesson.groupName)} sinf` : "";
  const title = `${lesson.number ? `${lesson.number}. ` : ""}${escapeHtml(lesson.subject)}${groupSuffix}`;
  let body = time + (lesson.isCanceled ? `   ❌ <s>${title}</s> — bekor qilingan` : `   📖 ${title}`);

  if (lesson.theme) body += `\n   🎯 ${escapeHtml(lesson.theme)}`;
  if (lesson.teacher) body += `\n   👨‍🏫 ${escapeHtml(lesson.teacher)}`;
  if (lesson.room) body += `\n   🚪 ${escapeHtml(lesson.room)}`;
  if (lesson.homework) {
    const mark = lesson.homeworkDone ? "✅" : "📝";
    body += `\n   ${mark} <b>Uy vazifasi:</b> ${escapeHtml(lesson.homework)}`;
  }
  if (lesson.marks.length > 0) {
    body += `\n   ${lesson.marks.map((m) => `${gradeEmoji(m)} <b>${m}</b>`).join(", ")}`;
  }
  return body;
}

export function formatDay(day: DaySchedule | undefined, title: string, studentName?: string): string {
  const header = studentName
    ? `📚 <b>${escapeHtml(title)}</b> — ${escapeHtml(studentName)}\n`
    : `📚 <b>${escapeHtml(title)}</b>\n`;

  if (!day || day.lessons.length === 0) {
    return header + `\nBu kunda darslar topilmadi. 🏖`;
  }

  let text = header + `🗓 ${escapeHtml(formatDayTitle(day.date))}\n`;
  for (const lesson of day.lessons) {
    text += `\n${formatLesson(lesson)}\n`;
  }
  return text;
}

export function formatWeek(days: DaySchedule[], studentName?: string): string {
  const header = studentName
    ? `🗓 <b>Haftalik dars jadvali</b> — ${escapeHtml(studentName)}\n`
    : `🗓 <b>Haftalik dars jadvali</b>\n`;

  const withLessons = days.filter((d) => d.lessons.length > 0);
  if (withLessons.length === 0) {
    return header + `\nBu hafta uchun darslar topilmadi.`;
  }

  let text = header;
  for (const day of withLessons) {
    text += `\n<b>${escapeHtml(formatDayTitle(day.date))}</b>\n`;
    for (const lesson of day.lessons) {
      const time = lesson.startTime ? `${lesson.startTime}–${lesson.endTime} ` : "";
      const canceled = lesson.isCanceled ? " ❌" : "";
      text += `${lesson.number}. ${time}${escapeHtml(lesson.subject)}${canceled}\n`;
      if (lesson.homework) {
        text += `   📝 ${escapeHtml(lesson.homework.slice(0, 120))}${lesson.homework.length > 120 ? "…" : ""}\n`;
      }
    }
  }
  return text;
}

export function formatHomework(days: DaySchedule[], studentName?: string): string {
  const header = studentName
    ? `📝 <b>Uy vazifalari</b> — ${escapeHtml(studentName)}\n`
    : `📝 <b>Uy vazifalari</b>\n`;

  const rows: string[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const lesson of day.lessons) {
      if (!lesson.homework) continue;
      const mark = lesson.homeworkDone ? "✅" : "📌";
      rows.push(
        `${mark} <b>${escapeHtml(lesson.subject)}</b> — ${escapeHtml(formatDayTitle(day.date))}\n` +
          `   ${escapeHtml(lesson.homework)}`,
      );
    }
  }

  if (rows.length === 0) {
    return header + `\nHozircha uy vazifalari kiritilmagan.`;
  }
  return header + `\n` + rows.join("\n\n");
}

// ---------------------------------------------------------------------------
// Yangiliklar
// ---------------------------------------------------------------------------

export function formatNews(posts: NewsPost[], schoolName?: string): string {
  const header = schoolName
    ? `📰 <b>Yangiliklar</b> — ${escapeHtml(schoolName)}\n`
    : `📰 <b>Yangiliklar</b>\n`;

  if (posts.length === 0) {
    return (
      header +
      `\nHozircha yangi e'lonlar topilmadi.\n` +
      `\nBarcha yangiliklarni <a href="https://emaktab.uz/userfeed">emaktab.uz</a> saytida ko'rishingiz mumkin.`
    );
  }

  let text = header;
  for (const post of posts) {
    const title = post.title ? `<b>${escapeHtml(post.title)}</b>\n` : "";
    const meta: string[] = [];
    if (post.community) meta.push(`🏫 ${escapeHtml(post.community)}`);
    if (post.author) meta.push(`👤 ${escapeHtml(post.author)}`);
    if (post.date) meta.push(`🗓 ${escapeHtml(formatDate(post.date))}`);

    let body = post.text.replace(/\s+/g, " ").trim();
    const isHtml = /<\/?[a-z][\s\S]*>/i.test(body);
    if (!isHtml) body = escapeHtml(body);
    if (body.length > 500) body = body.slice(0, 500) + "…";

    text += `\n──────────────\n${title}${body}`;
    if (meta.length > 0) text += `\n${meta.join("  ·  ")}`;
    if (post.url) text += `\n<a href="${escapeHtml(post.url)}">Batafsil →</a>`;
    text += `\n`;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Sozlamalar / profil
// ---------------------------------------------------------------------------

export function formatAccount(user: {
  fullName?: string | null;
  role?: string | null;
  emaktabLogin?: string | null;
  schoolName?: string | null;
  groupName?: string | null;
  connectedAt?: Date | null;
  childrenJson?: string | null;
}): string {
  const roleNames: Record<string, string> = {
    student: "O'quvchi 🎒",
    parent: "Ota-ona 👪",
    teacher: "O'qituvchi 📖",
  };

  let childrenCount = 0;
  try {
    const parsed = user.childrenJson ? JSON.parse(user.childrenJson) : null;
    if (Array.isArray(parsed)) childrenCount = parsed.length;
  } catch {
    /* ignore */
  }

  const lines = [
    `⚙️ <b>Akkount sozlamalari</b>`,
    ``,
    `👤 Ism: <b>${escapeHtml(user.fullName || "—")}</b>`,
    `🎭 Rol: <b>${escapeHtml(user.role ? (roleNames[user.role] ?? user.role) : "—")}</b>`,
    `🏫 Maktab: <b>${escapeHtml(user.schoolName || "—")}</b>`,
    `🎓 Sinf: <b>${escapeHtml(user.groupName || "—")}</b>`,
    `🔐 eMaktab login: <code>${escapeHtml(user.emaktabLogin || "—")}</code>`,
  ];
  if (childrenCount > 1) {
    lines.push(`👶 Bog'langan farzandlar: <b>${childrenCount}</b> ta`);
  }
  if (user.connectedAt) {
    lines.push(`📅 Ulangan sana: <b>${escapeHtml(formatDate(user.connectedAt.toISOString().slice(0, 10)))}</b>`);
  }
  lines.push(
    ``,
    `<i>Parolingiz bot bazasida AES-256 shifrlangan holda saqlanadi (ENCRYPTION_KEY).</i>`,
  );
  return lines.join("\n");
}

export function formatPersonList(persons: PersonContext[], activePersonId: string): string {
  let text = `👶 <b>Farzandni tanlang:</b>\n`;
  persons.forEach((p, i) => {
    const active = p.personId === activePersonId ? " ✅" : "";
    text += `\n${i + 1}. ${escapeHtml(p.fullName || p.personId)}${active}\n`;
    text += `   ${escapeHtml(p.schoolName || "")} ${escapeHtml(p.groupName || "")}`.trim() + "\n";
  });
  return text;
}

// ---------------------------------------------------------------------------
// O'qituvchi: darslar, sinf kabineti, profil
// ---------------------------------------------------------------------------

export function formatTeacherDay(
  lessons: Array<{ number: number; subject: string; groupName: string | null; startTime: string | null; endTime: string | null; room: string | null; isCanceled: boolean; theme: string | null; teacher?: string | null }>,
  dayKey: string | null,
  title: string,
  teacherName?: string,
): string {
  const header = teacherName
    ? `📅 <b>${escapeHtml(title)}</b> — ${escapeHtml(teacherName)}\n`
    : `📅 <b>${escapeHtml(title)}</b>\n`;
  const dateLine = dayKey ? `🗓 ${escapeHtml(formatDayTitle(dayKey))}\n` : "";

  if (lessons.length === 0) {
    return (
      header +
      dateLine +
      `\nBu kunda darslar topilmadi. 🏖\n\n` +
      `ℹ️ eMaktabning ochiq API'si o'qituvchi dars jadvalini hozircha bermayapti ` +
      `(jadval faqat eMaktab veb-jurnalida ko'rinadi). Bot har safar qayta urinib ko'radi — ` +
      `ma'lumot ochilishi bilan avtomatik chiqadi.`
    );
  }

  let text = header + dateLine;
  for (const l of lessons) {
    const time = l.startTime ? `🕘 ${l.startTime}${l.endTime ? `–${l.endTime}` : ""}\n` : "";
    const main = `${l.number ? `${l.number}. ` : ""}${escapeHtml(l.subject)}`;
    const group = l.groupName ? ` — <b>${escapeHtml(l.groupName)}</b> sinf` : "";
    text += `\n${time}   📖 ${main}${group}`;
    if (l.isCanceled) text += `  ❌ <i>bekor qilingan</i>`;
    if (l.theme) text += `\n   🎯 ${escapeHtml(l.theme)}`;
    if (l.room) text += `\n   🚪 ${escapeHtml(l.room)}`;
    text += `\n`;
  }
  return text;
}

export function formatMemberList(
  title: string,
  className: string,
  members: Array<{ memberId: string; fullName: string }>,
): string {
  const header = `👥 <b>${escapeHtml(title)}</b> — ${escapeHtml(className)}\n`;
  if (members.length === 0) {
    return header + `\nRo'yxat bo'sh yoki eMaktab bu ma'lumotni bermadi.`;
  }
  let text = header + `<i>Jami: ${members.length} ta</i>\n`;
  members.forEach((m, i) => {
    text += `\n${i + 1}. ${escapeHtml(m.fullName)}`;
  });
  return text;
}

export function formatProfile(user: {
  fullName?: string | null;
  role?: string | null;
  emaktabLogin?: string | null;
  schoolName?: string | null;
  groupName?: string | null;
  emaktabUserId?: string | null;
  connectedAt?: Date | null;
}, classes: Array<{ classId: string; className: string }> = []): string {
  const roleNames: Record<string, string> = {
    student: "O'quvchi 🎒",
    parent: "Ota-ona 👪",
    teacher: "O'qituvchi 📖",
  };

  const lines = [
    `👤 <b>Profil</b>`,
    ``,
    `F.I.Sh.: <b>${escapeHtml(user.fullName || "—")}</b>`,
    `Rol: <b>${escapeHtml(user.role ? (roleNames[user.role] ?? user.role) : "—")}</b>`,
    `Maktab: <b>${escapeHtml(user.schoolName || "—")}</b>`,
  ];
  if (user.groupName) lines.push(`Sinf: <b>${escapeHtml(user.groupName)}</b>`);
  if (classes.length > 0) {
    lines.push(`Dars beradigan sinflar: <b>${classes.map((c) => escapeHtml(c.className)).join(", ")}</b>`);
  }
  lines.push(`eMaktab ID: <code>${escapeHtml(user.emaktabUserId || "—")}</code>`);
  if (user.connectedAt) {
    lines.push(`Botga ulangan: <b>${escapeHtml(formatDate(user.connectedAt.toISOString().slice(0, 10)))}</b>`);
  }
  return lines.join("\n");
}

export function formatActivationReport(
  kindLabel: string,
  okNames: string[],
  failMembers: Array<{ memberId: string; fullName: string; reason: string }>,
  total: number,
): string {
  const lower = kindLabel.toLowerCase();
  // Hammasi muvaffaqiyatli bo'lsa — aniq aytiladi.
  if (total > 0 && failMembers.length === 0) {
    return (
      `🎉 <b>Hammasiga kirildi</b>\n\n` +
      `Barcha ${escapeHtml(lower)} (${total} ta) akkauntiga muvaffaqiyatli kirildi va faollashtirildi. ✅`
    );
  }
  let text = `✅ <b>Faollashtirish jarayoni yakunlandi</b> — ${escapeHtml(kindLabel)}\n\n`;
  text += `✔️ Kira olindi: <b>${okNames.length}</b> / ${total}\n`;
  if (okNames.length > 0) {
    text += okNames.map((n) => `   • ${escapeHtml(n)}`).join("\n") + "\n";
  }
  if (failMembers.length > 0) {
    text += `\n❌ Kira olinmaganlar: <b>${failMembers.length}</b> ta\n`;
    text += failMembers
      .map((f) => `   • ${escapeHtml(f.fullName)} — <i>${escapeHtml(f.reason)}</i>`)
      .join("\n");
    text += `\n\n🔑 Har bir a'zo ostidagi <b>“Login-parol biriktiring”</b> tugmasi bilan unga login-parol kiriting. `;
    text += `Biriktirilgan login-parol saqlanadi va keyingi safar “Faollashtirish” bosilganda avtomatik ishlatiladi.`;
  }
  return text;
}
