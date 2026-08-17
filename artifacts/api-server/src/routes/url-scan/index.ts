import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, urlScansTable } from "@workspace/db";
import { checkUrl } from "../../lib/url-scan";

const router: IRouter = Router();

const MAX_URL_LENGTH = 2000;

// Same fixed-window in-memory limiter pattern as routes/rhetoric/index.ts —
// this endpoint is unauthenticated by design (consumer-facing tool, no
// login) and does a network fetch + optional paid LLM call per request, so
// it needs its own cost/abuse guard.
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

router.post("/url-scan", rateLimit, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (typeof body.url !== "string" || !body.url.trim()) {
    res.status(400).json({ error: "請輸入要查詢的網址" });
    return;
  }
  if (body.url.length > MAX_URL_LENGTH) {
    res.status(400).json({ error: `網址不可超過 ${MAX_URL_LENGTH} 字` });
    return;
  }

  const result = await checkUrl(body.url);

  const [saved] = await db
    .insert(urlScansTable)
    .values({
      url: result.url,
      normalizedUrl: result.normalizedUrl,
      domain: result.domain,
      finalUrl: result.finalUrl,
      finalDomain: result.finalDomain,
      status: result.status,
      score: result.score,
      riskReasons: result.riskReasons,
      categories: result.categories,
      recommendation: result.recommendation,
    })
    .returning();

  res.json({
    id: saved.id,
    checkedAt: saved.createdAt.toISOString(),
    ...result,
  });
});

export default router;
