import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  History,
} from "lucide-react";
import {
  createRiskTag,
  updateRiskTag,
  deleteRiskTag,
  getRiskTag,
  upsertRiskTagRegion,
  deleteRiskTagRegion,
  listRiskTagVersions,
  RISK_GROUPS,
  RHETORIC_CATEGORY_OPTIONS,
  TAG_RISK_LEVELS,
  REVIEW_STATUSES,
  SOURCE_TYPES,
  REGION_OPTIONS,
  type RiskGroup,
  type RhetoricCategory,
  type TagRiskLevel,
  type ReviewStatus,
  type SourceType,
  type Confidence,
  type RiskCase,
  type RiskSourceLink,
  type RiskTagDetail,
  type RiskTagRegion,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface CoreForm {
  slug: string;
  name: string;
  riskGroup: RiskGroup;
  category: RhetoricCategory;
  definition: string;
  defaultRiskLevel: TagRiskLevel;
  suggestedCopy: string;
  impactSummary: string;
  reviewStatus: ReviewStatus;
  sourceVerified: boolean;
  needsRecheck: boolean;
  maintainer: string;
  notes: string;
}

const EMPTY_CORE: CoreForm = {
  slug: "",
  name: "",
  riskGroup: "exaggerated_efficacy",
  category: "誇大療效",
  definition: "",
  defaultRiskLevel: "中",
  suggestedCopy: "",
  impactSummary: "",
  reviewStatus: "draft",
  sourceVerified: false,
  needsRecheck: false,
  maintainer: "",
  notes: "",
};

function toCoreForm(tag: RiskTagDetail): CoreForm {
  return {
    slug: tag.slug,
    name: tag.name,
    riskGroup: tag.riskGroup,
    category: tag.category,
    definition: tag.definition,
    defaultRiskLevel: tag.defaultRiskLevel,
    suggestedCopy: tag.suggestedCopy,
    impactSummary: tag.impactSummary,
    reviewStatus: tag.reviewStatus,
    sourceVerified: tag.sourceVerified,
    needsRecheck: tag.needsRecheck,
    maintainer: tag.maintainer ?? "",
    notes: tag.notes ?? "",
  };
}

interface RegionForm {
  legalBasis: string;
  violationAspects: string;
  impact: string;
  suggestedCopy: string;
  riskLevel: TagRiskLevel | "";
  primarySourceType: SourceType;
  verified: boolean;
  needsReview: boolean;
  cases: RiskCase[];
  sourceLinks: RiskSourceLink[];
}

const EMPTY_REGION: RegionForm = {
  legalBasis: "",
  violationAspects: "",
  impact: "",
  suggestedCopy: "",
  riskLevel: "",
  primarySourceType: "news",
  verified: false,
  needsReview: true,
  cases: [],
  sourceLinks: [],
};

function toRegionForm(r: RiskTagRegion): RegionForm {
  return {
    legalBasis: r.legalBasis,
    violationAspects: r.violationAspects,
    impact: r.impact ?? "",
    suggestedCopy: r.suggestedCopy ?? "",
    riskLevel: r.riskLevel ?? "",
    primarySourceType: r.primarySourceType,
    verified: r.verified,
    needsReview: r.needsReview,
    cases: r.cases,
    sourceLinks: r.sourceLinks,
  };
}

const CONFIDENCE_LEVELS: Confidence[] = ["高", "中", "低"];

export function RiskTagDetailPage() {
  const params = useParams();
  const isNew = params.id === "new";
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canEdit = role === "super_admin" || role === "reviewer";
  const canPublish = role === "super_admin";
  const canDelete = role === "super_admin";

  const { data: tag, isLoading, isError } = useQuery({
    queryKey: ["admin", "risk-tags", id],
    queryFn: () => getRiskTag(id),
    enabled: !isNew && Number.isInteger(id) && id > 0,
  });

  const { data: versionData } = useQuery({
    queryKey: ["admin", "risk-tags", id, "versions"],
    queryFn: () => listRiskTagVersions(id),
    enabled: !isNew && Number.isInteger(id) && id > 0,
  });

  const [isEditing, setIsEditing] = useState(isNew);
  const [coreForm, setCoreForm] = useState<CoreForm>(EMPTY_CORE);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [regionForm, setRegionForm] = useState<RegionForm>(EMPTY_REGION);
  const [showVersions, setShowVersions] = useState(false);
  const [addRegionCode, setAddRegionCode] = useState("");

  useEffect(() => {
    if (isNew) {
      setIsEditing(true);
      setCoreForm(EMPTY_CORE);
      setActiveRegion(null);
      setRegionForm(EMPTY_REGION);
      return;
    }
    if (!tag) return;
    setIsEditing(false);
    setCoreForm(toCoreForm(tag));
    const firstRegion = tag.regions[0]?.region ?? null;
    setActiveRegion((prev) => (prev && tag.regions.some((r) => r.region === prev) ? prev : firstRegion));
  }, [tag, isNew]);

  useEffect(() => {
    if (!tag || !activeRegion) {
      setRegionForm(EMPTY_REGION);
      return;
    }
    const region = tag.regions.find((r) => r.region === activeRegion);
    setRegionForm(region ? toRegionForm(region) : EMPTY_REGION);
  }, [tag, activeRegion]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteRiskTag(id),
    onSuccess: () => {
      toast.success("已刪除該筆風險標籤");
      queryClient.invalidateQueries({ queryKey: ["admin", "risk-tags"] });
      setLocation("/risk-tags");
    },
    onError: () => toast.error("刪除失敗，請稍後再試"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const corePayload = {
        slug: coreForm.slug.trim(),
        name: coreForm.name.trim(),
        riskGroup: coreForm.riskGroup,
        category: coreForm.category,
        definition: coreForm.definition,
        defaultRiskLevel: coreForm.defaultRiskLevel,
        suggestedCopy: coreForm.suggestedCopy,
        impactSummary: coreForm.impactSummary,
        reviewStatus: coreForm.reviewStatus,
        sourceVerified: coreForm.sourceVerified,
        needsRecheck: coreForm.needsRecheck,
        maintainer: coreForm.maintainer.trim() || null,
        notes: coreForm.notes.trim() || null,
      };

      const tagId = isNew ? (await createRiskTag(corePayload)).id : id;
      if (!isNew) await updateRiskTag(id, corePayload);

      if (activeRegion) {
        await upsertRiskTagRegion(tagId, activeRegion, {
          legalBasis: regionForm.legalBasis,
          violationAspects: regionForm.violationAspects,
          impact: regionForm.impact || null,
          suggestedCopy: regionForm.suggestedCopy || null,
          riskLevel: regionForm.riskLevel || null,
          primarySourceType: regionForm.primarySourceType,
          verified: regionForm.verified,
          needsReview: regionForm.needsReview,
          cases: regionForm.cases,
          sourceLinks: regionForm.sourceLinks,
        });
      }

      return tagId;
    },
    onSuccess: (tagId) => {
      toast.success(isNew ? "已新增風險標籤" : "已儲存變更");
      queryClient.invalidateQueries({ queryKey: ["admin", "risk-tags"], exact: false });
      if (isNew) {
        setLocation(`/risk-tags/${tagId}`);
      } else {
        setIsEditing(false);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "儲存失敗，請稍後再試");
    },
  });

  const publishMutation = useMutation({
    mutationFn: (active: boolean) => updateRiskTag(id, { active }),
    onSuccess: (updated) => {
      toast.success(updated.active ? "已發布至前台" : "已取消發布");
      queryClient.invalidateQueries({ queryKey: ["admin", "risk-tags"], exact: false });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失敗"),
  });

  const deleteRegionMutation = useMutation({
    mutationFn: (region: string) => deleteRiskTagRegion(id, region),
    onSuccess: () => {
      toast.success("已刪除該地區的內容");
      setActiveRegion(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "risk-tags"], exact: false });
    },
    onError: () => toast.error("刪除失敗，請稍後再試"),
  });

  const handleSave = () => {
    if (!coreForm.slug.trim() || !/^[a-z0-9-]+$/.test(coreForm.slug.trim())) {
      toast.error("slug 需為小寫英數字與連字號組成，且不可為空");
      return;
    }
    if (!coreForm.name.trim()) {
      toast.error("標籤名稱不可為空");
      return;
    }
    saveMutation.mutate();
  };

  const addCaseRow = () =>
    setRegionForm((f) => ({
      ...f,
      cases: [...f.cases, { year: "", title: "", summary: "", sourceType: "news", sourceUrl: null, confidence: "中" }],
    }));
  const updateCaseRow = (idx: number, patch: Partial<RiskCase>) =>
    setRegionForm((f) => ({
      ...f,
      cases: f.cases.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  const removeCaseRow = (idx: number) =>
    setRegionForm((f) => ({ ...f, cases: f.cases.filter((_, i) => i !== idx) }));

  const addSourceLinkRow = () =>
    setRegionForm((f) => ({
      ...f,
      sourceLinks: [...f.sourceLinks, { label: "", url: "", sourceType: "news", confidence: "中" }],
    }));
  const updateSourceLinkRow = (idx: number, patch: Partial<RiskSourceLink>) =>
    setRegionForm((f) => ({
      ...f,
      sourceLinks: f.sourceLinks.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  const removeSourceLinkRow = (idx: number) =>
    setRegionForm((f) => ({ ...f, sourceLinks: f.sourceLinks.filter((_, i) => i !== idx) }));

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isNew && (isError || !tag)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
        <AlertTriangle className="w-12 h-12 text-destructive/80" />
        <p className="text-muted-foreground">找不到這筆風險標籤資料。</p>
        <Link href="/risk-tags">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> 回列表
          </Button>
        </Link>
      </div>
    );
  }

  const existingRegionCodes = tag?.regions.map((r) => r.region) ?? [];
  const availableToAdd = REGION_OPTIONS.filter((r) => !existingRegionCodes.includes(r.value));
  const isNewRegionDraft = activeRegion !== null && !existingRegionCodes.includes(activeRegion);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href="/risk-tags">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> 回列表
          </Button>
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {!isNew && tag && !isEditing && canPublish && (
            <Button
              variant="outline"
              size="sm"
              disabled={publishMutation.isPending}
              onClick={() => publishMutation.mutate(!tag.active)}
            >
              {tag.active ? "取消發布" : "發布至前台"}
            </Button>
          )}
          {!isNew && (
            <Button variant="outline" size="sm" onClick={() => setShowVersions((v) => !v)}>
              <History className="w-4 h-4 mr-2" /> 版本歷史
            </Button>
          )}
          {isEditing ? (
            <>
              {!isNew && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    if (tag) setCoreForm(toCoreForm(tag));
                    setIsEditing(false);
                  }}
                >
                  <X className="w-4 h-4 mr-2" /> 取消
                </Button>
              )}
              <Button size="sm" disabled={saveMutation.isPending} onClick={handleSave}>
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {isNew ? "新增標籤" : "儲存變更"}
              </Button>
            </>
          ) : (
            canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="w-4 h-4 mr-2" /> 編輯
                </Button>
                {canDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (!window.confirm("確定要刪除這筆風險標籤嗎？此動作無法復原。")) return;
                      deleteMutation.mutate();
                    }}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    刪除
                  </Button>
                )}
              </>
            )
          )}
        </div>
      </div>

      {!isNew && tag && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>#{tag.id}</span>
          <span>·</span>
          <span>更新於 {new Date(tag.updatedAt).toLocaleString()}</span>
          <Badge variant={tag.active ? "default" : "outline"}>{tag.active ? "已發布" : "未發布"}</Badge>
          <Badge variant="secondary">
            {REVIEW_STATUSES.find((s) => s.value === tag.reviewStatus)?.label ?? tag.reviewStatus}
          </Badge>
          {tag.needsRecheck && <Badge variant="destructive">待重新審查</Badge>}
        </div>
      )}

      {showVersions && (
        <Card>
          <CardHeader>
            <CardTitle>版本歷史 / 審核軌跡</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto">
            {!versionData || versionData.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無異動紀錄。</p>
            ) : (
              versionData.versions.map((v) => (
                <details key={v.id} className="text-sm border rounded-md p-3">
                  <summary className="cursor-pointer flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{v.action}</Badge>
                    {v.region && <Badge variant="secondary">{v.region}</Badge>}
                    <span className="text-muted-foreground">
                      {v.editedBy}（{v.editedByRole}）· {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </summary>
                  {v.changeNote && <p className="mt-2 text-muted-foreground">備註：{v.changeNote}</p>}
                  <pre className="mt-2 whitespace-pre-wrap break-all text-xs bg-muted rounded p-2 max-h-48 overflow-y-auto">
                    {JSON.stringify(v.snapshot, null, 2)}
                  </pre>
                </details>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>基本資料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">標籤名稱</label>
                  <Input value={coreForm.name} onChange={(e) => setCoreForm({ ...coreForm, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">slug（小寫英數字與連字號）</label>
                  <Input
                    value={coreForm.slug}
                    onChange={(e) => setCoreForm({ ...coreForm, slug: e.target.value })}
                    placeholder="exaggerated-efficacy"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">三大分組</label>
                  <Select
                    value={coreForm.riskGroup}
                    onChange={(e) => setCoreForm({ ...coreForm, riskGroup: e.target.value as RiskGroup })}
                  >
                    {RISK_GROUPS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">對應話術分類（六大類）</label>
                  <Select
                    value={coreForm.category}
                    onChange={(e) => setCoreForm({ ...coreForm, category: e.target.value as RhetoricCategory })}
                  >
                    {RHETORIC_CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">預設風險等級</label>
                  <Select
                    value={coreForm.defaultRiskLevel}
                    onChange={(e) => setCoreForm({ ...coreForm, defaultRiskLevel: e.target.value as TagRiskLevel })}
                  >
                    {TAG_RISK_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">審核狀態</label>
                  <Select
                    value={coreForm.reviewStatus}
                    onChange={(e) => setCoreForm({ ...coreForm, reviewStatus: e.target.value as ReviewStatus })}
                  >
                    {REVIEW_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">問題定義</label>
                <Textarea
                  value={coreForm.definition}
                  onChange={(e) => setCoreForm({ ...coreForm, definition: e.target.value })}
                  className="min-h-[100px]"
                  placeholder="這個標籤代表什麼樣的話術/行銷/溝通方式，為什麼危險、什麼狀況下會被認定為問題"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">影響層面（通用版，地區可覆寫）</label>
                <Textarea
                  value={coreForm.impactSummary}
                  onChange={(e) => setCoreForm({ ...coreForm, impactSummary: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">建議修正文案（通用版，地區可覆寫）</label>
                <Textarea
                  value={coreForm.suggestedCopy}
                  onChange={(e) => setCoreForm({ ...coreForm, suggestedCopy: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">維護人員</label>
                  <Input
                    value={coreForm.maintainer}
                    onChange={(e) => setCoreForm({ ...coreForm, maintainer: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={coreForm.sourceVerified}
                      onChange={(e) => setCoreForm({ ...coreForm, sourceVerified: e.target.checked })}
                    />
                    資料來源已驗證
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={coreForm.needsRecheck}
                      onChange={(e) => setCoreForm({ ...coreForm, needsRecheck: e.target.checked })}
                    />
                    需重新審查
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">備註</label>
                <Textarea
                  value={coreForm.notes}
                  onChange={(e) => setCoreForm({ ...coreForm, notes: e.target.value })}
                  className="min-h-[60px]"
                />
              </div>
            </>
          ) : (
            tag && (
              <>
                <div>
                  <p className="text-2xl font-bold">{tag.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">slug: {tag.slug}</p>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{tag.definition || "—"}</p>
                <div>
                  <p className="text-sm text-muted-foreground">影響層面（通用版）</p>
                  <p className="whitespace-pre-wrap leading-relaxed">{tag.impactSummary || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">建議修正文案（通用版）</p>
                  <p className="whitespace-pre-wrap leading-relaxed">{tag.suggestedCopy || "—"}</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">維護人員</p>
                    <p>{tag.maintainer || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">資料來源驗證</p>
                    <p>{tag.sourceVerified ? "已驗證" : "未驗證"}</p>
                  </div>
                </div>
                {tag.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">備註</p>
                    <p className="whitespace-pre-wrap text-sm">{tag.notes}</p>
                  </div>
                )}
              </>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>地區法源與案例</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {existingRegionCodes.map((code) => (
              <Button
                key={code}
                type="button"
                size="sm"
                variant={activeRegion === code ? "default" : "outline"}
                onClick={() => {
                  setIsEditing(false);
                  setActiveRegion(code);
                }}
              >
                {REGION_OPTIONS.find((r) => r.value === code)?.label ?? code}
              </Button>
            ))}
            {!isNew && canEdit && availableToAdd.length > 0 && (
              <div className="flex items-center gap-1">
                <Select
                  value={addRegionCode}
                  onChange={(e) => setAddRegionCode(e.target.value)}
                  className="h-9"
                >
                  <option value="">+ 新增地區...</option>
                  {availableToAdd.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!addRegionCode}
                  onClick={() => {
                    setActiveRegion(addRegionCode);
                    setIsEditing(true);
                    setAddRegionCode("");
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {!activeRegion ? (
            <p className="text-sm text-muted-foreground py-8 text-center">尚未填寫任何地區的法規內容，請新增地區。</p>
          ) : (
            <div className="space-y-4">
              {isNewRegionDraft && (
                <p className="text-xs text-amber-600">
                  尚未儲存 — 填寫完成後按「儲存變更」才會建立 {REGION_OPTIONS.find((r) => r.value === activeRegion)?.label ?? activeRegion} 的地區資料。
                </p>
              )}
              {isEditing ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">法源依據</label>
                    <Textarea
                      value={regionForm.legalBasis}
                      onChange={(e) => setRegionForm({ ...regionForm, legalBasis: e.target.value })}
                      className="min-h-[120px]"
                      placeholder="法規名稱、條號與內容摘要，一行一條"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">可能違反的法規面向（行政／消保／刑事）</label>
                    <Textarea
                      value={regionForm.violationAspects}
                      onChange={(e) => setRegionForm({ ...regionForm, violationAspects: e.target.value })}
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">此地區風險等級（留空則沿用預設）</label>
                      <Select
                        value={regionForm.riskLevel}
                        onChange={(e) => setRegionForm({ ...regionForm, riskLevel: e.target.value as TagRiskLevel | "" })}
                      >
                        <option value="">（沿用預設）</option>
                        {TAG_RISK_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">主要資料來源類型</label>
                      <Select
                        value={regionForm.primarySourceType}
                        onChange={(e) =>
                          setRegionForm({ ...regionForm, primarySourceType: e.target.value as SourceType })
                        }
                      >
                        {SOURCE_TYPES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">風險影響（此地區版，留空則沿用通用版）</label>
                    <Textarea
                      value={regionForm.impact}
                      onChange={(e) => setRegionForm({ ...regionForm, impact: e.target.value })}
                      className="min-h-[80px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">建議文案（此地區版，留空則沿用通用版）</label>
                    <Textarea
                      value={regionForm.suggestedCopy}
                      onChange={(e) => setRegionForm({ ...regionForm, suggestedCopy: e.target.value })}
                      className="min-h-[80px]"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={regionForm.verified}
                        onChange={(e) => setRegionForm({ ...regionForm, verified: e.target.checked })}
                      />
                      此地區資料已驗證
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={regionForm.needsReview}
                        onChange={(e) => setRegionForm({ ...regionForm, needsReview: e.target.checked })}
                      />
                      需要法務／管理員複核
                    </label>
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">歷年案例與糾紛</label>
                      <Button type="button" size="sm" variant="outline" onClick={addCaseRow}>
                        <Plus className="w-4 h-4 mr-1" /> 新增案例
                      </Button>
                    </div>
                    {regionForm.cases.map((c, idx) => (
                      <div key={idx} className="border rounded-md p-3 space-y-2">
                        <div className="flex justify-end">
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeCaseRow(idx)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-2">
                          <Input
                            placeholder="年份"
                            value={c.year}
                            onChange={(e) => updateCaseRow(idx, { year: e.target.value })}
                          />
                          <Input
                            className="sm:col-span-2"
                            placeholder="案例標題"
                            value={c.title}
                            onChange={(e) => updateCaseRow(idx, { title: e.target.value })}
                          />
                        </div>
                        <Textarea
                          placeholder="事件摘要與處分/結果"
                          value={c.summary}
                          onChange={(e) => updateCaseRow(idx, { summary: e.target.value })}
                          className="min-h-[60px]"
                        />
                        <div className="grid sm:grid-cols-3 gap-2">
                          <Select
                            value={c.sourceType}
                            onChange={(e) => updateCaseRow(idx, { sourceType: e.target.value as SourceType })}
                          >
                            {SOURCE_TYPES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </Select>
                          <Select
                            value={c.confidence}
                            onChange={(e) => updateCaseRow(idx, { confidence: e.target.value as Confidence })}
                          >
                            {CONFIDENCE_LEVELS.map((l) => (
                              <option key={l} value={l}>
                                可信度：{l}
                              </option>
                            ))}
                          </Select>
                          <Input
                            placeholder="來源網址（選填）"
                            value={c.sourceUrl ?? ""}
                            onChange={(e) => updateCaseRow(idx, { sourceUrl: e.target.value || null })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">來源連結</label>
                      <Button type="button" size="sm" variant="outline" onClick={addSourceLinkRow}>
                        <Plus className="w-4 h-4 mr-1" /> 新增連結
                      </Button>
                    </div>
                    {regionForm.sourceLinks.map((l, idx) => (
                      <div key={idx} className="grid sm:grid-cols-5 gap-2 items-center border rounded-md p-2">
                        <Input
                          placeholder="標籤"
                          value={l.label}
                          onChange={(e) => updateSourceLinkRow(idx, { label: e.target.value })}
                        />
                        <Input
                          className="sm:col-span-2"
                          placeholder="網址"
                          value={l.url}
                          onChange={(e) => updateSourceLinkRow(idx, { url: e.target.value })}
                        />
                        <Select
                          value={l.sourceType}
                          onChange={(e) => updateSourceLinkRow(idx, { sourceType: e.target.value as SourceType })}
                        >
                          {SOURCE_TYPES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                        <div className="flex items-center gap-1">
                          <Select
                            value={l.confidence}
                            onChange={(e) => updateSourceLinkRow(idx, { confidence: e.target.value as Confidence })}
                          >
                            {CONFIDENCE_LEVELS.map((lv) => (
                              <option key={lv} value={lv}>
                                {lv}
                              </option>
                            ))}
                          </Select>
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeSourceLinkRow(idx)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const region = tag?.regions.find((r) => r.region === activeRegion);
                      if (!region) return null;
                      return (
                        <>
                          <Badge variant={region.verified ? "default" : "outline"}>
                            {region.verified ? "已驗證" : "未驗證"}
                          </Badge>
                          {region.needsReview && <Badge variant="destructive">待複核</Badge>}
                          <Badge variant="secondary">
                            {SOURCE_TYPES.find((s) => s.value === region.primarySourceType)?.label}
                          </Badge>
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto text-destructive"
                              onClick={() => {
                                if (!window.confirm("確定要刪除此地區的內容嗎？")) return;
                                deleteRegionMutation.mutate(region.region);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-1" /> 刪除此地區
                            </Button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {(() => {
                    const region = tag?.regions.find((r) => r.region === activeRegion);
                    if (!region) return <p className="text-sm text-muted-foreground">尚無資料。</p>;
                    return (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">法源依據</p>
                          <p className="whitespace-pre-wrap leading-relaxed">{region.legalBasis || "—"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">可能違反的法規面向</p>
                          <p className="whitespace-pre-wrap leading-relaxed">{region.violationAspects || "—"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">風險影響</p>
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {region.impact || tag?.impactSummary || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">建議文案</p>
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {region.suggestedCopy || tag?.suggestedCopy || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">
                            歷年案例與糾紛（{region.cases.length}）
                          </p>
                          <div className="space-y-2">
                            {region.cases.map((c, idx) => (
                              <div key={idx} className="border rounded-md p-3 text-sm space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">
                                    {c.year} · {c.title}
                                  </span>
                                  <Badge variant="outline">
                                    {SOURCE_TYPES.find((s) => s.value === c.sourceType)?.label}
                                  </Badge>
                                  <Badge variant="secondary">可信度：{c.confidence}</Badge>
                                </div>
                                <p className="text-muted-foreground whitespace-pre-wrap">{c.summary}</p>
                                {c.sourceUrl && (
                                  <a
                                    href={c.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline break-all text-xs"
                                  >
                                    {c.sourceUrl}
                                  </a>
                                )}
                              </div>
                            ))}
                            {region.cases.length === 0 && (
                              <p className="text-sm text-muted-foreground">尚未填寫案例。</p>
                            )}
                          </div>
                        </div>
                        {region.sourceLinks.length > 0 && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-2">來源連結</p>
                            <ul className="space-y-1 text-sm">
                              {region.sourceLinks.map((l, idx) => (
                                <li key={idx} className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline">
                                    {SOURCE_TYPES.find((s) => s.value === l.sourceType)?.label}
                                  </Badge>
                                  <Badge variant="secondary">{l.confidence}</Badge>
                                  <a
                                    href={l.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline break-all"
                                  >
                                    {l.label || l.url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
