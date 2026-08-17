// Risk-tag analysis for the admin console: given a piece of submitted copy
// (and optionally the scenario it appeared in — 銷售／客服／醫療 etc.), tells
// an admin *why* it's risky, grounded in the actual 話術風險標籤資料庫
// (risk_tags/risk_tag_regions) content rather than generic LLM knowledge —
// so if a reviewer edits a tag's legal definition in the admin console, this
// analyzer's output shifts to match on the next call.
//
// Two layers, per the product spec ("優先使用可解釋的規則或關鍵詞匹配輔以語
// 意判斷"): a deterministic keyword rule engine runs first and always
// produces explainable evidence (exact substrings found in the input); an
// LLM call (when available) adds severity/explanation/rewrite judgment on
// top and may extend the evidence list, but never replaces the rule hits.
// If the LLM is unavailable/fails, the rule engine alone still returns a
// valid, useful result — only a database read failure (the risk_tags table
// itself unreachable) surfaces as the hard RISK_DB_UNAVAILABLE error case.
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import {
  db,
  riskTagsTable,
  riskTagRegionsTable,
  type RiskTag,
  type RiskCase,
  type RiskSourceLink,
} from "@workspace/db";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});

export type Severity = "低" | "中" | "高";

// The 話術拆解清單's per-item "查看依據" drill-down — one risk_tag_regions
// row, carrying exactly the fields an admin needs to judge a citation: which
// jurisdiction it applies in, the actual law text, why it's a violation, the
// real cases behind it (each already source-typed and confidence-graded),
// and the region-specific impact/rewrite guidance. Mirrors RiskTagRegion in
// routes/admin/risk-tags.ts one-for-one — same shape, just read-only here.
export interface MatchedRegion {
  region: string;
  legalBasis: string;
  violationAspects: string;
  impact: string | null;
  suggestedCopy: string | null;
  riskLevel: string | null;
  primarySourceType: string;
  sourceLinks: RiskSourceLink[];
  cases: RiskCase[];
  verified: boolean;
  needsReview: boolean;
}

export interface MatchedTagRef {
  id: number;
  slug: string;
  name: string;
  riskGroup: string;
  category: string;
}

export interface RiskAnalysisResult {
  tag: string;
  severity: Severity;
  explanation: string;
  evidence: string[];
  recommended_rewrite: string;
  confidence: number;
  // Cross-reference into 話術風險標籤資料庫 — null/[] when the classified
  // tag doesn't (yet) have a matching entry in risk_tags, e.g. a free-form
  // label the LLM coined, or when the DB was unreachable for this request.
  matchedTag: MatchedTagRef | null;
  regions: MatchedRegion[];
}

export interface RiskAnalysisError {
  error: "RISK_DB_UNAVAILABLE";
  message: string;
  fallback: RiskAnalysisResult;
}

const SEVERITIES: Severity[] = ["低", "中", "高"];

// ---------------------------------------------------------------------------
// Layer 1 — deterministic keyword rule engine. Every entry here mirrors the
// legal definitions already curated in the risk_tags seed data (see
// scripts/src/seed-risk-tags.ts) — this is intentionally the same taxonomy,
// not a separate one, so a hit here and a DB tag name always line up.
// ---------------------------------------------------------------------------

interface RuleGroup {
  tag: string;
  literals: string[];
  patterns: RegExp[];
}

const RULE_GROUPS: RuleGroup[] = [
  {
    tag: "誇大療效",
    literals: [
      "治療",
      "治癒",
      "根治",
      "治百病",
      "逆轉病情",
      "逆轉",
      "痊癒",
      "根除",
      "永久有效",
      "保證有效",
      "保證根治",
      "無副作用",
      "立即見效",
      "馬上見效",
      "不藥而癒",
    ],
    patterns: [
      /(血壓|血糖|血脂|癌症|腫瘤|肝功能|腎功能|三高|過敏體質)[^。！]{0,15}(降到正常|恢復正常|治癒|消失|痊癒)/g,
      /(每天|每日|服用)[^。！]{0,12}(顆|次|包|錠)[^。！]{0,15}(降到正常|恢復正常|治癒|消失|痊癒|不藥而癒)/g,
    ],
  },
  {
    tag: "威脅感／緊迫感／情緒操控",
    literals: [
      "限時",
      "限量",
      "最後機會",
      "僅剩",
      "只剩最後",
      "倒數",
      "不買就後悔",
      "現在不買",
      "再不買",
      "手刀搶購",
      "秒殺",
      "錯過就沒有了",
      "錯過不再",
    ],
    patterns: [/再不[買下單購買][^。！]{0,10}(就|會)/g],
  },
  {
    tag: "權威／社會認同／群體壓力",
    literals: [
      "醫師推薦",
      "醫師認證",
      "名醫",
      "權威認證",
      "專家推薦",
      "網紅推薦",
      "網紅一致好評",
      "大家都在買",
      "眾多消費者",
      "認證推薦",
    ],
    patterns: [
      /醫師(推薦|表示|建議|認證|背書)/g,
      /\d+%?(的)?(用戶|消費者|顧客)[^。！]{0,8}(回購|推薦|都在買|好評)/g,
    ],
  },
];

interface RuleHit {
  tag: string;
  evidence: string[];
}

function runRuleEngine(text: string): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const group of RULE_GROUPS) {
    const evidence = new Set<string>();
    for (const literal of group.literals) {
      if (text.includes(literal)) evidence.add(literal);
    }
    for (const pattern of group.patterns) {
      for (const match of text.matchAll(pattern)) {
        if (match[0]) evidence.add(match[0]);
      }
    }
    if (evidence.size > 0) hits.push({ tag: group.tag, evidence: Array.from(evidence) });
  }
  // Most-triggered category first — used as the primary tag when the LLM is
  // unavailable, and as a strong hint when it is.
  return hits.sort((a, b) => b.evidence.length - a.evidence.length);
}

function genericFallback(): RiskAnalysisResult {
  return {
    tag: "待審核",
    severity: "中",
    explanation: "未偵測到明確風險關鍵詞，但無法排除風險，建議人工複核：可能包含過度承諾或醫療聲稱，建議審核。",
    evidence: [],
    recommended_rewrite: "建議由人工檢視原文後，改以保守、可查證的描述取代任何承諾性字眼。",
    confidence: 0.3,
    matchedTag: null,
    regions: [],
  };
}

function ruleOnlyResult(text: string): RiskAnalysisResult {
  const hits = runRuleEngine(text);
  if (hits.length === 0) return genericFallback();

  const top = hits[0];
  const severity: Severity = top.tag === "誇大療效" ? "高" : "中";
  return {
    tag: top.tag,
    severity,
    explanation: `偵測到與「${top.tag}」相符的關鍵詞，依規則比對建議標記為此類風險，實際嚴重程度請人工確認。`,
    evidence: top.evidence,
    recommended_rewrite: "建議改用保守、可查證的描述，避免關鍵詞列表中出現的承諾性或急迫性用語。",
    confidence: 0.45,
    matchedTag: null,
    regions: [],
  };
}

// ---------------------------------------------------------------------------
// Layer 2 — LLM semantic judgment, grounded in the live risk_tags content.
// ---------------------------------------------------------------------------

async function loadGroundingTags(): Promise<RiskTag[]> {
  return db.select().from(riskTagsTable);
}

function buildGroundingContext(tags: RiskTag[]): string {
  if (tags.length === 0) return "（目前資料庫中尚無已建立的風險標籤，請僅依通用行銷話術風險常識判斷。）";
  return tags
    .map(
      (t) =>
        `- ${t.name}（風險等級預設：${t.defaultRiskLevel}）：${t.definition || "（尚未填寫定義）"}`,
    )
    .join("\n");
}

function buildSystemPrompt(groundingContext: string): string {
  return `你是「話術透視鏡」後台的風險審核助手，協助管理員快速判斷一段行銷／銷售／客服話術是否具有法規或信任風險。

以下是平台目前已建立、由法規與案例研究支撐的風險標籤定義，請優先從中選擇最貼近的一個作為 tag；若都不貼近但確有其他風險，才自訂簡短、具體的標籤名稱（例如「誤導資訊」「強迫性說服」）：
${groundingContext}

請針對使用者提供的文字進行分析，並嚴格以下列 JSON 格式回傳（不得包含任何額外文字、註解或 Markdown）：
{
  "tag": "風險標籤名稱",
  "severity": "低" | "中" | "高",
  "explanation": "1-2 句話，要點式陳述為何被標記，語氣專業、友善、不帶責備",
  "evidence": ["逐條列出觸發標準或原文片段"],
  "recommended_rewrite": "1-2 句可直接上線的安全改寫建議",
  "confidence": 0.0 到 1.0 的數字
}

規則：
1. evidence 中的每一項都必須是使用者輸入文字中「實際出現」的片段或明確可指認的觸發依據，不得憑空捏造。
2. explanation 必須具體、可操作，讓管理員能直接採信並決策，避免空泛的「有風險」之類說法。
3. recommended_rewrite 保持簡短、可直接使用，不超過兩句話。
4. severity 判斷原則：涉及明確療效／醫療承諾、或明顯不實的緊迫／權威宣稱 → 高；語氣強烈但未必不實、需視情境判斷 → 中；輕微、多屬風格問題 → 低。
5. 全程使用繁體中文。`;
}

interface LlmRawResult {
  tag?: unknown;
  severity?: unknown;
  explanation?: unknown;
  evidence?: unknown;
  recommended_rewrite?: unknown;
  confidence?: unknown;
}

function coerceLlmResult(raw: LlmRawResult, ruleHits: RuleHit[]): RiskAnalysisResult | null {
  const tag = typeof raw.tag === "string" && raw.tag.trim() ? raw.tag.trim() : null;
  const explanation =
    typeof raw.explanation === "string" && raw.explanation.trim() ? raw.explanation.trim() : null;
  const recommendedRewrite =
    typeof raw.recommended_rewrite === "string" && raw.recommended_rewrite.trim()
      ? raw.recommended_rewrite.trim()
      : null;
  if (!tag || !explanation || !recommendedRewrite) return null;

  const severity: Severity = SEVERITIES.includes(raw.severity as Severity)
    ? (raw.severity as Severity)
    : "中";

  const llmEvidence = Array.isArray(raw.evidence)
    ? raw.evidence.filter((e): e is string => typeof e === "string" && e.trim().length > 0)
    : [];
  // Union with rule-engine hits for the matching tag so evidence never
  // depends solely on the LLM's own extraction — this is what keeps the
  // output "explainable" per the product spec even when the model is used.
  const ruleEvidence = ruleHits.find((h) => h.tag === tag)?.evidence ?? [];
  const evidence = Array.from(new Set([...ruleEvidence, ...llmEvidence]));

  const rawConfidence = Number(raw.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0.6;

  return {
    tag,
    severity,
    explanation,
    evidence,
    recommended_rewrite: recommendedRewrite,
    confidence,
    matchedTag: null,
    regions: [],
  };
}

// ---------------------------------------------------------------------------
// 話術拆解清單 drill-down — once a tag is settled (from the LLM or the rule
// engine), cross-reference it against 話術風險標籤資料庫 so the admin UI can
// render "查看依據" buttons per region, each opening the real law text,
// violation type, and case history behind the call — not just the raw
// matched keywords. Exact name match against risk_tags.name: the grounding
// prompt above instructs the model to echo one of those names verbatim when
// possible, and the rule engine's tag values already equal them by
// construction (see RULE_GROUPS).
// ---------------------------------------------------------------------------

function regionRowToMatched(r: {
  region: string;
  legalBasis: string;
  violationAspects: string;
  impact: string | null;
  suggestedCopy: string | null;
  riskLevel: string | null;
  primarySourceType: string;
  sourceLinks: RiskSourceLink[];
  cases: RiskCase[];
  verified: boolean;
  needsReview: boolean;
}): MatchedRegion {
  return {
    region: r.region,
    legalBasis: r.legalBasis,
    violationAspects: r.violationAspects,
    impact: r.impact,
    suggestedCopy: r.suggestedCopy,
    riskLevel: r.riskLevel,
    primarySourceType: r.primarySourceType,
    sourceLinks: r.sourceLinks,
    cases: r.cases,
    verified: r.verified,
    needsReview: r.needsReview,
  };
}

async function enrichWithMatchedTag(
  result: RiskAnalysisResult,
  groundingTags: RiskTag[],
): Promise<RiskAnalysisResult> {
  const matched = groundingTags.find((t) => t.name === result.tag);
  if (!matched) return result;

  const regionRows = await db
    .select()
    .from(riskTagRegionsTable)
    .where(eq(riskTagRegionsTable.riskTagId, matched.id));

  return {
    ...result,
    matchedTag: {
      id: matched.id,
      slug: matched.slug,
      name: matched.name,
      riskGroup: matched.riskGroup,
      category: matched.category,
    },
    regions: regionRows.map(regionRowToMatched),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function analyzeRiskText(
  text: string,
  context: string | undefined,
): Promise<RiskAnalysisResult | RiskAnalysisError> {
  let groundingTags: RiskTag[];
  try {
    groundingTags = await loadGroundingTags();
  } catch {
    // The risk-tag database itself is unreachable — this is the one case the
    // product spec calls out as a hard error, distinct from "the LLM had a
    // bad day" below. Still return a usable fallback so the admin UI has
    // something to show rather than a dead end (no matchedTag/regions here —
    // that's exactly the data we couldn't reach).
    return {
      error: "RISK_DB_UNAVAILABLE",
      message: "風險標籤服務暫時無法使用，已記錄並請稍後重試。",
      fallback: ruleOnlyResult(text),
    };
  }

  const ruleHits = runRuleEngine(text);

  if (!process.env.OPENAI_API_KEY) {
    return enrichWithMatchedTag(ruleOnlyResult(text), groundingTags);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(buildGroundingContext(groundingTags)) },
        {
          role: "user",
          content: `使用場景：${context?.trim() || "未提供，請依一般行銷情境判斷"}\n\n待分析文字：\n${text}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as LlmRawResult;
    const result = coerceLlmResult(parsed, ruleHits) ?? ruleOnlyResult(text);
    return enrichWithMatchedTag(result, groundingTags);
  } catch {
    // LLM call failed/timed out/returned unparsable JSON — degrade to the
    // rule engine rather than failing the request outright, since the rules
    // alone already satisfy the "explainable" requirement on their own.
    return enrichWithMatchedTag(ruleOnlyResult(text), groundingTags);
  }
}
