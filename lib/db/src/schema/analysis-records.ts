import { pgTable, text, serial, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analysisRecordsTable = pgTable("analysis_records", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  inputType: text("input_type").notNull(), // "text" | "image"
  // Which perspective the analysis was run from — seller (賣家, 推銷/成交/
  // 說服力導向) vs consumer (消費者, 信任/理解/風險導向). Drives an entirely
  // different LLM system prompt (see routes/rhetoric), not just a UI label.
  role: text("role").notNull().default("consumer"), // "seller" | "consumer"
  originalText: text("original_text").notNull(),
  annotations: jsonb("annotations").notNull().$type<
    Array<{
      textSpan: string;
      category: string;
      explanation: string;
    }>
  >(),
  credibilityScore: real("credibility_score").notNull(),
  neutralRewrite: text("neutral_rewrite").notNull(),
  // Role-specific structured judgment (see spec: 角色/判定/核心判斷/主要優點/
  // 主要風險/改進建議/風險等級) — the seller/consumer prompts each produce
  // this same shape, just reasoned about from a different perspective.
  verdict: text("verdict").notNull().default(""), // 判定
  coreJudgment: text("core_judgment").notNull().default(""), // 核心判斷
  mainStrengths: jsonb("main_strengths").notNull().default([]).$type<string[]>(), // 主要優點
  mainRisks: jsonb("main_risks").notNull().default([]).$type<string[]>(), // 主要風險
  improvementSuggestions: jsonb("improvement_suggestions").notNull().default([]).$type<string[]>(), // 改進建議
  riskLevel: text("risk_level").notNull().default("中"), // 風險等級："低" | "中" | "高"
  // Reference products (see reference-products.ts) whose name appeared in the
  // analyzed text, snapshotted at analysis time so history stays accurate
  // even if the reference entry is later edited or deleted.
  matchedProducts: jsonb("matched_products")
    .notNull()
    .default([])
    .$type<
      Array<{
        id: number;
        name: string;
        category: string;
        registrationNumber: string | null;
        approvedUses: string;
      }>
    >(),
});

export const insertAnalysisRecordSchema = createInsertSchema(
  analysisRecordsTable,
).omit({ id: true, createdAt: true });

export type InsertAnalysisRecord = z.infer<typeof insertAnalysisRecordSchema>;
export type AnalysisRecord = typeof analysisRecordsTable.$inferSelect;
