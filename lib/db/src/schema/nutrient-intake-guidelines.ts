import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Source: 衛福部國健署《國人膳食營養素參考攝取量第八版》(TFDA/HPA nutrient
// reference intake tables), one row per life-stage/subgroup entry.
//
// The source CSVs (蛋白質/鈉/鉀/鎂/鐵) share a common shape (category,
// life stage, notes, reliability, source, search text) but differ in their
// nutrient-specific numeric columns — e.g. 蛋白質 has a 性別 column, 鈉 has a
// 建議攝取量類別 + 約當食鹽克數 column, 鉀/鎂/鐵 have a 需人工複核性別差異
// column. Rather than forcing a rigid shared shape (mostly-null columns) or
// a separate table per nutrient, the nutrient-specific fields are kept
// verbatim in `details` and rendered generically on the frontend.
export const nutrientIntakeGuidelinesTable = pgTable("nutrient_intake_guidelines", {
  id: serial("id").primaryKey(),
  nutrient: text("nutrient").notNull(), // 蛋白質 / 鈉 / 鉀 / 鎂 / 鐵
  category: text("category").notNull(), // 資料分類（CSV 第一欄，例如「蛋白質建議攝取量」或其「-補充規範」列）
  lifeStage: text("life_stage"), // 生命期年齡層（補充規範彙整列為 null）
  notes: text("notes"), // 備註
  reliability: text("reliability"), // 資料可信度
  source: text("source"), // 資料來源
  searchText: text("search_text").notNull(), // AI檢索用文字
  details: jsonb("details").notNull().$type<Record<string, string>>(), // 其餘隨營養素而異的欄位（原始中文欄名 → 值）
});

export const insertNutrientIntakeGuidelineSchema = createInsertSchema(
  nutrientIntakeGuidelinesTable,
).omit({ id: true });

export type InsertNutrientIntakeGuideline = z.infer<typeof insertNutrientIntakeGuidelineSchema>;
export type NutrientIntakeGuideline = typeof nutrientIntakeGuidelinesTable.$inferSelect;
