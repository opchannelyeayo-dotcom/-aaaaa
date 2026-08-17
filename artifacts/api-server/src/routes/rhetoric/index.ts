import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import OpenAI from "openai";
import { db, analysisRecordsTable, referenceProductsTable } from "@workspace/db";
import {
  ProcessOcrBody,
  ProcessOcrResponse,
  AnalyzeRhetoricBody,
  AnalyzeRhetoricResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Bound the OpenAI call so a slow/hung upstream request can't leave the user
// staring at a spinner forever — it will eventually fail and surface a JSON
// error via the app-level error handler instead of hanging indefinitely.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60_000,
  maxRetries: 2,
});

const RHETORIC_CATEGORIES = new Set([
  "恐懼訴求",
  "假稀缺",
  "社會認同操控",
  "權威借位",
  "情緒勒索",
  "誇大療效",
]);

const RISK_LEVELS = new Set(["低", "中", "高"]);

// Cost/perf guardrails: these endpoints call paid LLM APIs with no auth in
// front of them (by design — no login, per spec), so unbounded input size is
// both a cost risk and a latency risk.
const MAX_TEXT_LENGTH = 6000;
const MAX_IMAGE_BASE64_LENGTH = 11_000_000; // ~8MB image, base64-encoded

// Minimal in-memory fixed-window rate limiter. There is no login system by
// design, so these two routes (the only ones that call the paid OpenAI API)
// are otherwise wide open to anyone who finds the URL — a scripted loop
// could run up an unbounded OpenAI bill. This is intentionally simple (no
// new dependency, no Redis) since the spec targets 5-10 pilot testers, not
// production-scale traffic; it resets on process restart, which is fine for
// this purpose.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestLog = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = requestLog.get(key);

  if (!entry || entry.resetAt <= now) {
    requestLog.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ error: "請求過於頻繁，請稍後再試" });
    return;
  }

  entry.count += 1;
  next();
}

// POST /ocr — extract text from base64 image
router.post("/ocr", rateLimit, async (req, res): Promise<void> => {
  const parsed = ProcessOcrBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, mimeType } = parsed.data;

  if (imageBase64.trim().length === 0) {
    res.status(400).json({ error: "imageBase64 cannot be empty" });
    return;
  }

  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    res.status(400).json({ error: "Image is too large (max 8MB)" });
    return;
  }

  if (!mimeType.startsWith("image/")) {
    res.status(400).json({ error: "mimeType must be an image type" });
    return;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
          {
            type: "text",
            text: "請將這張圖片中所有的文字完整抄錄出來，保持原始格式，不要添加任何解釋或評論，只輸出圖片中的文字內容。",
          },
        ],
      },
    ],
  });

  const ocrText = response.choices[0]?.message?.content ?? "";
  res.json(ProcessOcrResponse.parse({ ocrText }));
});

// Reference products (see routes/admin/products.ts) whose name literally
// appears in the analyzed text. Capped at MAX_MATCHED_PRODUCTS so a text
// mentioning many product names can't blow up the prompt size/cost — the
// point is grounding the LLM against a few concrete, verified references,
// not an exhaustive catalog dump.
const MAX_MATCHED_PRODUCTS = 3;
const MAX_APPROVED_USES_IN_PROMPT = 300;

interface MatchedProduct {
  id: number;
  name: string;
  category: string;
  registrationNumber: string | null;
  approvedUses: string;
}

async function findMatchedProducts(textContent: string): Promise<MatchedProduct[]> {
  const products = await db.select().from(referenceProductsTable);
  const matches = products.filter((p) => p.name.trim().length > 0 && textContent.includes(p.name));
  return matches.slice(0, MAX_MATCHED_PRODUCTS).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    registrationNumber: p.registrationNumber,
    approvedUses: p.approvedUses,
  }));
}

function buildReferenceContext(matched: MatchedProduct[], role: "seller" | "consumer"): string {
  if (matched.length === 0) return "";
  const entries = matched
    .map((p) => {
      const uses =
        p.approvedUses.length > MAX_APPROVED_USES_IN_PROMPT
          ? p.approvedUses.slice(0, MAX_APPROVED_USES_IN_PROMPT) + "..."
          : p.approvedUses;
      return `- ${p.name}${p.registrationNumber ? `（核准字號：${p.registrationNumber}）` : ""}：核准適應症／功能為「${uses}」`;
    })
    .join("\n");

  const instruction =
    role === "seller"
      ? "請將文案中對這些產品的療效宣稱與此比對，若廣告宣稱的功效超出核准範圍，務必標記為「誇大療效」，並在 mainRisks／improvementSuggestions 中具體指出這是下架、開罰或損害品牌信任的風險來源。"
      : "請將文案中對這些產品的療效宣稱與此比對，若廣告宣稱的功效超出核准範圍，務必標記為「誇大療效」，並在 mainRisks 中提醒讀者：這可能讓消費者誤解成「無副作用」或「一定有效」，忽略了核准範圍外的適應症、禁忌與使用限制。";

  return `\n\n以下是文案中提到、且已查證的產品真實核准資料，${instruction}\n${entries}`;
}

const RHETORIC_TAXONOMY = `- 恐懼訴求：製造對健康的恐懼感來推動購買
- 假稀缺：人為製造產品稀缺感來施加購買壓力
- 社會認同操控：利用群眾行為來操控消費者決策
- 權威借位：借用或捏造專家／醫師背書
- 情緒勒索：使用內疚感、同情心或家庭壓力
- 誇大療效：誇大或捏造健康功效`;

const RESULT_JSON_SHAPE = `{
  "annotations": [
    {
      "textSpan": "原文中被標註的片段（需可在原文中逐字找到）",
      "category": "六種話術之一",
      "explanation": "一句白話說明這句話在對讀者做什麼"
    }
  ],
  "credibilityScore": 數字0到100（0=極度操控／不可信，100=完全可信），
  "neutralRewrite": "去除話術後的客觀版本文案",
  "verdict": "一句話判定",
  "coreJudgment": "2到4句話的核心判斷說明",
  "mainStrengths": ["主要優點，條列，可為空陣列"],
  "mainRisks": ["主要風險，條列，可為空陣列"],
  "improvementSuggestions": ["具體、可執行的改進建議，條列"],
  "riskLevel": "低" | "中" | "高"
}`;

// The two roles reason about the exact same ad copy from deliberately
// opposite vantage points (spec F: "賣家與消費者的判斷邏輯完全不同，不能混
// 用") — same six-category rhetoric taxonomy and JSON shape so the DB/UI can
// stay uniform, but the system prompt (and therefore every judgment field)
// is built from scratch per role rather than sharing a "neutral" base prompt.
function buildSystemPrompt(
  role: "seller" | "consumer",
  referenceContext: string,
): string {
  if (role === "seller") {
    return `你是一位專門協助保健食品／健康商品賣家評估廣告文案與商品說明的行銷顧問。
你的分析角度是「賣家視角」：重視推銷、成交、信任建立、說服力與品牌價值。你的判定目標是——這段內容有沒有行銷與銷售價值、能不能促進購買轉換、有沒有市場競爭力。

請針對以下重點進行判斷：
- 這段內容是否有明確的賣點
- 是否有足夠的購買動機與轉換導向
- 是否能抓住消費者的痛點、需求或慾望
- 是否有足夠的專業感、產品價值、利益與結果描述
- 是否適合做商品介紹、廣告文案、促銷內容
- 是否有誇大、模糊、過度承諾的風險——這類語言即使短期有助成交，仍可能造成下架、開罰或損害品牌長期信任，必須明確指出
- 是否能夠讓消費者產生「值得了解」或「值得買」的動機

請嚴格只使用以下六種話術分類來標註文案中值得注意的語句，不得自創其他分類：
${RHETORIC_TAXONOMY}

輸出格式（JSON）：
${RESULT_JSON_SHAPE}

各欄位請務必站在「賣家」角度撰寫：
- verdict：例如「具備銷售力，但誇大風險偏高，建議調整後再上架」
- coreJudgment：整體行銷與銷售價值的核心判斷
- mainStrengths：這段文案作為銷售素材的主要優點／賣點
- mainRisks：可能傷害轉換率、品牌信任或觸法的風險
- improvementSuggestions：如何在保留說服力的前提下降低風險的具體建議

注意：
1. textSpan 必須是原文中完整的片段，可在原文中搜尋到
2. 若無明顯話術，annotations 可為空陣列
3. credibilityScore 須綜合考量所有話術的嚴重程度
4. neutralRewrite 保留產品的合理資訊，只去除操控性語言
5. 說明請用繁體中文${referenceContext}`;
  }

  return `你是一位專門分析保健食品與藥品廣告中心理操控話術的專家，為一般消費者把關。
你的分析角度是「消費者視角」：重視理解度、信任、合理性、風險感知，判斷這段內容是否會誤導讀者。你的判定目標是——這段內容可不可信、容不容易讓人誤解、還是只是在「說漂亮話」。

請針對以下重點進行判斷：
- 內容是否清楚易懂
- 是否有過度承諾或誇大效果
- 是否會讓一般消費者感到不安、困惑或懷疑
- 是否存在誤導性語句、模糊表述、缺乏證據
- 是否有明顯偏頗、強烈銷售性、缺乏資訊透明度
- 是否對消費者有合理性的說明與風險提示
- 若內容涉及藥品／健康／保健類，應特別注意誤導風險與安全性——是否符合常識與實際使用資訊、是否忽略適應症／禁忌／風險／使用限制、是否會讓消費者誤解成「無副作用」或「一定有效」

請嚴格只使用以下六種話術分類，不得自創其他分類：
${RHETORIC_TAXONOMY}

輸出格式（JSON）：
${RESULT_JSON_SHAPE}

各欄位請務必站在「消費者」角度撰寫：
- verdict：例如「內容誇大且缺乏證據，誤導風險高，不建議照單全收」
- coreJudgment：這段內容整體可信度與誤導風險的核心判斷
- mainStrengths：內容中值得肯定、確實提供合理資訊的部分
- mainRisks：可能誤導消費者、隱藏風險或缺乏透明度之處
- improvementSuggestions：消費者在閱讀／使用這類內容時應該注意或求證的具體建議

注意：
1. textSpan 必須是原文中完整的片段，可在原文中搜尋到
2. 若無明顯話術，annotations 可為空陣列
3. credibilityScore 須綜合考量所有話術的嚴重程度
4. neutralRewrite 保留產品的合理資訊，只去除操控性語言
5. 說明請用繁體中文${referenceContext}`;
}

// POST /analyze — rhetoric analysis via LLM
router.post("/analyze", rateLimit, async (req, res): Promise<void> => {
  const parsed = AnalyzeRhetoricBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { inputType, textContent, role } = parsed.data;

  if (textContent == null || textContent.trim().length === 0) {
    res.status(400).json({ error: "textContent cannot be empty" });
    return;
  }

  if (textContent.length > MAX_TEXT_LENGTH) {
    res
      .status(400)
      .json({ error: `textContent exceeds max length of ${MAX_TEXT_LENGTH}` });
    return;
  }

  const matchedProducts = await findMatchedProducts(textContent);
  const systemPrompt = buildSystemPrompt(role, buildReferenceContext(matchedProducts, role));

  const llmResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `請分析以下廣告文案：\n\n${textContent}`,
      },
    ],
  });

  const content = llmResponse.choices[0]?.message?.content ?? "{}";
  let llmData: {
    annotations?: Array<{
      textSpan: string;
      category: string;
      explanation: string;
    }>;
    credibilityScore?: number;
    neutralRewrite?: string;
    verdict?: string;
    coreJudgment?: string;
    mainStrengths?: string[];
    mainRisks?: string[];
    improvementSuggestions?: string[];
    riskLevel?: string;
  };

  try {
    llmData = JSON.parse(content);
  } catch {
    req.log.error({ content }, "Failed to parse LLM response as JSON");
    res.status(502).json({ error: "Failed to parse analysis response, please try again" });
    return;
  }

  // Filter to only well-formed annotations with a category inside the six
  // sanctioned buckets — LLM output is untrusted and can be malformed. We
  // also require textSpan to actually occur verbatim in the source text:
  // the frontend highlights annotations by searching for textSpan inside
  // originalText, so an annotation the model paraphrased (common LLM
  // behavior) would previously show up in the "話術拆解清單" list but never
  // highlight in the original text — an inconsistent, confusing result for
  // a feature the spec marks as required ("原文顏色標籤標註").
  const annotations = (llmData.annotations ?? []).filter(
    (a): a is { textSpan: string; category: string; explanation: string } =>
      !!a &&
      typeof a.textSpan === "string" &&
      a.textSpan.trim().length > 0 &&
      textContent.includes(a.textSpan) &&
      typeof a.explanation === "string" &&
      RHETORIC_CATEGORIES.has(a.category),
  );

  // Guard against non-numeric / NaN scores from the LLM so we never persist
  // or return an invalid credibility score (this previously could produce a
  // NaN that both broke the response schema validation *after* the DB write
  // already happened, and silently broke the gauge UI on read).
  const rawScore = Number(llmData.credibilityScore);
  const credibilityScore = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, rawScore))
    : 50;

  const neutralRewrite =
    typeof llmData.neutralRewrite === "string" && llmData.neutralRewrite.trim().length > 0
      ? llmData.neutralRewrite
      : textContent;

  // Same untrusted-LLM-output guardrails as annotations/credibilityScore
  // above, applied to the new role-judgment fields.
  const verdict = typeof llmData.verdict === "string" ? llmData.verdict.trim() : "";
  const coreJudgment = typeof llmData.coreJudgment === "string" ? llmData.coreJudgment.trim() : "";
  const toStringList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
  const mainStrengths = toStringList(llmData.mainStrengths);
  const mainRisks = toStringList(llmData.mainRisks);
  const improvementSuggestions = toStringList(llmData.improvementSuggestions);
  const riskLevel = RISK_LEVELS.has(llmData.riskLevel as string) ? (llmData.riskLevel as string) : "中";

  const [record] = await db
    .insert(analysisRecordsTable)
    .values({
      inputType,
      role,
      originalText: textContent,
      annotations,
      credibilityScore,
      neutralRewrite,
      matchedProducts,
      verdict,
      coreJudgment,
      mainStrengths,
      mainRisks,
      improvementSuggestions,
      riskLevel,
    })
    .returning();

  res.json(
    AnalyzeRhetoricResponse.parse({
      recordId: record.id,
      originalText: record.originalText,
      annotations: record.annotations,
      credibilityScore: record.credibilityScore,
      neutralRewrite: record.neutralRewrite,
      matchedProducts: record.matchedProducts,
      role: record.role,
      verdict: record.verdict,
      coreJudgment: record.coreJudgment,
      mainStrengths: record.mainStrengths,
      mainRisks: record.mainRisks,
      improvementSuggestions: record.improvementSuggestions,
      riskLevel: record.riskLevel,
    }),
  );
});

export default router;
