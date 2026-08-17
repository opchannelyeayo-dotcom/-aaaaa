import { Router, type IRouter } from "express";
import { db, lifeStageNutrientsTable } from "@workspace/db";
import { ListLifeStageNutrientsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /life-stage-nutrients — public read-only list of the seeded
// 成人與孕哺期精華表 (see scripts/src/seed-nutrient-data.ts). Small, fixed
// dataset — the frontend groups/filters it client-side rather than this
// route taking query params, same approach as /nutrients.
router.get("/life-stage-nutrients", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(lifeStageNutrientsTable)
    .orderBy(lifeStageNutrientsTable.id);
  res.json(ListLifeStageNutrientsResponse.parse(rows));
});

export default router;
