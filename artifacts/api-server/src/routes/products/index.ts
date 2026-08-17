import { Router, type IRouter } from "express";
import { ilike, or, type SQL } from "drizzle-orm";
import { db, referenceProductsTable, type ReferenceProduct } from "@workspace/db";
import { SearchProductsQueryParams, SearchProductsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Cap results returned to an unauthenticated public endpoint — a query with
// no `q` would otherwise dump the entire reference table (same guardrail
// rationale as the rhetoric routes' rate limiter: no login, so keep the
// worst case cheap).
const MAX_RESULTS = 50;

function toPublicJson(p: ReferenceProduct) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    manufacturer: p.manufacturer,
    registrationNumber: p.registrationNumber,
    approvedUses: p.approvedUses,
    ingredients: p.ingredients,
    sourceUrl: p.sourceUrl,
    drugCode: p.drugCode,
    formulaName: p.formulaName,
    dosageForm: p.dosageForm,
    issuedDate: p.issuedDate,
    sourceId: p.sourceId,
    applicant: p.applicant,
    certificateStatus: p.certificateStatus,
    efficacyIngredients: p.efficacyIngredients,
    efficacyClaim: p.efficacyClaim,
    warningText: p.warningText,
    warningTextSimplified: p.warningTextSimplified,
    precautions: p.precautions,
  };
}

// GET /products — public read-only search (name / manufacturer / registration
// number), backed by the same reference_products table admin-console manages
// at /admin/products.
router.get("/products", async (req, res): Promise<void> => {
  const parsed = SearchProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const q = parsed.data.q?.trim();

  const whereClause: SQL | undefined = q
    ? or(
        ilike(referenceProductsTable.name, `%${q}%`),
        ilike(referenceProductsTable.manufacturer, `%${q}%`),
        ilike(referenceProductsTable.registrationNumber, `%${q}%`),
      )
    : undefined;

  const products = await db
    .select()
    .from(referenceProductsTable)
    .where(whereClause)
    .limit(MAX_RESULTS);

  res.json(SearchProductsResponse.parse(products.map(toPublicJson)));
});

export default router;
