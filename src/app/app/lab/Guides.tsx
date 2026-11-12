// 📖 Ishlatish yoriqnomasi — har bir fan uchun ALOHIDA yoriqnoma + real hayot bog'lanishlari
"use client";

import { useState, type ReactNode } from "react";

export interface GuideStep {
  /** qadamlar yoki tushuntirishlar */
  lines: string[];
  /** 🌍 real hayotda qanday ishlatiladi */
  realLife?: string;
}

export interface GuideSection {
  icon: string;
  title: string;
  steps: string[];
  realLife: string;
  tip?: string;
}

export interface GuideData {
  title: string;
  subtitle: string;
  sections: GuideSection[];
}

// ============================== ⚡ FIZIKA ==============================
export const GUIDE_PHYSICS: GuideData = {
  title: "⚡ Fizika laboratoriyasi — yoriqnoma",
  subtitle: "Elektr zanjiri, magnit, prujina va lazer — hammasi haqiqiy qonunlar bilan ishlaydi",
  sections: [
    {
      icon: "🟢",
      title: "Sim ulash va qurilma ulash (Elektr)",
      steps: [
        "1️⃣ Katalogdan (＋ Qo'shish) qurilma tanlang — u ish stoliga tushadi.",
        "2️⃣ Qurilmaning yashil QIZIL terminalini bosing — keyin ikkinchi qurilmaning terminalini bosing → SIM ulanadi!",
        "3️⃣ Zanjirni yoping: batareya (+) → lampochka → kalit → batareya (−).",
        "4️⃣ Kalitni bosing (ochiq/yopiq) — yoki '⚡ Ishga tushirish' tugmasini bosing.",
        "5️⃣ Lampochka yonsa — zanjir TO'G'RI! Yonmasa — joyida ochiq joy qolgan (qizil nuqta chiqadi).",
      ],
      realLife: "🏠 Uyingizdagi chiroq ham SHUNDAY ishlaydi: rozetka → sim → kalit → lampochka → hisoblagich → transformator. Elektrchi aynan shu 'zanjir yopiqmi?' degan savol bilan ishlaydi.",
      tip: "🖐 Ikkala barmog'ingiz bilan ham: qurilmani sudrash = ko'chirish (faqat stol yuzasida!); terminalga bosish = sim ulash; bo'sh joydan surish = kamera.",
    },
    {
      icon: "🔗",
      title: "ALOHIDA zanjirlar mustaqil ishlaydi!",
      steps: [
        "1️⃣ Batareya + isitgichni ulang → isitgich ISHLAYDI. Gurj ulanmagan bo'lsa — u sokin turadi, isitgichga XALAQIT bermaydi!",
        "2️⃣ Ikkinchi batareya + gurjni ALOHIDA ulang → u ham ishlaydi. Har bir YOPILGAN zanjir o'zi mustaqil!",
        "3️⃣ Faqat YOPILGAN zanjir ishlaydi: kalit ochiq bo'lsa — tok o'tmaydi.",
        "4️⃣ ⚠️ QISQA TUTASHUV: batareya (+) va (−) ni bevosita ulasangiz — UCHQUN va qora tutun chiqadi, tok uziladi!",
      ],
      realLife: "🏠 Uyingizda ham har bir jihoz ALOHIDA zanjirda: chiroq yonsa, televizor uzilgan bo'lsa — bir-biriga ta'sir qilmaydi. Shuning uchun uzilgan jihoz qolganlarini o'chirmaydi!",
    },
    {
      icon: "🔋",
      title: "Batareya (energiya manbai)",
      steps: [
        "1️⃣ Batareya zanjirga ulanadi — u tokni 'haydaydi'.",
        "2️⃣ Qutblarni kuzating: (+) qizil, (−) qora — LED kabi asboblar faqat to'g'ri ulanganda ishlaydi.",
      ],
      realLife: "📱 Telefon, qo'l chirog'i, pult, elektromobil — hammasi batareya bilan ishlaydi. Avtomobil akkumulyatori ham katta batareya!",
    },
    {
      icon: "💡",
      title: "Lampochka (yorug'lik)",
      steps: [
        "1️⃣ Lamping ichidagi SPIRAL tok oqganda qiziydi va YONADI.",
        "2️⃣ Kuchlanish oshsa — yorug'lik kuchayadi (spiral ko'proq qiziydi).",
      ],
      realLife: "🏠 Xona chirog'i, fonar, avtomobil farasi — hammasi bir xil tamoyilda. Zamonaviy LED lampalar kamroq elektr sarflaydi — shuning uchun ular tejamkor.",
    },
    {
      icon: "🔌",
      title: "Kalit (switch) — zanjirni ochish/yopish",
      steps: [
        "1️⃣ Kalitni bosing — tayoqcha ko'tariladi/pastga tushadi.",
        "2️⃣ Yopiq kalit = zanjir yopiq = TOK oqadi. Ochiq = tok yo'q.",
      ],
      realLife: "🏠 Devordagi yorug'lik kaliti — xuddi shu! Dazmol, choynak, kir yuvish mashinasi ham ichida kalit bor.",
    },
    {
      icon: "🎨",
      title: "Rezistor (tokni cheklash)",
      steps: [
        "1️⃣ Rezistor qancha katta bo'lsa — tomdan o'tadigan tok shuncha KICHIK bo'ladi.",
        "2️⃣ Rangli tasmalar uning qarshiligini bildiradi (haqiqiy rezistorda ham xuddi shunday!).",
      ],
      realLife: "📻 Radio, televizor, kompyuter sxemalarida — tokni kerakli darajada ushlab turish uchun MILLIONLAB rezistorlar ishlatiladi. Telefoningizda ham bor!",
    },
    {
      icon: "📊",
      title: "Ampermetr / Galvanometr (tok o'lchash)",
      steps: [
        "1️⃣ Asbobni zanjirga ULANG — strelka tok kuchiga qarab egiladi.",
        "2️⃣ Strelka qancha ko'p egilsa — tok shuncha kuchli.",
      ],
      realLife: "🔧 Ustaxonadagi elektrchi tokni aynan shunday o'lchaydi. Uyingizdagi elektr hisoblagich ham shu printsipda ishlaydi.",
    },
    {
      icon: "⚙️",
      title: "Elektrodvigatel (motor)",
      steps: [
        "1️⃣ Motor zanjirga ulansa — FAN aylanadi (tok → harakat!).",
        "2️⃣ Tok kuchaysa — tezroq aylanadi.",
      ],
      realLife: "🌪 Ventilyator, chang yutgich, soch quritgich, muzlatgich, elektromobil, lift, metro poyezdi — hammasi elektrodvigatel bilan ishlaydi.",
    },
    {
      icon: "🔔",
      title: "Qo'ng'iroq (tovush)",
      steps: [
        "1️⃣ Zanjir yopilganda qo'ng'iroq TEBRANADI va ovoz chiqaradi.",
      ],
      realLife: "🏫 Maktab qo'ng'irog'i, eshik qo'ng'irog'i, o't o'chirish signalizatsiyasi — hammasi shu printsipda.",
    },
    {
      icon: "🎚",
      title: "Reostat (tokni sozlash)",
      steps: [
        "1️⃣ Kontakt surilsa — qarshilik o'zgaradi va tok kuchi o'zgaradi.",
        "2️⃣ Shu bilan lampochka yorug'ligini ham, motor tezligini ham boshqarish mumkin.",
      ],
      realLife: "🏠 Xona yorug'ligini pas-yuqori qiluvchi tugma (dimmer), avtomobil g'ildirak tezligini boshqaruvchi pedal — hammasi reostat printsipida.",
    },
    {
      icon: "🔥",
      title: "Isitgich (issiqlik)",
      steps: [
        "1️⃣ Spiral tok o'tganda QIZIYDI (Joule qonuni).",
        "2️⃣ Tok qancha ko'p o'tsa — shuncha ko'p issiqlik ajraladi.",
      ],
      realLife: "☕ Choynak, dazmol, suv isitgich, pech, avtomobil salon isitgichi — hammasi spiral (ten) bilan ishlaydi.",
    },
    {
      icon: "🔆",
      title: "Optika — linza va nurlar",
      steps: [
        "1️⃣ Linzani sudrab yaqinlashtiring/uzoqlashtiring — nurlar qiyshayadi.",
        "2️⃣ Nurlar bitta nuqtaga JAMLANADI — bu LINZA FOKUSI.",
        "3️⃣ Fokus masofasi o'zgarsa — rasm kattaligi ham o'zgaradi!",
      ],
      realLife: "👓 Ko'zoynak linzasi, 📷 kamera obyektivi, 🔬 mikroskopning o'zidagi linzalar — hammasi SHU qonun bilan ishlaydi. Ko'zoynak tanlashda shifokor aynan fokusni o'lchaydi.",
    },
    {
      icon: "🌀",
      title: "Prujina — Hooke qonuni",
      steps: [
        "1️⃣ Og'irlik qo'ysangiz — prujina cho'ziladi.",
        "2️⃣ F = k·x — kattalik qancha ko'p bo'lsa, cho'zilish shuncha ko'p. Bu HOOKE qonuni!",
      ],
      realLife: "🚗 Avtomobil amortizatori (porlashni yumshatadi), tarozi, soat mexanizmi, ruchka prujinasi, lift xavfsizlik mexanizmi — hammasi Hooke qonuni bilan ishlaydi.",
    },
    {
      icon: "📡",
      title: "Yorug'lik va energiya — qayerda uchraydi?",
      steps: [
        "1️⃣ Yorug'lik nuri linzadan o'tganda yo'nalishini O'ZGARTIRADI (sinish).",
        "2️⃣ Quyosh energiyasi → elektr stansiyalar → uyingizdagi chiroq — energiya bir shakldan ikkinchisiga o'tadi!",
      ],
      realLife: "☀️ Quyosh panellari (quyosh → elektr), 📷 fotoaparat (yorug'lik → rasm), 🌈 kamalak (yorug'lik → ranglar) — tabiatdagi optika hodisalari.",
    },
  ],
};

// ============================== 🧪 KIMYO ==============================
export const GUIDE_CHEMISTRY: GuideData = {
  title: "🧪 Kimyo laboratoriyasi — yoriqnoma",
  subtitle: "Moddalar aralashadi, reaksiyalar sodir bo'ladi — haqiqiy kimyoviy qonunlar bilan",
  sections: [
    {
      icon: "➕",
      title: "Modda qo'shish (stolga shisha tushadi)",
      steps: [
        "1️⃣ '＋ Qo'shish' → reaktiv yoki element tanlang.",
        "2️⃣ Shisha ish stolining O'ZIGA tushadi (yo'qolib ketmaydi!).",
        "3️⃣ Shishani bosing — nomi va formulasida nimaligi chiqadi.",
      ],
      realLife: "🏥 Shifoxona laboratoriyasida ham shishalar javonda turadi, tajriba qiluvchi olib, ish stoliga qo'yadi. Oshxonada tuz, sirka, soda shishalari ham xuddi shunday!",
      tip: "🖐 Shishani BARMOG'INGIZ bilan sudrab yurishingiz mumkin — u qo'lingizga yopishib boradi.",
    },
    {
      icon: "🫗",
      title: "Quyish (idishga YAQIN keltiring!)",
      steps: [
        "1️⃣ Shishani ushlang va idish (stakan/probirka) YONIGA olib boring.",
        "2️⃣ '🫗 Quyish' tugmasi chiqadi — bosing!",
        "3️⃣ Og'iz ochiladi, suyuqlik oqadi, qopqoq yopiladi — hammasi animatsiya bilan.",
      ],
      realLife: "🩺 Hamshira tomchi tushirganda, oshpov suv quyayotganda — hammasi shu harakat: idishni yaqinlashtir, og'izdan quy. Laboratoriyada 'to'kib yubormaslik' uchun aynan shunday qilinadi!",
    },
    {
      icon: "🥄",
      title: "Aralashtirish va reaksiya",
      steps: [
        "1️⃣ Ikkita moddani bitta idishga quying.",
        "2️⃣ '🥄 Aralashtirish' ni bosing — reaksiya sodir bo'ladi va PASTDA TENGLAMA chiqadi!",
        "3️⃣ Rang o'zgarishi, gaz ajralishi yoki issiqlik — hammasi real kimyoviy hodisalar.",
      ],
      realLife: "🫧 Sirka + osh sodasi = gazajralishi (pishiriq ko'tariladi!). Tuz + suv = eritma (dengiz suvi!). Shifokorlar dorini aynan shunday aralashtirib, bemorga beradi.",
    },
    {
      icon: "⚡",
      title: "Sintez reaksiyalari (modda hosil bo'ladi)",
      steps: [
        "1️⃣ Na + Cl quyinglar → 'Na + Cl → NaCl' (oshxona tuzi!) chiqadi.",
        "2️⃣ H + Cl → HCl, H + O → H₂O — elementlar juftlashib, YANGI modda hosil bo'ladi.",
      ],
      realLife: "🧂 Siz har kuni yeydigan tuz — aynan Na va Cl sintezi! Suv — H va O sintezi. Zavodlarda o'g'it, dori, plastmassa ham SHU reaksiyalar bilan olinadi.",
    },
    {
      icon: "🧪",
      title: "Neytrallash va metall + kislota",
      steps: [
        "1️⃣ Kislota + ishqor = tuz + suv (neytrallash) — tenglama chiqadi.",
        "2️⃣ Metall (Zn/Mg/Fe) + kislota → tuz + VODOROD GAZI (H₂) — pufakchalar ko'rasiz!",
      ],
      realLife: "💊 Osh sodasi yurak achishida kislota'ni zararsizlantiradi (neytrallash!). Avtomobil akkumulyatorida rux va kislota ishlaydi. Og'riq qoldiruvchi aspirin ham kislota asosida tayyorlanadi.",
    },
    {
      icon: "🌡",
      title: "Harorat va issiqlik",
      steps: [
        "1️⃣ Idishni tanlab — haroratni ko'taring/pasaytiring.",
        "2️⃣ Ba'zi moddalar qiziganda eriydi, soviganda kristallanadi — hammasi real!",
      ],
      realLife: "🍫 Shokolad quyqanda eriydi, muzlatgichda qotadi. Tuz qishda muzni eritadi (shu uchun yo'lga tuz sepiladi!).",
    },
    {
      icon: "🧮",
      title: "Titrlash (HCl + NaOH → NaCl + H₂O) — real laboratoriya!",
      steps: [
        "1️⃣ Ko'zoynak va qo'lqop kiying — xavfsizlik birinchi!",
        "2️⃣ Kolbaga 10 ml HCl quying, 2 tomchi FENOLFTALEIN qo'shing (eritma RANGSIZ, pH < 8.2).",
        "3️⃣ Buretkadan NaOH ni TOMCHILAB quying — har tomchi bilan pH KO'TARILADI.",
        "4️⃣ pH = 8.2 ga yetganda eritma OCH PUSHTI bo'ladi 💗 — shu lahza NEYTRALLANISH nuqtasi!",
        "5️⃣ ORTIQCHA quyilsa — TO'Q PUSHTI (Over-titrated) va tajriba buziladi ⚠️.",
        "6️⃣ Natija tenglamasi: HCl + NaOH → NaCl + H₂O (oshxona tuzi + suv!).",
      ],
      realLife: "🏥 Shifoxona laboratoriyasida ham dorini aynan titrlash bilan o'lchashadi. Oshxonada sirka + osh sodasi — uy titrlashining o'zi! Sanoatda kimyo zavodlari har kuni minglab titrlash o'tkazadi.",
    },
    {
      icon: "⚠️",
      title: "Xavfsizlik (haqiqiy laboratoriya qoidalari)",
      steps: [
        "1️⃣ Kislota teriga tushsa — darhol SOVUQ SUV bilan yuviladi.",
        "2️⃣ Idishni og'zidan ushlab ko'taring — o'rtasidan emas!",
        "3️⃣ Reaktivni hech qachon tatib ko'rmang (hatto laboratoriyada ham!).",
      ],
      realLife: "🧪 Har bir laboratoriyaning devorida xavfsizlik qoidasi osilib turadi — shifoxona, zavod, maktab laboratoriyasi — hammasida bir xil.",
    },
  ],
};

// ============================== 🧫 BIOLOGIYA ==============================
export const GUIDE_BIOLOGY: GuideData = {
  title: "🧫 Biologiya laboratoriyasi — yoriqnoma",
  subtitle: "Namuna tayyorlashdan mikroskopda ko'rishgacha — shifoxona laboratoriyaning aynan o'zi!",
  sections: [
    {
      icon: "🔬",
      title: "Umumiy oqim (6 bosqich)",
      steps: [
        "1️⃣ 🧫 Namuna tanlanadi → ish stoliga TUSHADI. Stolda: oynachalar, pipetka, yod, pinset, skalpel, filtr qog'oz.",
        "2️⃣ TO'G'RI anjomni yaqin keltiring: qattiq namuna → 🔪 skalpel (pinset bilan parda ajratiladi); qon → 🩸 surtma; yog'/suyuqlik/shilliq → 💧 PIPETKA.",
        "3️⃣ 💧 Pipetka 1 tomchi SUV tomizadi → namuna yoyiladi → 🩣 1 tomchi YOD (yadrolar ko'rinadi!).",
        "4️⃣ 🪟 Yopqich shisha 45° burchakda SEKIN tushiriladi (havo pufakchasi bo'lmasin!).",
        "5️⃣ 🔬 MIKROSKOP: ob'yektivlar 4×/10×/40×/100×, Makrovint/Mikrovint (fokus), Diyafragma (yorug'lik), stolcha X/Y.",
        "6️⃣ ×100 da '🧬 Hujayra ichiga kirish' — kamera hujayra ichiga o'tadi: yadro, mitoxondriya, xloroplastlar!",
      ],
      realLife: "🏥 Shifoxona laboratoriyaning budkasida bemordan qon olinadi, namuna tayyorlanadi, bo'yovchi bilan bo'yaladi va mikroskopda ko'riladi — DIAGNOZ aynan shu bosqichlarda qo'yiladi!",
    },
    {
      icon: "🔪",
      title: "Anjomlar va ularning real hayotdagi o'rni",
      steps: [
        "🔪 Skalpel (pichoqcha) — namunani maydalash. Jarroh operatsiyada ham xuddi shunday ishlatadi.",
        "💧 Pipetka — suyuqlik tomchisi olish. Shifokor vaktsina quyishda ham pipetka oladi.",
        "🤏 Pinset — mayda narsani ushlab olish. Laborant shisha preparatni pinset bilan ushlaydi.",
        "🩹 Surtma tayoqchasi — qon surtmasini yoyish. Qon tahlilida birinchi qadam!",
        "🪟 Yopqich shisha — namunani yopish (havo pufakchasi tushmasin uchun).",
        "💧 Bo'yovchi — hujayrani ko'rinadigan qilish. Saraton hujayrasini bo'yovchisiz KO'RIB bo'lmaydi!",
      ],
      realLife: "👩‍🔬 Bu anjomlar har bir tibbiy laboratoriyaning stolida turadi — Toshkentdagi har qanday klinikani budkasida xuddi shu to'plamni ko'rasiz.",
    },
    {
      icon: "👁",
      title: "Mikroskopni sozlash (fokus, yorug'lik, kattalashtirish)",
      steps: [
        "1️⃣ 🔍 ×40 (kam kattalashtirish) → ×100 → ×400 (eng ko'p).",
        "2️⃣ 🎯 Fokus — rasmni qirrali qiladi (xuddi ko'z uchun fokus).",
        "3️⃣ 💡 Yorug'lik — pastdan tushuvchi nurni sozlaydi.",
      ],
      realLife: "🔬 Patolog (shifokor) ham mikroskopni aynan shunday sozlaydi: avval kattalikni pastdan, keyin fokusni. O'pka saratonini tashxislashda shu bosqich hal qiluvchi!",
    },
    {
      icon: "🧫",
      title: "Namunalar va ular real hayotda nimaga kerak",
      steps: [
        "🧅 Piyaz hujayrasi — o'simlik hujayrasi tuzilishini o'rganish (maktab darsining klassik tajribasi).",
        "👄 Tili epiteliysi — o'z tanangizdan namuna! (Tibbiyotda — DNK tahlili shunday olinadi.)",
        "🩸 Qon surtmasi — bezgak, temir tanqisligi, leykozni SHU surtma orqali aniqlashadi.",
        "💪 Mushak tolasi — sport tibbiyoti, travmatologiya.",
        "🌱 Ildiz uchi — o'simlik hujayralari BO'LINISHINI (mitoz) kuzatish.",
        "🧠 Asab hujayrasi — nevrologiya, insult sabablarini o'rganish.",
        "🦴 Suyak — travmatologiya, osteoporoz tashxisi.",
        "🧈 Yog' — ortiqcha vazn, metabolizm kasalliklari.",
        "🍄 Qo'ziqorin — teri kasalliklari (mikozi) tashxisi.",
        "🦠 Bakteriyalar — antibiotik TO'G'RI tanlash (bakteriyaga qaysi dori ta'sir qilishini sinashadi).",
      ],
      realLife: "🏥 COVID-19 ni ham birinchi mikroskop (elektron mikroskop) orqali ko'rishgan! Siz ko'rayotgan har bir hujayra — biologlar, shifokorlar va olimlar uchun ish kundaligi.",
    },
    {
      icon: "🏭",
      title: "Hujayra tuzilishi — ichidagi 'fabrikalar'",
      steps: [
        "🧬 Yadro — DNA saqlaydi (barcha ma'lumot SHU yerda!).",
        "⚡ Mitoxondriya — energiya ishlab chiqaradi ('hujayra elektr stansiyasi').",
        "🔵 Ribosoma — oqsil (go'sht, tuxum oqi) tayyorlaydi.",
        "🟢 Xloroplast — o'simlikda FOTOSINTEZ (quyosh → ozuqa).",
        "🧫 Yarim o'tkazuvchi membrana — kirish-chiqishni nazorat qiladi.",
      ],
      realLife: "🧬 DNK ekspertizasi (jinoyatni aniqlash), nasl-nasab testi, o'simliklar kislorod chiqarishi — hammasi shu organoidlar ishi! Siz nafas olayotganingizda mitoxondriyangiz ENERGIYA ishlab turibdi.",
    },
    {
      icon: "🧬",
      title: "Mitoz — hujayra bo'linishi",
      steps: [
        "1️⃣ Bosqichlarni bosing: Profaza → Metafaza → Anafaza → Telofaza.",
        "2️⃣ Xromosomalar ko'rinadi, markazga teriladi, ikkiga AJRALADI va 2 ta YANGI hujayra hosil bo'ladi!",
      ],
      realLife: "🩹 Jarohat bitganda, 💇 soch-tirnoq o'sganda, 🤕 organizm o'sganda — hammasi MITOZ. Agar mitoz NORMADAN TEZ ketsa — bu SARATON (o'sma)! Shifokorlar aynan mitoz tezligiga qarab tashxis qo'yadi.",
    },
    {
      icon: "🔀",
      title: "Meyoz — nasl-nasab uchun bo'linish",
      steps: [
        "1️⃣ Meyozda hujayra IKKI MARTA bo'linadi → 4 ta YARIM to'liq hujayra.",
        "2️⃣ Xromosomalar ARALASHADI — har bir hujayra NOYOB bo'ladi.",
      ],
      realLife: "👨‍👩‍👧 Siz ota-onangizga o'xshaysiz, lekin bir xil EMASSIZ — sababi meyozda xromosomalar aralashadi! Tuxum hujayra va spermatozoid meyoz bilan hosil bo'ladi. Zotdor qoramol, gullarni tanlashda ham meyoz bilan ishlaydilar.",
    },
    {
      icon: "✂️",
      title: "Kesilgan namuna bilan nima qilish kerak?",
      steps: [
        "1️⃣ Kesishdan keyin ✂️ KESILGAN MITTI NAMUNA paydo bo'ladi — uni USHLAB suring!",
        "2️⃣ Uni 🧫 PREPARAT OYNACHASI oldiga olib boring.",
        "3️⃣ 'Kesilgan namunani oynachaga qo'yish' tugmasi chiqadi → bosiladi.",
        "4️⃣ Endi oynacha mikroskopga → 👁 Ko'rish!",
      ],
      realLife: "🩺 Jarroh biopsiya (namuna) olganda — laborant uni aynan shunday shisha oynacha ustiga qo'yadi va patolog tekshiradi. Sarxon tashxisi shu 'kesilgan namuna' bilan qo'yiladi!",
    },
  ],
};

// ============================== 📖 PANEL ==============================
export function GuidePanel({ guide, onClose }: { guide: GuideData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/55" />
      <div
        className="relative max-h-[86%] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 -mx-1 mb-2 flex items-start justify-between gap-2 rounded-2xl bg-white/95 px-1 pb-2 pt-1 backdrop-blur">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900">{guide.title}</p>
            <p className="text-xs text-slate-500">{guide.subtitle}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700 active:scale-95">
            ✕
          </button>
        </div>
        <div className="space-y-2.5">
          {guide.sections.map((sec) => (
            <div key={sec.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">
                {sec.icon} {sec.title}
              </p>
              <ul className="mt-1.5 space-y-1">
                {sec.steps.map((st, i) => (
                  <li key={i} className="text-[12.5px] leading-relaxed text-slate-700">
                    {st}
                  </li>
                ))}
              </ul>
              <div className="mt-2 rounded-xl bg-emerald-50 p-2">
                <p className="text-[12px] leading-relaxed text-emerald-900">
                  <b>🌍 Real hayotda:</b> {sec.realLife}
                </p>
              </div>
              {sec.tip && (
                <div className="mt-1.5 rounded-xl bg-amber-50 p-2">
                  <p className="text-[12px] leading-relaxed text-amber-900">
                    <b>💡 Maslahat:</b> {sec.tip}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-3 w-full rounded-2xl bg-teal-700 py-2.5 text-sm font-bold text-white active:scale-[0.98]">
          ✕ Yopish
        </button>
      </div>
    </div>
  );
}

export function GuideButton({ guide }: { guide: GuideData }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white shadow-md active:scale-95"
        title="Ishlatish yoriqnomasi"
      >
        📖 Yoriqnoma
      </button>
      {open && <GuidePanel guide={guide} onClose={() => setOpen(false)} />}
    </>
  );
}
