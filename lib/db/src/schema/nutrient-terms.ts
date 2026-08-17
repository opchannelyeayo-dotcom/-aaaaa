import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Source: 保健食品_名詞說明.csv (see scripts/src/seed-nutrient-data.ts) — the
// EAR/RDA/AI/UL/AMDR/CDRR glossary that the nutrient-intake-guidelines
// numbers are only meaningful in the context of.
export const nutrientTermsTable = pgTable("nutrient_terms", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // 資料分類
  abbreviation: text("abbreviation"), // 縮寫（總覽列沒有縮寫）
  chineseName: text("chinese_name").notNull(), // 中文全名
  englishName: text("english_name"), // 英文全名
  definition: text("definition").notNull(), // 定義
  notes: text("notes"), // 備註
  reliability: text("reliability"), // 資料可信度
  source: text("source"), // 資料來源
  searchText: text("search_text").notNull(), // AI檢索用文字
});

export const insertNutrientTermSchema = createInsertSchema(nutrientTermsTable).omit({
  id: true,
});

export type InsertNutrientTerm = z.infer<typeof insertNutrientTermSchema>;
export type NutrientTerm = typeof nutrientTermsTable.$inferSelect;
