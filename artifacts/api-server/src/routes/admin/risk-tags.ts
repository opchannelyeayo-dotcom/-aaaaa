import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  riskTagsTable,
  riskTagRegionsTable,
  riskTagVersionsTable,
  analysisRecordsTable,
  RISK_GROUPS,
  RHETORIC_CATEGORIES,
  RISK_LEVELS,
  REVIEW_STATUSES,
  SOURCE_TYPES,
  type RiskTag,
  type RiskTagRegion,
  type RiskCase,
  type RiskSourceLink,
  type RiskGroup,
  type RhetoricCategory,
  type RiskLevel,
  type ReviewStatus,
  type SourceType,
} from "@workspace/db";
import { requireAdminAuth, requireRole } from "../../lib/admin-auth";
import { analyzeRiskText } from "../../lib/risk-analysis";

const router: IRouter = Router();

// Read access: any authenticated role (incl. viewer). Write access is
// further gated per-route below with requireRole.
router.use("/admin/risk-tags", requireAdminAuth);

const MAX_TEXT_LENGTH = 8000;
const MAX_NAME_LENGTH = 200;
const MAX_SLUG_LENGTH = 100;
const MAX_CASES = 50;
const MAX_SOURCE_LINKS = 30;
const REGION_CODE_RE = /^[A-Z]{2}$/;
const CONFIDENCE_LEVELS = new Set(["高", "中", "低"]);
const SOURCE_TYPE_VALUES = new Set<string>(SOURCE_TYPES.map((s) => s.value));

// ---------------------------------------------------------------------------
// JSON shaping
// ---------------------------------------------------------------------------

function tagToJson(t: RiskTag) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    riskGroup: t.riskGroup,
    category: t.category,
    definition: t.definition,
    defaultRiskLevel: t.defaultRiskLevel,
    suggestedCopy: t.suggestedCopy,
    impactSummary: t.impactSummary,
    active: t.active,
    reviewStatus: t.reviewStatus,
    sourceVerified: t.sourceVerified,
    needsRecheck: t.needsRecheck,
    maintainer: t.maintainer,
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function regionToJson(r: RiskTagRegion) {
  return {
    id: r.id,
    riskTagId: r.riskTagId,
    region: r.region,
    legalBasis: r.legalBasis,
    violationAspects: r.violationAspects,
    cases: r.cases,
    impact: r.impact,
    suggestedCopy: r.suggestedCopy,
    riskLevel: r.riskLevel,
    primarySourceType: r.primarySourceType,
    sourceLinks: r.sourceLinks,
    verified: r.verified,
    needsReview: r.needsReview,
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function regionsForTagIds(tagIds: number[]): Promise<Map<number, RiskTagRegion[]>> {
  if (tagIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(riskTagRegionsTable)
    .where(inArray(riskTagRegionsTable.riskTagId, tagIds));
  const map = new Map<number, RiskTagRegion[]>();
  for (const row of rows) {
    const list = map.get(row.riskTagId) ?? [];
    list.push(row);
    map.set(row.riskTagId, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Version / audit log helper — used by every mutating route below.
// ---------------------------------------------------------------------------

async function recordVersion(params: {
  riskTagId: number;
  region: string | null;
  action:
    | "create"
    | "update"
    | "delete"
    | "publish"
    | "unpublish"
    | "review_approve"
    | "review_reject";
  snapshot: unknown;
  changeNote?: string | null;
  req: Request;
}): Promise<void> {
  await db.insert(riskTagVersionsTable).values({
    riskTagId: params.riskTagId,
    region: params.region as never,
    action: params.action,
    snapshot: params.snapshot,
    changeNote: params.changeNote ?? null,
    editedBy: params.req.adminUser!.username,
    editedByRole: params.req.adminUser!.role,
  });
}

// ---------------------------------------------------------------------------
// GET /admin/risk-tags — search + filter + paginate
// ---------------------------------------------------------------------------

interface TagFilters {
  q?: string;
  riskGroup?: RiskGroup;
  category?: RhetoricCategory;
  reviewStatus?: ReviewStatus;
  active?: boolean;
  region?: string;
  needsRecheck?: boolean;
}

function parseTagFilters(query: Request["query"]): TagFilters {
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim() : undefined;
  const riskGroup =
    typeof query.riskGroup === "string" && (RISK_GROUPS as string[]).includes(query.riskGroup)
      ? (query.riskGroup as RiskGroup)
      : undefined;
  const category =
    typeof query.category === "string" &&
    (RHETORIC_CATEGORIES as string[]).includes(query.category)
      ? (query.category as RhetoricCategory)
      : undefined;
  const reviewStatus =
    typeof query.reviewStatus === "string" &&
    (REVIEW_STATUSES as string[]).includes(query.reviewStatus)
      ? (query.reviewStatus as ReviewStatus)
      : undefined;
  const active =
    query.active === "true" ? true : query.active === "false" ? false : undefined;
  const region =
    typeof query.region === "string" && REGION_CODE_RE.test(query.region)
      ? query.region
      : undefined;
  const needsRecheck =
    query.needsRecheck === "true" ? true : query.needsRecheck === "false" ? false : undefined;
  return { q, riskGroup, category, reviewStatus, active, region, needsRecheck };
}

router.get("/admin/risk-tags", async (req, res): Promise<void> => {
  const filters = parseTagFilters(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  let tags = await db.select().from(riskTagsTable).orderBy(desc(riskTagsTable.updatedAt));

  if (filters.q) {
    const term = filters.q.toLowerCase();
    tags = tags.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.slug.toLowerCase().includes(term) ||
        t.definition.toLowerCase().includes(term),
    );
  }
  if (filters.riskGroup) tags = tags.filter((t) => t.riskGroup === filters.riskGroup);
  if (filters.category) tags = tags.filter((t) => t.category === filters.category);
  if (filters.reviewStatus) tags = tags.filter((t) => t.reviewStatus === filters.reviewStatus);
  if (filters.active !== undefined) tags = tags.filter((t) => t.active === filters.active);
  if (filters.needsRecheck !== undefined)
    tags = tags.filter((t) => t.needsRecheck === filters.needsRecheck);

  const regionsByTag = await regionsForTagIds(tags.map((t) => t.id));

  if (filters.region) {
    tags = tags.filter((t) => (regionsByTag.get(t.id) ?? []).some((r) => r.region === filters.region));
  }

  const total = tags.length;
  const start = (page - 1) * pageSize;
  const pageTags = tags.slice(start, start + pageSize);

  res.json({
    riskTags: pageTags.map((t) => ({
      ...tagToJson(t),
      regions: (regionsByTag.get(t.id) ?? []).map((r) => r.region),
      caseCount: (regionsByTag.get(t.id) ?? []).reduce((sum, r) => sum + r.cases.length, 0),
    })),
    total,
    page,
    pageSize,
  });
});

// ---------------------------------------------------------------------------
// GET /admin/risk-tags/stats — analytics (MUST be before /:id)
// ---------------------------------------------------------------------------

router.get("/admin/risk-tags/stats", async (_req, res): Promise<void> => {
  const [tags, regions, analysisRecords] = await Promise.all([
    db.select().from(riskTagsTable),
    db.select().from(riskTagRegionsTable),
    db.select().from(analysisRecordsTable),
  ]);

  const countBy = <T extends string>(items: T[]): { key: T; count: number }[] => {
    const map = new Map<T, number>();
    for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
    return Array.from(map.entries()).map(([key, count]) => ({ key, count }));
  };

  const byRiskGroup = countBy(tags.map((t) => t.riskGroup));
  const byCategory = countBy(tags.map((t) => t.category));
  const byReviewStatus = countBy(tags.map((t) => t.reviewStatus));
  const byRegion = countBy(regions.map((r) => r.region));
  const bySourceType = countBy(regions.map((r) => r.primarySourceType));

  const tagDefaultRiskLevel = new Map(tags.map((t) => [t.id, t.defaultRiskLevel]));
  const effectiveRiskLevels = regions.map(
    (r) => r.riskLevel ?? tagDefaultRiskLevel.get(r.riskTagId) ?? "中",
  );
  const byRiskLevel = countBy(effectiveRiskLevels);

  const caseYearMap = new Map<string, number>();
  let totalCases = 0;
  for (const r of regions) {
    for (const c of r.cases) {
      totalCases += 1;
      caseYearMap.set(c.year, (caseYearMap.get(c.year) ?? 0) + 1);
    }
  }
  const caseCountByYear = Array.from(caseYearMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, count]) => ({ year, count }));

  // Cross-reference against real submitted analyses (analysis_records
  // annotations) so admins can see which risk-tag categories are actually
  // being triggered in the wild, not just how well-documented they are —
  // same source data /admin/records/stats already aggregates.
  const annotationCountByCategory = new Map<string, number>();
  for (const record of analysisRecords) {
    for (const ann of record.annotations) {
      annotationCountByCategory.set(
        ann.category,
        (annotationCountByCategory.get(ann.category) ?? 0) + 1,
      );
    }
  }
  const categoryCrossReference = RHETORIC_CATEGORIES.map((category) => ({
    category,
    tagCount: tags.filter((t) => t.category === category).length,
    caseCount: regions
      .filter((r) => tags.find((t) => t.id === r.riskTagId)?.category === category)
      .reduce((sum, r) => sum + r.cases.length, 0),
    flaggedInSubmissions: annotationCountByCategory.get(category) ?? 0,
  })).sort((a, b) => b.flaggedInSubmissions - a.flaggedInSubmissions);

  res.json({
    totalTags: tags.length,
    totalRegionEntries: regions.length,
    totalCases,
    needsRecheckCount: tags.filter((t) => t.needsRecheck).length,
    unverifiedRegionCount: regions.filter((r) => !r.verified).length,
    byRiskGroup,
    byCategory,
    byReviewStatus,
    byRegion,
    bySourceType,
    byRiskLevel,
    caseCountByYear,
    categoryCrossReference,
  });
});

// ---------------------------------------------------------------------------
// GET /admin/risk-tags/export — CSV export (MUST be before /:id)
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

router.get("/admin/risk-tags/export", async (_req, res): Promise<void> => {
  const tags = await db.select().from(riskTagsTable).orderBy(desc(riskTagsTable.updatedAt));
  const regionsByTag = await regionsForTagIds(tags.map((t) => t.id));

  const header = [
    "id",
    "slug",
    "name",
    "riskGroup",
    "category",
    "defaultRiskLevel",
    "reviewStatus",
    "active",
    "sourceVerified",
    "needsRecheck",
    "regions",
    "caseCount",
    "maintainer",
    "updatedAt",
  ];

  const rows = tags.map((t) => {
    const regions = regionsByTag.get(t.id) ?? [];
    return [
      String(t.id),
      t.slug,
      t.name,
      t.riskGroup,
      t.category,
      t.defaultRiskLevel,
      t.reviewStatus,
      String(t.active),
      String(t.sourceVerified),
      String(t.needsRecheck),
      regions.map((r) => r.region).join("; "),
      String(regions.reduce((sum, r) => sum + r.cases.length, 0)),
      t.maintainer ?? "",
      t.updatedAt.toISOString(),
    ]
      .map(csvEscape)
      .join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="risk-tags-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.send("﻿" + csv);
});

// ---------------------------------------------------------------------------
// POST /admin/risk-tags/analyze — on-demand risk classification for a piece
// of submitted copy, used by the admin UI as a decision-support tool (MUST
// be before /:id, same reasoning as /export and /stats above). Available to
// any authenticated role, including viewer — it's read-only with respect to
// the database (no risk_tags row is created/changed), the same access level
// as the GET routes above.
// ---------------------------------------------------------------------------

const MAX_ANALYZE_TEXT_LENGTH = 4000;
const MAX_ANALYZE_CONTEXT_LENGTH = 200;

// Light per-IP rate limit — this route calls the paid OpenAI API on every
// request (see lib/risk-analysis.ts), same cost-control reasoning as
// routes/rhetoric/index.ts's limiter, just more generous since callers here
// are authenticated admins rather than the open public site.
const ANALYZE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ANALYZE_RATE_LIMIT_MAX_REQUESTS = 60;
const analyzeRequestLog = new Map<string, { count: number; resetAt: number }>();

function analyzeRateLimit(req: Request, res: Response, next: () => void): void {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = analyzeRequestLog.get(key);

  if (!entry || entry.resetAt <= now) {
    analyzeRequestLog.set(key, { count: 1, resetAt: now + ANALYZE_RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= ANALYZE_RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ error: "請求過於頻繁，請稍後再試" });
    return;
  }

  entry.count += 1;
  next();
}

router.post("/admin/risk-tags/analyze", analyzeRateLimit, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (typeof body.text !== "string" || !body.text.trim()) {
    res.status(400).json({ error: "text 不可為空" });
    return;
  }
  if (body.text.length > MAX_ANALYZE_TEXT_LENGTH) {
    res.status(400).json({ error: `text 不可超過 ${MAX_ANALYZE_TEXT_LENGTH} 字` });
    return;
  }
  if (body.context !== undefined && typeof body.context !== "string") {
    res.status(400).json({ error: "context 格式錯誤" });
    return;
  }
  if (typeof body.context === "string" && body.context.length > MAX_ANALYZE_CONTEXT_LENGTH) {
    res.status(400).json({ error: `context 不可超過 ${MAX_ANALYZE_CONTEXT_LENGTH} 字` });
    return;
  }

  const result = await analyzeRiskText(body.text, body.context as string | undefined);

  if ("error" in result) {
    req.log?.warn({ err: result.error }, "risk-tags analyze: risk tag database unavailable");
    res.status(503).json(result);
    return;
  }

  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /admin/risk-tags/:id — full detail (tag + regions + recent versions)
// ---------------------------------------------------------------------------

router.get("/admin/risk-tags/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid risk tag id" });
    return;
  }

  const [tag] = await db.select().from(riskTagsTable).where(eq(riskTagsTable.id, id));
  if (!tag) {
    res.status(404).json({ error: "Risk tag not found" });
    return;
  }

  const regions = await db
    .select()
    .from(riskTagRegionsTable)
    .where(eq(riskTagRegionsTable.riskTagId, id));

  const versions = await db
    .select()
    .from(riskTagVersionsTable)
    .where(eq(riskTagVersionsTable.riskTagId, id))
    .orderBy(desc(riskTagVersionsTable.createdAt))
    .limit(50);

  res.json({
    ...tagToJson(tag),
    regions: regions.map(regionToJson),
    versions: versions.map((v) => ({
      id: v.id,
      region: v.region,
      action: v.action,
      snapshot: v.snapshot,
      changeNote: v.changeNote,
      editedBy: v.editedBy,
      editedByRole: v.editedByRole,
      createdAt: v.createdAt.toISOString(),
    })),
  });
});

// ---------------------------------------------------------------------------
// Field validation shared by create/update
// ---------------------------------------------------------------------------

interface ValidatedTagFields {
  slug?: string;
  name?: string;
  riskGroup?: RiskGroup;
  category?: RhetoricCategory;
  definition?: string;
  defaultRiskLevel?: RiskLevel;
  suggestedCopy?: string;
  impactSummary?: string;
  active?: boolean;
  reviewStatus?: ReviewStatus;
  sourceVerified?: boolean;
  needsRecheck?: boolean;
  maintainer?: string | null;
  notes?: string | null;
}

type ValidationResult =
  | { ok: true; fields: ValidatedTagFields }
  | { ok: false; error: string };

function validateTagFields(body: Record<string, unknown>, requireCore: boolean): ValidationResult {
  const fields: ValidatedTagFields = {};

  if (requireCore || "slug" in body) {
    if (typeof body.slug !== "string" || !/^[a-z0-9-]+$/.test(body.slug)) {
      return { ok: false, error: "slug 需為小寫英數字與連字號組成" };
    }
    if (body.slug.length > MAX_SLUG_LENGTH) return { ok: false, error: "slug 過長" };
    fields.slug = body.slug;
  }

  if (requireCore || "name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { ok: false, error: "標籤名稱不可為空" };
    }
    if (body.name.length > MAX_NAME_LENGTH) return { ok: false, error: "標籤名稱過長" };
    fields.name = body.name.trim();
  }

  if (requireCore || "riskGroup" in body) {
    if (typeof body.riskGroup !== "string" || !(RISK_GROUPS as string[]).includes(body.riskGroup)) {
      return { ok: false, error: "riskGroup 不合法" };
    }
    fields.riskGroup = body.riskGroup as RiskGroup;
  }

  if (requireCore || "category" in body) {
    if (
      typeof body.category !== "string" ||
      !(RHETORIC_CATEGORIES as string[]).includes(body.category)
    ) {
      return { ok: false, error: "category 不合法" };
    }
    fields.category = body.category as RhetoricCategory;
  }

  if ("definition" in body) {
    if (typeof body.definition !== "string" || body.definition.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: "問題定義格式錯誤或過長" };
    }
    fields.definition = body.definition;
  }

  if ("defaultRiskLevel" in body) {
    if (typeof body.defaultRiskLevel !== "string" || !(RISK_LEVELS as string[]).includes(body.defaultRiskLevel)) {
      return { ok: false, error: "風險等級需為 低/中/高" };
    }
    fields.defaultRiskLevel = body.defaultRiskLevel as RiskLevel;
  }

  if ("suggestedCopy" in body) {
    if (typeof body.suggestedCopy !== "string" || body.suggestedCopy.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: "建議文案格式錯誤或過長" };
    }
    fields.suggestedCopy = body.suggestedCopy;
  }

  if ("impactSummary" in body) {
    if (typeof body.impactSummary !== "string" || body.impactSummary.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: "影響層面格式錯誤或過長" };
    }
    fields.impactSummary = body.impactSummary;
  }

  if ("active" in body) {
    if (typeof body.active !== "boolean") return { ok: false, error: "active 需為布林值" };
    fields.active = body.active;
  }

  if ("reviewStatus" in body) {
    if (typeof body.reviewStatus !== "string" || !(REVIEW_STATUSES as string[]).includes(body.reviewStatus)) {
      return { ok: false, error: "審核狀態不合法" };
    }
    fields.reviewStatus = body.reviewStatus as ReviewStatus;
  }

  if ("sourceVerified" in body) {
    if (typeof body.sourceVerified !== "boolean") return { ok: false, error: "sourceVerified 需為布林值" };
    fields.sourceVerified = body.sourceVerified;
  }

  if ("needsRecheck" in body) {
    if (typeof body.needsRecheck !== "boolean") return { ok: false, error: "needsRecheck 需為布林值" };
    fields.needsRecheck = body.needsRecheck;
  }

  if ("maintainer" in body) {
    if (body.maintainer !== null && typeof body.maintainer !== "string") {
      return { ok: false, error: "維護人員格式錯誤" };
    }
    fields.maintainer = body.maintainer === null ? null : body.maintainer.trim() || null;
  }

  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return { ok: false, error: "備註格式錯誤" };
    }
    fields.notes = body.notes === null ? null : body.notes;
  }

  return { ok: true, fields };
}

function validateCases(value: unknown): RiskCase[] | null {
  if (!Array.isArray(value) || value.length > MAX_CASES) return null;
  const result: RiskCase[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    if (typeof c.year !== "string" || !c.year.trim()) return null;
    if (typeof c.title !== "string" || !c.title.trim()) return null;
    if (typeof c.summary !== "string" || !c.summary.trim()) return null;
    if (typeof c.sourceType !== "string" || !SOURCE_TYPE_VALUES.has(c.sourceType)) return null;
    if (c.sourceUrl !== null && typeof c.sourceUrl !== "string") return null;
    if (typeof c.confidence !== "string" || !CONFIDENCE_LEVELS.has(c.confidence)) return null;
    result.push({
      year: c.year.trim(),
      title: c.title.trim(),
      summary: c.summary,
      sourceType: c.sourceType as SourceType,
      sourceUrl: c.sourceUrl,
      confidence: c.confidence as "高" | "中" | "低",
    });
  }
  return result;
}

function validateSourceLinks(value: unknown): RiskSourceLink[] | null {
  if (!Array.isArray(value) || value.length > MAX_SOURCE_LINKS) return null;
  const result: RiskSourceLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const l = item as Record<string, unknown>;
    if (typeof l.label !== "string" || !l.label.trim()) return null;
    if (typeof l.url !== "string" || !l.url.trim()) return null;
    if (typeof l.sourceType !== "string" || !SOURCE_TYPE_VALUES.has(l.sourceType)) return null;
    if (typeof l.confidence !== "string" || !CONFIDENCE_LEVELS.has(l.confidence)) return null;
    result.push({
      label: l.label.trim(),
      url: l.url.trim(),
      sourceType: l.sourceType as SourceType,
      confidence: l.confidence as "高" | "中" | "低",
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// POST /admin/risk-tags — create
// ---------------------------------------------------------------------------

router.post(
  "/admin/risk-tags",
  requireRole("super_admin", "reviewer"),
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    if ("active" in body && body.active === true && req.adminUser!.role !== "super_admin") {
      res.status(403).json({ error: "只有超級管理員可以直接發布標籤" });
      return;
    }

    const result = validateTagFields(body, true);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    const [existing] = await db
      .select()
      .from(riskTagsTable)
      .where(eq(riskTagsTable.slug, result.fields.slug!));
    if (existing) {
      res.status(409).json({ error: "slug 已存在" });
      return;
    }

    const [created] = await db
      .insert(riskTagsTable)
      .values({
        slug: result.fields.slug!,
        name: result.fields.name!,
        riskGroup: result.fields.riskGroup!,
        category: result.fields.category!,
        definition: result.fields.definition ?? "",
        defaultRiskLevel: result.fields.defaultRiskLevel ?? "中",
        suggestedCopy: result.fields.suggestedCopy ?? "",
        impactSummary: result.fields.impactSummary ?? "",
        active: result.fields.active ?? false,
        reviewStatus: result.fields.reviewStatus ?? "draft",
        sourceVerified: result.fields.sourceVerified ?? false,
        needsRecheck: result.fields.needsRecheck ?? false,
        maintainer: result.fields.maintainer ?? req.adminUser!.username,
        notes: result.fields.notes ?? null,
      })
      .returning();

    await recordVersion({
      riskTagId: created.id,
      region: null,
      action: "create",
      snapshot: tagToJson(created),
      req,
    });

    res.status(201).json({ ...tagToJson(created), regions: [], caseCount: 0 });
  },
);

// ---------------------------------------------------------------------------
// PATCH /admin/risk-tags/:id — partial update of core fields
// ---------------------------------------------------------------------------

router.patch(
  "/admin/risk-tags/:id",
  requireRole("super_admin", "reviewer"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid risk tag id" });
      return;
    }

    const [existing] = await db.select().from(riskTagsTable).where(eq(riskTagsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Risk tag not found" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    // Publishing (active: true) is a super_admin-only action per the
    // review-workflow spec ("超級管理員可全權編輯與發布"); reviewers can
    // edit everything else, including flipping reviewStatus and unpublishing.
    if ("active" in body && body.active === true && req.adminUser!.role !== "super_admin") {
      res.status(403).json({ error: "只有超級管理員可以發布標籤" });
      return;
    }

    const result = validateTagFields(body, false);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    if ("slug" in result.fields && result.fields.slug !== existing.slug) {
      const [conflict] = await db
        .select()
        .from(riskTagsTable)
        .where(eq(riskTagsTable.slug, result.fields.slug!));
      if (conflict) {
        res.status(409).json({ error: "slug 已存在" });
        return;
      }
    }

    if (Object.keys(result.fields).length === 0) {
      res.status(400).json({ error: "沒有提供任何要更新的欄位" });
      return;
    }

    const [updated] = await db
      .update(riskTagsTable)
      .set({ ...result.fields, updatedAt: new Date() })
      .where(eq(riskTagsTable.id, id))
      .returning();

    const action =
      "active" in result.fields
        ? result.fields.active
          ? "publish"
          : "unpublish"
        : "reviewStatus" in result.fields
          ? result.fields.reviewStatus === "approved"
            ? "review_approve"
            : result.fields.reviewStatus === "needs_revision"
              ? "review_reject"
              : "update"
          : "update";

    await recordVersion({
      riskTagId: id,
      region: null,
      action,
      snapshot: tagToJson(updated),
      changeNote: typeof body.changeNote === "string" ? body.changeNote : null,
      req,
    });

    const regions = await db
      .select()
      .from(riskTagRegionsTable)
      .where(eq(riskTagRegionsTable.riskTagId, id));

    res.json({
      ...tagToJson(updated),
      regions: regions.map(regionToJson),
    });
  },
);

// ---------------------------------------------------------------------------
// DELETE /admin/risk-tags/:id — super_admin only
// ---------------------------------------------------------------------------

router.delete(
  "/admin/risk-tags/:id",
  requireRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid risk tag id" });
      return;
    }

    const [existing] = await db.select().from(riskTagsTable).where(eq(riskTagsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Risk tag not found" });
      return;
    }

    const regions = await db
      .select()
      .from(riskTagRegionsTable)
      .where(eq(riskTagRegionsTable.riskTagId, id));

    // Snapshot before delete so the audit trail retains what existed, even
    // though the tag row itself is gone afterwards (risk_tag_versions has no
    // FK constraint — consistent with the rest of this schema).
    await recordVersion({
      riskTagId: id,
      region: null,
      action: "delete",
      snapshot: { ...tagToJson(existing), regions: regions.map(regionToJson) },
      req,
    });

    await db.delete(riskTagRegionsTable).where(eq(riskTagRegionsTable.riskTagId, id));
    await db.delete(riskTagsTable).where(eq(riskTagsTable.id, id));

    res.json({ ok: true, id });
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/risk-tags/:id/regions/:region — create-or-update one region's content
// ---------------------------------------------------------------------------

router.put(
  "/admin/risk-tags/:id/regions/:region",
  requireRole("super_admin", "reviewer"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const region = String(req.params.region).toUpperCase();
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid risk tag id" });
      return;
    }
    if (!REGION_CODE_RE.test(region)) {
      res.status(400).json({ error: "region 需為兩碼大寫地區代碼，例如 TW" });
      return;
    }

    const [tag] = await db.select().from(riskTagsTable).where(eq(riskTagsTable.id, id));
    if (!tag) {
      res.status(404).json({ error: "Risk tag not found" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    if (
      "legalBasis" in body &&
      typeof body.legalBasis !== "string"
    ) {
      res.status(400).json({ error: "法源依據格式錯誤" });
      return;
    }
    if ("violationAspects" in body && typeof body.violationAspects !== "string") {
      res.status(400).json({ error: "可能違反的法規面向格式錯誤" });
      return;
    }
    if ("impact" in body && body.impact !== null && typeof body.impact !== "string") {
      res.status(400).json({ error: "風險影響格式錯誤" });
      return;
    }
    if ("suggestedCopy" in body && body.suggestedCopy !== null && typeof body.suggestedCopy !== "string") {
      res.status(400).json({ error: "建議文案格式錯誤" });
      return;
    }
    if ("riskLevel" in body && body.riskLevel !== null && !(RISK_LEVELS as string[]).includes(body.riskLevel as string)) {
      res.status(400).json({ error: "風險等級需為 低/中/高 或 null" });
      return;
    }
    if (
      "primarySourceType" in body &&
      (typeof body.primarySourceType !== "string" || !SOURCE_TYPE_VALUES.has(body.primarySourceType))
    ) {
      res.status(400).json({ error: "資料來源類型不合法" });
      return;
    }

    let cases: RiskCase[] | undefined;
    if ("cases" in body) {
      const parsed = validateCases(body.cases);
      if (!parsed) {
        res.status(400).json({ error: "案例格式錯誤（year/title/summary/sourceType/confidence 必填）" });
        return;
      }
      cases = parsed;
    }

    let sourceLinks: RiskSourceLink[] | undefined;
    if ("sourceLinks" in body) {
      const parsed = validateSourceLinks(body.sourceLinks);
      if (!parsed) {
        res.status(400).json({ error: "來源連結格式錯誤（label/url/sourceType/confidence 必填）" });
        return;
      }
      sourceLinks = parsed;
    }

    if ("verified" in body && typeof body.verified !== "boolean") {
      res.status(400).json({ error: "verified 需為布林值" });
      return;
    }
    if ("needsReview" in body && typeof body.needsReview !== "boolean") {
      res.status(400).json({ error: "needsReview 需為布林值" });
      return;
    }

    const existing = (
      await db.select().from(riskTagRegionsTable).where(eq(riskTagRegionsTable.riskTagId, id))
    ).find((r) => r.region === region);

    const values = {
      riskTagId: id,
      region: region as never,
      legalBasis: (body.legalBasis as string | undefined) ?? existing?.legalBasis ?? "",
      violationAspects:
        (body.violationAspects as string | undefined) ?? existing?.violationAspects ?? "",
      cases: cases ?? existing?.cases ?? [],
      impact: "impact" in body ? (body.impact as string | null) : (existing?.impact ?? null),
      suggestedCopy:
        "suggestedCopy" in body
          ? (body.suggestedCopy as string | null)
          : (existing?.suggestedCopy ?? null),
      riskLevel:
        "riskLevel" in body ? (body.riskLevel as RiskLevel | null) : (existing?.riskLevel ?? null),
      primarySourceType:
        (body.primarySourceType as SourceType | undefined) ?? existing?.primarySourceType ?? "news",
      sourceLinks: sourceLinks ?? existing?.sourceLinks ?? [],
      verified: "verified" in body ? (body.verified as boolean) : (existing?.verified ?? false),
      needsReview:
        "needsReview" in body ? (body.needsReview as boolean) : (existing?.needsReview ?? true),
      updatedAt: new Date(),
    };

    const [saved] = existing
      ? await db
          .update(riskTagRegionsTable)
          .set(values)
          .where(eq(riskTagRegionsTable.id, existing.id))
          .returning()
      : await db.insert(riskTagRegionsTable).values(values).returning();

    await recordVersion({
      riskTagId: id,
      region,
      action: existing ? "update" : "create",
      snapshot: regionToJson(saved),
      changeNote: typeof body.changeNote === "string" ? body.changeNote : null,
      req,
    });

    // Touch the parent tag's updatedAt so it surfaces at the top of the
    // admin list when only its region content changed.
    await db.update(riskTagsTable).set({ updatedAt: new Date() }).where(eq(riskTagsTable.id, id));

    res.json(regionToJson(saved));
  },
);

// ---------------------------------------------------------------------------
// DELETE /admin/risk-tags/:id/regions/:region — super_admin only
// ---------------------------------------------------------------------------

router.delete(
  "/admin/risk-tags/:id/regions/:region",
  requireRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const region = String(req.params.region).toUpperCase();
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid risk tag id" });
      return;
    }

    const rows = await db
      .select()
      .from(riskTagRegionsTable)
      .where(eq(riskTagRegionsTable.riskTagId, id));
    const target = rows.find((r) => r.region === region);
    if (!target) {
      res.status(404).json({ error: "Region entry not found" });
      return;
    }

    await recordVersion({
      riskTagId: id,
      region,
      action: "delete",
      snapshot: regionToJson(target),
      req,
    });

    await db.delete(riskTagRegionsTable).where(eq(riskTagRegionsTable.id, target.id));

    res.json({ ok: true, id, region });
  },
);

// ---------------------------------------------------------------------------
// GET /admin/risk-tags/:id/versions — paginated version/audit history
// ---------------------------------------------------------------------------

router.get("/admin/risk-tags/:id/versions", async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid risk tag id" });
    return;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));

  const all = await db
    .select()
    .from(riskTagVersionsTable)
    .where(eq(riskTagVersionsTable.riskTagId, id))
    .orderBy(desc(riskTagVersionsTable.createdAt));

  const total = all.length;
  const start = (page - 1) * pageSize;
  const pageRows = all.slice(start, start + pageSize);

  res.json({
    versions: pageRows.map((v) => ({
      id: v.id,
      region: v.region,
      action: v.action,
      snapshot: v.snapshot,
      changeNote: v.changeNote,
      editedBy: v.editedBy,
      editedByRole: v.editedByRole,
      createdAt: v.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
});

export default router;
