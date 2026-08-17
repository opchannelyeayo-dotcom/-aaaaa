import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, nutrientIntakeGuidelinesTable } from "@workspace/db";
import { ListNutrientGuidelinesQueryParams, ListNutrientGuidelinesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /nutrients — public read-only list of the seeded 衛福部國健署 nutrient
// reference-intake guidelines (see scripts/src/seed-nutrient-data.ts).
router.get("/nutrients", async (req, res): Promise<void> => {
  const parsed = ListNutrientGuidelinesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const nutrient = parsed.data.nutrient?.trim();

  const rows = await db
    .select()
    .from(nutrientIntakeGuidelinesTable)
    .where(nutrient ? eq(nutrientIntakeGuidelinesTable.nutrient, nutrient) : undefined)
    .orderBy(nutrientIntakeGuidelinesTable.id);

  res.json(ListNutrientGuidelinesResponse.parse(rows));
});

export default router;
