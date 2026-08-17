import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  riskTagsTable,
  riskTagRegionsTable,
  REGIONS,
  RHETORIC_CATEGORIES,
  type RiskTagRegion,
} from "@workspace/db";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Public, unauthenticated surface for the 話術風險標籤資料庫 — only tags an
// admin has explicitly published (active=true) AND that have cleared review
// (reviewStatus="approved") are ever returned here. Everything else (drafts,
// pending review, unverified regions) stays admin-only — see routes/admin/
// risk-tags.ts for the full editable dataset.
// ---------------------------------------------------------------------------

const REGION_LABELS = new Map(REGIONS.map((r) => [r.value, r.label]));
const REGION_CODE_RE = /^[A-Z]{2}$/i;

// A risk_tags row's `category` is one representative pick among the six
// rhetoric categories its riskGroup conceptually covers (see notes in
// scripts/src/seed-risk-tags.ts) — e.g. the urgency_manipulation tag is
// filed under category="恐懼訴求" but the group also covers 假稀缺/情緒勒索.
// Looking a category up by exact `category` match would therefore miss it
// for the other two. Map every category to its riskGroup instead, so any of
// the six annotation categories resolves to the one tag that documents it.
const CATEGORY_TO_RISK_GROUP: Record<string, string> = {
  誇大療效: "exaggerated_efficacy",
  恐懼訴求: "urgency_manipulation",
  假稀缺: "urgency_manipulation",
  情緒勒索: "urgency_manipulation",
  權威借位: "false_authority_social_proof",
  社會認同操控: "false_authority_social_proof",
};

function regionLabel(code: string): string {
  return REGION_LABELS.get(code as (typeof REGIONS)[number]["value"]) ?? code;
}

// GET /risk-tags/regions — which region codes actually have published
// content, for the frontend's region dropdown (MUST be before /risk-tags/:slug —
// same ordering reasoning as /records/stats in routes/records/index.ts).
router.get("/risk-tags/regions", async (_req, res): Promise<void> => {
  const publishedTags = await db
    .select({ id: riskTagsTable.id })
    .from(riskTagsTable)
    .where(and(eq(riskTagsTable.active, true), eq(riskTagsTable.reviewStatus, "approved")));

  if (publishedTags.length === 0) {
    res.json({ regions: [] });
    return;
  }

  const allRegions = await db.select().from(riskTagRegionsTable);
  const publishedIds = new Set(publishedTags.map((t) => t.id));
  const codes = new Set(
    allRegions.filter((r) => publishedIds.has(r.riskTagId)).map((r) => r.region),
  );

  res.json({
    // TW pinned first — it's this product's primary market (see seed data
    // notes), and the frontend defaults its region picker to whichever
    // region lands first in this list, not just to sorting labels
    // alphabetically. Everything else stays alphabetical by code.
    regions: Array.from(codes)
      .sort((a, b) => (a === "TW" ? -1 : b === "TW" ? 1 : a.localeCompare(b)))
      .map((code) => ({ code, label: regionLabel(code) })),
  });
});

const RHETORIC_CATEGORY_SET = new Set<string>(RHETORIC_CATEGORIES);

// GET /risk-tags/by-category/:category — full law/case detail (all regions,
// with cases + source links) for whichever published risk_tags row matches
// this rhetoric category. Powers the 話術拆解清單 on the public result page
// (artifacts/rhetoric-xray/src/pages/result.tsx): each detected annotation
// already carries one of the six categories, so it look this up per-card to
// show real law articles / administrative penalties / case precedents
// instead of just the category label. Same publish gate as the routes
// above — drafts and unreviewed content never reach this endpoint.
router.get("/risk-tags/by-category/:category", async (req, res): Promise<void> => {
  const category = req.params.category;
  if (!RHETORIC_CATEGORY_SET.has(category)) {
    res.status(400).json({ error: "category 不合法" });
    return;
  }
  const riskGroup = CATEGORY_TO_RISK_GROUP[category];

  const tags = await db
    .select()
    .from(riskTagsTable)
    .where(
      and(
        eq(riskTagsTable.riskGroup, riskGroup as (typeof riskTagsTable.$inferSelect)["riskGroup"]),
        eq(riskTagsTable.active, true),
        eq(riskTagsTable.reviewStatus, "approved"),
      ),
    );

  if (tags.length === 0) {
    res.json({ tags: [] });
    return;
  }

  const regionRows = await db.select().from(riskTagRegionsTable);
  const regionsByTag = new Map<number, RiskTagRegion[]>();
  for (const row of regionRows) {
    const list = regionsByTag.get(row.riskTagId) ?? [];
    list.push(row);
    regionsByTag.set(row.riskTagId, list);
  }

  res.json({
    tags: tags.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
      riskGroup: tag.riskGroup,
      category: tag.category,
      definition: tag.definition,
      defaultRiskLevel: tag.defaultRiskLevel,
      suggestedCopy: tag.suggestedCopy,
      impactSummary: tag.impactSummary,
      regions: (regionsByTag.get(tag.id) ?? []).map((r) => ({
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
      })),
    })),
  });
});

// GET /risk-tags?region=TW — simplified list for buyers/sellers/platform.
// region is optional; when omitted, every published tag is returned using
// its region-independent fallback text (definition/impactSummary/
// suggestedCopy/defaultRiskLevel from risk_tags core).
router.get("/risk-tags", async (req, res): Promise<void> => {
  const regionParam = typeof req.query.region === "string" ? req.query.region.toUpperCase() : undefined;
  if (regionParam && !REGION_CODE_RE.test(regionParam)) {
    res.status(400).json({ error: "region 需為兩碼地區代碼，例如 TW" });
    return;
  }

  const tags = await db
    .select()
    .from(riskTagsTable)
    .where(and(eq(riskTagsTable.active, true), eq(riskTagsTable.reviewStatus, "approved")));

  if (tags.length === 0) {
    res.json({ riskTags: [] });
    return;
  }

  const regionRows = await db.select().from(riskTagRegionsTable);
  const regionsByTag = new Map<number, RiskTagRegion[]>();
  for (const row of regionRows) {
    const list = regionsByTag.get(row.riskTagId) ?? [];
    list.push(row);
    regionsByTag.set(row.riskTagId, list);
  }

  const result = tags.map((tag) => {
    const regions = regionsByTag.get(tag.id) ?? [];
    const match = regionParam ? regions.find((r) => r.region === regionParam) : undefined;

    return {
      slug: tag.slug,
      name: tag.name,
      riskGroup: tag.riskGroup,
      category: tag.category,
      definition: tag.definition,
      riskLevel: match?.riskLevel ?? tag.defaultRiskLevel,
      impact: match?.impact ?? tag.impactSummary,
      suggestedCopy: match?.suggestedCopy ?? tag.suggestedCopy,
      region: match ? match.region : null,
      availableRegions: regions.map((r) => r.region),
    };
  });

  res.json({ riskTags: result });
});

export default router;
