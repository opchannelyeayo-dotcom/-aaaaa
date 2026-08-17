// 網址安全查詢 — consumer-facing URL/link checker. Two layers, same
// philosophy as lib/risk-analysis.ts: a deterministic heuristic rule engine
// always runs and is solely responsible for the numeric score/status (so the
// verdict is auditable and never depends on an LLM being available or
// behaving); an optional LLM pass may add plain-language explanation and
// extra named risk reasons on top, but can never change the score or status.
//
// No external threat-intel API (Google Safe Browsing, VirusTotal, etc.) is
// wired in — this repo has no API key configured for either. The heuristics
// below cover the structural red flags those services' free tiers would
// mostly be catching anyway (IP-literal hosts, punycode lookalikes, the "@"
// redirect trick, brand-impersonation domains, disposable/abused TLDs,
// unresolved shorteners). If a real blocklist API key becomes available
// later, call it from checkUrl() alongside the heuristics and fold its
// verdict into `flags` the same way.
import net from "node:net";
import dns from "node:dns/promises";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 15_000,
  maxRetries: 1,
});

export type UrlScanStatus = "safe" | "suspicious" | "high_risk" | "unknown";

export interface UrlScanResult {
  url: string;
  normalizedUrl: string;
  domain: string;
  finalUrl: string | null;
  finalDomain: string | null;
  status: UrlScanStatus;
  score: number;
  riskReasons: string[];
  categories: string[];
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Heuristic rule engine
// ---------------------------------------------------------------------------

interface Flag {
  delta: number;
  reason: string;
  category: string;
}

const SUSPICIOUS_TLDS = new Set([
  ".xyz", ".top", ".zip", ".country", ".work", ".click", ".link",
  ".gq", ".tk", ".ml", ".cf", ".ga", ".rest", ".fit", ".mom", ".cam", ".bar", ".men",
]);

const SHORTENER_DOMAINS = new Set([
  "bit.ly", "tinyurl.com", "reurl.cc", "is.gd", "ppt.cc", "lihi1.com", "lihi1.cc",
  "lihi.cc", "t.co", "goo.gl", "ow.ly", "cutt.ly", "shorturl.at", "rebrand.ly", "tiny.cc",
]);

interface BrandRule {
  brand: string;
  keywords: string[];
  domains: string[];
}

// Skewed toward brands most commonly impersonated in Taiwanese phishing
// (banks, couriers/convenience stores, e-commerce) plus the usual global
// targets — not exhaustive, this is a heuristic hint, not a registry.
const BRAND_RULES: BrandRule[] = [
  { brand: "PayPal", keywords: ["paypal"], domains: ["paypal.com"] },
  { brand: "Apple", keywords: ["apple", "icloud"], domains: ["apple.com", "icloud.com"] },
  { brand: "Google", keywords: ["google", "gmail"], domains: ["google.com", "gmail.com"] },
  { brand: "Facebook", keywords: ["facebook"], domains: ["facebook.com", "fb.com"] },
  { brand: "LINE", keywords: ["line-tw", "linepay", "line-app", "lineofficial"], domains: ["line.me"] },
  { brand: "蝦皮", keywords: ["shopee"], domains: ["shopee.tw", "shopee.com"] },
  { brand: "momo購物網", keywords: ["momoshop", "momo-shop", "momotw"], domains: ["momoshop.com.tw"] },
  { brand: "中華郵政", keywords: ["postgov", "post-gov", "chunghwapost"], domains: ["post.gov.tw"] },
  { brand: "台灣銀行", keywords: ["bankoftaiwan", "bot-tw"], domains: ["bot.com.tw"] },
  { brand: "玉山銀行", keywords: ["esunbank", "esun-bank"], domains: ["esunbank.com.tw", "esunbank.com"] },
  { brand: "中華電信", keywords: ["chunghwatelecom", "cht-tw"], domains: ["cht.com.tw"] },
  { brand: "露天拍賣", keywords: ["ruten"], domains: ["ruten.com.tw"] },
  { brand: "PChome", keywords: ["pchome"], domains: ["pchome.com.tw"] },
];

function runHeuristics(parsed: URL): Flag[] {
  const flags: Flag[] = [];
  const host = parsed.hostname.toLowerCase();
  const full = parsed.toString();

  if (net.isIP(host)) {
    flags.push({
      delta: -30,
      reason: "網址主機是 IP 位址而非網域名稱，正常網站極少直接以 IP 位址曝光給使用者",
      category: "可疑主機格式",
    });
  }

  if (host.includes("xn--")) {
    flags.push({
      delta: -25,
      reason: "網域使用 punycode 編碼（xn--開頭），常見於偽裝成知名品牌的相似字元網域",
      category: "疑似偽裝網域",
    });
  }

  if (full.includes("@")) {
    flags.push({
      delta: -35,
      reason: "網址中包含「@」符號，是常見的釣魚手法：瀏覽器實際會導向 @ 之後的網域，@ 之前的文字只是誘餌",
      category: "疑似釣魚手法",
    });
  }

  if (parsed.protocol === "http:") {
    flags.push({
      delta: -10,
      reason: "未使用 HTTPS 加密連線，資料傳輸未受保護",
      category: "缺乏加密",
    });
  }

  const labels = host.split(".");
  if (labels.length >= 5) {
    flags.push({
      delta: -10,
      reason: `網域層級過多（${host}），常見於混淆真實網域的手法`,
      category: "網域結構可疑",
    });
  }

  const tld = "." + labels[labels.length - 1];
  if (SUSPICIOUS_TLDS.has(tld)) {
    flags.push({
      delta: -15,
      reason: `使用較少見、常被詐騙網站濫用的網域後綴（${tld}）`,
      category: "高風險網域後綴",
    });
  }

  const hyphenCount = (host.match(/-/g) ?? []).length;
  if (hyphenCount >= 3) {
    flags.push({
      delta: -10,
      reason: "網域名稱包含多個連字號，常見於刻意模仿品牌名稱的假網域",
      category: "網域結構可疑",
    });
  }

  if (full.length > 150) {
    flags.push({
      delta: -10,
      reason: "網址長度異常，可能刻意混淆或隱藏真實目的地",
      category: "網域結構可疑",
    });
  }

  if (SHORTENER_DOMAINS.has(host)) {
    flags.push({
      delta: -5,
      reason: "這是縮短網址服務，無法直接看出實際目的地",
      category: "縮短網址",
    });
  }

  for (const rule of BRAND_RULES) {
    const looksLikeBrand = rule.keywords.some((k) => host.includes(k));
    const isRealDomain = rule.domains.some((d) => host === d || host.endsWith("." + d));
    if (looksLikeBrand && !isRealDomain) {
      flags.push({
        delta: -40,
        reason: `網域包含「${rule.brand}」相關字樣，但並非 ${rule.brand} 的官方網域，疑似冒充知名品牌`,
        category: "疑似冒充品牌",
      });
    }
  }

  const sensitiveKeywords = ["login", "verify", "secure", "account", "signin", "password", "update", "confirm"];
  if (flags.length > 0 && sensitiveKeywords.some((k) => full.toLowerCase().includes(k))) {
    flags.push({
      delta: -10,
      reason: "網址包含登入／驗證等敏感關鍵字，搭配上述其他可疑跡象，風險更高",
      category: "敏感關鍵字",
    });
  }

  return flags;
}

// ---------------------------------------------------------------------------
// SSRF-safe redirect resolution — follows shorteners to their real
// destination without letting a user-supplied URL make this server probe
// internal infrastructure. Every hop is re-validated: scheme must be
// http(s), and the resolved IP must not be loopback/private/link-local
// (which also blocks the common 169.254.169.254 cloud metadata trick). Only
// the final URL/host/status code are ever surfaced — response bodies are
// never fetched or returned.
// ---------------------------------------------------------------------------

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 5_000;

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.split(":").pop();
      if (v4 && net.isIPv4(v4)) return isPrivateOrReservedIp(v4);
    }
    return false;
  }
  return true; // unrecognized format — block conservatively
}

async function isSafeHostToFetch(hostname: string): Promise<boolean> {
  if (hostname === "localhost") return false;
  try {
    const { address } = await dns.lookup(hostname);
    return !isPrivateOrReservedIp(address);
  } catch {
    return false;
  }
}

async function resolveRedirects(startUrl: string): Promise<{ finalUrl: string; hops: number } | null> {
  let current = startUrl;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!(await isSafeHostToFetch(parsed.hostname))) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; RhetoricXrayLinkChecker/1.0)" },
      });
    } catch {
      clearTimeout(timeout);
      return hop === 0 ? null : { finalUrl: current, hops: hop };
    }
    clearTimeout(timeout);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { finalUrl: current, hops: hop };
      try {
        current = new URL(location, current).toString();
      } catch {
        return { finalUrl: current, hops: hop };
      }
      continue;
    }
    return { finalUrl: current, hops: hop };
  }
  return { finalUrl: current, hops: MAX_REDIRECTS };
}

// ---------------------------------------------------------------------------
// Optional LLM pass — adds plain-language reasoning on top of the
// deterministic flags; never allowed to change score/status.
// ---------------------------------------------------------------------------

async function getLlmInsight(
  originalUrl: string,
  finalUrl: string | null,
  flags: Flag[],
): Promise<{ extraReasons: string[]; recommendation: string } | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const flagSummary =
    flags.length > 0
      ? flags.map((f) => `- [${f.category}] ${f.reason}`).join("\n")
      : "（規則引擎沒有偵測到明顯的結構性風險）";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是「話術透視鏡」的網址安全顧問，協助一般消費者判斷連結是否可疑。你會收到一個網址、規則引擎已偵測到的結構性風險，以及（若有）追蹤縮短網址後的實際目的地。

請以繁體中文、專業但不嚇人的語氣回傳嚴格 JSON：
{
  "extraReasons": ["若你觀察到規則引擎未列出、但值得提醒使用者的疑點，逐條列出；沒有就回傳空陣列，不要硬湊"],
  "recommendation": "1-2 句給消費者的具體建議，例如是否可以點擊、該注意什麼"
}

原則：
1. 不要臆測或捏造你無法從網址本身判斷的事實（例如網站內容、公司背景）。
2. 若規則引擎已列出足夠的風險原因，extraReasons 可以是空陣列。
3. recommendation 必須具體可操作，避免空泛的「請小心」。`,
        },
        {
          role: "user",
          content: `原始網址：${originalUrl}\n${finalUrl && finalUrl !== originalUrl ? `追蹤後的實際目的地：${finalUrl}\n` : ""}規則引擎偵測到的風險：\n${flagSummary}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { extraReasons?: unknown; recommendation?: unknown };
    const extraReasons = Array.isArray(parsed.extraReasons)
      ? parsed.extraReasons.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];
    const recommendation =
      typeof parsed.recommendation === "string" && parsed.recommendation.trim()
        ? parsed.recommendation.trim()
        : "";

    return { extraReasons, recommendation };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function defaultRecommendation(status: UrlScanStatus): string {
  switch (status) {
    case "safe":
      return "目前沒有偵測到明顯的結構性風險，但仍建議確認網域拼字與您預期的一致，再輸入任何帳號密碼或個資。";
    case "suspicious":
      return "這個網址有部分可疑跡象，建議先透過官方管道（例如直接搜尋官網、致電客服）確認後再點擊，避免直接輸入個人資料。";
    case "high_risk":
      return "這個網址有多項高風險跡象，強烈建議不要點擊，也不要在其中輸入任何帳號、密碼或付款資訊。";
    case "unknown":
    default:
      return "無法判斷這個網址的風險，建議透過其他管道確認來源後再決定是否點擊。";
  }
}

export async function checkUrl(rawInput: string): Promise<UrlScanResult> {
  const trimmed = rawInput.trim();
  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return {
      url: rawInput,
      normalizedUrl: withScheme,
      domain: "",
      finalUrl: null,
      finalDomain: null,
      status: "unknown",
      score: 0,
      riskReasons: ["無法解析這個網址的格式，請確認輸入是否正確"],
      categories: ["格式錯誤"],
      recommendation: "請確認網址格式是否正確（例如是否漏打網域），再重新查詢一次。",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      url: rawInput,
      normalizedUrl: parsed.toString(),
      domain: parsed.hostname,
      finalUrl: null,
      finalDomain: null,
      status: "unknown",
      score: 0,
      riskReasons: [`不支援 ${parsed.protocol} 開頭的網址格式`],
      categories: ["格式不支援"],
      recommendation: "本工具僅支援 http:// 與 https:// 開頭的一般網頁連結。",
    };
  }

  const flags = runHeuristics(parsed);

  let finalUrl: string | null = null;
  let finalDomain: string | null = null;
  if (SHORTENER_DOMAINS.has(parsed.hostname.toLowerCase())) {
    const resolved = await resolveRedirects(parsed.toString());
    if (resolved && resolved.finalUrl !== parsed.toString()) {
      finalUrl = resolved.finalUrl;
      try {
        finalDomain = new URL(finalUrl).hostname;
        // Re-run heuristics against the *actual* destination too — a
        // shortener's structural flags are secondary to where it leads.
        const finalFlags = runHeuristics(new URL(finalUrl));
        flags.push(...finalFlags.filter((f) => !flags.some((existing) => existing.reason === f.reason)));
      } catch {
        // final URL failed to parse — keep whatever we already have
      }
    }
  }

  let score = 100;
  for (const flag of flags) score += flag.delta;
  score = Math.max(0, Math.min(100, score));

  const hasSevereFlag = flags.some((f) => f.delta <= -35);
  let status: UrlScanStatus;
  if (hasSevereFlag || score < 50) status = "high_risk";
  else if (score < 80) status = "suspicious";
  else status = "safe";

  const riskReasons = flags.map((f) => f.reason);
  const categories = Array.from(new Set(flags.map((f) => f.category)));

  const llmInsight = await getLlmInsight(parsed.toString(), finalUrl, flags);
  if (llmInsight) {
    for (const reason of llmInsight.extraReasons) {
      if (!riskReasons.includes(reason)) riskReasons.push(reason);
    }
  }

  return {
    url: rawInput,
    normalizedUrl: parsed.toString(),
    domain: parsed.hostname,
    finalUrl,
    finalDomain,
    status,
    score,
    riskReasons: riskReasons.length > 0 ? riskReasons : ["沒有偵測到明顯的結構性風險"],
    categories,
    recommendation: llmInsight?.recommendation || defaultRecommendation(status),
  };
}
