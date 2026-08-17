import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Source: 健康食品_功效分類統計.csv / 健康食品_廠商統計.csv — precomputed
// aggregate counts (not derived at query time from reference_products, since
// the source data covers the full 衛福部 approved health-food dataset, a
// much larger set than what's been imported into reference_products).
export const healthFoodStatsTable = pgTable("health_food_stats", {
  id: serial("id").primaryKey(),
  statType: text("stat_type").notNull(), // "efficacy" | "manufacturer"
  label: text("label").notNull(), // 功效組合 or 廠商名稱
  count: integer("count").notNull(), // 產品數
});

export const insertHealthFoodStatSchema = createInsertSchema(healthFoodStatsTable).omit({
  id: true,
});

export type InsertHealthFoodStat = z.infer<typeof insertHealthFoodStatSchema>;
export type HealthFoodStat = typeof healthFoodStatsTable.$inferSelect;
