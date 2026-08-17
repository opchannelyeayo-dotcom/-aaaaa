import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, analysisRecordsTable } from "@workspace/db";
import {
  ListRecordsResponse,
  GetRecordStatsResponse,
  GetRecordParams,
  GetRecordResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /records — list all records, newest first
router.get("/records", async (req, res): Promise<void> => {
  const records = await db
    .select()
    .from(analysisRecordsTable)
    .orderBy(desc(analysisRecordsTable.createdAt));

  const summaries = records.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    inputType: r.inputType,
    credibilityScore: r.credibilityScore,
    originalText:
      r.originalText.length > 120
        ? r.originalText.slice(0, 120) + "..."
        : r.originalText,
    annotationCount: (
      r.annotations as Array<{ textSpan: string; category: string }>
    ).length,
    role: r.role,
    riskLevel: r.riskLevel,
  }));

  res.json(ListRecordsResponse.parse(summaries));
});

// GET /records/stats — aggregate stats (MUST be before /:id)
router.get("/records/stats", async (req, res): Promise<void> => {
  const records = await db.select().from(analysisRecordsTable);

  const totalRecords = records.length;
  const avgCredibilityScore =
    totalRecords > 0
      ? records.reduce((sum, r) => sum + r.credibilityScore, 0) / totalRecords
      : 0;

  const categoryCountMap = new Map<string, number>();
  for (const record of records) {
    const annotations = record.annotations as Array<{ category: string }>;
    for (const ann of annotations) {
      categoryCountMap.set(
        ann.category,
        (categoryCountMap.get(ann.category) ?? 0) + 1,
      );
    }
  }

  const categoryBreakdown = Array.from(categoryCountMap.entries()).map(
    ([category, count]) => ({ category, count }),
  );

  res.json(
    GetRecordStatsResponse.parse({
      totalRecords,
      avgCredibilityScore,
      categoryBreakdown,
    }),
  );
});

// GET /records/:id — single record
router.get("/records/:id", async (req, res): Promise<void> => {
  const params = GetRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [record] = await db
    .select()
    .from(analysisRecordsTable)
    .where(eq(analysisRecordsTable.id, params.data.id));

  if (!record) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  res.json(
    GetRecordResponse.parse({
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      inputType: record.inputType,
      originalText: record.originalText,
      annotations: record.annotations,
      credibilityScore: record.credibilityScore,
      neutralRewrite: record.neutralRewrite,
      matchedProducts: record.matchedProducts,
      role: record.role,
      verdict: record.verdict,
      coreJudgment: record.coreJudgment,
      mainStrengths: record.mainStrengths,
      mainRisks: record.mainRisks,
      improvementSuggestions: record.improvementSuggestions,
      riskLevel: record.riskLevel,
    }),
  );
});

export default router;
