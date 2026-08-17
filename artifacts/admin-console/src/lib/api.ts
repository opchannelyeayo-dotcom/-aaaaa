// Hand-written fetch client for the admin API — this artifact intentionally
// does not go through the @workspace/api-spec/orval codegen pipeline used by
// rhetoric-xray, since it's a small, independent admin surface with its own
// auth model (session cookie) rather than the public, unauthenticated
// /api/ocr + /api/analyze endpoints that pipeline was built for.

export class AdminApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // no/invalid JSON body — keep the generic message
    }
    throw new AdminApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type AdminRole = "super_admin" | "reviewer" | "viewer";

export function login(username: string, password: string): Promise<{ ok: true; role: AdminRole }> {
  return request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return request("/api/admin/logout", { method: "POST" });
}

export function checkSession(): Promise<{ ok: true; username: string; role: AdminRole }> {
  return request("/api/admin/session");
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type InputType = "text" | "image";

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

export type SortOption = "newest" | "oldest" | "score_asc" | "score_desc";

export interface RecordSummary {
  id: number;
  createdAt: string;
  inputType: InputType;
  credibilityScore: number;
  originalText: string;
  annotationCount: number;
  categories: string[];
}

export interface RecordListResponse {
  records: RecordSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecordDetail {
  id: number;
  createdAt: string;
  inputType: InputType;
  originalText: string;
  annotations: Array<{ textSpan: string; category: string; explanation: string }>;
  credibilityScore: number;
  neutralRewrite: string;
}

export interface RecordFilters {
  q?: string;
  inputType?: InputType;
  category?: string;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
}

function buildQuery(filters: RecordFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.inputType) params.set("inputType", filters.inputType);
  if (filters.category) params.set("category", filters.category);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listRecords(filters: RecordFilters): Promise<RecordListResponse> {
  return request(`/api/admin/records${buildQuery(filters)}`);
}

export function getRecord(id: number): Promise<RecordDetail> {
  return request(`/api/admin/records/${id}`);
}

export function deleteRecord(id: number): Promise<{ ok: true; id: number }> {
  return request(`/api/admin/records/${id}`, { method: "DELETE" });
}

export interface RecordUpdateInput {
  originalText?: string;
  credibilityScore?: number;
  neutralRewrite?: string;
  annotations?: Array<{ textSpan: string; category: string; explanation: string }>;
}

export function updateRecord(id: number, updates: RecordUpdateInput): Promise<RecordDetail> {
  return request(`/api/admin/records/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface ScoreTrendPoint {
  date: string;
  avgCredibilityScore: number;
  count: number;
}

export interface RecordStats {
  totalRecords: number;
  avgCredibilityScore: number;
  categoryBreakdown: CategoryCount[];
  scoreTrend: ScoreTrendPoint[];
}

export function getStats(): Promise<RecordStats> {
  return request("/api/admin/records/stats");
}

/** Builds the URL for the CSV export endpoint — used as a plain `<a href>`, not fetched via JS. */
export function exportUrl(filters: Omit<RecordFilters, "page" | "pageSize">): string {
  return `/api/admin/records/export${buildQuery(filters)}`;
}

// ---------------------------------------------------------------------------
// Reference products (known drugs / health foods, used to cross-check ad
// claims against their actual approved uses)
// ---------------------------------------------------------------------------

export type ProductCategory = "drug" | "health_food" | "other";

export const PRODUCT_CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: "drug", label: "藥品" },
  { value: "health_food", label: "健康食品／保健品" },
  { value: "other", label: "其他" },
];

export interface ReferenceProduct {
  id: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  category: ProductCategory;
  manufacturer: string | null;
  registrationNumber: string | null;
  approvedUses: string;
  ingredients: string | null;
  sourceUrl: string | null;
  notes: string | null;
  drugCode: string | null;
  formulaName: string | null;
  dosageForm: string | null;
  issuedDate: string | null;
  sourceId: string | null;
  applicant: string | null;
  certificateStatus: string | null;
  efficacyIngredients: string | null;
  efficacyClaim: string | null;
  warningText: string | null;
  warningTextSimplified: string | null;
  precautions: string | null;
}

export interface ProductListResponse {
  products: ReferenceProduct[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductFilters {
  q?: string;
  category?: ProductCategory;
  page?: number;
  pageSize?: number;
}

function buildProductQuery(filters: ProductFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listProducts(filters: ProductFilters): Promise<ProductListResponse> {
  return request(`/api/admin/products${buildProductQuery(filters)}`);
}

export function getProduct(id: number): Promise<ReferenceProduct> {
  return request(`/api/admin/products/${id}`);
}

export interface ProductInput {
  name: string;
  category: ProductCategory;
  approvedUses: string;
  manufacturer?: string | null;
  registrationNumber?: string | null;
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

export function createProduct(input: ProductInput): Promise<ReferenceProduct> {
  return request("/api/admin/products", { method: "POST", body: JSON.stringify(input) });
}

export function updateProduct(
  id: number,
  updates: Partial<ProductInput>,
): Promise<ReferenceProduct> {
  return request(`/api/admin/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteProduct(id: number): Promise<{ ok: true; id: number }> {
  return request(`/api/admin/products/${id}`, { method: "DELETE" });
}

export interface ImportProductsResult {
  total: number;
  imported: number;
  skipped: { row: number; reason: string }[];
}

export function importProducts(csv: string): Promise<ImportProductsResult> {
  return request("/api/admin/products/import", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
}

// ---------------------------------------------------------------------------
// 話術風險標籤資料庫 (risk tags)
// ---------------------------------------------------------------------------

export type RiskGroup =
  | "exaggerated_efficacy"
  | "urgency_manipulation"
  | "false_authority_social_proof";

export const RISK_GROUPS: { value: RiskGroup; label: string }[] = [
  { value: "exaggerated_efficacy", label: "誇大療效" },
  { value: "urgency_manipulation", label: "威脅感／緊迫感／情緒操控" },
  { value: "false_authority_social_proof", label: "權威／社會認同／群體壓力" },
];

export const RHETORIC_CATEGORY_OPTIONS: RhetoricCategory[] = RHETORIC_CATEGORIES;

export type TagRiskLevel = "低" | "中" | "高";
export const TAG_RISK_LEVELS: TagRiskLevel[] = ["低", "中", "高"];

export type ReviewStatus = "draft" | "pending_review" | "approved" | "needs_revision";
export const REVIEW_STATUSES: { value: ReviewStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "pending_review", label: "待審核" },
  { value: "approved", label: "已核准" },
  { value: "needs_revision", label: "需修改" },
];

export type SourceType = "law" | "authority" | "news" | "judgment" | "academic";
export const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "law", label: "法規本文" },
  { value: "authority", label: "主管機關公告／裁罰" },
  { value: "news", label: "新聞報導" },
  { value: "judgment", label: "法院判決" },
  { value: "academic", label: "學術／業界資料" },
];

export type Confidence = "高" | "中" | "低";

export const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: "TW", label: "台灣" },
  { value: "HK", label: "香港" },
  { value: "MO", label: "澳門" },
  { value: "SG", label: "新加坡" },
  { value: "MY", label: "馬來西亞" },
  { value: "JP", label: "日本" },
];

export interface RiskCase {
  year: string;
  title: string;
  summary: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  confidence: Confidence;
}

export interface RiskSourceLink {
  label: string;
  url: string;
  sourceType: SourceType;
  confidence: Confidence;
}

export interface RiskTagRegion {
  id: number;
  riskTagId: number;
  region: string;
  legalBasis: string;
  violationAspects: string;
  cases: RiskCase[];
  impact: string | null;
  suggestedCopy: string | null;
  riskLevel: TagRiskLevel | null;
  primarySourceType: SourceType;
  sourceLinks: RiskSourceLink[];
  verified: boolean;
  needsReview: boolean;
  updatedAt: string;
}

export interface RiskTag {
  id: number;
  slug: string;
  name: string;
  riskGroup: RiskGroup;
  category: RhetoricCategory;
  definition: string;
  defaultRiskLevel: TagRiskLevel;
  suggestedCopy: string;
  impactSummary: string;
  active: boolean;
  reviewStatus: ReviewStatus;
  sourceVerified: boolean;
  needsRecheck: boolean;
  maintainer: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskTagSummary extends RiskTag {
  regions: string[];
  caseCount: number;
}

export interface RiskTagDetail extends RiskTag {
  regions: RiskTagRegion[];
  versions: RiskTagVersion[];
}

export interface RiskTagVersion {
  id: number;
  region: string | null;
  action: string;
  snapshot: unknown;
  changeNote: string | null;
  editedBy: string;
  editedByRole: string;
  createdAt: string;
}

export interface RiskTagListResponse {
  riskTags: RiskTagSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RiskTagFilters {
  q?: string;
  riskGroup?: RiskGroup;
  category?: RhetoricCategory;
  reviewStatus?: ReviewStatus;
  active?: boolean;
  region?: string;
  needsRecheck?: boolean;
  page?: number;
  pageSize?: number;
}

function buildRiskTagQuery(filters: RiskTagFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.riskGroup) params.set("riskGroup", filters.riskGroup);
  if (filters.category) params.set("category", filters.category);
  if (filters.reviewStatus) params.set("reviewStatus", filters.reviewStatus);
  if (filters.active !== undefined) params.set("active", String(filters.active));
  if (filters.region) params.set("region", filters.region);
  if (filters.needsRecheck !== undefined) params.set("needsRecheck", String(filters.needsRecheck));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listRiskTags(filters: RiskTagFilters): Promise<RiskTagListResponse> {
  return request(`/api/admin/risk-tags${buildRiskTagQuery(filters)}`);
}

export function getRiskTag(id: number): Promise<RiskTagDetail> {
  return request(`/api/admin/risk-tags/${id}`);
}

export interface RiskTagCoreInput {
  slug: string;
  name: string;
  riskGroup: RiskGroup;
  category: RhetoricCategory;
  definition?: string;
  defaultRiskLevel?: TagRiskLevel;
  suggestedCopy?: string;
  impactSummary?: string;
  active?: boolean;
  reviewStatus?: ReviewStatus;
  sourceVerified?: boolean;
  needsRecheck?: boolean;
  maintainer?: string | null;
  notes?: string | null;
}

export function createRiskTag(input: RiskTagCoreInput): Promise<RiskTagSummary> {
  return request("/api/admin/risk-tags", { method: "POST", body: JSON.stringify(input) });
}

export function updateRiskTag(
  id: number,
  updates: Partial<RiskTagCoreInput> & { changeNote?: string },
): Promise<RiskTagDetail> {
  return request(`/api/admin/risk-tags/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
}

export function deleteRiskTag(id: number): Promise<{ ok: true; id: number }> {
  return request(`/api/admin/risk-tags/${id}`, { method: "DELETE" });
}

export interface RiskTagRegionInput {
  legalBasis?: string;
  violationAspects?: string;
  cases?: RiskCase[];
  impact?: string | null;
  suggestedCopy?: string | null;
  riskLevel?: TagRiskLevel | null;
  primarySourceType?: SourceType;
  sourceLinks?: RiskSourceLink[];
  verified?: boolean;
  needsReview?: boolean;
  changeNote?: string;
}

export function upsertRiskTagRegion(
  id: number,
  region: string,
  input: RiskTagRegionInput,
): Promise<RiskTagRegion> {
  return request(`/api/admin/risk-tags/${id}/regions/${region}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteRiskTagRegion(
  id: number,
  region: string,
): Promise<{ ok: true; id: number; region: string }> {
  return request(`/api/admin/risk-tags/${id}/regions/${region}`, { method: "DELETE" });
}

export interface RiskTagVersionListResponse {
  versions: RiskTagVersion[];
  total: number;
  page: number;
  pageSize: number;
}

export function listRiskTagVersions(
  id: number,
  page = 1,
  pageSize = 30,
): Promise<RiskTagVersionListResponse> {
  return request(`/api/admin/risk-tags/${id}/versions?page=${page}&pageSize=${pageSize}`);
}

export interface RiskTagStats {
  totalTags: number;
  totalRegionEntries: number;
  totalCases: number;
  needsRecheckCount: number;
  unverifiedRegionCount: number;
  byRiskGroup: { key: RiskGroup; count: number }[];
  byCategory: { key: RhetoricCategory; count: number }[];
  byReviewStatus: { key: ReviewStatus; count: number }[];
  byRegion: { key: string; count: number }[];
  bySourceType: { key: SourceType; count: number }[];
  byRiskLevel: { key: TagRiskLevel; count: number }[];
  caseCountByYear: { year: string; count: number }[];
  categoryCrossReference: {
    category: RhetoricCategory;
    tagCount: number;
    caseCount: number;
    flaggedInSubmissions: number;
  }[];
}

export function getRiskTagStats(): Promise<RiskTagStats> {
  return request("/api/admin/risk-tags/stats");
}

export function riskTagExportUrl(): string {
  return "/api/admin/risk-tags/export";
}

// ---------------------------------------------------------------------------
// 話術風險分析（決策輔助工具）
// ---------------------------------------------------------------------------

export interface MatchedTagRef {
  id: number;
  slug: string;
  name: string;
  riskGroup: RiskGroup;
  category: RhetoricCategory;
}

// Read-only projection of a risk_tag_regions row — same fields as
// RiskTagRegion minus id/riskTagId/updatedAt, which this drill-down (from
// POST /admin/risk-tags/analyze) doesn't carry.
export interface MatchedRegion {
  region: string;
  legalBasis: string;
  violationAspects: string;
  impact: string | null;
  suggestedCopy: string | null;
  riskLevel: TagRiskLevel | null;
  primarySourceType: SourceType;
  sourceLinks: RiskSourceLink[];
  cases: RiskCase[];
  verified: boolean;
  needsReview: boolean;
}

export interface RiskAnalysisResult {
  tag: string;
  severity: TagRiskLevel;
  explanation: string;
  evidence: string[];
  recommended_rewrite: string;
  confidence: number;
  matchedTag: MatchedTagRef | null;
  regions: MatchedRegion[];
}

export interface RiskAnalysisError {
  error: "RISK_DB_UNAVAILABLE";
  message: string;
  fallback: RiskAnalysisResult;
}

export class RiskAnalysisUnavailableError extends Error {
  readonly payload: RiskAnalysisError;
  constructor(payload: RiskAnalysisError) {
    super(payload.message);
    this.name = "RiskAnalysisUnavailableError";
    this.payload = payload;
  }
}

export async function analyzeRiskText(text: string, context?: string): Promise<RiskAnalysisResult> {
  const response = await fetch("/api/admin/risk-tags/analyze", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ text, context: context || undefined }),
  });

  const data = (await response.json()) as RiskAnalysisResult | RiskAnalysisError | { error: string };

  if (!response.ok) {
    if ("error" in data && data.error === "RISK_DB_UNAVAILABLE") {
      throw new RiskAnalysisUnavailableError(data as RiskAnalysisError);
    }
    throw new AdminApiError(response.status, "error" in data ? (data as { error: string }).error : `HTTP ${response.status}`);
  }

  return data as RiskAnalysisResult;
}

// ---------------------------------------------------------------------------
// Admin accounts (RBAC) — super_admin only
// ---------------------------------------------------------------------------

export interface AdminAccount {
  id: number;
  username: string;
  role: AdminRole;
  displayName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listAdminUsers(): Promise<{ users: AdminAccount[] }> {
  return request("/api/admin/users");
}

export interface CreateAdminUserInput {
  username: string;
  password: string;
  role: AdminRole;
  displayName?: string | null;
}

export function createAdminUser(input: CreateAdminUserInput): Promise<AdminAccount> {
  return request("/api/admin/users", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateAdminUserInput {
  role?: AdminRole;
  active?: boolean;
  displayName?: string | null;
  password?: string;
}

export function updateAdminUser(id: number, updates: UpdateAdminUserInput): Promise<AdminAccount> {
  return request(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
}

export function deleteAdminUser(id: number): Promise<{ ok: true; id: number }> {
  return request(`/api/admin/users/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// 網址安全查詢紀錄 (url_scans) — read-only scan history from the consumer-
// facing link checker (artifacts/rhetoric-xray's /url-check page). No
// create/edit surface: these are system-generated results, not curated
// content, so admins can only browse and delete (e.g. to purge test entries).
// ---------------------------------------------------------------------------

export type UrlScanStatus = "safe" | "suspicious" | "high_risk" | "unknown";

export interface UrlScanRecord {
  id: number;
  createdAt: string;
  url: string;
  normalizedUrl: string;
  domain: string;
  finalUrl: string | null;
  finalDomain: string | null;
  status: UrlScanStatus;
  score: number;
  riskReasons: string[];
  categories: string[];
  recommendation: string;
}

export interface UrlScanListResponse {
  scans: UrlScanRecord[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<UrlScanStatus, number>;
}

export interface UrlScanFilters {
  q?: string;
  status?: UrlScanStatus;
  page?: number;
  pageSize?: number;
}

function buildUrlScanQuery(filters: UrlScanFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listUrlScans(filters: UrlScanFilters): Promise<UrlScanListResponse> {
  return request(`/api/admin/url-scans${buildUrlScanQuery(filters)}`);
}

export function deleteUrlScan(id: number): Promise<{ ok: true; id: number }> {
  return request(`/api/admin/url-scans/${id}`, { method: "DELETE" });
}
