import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referenceProductsTable = pgTable("reference_products", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  name: text("name").notNull(),
  category: text("category").notNull(), // "drug" | "health_food" | "other"
  manufacturer: text("manufacturer"),
  registrationNumber: text("registration_number"), // 核准字號／許可證字號
  approvedUses: text("approved_uses").notNull(), // 核准適應症／功能，用來比對廣告是否誇大
  ingredients: text("ingredients"),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  drugCode: text("drug_code"), // 藥品代碼
  formulaName: text("formula_name"), // 方名（中藥方劑名稱）
  dosageForm: text("dosage_form"), // 劑型
  // Stored as free text rather than a date column — source data (e.g. TFDA
  // exports) uses varying formats including the ROC calendar, so preserving
  // the original string avoids lossy/incorrect parsing.
  issuedDate: text("issued_date"), // 發證日期
  // Fields below map to TFDA's 健康食品查詢 open-data schema (許可證字號 /
  // 類別 / 中文品名 / 核可日期 / 網址 already map onto the columns above via
  // import aliases — see routes/admin/products.ts FIELD_ALIASES).
  sourceId: text("source_id"), // 原始資料集的 ID（例如 TFDA 開放資料的流水號），非本站主鍵
  applicant: text("applicant"), // 申請商（持有許可證的公司，可能不同於製造商）
  certificateStatus: text("certificate_status"), // 證況（有效／廢止等）
  efficacyIngredients: text("efficacy_ingredients"), // 保健功效相關成分（與 ingredients 成分欄位不同，是官方認定與功效直接相關的成分）
  efficacyClaim: text("efficacy_claim"), // 保健功效宣稱（廠商宣傳文案，用來跟 approvedUses 核准功效比對是否誇大）
  warningText: text("warning_text"), // 警語
  warningTextSimplified: text("warning_text_simplified"), // 警語簡化
  precautions: text("precautions"), // 注意事項
});

export const insertReferenceProductSchema = createInsertSchema(
  referenceProductsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertReferenceProduct = z.infer<typeof insertReferenceProductSchema>;
export type ReferenceProduct = typeof referenceProductsTable.$inferSelect;
