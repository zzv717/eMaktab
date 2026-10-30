// Parserlarni haqiqiy eMaktab namunalari (window.__USER__START__PAGE__INITIAL__STATE__)
// bilan tekshirish uchun ishlatiladigan skript.
//
// Ishga tushirish: npx tsx scripts/verify-parsing.ts
import { readFileSync } from "fs";
import {
  captchaVisible,
  collectPersonLike,
  deepFind,
  extractAnyState,
  parseJsonObjectAt,
  extractCaptchaUrl,
  stripCaptchaFields,
  dayStartTs,
  dayWeekday,
  extractStartState,
  extractTalkUser,
  formAction,
  hasLoginForm,
  parseHiddenInputs,
  gradesFromDiaryDays,
  newsFromUnknown,
  personsFromStartState,
  scheduleFromDiaryDays,
  scheduleFromFlatLessons,
  extractAllUserLinks,
  extractTeacherGroups,
  extractTeacherJournals,
  mergeTeacherGroups,
  lessonMatchesTeacherLoad,
  dedupeShiftLessons,
  pickPersonForClass,
  parseHomeworkRows,
  parseHomeworkSelects,
  parseHomeworkEditForm,
  parseHomeworkDetailModel,
  parseImportMappingRows,
  mapImportColumn,
  parseImportCheck,
  parseWizFormSimple,
  planPeriodOptions,
  looksLikeName,
  shiftDayKey,
  tashkentDayKey,
} from "../src/lib/emaktab";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";
import { formatDay, formatGrades, formatNews, formatWeek } from "../src/lib/format";
import { hhmmToMinutes, minutesToHHMM, parseDays, parseTestDraft, testSourceLabel } from "../src/lib/nazoratchi";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}`, extra ?? "");
  }
}

// ---------------------------------------------------------------------------
console.log("1) HTML ichidan __USER__START__PAGE__INITIAL__STATE__ parse qilish");
// ---------------------------------------------------------------------------
const html = readFileSync(new URL("./sample-userfeed.html", import.meta.url), "utf-8");
const state = extractStartState(html);
check("state topildi", state !== null);
check("userSchedule mavjud", Boolean(state?.userSchedule?.children?.length));
check("userMarks mavjud", Boolean(state?.userMarks?.children?.length));
check("userContext mavjud", Boolean(state?.userContext?.contextPersons?.length));

const persons = personsFromStartState(state);
check("persons bo'sh emas", persons.length > 0, persons);
if (persons.length > 0) {
  check("personId raqam sifatida saqlangan (string)", typeof persons[0].personId === "string");
  check("personId uzun (10+ xona, string saqlanadi)", persons[0].personId.length >= 10, persons[0].personId);
  check("maktab nomi bor", Boolean(persons[0].schoolName), persons[0]);
  check("sinf nomi bor", Boolean(persons[0].groupName), persons[0]);
  check("FIO bor", Boolean(persons[0].fullName), persons[0]);
}

// ---------------------------------------------------------------------------
console.log("2) Jadval parse qilish (darslar, uy vazifasi, baholar)");
// ---------------------------------------------------------------------------
const schedule = scheduleFromDiaryDays(
  (state?.userSchedule?.children?.[0]?.schedule?.days ?? []) as never,
);
check("kunlar parse bo'ldi", schedule.length > 0);
if (schedule.length > 0) {
  const day = schedule[0];
  check("darslar soni > 0", day.lessons.length > 0, day);
  const lesson = day.lessons[0];
  check("fan nomi bor", Boolean(lesson.subject) && lesson.subject !== "Noma'lum fan", lesson);
  check("dars raqami bor", lesson.number >= 1, lesson);
  check("vaqt parse bo'ldi", lesson.startTime === "08:00", lesson);
  check("uy vazifasi parse bo'ldi", lesson.homework === "Тема 18, №8-9", lesson);
  check("uy vazifasi bajarilgan", lesson.homeworkDone === true, lesson);
  check("ish belgisi baho parse bo'ldi", lesson.marks.includes(5), lesson);
  check("hafta kuni to'g'ri (2024-09-30 = dushanba=0)", day.weekday === 0, day.date);
  const formatted = formatDay(day, "Bugungi dars jadvali", "Test O'quvchi");
  check("format uzunligi mos", formatted.length > 50);
  check("formatda fan bor", formatted.includes("Математика") || formatted.includes("Matematika"), formatted.slice(0, 200));
}

// ---------------------------------------------------------------------------
console.log("3) Baholar parse qilish (userMarks)");
// ---------------------------------------------------------------------------
const gradesState = extractStartState(html);
const marks = (gradesState?.userMarks?.children?.[0]?.marks ?? []) as Array<Record<string, unknown>>;
check("baholar massivi bor", marks.length > 0);
const grades = gradesFromDiaryDays([{ date: undefined, marks }]);
check("baholar parse bo'ldi", grades.length > 0, grades);
if (grades.length > 0) {
  check("baho qiymati raqam", typeof grades[0].values[0] === "number", grades[0]);
  check("fan nomi bor", Boolean(grades[0].subject) && grades[0].subject !== "Noma'lum fan", grades[0]);
  check("sana YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(grades[0].date), grades[0]);
  const formatted = formatGrades(grades.slice(0, 10), "So'nggi 14 kun", "Test");
  check("format ishladi", formatted.includes("📊") && formatted.includes("O'rtacha"), formatted.slice(0, 120));
}

// ---------------------------------------------------------------------------
console.log("4) Yangiliklar parse qilish (turli formatlar)");
// ---------------------------------------------------------------------------
const news1 = newsFromUnknown([
  { id: "1", title: "Maktab e'loni", text: "Ertangi tadbir...", author: { firstName: "Ali", lastName: "Valiyev" }, date: "2026-10-20T10:00:00" },
  { postId: 2, message: "Sinf e'loni", community: { name: "9-A sinf" }, createdDate: 1761000000 },
]);
check("2 ta yangilik parse bo'ldi", news1.length === 2, news1);
check("title/text", news1[0].title === "Maktab e'loni" && news1[0].text === "Ertangi tadbir...");
check("author FIO", news1[0].author === "Valiyev Ali", news1[0]);
check("community nomi", news1[1].community === "9-A sinf", news1[1]);
check("unix timestamp sana", /^\d{4}-\d{2}-\d{2}$/.test(news1[1].date ?? ""), news1[1]);
const newsObj = newsFromUnknown({ posts: [{ text: "Bitta post", date: "2026-10-01" }] });
check("posts wrapper parse", newsObj.length === 1, newsObj);
const newsFormatted = formatNews(news1, "11-maktab");
check("news format", newsFormatted.includes("Yangiliklar") && newsFormatted.includes("Maktab e&#39;loni"), newsFormatted.slice(0, 200));

// ---------------------------------------------------------------------------
console.log("5) Sana yordamchilari");
// ---------------------------------------------------------------------------
check("dayWeekday(2026-10-22) = 3 (payshanba)", dayWeekday("2026-10-22") === 3, dayWeekday("2026-10-22"));
check("dayStartTs(2026-10-22) UTC+5 midnight", dayStartTs("2026-10-22") === Math.floor(Date.UTC(2026, 9, 22) / 1000) - 5 * 3600);
check("shiftDayKey +1", shiftDayKey("2026-10-31", 1) === "2026-11-01", shiftDayKey("2026-10-31", 1));
check("shiftDayKey -1 yil chegarasi", shiftDayKey("2026-01-01", -1) === "2025-12-31", shiftDayKey("2026-01-01", -1));
check("tashkentDayKey format", /^\d{4}-\d{2}-\d{2}$/.test(tashkentDayKey()));

// ---------------------------------------------------------------------------
console.log("6) Shifrlash (AES-256-GCM, ENCRYPTION_KEY)");
// ---------------------------------------------------------------------------
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-key";
const secret = "my-super-password-123";
const enc = encryptSecret(secret);
check("shifr format (iv.tag.data)", enc.split(".").length === 3);
check("ochiq matn ko'rinmaydi", !enc.includes(secret));
check("decrypt qaytaradi", decryptSecret(enc) === secret);

// ---------------------------------------------------------------------------
console.log("7) Haftalik format");
// ---------------------------------------------------------------------------
const weekFormatted = formatWeek(schedule, "Test");
check("week format", weekFormatted.includes("Haftalik"), weekFormatted.slice(0, 100));

// ---------------------------------------------------------------------------
console.log("8) Rollarni aniqlash (__TALK__INITIAL__STATE__) va sinf sahifasi");
// ---------------------------------------------------------------------------
const talkHtml = `<script>
window.__TALK__INITIAL__STATE__ = window.__TALK__INITIAL__STATE__ || {"user":{"id":"1000008789694","roles":["Teacher"],"teacherGroups":{"2232176621299702379":{}},"classTeacherGroups":["2232176621299702379"],"schoolIds":["1000005979869"]}};
</script>`;
const talk = extractTalkUser(talkHtml);
check("talk user topildi", talk !== null, talk);
check("rol Teacher", talk?.roles.includes("Teacher") === true, talk?.roles);
check("classTeacherGroupIds parse", talk?.classTeacherGroupIds.includes("2232176621299702379") === true, talk?.classTeacherGroupIds);
check("teacherGroupIds parse", talk?.teacherGroupIds.includes("2232176621299702379") === true, talk?.teacherGroupIds);

const classHtml = `
<ul class="peopleS"><li><a href="/v2/user/user?user=1000008789694" title="Karimov Anvar">o'qituvchi</a></li></ul>
<ul class="peopleSmall">
<li><a href="/v2/user/user?user=1000016476677" title="Aliyev Vali">1</a></li>
<li><a href="/v2/user/user?user=1000016476678" title="Karimova Malika">2</a></li>
</ul>`;
const anchors = classHtml.match(/<a\b/gi);
check("sinf sahifasi HTML tayyor", Boolean(anchors && anchors.length === 3));

// ---------------------------------------------------------------------------
console.log("9) Login sahifasi parserlari (yashirin maydonlar, forma, captcha)");
// ---------------------------------------------------------------------------
const loginHtml = `
<form action="/login" method="post">
  <input type="hidden" name="exceededAttempts" value="False" />
  <input type="hidden" name="ReturnUrl" value="" />
  <input name="FingerprintId" type="hidden" value="abc123" />
  <input type='hidden' name='__RequestVerificationToken' value='tok-xyz'>
  <input type="hidden" name="captcha__value" value="">
  <input type="text" name="login" />
  <input type="password" name="password" />
</form>`;
const hidden = parseHiddenInputs(loginHtml);
check("hidden maydonlar soni", Object.keys(hidden).length === 5, Object.keys(hidden));
check("exceededAttempts parse", hidden["exceededAttempts"] === "False", hidden["exceededAttempts"]);
check("token parse (bir qo'shtirnoq)", hidden["__RequestVerificationToken"] === "tok-xyz", hidden["__RequestVerificationToken"]);
check("FingerprintId (name type'dan oldin)", hidden["FingerprintId"] === "abc123", hidden["FingerprintId"]);
check("login maydoni hidden EMAS", !("login" in hidden), hidden);
check("formAction parse", formAction(loginHtml) === "/login", formAction(loginHtml));
check("hasLoginForm true", hasLoginForm(loginHtml) === true);
check("hasLoginForm false", hasLoginForm("<html><body>Dashboard</body></html>") === false);
check(
  "captchaVisible false (hidden)",
  captchaVisible(`<div class="login__body__captcha login__body__captcha_hidden"></div>`) === false,
);
check(
  "captchaVisible true (ochiq)",
  captchaVisible(`<div class="some login__body__captcha wide"></div>`) === true,
);
check("captchaVisible false (yo'q)", captchaVisible(`<div class="other"></div>`) === false);
check(
  "value'siz hidden",
  parseHiddenInputs(`<input type="hidden" name="emptyVal">`)["emptyVal"] === "",
);
check(
  "captcha URL (absolut)",
  extractCaptchaUrl(`<img src="https://login.emaktab.uz/captcha/true/abc-123">`, "https://login.emaktab.uz/login") ===
    "https://login.emaktab.uz/captcha/true/abc-123",
);
check(
  "captcha URL (nisbiy)",
  extractCaptchaUrl(`<img src='/captcha/false/xyz-9'>`, "https://login.emaktab.uz/login") ===
    "https://login.emaktab.uz/captcha/false/xyz-9",
);
check("captcha URL yo'q", extractCaptchaUrl("<html></html>", "https://x.uz/") === null);
const stripped = stripCaptchaFields({
  "Captcha.Id": "uuid-1",
  "captcha__value": "",
  exceededAttempts: "False",
  ReturnUrl: "",
  login: "x",
});
check("captcha maydonlar olib tashlandi", !("Captcha.Id" in stripped) && !("captcha__value" in stripped), stripped);
check("boshqa maydonlar qoldi", stripped["exceededAttempts"] === "False" && stripped["login"] === "x", stripped);

// contextPersons massiv bo'lmasa — TypeError bermasligi kerak
const p1 = personsFromStartState({
  userContext: { contextPersons: { not: "array" } as unknown as [] },
  userSchedule: { children: { x: 1 } as unknown as [] },
} as never);
check("xavfsiz ro'yxat (massiv emas) — TypeError yo'q", p1.length === 0, p1);
const p2 = personsFromStartState({
  userContext: { contextPersons: [{ personId: "42", school: { id: "7", name: "S" }, group: { id: "9", name: "9-A" } }] },
} as never);
check("person ajratish ishlaydi", p2.length === 1 && p2[0].personId === "42" && p2[0].schoolId === "7", p2);
const deep = collectPersonLike({ result: { items: [{ person_id: "77" }, { no: 1 }] } });
check("collectPersonLike chuqur qidiruv", deep.length === 1 && deep[0]["person_id"] === "77", deep);

// extractAnyState — turli markerlar
const anyHtml = `<script>window.__TEACHER__START__PAGE__INITIAL__STATE__ = {"personId": "9", "school": {"id": "1"}};</script>
<script>window.__TALK__INITIAL__STATE__ = {"user": {"roles": ["teacher"]}};</script>`;
const anyStates = extractAnyState(anyHtml);
check("extractAnyState ikkita state topdi", anyStates.length === 2, anyStates.map((s) => s.marker));
const parsed = parseJsonObjectAt('x = {"a": {"b": 2}} tail', 4);
check("parseJsonObjectAt chuqur obyekt", (parsed as { a: { b: number } }).a.b === 2, parsed);

// deepFind — schoolId turli shakllarda
check("deepFind schoolId", deepFind({ a: { schoolId: "123" } }, /^school_?id$/i) === "123");
check("deepFind school.id", deepFind({ x: { school: { id: "777" } } }, /^id$/i) === "777" || deepFind({ x: { school: { id: "777" } } }, /^school_?id$/i) === "");
check("deepFind topmasa bo'sh", deepFind({ nothing: 1 }, /^school_?id$/i) === "");


// --- A'zolar ismini aniqlash (Foydalanuvchi sahifasiga o'ting muammosi) ---
check("looksLikeName: haqiqiy ism", looksLikeName("Aliyev Vali"), true);
check("looksLikeName: amal matni rad", !looksLikeName("Foydalanuvchi sahifasiga o'ting"), true);
check("looksLikeName: ko'rish rad", !looksLikeName("Ko'rish"), true);
{
  const html = `
    <li><a href="user?user=111" title="Aliyev Vali">Aliyev Vali</a>
        <a href="user?user=222">Foydalanuvchi sahifasiga o'ting</a></li>
    <li><a href="user?user=111">Foydalanuvchi sahifasiga o'ting</a></li>
    <li><a href="user?user=333"><img src="/img/x.png"></a><span>Karimova Nilufar</span></li>`;
  const members = extractAllUserLinks(html);
  const m111 = members.find((m) => m.memberId === "111");
  const m222 = members.find((m) => m.memberId === "222");
  const m333 = members.find((m) => m.memberId === "333");
  check("a'zolar: 111 nomi saqlanadi (dublikatda nomli variant)", m111?.fullName === "Aliyev Vali", m111);
  check(
    "a'zolar: 222 da amal matni ko'rinmaydi",
    Boolean(m222) && !String(m222?.fullName).includes("Foydalanuvchi") && !String(m222?.fullName).includes("o'ting"),
    m222,
  );
  check("a'zolar: 333 satr matnidan ism tiklanadi", m333?.fullName === "Karimova Nilufar", m333);
}
{
  const lessons = [
    { lessonNumber: 2, subjectName: "Matematika", teacherName: "Sattarova M.", roomNumber: "12", date: "2026-10-23" },
    { number: 1, subject: { name: "Fizika" }, hours: { startHour: 8, startMinute: 30, endHour: 9, endMinute: 15 }, place: "5", dayOfWeek: 2 },
  ];
  const days = scheduleFromFlatLessons(lessons as Array<Record<string, unknown>>, "2026-10-19", "2026-10-25");
  check("flat: 2 kun (sana bilan + dayOfWeek bilan)", days.length === 2, days.map((d) => d.date));
  const fri = days.find((d) => d.date === "2026-10-23");
  check("flat: 23-oktabr juma (weekday=4)", fri?.weekday === 4, fri && { date: fri.date, weekday: fri.weekday });
  check("flat: matematika fan/room", fri?.lessons[0]?.subject === "Matematika" && fri?.lessons[0]?.room === "12", fri?.lessons[0]);
  const wed = days.find((d) => d.date === "2026-10-21");
  check("flat: dayOfWeek=2 → chorshanba (21-oktabr)", wed?.weekday === 2 && wed?.lessons[0]?.subject === "Fizika" && wed?.lessons[0]?.startTime === "08:30", wed);
}

// TEACHERV2 state — sinf rahbari + fanlar
{
  const html = `x <script>window.__TEACHERV2__INITIAL__STATE__ = { groups: {"groups":[
    {"id":"2524942980748797372","name":"1-A","parallel":1,"isClassTeacher":true,
     "journal":[{"subjectId":"185","subjectName":"Alifbe"},{"subjectId":"186","subjectName":"Matematika"}]},
    {"id":"30030826200645631","name":"5-B","parallel":5,"isClassTeacher":false,
     "journal":[{"subjectId":"187","subjectName":"Alifbe"}]}
  ]}};</script>`;
  const groups = extractTeacherGroups(html);
  check("TEACHERV2: 2 guruh", groups.length === 2, groups.length);
  check("TEACHERV2: 1-A rahbar", groups[0]?.isClassTeacher === true && groups[0]?.className === "1-A", groups[0]);
  check("TEACHERV2: 5-B rahbar EMAS", groups[1]?.isClassTeacher === false, groups[1]);
  check("TEACHERV2: fanlar (Alifbe, Matematika)", groups[0]?.subjects.join(",") === "Alifbe,Matematika", groups[0]?.subjects);
  check("TEACHERV2: id string (katta son)", groups[0]?.classId === "2524942980748797372", groups[0]?.classId);
  check("TEACHERV2: marker yo'q → bo'sh", extractTeacherGroups("<html></html>").length === 0);
}

// ---------------------------------------------------------------------------
// 7) Jurnal yozuvlari (journalUrl) + guruhlarni birlashtirish + erkin fan mosligi
// ---------------------------------------------------------------------------
{
  const html = `x <script>window.__TEACHERV2__INITIAL__STATE__ = { groups: {"groups":[
    {"id":"2524942980748797372","name":"1-A","parallel":1,"isClassTeacher":true,
     "journal":[{"subjectId":"185","subjectName":"Alifbe"}]}
  ]}, "journals":[
    {"subjectId":"185","subjectName":"Alifbe","journalUrl":"https://emaktab.uz/journal/school/1/group/2524942980748797372/subject/185"},
    {"subjectId":"186","subjectName":"Informatika","journalUrl":"https://emaktab.uz/journal/school/1/group/2524942980748797372/subject/186"},
    {"subjectId":"187","subjectName":"Alifbe","groupName":"5-B","journalUrl":"https://emaktab.uz/journal/school/1/group/30030826200645631/subject/187"}
  ]};</script>`;
  const jl = extractTeacherJournals(html);
  check("jurnal: 3 yozuv", jl.length === 3, jl);
  check("jurnal: gid journalUrl'dan", jl[2]?.groupId === "30030826200645631", jl[2]);
  check("jurnal: fan nomi", jl[1]?.subjectName === "Informatika", jl[1]);
  const merged = mergeTeacherGroups(extractTeacherGroups(html), jl);
  check("birlashtirish: 2 guruh (yangi 5-B qo'shildi)", merged.length === 2, merged.map((g) => g.className));
  check("birlashtirish: 1-A fanlari to'ldi", merged[0]?.subjects.join(",") === "Alifbe,Informatika", merged[0]);
  check("birlashtirish: 5-B nomi jurnaldan", merged[1]?.className === "5-B" && merged[1]?.subjects.join(",") === "Alifbe", merged[1]);
}
{
  const t = "Sattarova Mavluda Raxmatullayevna";
  check("mos: aynan fan", lessonMatchesTeacherLoad("Alifbe", null, ["Alifbe", "Informatika"], t) === true);
  check("mos: fan ichma-ich (Informatika va AT)", lessonMatchesTeacherLoad("Informatika va axborot texnologiyalari", null, ["Alifbe", "Informatika"], t) === true);
  check("mos: apostrof farqi (o'qituvchi)", lessonMatchesTeacherLoad("Ona tili", "Sattarova M. R.", ["Alifbe"], t) === true);
  check("mos: emas (yot fan va yot o'qituvchi)", lessonMatchesTeacherLoad("Musiqa", "Karimov A.", ["Alifbe", "Informatika"], t) === false);
  check("mos: emas (fan farq, ism yo'q)", lessonMatchesTeacherLoad("Musiqa", null, ["Alifbe"], t) === false);
  check("mos: ism bo'sh + fanlar yo'q → emas", lessonMatchesTeacherLoad("Musiqa", "", [], t) === false);
}
{
  // soatlar: millisekund timestamp va "8:30" matni to'g'ri parse bo'lishi kerak
  const mk = (lesson: Record<string, unknown>) =>
    scheduleFromDiaryDays([{ date: "2026-10-26", lessons: [lesson] } as never])[0]?.lessons?.[0];
  const msTs = Date.UTC(2026, 9, 26, 3, 30); // millisekund (08:30 Toshkent)
  const l1 = mk({ number: 1, subject: "Alifbe", startTime: String(msTs), endTime: String(msTs + 45 * 60000) });
  check("vaqt: millisekund timestamp → HH:MM", l1?.startTime === "08:30" && l1?.endTime === "09:15", l1);
  const secTs = Math.floor(msTs / 1000);
  const l2 = mk({ number: 1, subject: "Alifbe", startTime: String(secTs), endTime: String(secTs + 45 * 60) });
  check("vaqt: sekund timestamp → HH:MM", l2?.startTime === "08:30" && l2?.endTime === "09:15", l2);
  const l3 = mk({ number: 1, subject: "Alifbe", hours: { startHour: "8:30", endHour: "9:15" } as never });
  check("vaqt: hours '8:30' matn ko'rinishida", l3?.startTime === "08:30" && l3?.endTime === "09:15", l3);
  const l4 = mk({ number: 1, subject: "Alifbe", hours: { startHour: 8, startMinute: 30, endHour: 9, endMinute: 15 } as never });
  check("vaqt: hours raqam (avvalgidek)", l4?.startTime === "08:30" && l4?.endTime === "09:15", l4);
}

{
  // takrorlar + smena — tushdan keyingi smena ham TO'G'RI (12:55 qoladi, 08:30 emas)
  const mk = (number: number, subject: string, startTime: string) =>
    ({ number, subject, startTime }) as never;

  // Tushdan keyingi sinf jonli holati (1-A: 12:55–16:15) + noto'g'ri ertalab soatlar
  const afternoonDay = [
    mk(1, "Kelajak soati", "12:55"),
    mk(1, "Kelajak soati", "08:30"),
    mk(2, "Matematika", "13:45"),
    mk(2, "Matematika", "09:20"),
    mk(3, "Ona tili", "14:35"),
    mk(4, "Jismoniy tarbiya", "15:25"),
    mk(4, "Jismoniy tarbiya", "10:10"),
  ];
  const clean = dedupeShiftLessons(afternoonDay);
  check("smena: tushdan keyingi kunda 4 ta dars qoladi", clean.length === 4, clean);
  check(
    "smena: tushdan keyingi soatlar qoladi (12:55,13:45,14:35,15:25)",
    clean.map((l) => l.startTime).join(",") === "12:55,13:45,14:35,15:25",
    clean.map((l) => `${l.subject}@${l.startTime}`),
  );

  // Ertalabki smena — ertalabki soatlar qoladi
  const morningDay = [
    mk(1, "Alifbe", "08:30"),
    mk(1, "Alifbe", "13:00"),
    mk(2, "Matematika", "09:20"),
    mk(2, "Matematika", "13:50"),
  ];
  const mClean = dedupeShiftLessons(morningDay);
  check(
    "smena: ertalabki sinfda ertalabki soatlar qoladi",
    mClean.map((l) => l.startTime).join(",") === "08:30,09:20",
    mClean.map((l) => `${l.subject}@${l.startTime}`),
  );

  const onlyAfternoon = dedupeShiftLessons([mk(1, "Matematika", "13:00"), mk(2, "Ona tili", "14:00")]);
  check("smena: barchasi tushdan keyin bo'lsa — o'zgarmaydi", onlyAfternoon.length === 2, onlyAfternoon);
  const doubles = dedupeShiftLessons([mk(2, "Matematika", "13:45"), mk(3, "Matematika", "14:35")]);
  check("smena: ikki dars (takror emas) — ikkalasi qoladi", doubles.length === 2, doubles);
  const noTime = dedupeShiftLessons([mk(1, "Alifbe", "08:30"), mk(1, "Alifbe", "")]);
  check("smena: vaqtsiz duplikat tushmaydi, soatlisi qoladi", noTime.length === 1 && noTime[0].startTime === "08:30", noTime);
}

{
  // pickPersonForClass — ota-ona farzandlari ARALASHMAYDI
  const P = (personId: string, groupId: string, groupName: string) =>
    ({ personId, schoolId: "s", groupId, fullName: personId, schoolName: "", groupName }) as never;
  const kids = [P("kidA", "2524942980748797372", "1-A"), P("kidB", "3003082620064563100", "5-B")];
  check("farzand: ID bo'yicha to'g'ri farzand", pickPersonForClass(kids, "2524942980748797372", "1-A")?.personId === "kidA");
  check("farzand: sinf nomi bo'yicha to'g'ri farzand", pickPersonForClass(kids, "999", "5-B")?.personId === "kidB");
  check("farzand: qisqa ID bilan ham mos", pickPersonForClass(kids, "25249429", "1-A")?.personId === "kidA");
  check("farzand: mos bo'lmasa — null (aralashtirmaymiz)", pickPersonForClass(kids, "999", "9-C") === null);
  const single = [P("stu", "2524942980748797372", "1-A")];
  check("farzand: yagona a'zo — o'zi", pickPersonForClass(single, "3003082620064563100", "5-B")?.personId === "stu");
}

// ==========================================================================
// Uy vazifasi maqomi parserlari (schools.emaktab.uz/v2/homework — haqiqiy namunalar)
// ==========================================================================
{
  const rowHtml = `<table><tr><th>Ish ta'rifi</th><th>Fan</th></tr><tr> <td class="breakword"> <a href="https://schools.emaktab.uz/v2/homework?school=1000006039552&work=2534033476599269526" title="Uy vazifasi sahifasiga"> S tovush va S s harflari </a> </td> <td class="tac light"> Alifbe </td> <td class="tac"> <a href="https://schools.emaktab.uz/v2/class?class=2524942980748797372" title="Sinf sahifasiga" class="orange"> <strong>1-A</strong> </a> </td> <td class="tac"> <a href="https://schools.emaktab.uz/v2/lesson?school=1000006039552&lesson=2533832673993276697" title="Dars sahifasiga"> <strong>3 noyabr 2026</strong><br> 1 dars </a> </td> <td class="tac s2 nowrap"> <strong class="red">29</strong> / <strong class="orange">0</strong> / <strong class="green">0</strong> </td> <td class="tac nowrap bgR">berilgan </td> </tr></table>`;
  const rows = parseHomeworkRows(rowHtml);
  check("hw qator: bitta qator topildi", rows.length === 1, rows.length);
  const r = rows[0];
  check("hw qator: workId", r?.workId === "2534033476599269526", r?.workId);
  check("hw qator: lessonId", r?.lessonId === "2533832673993276697", r?.lessonId);
  check("hw qator: sana matni", r?.dateText === "3 noyabr 2026", r?.dateText);
  check("hw qator: dars raqami", r?.lessonNo === "1 dars", r?.lessonNo);
  check("hw qator: tavsif", r?.description === "S tovush va S s harflari", r?.description);
  check("hw qator: fan", r?.subject === "Alifbe", r?.subject);
  check("hw qator: sinf", r?.className === "1-A", r?.className);
  check("hw qator: hisobot", r?.hisobot === "29 / 0 / 0", r?.hisobot);
  check("hw qator: maqom (berilgan)", r?.maqom === "berilgan", r?.maqom);
  check("hw qator: qizil = bajarilmagan", r?.maqomDone === false);
  const green = parseHomeworkRows(rowHtml.replace(/bgR/g, "bgG").replace(/>berilgan </, ">Bajarildi <"));
  check("hw qator: yashil = yakunlangan", green[0]?.maqomDone === true);
  check("hw qator: sarlavha qatori e'tiborsiz", parseHomeworkRows("<tr><th>Ish ta'rifi</th></tr>").length === 0);
}

{
  const selHtml = `<form><select name="studyYear"> <option value="2020"> 2020/2021 </option><option value="2026"> 2026/2027 </option></select><select name="group"><option value="">- tanlang -</option><option value="2524942980748797372"> 1-A </option></select><select name="subject"><option value="1809292770857577475"> Adabiyot </option></select><select name="teacher"><option value="1000007887895"> Sattarova Mavluda Raxmatullayevna </option></select></form>`;
  const opts = parseHomeworkSelects(selHtml);
  check("hw select: studyYear qiymati", opts.studyYears[1]?.value === "2026", opts.studyYears);
  check("hw select: group nomi", opts.groups[1]?.label === "1-A", opts.groups);
  check("hw select: group gid", opts.groups[1]?.value === "2524942980748797372");
  check("hw select: subject", opts.subjects[0]?.label === "Adabiyot");
  check("hw select: teacher", opts.teachers[0]?.value === "1000007887895");
}

{
  const editHtml = `
    <script>var m = { editWork: { url: 'https://schools.emaktab.uz/v2/ajax?xss=467e89e15b9005a257cacd936460cb5057ebf9b302f2163a4e986042427c9c2c&a=editwork&sid=1000006039552' } };</script>
    <input name="__RequestVerificationToken" type="hidden" value="CfDJ8">
    <input type="radio" id="marktype2" name="marktype" value="2" checked="checked">
    <input type="radio" id="marktype-1" name="marktype" value="-1">
    <input type="radio" id="journalVisible0" name="journalVisible" value="1">
    <input type="radio" id="journalVisible1" name="journalVisible" value="0" checked="checked">
    <input type="checkbox" id="withCheck" name="withCheck" value="1" checked="checked">
    <input type="checkbox" id="attachRequired" name="attachRequired" value="1">
    <input type="text" name="timeToExecute" id="timeToExecute" maxlength="3" value="">
    <textarea id="description">Kichik q harfi yozishni mustahkamlash</textarea>`;
  const f = parseHomeworkEditForm(editHtml);
  check("hw edit: xss token", f?.xss === "467e89e15b9005a257cacd936460cb5057ebf9b302f2163a4e986042427c9c2c", f?.xss);
  check("hw edit: to'liq saveUrl (a=&sid= bilan)", (f?.saveUrl ?? "").includes("&a=editwork&sid=1000006039552"), f?.saveUrl);
  check("hw edit: tavsif", f?.description === "Kichik q harfi yozishni mustahkamlash", f?.description);
  check("hw edit: marktype=2", f?.marktype === "2", f?.marktype);
  check("hw edit: withCheck=true", f?.withCheck === true);
  check("hw edit: attachRequired=false", f?.attachRequired === false);
  check("hw edit: journalVisible=false", f?.journalVisible === false);
  check("hw edit: timetoexecute bo'sh", f?.timetoexecute === "");
  check("hw edit: forma bo'lmasa null", parseHomeworkEditForm("<html></html>") === null);
}

{
  const detHtml = `<script>require(['x'], function(dep0) { $(function () { dep0({"url":"https://schools.emaktab.uz/v2/homeworks/completeall-cmd?xss=467e89e15b9005a257cacd936460cb5057ebf9b302f2163a4e986042427c9c2c&school=1000006039552&work=2534034219628613169","workId":"2534034219628613169","css":"tac tse bgG","status":6,"text":"Bajarildi","changeStatusUrl":"https://schools.emaktab.uz/v2/ajax?xss=1&a=tse&sid=1000006039552","studentsCount":29}); }); });</script>`;
  const model = parseHomeworkDetailModel(detHtml);
  check("hw model: completeall-cmd url", (model?.url ?? "").includes("completeall-cmd?xss=467e"), model?.url);
  check("hw model: work param", (model?.url ?? "").includes("work=2534034219628613169"));
  check("hw model: text", model?.text === "Bajarildi", model?.text);
  check("hw model: status", model?.status === 6, model?.status);
  check("hw model: model bo'lmasa null", parseHomeworkDetailModel("<html></html>") === null);
}

// ==========================================================================
// Ish reja import sehrgari parserlari (v2/journals/planning/import)
// ==========================================================================
{
  const mapHtml = `<table><tr><td>Dars raqami</td><td><select name="select_0"><option value="-1" selected>Import qilish mumkin emas</option><option value="0">Dars raqami</option></select></td></tr><tr><td>Dars mavzusi</td><td><select name="select_1"><option value="-1">Import qilish mumkin emas</option><option value="1" selected>dars mavzusi</option></select></td></tr><tr><td>Uyga vazifa</td><td><select name="select_2"><option value="2" selected>Uy vazifasi</option></select></td></tr></table>`;
  const rows = parseImportMappingRows(mapHtml);
  check("ish reja mapping: 3 qator", rows.length === 3, rows.length);
  check("ish reja mapping: header 1", rows[0]?.header === "Dars raqami", rows[0]);
  check("ish reja mapping: select_N", rows[1]?.selectName === "select_1");
  check("ish reja map: raqam→0", mapImportColumn("Dars raqami") === "0");
  check("ish reja map: mavzu→1", mapImportColumn("dars mavzusi") === "1");
  check("ish reja map: vazifa→2", mapImportColumn("Uyga vazifa") === "2");
  check("ish reja map: noma'lum→-1", mapImportColumn("Boshqa") === "-1");
}

{
  const redHtml = `<table><tr><td>1</td><td>Xato!</td><td>Z tovush</td><td>Import qilish mumkin emas</td><td>Dars soni fan bo'yicha umumiy dars soatlaridan oshib ketgan.</td></tr></table>`;
  const red = parseImportCheck(redHtml);
  check("ish reja check: qizil aniqlanadi", red.ok === false && red.redCount > 0, red);
  check("ish reja check: qizil matn", /oshib ketgan/.test(red.redText ?? ""), red.redText);
  const greenHtml = `<table><tr><td>1</td><td>1</td><td>Z tovush</td><td>Ko'chirish mumkin</td><td>Import qilish mumkin</td></tr></table>`;
  const green = parseImportCheck(greenHtml);
  check("ish reja check: yashil — ok", green.ok === true && green.greenCount > 0, green);
  const empty = parseImportCheck("<html>bo'sh</html>");
  check("ish reja check: noaniq — rad", empty.ok === false);
}

{
  const wiz = parseWizFormSimple(
    `<form action="/v2/journals/planning/import" method="post"><input name="__RequestVerificationToken" type="hidden" value="T"><input type="radio" name="firstRow" value="0" checked><input type="file" name="multifile1"><input type="submit" name="step1" value="Keyingi qadam"></form>`,
  );
  check("ish reja form: action", wiz?.action === "/v2/journals/planning/import");
  check("ish reja form: fileField", wiz?.fileField === "multifile1");
  check("ish reja form: token bor", wiz?.fields.some((f) => f.name === "__RequestVerificationToken") === true);
  check("ish reja form: step1 submit", wiz?.fields.find((f) => f.name === "step1")?.value === "Keyingi qadam");
  check("ish reja form: firstRow checked", wiz?.fields.find((f) => f.name === "firstRow")?.checked === true);
  check("ish reja form: bo'sh html — null", parseWizFormSimple("<html></html>") === null);
}

{
  // planPeriodOptions — choraklar ro'yxati (barqaror tartib Yil + 1-4-chorak)
  const full = planPeriodOptions([
    { value: "2525707862884565213", name: "1-chorak" },
    { value: "0", name: "Yil davomida" },
    { value: "2525707862884565214", name: "3-chorak" },
    { value: "2525707862884565215", name: "2-chorak" },
    { value: "2525707862884565216", name: "4-chorak" },
  ]);
  check("period: 5 ta variant", full.length === 5, full.length);
  check("period: birinchi — Yil", full[0]?.value === "0" && /Yil/.test(full[0]?.name ?? ""), full[0]);
  check("period: 1-chorak ID saqlanadi", full[1]?.value === "2525707862884565213", full[1]);
  check("period: tartib 1..4", full[1]?.name === "1-chorak" && full[2]?.name === "2-chorak" && full[4]?.name === "4-chorak");
  const synth = planPeriodOptions([]);
  check("period: bo'sh javob — sintez 5 ta", synth.length === 5, synth.length);
  check("period: sintez qiymatlar", synth[1]?.value === "1" && synth[4]?.value === "4", synth);
  const mixed = planPeriodOptions([{ value: "ID9", name: "2-chorak" }]);
  check("period: aralash — real+ sintez", mixed[2]?.value === "ID9" && mixed[1]?.value === "1", mixed);
  check("period: tartib barqaror (2 marta)", JSON.stringify(planPeriodOptions([])) === JSON.stringify(synth));
}

{
  // 👁 Nazoratchi yordamchilari
  check("nz: HH:MM → daqqa (16:00)", hhmmToMinutes("16:00") === 960);
  check("nz: HH:MM → daqqa (8:30)", hhmmToMinutes("8:30") === 510);
  check("nz: noto'g'ri soat → null", hhmmToMinutes("abc") === null);
  check("nz: daqqa → HH:MM (510)", minutesToHHMM(510) === "08:30");
  check("nz: kunlar JSON", JSON.stringify(parseDays("[1,3,5]")) === "[1,3,5]");
  check("nz: kunlar buzilgan → default", JSON.stringify(parseDays("xato")) === "[1,2,3,4,5]");
  const d1 = parseTestDraft('{"mode":"book","title":"Alpomish","author":"Xolquloq","pages":"12-20"}');
  check("nz: test draft parse", d1?.mode === "book" && d1.title === "Alpomish");
  check("nz: test source label kitob", (d1 && testSourceLabel(d1).includes("Alpomish")) === true);
  const d2 = parseTestDraft(null);
  check("nz: bo'sh draft → null", d2 === null);
}

console.log(`\nNatija: ${passed} o'tdi, ${failed} yiqildi`);
process.exit(failed > 0 ? 1 : 0);
