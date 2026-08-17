import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, healthFoodStatsTable } from "@workspace/db";
import { ListHealthFoodStatsQueryParams, ListHealthFoodStatsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /health-food-stats — public read-only aggregate counts (see
// scripts/src/seed-nutrient-data.ts for the source data).
router.get("/health-food-stats", async (req, res): Promise<void> => {
  const parsed = ListHealthFoodStatsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(healthFoodStatsTable)
    .where(eq(healthFoodStatsTable.statType, parsed.data.type))
    .orderBy(desc(healthFoodStatsTable.count));

  res.json(ListHealthFoodStatsResponse.parse(rows));
});

export default router;
