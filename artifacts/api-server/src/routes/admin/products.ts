import { Router, type IRouter, type Request } from "express";
import { desc, ilike, eq, or, and, type SQL } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import {
  db,
  referenceProductsTable,
  type ReferenceProduct,
  type InsertReferenceProduct,
} from "@workspace/db";
import { requireAdminAuth } from "../../lib/admin-auth";

const router: IRouter = Router();

// Everything below requires a valid admin session (same pattern as
// /admin/records in ./index.ts).
router.use("/admin/products", requireAdminAuth);

const CATEGORIES = new Set(["drug", "health_food", "other"]);
const MAX_NAME_LENGTH = 200;
const MAX_REG_NUMBER_LENGTH = 100;
const MAX_TEXT_LENGTH = 3000;
const MAX_URL_LENGTH = 500;
const MAX_DATE_LENGTH = 50;

// ---------------------------------------------------------------------------
// GET /admin/products — search + filter + paginate
// ---------------------------------------------------------------------------

interface ProductFilters {
  q?: string;
  category?: string;
}

function parseFilters(query: Request["query"]): ProductFilters {
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim() : undefined;
  const category =
    typeof query.category === "string" && CATEGORIES.has(query.category)
      ? query.category
      : undefined;
  return { q, category };
}

async function queryFilteredProducts(filters: ProductFilters): Promise<ReferenceProduct[]> {
  const conditions: SQL[] = [];
  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(referenceProductsTable.name, term),
        ilike(referenceProductsTable.manufacturer, term),
        ilike(referenceProductsTable.registrationNumber, term),
      )!,
    );
  }
  if (filters.category) conditions.push(eq(referenceProductsTable.category, filters.category));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(referenceProductsTable)
    .where(whereClause)
    .orderBy(desc(referenceProductsTable.updatedAt));
}

router.get("/admin/products", async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const filtered = await queryFilteredProducts(filters);
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageProducts = filtered.slice(start, start + pageSize);

  res.json({
    products: pageProducts.map(toJson),
    total,
    page,
    pageSize,
  });
});

function toJson(p: ReferenceProduct) {
  return {
    id: p.id,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    name: p.name,
    category: p.category,
    manufacturer: p.manufacturer,
    registrationNumber: p.registrationNumber,
    approvedUses: p.approvedUses,
    ingredients: p.ingredients,
    sourceUrl: p.sourceUrl,
    notes: p.notes,
    drugCode: p.drugCode,
    formulaName: p.formulaName,
    dosageForm: p.dosageForm,
    issuedDate: p.issuedDate,
    sourceId: p.sourceId,
    applicant: p.applicant,
    certificateStatus: p.certificateStatus,
    efficacyIngredients: p.efficacyIngredients,
    efficacyClaim: p.efficacyClaim,
    warningText: p.warningText,
    warningTextSimplified: p.warningTextSimplified,
    precautions: p.precautions,
  };
}

// ---------------------------------------------------------------------------
// GET /admin/products/:id
// ---------------------------------------------------------------------------

router.get("/admin/products/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [product] = await db
    .select()
    .from(referenceProductsTable)
    .where(eq(referenceProductsTable.id, id));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(toJson(product));
});

// ---------------------------------------------------------------------------
// Shared field validation (used by both POST and PATCH)
// ---------------------------------------------------------------------------

interface ValidatedFields {
  name?: string;
  category?: string;
  manufacturer?: string | null;
  registrationNumber?: string | null;
  approvedUses?: string;
  ingredients?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  drugCode?: string | null;
  formulaName?: string | null;
  dosageForm?: string | null;
  issuedDate?: string | null;
  sourceId?: string | null;
  applicant?: string | null;
  certificateStatus?: string | null;
  efficacyIngredients?: string | null;
  efficacyClaim?: string | null;
  warningText?: string | null;
  warningTextSimplified?: string | null;
  precautions?: string | null;
}

type ValidationResult =
  | { ok: true; fields: ValidatedFields }
  | { ok: false; error: string };

// Returns either the validated fields present in `body`, or an error message
// to send back as a 400. `requireCore` controls whether name/category/
// approvedUses must be present (true for create, false for partial update).
function validateFields(body: Record<string, unknown>, requireCore: boolean): ValidationResult {
  const fields: ValidatedFields = {};

  if (requireCore || "name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { ok: false, error: "產品名稱不可為空" };
    }
    if (body.name.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `產品名稱不可超過 ${MAX_NAME_LENGTH} 字` };
    }
    fields.name = body.name.trim();
  }

  if (requireCore || "category" in body) {
    if (typeof body.category !== "string" || !CATEGORIES.has(body.category)) {
      return { ok: false, error: "分類須為 drug、health_food 或 other" };
    }
    fields.category = body.category;
  }

  if (requireCore || "approvedUses" in body) {
    if (typeof body.approvedUses !== "string" || !body.approvedUses.trim()) {
      return { ok: false, error: "核准適應症／功能不可為空" };
    }
    if (body.approvedUses.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: `核准適應症／功能不可超過 ${MAX_TEXT_LENGTH} 字` };
    }
    fields.approvedUses = body.approvedUses.trim();
  }

  if ("manufacturer" in body) {
    if (body.manufacturer !== null && typeof body.manufacturer !== "string") {
      return { ok: false, error: "製造商格式錯誤" };
    }
    if (typeof body.manufacturer === "string" && body.manufacturer.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `製造商不可超過 ${MAX_NAME_LENGTH} 字` };
    }
    fields.manufacturer = body.manufacturer === null ? null : body.manufacturer.trim() || null;
  }

  if ("registrationNumber" in body) {
    if (body.registrationNumber !== null && typeof body.registrationNumber !== "string") {
      return { ok: false, error: "核准字號格式錯誤" };
    }
    if (
      typeof body.registrationNumber === "string" &&
      body.registrationNumber.length > MAX_REG_NUMBER_LENGTH
    ) {
      return { ok: false, error: `核准字號不可超過 ${MAX_REG_NUMBER_LENGTH} 字` };
    }
    fields.registrationNumber =
      body.registrationNumber === null ? null : body.registrationNumber.trim() || null;
  }

  if ("ingredients" in body) {
    if (body.ingredients !== null && typeof body.ingredients !== "string") {
      return { ok: false, error: "成分格式錯誤" };
    }
    if (typeof body.ingredients === "string" && body.ingredients.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: `成分不可超過 ${MAX_TEXT_LENGTH} 字` };
    }
    fields.ingredients = body.ingredients === null ? null : body.ingredients.trim() || null;
  }

  if ("sourceUrl" in body) {
    if (body.sourceUrl !== null && typeof body.sourceUrl !== "string") {
      return { ok: false, error: "資料來源網址格式錯誤" };
    }
    if (typeof body.sourceUrl === "string" && body.sourceUrl.length > MAX_URL_LENGTH) {
      return { ok: false, error: `資料來源網址不可超過 ${MAX_URL_LENGTH} 字` };
    }
    fields.sourceUrl = body.sourceUrl === null ? null : body.sourceUrl.trim() || null;
  }

  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return { ok: false, error: "備註格式錯誤" };
    }
    if (typeof body.notes === "string" && body.notes.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: `備註不可超過 ${MAX_TEXT_LENGTH} 字` };
    }
    fields.notes = body.notes === null ? null : body.notes.trim() || null;
  }

  if ("drugCode" in body) {
    if (body.drugCode !== null && typeof body.drugCode !== "string") {
      return { ok: false, error: "藥品代碼格式錯誤" };
    }
    if (typeof body.drugCode === "string" && body.drugCode.length > MAX_REG_NUMBER_LENGTH) {
      return { ok: false, error: `藥品代碼不可超過 ${MAX_REG_NUMBER_LENGTH} 字` };
    }
    fields.drugCode = body.drugCode === null ? null : body.drugCode.trim() || null;
  }

  if ("formulaName" in body) {
    if (body.formulaName !== null && typeof body.formulaName !== "string") {
      return { ok: false, error: "方名格式錯誤" };
    }
    if (typeof body.formulaName === "string" && body.formulaName.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `方名不可超過 ${MAX_NAME_LENGTH} 字` };
    }
    fields.formulaName = body.formulaName === null ? null : body.formulaName.trim() || null;
  }

  if ("dosageForm" in body) {
    if (body.dosageForm !== null && typeof body.dosageForm !== "string") {
      return { ok: false, error: "劑型格式錯誤" };
    }
    if (typeof body.dosageForm === "string" && body.dosageForm.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `劑型不可超過 ${MAX_NAME_LENGTH} 字` };
    }
    fields.dosageForm = body.dosageForm === null ? null : body.dosageForm.trim() || null;
  }

  if ("issuedDate" in body) {
    if (body.issuedDate !== null && typeof body.issuedDate !== "string") {
      return { ok: false, error: "發證日期格式錯誤" };
    }
    if (typeof body.issuedDate === "string" && body.issuedDate.length > MAX_DATE_LENGTH) {
      return { ok: false, error: `發證日期不可超過 ${MAX_DATE_LENGTH} 字` };
    }
    fields.issuedDate = body.issuedDate === null ? null : body.issuedDate.trim() || null;
  }

  if ("sourceId" in body) {
    if (body.sourceId !== null && typeof body.sourceId !== "string") {
      return { ok: false, error: "來源 ID 格式錯誤" };
    }
    if (typeof body.sourceId === "string" && body.sourceId.length > MAX_REG_NUMBER_LENGTH) {
      return { ok: false, error: `來源 ID 不可超過 ${MAX_REG_NUMBER_LENGTH} 字` };
    }
    fields.sourceId = body.sourceId === null ? null : body.sourceId.trim() || null;
  }

  if ("applicant" in body) {
    if (body.applicant !== null && typeof body.applicant !== "string") {
      return { ok: false, error: "申請商格式錯誤" };
    }
    if (typeof body.applicant === "string" && body.applicant.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `申請商不可超過 ${MAX_NAME_LENGTH} 字` };
    }
    fields.applicant = body.applicant === null ? null : body.applicant.trim() || null;
  }

  if ("certificateStatus" in body) {
    if (body.certificateStatus !== null && typeof body.certificateStatus !== "string") {
      return { ok: false, error: "證況格式錯誤" };
    }
    if (
      typeof body.certificateStatus === "string" &&
      body.certificateStatus.length > MAX_REG_NUMBER_LENGTH
    ) {
      return { ok: false, error: `證況不可超過 ${MAX_REG_NUMBER_LENGTH} 字` };
    }
    fields.certificateStatus =
      body.certificateStatus === null ? null : body.certificateStatus.trim() || null;
  }

  if ("efficacyIngredients" in body) {
    if (body.efficacyIngredients !== null && typeof body.efficacyIngredients !== "string") {
      return { ok: false, error: "保健功效相關成分格式錯誤" };
    }
    if (
      typeof body.efficacyIngredients === "string" &&
      body.efficacyIngredients.length > MAX_TEXT_LENGTH
    ) {
      return { ok: false, error: `保健功效相關成分不可超過 ${MAX_TEXT_LENGTH} 字` };
    }
    fields.efficacyIngredients =
      body.efficacyIngredients === null ? null : body.efficacyIngredients.trim() || null;
  }

  if ("efficacyClaim" in body) {
    if (body.efficacyClaim !== null && typeof body.efficacyClaim !== "string") {
      return { ok: false, error: "保健功效宣稱格式錯誤" };
    }
    if (typeof body.efficacyClaim === "string" && body.efficacyClaim.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: `保健功效宣稱不可超過 ${MAX_TEXT_LENGTH} 字` };
    }
    fields.efficacyClaim = body.efficacyClaim === null ? null : body.efficacyClaim.trim() || null;
  }

  if ("warningText" in body) {
    if (body.warningText !== null && typeof body.warningText !== "string") {
      return { ok: false, error: "警語格式錯誤" };
    }
    if (typeof body.warningText === "string" && body.warningText.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: `警語不可超過 ${MAX_TEXT_LENGTH} 字` };
    }
    fields.warningText = body.warningText === null ? null : body.warningText.trim() || null;
  }

  if ("warningTextSimplified" in body) {
    if (body.warningTextSimplified !== null && typeof body.warningTextSimplified !== "string") {
      return { ok: false, error: "警語簡化格式錯誤" };
    }
    if (
      typeof body.warningTextSimplified === "string" &&
      body.warningTextSimplified.length > MAX_TEXT_LENGTH
    ) {
      return { ok: false, error: `警語簡化不可超過 ${MAX_TEXT_LENGTH} 字` };
    }
    fields.warningTextSimplified =
      body.warningTextSimplified === null ? null : body.warningTextSimplified.trim() || null;
  }

  if ("precautions" in body) {
    if (body.precautions !== null && typeof body.precautions !== "string") {
      return { ok: false, error: "注意事項格式錯誤" };
    }
    if (typeof body.precautions === "string" && body.precautions.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: `注意事項不可超過 ${MAX_TEXT_LENGTH} 字` };
    }
    fields.precautions = body.precautions === null ? null : body.precautions.trim() || null;
  }

  return { ok: true, fields };
}

// ---------------------------------------------------------------------------
// POST /admin/products — create
// ---------------------------------------------------------------------------

router.post("/admin/products", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = validateFields(body, true);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  const [created] = await db
    .insert(referenceProductsTable)
    .values({
      name: result.fields.name!,
      category: result.fields.category!,
      approvedUses: result.fields.approvedUses!,
      manufacturer: result.fields.manufacturer ?? null,
      registrationNumber: result.fields.registrationNumber ?? null,
      ingredients: result.fields.ingredients ?? null,
      sourceUrl: result.fields.sourceUrl ?? null,
      notes: result.fields.notes ?? null,
      drugCode: result.fields.drugCode ?? null,
      formulaName: result.fields.formulaName ?? null,
      dosageForm: result.fields.dosageForm ?? null,
      issuedDate: result.fields.issuedDate ?? null,
      sourceId: result.fields.sourceId ?? null,
      applicant: result.fields.applicant ?? null,
      certificateStatus: result.fields.certificateStatus ?? null,
      efficacyIngredients: result.fields.efficacyIngredients ?? null,
      efficacyClaim: result.fields.efficacyClaim ?? null,
      warningText: result.fields.warningText ?? null,
      warningTextSimplified: result.fields.warningTextSimplified ?? null,
      precautions: result.fields.precautions ?? null,
    })
    .returning();

  res.status(201).json(toJson(created));
});

// ---------------------------------------------------------------------------
// POST /admin/products/import — bulk-create from a CSV file. The frontend
// reads the file as text client-side and posts the raw text (same approach
// as OCR's base64 image upload — no multipart/multer needed since the app
// only ever accepts JSON bodies).
//
// Column names are auto-detected via aliases (Chinese and English) rather
// than requiring an exact header match, since real-world exports (e.g. TFDA
// data) use inconsistent column naming.
// ---------------------------------------------------------------------------

// Kept below app.ts's express.json({ limit: "20mb" }) rather than matching it
// exactly — the CSV text gets JSON-escaped (newlines become \n, etc.) before
// it reaches this check, so the actual request body is somewhat larger than
// this string's raw length.
const MAX_CSV_LENGTH = 15_000_000;
const MAX_IMPORT_ROWS = 10000;

type CoreField =
  | "name"
  | "category"
  | "manufacturer"
  | "registrationNumber"
  | "approvedUses"
  | "ingredients"
  | "sourceUrl"
  | "notes"
  | "drugCode"
  | "formulaName"
  | "dosageForm"
  | "issuedDate"
  | "sourceId"
  | "applicant"
  | "certificateStatus"
  | "efficacyIngredients"
  | "efficacyClaim"
  | "warningText"
  | "warningTextSimplified"
  | "precautions";

// Aliases below cover both the pre-existing generic column names and TFDA's
// 健康食品查詢 open-data header names (ID/許可證字號/類別/中文品名/核可日期/
// 申請商/證況/保健功效相關成分/保健功效/保健功效宣稱/警語/注意事項/網址/
// 主要功效/主要成分/警語簡化) — 保健功效 and 主要功效 both alias to
// approvedUses (alternate header names across dataset export versions, not
// expected to both appear in the same file), same for ingredients/主要成分.
const FIELD_ALIASES: Record<CoreField, string[]> = {
  name: ["name", "product name", "產品名稱", "品名", "藥品名稱", "商品名稱", "名稱", "中文品名"],
  category: ["category", "分類", "類別", "產品分類"],
  manufacturer: ["manufacturer", "製造商", "廠商", "藥廠", "製造廠", "製造廠名稱"],
  registrationNumber: [
    "registrationnumber",
    "registration number",
    "核准字號",
    "許可證字號",
    "字號",
    "許可證號",
    "衛署字號",
  ],
  approvedUses: [
    "approveduses",
    "approved uses",
    "核准適應症",
    "適應症",
    "核准功能",
    "功能",
    "用途",
    "核准適應症/功能",
    "核准適應症／功能",
    "效能",
    "效能名稱",
    "保健功效",
    "主要功效",
  ],
  ingredients: ["ingredients", "成分", "主要成分"],
  sourceUrl: ["sourceurl", "source url", "來源", "資料來源", "網址", "來源網址"],
  notes: ["notes", "備註", "備注"],
  drugCode: ["drugcode", "drug code", "藥品代碼"],
  formulaName: ["formulaname", "formula name", "方名"],
  dosageForm: ["dosageform", "dosage form", "劑型", "劑型別"],
  issuedDate: ["issueddate", "issued date", "發證日期", "核發日期", "核可日期"],
  sourceId: ["id", "sourceid", "source id"],
  applicant: ["applicant", "申請商"],
  certificateStatus: ["certificatestatus", "certificate status", "證況", "狀態"],
  efficacyIngredients: ["efficacyingredients", "保健功效相關成分"],
  efficacyClaim: ["efficacyclaim", "保健功效宣稱"],
  warningText: ["warningtext", "warning", "警語"],
  warningTextSimplified: ["warningtextsimplified", "警語簡化"],
  precautions: ["precautions", "注意事項"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

// Maps each of our core fields to whichever actual CSV header (if any)
// matches one of its known aliases.
function buildHeaderMap(headers: string[]): Partial<Record<CoreField, string>> {
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const map: Partial<Record<CoreField, string>> = {};
  for (const field of Object.keys(FIELD_ALIASES) as CoreField[]) {
    const aliases = FIELD_ALIASES[field].map(normalizeHeader);
    const found = normalizedHeaders.find((h) => aliases.includes(h.norm));
    if (found) map[field] = found.raw;
  }
  return map;
}

const CATEGORY_ALIASES: Record<string, string> = {
  drug: "drug",
  藥品: "drug",
  藥物: "drug",
  health_food: "health_food",
  保健品: "health_food",
  保健食品: "health_food",
  健康食品: "health_food",
  食品: "health_food",
  other: "other",
  其他: "other",
};

// Unlike the strict validation on manual create/edit, an unrecognized
// category during import falls back to "other" instead of rejecting the
// whole row — the name + approved uses are the core value of an imported
// row, and category is comparatively easy to fix up afterwards in the UI.
function normalizeImportCategory(raw: string | undefined): string {
  if (!raw) return "other";
  return CATEGORY_ALIASES[raw.trim()] ?? CATEGORY_ALIASES[raw.trim().toLowerCase()] ?? "other";
}

router.post("/admin/products/import", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const csv = body.csv;

  if (typeof csv !== "string" || !csv.trim()) {
    res.status(400).json({ error: "請提供 CSV 內容" });
    return;
  }
  if (csv.length > MAX_CSV_LENGTH) {
    res.status(400).json({ error: "CSV 檔案過大" });
    return;
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      // Real-world exports (Excel, government open data) are frequently
      // ragged — a stray trailing comma or a quote inside an unquoted field
      // shouldn't hard-fail the whole import when we can just drop/pad the
      // offending cells and let per-row validation catch anything that
      // actually matters (e.g. a missing name).
      relax_column_count: true,
      relax_quotes: true,
      // NOT `trim: true` — csv-parse only raises
      // CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE (a hard failure, not
      // relaxable via any option) when trim/rtrim is on and a quoted field
      // is followed by stray text before the delimiter, which real-world
      // CSVs hit often. validateFields() below already trims every field
      // value, so trimming here would be redundant anyway.
    });
  } catch (err) {
    res
      .status(400)
      .json({ error: `CSV 格式錯誤：${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  if (rows.length === 0) {
    res.status(400).json({ error: "CSV 沒有任何資料列" });
    return;
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    res.status(400).json({ error: `一次最多匯入 ${MAX_IMPORT_ROWS} 筆，請分批匯入` });
    return;
  }

  const detectedHeaders = Object.keys(rows[0]);
  const headerMap = buildHeaderMap(detectedHeaders);
  if (!headerMap.name) {
    res.status(400).json({
      error: `找不到產品名稱欄位，請確認 CSV 有名稱／品名等欄位（偵測到的欄位：${detectedHeaders.join("、") || "（無）"}）`,
    });
    return;
  }

  const toInsert: InsertReferenceProduct[] = [];
  const skipped: { row: number; reason: string }[] = [];

  rows.forEach((row, idx) => {
    const normalized: Record<string, unknown> = {};
    for (const field of Object.keys(FIELD_ALIASES) as CoreField[]) {
      const header = headerMap[field];
      if (header === undefined) continue;
      const value = row[header];
      if (value === undefined || value === "") continue;
      normalized[field] = field === "category" ? normalizeImportCategory(value) : value;
    }
    if (normalized.category === undefined) normalized.category = "other";

    const result = validateFields(normalized, true);
    if (!result.ok) {
      // +2: 1-indexed, plus the header row itself, so this matches the row
      // number a human would see if they opened the CSV in a spreadsheet.
      skipped.push({ row: idx + 2, reason: result.error });
      return;
    }

    toInsert.push({
      name: result.fields.name!,
      category: result.fields.category!,
      approvedUses: result.fields.approvedUses!,
      manufacturer: result.fields.manufacturer ?? null,
      registrationNumber: result.fields.registrationNumber ?? null,
      ingredients: result.fields.ingredients ?? null,
      sourceUrl: result.fields.sourceUrl ?? null,
      notes: result.fields.notes ?? null,
      drugCode: result.fields.drugCode ?? null,
      formulaName: result.fields.formulaName ?? null,
      dosageForm: result.fields.dosageForm ?? null,
      issuedDate: result.fields.issuedDate ?? null,
      sourceId: result.fields.sourceId ?? null,
      applicant: result.fields.applicant ?? null,
      certificateStatus: result.fields.certificateStatus ?? null,
      efficacyIngredients: result.fields.efficacyIngredients ?? null,
      efficacyClaim: result.fields.efficacyClaim ?? null,
      warningText: result.fields.warningText ?? null,
      warningTextSimplified: result.fields.warningTextSimplified ?? null,
      precautions: result.fields.precautions ?? null,
    });
  });

  // Postgres caps a single query at 65535 bind parameters — with 20 columns
  // per row that's ~3276 rows in one INSERT, well within MAX_IMPORT_ROWS.
  // Batch well under that ceiling so a large import doesn't overflow it and
  // fail with an opaque "bind message has N parameter formats" error.
  const INSERT_BATCH_SIZE = 1000;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE);
    await db.insert(referenceProductsTable).values(batch);
  }

  res.json({ total: rows.length, imported: toInsert.length, skipped });
});

// ---------------------------------------------------------------------------
// PATCH /admin/products/:id — partial update
// ---------------------------------------------------------------------------

router.patch("/admin/products/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = validateFields(body, false);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  if (Object.keys(result.fields).length === 0) {
    res.status(400).json({ error: "沒有提供任何要更新的欄位" });
    return;
  }

  const [updated] = await db
    .update(referenceProductsTable)
    .set({ ...result.fields, updatedAt: new Date() })
    .where(eq(referenceProductsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(toJson(updated));
});

// ---------------------------------------------------------------------------
// DELETE /admin/products/:id
// ---------------------------------------------------------------------------

router.delete("/admin/products/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [deleted] = await db
    .delete(referenceProductsTable)
    .where(eq(referenceProductsTable.id, id))
    .returning({ id: referenceProductsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json({ ok: true, id: deleted.id });
});

export default router;
