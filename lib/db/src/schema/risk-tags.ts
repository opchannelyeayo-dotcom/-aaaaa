import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// 話術風險標籤資料庫 (risk tag knowledge base) — the structured, admin-
// maintained counterpart to the six rhetoric categories already annotated on
// analysis_records (see analysis-records.ts). Each tag documents *why* a
// phrasing pattern is risky (法源依據／案例／影響／建議文案), not just that
// it is. Legal content is region-specific (a phrase can be fine in one
// jurisdiction and a criminal offence in another), so the region-specific
// research (法源／案例／文案) lives in riskTagRegionsTable, one row per
// (tag, region) pair, while riskTagsTable holds the region-independent core
// (name／category／definition／review workflow state).
// ---------------------------------------------------------------------------

// The three headline risk groups the user's research brief organizes around.
// Kept as free text (not pgEnum) — consistent with every other categorical
// column in this codebase (see analysis-records.ts `category`, reference-
// products.ts `category`) — validated in the API layer instead, so adding a
// fourth group later doesn't require a migration.
export type RiskGroup =
  | "exaggerated_efficacy" // 誇大療效
  | "urgency_manipulation" // 威脅感／緊迫感／情緒操控
  | "false_authority_social_proof"; // 權威借位／社會認同操控／群體壓力

export const RISK_GROUPS: RiskGroup[] = [
  "exaggerated_efficacy",
  "urgency_manipulation",
  "false_authority_social_proof",
];

// Reuses the six rhetoric categories already annotated on analysis_records
// (see routes/admin/index.ts RHETORIC_CATEGORIES) so a tag can be
// cross-referenced against how often that category actually gets flagged in
// real submissions — one risk group maps to one or more of these.
export type RhetoricCategory =
  | "恐懼訴求"
  | "假稀缺"
  | "社會認同操控"
  | "權威借位"
  | "情緒勒索"
  | "誇大療效";

export const RHETORIC_CATEGORIES: RhetoricCategory[] = [
  "恐懼訴求",
  "假稀缺",
  "社會認同操控",
  "權威借位",
  "情緒勒索",
  "誇大療效",
];

export type RiskLevel = "低" | "中" | "高";
export const RISK_LEVELS: RiskLevel[] = ["低", "中", "高"];

export type ReviewStatus = "draft" | "pending_review" | "approved" | "needs_revision";
export const REVIEW_STATUSES: ReviewStatus[] = [
  "draft",
  "pending_review",
  "approved",
  "needs_revision",
];

// Jurisdictions with fully-researched legal content, per user's scoping
// decision — additional regions can be added as new riskTagRegionsTable rows
// without a schema change; this list only drives which options the admin
// dropdown offers by default.
export type Region = "TW" | "HK" | "MO" | "SG" | "MY" | "JP";
export const REGIONS: { value: Region; label: string }[] = [
  { value: "TW", label: "台灣" },
  { value: "HK", label: "香港" },
  { value: "MO", label: "澳門" },
  { value: "SG", label: "新加坡" },
  { value: "MY", label: "馬來西亞" },
  { value: "JP", label: "日本" },
];

export type SourceType = "law" | "authority" | "news" | "judgment" | "academic";
export const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "law", label: "法規本文" },
  { value: "authority", label: "主管機關公告／裁罰" },
  { value: "news", label: "新聞報導" },
  { value: "judgment", label: "法院判決" },
  { value: "academic", label: "學術／業界資料" },
];

// ---------------------------------------------------------------------------
// risk_tags — region-independent core record
// ---------------------------------------------------------------------------

export const riskTagsTable = pgTable("risk_tags", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(), // 標籤名稱
  riskGroup: text("risk_group").notNull().$type<RiskGroup>(), // 三大類分組
  category: text("category").notNull().$type<RhetoricCategory>(), // 對應六大話術分類，供跨表分析
  definition: text("definition").notNull().default(""), // 問題定義
  defaultRiskLevel: text("default_risk_level").notNull().default("中").$type<RiskLevel>(), // 風險等級（無地區覆寫時的預設值）
  suggestedCopy: text("suggested_copy").notNull().default(""), // 建議修正文案（通用版，地區可覆寫）
  impactSummary: text("impact_summary").notNull().default(""), // 對買賣家/平台的實際影響（通用版，地區可覆寫）
  active: boolean("active").notNull().default(false), // 是否啟用於前台顯示
  reviewStatus: text("review_status").notNull().default("draft").$type<ReviewStatus>(), // 審核狀態
  sourceVerified: boolean("source_verified").notNull().default(false), // 資料來源是否已驗證
  needsRecheck: boolean("needs_recheck").notNull().default(false), // 是否需重新審查
  maintainer: text("maintainer"), // 維護人員
  notes: text("notes"), // 備註
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRiskTagSchema = createInsertSchema(riskTagsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRiskTag = z.infer<typeof insertRiskTagSchema>;
export type RiskTag = typeof riskTagsTable.$inferSelect;

// ---------------------------------------------------------------------------
// risk_tag_regions — one row per (riskTagId, region). No FK constraint
// declared (consistent with the rest of this schema — relations are enforced
// application-side, see reference-products.ts / analysis-records.ts, which
// also don't declare `.references()`).
// ---------------------------------------------------------------------------

export interface RiskCase {
  year: string; // 年份（西元或民國原文皆可，保留原始字串，理由同 reference-products.ts issuedDate）
  title: string; // 案例標題
  summary: string; // 事件摘要與處分/結果
  sourceType: SourceType;
  sourceUrl: string | null;
  confidence: "高" | "中" | "低"; // 來源可信度
}

export interface RiskSourceLink {
  label: string;
  url: string;
  sourceType: SourceType;
  confidence: "高" | "中" | "低";
}

export const riskTagRegionsTable = pgTable("risk_tag_regions", {
  id: serial("id").primaryKey(),
  riskTagId: integer("risk_tag_id").notNull(),
  region: text("region").notNull().$type<Region>(),
  legalBasis: text("legal_basis").notNull().default(""), // 法源依據
  violationAspects: text("violation_aspects").notNull().default(""), // 可能違反的法規面向（行政／消保／刑事）
  cases: jsonb("cases").notNull().default([]).$type<RiskCase[]>(), // 歷年案例與糾紛
  impact: text("impact"), // 風險影響（地區版，null 時前端 fallback 用 risk_tags.impactSummary）
  suggestedCopy: text("suggested_copy"), // 建議文案（地區版，null 時 fallback 用 risk_tags.suggestedCopy）
  riskLevel: text("risk_level").$type<RiskLevel>(), // 風險等級（地區覆寫，null 時 fallback 用 risk_tags.defaultRiskLevel）
  primarySourceType: text("primary_source_type").notNull().default("news").$type<SourceType>(),
  sourceLinks: jsonb("source_links").notNull().default([]).$type<RiskSourceLink[]>(),
  verified: boolean("verified").notNull().default(false), // 資料來源是否已驗證（地區版）
  needsReview: boolean("needs_review").notNull().default(true), // 是否需要法務／管理員複核，新建預設為 true
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRiskTagRegionSchema = createInsertSchema(riskTagRegionsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertRiskTagRegion = z.infer<typeof insertRiskTagRegionSchema>;
export type RiskTagRegion = typeof riskTagRegionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// risk_tag_versions — append-only snapshot log. Doubles as both version
// history (供比對差異) and audit trail (誰在何時改了什麼) per spec, rather
// than two separate tables, since every edit needs exactly one row either
// way and the fields they'd need are identical.
// ---------------------------------------------------------------------------

export type RiskTagVersionAction =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "unpublish"
  | "review_approve"
  | "review_reject";

export const riskTagVersionsTable = pgTable("risk_tag_versions", {
  id: serial("id").primaryKey(),
  riskTagId: integer("risk_tag_id").notNull(),
  region: text("region").$type<Region>(), // null = 變更對象是 risk_tags 核心欄位；非 null = 變更對象是該地區的 risk_tag_regions 列
  action: text("action").notNull().$type<RiskTagVersionAction>(),
  snapshot: jsonb("snapshot").notNull(), // 變更後的完整狀態（tag 或 tag+region 合併視圖）
  changeNote: text("change_note"),
  editedBy: text("edited_by").notNull(), // 帳號
  editedByRole: text("edited_by_role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRiskTagVersionSchema = createInsertSchema(riskTagVersionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRiskTagVersion = z.infer<typeof insertRiskTagVersionSchema>;
export type RiskTagVersionRow = typeof riskTagVersionsTable.$inferSelect;
