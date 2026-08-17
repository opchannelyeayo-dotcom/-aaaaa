import { Router, type IRouter, type Request } from "express";
import { desc, eq, ilike, and, type SQL } from "drizzle-orm";
import { db, urlScansTable, type UrlScan } from "@workspace/db";
import { requireAdminAuth, requireRole } from "../../lib/admin-auth";

const router: IRouter = Router();

// Read access for any authenticated role, same as /admin/risk-tags — this is
// generated data (scan history), not curated content, so there's no
// create/edit surface, only listing and deletion (for purging test/junk
// entries), and deletion stays super_admin-only.
router.use("/admin/url-scans", requireAdminAuth);

const STATUSES = new Set(["safe", "suspicious", "high_risk", "unknown"]);

function toJson(s: UrlScan) {
  return {
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    url: s.url,
    normalizedUrl: s.normalizedUrl,
    domain: s.domain,
    finalUrl: s.finalUrl,
    finalDomain: s.finalDomain,
    status: s.status,
    score: s.score,
    riskReasons: s.riskReasons,
    categories: s.categories,
    recommendation: s.recommendation,
  };
}

interface Filters {
  q?: string;
  status?: string;
}

function parseFilters(query: Request["query"]): Filters {
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim() : undefined;
  const status = typeof query.status === "string" && STATUSES.has(query.status) ? query.status : undefined;
  return { q, status };
}

router.get("/admin/url-scans", async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const conditions: SQL[] = [];
  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(ilike(urlScansTable.domain, term));
  }
  if (filters.status) conditions.push(eq(urlScansTable.status, filters.status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(urlScansTable)
    .where(whereClause)
    .orderBy(desc(urlScansTable.createdAt));

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const statusCounts = { safe: 0, suspicious: 0, high_risk: 0, unknown: 0 } as Record<string, number>;
  for (const row of rows) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;

  res.json({
    scans: pageRows.map(toJson),
    total,
    page,
    pageSize,
    statusCounts,
  });
});

router.delete(
  "/admin/url-scans/:id",
  requireRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid scan id" });
      return;
    }

    const [deleted] = await db
      .delete(urlScansTable)
      .where(eq(urlScansTable.id, id))
      .returning({ id: urlScansTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    res.json({ ok: true, id: deleted.id });
  },
);

export default router;
