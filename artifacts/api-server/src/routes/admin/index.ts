import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, ilike, eq, and, type SQL } from "drizzle-orm";
import { db, analysisRecordsTable, type AnalysisRecord } from "@workspace/db";
import {
  authenticateAdmin,
  issueSessionCookie,
  clearSessionCookie,
  requireAdminAuth,
} from "../../lib/admin-auth";
import productsRouter from "./products";
import riskTagsRouter from "./risk-tags";
import usersRouter from "./users";
import urlScansRouter from "./url-scans";

const router: IRouter = Router();

const RHETORIC_CATEGORIES = new Set([
  "恐懼訴求",
  "假稀缺",
  "社會認同操控",
  "權威借位",
  "情緒勒索",
  "誇大療效",
]);

// Same limits as artifacts/api-server/src/routes/rhetoric/index.ts (MAX_TEXT_LENGTH)
// — admin edits go through the same DB column, so keep the ceiling consistent.
const MAX_TEXT_LENGTH = 6000;
const MAX_EXPLANATION_LENGTH = 500;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

// Minimal in-memory fixed-window rate limiter, same shape as the one guarding
// /ocr and /analyze — this endpoint is unauthenticated by definition (it's
// how you *become* authenticated), so it needs its own brute-force guard.
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 20;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    res.status(429).json({ error: "登入嘗試過於頻繁，請稍後再試" });
    return;
  }

  entry.count += 1;
  next();
}

router.post("/admin/login", loginRateLimit, async (req, res): Promise<void> => {
  const { username, password } = (req.body ?? {}) as {
    username?: unknown;
    password?: unknown;
  };

  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "請輸入帳號與密碼" });
    return;
  }

  const identity = await authenticateAdmin(username, password);
  if (!identity) {
    res.status(401).json({ error: "帳號或密碼錯誤" });
    return;
  }

  issueSessionCookie(res, identity.username, identity.role);
  res.json({ ok: true, role: identity.role });
});

router.post("/admin/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Lets the frontend check on load whether the session cookie is still valid,
// without triggering a 401 toast — same requireAdminAuth middleware, just a
// route whose entire job is to succeed or fail. Also returns the role so the
// frontend can gate UI (e.g. hide publish/delete for viewer/reviewer)
// without re-decoding the cookie itself.
router.get("/admin/session", requireAdminAuth, (req, res): void => {
  res.json({ ok: true, username: req.adminUser!.username, role: req.adminUser!.role });
});

// Everything below requires a valid session.
router.use("/admin/records", requireAdminAuth);

// ---------------------------------------------------------------------------
// Shared query building
// ---------------------------------------------------------------------------

interface RecordFilters {
  q?: string;
  inputType?: "text" | "image";
  category?: string;
}

function parseFilters(query: Request["query"]): RecordFilters {
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim() : undefined;
  const inputType =
    query.inputType === "text" || query.inputType === "image" ? query.inputType : undefined;
  const category =
    typeof query.category === "string" && RHETORIC_CATEGORIES.has(query.category)
      ? query.category
      : undefined;
  return { q, inputType, category };
}

// category isn't a real column (it lives inside the annotations JSONB
// array), so it's filtered in memory after the SQL-level filters run. Given
// this app's documented scale (a handful of pilot testers, not production
// traffic — see replit.md), fetching the SQL-filtered set into memory once
// and slicing/sorting/paginating there is consistent with how
// /records/stats already works, and avoids a jsonb containment query.
async function queryFilteredRecords(filters: RecordFilters): Promise<AnalysisRecord[]> {
  const conditions: SQL[] = [];
  if (filters.q) conditions.push(ilike(analysisRecordsTable.originalText, `%${filters.q}%`));
  if (filters.inputType) conditions.push(eq(analysisRecordsTable.inputType, filters.inputType));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(analysisRecordsTable)
    .where(whereClause)
    .orderBy(desc(analysisRecordsTable.createdAt));

  if (!filters.category) return rows;

  return rows.filter((r) =>
    r.annotations.some((a) => a.category === filters.category),
  );
}

function toSummary(r: AnalysisRecord) {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    inputType: r.inputType,
    credibilityScore: r.credibilityScore,
    originalText:
      r.originalText.length > 160 ? r.originalText.slice(0, 160) + "..." : r.originalText,
    annotationCount: r.annotations.length,
    categories: Array.from(new Set(r.annotations.map((a) => a.category))),
  };
}

// ---------------------------------------------------------------------------
// GET /admin/records — search + filter + sort + paginate
// ---------------------------------------------------------------------------

const SORTS = ["newest", "oldest", "score_asc", "score_desc"] as const;
type Sort = (typeof SORTS)[number];

function sortRecords(records: AnalysisRecord[], sort: Sort): AnalysisRecord[] {
  const sorted = [...records];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    case "score_asc":
      return sorted.sort((a, b) => a.credibilityScore - b.credibilityScore);
    case "score_desc":
      return sorted.sort((a, b) => b.credibilityScore - a.credibilityScore);
    case "newest":
    default:
      return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

router.get("/admin/records", async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);

  const sortParam = typeof req.query.sort === "string" ? req.query.sort : "newest";
  const sort: Sort = (SORTS as readonly string[]).includes(sortParam)
    ? (sortParam as Sort)
    : "newest";

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const filtered = sortRecords(await queryFilteredRecords(filters), sort);
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageRecords = filtered.slice(start, start + pageSize);

  res.json({
    records: pageRecords.map(toSummary),
    total,
    page,
    pageSize,
  });
});

// ---------------------------------------------------------------------------
// GET /admin/records/stats — dashboard aggregates
// ---------------------------------------------------------------------------

router.get("/admin/records/stats", async (_req, res): Promise<void> => {
  const records = await db.select().from(analysisRecordsTable);

  const totalRecords = records.length;
  const avgCredibilityScore =
    totalRecords > 0
      ? records.reduce((sum, r) => sum + r.credibilityScore, 0) / totalRecords
      : 0;

  const categoryCountMap = new Map<string, number>();
  for (const record of records) {
    for (const ann of record.annotations) {
      categoryCountMap.set(ann.category, (categoryCountMap.get(ann.category) ?? 0) + 1);
    }
  }
  const categoryBreakdown = Array.from(categoryCountMap.entries()).map(
    ([category, count]) => ({ category, count }),
  );

  // Average credibility score per day, oldest to newest, so the frontend can
  // plot a trend line. Keyed on the record's own createdAt date (UTC) rather
  // than a DB-side date_trunc, again to keep this on the same
  // fetch-then-aggregate-in-JS path the rest of the file uses.
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const record of records) {
    const day = record.createdAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += record.credibilityScore;
    bucket.count += 1;
    byDay.set(day, bucket);
  }
  const scoreTrend = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date,
      avgCredibilityScore: sum / count,
      count,
    }));

  res.json({ totalRecords, avgCredibilityScore, categoryBreakdown, scoreTrend });
});

// ---------------------------------------------------------------------------
// GET /admin/records/export — CSV export, respects the same filters as the
// list endpoint (MUST be before /admin/records/:id, same reasoning as
// /records/stats in routes/records/index.ts)
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

router.get("/admin/records/export", async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);
  const sortParam = typeof req.query.sort === "string" ? req.query.sort : "newest";
  const sort: Sort = (SORTS as readonly string[]).includes(sortParam)
    ? (sortParam as Sort)
    : "newest";

  const records = sortRecords(await queryFilteredRecords(filters), sort);

  const header = [
    "id",
    "createdAt",
    "inputType",
    "credibilityScore",
    "categories",
    "annotationCount",
    "originalText",
    "neutralRewrite",
  ];

  const rows = records.map((r) =>
    [
      String(r.id),
      r.createdAt.toISOString(),
      r.inputType,
      String(r.credibilityScore),
      Array.from(new Set(r.annotations.map((a) => a.category))).join("; "),
      String(r.annotations.length),
      r.originalText,
      r.neutralRewrite,
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [header.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="analysis-records-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  // BOM so Excel (incl. Excel for Mac/Windows opening this outside a UTF-8
  // aware import flow) doesn't mangle the Chinese text.
  res.send("﻿" + csv);
});

// ---------------------------------------------------------------------------
// GET /admin/records/:id — full detail
// ---------------------------------------------------------------------------

router.get("/admin/records/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid record id" });
    return;
  }

  const [record] = await db
    .select()
    .from(analysisRecordsTable)
    .where(eq(analysisRecordsTable.id, id));

  if (!record) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  res.json({
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    inputType: record.inputType,
    originalText: record.originalText,
    annotations: record.annotations,
    credibilityScore: record.credibilityScore,
    neutralRewrite: record.neutralRewrite,
    matchedProducts: record.matchedProducts,
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/records/:id
// ---------------------------------------------------------------------------

router.delete("/admin/records/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid record id" });
    return;
  }

  const [deleted] = await db
    .delete(analysisRecordsTable)
    .where(eq(analysisRecordsTable.id, id))
    .returning({ id: analysisRecordsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  res.json({ ok: true, id: deleted.id });
});

// ---------------------------------------------------------------------------
// PATCH /admin/records/:id — edit originalText / credibilityScore /
// neutralRewrite / annotations. All fields optional (only the ones present
// in the body get updated), mirroring how the admin console's edit form
// only sends what actually changed.
// ---------------------------------------------------------------------------

interface AnnotationInput {
  textSpan: string;
  category: string;
  explanation: string;
}

function parseAnnotations(value: unknown): AnnotationInput[] | null {
  if (!Array.isArray(value)) return null;

  const result: AnnotationInput[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).textSpan !== "string" ||
      typeof (item as Record<string, unknown>).category !== "string" ||
      typeof (item as Record<string, unknown>).explanation !== "string"
    ) {
      return null;
    }

    const textSpan = ((item as Record<string, unknown>).textSpan as string).trim();
    const category = (item as Record<string, unknown>).category as string;
    const explanation = ((item as Record<string, unknown>).explanation as string).trim();

    if (!textSpan || !explanation) return null;
    if (!RHETORIC_CATEGORIES.has(category)) return null;
    if (explanation.length > MAX_EXPLANATION_LENGTH) return null;

    result.push({ textSpan, category, explanation });
  }
  return result;
}

router.patch("/admin/records/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid record id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(analysisRecordsTable)
    .where(eq(analysisRecordsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Partial<
    Pick<AnalysisRecord, "originalText" | "credibilityScore" | "neutralRewrite" | "annotations">
  > = {};

  if ("originalText" in body) {
    if (typeof body.originalText !== "string" || !body.originalText.trim()) {
      res.status(400).json({ error: "原文不可為空" });
      return;
    }
    if (body.originalText.length > MAX_TEXT_LENGTH) {
      res.status(400).json({ error: `原文不可超過 ${MAX_TEXT_LENGTH} 字` });
      return;
    }
    updates.originalText = body.originalText;
  }

  if ("credibilityScore" in body) {
    const score = Number(body.credibilityScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      res.status(400).json({ error: "信任度分數需為 0-100 的數字" });
      return;
    }
    updates.credibilityScore = score;
  }

  if ("neutralRewrite" in body) {
    if (typeof body.neutralRewrite !== "string" || !body.neutralRewrite.trim()) {
      res.status(400).json({ error: "中性改寫版不可為空" });
      return;
    }
    if (body.neutralRewrite.length > MAX_TEXT_LENGTH) {
      res.status(400).json({ error: `中性改寫版不可超過 ${MAX_TEXT_LENGTH} 字` });
      return;
    }
    updates.neutralRewrite = body.neutralRewrite;
  }

  if ("annotations" in body) {
    const parsed = parseAnnotations(body.annotations);
    if (!parsed) {
      res.status(400).json({ error: "話術標註格式錯誤" });
      return;
    }
    updates.annotations = parsed;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "沒有提供任何要更新的欄位" });
    return;
  }

  // Same textSpan/originalText consistency guarantee /analyze enforces (see
  // CODE_REVIEW.md) — validated against whichever originalText/annotations
  // are in effect after this update (newly submitted, or existing).
  const effectiveText = updates.originalText ?? existing.originalText;
  const effectiveAnnotations = updates.annotations ?? existing.annotations;
  const brokenSpan = effectiveAnnotations.find((a) => !effectiveText.includes(a.textSpan));
  if (brokenSpan) {
    res.status(400).json({
      error: `話術標註「${brokenSpan.textSpan}」無法在原文中找到，請確認原文與標註內容一致`,
    });
    return;
  }

  const [updated] = await db
    .update(analysisRecordsTable)
    .set(updates)
    .where(eq(analysisRecordsTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    createdAt: updated.createdAt.toISOString(),
    inputType: updated.inputType,
    originalText: updated.originalText,
    annotations: updated.annotations,
    credibilityScore: updated.credibilityScore,
    neutralRewrite: updated.neutralRewrite,
    matchedProducts: updated.matchedProducts,
  });
});

router.use(productsRouter);
router.use(riskTagsRouter);
router.use(usersRouter);
router.use(urlScansRouter);

export default router;
