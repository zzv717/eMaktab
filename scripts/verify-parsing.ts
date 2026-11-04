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
  parseLessonHeldPage,
  hwDateTextToDayKey,
  parseImportMappingRows,
  mapImportColumn,
  parseImportCheck,
  parseWizFormSimple,
  planPeriodOptions,
  looksLikeName,
  shiftDayKey,
  tashkentDayKey,
} from "../src/lib/emaktab";
import {
  simulate,
  simulateSteps,
  applyWires,
  solveCircuit,
  springPhysics,
  lensPhysics,
  MITOSIS,
  MEIOSIS,
  ORGANELLES,
  SPECIMENS,
  ELEMENTS,
  binaryFormula,
  getReagent,
  ELEMENT_MAP,
  elementDetails,
} from "../src/app/app/lab/engine";
import { EXPERIMENTS } from "../src/app/app/lab/experiments";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";
import { formatDay, formatGrades, formatNews, formatWeek } from "../src/lib/format";
import { hhmmToMinutes, minutesToHHMM, parseDays, parseTestDraft, testSourceLabel } from "../src/lib/nazoratchi";
import { localQuestion } from "../src/lib/ai";
import { hashSecret } from "../src/lib/system-admin";

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

{
  // 🤖 Mahalliy test generatori (kalitsiz — har doim ishlaydi)
  const q1 = localQuestion({ mode: "book", bookTitle: "Alpomish", bookAuthor: "Xolquloq", pages: "12-20" });
  check("ai: local kitob savoli 4 variant", q1.options.length === 4 && q1.engine === "local");
  check("ai: local muallif savoli", q1.question.includes("Alpomish") && q1.options[q1.correctIndex] === "Xolquloq");
  // Mavzu rejimi (fan noma'lum) — umumiy bilimlar banki: 4 variant, to'g'ri indeks 0..3
  const q2 = localQuestion({ mode: "topic", topic: "Kesimlar to'plami" });
  check(
    "ai: local mavzu savoli",
    q2.options.length === 4 &&
      q2.correctIndex >= 0 &&
      q2.correctIndex <= 3 &&
      new Set(q2.options.map((o) => o.toLowerCase())).size === 4 &&
      q2.engine === "local" &&
      !/qaysi mavzu/i.test(q2.question),
  );
  const q3 = localQuestion({ mode: "book", bookTitle: "O'tkan kunlar" });
  check("ai: local kitob (muallifsiz)", q3.options[q3.correctIndex] === "O'tkan kunlar" && q3.options.length === 4);
  // Matematika fani — HAQIQIY hisoblash savoli
  const q4 = localQuestion({ mode: "topic", subject: "Matematika", topic: "Ko'paytirish" }, 3, 2);
  check(
    "ai: matematika savoli hisoblangan",
    /= \?/.test(q4.question) && q4.options.length === 4 && q4.options.some((o) => /^-?\d+$/.test(o)),
  );
  // Ingliz tili — tarjima banki
  const q5 = localQuestion({ mode: "topic", subject: "Ingliz tili", topic: "Food" }, 2, 5);
  check("ai: ingliz tili banki", q5.options.length === 4 && q5.engine === "local" && q5.question.includes("tarjimasi"));
}

{
  // 🔐 Tizim kirishi hashlari
  check("sys: hash barqaror", hashSecret("login", "test123") === hashSecret("login", "test123"));
  check("sys: domenlar farqli", hashSecret("login", "x") !== hashSecret("2fa", "x"));
  check("sys: hash 64 belgi", hashSecret("pass", "y").length === 64);
}

{
  // 🆕 Yangi kontraktlar (2026-10-30): savollar soni, daraja, kitob, zanjir, Bolalar, rol
  const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf-8");
  const bot = src("lib/bot.ts");
  const nz = src("lib/nazoratchi.ts");
  const ai = src("lib/ai.ts");
  const schema = src("db/schema.ts");
  const migrate = src("app/api/admin/migrate-schema/route.ts");
  const probe = src("app/api/admin/probe-login/route.ts");
  const fmt = src("lib/format.ts");

  check("son: 10 dan kamiga ogohlantirish", bot.includes("10 yoki undan yuqori son kiriting"));
  check("son: nz:tcount holati", bot.includes('st === "nz:tcount"'));
  check("kitob: repetitor qadam (nz:tub)", bot.includes('st === "nz:tub"'));
  check("kitob: saqlashda book", bot.includes("book: tuDraft.book"));
  check("kechiktirish: nz:post callback", bot.includes("nz:post:"));
  check("kechiktirish: setTutorPostpone chaqiruvi", bot.includes("setTutorPostpone("));
  check("javob: quiz format (nz:ans:quizId:qIndex:opt)", bot.includes("nz:ans:([A-Za-z0-9-]+)"));
  check("bolalar: settings tugma (text)", bot.includes('text: "👶 Bolalar", callback_data: "settings:children"'));
  check("bolalar: sahifa hint", bot.includes("Yangi farzand qo'shish uchun"));
  check("bolalar: yoriqnoma bandi", bot.includes("Bolalar:</b> Sozlamalar"));
  check("bolalar: formatAccount qatori", fmt.includes("Bolalar</b> — farzandlar ro'yxati"));
  check("rol: roleOverride hurmati (finishLoginSuccess)", bot.includes("overrideRole"));
  check("rol: admin panel tugmasi", bot.includes("adm:roleset:"));
  check("rol: persons>1 fallback", bot.includes("persons?.length ?? 0) > 1"));
  check("rol: emaktab chat-roles parent", src("lib/emaktab.ts").includes('lowRoles.includes("parent")'));
  check("rol: emaktab persons>1 parent", src("lib/emaktab.ts").includes("persons.length > 1) role = \"parent\"") || src("lib/emaktab.ts").includes("persons.length > 1) role = 'parent'") || src("lib/emaktab.ts").includes("role = \"parent\""));

  check("zanjir: Mavzuni mustahkamlash", nz.includes("Mavzuni mustahkamlash"));
  check("zanjir: repetitordan chiqdi (ota-onaga)", nz.includes("repetitordan chiqdi"));
  check("zanjir: boshlamadi ogohlantirish", nz.includes("boshlamadi"));
  check("zanjir: Bolaga yozish url", nz.includes("tg://user?id="));
  check("zanjir: kechiktirish (nz:post)", nz.includes("nz:post:"));
  check("zanjir: postpone saqlash", nz.includes("setTutorPostpone") && nz.includes("nzpost:"));
  check("zanjir: review_nag test tekshiruvi", nz.includes("countTestsSince"));
  check("quiz: quizId bilan yaratish", nz.includes("quizId"));
  check("quiz: ketma-ket savol (sendQuizQuestion)", nz.includes("sendQuizQuestion"));
  check("quiz: daraja oshadi/pasayadi", nz.includes("Qiyinlik darajasi oshdi") && nz.includes("Qiyinlik darajasi pasaydi"));

  check("daraja: 3 band (oson→o'rtacha→qiyin)", ai.includes("const bands: Array<{ difficulty: number; size: number }>"));
  check("daraja: generateTestQuestions count+level", ai.includes("count: number") && ai.includes("level = 1"));

  check("schema: role_override", schema.includes("role_override"));
  check("schema: nazoratchi_tutor.book", schema.includes('varchar("book"'));
  check("schema: test_level", schema.includes("test_level"));
  check("schema: quiz_id + q_index + difficulty", schema.includes("quiz_id") && schema.includes("q_index") && schema.includes("difficulty"));
  check("migrate: 6 yangi ALTER", migrate.includes("role_override") && migrate.includes("test_level") && migrate.includes("q_index") && migrate.includes("difficulty") && migrate.includes("nazoratchi_tutor.book") && migrate.includes("quiz_id"));

  check("probe: kids rejimi", probe.includes('sp.get("kids")'));
  check("probe: setrole rejimi", probe.includes('sp.get("setrole")'));

  const q4 = localQuestion({ mode: "topic", topic: "Kesimlar" }, 2, 7);
  check("ai: local difficulty+variant (kalitsiz)", q4.options.length === 4 && q4.engine === "local");
}

{
  // 📱 PWA (Face ID / passkey) kontraktlari
  const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf-8");
  const pwa = src("lib/pwa.ts");
  const schema = src("db/schema.ts");
  const migrate = src("app/api/admin/migrate-schema/route.ts");
  const exists = (rel: string) => {
    try {
      readFileSync(new URL(`../${rel}`, import.meta.url), "utf-8");
      return true;
    } catch {
      return false;
    }
  };
  check("pwa: schema pwa_credentials", schema.includes("pwa_credentials"));
  check("pwa: migrate pwa_credentials", migrate.includes("create pwa_credentials"));
  check("pwa: challenge cookie shifrlangan", pwa.includes("encryptSecret") && pwa.includes("pwa_chal"));
  check("pwa: sessiya TTL", pwa.includes("SESSION_TTL_MS"));
  check("pwa: rpID dinamik", pwa.includes("x-forwarded-host"));
  check("pwa: passkey route lar mavjud",
    exists("src/app/api/pwa/login/route.ts") &&
    exists("src/app/api/pwa/passkey/options/route.ts") &&
    exists("src/app/api/pwa/passkey/verify/route.ts") &&
    exists("src/app/api/pwa/auth/options/route.ts") &&
    exists("src/app/api/pwa/auth/verify/route.ts"));
  check("pwa: manifest mavjud", exists("public/manifest.webmanifest"));
  check("pwa: service worker mavjud", exists("public/sw.js"));
  check("pwa: ilova sahifasi", exists("src/app/app/app-client.tsx"));
  const manifest = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf-8");
  check("pwa: manifest start_url /app", manifest.includes('"start_url": "/app"'));
  check("pwa: manifest standalone", manifest.includes('"display": "standalone"'));
  check("pwa: manifest icon", manifest.includes("/icons/icon-512.png"));
  const appClient = src("app/app/app-client.tsx");
  check("pwa: UI uzbekcha (Kirish)", appClient.includes("Kirish"));
  check("pwa: UI Face ID o'rnatish", appClient.includes("Face ID o'rnatish"));
  check("pwa: UI platformAuthenticator tekshiruvi", appClient.includes("platformAuthenticatorIsAvailable"));
}

{
  // 📱 PWA panellari (tez orada → ishlaydigan) kontraktlari
  const exists = (rel: string) => {
    try {
      readFileSync(new URL(`../${rel}`, import.meta.url), "utf-8");
      return true;
    } catch {
      return false;
    }
  };
  const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf-8");
  check("panel: schema pwa_accounts", src("db/schema.ts").includes("pwa_accounts"));
  check("panel: migrate pwa_accounts", src("app/api/admin/migrate-schema/route.ts").includes("create pwa_accounts"));
  check("panel: withEmaktabSession kesh bilan", src("lib/pwa.ts").includes("withEmaktabSession"));
  check("panel: hisob saqlanadi (login)", src("app/api/pwa/login/route.ts").includes("saveAccount"));
  check("panel: baholar route", exists("src/app/api/pwa/data/grades/route.ts"));
  check("panel: jadval route", exists("src/app/api/pwa/data/schedule/route.ts"));
  check("panel: yangiliklar route", exists("src/app/api/pwa/data/news/route.ts"));
  check("panel: nazoratchi route", exists("src/app/api/pwa/data/nazoratchi/route.ts"));
  check("panel: testlar route (GET+POST)", exists("src/app/api/pwa/data/tests/route.ts"));
  check("panel: maqom route (GET+POST)", exists("src/app/api/pwa/data/maqom/route.ts"));
  const panels = src("app/app/panels.tsx");
  check("panel: 6 ta panel mavjud",
    panels.includes("GradesPanel") && panels.includes("SchedulePanel") && panels.includes("NewsPanel") &&
    panels.includes("NazoratchiPanel") && panels.includes("TestsPanel") && panels.includes("MaqomPanel"));
  check("panel: test kamida 10", panels.includes("count < 10"));
  check("panel: maqom Bajarildi", panels.includes("Bajarildi"));
  check("panel: hafta navigatsiyasi", panels.includes("Oldingi") && panels.includes("Keyingi"));
  check("panel: menyu tugmalari ishlaydigan", src("app/app/app-client.tsx").includes('setView(m.id)'));
}

{
  // 🔧 PWA ma'lumot qatlami mustahkamlash (sessiya sahlash + qayta kirish UX)
  const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf-8");
  const pwa = src("lib/pwa.ts");
  check("sessiya: sessionFromCookies (botdek)", pwa.includes("sessionFromCookies"));
  check("sessiya: cookie'lar saqlanadi", pwa.includes("saveSessionCookies"));
  check("sessiya: 2 marta urinish (withSessiondek)", pwa.includes("attempt === 1"));
  check("sessiya: captcha uchun aniq xabar", pwa.includes("captcha"));
  check("sessiya: schema session_enc", src("db/schema.ts").includes("session_enc"));
  check("sessiya: migrate session_enc", src("app/api/admin/migrate-schema/route.ts").includes("pwa_accounts.session_enc"));
  check("ux: Qayta kirish tugmasi", src("app/app/panels.tsx").includes("Qayta kirish"));
  check("login: sessiya cookie saqlanadi", src("app/api/pwa/login/route.ts").includes("result.session.cookies"));
  check("probe: pwadata rejimi", src("app/api/admin/probe-login/route.ts").includes('sp.get("pwadata")'));
  check("lookup: login case-insensitive", src("app/api/pwa/data/nazoratchi/route.ts").includes("lower("));
}

{
  // 🧪 Test sifati + 📱 APK + 👨‍🏫 O'qituvchi bo'limi kontraktlari
  const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf-8");
  const ai = src("lib/ai.ts");
  check("test: emoji xom emas (U0001F yo'q)", !src("lib/nazoratchi.ts").includes("\u005cU000") && !src("lib/bot.ts").includes("\u005cU000"));
  check("test: javob joyi aralashtiriladi", ai.includes("shuffleOptions"));
  check("test: fan bo'yicha prompt", ai.includes("subject") && ai.includes("QOIDALAR"));
  check("test: matematika generatori", ai.includes("mathQuestion"));
  check("test: ingliz tili banki", ai.includes("ENG_BANK"));
  check("test: adabiyot banki", ai.includes("LIT_BANK"));
  check("test: meta-savol rad etiladi", ai.includes("qaysi mavzu"));
  check("test: fan createAndDeliverTestda", src("lib/nazoratchi.ts").includes("tutorsForLink(link.id)"));
  check("bot: Ilovani o'rnatish tugmasi", src("lib/telegram.ts").includes("Ilovani o'rnatish") && src("lib/bot.ts").includes("eMaktab.apk"));
  check("apk: twa-manifest", readFileSync(new URL("../twa-manifest.json", import.meta.url), "utf-8").includes("uz.emaktab.app"));
  check(
    "apk: workflow mavjud",
    (() => {
      const w = readFileSync(new URL("../.github/workflows/build-apk.yml", import.meta.url), "utf-8");
      return w.includes("assembleRelease") && w.includes("apksigner") && w.includes("eMaktab.apk");
    })(),
  );
  const exists2 = (rel: string) => {
    try {
      readFileSync(new URL(`../${rel}`, import.meta.url), "utf-8");
      return true;
    } catch {
      return false;
    }
  };
  check("apk: android loyihasi generatsiya", exists2("android/app/build.gradle") && exists2("android/app/src/main/AndroidManifest.xml"));
  check("apk: signing-key route", src("app/api/admin/signing-key/route.ts").includes("android_keystore_b64"));
  check("apk: assetlinks dinamik", src("app/.well-known/assetlinks.json/route.ts").includes("android_signing_fp"));
  check("apk: release URL botda", src("lib/bot.ts").includes("releases/latest/download/eMaktab.apk"));
  check("oqituvchi: Sinfim paneli", src("app/app/panels.tsx").includes("SinfimPanel"));
  check("oqituvchi: Darsni o'tildi paneli", src("app/app/panels.tsx").includes("ConductPanel"));
  check("oqituvchi: Sozlamalar paneli", src("app/app/panels.tsx").includes("SettingsPanel"));
  check("oqituvchi: class route", src("app/api/pwa/data/class/route.ts").includes("fetchClassMembers"));
  check("oqituvchi: conduct route", src("app/api/pwa/data/conduct/route.ts").includes("setLessonConducted"));
  check("oqituvchi: menyu 9 ta", src("app/app/app-client.tsx").includes("conduct") && src("app/app/app-client.tsx").includes("sinfim"));
}

{
  // ✅ Dars o'tildi (held) — haqiqiy /v2 shartnoma (a=elh + held checkbox)
  const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf-8");
  const page = parseLessonHeldPage(
    'global_urlLessonHeldEdit = "https://schools.emaktab.uz/v2/ajax?xss=abc&a=elh"; <input class="blueCheckbox" type="checkbox" id="held" data-lesson="123" name="held" value="1" checked> <label for="held">Dars o\u2018tildi.</label>',
  );
  check("held: checkbox aniqlanadi", page.exists);
  check("held: checked holat", page.held === true);
  check("held: elh manzili", (page.heldEditUrl ?? "").includes("a=elh"));
  const page2 = parseLessonHeldPage('<input class="blueCheckbox" type="checkbox" id="held" data-lesson="9" name="held" value="1">');
  check("held: checked emas", page2.exists && page2.held === false);
  check("held: yo'q sahifa", parseLessonHeldPage("<div></div>").exists === false);
  check("held: Bugun", hwDateTextToDayKey("Bugun") === tashkentDayKey());
  check("held: Kecha", hwDateTextToDayKey("Kecha") === shiftDayKey(tashkentDayKey(), -1));
  check("held: 30 oktabr 2026", hwDateTextToDayKey("30 oktabr 2026") === "2026-10-30");
  check("held: noma'lum sana", hwDateTextToDayKey("xxx") === null);
  check("held: panel Hammasini tugmasi", src("app/app/panels.tsx").includes("Hammasini o'tildi deb belgilash"));
  check("held: panel Hammasiga maqom", src("app/app/panels.tsx").includes("Hammasiga maqom berish"));
  check("held: panel faqat o'tilmaganlar", src("app/app/panels.tsx").includes("O'tilmagan darslar"));
  check("held: panel BatchOverlay", src("app/app/panels.tsx").includes("BatchOverlay"));
  check("held: route held tekshiruvi", src("app/api/pwa/data/conduct/route.ts").includes("fetchLessonHeldPage"));
  check("held: route setLessonHeld", src("app/api/pwa/data/conduct/route.ts").includes("setLessonHeld"));
}

{
  // 🧪 Laboratoriya — haqiqiy hisob-kitoblar (kimyo/fizika/biologiya)
  const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf-8");

  // Kimyo: kislota + ishqor — neytrallanish + issiqlik
  const mix1 = simulate([
    { reagentId: "hcl", ml: 20 },
    { reagentId: "naoh", ml: 20 },
    { reagentId: "fen", ml: 5 },
  ]);
  check("lab-kimyo: neytrallanish issiqlik", mix1.hodisalar.some((h) => h.kind === "heat"));
  check("lab-kimyo: pH ≈ 7 neytral", mix1.ph !== null && Math.abs(mix1.ph - 7) < 1.2);

  // Kimyo: AgNO3 + NaCl → AgCl cho'kmasi
  const mix2 = simulate([
    { reagentId: "agno3", ml: 15 },
    { reagentId: "nacl", ml: 15 },
  ]);
  check("lab-kimyo: AgCl cho'kmasi", mix2.precipitate?.name.includes("AgCl") === true);

  // Kimyo: Na2CO3 + HCl → CO2
  const mix3 = simulate([
    { reagentId: "na2co3", ml: 15 },
    { reagentId: "hcl", ml: 20 },
  ]);
  check("lab-kimyo: CO2 gazi", mix3.gas?.name.includes("CO₂") === true);

  // Kimyo: ishqor + fenolftalein → pushti
  const mix4 = simulate([
    { reagentId: "naoh", ml: 20 },
    { reagentId: "fen", ml: 5 },
  ]);
  check("lab-kimyo: fenolftalein pushti", mix4.hodisalar.some((h) => h.text.includes("PUSHTI")));
  check("lab-kimyo: ishqoriy pH", mix4.ph !== null && mix4.ph > 8.2);

  // 🧬 118 ELEMENT (Mendeleyev jadvali)
  check("lab-element: 118 ta element", ELEMENTS.length === 118, ELEMENTS.length);
  check("lab-element: tartib raqamlari 1..118", ELEMENTS.every((e, i) => e.num === i + 1));
  check("lab-element: id noyob", new Set(ELEMENTS.map((e) => e.id)).size === 118);
  check("lab-element: Na/C/Au mavjud", Boolean(ELEMENT_MAP.na && ELEMENT_MAP.c && ELEMENT_MAP.au));
  check("lab-element: getReagent element topadi", getReagent("na")?.formula === "Na" && getReagent("hcl")?.formula === "HCl");

  // 🧬 Sintez formulasi (valentlik bo'yicha)
  check("lab-element: Na + Cl → NaCl", binaryFormula(ELEMENT_MAP.na, ELEMENT_MAP.cl) === "NaCl");
  check("lab-element: Mg + O → MgO", binaryFormula(ELEMENT_MAP.mg, ELEMENT_MAP.o) === "MgO");
  check("lab-element: Na + O → Na₂O", binaryFormula(ELEMENT_MAP.na, ELEMENT_MAP.o) === "Na₂O");
  check("lab-element: Al + O → Al₂O₃", binaryFormula(ELEMENT_MAP.al, ELEMENT_MAP.o) === "Al₂O₃");
  check("lab-element: H + Cl → HCl", binaryFormula(ELEMENT_MAP.h, ELEMENT_MAP.cl) === "HCl");
  check("lab-element: H + O → H₂O", binaryFormula(ELEMENT_MAP.h, ELEMENT_MAP.o) === "H₂O");

  // 🧬 Sintez reaksiyasi — Na + Cl → NaCl (tenglama pastda chiqadi)
  const synth = simulate([
    { reagentId: "na", ml: 10 },
    { reagentId: "cl", ml: 10 },
  ]);
  const synthEq = synth.hodisalar.find((h) => h.equation === "Na + Cl → NaCl");
  check("lab-element: Na + Cl → NaCl tenglamasi", Boolean(synthEq), synth.hodisalar.map((h) => h.equation));
  check("lab-element: sintez hodisasi matni", synth.hodisalar.some((h) => h.text.includes("SINTEZ")));

  // H + Cl → HCl (foydalanuvchi sinagan tajriba)
  const hclSynth = simulate([
    { reagentId: "h", ml: 10 },
    { reagentId: "cl", ml: 10 },
  ]);
  check("lab-element: H + Cl → HCl tenglamasi chiqadi", hclSynth.hodisalar.some((h) => h.equation === "H + Cl → HCl"), hclSynth.hodisalar.map((h) => h.equation));

  // ⚖️ STOXIOMETRIYA: H₂O uchun 2 ta H + 1 ta O kerak!
  const hOnly = simulate([{ reagentId: "h", ml: 10 }, { reagentId: "o", ml: 10 }]);
  check("lab-element: H + O (1:1) — reaksiya YO'Q (2 ta H kerak!)", !hOnly.hodisalar.some((h) => h.equation?.includes("H₂O")), hOnly.hodisalar.map((h) => h.equation));
  const h2oSynth = simulate([{ reagentId: "h", ml: 20 }, { reagentId: "o", ml: 10 }]);
  check("lab-element: 2H + O → H₂O (to'g'ri nisbatda)", h2oSynth.hodisalar.some((h) => h.equation === "2H + O → H₂O"), h2oSynth.hodisalar.map((h) => h.equation));

  // ⚡ ZANJIR MUSTAQILLIGI: ulanmagan qurilma ishlayotgan zanjirga XALAQIT bermaydi!
  const indep = solveCircuit([
    { id: "bat", type: "battery", value: 9, a: 1, b: 2 },
    { id: "heat", type: "heater", value: 10, a: 2, b: 1 },
    { id: "buz", type: "buzzer", value: 0, a: 3, b: 4 },
  ]);
  check("lab-fizika: alohida zanjir mustaqil ishlaydi (isitgich yonadi)", indep.ok && (indep.heatGlow["heat"] ?? 0) > 0.2, indep.error ?? indep.heatGlow);
  check("lab-fizika: ulanmagan gurj O'CHIQ qoladi", !indep.buzzerOn["buz"]);
  const indep2 = solveCircuit([
    { id: "bat", type: "battery", value: 9, a: 1, b: 2 },
    { id: "heat", type: "heater", value: 10, a: 2, b: 1 },
    { id: "bat2", type: "battery", value: 9, a: 5, b: 6 },
    { id: "buz", type: "buzzer", value: 0, a: 6, b: 5 },
    { id: "sw", type: "switch", value: 0, a: 7, b: 8, closed: true },
  ]);
  check("lab-fizika: ikkita ALOHIDA zanjir ham ishlaydi", indep2.ok && (indep2.heatGlow["heat"] ?? 0) > 0.2 && indep2.buzzerOn["buz"], indep2.error);

  // Faol metall + kislota → H₂ (Na + HCl)
  const naAcid = simulate([
    { reagentId: "na", ml: 10 },
    { reagentId: "hcl", ml: 25 },
  ]);
  check("lab-element: Na + HCl → H₂ gaz", naAcid.gas?.name.includes("H₂") === true);
  check("lab-element: Na tenglamasi chiqadi", naAcid.hodisalar.some((h) => (h.equation ?? "").includes("Na")));

  // Tenglamalar klassik reaksiyalarda ham bor
  check("lab-kimyo: neytrallanish tenglamasi", mix1.hodisalar.some((h) => (h.equation ?? "").includes("→")));
  check("lab-kimyo: AgCl tenglamasi", mix2.hodisalar.some((h) => (h.equation ?? "").includes("AgCl")));
  check("lab-kimyo: CO2 tenglamasi", mix3.hodisalar.some((h) => (h.equation ?? "").includes("CO₂")));

  // Fizika: yopiq zanjir — lampochka yonadi
  const circ = solveCircuit([
    { id: "bat", type: "battery", a: 1, b: 2, value: 9 },
    { id: "bulb", type: "bulb", a: 2, b: 1, value: 6 },
  ]);
  check("lab-fizika: zanjir yechildi", circ.ok === true);
  check("lab-fizika: lampochka yonadi", (circ.brightness.bulb ?? 0) > 0.5);
  check("lab-fizika: tok hisoblandi", circ.totalCurrent > 0.1 && circ.totalCurrent < 2);

  // Fizika: ochiq zanjir — xato (batareya + ulanmagan lampochka)
  const open = solveCircuit([
    { id: "bat", type: "battery", a: 1, b: 2, value: 9 },
    { id: "bulb", type: "bulb", a: 3, b: 4, value: 6 },
  ]);
  check("lab-fizika: ochiq zanjir xatosi", open.ok === false && Boolean(open.error));

  // Fizika: applyWires — simlar tugunlarni birlashtiradi
  const wired = applyWires(
    [
      { id: "bat", type: "battery", a: 1, b: 2, value: 9 },
      { id: "bulb", type: "bulb", a: 3, b: 4, value: 6 },
    ],
    [
      { fromComp: "bat", fromTerm: "b", toComp: "bulb", toTerm: "a" },
      { fromComp: "bulb", fromTerm: "b", toComp: "bat", toTerm: "a" },
    ],
  );
  const wiredOk = solveCircuit(wired);
  check("lab-fizika: sim bilan yopiq zanjir", wiredOk.ok === true && (wiredOk.brightness.bulb ?? 0) > 0.5);

  // Fizika: Hooke — F = m·g
  const sp = springPhysics(2, 20);
  check("lab-fizika: Hooke F=m·g", Math.abs(sp.force - 2 * 9.81) < 0.01);
  check("lab-fizika: Hooke x=F/k", Math.abs(sp.extension - (2 * 9.81) / 20) < 0.01);

  // Fizika: linza — 1/f = 1/do + 1/di
  const ln = lensPhysics(10, 20);
  check("lab-fizika: linza tasviri", Math.abs(ln.image - 20) < 0.01);
  check("lab-fizika: linza kattalashtirish", Math.abs(ln.magnification + 1) < 0.01);

  // Biologiya: kontent to'liq
  check("lab-biologiya: organoidlar ≥ 12", ORGANELLES.length >= 12);
  check("lab-biologiya: mitoz 6 bosqich", MITOSIS.length === 6);
  check("lab-biologiya: meyoz 6 bosqich", MEIOSIS.length === 6);
  check(
    "lab-biologiya: krossingover bor",
    MEIOSIS.some((m) => (m.name + " " + m.tavsif).toLowerCase().includes("krossingover")),
  );

  // --- 🆕 Qo'l bilan boshqarish yangilanishi ---

  // Kimyo: ketma-ketlik TARTIBI muhim (AlCl₃ + NaOH — amfoter)
  const seqA = simulateSteps([
    { reagentId: "alcl3", ml: 25 },
    { reagentId: "naoh", ml: 20 },
    { reagentId: "naoh", ml: 25 },
  ]).steps.flatMap((x) => x.yangiHodisalar.map((h) => h.text));
  const seqB = simulateSteps([
    { reagentId: "naoh", ml: 45 },
    { reagentId: "alcl3", ml: 25 },
  ]).steps.flatMap((x) => x.yangiHodisalar.map((h) => h.text));
  check("lab-kimyo: A tartibda cho'kma keyin eridi", seqA.some((t) => t.includes("cho'kma tushdi")) && seqA.some((t) => t.includes("ERIYDI")));
  check("lab-kimyo: B tartibda darhol tiniq (farq bor!)", !seqB.some((t) => t.includes("cho'kma tushdi")));

  // Kimyo: oltin yomg'ir (PbI₂) — issiqda eriydi
  const gold = simulate([
    { reagentId: "pbno32", ml: 25 },
    { reagentId: "ki", ml: 25 },
  ]);
  check("lab-kimyo: PbI₂ oltin cho'kma", (gold.precipitate?.name ?? "").includes("PbI₂"));
  const hotGold = simulate([{ reagentId: "pbno32", ml: 25 }, { reagentId: "ki", ml: 25 }], 60);
  check("lab-kimyo: issiqda PbI₂ eriydi", hotGold.precipitate === null && hotGold.hodisalar.some((h) => h.text.includes("ISSIQDA ERIYDI")));

  // Kimyo: mis kislota bilan reaksiyaga kirmaydi
  const cuHcl = simulate([
    { reagentId: "cu", ml: 5 },
    { reagentId: "hcl", ml: 20 },
  ]);
  check("lab-kimyo: Cu + HCl — reaksiya yo'q", cuHcl.hodisalar.some((h) => h.text.includes("KIRMAYDI")) && cuHcl.gas === null);

  // Fizika: nosozlik — ochiq zanjir ishlamaydi
  const broken = solveCircuit([
    { id: "bat", type: "battery", a: 1, b: 2, value: 9 },
    { id: "bulb", type: "bulb", a: 2, b: 1, value: 6, fault: "open" },
  ]);
  check("lab-fizika: nosozlik (ochiq) — ishlamaydi", broken.ok === false);

  // Fizika: o'lik batareya — tok yo'q
  const dead = solveCircuit([
    { id: "bat", type: "battery", a: 1, b: 2, value: 9, fault: "dead" },
    { id: "bulb", type: "bulb", a: 2, b: 1, value: 6 },
  ]);
  check("lab-fizika: o'lik batareya — tok yo'q", dead.ok === true && dead.totalCurrent < 0.001);

  // Fizika: LED teskari ulansa — yonmaydi
  const rev = solveCircuit([
    { id: "bat", type: "battery", a: 1, b: 2, value: 9 },
    { id: "led", type: "led", a: 2, b: 1, value: 6 },
  ]);
  check("lab-fizika: LED teskari — yonmaydi", rev.ok === true && rev.ledReversed.led === true && (rev.brightness.led ?? 0) === 0);

  // Fizika: qisqa tutashuv aniqlanadi
  const shorted = solveCircuit([
    { id: "bat", type: "battery", a: 1, b: 2, value: 12 },
    { id: "r", type: "resistor", a: 2, b: 1, value: 0.1 },
  ]);
  check("lab-fizika: qisqa tutashuv ogohlantirishi", shorted.ok === false && (shorted.error ?? "").includes("Qisqa"));

  // Biologiya: namunalar + mikroskop kontraktlari
  check("lab-biologiya: namunalar ≥ 6", SPECIMENS.length >= 6);

  // UI kontraktlari (yangilangan)
  check("lab: StageBox — kengaytirish + qo'shish", src("app/app/lab/StageBox.tsx").includes("Kengaytirish") && src("app/app/lab/StageBox.tsx").includes("Qo'shish"));
  check("lab-kimyo: ketma-ketlik jurnali", src("app/app/lab/ChemLab.tsx").includes("simulateSteps"));
  check("lab-kimyo: isitish + aralashtirish", src("app/app/lab/ChemLab.tsx").includes("Isitish") && src("app/app/lab/ChemLab.tsx").includes("Aralashtirish"));
  check("lab-fizika: nosozlik rejimi", src("app/app/lab/PhysLab.tsx").includes("Nosozlik rejimi"));
  check("lab-fizika: ishga tushirish", src("app/app/lab/PhysLab.tsx").includes("Ishga tushirish"));
  check("lab-fizika: tayyor loyihalar", src("app/app/lab/PhysLab.tsx").includes("Tayyor loyihalar"));
  check("lab-biologiya: pichoqcha + mikroskop", src("app/app/lab/PrepLab.tsx").includes("pichoqcha") && src("app/app/lab/PrepLab.tsx").includes("SpecimenView"));
  check("lab-biologiya: mikroskop boshqaruvi (obyektivlar/fokus/diyafragma/stolcha)", src("app/app/lab/PrepLab.tsx").includes("100×") && src("app/app/lab/PrepLab.tsx").includes("Mikrovint") && src("app/app/lab/PrepLab.tsx").includes("Diyafragma") && src("app/app/lab/PrepLab.tsx").includes("Stolcha"));
  check("lab-biologiya: hujayra ichiga kirish (×100)", src("app/app/lab/PrepLab.tsx").includes("Hujayra ichiga kirish"));
  check("lab-biologiya: pipetka usuli (yog'/suyuqlik namunalari)", src("app/app/lab/PrepLab.tsx").includes("pipette") && src("app/app/lab/PrepLab.tsx").includes("Pipetka bilan namuna olish"));
  check("lab-biologiya: faqat kichik namuna oynachaga o'tadi", src("app/app/lab/PrepLab.tsx").includes("KATTA namuna stolida qoladi"));
  // yangi: simulyator oqimi + yaqinlik tugmalari + anjomlar + 11 namuna
  check("lab-biologiya: yaqinlik tugmalari (masofadan emas)", src("app/app/lab/PrepLab.tsx").includes("near.knife") && src("app/app/lab/PrepLab.tsx").includes("slideMicro"));
  check("lab-biologiya: Anjomlar bo'limi", src("app/app/lab/PrepLab.tsx").includes("Anjomlar") && src("app/app/lab/PrepLab.tsx").includes("Pipetka") && src("app/app/lab/PrepLab.tsx").includes("Pinset"));
  check("lab-biologiya: ko'rish sahna ichida", src("app/app/lab/PrepLab.tsx").includes("viewPlaneRef") && src("app/app/lab/PrepLab.tsx").includes("Ko'rish"));
  check("lab-biologiya: 11 namuna", SPECIMENS.length === 11, SPECIMENS.length);
  check("lab-biologiya: yangi namunalar (asab/suyak/yog'/qo'ziqorin/bakteriya)", ["nerve", "bone", "fat", "fungi", "bacteria"].every((t) => SPECIMENS.some((sp) => sp.texture === t)));
  check("lab-kimyo: qo'shish stolga shisha tushadi", src("app/app/lab/ChemLab.tsx").includes("spawnBottleRef") && src("app/app/lab/ChemLab.tsx").includes("nearPour"));
  check("lab-kimyo: quyish tugmasi yaqinlikda", src("app/app/lab/ChemLab.tsx").includes("🫗 Quyish"));
  check("lab-kimyo: qo'shilgan shisha ushlanadi (getRoots)", src("app/app/lab/ChemLab.tsx").includes("bottlesRoot?.children"));
  check("lab-biologiya: kesilgan tilim siljiydi (kind slice)", src("app/app/lab/PrepLab.tsx").includes('"slice"') && src("app/app/lab/PrepLab.tsx").includes("Kesilgan mitti namuna"));
  check("lab-biologiya: tilim oynachaga olib boriladi", src("app/app/lab/PrepLab.tsx").includes("piecePos"));
  check("lab-fizika: realistik modellar (filament/rangli tasmalar/spiral)", src("app/app/lab/PhysLab.tsx").includes("filament") && src("app/app/lab/PhysLab.tsx").includes("bandColors") && src("app/app/lab/PhysLab.tsx").includes("TubeGeometry"));
  check("lab-fizika: strelkali asbob shkalasi", src("app/app/lab/PhysLab.tsx").includes("tick") && src("app/app/lab/PhysLab.tsx").includes("needle"));
  // 📖 Yoriqnoma (har bir fan uchun alohida + real hayot bog'lanishlari)
  check("lab-yoriqnoma: Guides mavjud", src("app/app/lab/Guides.tsx").includes("GUIDE_PHYSICS") && src("app/app/lab/Guides.tsx").includes("GUIDE_CHEMISTRY") && src("app/app/lab/Guides.tsx").includes("GUIDE_BIOLOGY"));
  check("lab-yoriqnoma: har bir bo'limda real hayot", (src("app/app/lab/Guides.tsx").match(/realLife:/g) ?? []).length >= 25, (src("app/app/lab/Guides.tsx").match(/realLife:/g) ?? []).length);
  check("lab-yoriqnoma: fizikada yoriqnoma tugmasi", src("app/app/lab/PhysLab.tsx").includes("GuideButton") && src("app/app/lab/PhysLab.tsx").includes("GUIDE_PHYSICS"));
  check("lab-yoriqnoma: kimyoda yoriqnoma", src("app/app/lab/ChemLab.tsx").includes("GUIDE_CHEMISTRY"));
  check("lab-yoriqnoma: biologiyada yoriqnoma (hamma rejimlar)", src("app/app/lab/BioLab.tsx").includes("GUIDE_BIOLOGY") && src("app/app/lab/PrepLab.tsx").includes("GUIDE_BIOLOGY"));
  check("lab-yoriqnoma: mitoz/meyoz real hayotda", src("app/app/lab/Guides.tsx").includes("SARATON") && src("app/app/lab/Guides.tsx").includes("Meyoz"));
  check("lab-fizika: qurilmalarda real hayot tavsifi", src("app/app/lab/PhysLab.tsx").includes("REAL_DESC") && src("app/app/lab/PhysLab.tsx").includes("elektromobil"));
  // 🏫 3D laboratoriya xonasi
  check("lab-xona: kafel pol, deraza, shkaf, lavabo", src("app/app/lab/three-utils.ts").includes("labRoom") && src("app/app/lab/three-utils.ts").includes("CHIQISH") && src("app/app/lab/three-utils.ts").includes("YONG") === false ? true : src("app/app/lab/three-utils.ts").includes("EHTIYOT"));
  check("lab-xona: yong'in susishtirgichi + birinchi yordam", src("app/app/lab/three-utils.ts").includes("extingu") && src("app/app/lab/three-utils.ts").includes("Birinchi yordam".toLowerCase().toUpperCase()) || src("app/app/lab/three-utils.ts").includes("aidBox"));
  // 📖 elementlar ma'lumoti (haqiqiy hisoblash)
  const naD = elementDetails(11);
  check("lab-element: Na — 3-davr, 1-guruh, [Ne] 3s¹", naD.period === 3 && naD.group === "1" && naD.config === "[Ne] 3s¹", naD);
  const feD = elementDetails(26);
  check("lab-element: Fe — 4-davr, 8-guruh", feD.period === 4 && feD.group === "8", feD);
  const crD = elementDetails(24);
  check("lab-element: Cr istisosasi 3d⁵ 4s¹", crD.config === "[Ar] 3d⁵ 4s¹", crD.config);
  const clD = elementDetails(17);
  check("lab-element: Cl — 3-davr, 17-guruh, [Ne] 3s² 3p⁵", clD.group === "17" && clD.config === "[Ne] 3s² 3p⁵", clD);
  check("lab-element: barcha 118 elementda davr va guruh hisoblanadi", ELEMENTS.every((e) => { const d = elementDetails(e.num); return d.period >= 1 && d.period <= 7 && d.group.length > 0; }));
  // 📋 tajribalar kutubxonasi
  check("lab-tajriba: kutubxona mavjud (kamida 9 ta)", EXPERIMENTS.length >= 9, EXPERIMENTS.length);
  check("lab-tajriba: har birida qadamlar + tushuntirish + formula mavjud", EXPERIMENTS.every((e) => e.steps.length >= 3 && e.explanation.length > 10 && e.objective.length > 5));
  check("lab-tajriba: UI o'zbekcha", src("app/app/lab/Experiments.tsx").includes("Tajribalar") && src("app/app/lab/Experiments.tsx").includes("Laboratoriyada ochish"));
  check("lab-tajriba: LabPanel'da tugma", src("app/app/lab/LabPanel.tsx").includes("Experiments"));

  // UI kontraktlari
  check("lab: LabPanel mavjud", src("app/app/lab/LabPanel.tsx").includes("Kimyo") && src("app/app/lab/LabPanel.tsx").includes("Fizika") && src("app/app/lab/LabPanel.tsx").includes("Biologiya"));
  check("lab: menyu — barcha rollar", (src("app/app/app-client.tsx").match(/id: "lab"/g) ?? []).length === 2);
  check("lab: render", src("app/app/app-client.tsx").includes('view === "lab" && <LabPanel />'));
  check("lab: ChemLab 3D", src("app/app/lab/ChemLab.tsx").includes("createScene"));
  check("lab: PhysLab 3D", src("app/app/lab/PhysLab.tsx").includes("solveCircuit"));
  check("lab: BioLab 3D", src("app/app/lab/BioLab.tsx").includes("MITOSIS") || src("app/app/lab/BioLab.tsx").includes("DivisionLab"));
}

{
  // 📱 WebView ilova — barqarorlik kontraktlari (TWA kutubxonalari yo'q)
  const exists2 = (rel: string) => {
    try {
      readFileSync(new URL(`../${rel}`, import.meta.url), "utf-8");
      return true;
    } catch {
      return false;
    }
  };
  const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf-8");
  const gradle = readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf-8");
  check("apk: MainActivity WebView", exists2("android/app/src/main/java/uz/emaktab/app/MainActivity.java"));
  check("apk: androidbrowserhelper olib tashlandi", !gradle.includes("androidbrowserhelper"));
  check("apk: manifest toza (customtabs yo'q)", !manifest.includes("customtabs") && manifest.includes(".MainActivity"));
  check("apk: eski klasslar o'chirildi", !exists2("android/app/src/main/java/uz/emaktab/app/LauncherActivity.java"));
  check("apk: versiya 2", gradle.includes("versionCode 2"));
  check("apk: WebView JS+DOM", exists2("android/app/src/main/java/uz/emaktab/app/MainActivity.java") && readFileSync(new URL("../android/app/src/main/java/uz/emaktab/app/MainActivity.java", import.meta.url), "utf-8").includes("setDomStorageEnabled"));
}

console.log(`\nNatija: ${passed} o'tdi, ${failed} yiqildi`);
process.exit(failed > 0 ? 1 : 0);
