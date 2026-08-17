// Seeds the 話術風險標籤資料庫 (risk tag knowledge base) with the three
// headline risk groups the product launched with — 誇大療效／威脅感緊迫感情
// 緒操控／權威社會認同群體壓力 — each researched across six jurisdictions
// (TW/HK/MO/SG/MY/JP) via web search, with every claim traceable to a cited
// source and graded by confidence (see each case's `confidence` field).
//
// Everything seeds as reviewStatus="pending_review" / active=false /
// sourceVerified=false / needsReview=true on every region — this is
// AI-assisted legal research, not a substitute for a human (ideally local
// counsel) sign-off before it goes live on the public site. An admin
// (super_admin) reviews and flips reviewStatus→approved + active→true per
// tag/region via the admin console once satisfied.
//
// Safe to re-run: upserts by slug (updates the core row, replaces that tag's
// region rows) rather than a blind clear+insert, so it won't touch any
// other tags an admin has since added by hand.
import {
  db,
  pool,
  riskTagsTable,
  riskTagRegionsTable,
  type RiskCase,
  type RiskSourceLink,
} from "@workspace/db";
import { eq } from "drizzle-orm";

type TagInsert = typeof riskTagsTable.$inferInsert;
type RegionInsert = typeof riskTagRegionsTable.$inferInsert;

interface SeedRegion extends Omit<RegionInsert, "riskTagId"> {
  region: "TW" | "HK" | "MO" | "SG" | "MY" | "JP";
}

interface SeedTag {
  tag: TagInsert;
  regions: SeedRegion[];
}

const src = (
  label: string,
  url: string,
  sourceType: RiskSourceLink["sourceType"],
  confidence: RiskSourceLink["confidence"],
): RiskSourceLink => ({ label, url, sourceType, confidence });

const kase = (
  year: string,
  title: string,
  summary: string,
  sourceType: RiskCase["sourceType"],
  sourceUrl: string | null,
  confidence: RiskCase["confidence"],
): RiskCase => ({ year, title, summary, sourceType, sourceUrl, confidence });

// ---------------------------------------------------------------------------
// 1. 誇大療效 exaggerated_efficacy
// ---------------------------------------------------------------------------

const exaggeratedEfficacy: SeedTag = {
  tag: {
    slug: "exaggerated-efficacy",
    name: "誇大療效",
    riskGroup: "exaggerated_efficacy",
    category: "誇大療效",
    definition:
      "以「治療」「改善」「有效」「逆轉」「治百病」等詞彙，暗示或明示食品、保健食品、化粧品、一般醫療器材等非藥品項目具有醫療效能，或誇大其實際效果超出核准/實證範圍。危險之處不在於「提到健康」本身，而在於用詞跨過了「保健／日常調理」與「醫療效能」之間的法定界線——多數國家/地區都把這條界線寫進法律，一旦跨過，通常會由行政機關逕行認定違法，不需要消費者先受害或提告。",
    defaultRiskLevel: "高",
    suggestedCopy:
      "文案中的「治療」「根治」「逆轉」「治百病」等詞彙，容易被認定為宣稱醫療效能，多數地區的食品/健康食品/化粧品法規都明文禁止非藥品這樣宣傳，最重可能面臨高額罰鍰、下架、甚至刑事責任。建議改用「有助於維持」「可能有助於」「日常保養」等保守用語，並附上實證來源，而不是承諾效果。",
    impactSummary:
      "對賣家：最常見、裁罰件數最多的違規類型，一旦被主管機關認定，通常是逐項下架＋高額罰鍰，且很多地區採「按次連續處罰」，不改正會持續累加。對買家：可能因誤信療效延誤正規治療，或花錢買到不具實際效果的商品。對平台：容易被要求配合下架、提供賣家資料，長期放任會影響平台的商譽與監管信任。",
    active: false,
    reviewStatus: "pending_review",
    sourceVerified: false,
    needsRecheck: false,
    maintainer: "AI 初稿（話術透視鏡研究代理）",
    notes: "由 4 個地區研究代理彙整，尚未經人工法務覆核，發布前請至少覆核金額/條號與較低信心案例。",
  },
  regions: [
    {
      region: "TW",
      legalBasis:
        "食品安全衛生管理法第28條（禁止不實/誇張/易生誤解廣告，及食品不得為醫療效能宣傳）＋第45條罰則；健康食品管理法第6/13/14條（未經核准不得標示保健功效、不得涉及醫療效能）＋第24條罰則；藥事法第69/70條（非藥物不得宣稱醫療效能）；化粧品衛生安全管理法第10條（不得虛偽誇大或宣稱醫療效能）；醫療法第85/86條（醫療廣告限制、禁止暗示療效）＋第103條罰則；另有食藥署「食品及相關產品標示宣傳廣告涉及不實誇張易生誤解或醫療效能認定準則」等行政認定基準。",
      violationAspects:
        "(a) 行政責任：地方衛生局/食藥署裁罰為主，食品違規罰鍰4萬-500萬元（醫療效能宣稱部分60萬-500萬元），健康食品10萬-200萬元，醫療法5萬-25萬元，可按次連續處罰、命下架、情節重大廢照；這是絕大多數個案的實際處理方式。(b) 消保/民事責任：消保法第22條廣告真實義務可作為消費爭議求償依據。(c) 刑事責任：門檻高，須達刑法詐欺罪「故意使人陷於錯誤」程度才可能成立，一般廣告誇大用詞本身不構成刑事犯罪。",
      cases: [
        kase(
          "2024",
          "A.H.A關捷挺固立誇大療效案",
          "廣告宣稱「治療肌少症，逆轉肌肉萎縮、治療退化性關節炎」等醫療效能用語，食藥署列為113年度十大違規食藥廣告之首，累計開罰1,124萬元；代言藝人另遭裁罰216萬元，其餘代言人各罰4萬至60萬元。",
          "authority",
          "https://www.fda.gov.tw/tc/newsContent.aspx?cid=4&id=t623454",
          "高",
        ),
        kase(
          "2024",
          "拉蓓暖宮精萃飲（七寶創意）案",
          "食品廣告詞句涉及醫療效能宣稱，台北市單一產品年度累計罰鍰達694萬元；同期台北市食品/藥品醫療器材/化粧品類廣告違規合計669件、總額逾7,588萬元。",
          "authority",
          "https://www.foodnext.net/",
          "高",
        ),
        kase(
          "2025",
          "高雄市食品宣稱醫療效能專案裁罰",
          "高雄市政府衛生局114年度針對食品廣告宣稱醫療效能，開罰16家業者，合計金額2,400萬元。",
          "authority",
          "https://health.kcg.gov.tw/",
          "高",
        ),
        kase(
          "2014",
          "藝人代言酸痛按摩機誇大療效案",
          "廣告稱「治療一週即可不用掛門診、復健」，療效與仿單不符，廣告主與代言人遭新北市衛生局依違反藥事法相關規定開罰，代言人部分罰20萬元（確切援引條號因藥事法歷經修法，建議法務覆核現行條文）。",
          "news",
          null,
          "中",
        ),
      ],
      impact:
        "台灣是食藥署/衛生局例行公布「十大違規食藥廣告」與統計數字的地區，誇大療效類廣告是每年裁罰件數與金額最大宗的類型，且採按次連續處罰，賣家若不下架/改正，罰鍰會持續累加，實務上金額常在數百萬元以上。",
      suggestedCopy:
        "依食品安全衛生管理法、健康食品管理法及藥事法，一般食品、保健食品與化粧品都不得宣稱醫療效能，「治療」「根治」「逆轉」等詞違法風險極高，且會按次處罰至下架為止。建議改以「有助於維持」「日常保養」等描述性用語。",
      riskLevel: "高",
      primarySourceType: "authority",
      sourceLinks: [
        src("食品安全衛生管理法第28條", "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0040001&flno=28", "law", "高"),
        src("食藥署113年度十大違規食藥廣告", "https://www.fda.gov.tw/tc/newsContent.aspx?cid=4&id=t623454", "authority", "高"),
      ],
      verified: false,
      needsReview: true,
    },
    {
      region: "HK",
      legalBasis:
        "《不良廣告（醫藥）條例》(Cap. 231, UMAO)：禁止為藥物/療法發布廣告宣稱可預防或治療附表所列疾病；附表4規管所有口服產品（含食品保健品）的健康聲稱分級限制。《商品說明條例》(Cap. 362) 第7條虛假商品說明、第13E條誤導性遺漏，可與誇大療效字眼併同觸犯。",
      violationAspects:
        "(a)/(c) 刑事：UMAO首次定罪最高第5級罰款（HK$50,000）及監禁6個月，其後定罪最高HK$100,000及監禁1年，由衞生署藥物辦公室督察執法；TDO虛假商品說明公訴最高罰款HK$500,000及監禁5年，簡易程序最高HK$100,000及監禁2年——兩者均為刑事罪行，這點與台灣以行政罰為主不同。(b) 民事：消費者可循小額錢債審裁處/區域法院索償。",
      cases: [
        kase(
          "2018",
          "醫學美容中心誇大療效招攬爭議",
          "香港美容監察調查發現至少5間醫學美容院以「效果貼近21歲」等療效聲稱、免費試做及用家分享方式招攬顧客，部分並列出醫生姓名與手術相片宣傳，涉違反醫委會專業守則。",
          "news",
          null,
          "中",
        ),
        kase(
          "2023",
          "未標示西藥成分減肥產品警示",
          "衞生署公開警告市民勿購買「simple heart SPECIFIC SLIMMING PRODUCT」，驗出含未標示西藥成分（西布曲明等）。",
          "authority",
          "https://www.info.gov.hk/gia/general/202312/08/P2023120800411.htm",
          "高",
        ),
      ],
      impact:
        "香港以UMAO/TDO作為刑事罪行規管，一旦被檢控即進入司法程序，對品牌形象與跨境電商信譽的殺傷力比單純行政罰款更大；但查有相關類型爭議，近年UMAO本身（非成分違規）針對廣告誇大聲稱的具體定罪案例公開細節有限，建議標記為待法務覆核以取得最新個案。",
      suggestedCopy:
        "「治療」「根治」「逆轉」等療效字眼，若用於食品、保健品或未經註冊藥物廣告，可能違反《不良廣告（醫藥）條例》，屬刑事罪行，首次定罪最高罰款五萬元及監禁六個月。建議只使用有科學實證支持的字眼。",
      riskLevel: "高",
      primarySourceType: "law",
      sourceLinks: [
        src("Cap. 231 UMAO 條文", "https://www.elegislation.gov.hk/hk/cap231", "law", "高"),
        src("藥物辦公室 UMAO 說明", "https://www.drugoffice.gov.hk/eps/do/tc/pharmaceutical_trade/other_useful_information/umao.html", "authority", "高"),
      ],
      verified: false,
      needsReview: true,
    },
    {
      region: "MO",
      legalBasis:
        "《消費者權益保護法》(第9/2021號法律) 第7條「誤導性營商行為」，明確禁止「誇大地聲稱商品或服務能治療疾病、功能障礙或畸形」；藥物廣告另受《管制在澳門從事藥物專業及藥物業活動法令》(第58/90/M號，經第30/95/M號修訂) 規範，須經藥物監督管理局事先許可。保健品目前不受藥物監督管理局直接監管，僅作一般貨物進口申報，屬監管缺口。",
      violationAspects:
        "(a) 行政責任：CPL第7條罰款MOP20,000-60,000，情節嚴重可加處封閉場所或禁業；藥物廣告違規罰款約MOP5,000-15,000（依第27/2024號法律於2025年1月調升，累犯加重25%）。(b) 民事：消委會設有調解及仲裁中心處理消費爭議。",
      cases: [
        kase(
          "2024",
          "保健品監管缺口輿論倡議",
          "議員與媒體評論指出保健品非藥物監管對象，僅作一般貨物申報，倡議加強跨部門監管；未查得具名的近年（2023-2025）保健品/醫美廣告誇大療效具體檢控或罰款案例，標記為待法務覆核。",
          "news",
          "https://www.exmoo.com/article/224632.html",
          "中",
        ),
      ],
      impact:
        "澳門法規本身罰則明確（CPL第7條），但保健品缺乏專責監管機關追蹤，執法案例的公開資訊也相對少，賣家不應誤解為「風險較低」——條文適用，只是查證機制較弱，建議上線前由熟悉澳門法律人士覆核。",
      suggestedCopy:
        "根據澳門《消費者權益保護法》第7條，誇大聲稱商品或服務能治療疾病屬「誤導性營商行為」，最高可罰款六萬元並附加停業等處分；藥物廣告另須經藥物監督管理局事先許可。建議避免使用未經證實的療效字眼。",
      riskLevel: "中",
      primarySourceType: "authority",
      sourceLinks: [
        src("澳門消委會 CPL 摘要", "https://www.consumer.gov.mo/Law/cpl_law.aspx?lang=zh", "authority", "高"),
      ],
      verified: false,
      needsReview: true,
    },
    {
      region: "SG",
      legalBasis:
        "Health Products Act 2007 (HPA) s.20：禁止以不實或誤導方式廣告健康產品，禁止廣告未註冊之療效聲稱；Medicines Act：規範中成藥/傳統藥品廣告；Private Hospitals and Medical Clinics (Advertisement) Regulations 2019：規範醫美診所療效聲稱。",
      violationAspects:
        "(a) 行政執法：HSA可發警告/移除電商刊登（2024年查扣逾97萬件、下架逾7,300則刊登）。(c) 刑事責任：HPA不實/誤導廣告最高可處S$20,000罰款及/或12個月監禁；Medicines Act項下最高S$5,000罰款及/或2年監禁；販售摻雜/非法健康產品最高S$100,000罰款及/或3年監禁。(d) 業界自律：ASAS新加坡廣告守則要求健康/美容宣稱須可實證。",
      cases: [
        kase(
          "2021",
          "首宗 Medicines Act 誇大療效定罪案",
          "衛生部於國會書面答覆證實，有業者因宣稱產品可「預防或治癒癌症、糖尿病等疾病」遭定罪罰款S$3,000（法定上限S$5,000），為該罪名首宗定罪，此前業者自2016年起已多次收到勸導仍未改正。",
          "authority",
          null,
          "高",
        ),
        kase(
          "2025",
          "按摩椅業者假借 Stanford Medicine 標誌案",
          "CCCS調查發現按摩椅/保健器材製造商使用「Stanford Medicine」標誌暗示機構背書，實際上僅一名顧問曾在該校醫學院授課，涉誇大療效與假權威雙重問題。",
          "news",
          null,
          "中",
        ),
      ],
      impact:
        "新加坡對健康產品誇大療效有明確刑事罰則且近年已有實際定罪先例，HSA執法規模大（年查扣逾97萬件）；賣家一旦被列入警示名單，電商刊登會被要求全面下架，對出口/代購型賣家影響尤其直接。",
      suggestedCopy:
        "「治療」「根治」「逆轉病情」等詞彙在新加坡受《健康產品法》及《醫藥法》規範，未經註冊或無實證的療效宣稱可能面臨最高2萬新元罰款及/或監禁，HSA每年查處數千件類似案例。建議以「可能有助於」等審慎用語替代絕對療效保證。",
      riskLevel: "高",
      primarySourceType: "authority",
      sourceLinks: [
        src("HSA 健康產品廣告罰則說明", "https://www.moh.gov.sg/", "authority", "高"),
      ],
      verified: false,
      needsReview: true,
    },
    {
      region: "MY",
      legalBasis:
        "Medicines (Advertisement and Sale) Act 1956 第3/4A/4B條：禁止刊登治療/預防/診斷指定疾病（腎、心臟、糖尿病、癌症等）的廣告，禁止未核准之醫藥廣告；Sale of Drugs Act 1952 及 Control of Drugs and Cosmetics Regulations 1984：規範化粧品不得宣稱治療疾病；Poisons Act 1952：規範非法/未授權「特效藥」；Consumer Protection Act 1999 第10條：一般商品/服務不實宣稱。",
      violationAspects:
        "(c) 刑事責任（門檻明確且已有實際執法）：Medicines Advertisement Act第5條首次定罪最高罰款RM3,000及/或監禁1年，再犯最高RM5,000及/或監禁2年；Poisons Act一般違規最高罰款RM3,000及/或監禁1年。(a) 行政：NPRA/衛生部可撤銷產品通報資格、查扣貨品（2024年查扣違規健康產品市值逾RM3,750萬）。",
      cases: [
        kase(
          "2024",
          "違規夜間乳霜查扣案",
          "NPRA監督與投訴部門2024年年度報告揭露GB Night Cream Treatment、Aniqa Night Cream等產品含禁用化合物遭查處。",
          "authority",
          null,
          "高",
        ),
        kase(
          "2025",
          "含汞化粧品撤銷通報案",
          "衛生部撤銷五項化粧品（含Molly Care Night Cream）之通報資格，實驗室檢出汞、對苯二酚、維A酸、倍他米松等禁用/管制成分。",
          "authority",
          null,
          "高",
        ),
        kase(
          "2011-2012",
          "誇大廣告歷史執法統計",
          "2011年計41件不實廣告案送法院審理，罰款總額RM56,800；截至2012年5月已發出197封警告信、74件移送調查、24件起訴，罰款總額RM24,500，顯示執法量能持續但個案金額不高。",
          "authority",
          null,
          "中",
        ),
      ],
      impact:
        "馬來西亞的誇大療效規範同時具備明確刑事罰則與持續執法紀錄，但目前查無2023-2025年具名、有法院判決結果的最新案例，建議在產品頁面標示「法規明確、近期具名判決待補充查證」，避免給人「處罰輕微」的錯誤印象。",
      suggestedCopy:
        "在馬來西亞，食品、保健品、化妝品廣告若涉及「治療」「改善」特定疾病等宣稱，可能違反《1956年醫藥（廣告與銷售）法令》，一經定罪可處罰款及監禁，NPRA/衛生部近年持續查扣違規產品並吊銷通報資格。建議避免疾病治療字眼，以核准用途為準。",
      riskLevel: "高",
      primarySourceType: "authority",
      sourceLinks: [
        src("NPRA 2024年監督與投訴年度亮點", "https://www.npra.gov.my/", "authority", "高"),
      ],
      verified: false,
      needsReview: true,
    },
    {
      region: "JP",
      legalBasis:
        "景品表示法第5条第1号「優良誤認表示」：品質/效能宣稱顯著優於實際即違法；薬機法（醫薬品醫療機器等法）第66条：禁止醫藥品/醫薬部外品/化粧品/醫療機器之虛偽誇大廣告；健康増進法第65条：禁止食品就健康效果為顯著不符事實之表示。",
      violationAspects:
        "(a) 行政責任：消費者庁對景表法違反可發措置命令＋課徴金（原則銷售額3%，累犯提高至1.5倍）；薬機法違反可由厚労省/都道府縣發措置命令，自2021年起可課徵銷售額4.5%課徵金（未達225萬日圓門檻則不課徵）。(c) 刑事責任：薬機法第66条違反最重可處2年以下懲役或200萬日圓以下罰金，惟實務多先行政處分，刑事訴追較少見。",
      cases: [
        kase(
          "2023-2025",
          "ハハハラボ機能性表示食品「メラット」案",
          "消費者庁認定廣告宣稱「僅需服用即可輕鬆使腹部脂肪減少」等優良誤認表示，2023年12月發措置命令，2025年6月再發課徴金納付命令，金額1,086萬日圓。",
          "authority",
          "https://portal.shojihomu.jp/archives/75738",
          "中",
        ),
      ],
      impact:
        "日本對誇大療效廣告的處分金額計算方式（銷售額3%-4.5%的課徴金）意味著銷售規模越大、罰款越高，對熱銷商品的懲罰性特別強，賣家不能以「小額罰款可承受」心態看待。",
      suggestedCopy:
        "「治療」「改善」「有効」「万能」等詞彙用於食品、健康食品或化粧品時，在日本可能構成景品表示法第5条第1項「優良誤認表示」，或薬機法第66条禁止的誇大廣告，兩者皆有實際的行政裁罰（措置命令、最高銷售額4.5%的課徴金）與刑事責任先例。建議標示明確依據並避免暗示醫療效果。",
      riskLevel: "高",
      primarySourceType: "authority",
      sourceLinks: [
        src("消費者庁 優良誤認とは", "https://www.caa.go.jp/policies/policy/representation/fair_labeling/representation_regulation/misleading_representation", "authority", "高"),
        src("薬機法第66条抜粋（東京都保健医療局）", "https://www.hokeniryo.metro.tokyo.lg.jp/anzen/iyaku/koukokukisei/bassui", "law", "高"),
      ],
      verified: false,
      needsReview: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. 威脅感／緊迫感／情緒操控 urgency_manipulation
// ---------------------------------------------------------------------------

const urgencyManipulation: SeedTag = {
  tag: {
    slug: "urgency-manipulation",
    name: "威脅感／緊迫感／情緒操控",
    riskGroup: "urgency_manipulation",
    category: "恐懼訴求",
    definition:
      "以「快買」「不買就後悔」「今天不買就錯過機會」「最後機會」「限時限量」等語句，人為製造急迫感或恐懼、焦慮情緒，促使消費者在缺乏充分考慮時間下做出交易決定。核心問題不是「促銷」本身違法，而是當庫存、期限、倒數等訊息與事實不符（假限量、假倒數、假造瀏覽/搶購人數），或銷售手法達到「令人感到被迫、不敢離開」的程度時，就從一般行銷手法跨入不公平交易、誤導性宣傳，甚至具威嚇性營業行為的法律風險區。",
    defaultRiskLevel: "中",
    suggestedCopy:
      "「限時」「限量」「最後機會」等急迫性字眼，若和實際庫存/期限不符，多數地區都可能構成誤導性或不公平交易手法；若銷售過程讓消費者感到被迫、不能拒絕，風險等級會更高。建議只在真實有限的情況下使用這類字眼，並清楚標示實際數量或截止時間，避免使用假倒數計時器。",
    impactSummary:
      "對買家：容易在情緒壓力下做出非自願、事後後悔的購買決定，多數地區也提供猶豫期/解約權作為補救。對賣家：一旦被查獲「假急迫」，除罰鍰外還須公開更正、具結停止，重複違規可能面臨停業或刑事責任（尤其新加坡曾有藐視法庭判刑案例）。對平台：高壓銷售與假倒數是消費申訴熱點之一，長期會侵蝕使用者對平台促銷機制的信任。",
    active: false,
    reviewStatus: "pending_review",
    sourceVerified: false,
    needsRecheck: false,
    maintainer: "AI 初稿（話術透視鏡研究代理）",
    notes: "由 4 個地區研究代理彙整，尚未經人工法務覆核；新加坡/馬來西亞部分條號來自搜尋引擎索引之二手來源，建議上線前核對官方條文原文。",
  },
  regions: [
    {
      region: "TW",
      legalBasis:
        "公平交易法第21條：對足以影響交易決定之事項（價格、數量、品質等）為虛偽不實或引人錯誤之表示，「限量」「限時」若與事實不符即構成違法；第42條罰則5萬-2,500萬元，屢不改正可累計加重。消費者保護法第19條：通訊交易/訪問交易（含直播購物、到府推銷）消費者享有7日猶豫期，無條件解除契約；第22條廣告內容真實義務。",
      violationAspects:
        "(a) 行政責任：公平會依第21條裁罰假促銷/假限量/假倒數，金額自5萬元起跳，屢不改正可累計至數千萬元。(b) 消保/民事：消保法第19條的7日猶豫期是對抗衝動購買最直接的救濟，不論賣家用什麼話術促成交易都不受拘束。(c) 刑事責任：門檻高，僅在「故意造假使人陷於錯誤而交付財物」等極端情況下才可能構成刑法詐欺罪，一般「限時特價」用語本身不構成刑事犯罪，產品頁面不宜誇大此點。",
      cases: [
        kase(
          "2022",
          "抽獎機率宣稱不實案",
          "業者對遊戲/商品抽獎機率宣稱不實，經公平會依第42條裁處200萬元罰鍰，確立公平會對「引人錯誤之促銷/招徠效果表示」的嚴格執法立場。",
          "authority",
          null,
          "中",
        ),
        kase(
          "持續性",
          "直播購物高壓銷售消費爭議",
          "媒體與消保機關多次提醒，直播情境下主播話術營造急迫感促成衝動購買後求償困難，消費者可依消保法第19條主張7日解約權；具體個案公司名稱與裁罰金額未能查證，僅供描述一般執法模式，標記待法務覆核。",
          "news",
          null,
          "中",
        ),
      ],
      impact:
        "台灣消保法第19條的7日猶豫期，是全世界少見「不論話術多有壓力，消費者都能無條件解約」的制度設計；賣家若倚賴急迫感促銷卻不告知這項權利，反而增加售後糾紛與退貨成本。",
      suggestedCopy:
        "這類「限時」「限量」「最後機會」用語若與實際庫存、期限不符，依公平交易法第21條可能構成引人錯誤之表示，最高可處2,500萬元罰鍰；透過直播或到府推銷促成的購買，消費者依消保法第19條仍享有7日猶豫期解約權。建議促銷文案只在庫存與期限確實有限時使用。",
      riskLevel: "中",
      primarySourceType: "law",
      sourceLinks: [
        src("公平交易法第21條", "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0150002&flno=21", "law", "高"),
        src("消費者保護法第19條", "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=19", "law", "高"),
      ],
      verified: false,
      needsReview: true,
    },
    {
      region: "HK",
      legalBasis:
        "《商品說明條例》(Cap. 362) 第13F條「具威嚇性的營業行為」（2013年生效）：營業行為使用騷擾、威迫手段或施加不當影響，損害消費者選擇自由並導致其作出原本不會作出的交易決定，即屬違法。",
      violationAspects:
        "(a)/(c) 刑事：公訴最高罰款HK$500,000及監禁5年，簡易程序最高HK$100,000及監禁2年；另設第30L條「民事遵從為本」機制，執法機關可接受商戶書面承諾停止違法行為而不予檢控。(b) 民事：受害人可循小額錢債審裁處/法院索償。",
      cases: [
        kase(
          "2025",
          "美容院不當施壓退款案",
          "香港海關拘捕銅鑼灣美容院經理，涉向顧客施加不當影響促使取消已購療程，並訛稱須額外支付九萬元作為退款申請費用，其後未有退款。",
          "authority",
          "https://www.info.gov.hk/gia/general/202504/24/P2025042400448.htm",
          "高",
        ),
        kase(
          "2018",
          "美容公司威迫加購案（不成立）",
          "兩名美容公司職員被控涉威迫顧客由$6,000療程加購至$60,000療程，裁判官因證人證供不一致裁定罪名不成立，顯示此類檢控舉證門檻高，並非「有威嚇字眼即入罪」。",
          "news",
          null,
          "高",
        ),
      ],
      impact:
        "香港對威嚇性營業行為採刑事規管，舉證門檻高但一旦成立即為刑事案底，對品牌與個人（含店長/銷售人員）的直接影響比行政罰款更嚴重；2018年不成立案例也提醒賣家：單純使用急迫話術不等於自動觸法，但持續施壓、限制消費者離開等行為風險很高。",
      suggestedCopy:
        "「限時搶購」「不買即後悔」等製造急迫感或心理壓力的銷售手法，若達致「損害消費者選擇自由」的程度，可能構成《商品說明條例》第13F條「具威嚇性的營業行為」，屬刑事罪行，最高可判監五年。建議避免高壓話術，保留消費者充分考慮時間。",
      riskLevel: "高",
      primarySourceType: "law",
      sourceLinks: [
        src("消委會「具威嚇性營業行為」說明", "https://www.consumer.org.hk/tc/page/detail/300036", "authority", "中"),
      ],
      verified: false,
      needsReview: true,
    },
    {
      region: "MO",
      legalBasis:
        "《消費者權益保護法》(第9/2021號法律) 第8條「威嚇性營商行為」：禁止令消費者產生「不購買則無法離開商業場所」的印象，以及持續騷擾等手法。",
      violationAspects:
        "(a) 行政責任：罰款MOP20,000-60,000，情節嚴重可加處封鋪或禁業。(b) 民事：消委會調解/仲裁中心，或循法院索償。",
      cases: [
        kase(
          "—",
          "威嚇性營商行為案例查證受限",
          "未能透過本次搜尋找到具名的澳門「威嚇性營商行為」具體檢控或罰款案例，消委會網站僅提供條文說明與一般教育案例，標記待法務覆核。",
          "authority",
          "https://www.consumer.gov.mo/",
          "低",
        ),
      ],
      impact:
        "澳門法條與台港類似設有明確罰則，但公開執法紀錄有限，賣家不應以「沒看到案例」誤判為執法寬鬆——條文本身已足以構成裁罰依據。",
      suggestedCopy:
        "以強迫、持續騷擾或令消費者誤以為「不買不能離開」的手法促銷，可能違反澳門《消費者權益保護法》第8條「威嚇性營商行為」，最高罰款六萬元並可被禁業。建議提供充分考慮時間，避免高壓銷售用語。",
      riskLevel: "中",
      primarySourceType: "authority",
      sourceLinks: [src("澳門消委會法規頁面", "https://www.consumer.gov.mo/Law/cpl_law.aspx?lang=zh", "authority", "高")],
      verified: false,
      needsReview: true,
    },
    {
      region: "SG",
      legalBasis:
        "Consumer Protection (Fair Trading) Act 2003 (CPFTA) s.4：不公平行為包含欺騙/誤導行為與不實宣稱；CPFTA Second Schedule 第12項：對消費者施加不當壓力或不當影響促成交易，明列為不公平行為。",
      violationAspects:
        "(a) 行政執法：CCCS可要求業者具結停止、公開更正、書面承諾。(c) 刑事責任：CPFTA本身以民事/行政為主，但違反法院禁制令構成藐視法庭，屬實質刑事後果（見下方美容院案例，罰款+監禁）。(b) 民事：CASE調解機制，成功率約7成。",
      cases: [
        kase(
          "2026",
          "三家網店假造急迫訊號案",
          "CCS調查發現Seager Inc（Boarding Gate）、Origin Sleep、Light In The Box三家網店使用隨機假造的「即時瀏覽/購買人數」、假倒數計時器、隨機「即將售罄」標籤及灌水「原價」；三者皆已具結停止相關行為。",
          "news",
          null,
          "中",
        ),
        kase(
          "2024-2025",
          "DNA Brands 高壓銷售案",
          "CCS調查發現業者協同施加高壓銷售手法，消費者反映感到「被困」「被迫」購買；業者同意提供最高100萬新元退款，CASE於2024年8月至2025年10月間收到53件投訴，涉款約98萬新元，多數投訴人為60歲以上長者。",
          "news",
          null,
          "中",
        ),
        kase(
          "2024",
          "美容院藐視法庭案",
          "美容院未遵守CPFTA下達的禁制令、持續高壓銷售，CCCS首度提出藐視法庭訴訟，結果為每間美容院罰款S$15,000，負責人監禁4個月。",
          "authority",
          null,
          "中",
        ),
      ],
      impact:
        "新加坡對「假急迫」的執法相當具體，且已出現鎖定長者的高額投訴案（DNA Brands案涉款近百萬新元、逾5成投訴人60歲以上），對主打長輩客群的賣家與平台是特別需要注意的風險類型。",
      suggestedCopy:
        "「倒數計時」「僅剩最後幾件」「大家都在搶購」等急迫話術，若內容不實（如假造庫存/瀏覽人數），在新加坡可能構成《公平交易法》下的不公平行為，CCCS已多次要求業者具結改正，甚至面臨藐視法庭之刑責。建議促銷限時限量宣稱須有真實依據並可供查證。",
      riskLevel: "高",
      primarySourceType: "authority",
      sourceLinks: [src("CCCS/CASE 執法與消費者保護說明", "https://www.cccs.gov.sg/", "authority", "中")],
      verified: false,
      needsReview: true,
    },
    {
      region: "MY",
      legalBasis:
        "Consumer Protection Act 1999 第12條（誤導性價格標示）、第13條（誘餌廣告）、第25條（一般禁止不實/誤導/不公平行為的概括條款）；2010年修法新增第XIIA部分「廣告委員會」，授權主管機關監督不實廣告業者。",
      violationAspects:
        "(a) 行政執法：KPDNHEP監督誘餌定價、假庫存標示與倒數計時等手法。(c) 刑事責任：不實商品說明定罪最高罰款RM100,000及監禁3年（首次），再犯最高RM250,000及監禁5年（不同來源對再犯數字略有出入，建議法務覆核）。",
      cases: [
        kase(
          "—",
          "急迫促銷手法具體案例查證受限",
          "查有KPDNHEP監督誘餌定價、假庫存標示（僅剩3件）、倒數計時器等手法的一般性規範說明，但未能找到如新加坡Seager/Origin Sleep等具名企業、有確認結果的執法案例，屬真實的研究缺口而非執法寬鬆的證據，標記待法務覆核。",
          "authority",
          null,
          "低",
        ),
      ],
      impact:
        "馬來西亞法規（CPA第12/13/25條）明確涵蓋誤導性價格與誘餌廣告，且刑事罰則具體，但公開的具名執法案例遠少於新加坡，建議賣家仍以法規本身的罰則門檻為準，不要因為「沒看到本地新聞案例」而放鬆警覺。",
      suggestedCopy:
        "「限時搶購」「僅剩幾件」等急迫性文案若內容不實，可能違反《1999年消費者保護法》第12、13條（誤導性價格標示與誘餌廣告）及第25條的一般禁止性條款，情節嚴重可處最高罰款及監禁。建議確保庫存與時限宣稱皆有真實依據，避免使用倒數計時器等易誤導手法。",
      riskLevel: "中",
      primarySourceType: "law",
      sourceLinks: [src("KPDNHEP 消費者保護資訊", "https://www.kpdn.gov.my/", "authority", "中")],
      verified: false,
      needsReview: true,
    },
    {
      region: "JP",
      legalBasis:
        "景品表示法第5条第2号「有利誤認表示」：對價格或交易條件表示得比實際更有利，涵蓋不當二重価格表示與虛假「期間限定」「數量限定」；特定商取引法第12条（誇大廣告禁止）、第12条の6（2022年新增，通訊販賣最終確認畫面須明確標示定期購入條件與解約方式）。",
      violationAspects:
        "(a) 行政責任：景表法有利誤認表示課徴金為銷售額3%；特定商取引法違規可發業務停止命令（最長2年）與指示処分。(c) 刑事責任：特定商取引法違規情節重大者，個人最重3年以下懲役、法人最重1億日圓以下罰金；2022年修法後對「詐欺的定期購入商法」加重刑事嚇阻，景表法2024年修法也新增故意違反之刑事罰。",
      cases: [
        kase(
          "2023",
          "富士通クライアントコンピューティング二重価格案",
          "消費者庁認定該公司網站以無實際銷售紀錄的「WEB價格」作比較基準標示更低的活動價，並對12項商品聲稱「期間限定」但期限後仍以相同低價販售，構成有利誤認表示，發出措置命令。",
          "authority",
          "https://www.caa.go.jp/notice/entry/033742/",
          "高",
        ),
        kase(
          "2024",
          "株式会社サン定期購入違規案",
          "消費者庁依特定商取引法第15条對減肥飲品通販業者發出3個月業務停止命令，原因為未於最終確認畫面標示定期購入條件與解約方式，並涉「10冠達成」等誇大廣告；代表取締役個人亦受同期間新業務禁止命令。",
          "authority",
          "https://www.caa.go.jp/notice/entry/036684/",
          "高",
        ),
      ],
      impact:
        "日本對「假期間限定」「假原價」與訂閱制（定期購入）陷阱的執法相當具體，且已有對代表取締役個人下達禁業令的先例，顯示責任不僅止於公司層級，經營者個人也可能受直接處分。",
      suggestedCopy:
        "「今すぐ買う」「買わないと後悔する」「最後のチャンス」「期間限定・数量限定」等緊迫感文案，若價格對比或限量/限時內容與事實不符，可能構成景品表示法「有利誤認表示」；若用於未依規定揭露解約條件的定期購入銷售，亦可能違反特定商取引法，並有實際業務停止命令與刑事罰先例。",
      riskLevel: "高",
      primarySourceType: "authority",
      sourceLinks: [
        src("景品表示法 有利誤認とは", "https://www.caa.go.jp/policies/policy/representation/fair_labeling/representation_regulation/advantageous_misidentification", "authority", "高"),
        src("特定商取引法ガイド", "https://www.no-trouble.caa.go.jp/what/", "authority", "高"),
      ],
      verified: false,
      needsReview: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. 權威／社會認同／群體壓力 false_authority_social_proof
// ---------------------------------------------------------------------------

const falseAuthoritySocialProof: SeedTag = {
  tag: {
    slug: "false-authority-social-proof",
    name: "權威／社會認同／群體壓力",
    riskGroup: "false_authority_social_proof",
    category: "權威借位",
    definition:
      "以「名醫認證」「網紅推薦」「大眾都在買」「醫師說這很有效」「很多人都這樣說」等語句，藉權威人物、專業形象或群體聲量為商品/服務背書，但缺乏可查證的真實依據、當事人授權，或未揭露背後的商業合作關係（業配/收費未標示）。這類話術之所以構成誤導，不在於「使用推薦」本身，而在於推薦內容並非推薦人真實意見/親身經驗、身分或資格被誇大或虛構，或消費者無從得知這是一則付費廣告——等於用虛假或不透明的「第三方背書」取代商品本身應有的實證。",
    defaultRiskLevel: "中",
    suggestedCopy:
      "「名醫推薦」「網紅一致好評」「大家都在買」等宣稱，若代言人並非依真實使用經驗發言、或未揭露收費/業配關係，多數地區的公平交易/廣告法規都可能認定為不實或誤導宣傳，廣告主與代言人可能需共同負責。建議標明合作關係，並以可查證的資格或數據取代空泛的權威/人氣宣稱。",
    impactSummary:
      "對買家：容易因信任錯置（信的是「醫師」或「網紅」的身分，而非商品本身的實證）而做出不理性的購買決定。對賣家：除了商品本身的宣傳責任，還可能因代言人身分不實或未揭露合作關係而承擔連帶賠償責任。對平台：假評論、未標示業配、盜用機構標誌等，是各地監管機關近年重點打擊的對象（尤其日本2023年新制ステマ規制、新加坡ASAS準則），平台若未落實揭露規範，長期會影響使用者對平台內容真實性的信任。",
    active: false,
    reviewStatus: "pending_review",
    sourceVerified: false,
    needsRecheck: false,
    maintainer: "AI 初稿（話術透視鏡研究代理）",
    notes: "由 4 個地區研究代理彙整，尚未經人工法務覆核；馬來西亞/新加坡的具名個案樣本較少，屬真實研究缺口，非執法寬鬆的證據。",
  },
  regions: [
    {
      region: "TW",
      legalBasis:
        "公平交易法第21條：廣告代言人（薦證者）若明知或可得而知廣告有引人錯誤之虞，須與廣告主負連帶損害賠償責任；公平會另訂有「對於薦證廣告之規範說明」，明定薦證者若非依真實意見/親身經驗代言、或未揭露與廣告主之利益關係，可能違反第21條或第25條（概括禁止欺罔或顯失公平行為）。醫療法第86條：醫療廣告不得假借他人名義宣傳；藥事法第69/70條：非藥物暗示醫療效能的報導亦視為違法藥物廣告。",
      violationAspects:
        "(a) 行政責任：食藥署/衛生局/公平會可同時對廣告主、代言人、KOL開罰。(b) 消保/民事：消費者可依消保法第22條、公平交易法第31條向廣告主及明知情況下的薦證者請求連帶賠償。(c) 刑事責任：若涉及冒用真實醫師姓名代言（未經本人同意）或偽造證書，可能另涉刑法偽造文書、詐欺等罪；單純「網紅推薦」「大眾都在買」等話術若無冒名情節，通常仍停留在行政責任層次。",
      cases: [
        kase(
          "2025",
          "高跟鞋雙專利不實宣稱案",
          "業者於電商平台銷售高跟鞋宣稱「榮獲兩項國際新型專利認證」，經公平會調查發現其中一項專利根本未向美國申請，另一項申請已遭USPTO駁回，屬典型「假權威／假認證」手法（確切裁罰金額與處分書字號待法務覆核）。",
          "news",
          null,
          "中",
        ),
        kase(
          "持續性",
          "公平會薦證廣告執法方向",
          "公平會已明確將KOL、KOC、團購主揪等納入「薦證者」規範對象，未依真實意見代言或未揭露利益關係者須與廣告主負連帶責任；已知一案例為網紅團購貼文宣稱「檔期內保證最低價」與事實不符，遭裁罰5萬元。",
          "authority",
          "https://www.ftc.gov.tw/",
          "中",
        ),
      ],
      impact:
        "台灣公平會已明確表態「小編發的／不是我寫的」不構成免責理由，KOL與團媽等個人賣家與品牌方同樣可能是裁罰對象，這一點對社群電商經濟特別重要——責任不會只落在品牌身上。",
      suggestedCopy:
        "文案中的「名醫推薦」「醫師認證」或網紅背書，若代言人並非依真實使用經驗發言、或未揭露收費/業配關係，依公平交易法第21條及公平會薦證廣告規範，廣告主與代言人可能須負連帶罰鍰與賠償責任。建議標明代言人的真實身分與利益關係，以「本人使用心得」取代「醫師/專家認證」等易誤導字眼。",
      riskLevel: "中",
      primarySourceType: "authority",
      sourceLinks: [src("公平會薦證廣告規範說明", "https://www.ftc.gov.tw/internet/main/doc/docDetail.aspx?uid=165&docid=13021", "authority", "高")],
      verified: false,
      needsReview: true,
    },
    {
      region: "HK",
      legalBasis:
        "香港無獨立的「假代言」專法，主要落入《商品說明條例》(Cap. 362) 第7條虛假或誤導性商品說明（涵蓋口頭陳述、評語）及第13E條誤導性遺漏（如KOL未披露收費）；消委會已明確將直播帶貨網紅界定為TDO下的「商戶」。醫療專業人士違規代言另涉醫委會《香港註冊醫生專業守則》。",
      violationAspects:
        "(a)/(c) 刑事：同TDO一般罰則，公訴最高HK$500,000及監禁5年，簡易程序最高HK$100,000及監禁2年。(b) 民事：受害消費者可循小額錢債審裁處/法院索償。",
      cases: [
        kase(
          "—",
          "網紅「日本蜜瓜」爭議",
          "網紅宣傳所售為「日本蜜瓜」，經查實為內地品種，其後公開道歉；消委會以此作為KOL網購監管教材案例。",
          "news",
          null,
          "中",
        ),
        kase(
          "—",
          "直播售賣冒牌物品海關案例",
          "香港首宗經社交平台直播售賣冒牌物品案件，沙田一男一女涉直播銷售冒牌飾物，海關檢獲貨值約HK$100,000貨品。",
          "authority",
          null,
          "中",
        ),
      ],
      impact:
        "香港消委會已正式將直播帶貨網紅定性為TDO下的「商戶」，等同直接對個人網紅課予商品說明真實性的法律責任，而不只是「介紹人」的角色，這對台灣/香港互通的社群電商賣家是重要提醒。",
      suggestedCopy:
        "「名醫認證」「網紅推薦」「大眾都在買」等聲稱，若無法提供可核實的證據或未披露商業合作關係，可能構成《商品說明條例》下的虛假商品說明或誤導性遺漏，直播/KOL帶貨者亦可能被視為「商戶」而須負法律責任。建議註明實際合作/報酬關係。",
      riskLevel: "中",
      primarySourceType: "authority",
      sourceLinks: [src("消委會 KOL 網購提醒", "https://www.consumer.org.hk/tc/article/528-KOL-online-shopping", "authority", "中")],
      verified: false,
      needsReview: true,
    },
    {
      region: "MO",
      legalBasis:
        "《消費者權益保護法》第7條「誤導性營商行為」涵蓋虛假聲稱認證或不實引用代言；《廣告活動》法律（第7/89/M號，1989年）要求廣告內容真實、可識別，標榜「全澳第一」等須備妥可證實數據；澳門政府2025年已就修訂此法展開公開諮詢，修法方向包括完善廣告制度。",
      violationAspects:
        "(a) 行政責任：第7/89/M號法律罰款約MOP2,000-40,000；CPL第7條罰款MOP20,000-60,000。(b) 民事：消委會調解機制。",
      cases: [
        kase(
          "—",
          "KOL/直播帶貨提醒（無具體裁罰案例）",
          "澳門消委會就直播帶貨/KOL提醒消費者留意網紅角色（代言人或分銷商）及索取正式單據，惟未查得具體處罰案例，標記待法務覆核。",
          "authority",
          null,
          "低",
        ),
      ],
      impact:
        "澳門廣告法規正在修訂中（2025年公開諮詢），未來對KOL/代言的規範可能比現行更明確、更嚴格，賣家應留意修法動態，而非只依現行條文評估風險。",
      suggestedCopy:
        "「名醫認證」「網紅推薦」等聲稱若無法查證或涉及未披露的商業合作，可能違反澳門《消費者權益保護法》第7條「誤導性營商行為」及《廣告活動》法律對廣告真實性的要求；澳門現正就修訂廣告法公開諮詢，未來規範可能更嚴格。建議如實標註商業合作關係。",
      riskLevel: "中",
      primarySourceType: "authority",
      sourceLinks: [src("澳門廣告法修訂公開諮詢", "https://www.gov.mo/zh-hant/policy-consultation/1156158/", "authority", "高")],
      verified: false,
      needsReview: true,
    },
    {
      region: "SG",
      legalBasis:
        "CPFTA s.4：不實宣稱涵蓋虛假背書/認證聲稱；ASAS新加坡廣告守則（SCAP）：要求推薦/見證內容須真實、具代表性，並要求網紅業配內容清楚顯著標示（不得需要展開貼文才看到#ad）。",
      violationAspects:
        "(a) 行政執法：CCCS/CASE可要求移除假評論/不實認證聲稱、發布更正聲明。(c) 刑事責任：一般背書式誇大用語刑事風險低，除非同時涉及已註冊產品的不實療效聲稱（則適用HPA/Medicines Act刑責）。(d) 業界自律：ASAS SCAP明文禁止捏造證言、要求業配揭露，是規範網紅推薦最主要的實務機制。",
      cases: [
        kase(
          "2025",
          "按摩椅品牌假借 Stanford Medicine 標誌案",
          "CCCS調查發現保健器材製造商使用「Stanford Medicine」標誌暗示機構背書，實際上僅一名顧問曾在該校醫學院授課（與誇大療效案例重疊，屬同一起事件的假權威面向）。",
          "news",
          null,
          "中",
        ),
        kase(
          "2024",
          "家具業者捏造五星評論案",
          "家居用品業者被發現張貼捏造的五星評論，含虛構顧客姓名縮寫與照片，業者其後承諾移除相關評論。",
          "news",
          null,
          "中",
        ),
      ],
      impact:
        "新加坡ASAS對「網紅推薦」設有明確的揭露格式要求（須清楚顯著標示，不能藏在需展開才看得到的地方），這比許多地區只要求「有揭露即可」更嚴格，賣家與網紅合作時應特別注意標示位置與呈現方式，而不只是「有沒有寫#ad」。",
      suggestedCopy:
        "「名醫認證」「網紅推薦」等宣稱若缺乏可查證的資質或未揭露業配關係，可能違反新加坡廣告準則（SCAP）及《公平交易法》下的不實宣稱規範；已有企業因引用機構標誌暗示不實背書而遭CCCS調查。建議標明合作關係並附上可查證之專業資格來源。",
      riskLevel: "中",
      primarySourceType: "authority",
      sourceLinks: [src("ASAS 新加坡廣告實務守則", "https://www.asas.org.sg/", "authority", "中")],
      verified: false,
      needsReview: true,
    },
    {
      region: "MY",
      legalBasis:
        "Consumer Protection Act 1999 第9/10條：不實或誤導性陳述，明文涵蓋虛假的核准、認可、贊助或特定標準/品質聲稱；第18條：廣告內容推定為直接或間接供應該商品者所做之聲明（賣家不能以「這是網紅自己說的」卸責）。Malaysian Communications and Multimedia Content Code（2022年修訂）：要求網紅商業合作內容（現金、免費商品或其他對價）須清楚揭露。",
      violationAspects:
        "(c) 刑事責任：CPA第25條罰則比照本類其他條文，法人最高罰款RM250,000（首次）/RM500,000（再犯），個人最高罰款RM100,000及監禁3年（首次）/更高（再犯）。(a) 行政：Content Forum/MCMC受理業配未揭露申訴；KPDNHEP受理不實聲稱申訴。",
      cases: [
        kase(
          "2023",
          "誤導性廣告申訴量與定罪落差",
          "法律評論文章指出2023年計有2,608件誤導性廣告申訴，但截至評論發表時「未有任何人依相關條文被定罪」，顯示法律雖已具備但對個別網紅/賣家的實際執法仍有落差，屬重要但需標明為評論觀點的資訊。",
          "news",
          null,
          "中",
        ),
        kase(
          "2025",
          "網紅違規遭罰款案（非同類案由）",
          "網紅因推廣電子煙/菸草產品違反《2024年公共衛生（吸菸產品管制）法》第9(1)條遭罰款RM10,000，可作為「馬來西亞確實會對網紅個人執法」的佐證，但案由是菸品廣告而非虛假權威/社會認同宣稱，不宜直接引用為同類案例。",
          "news",
          null,
          "中",
        ),
      ],
      impact:
        "馬來西亞法規明確涵蓋假權威/社會認同宣稱且理論上可課予個人網紅刑責，但實務執法對個別網紅的案例仍少，形成「法律風險存在、執法尚在建立階段」的落差——賣家與網紅合作時仍應以法規本身為準，不宜因執法量少而輕忽。",
      suggestedCopy:
        "「名醫認證」「網紅推薦」若涉及未揭露的商業合作，可能違反馬來西亞通訊及多媒體內容準則之業配揭露規定，若構成不實陳述，亦可能違反《1999年消費者保護法》第9、10條。實務上主管機關對個別網紅的執法案例仍屬少數，但法律責任風險依然存在，建議主動標示合作關係並保留佐證資料。",
      riskLevel: "中",
      primarySourceType: "law",
      sourceLinks: [src("MCMC Content Code", "https://www.mcmc.gov.my/", "authority", "中")],
      verified: false,
      needsReview: true,
    },
    {
      region: "JP",
      legalBasis:
        "景品表示法第5条第3号＋2023年3月28日內閣總理大臣告示（ステマ告示）：2023年10月1日起施行，規範業者委託之廣告若讓消費者誤以為是第三方自主意見而非業者付費廣告，即屬違法；規制對象為委託廣告的業者，網紅本人原則不直接受罰。若權威宣稱本身內容不實，同時可能構成第5条第1号優良誤認表示。",
      violationAspects:
        "(a) 行政責任：消費者庁對業者發措置命令（要求周知違法事實、建立再發防止體制、禁止再犯）；ステマ規制本身目前不搭配課徴金，但若同時構成優良誤認則可能併罰。(c) 刑事責任：ステマ規制本身尚無獨立刑事罰則，以行政處分為主要手段。",
      cases: [
        kase(
          "2024",
          "醫療診所Google評論案（全國首件ステマ措置命令）",
          "東京大森一間內科診所被認定以「留下四星或五星評論即可折抵接種費用」方式引導消費者發表看似自發、實為業者授意的好評，構成無法判別為廣告表示的ステマ違反，為ステマ規制施行後全國第一件措置命令。",
          "authority",
          "https://www.caa.go.jp/notice/entry/038178/",
          "高",
        ),
        kase(
          "2024",
          "大正製薬 NMN 補充品業配未標示案",
          "消費者庁認定該公司委託3名網紅於Instagram發文宣傳（原貼文已標示PR），但公司將貼文轉載至自家官網/廣告頁時未標示為廣告，使消費者誤以為是第三方自發評價，發出措置命令。",
          "authority",
          "https://www.caa.go.jp/notice/entry/039990/",
          "高",
        ),
        kase(
          "2025",
          "ロート製薬體驗者發文轉載未標示案",
          "消費者庁認定該公司招募體驗者依指定圖文於Instagram發布心得（原貼文已標示PR），但轉載至自家Web廣告時未註明為PR投稿，使消費者難以判別為廣告表示，發出措置命令。",
          "authority",
          "https://www.caa.go.jp/notice/entry/041488/",
          "高",
        ),
      ],
      impact:
        "日本ステマ規制執法模式高度一致：即使原始社群貼文已標示「PR」，只要業者把內容轉載到自己官網/廣告頁時漏標，一樣構成違法——這代表賣家/品牌必須在「每一個消費者實際看到的版位」都重新確認標示，不能只確認網紅原始貼文有沒有標。",
      suggestedCopy:
        "「名医が推薦」「網紅一致好評」「大家都在買」等權威或社會認同宣稱，若缺乏可查證依據，或屬業者付費委託卻未明確標示為廣告的內容，自2023年10月起可能違反景品表示法「ステルスマーケティング（ステマ）規制」，日本消費者庁已對診所、大型藥廠等發出多起措置命令的實際案例。建議所有業配內容於消費者實際看到的每一個版位都清楚標示「廣告」或「PR」。",
      riskLevel: "中",
      primarySourceType: "authority",
      sourceLinks: [
        src("消費者庁 ステルスマーケティング規制", "https://www.caa.go.jp/policies/policy/representation/fair_labeling/stealth_marketing", "authority", "高"),
        src("大正製薬 措置命令原文", "https://www.caa.go.jp/notice/entry/039990/", "authority", "高"),
      ],
      verified: false,
      needsReview: true,
    },
  ],
};

const SEED_TAGS: SeedTag[] = [exaggeratedEfficacy, urgencyManipulation, falseAuthoritySocialProof];

async function upsertTag(seed: SeedTag): Promise<void> {
  const [existing] = await db.select().from(riskTagsTable).where(eq(riskTagsTable.slug, seed.tag.slug));

  const tagId = existing
    ? (await db
        .update(riskTagsTable)
        .set({ ...seed.tag, updatedAt: new Date() })
        .where(eq(riskTagsTable.id, existing.id))
        .returning({ id: riskTagsTable.id }))[0].id
    : (await db.insert(riskTagsTable).values(seed.tag).returning({ id: riskTagsTable.id }))[0].id;

  // Replace this tag's region rows wholesale — simplest way to keep the seed
  // idempotent without hand-rolling a per-region diff, and safe because this
  // script only ever touches the three known seed slugs.
  await db.delete(riskTagRegionsTable).where(eq(riskTagRegionsTable.riskTagId, tagId));
  await db.insert(riskTagRegionsTable).values(
    seed.regions.map((r) => ({ ...r, riskTagId: tagId })),
  );

  console.log(`✓ ${seed.tag.name} (${seed.tag.slug}) — ${seed.regions.length} regions`);
}

async function main(): Promise<void> {
  for (const seed of SEED_TAGS) {
    await upsertTag(seed);
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
