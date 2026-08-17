import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Source: 保健食品_成人與孕哺期精華表.csv (see scripts/src/seed-nutrient-data.ts)
// — a flat cross-tab of life stage × gender × nutrient, unlike
// nutrient-intake-guidelines' one-table-per-nutrient shape, so it gets its
// own table rather than being folded into `details`.
export const lifeStageNutrientsTable = pgTable("life_stage_nutrients", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // 資料分類
  lifeStage: text("life_stage").notNull(), // 生命期年齡層（含孕期/哺乳期）
  gender: text("gender").notNull(), // 性別
  nutrient: text("nutrient").notNull(), // 營養素
  intakeType: text("intake_type"), // 攝取量類型（EAR/RDA/AI/NE 等，部分列空白）
  // Kept as text, not numeric — source data has asterisked values like
  // "380*" flagging carried-over figures (see 備註).
  amount: text("amount").notNull(), // 建議攝取量數值
  unit: text("unit").notNull(), // 單位
  notes: text("notes"), // 備註
  reliability: text("reliability"), // 資料可信度
  source: text("source"), // 資料來源
  searchText: text("search_text").notNull(), // AI檢索用文字
});

export const insertLifeStageNutrientSchema = createInsertSchema(lifeStageNutrientsTable).omit({
  id: true,
});

export type InsertLifeStageNutrient = z.infer<typeof insertLifeStageNutrientSchema>;
export type LifeStageNutrient = typeof lifeStageNutrientsTable.$inferSelect;
