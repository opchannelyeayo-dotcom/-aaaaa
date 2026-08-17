import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// 網址安全查詢 — consumer-facing URL/link checker (see routes/url-scan). Every
// submitted URL gets a heuristic + (optional) LLM-assisted risk read, logged
// here so admins get visibility into what's actually being checked (see
// routes/admin/url-scans.ts), similar in spirit to analysis_records for the
// rhetoric analyzer.
export const urlScansTable = pgTable("url_scans", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  url: text("url").notNull(), // as submitted by the user
  normalizedUrl: text("normalized_url").notNull(),
  domain: text("domain").notNull(),
  finalUrl: text("final_url"), // after following redirects (e.g. URL shorteners), if resolved
  finalDomain: text("final_domain"),
  status: text("status").notNull(), // "safe" | "suspicious" | "high_risk" | "unknown"
  score: integer("score").notNull(), // 0-100, higher = safer
  riskReasons: jsonb("risk_reasons").notNull().default([]).$type<string[]>(),
  categories: jsonb("categories").notNull().default([]).$type<string[]>(),
  recommendation: text("recommendation").notNull().default(""),
});

export const insertUrlScanSchema = createInsertSchema(urlScansTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUrlScan = z.infer<typeof insertUrlScanSchema>;
export type UrlScan = typeof urlScansTable.$inferSelect;
