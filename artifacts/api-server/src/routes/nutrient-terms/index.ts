import { Router, type IRouter } from "express";
import { db, nutrientTermsTable } from "@workspace/db";
import { ListNutrientTermsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /nutrient-terms — public read-only list of the seeded EAR/RDA/AI/UL/
// AMDR/CDRR glossary (see scripts/src/seed-nutrient-data.ts).
router.get("/nutrient-terms", async (_req, res): Promise<void> => {
  const rows = await db.select().from(nutrientTermsTable).orderBy(nutrientTermsTable.id);
  res.json(ListNutrientTermsResponse.parse(rows));
});

export default router;
