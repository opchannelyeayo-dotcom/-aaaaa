import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Download, Loader2, Plus, Search, ShieldAlert } from "lucide-react";
import {
  listRiskTags,
  getRiskTagStats,
  riskTagExportUrl,
  RISK_GROUPS,
  RHETORIC_CATEGORY_OPTIONS,
  REVIEW_STATUSES,
  REGION_OPTIONS,
  type RiskGroup,
  type RhetoricCategory,
  type ReviewStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 20;

const RISK_GROUP_COLORS: Record<string, string> = {
  exaggerated_efficacy: "hsl(171 77% 44%)",
  urgency_manipulation: "hsl(0 84% 60%)",
  false_authority_social_proof: "hsl(271 81% 56%)",
};

const REVIEW_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  pending_review: "secondary",
  approved: "default",
  needs_revision: "destructive",
};

function groupLabel(value: string): string {
  return RISK_GROUPS.find((g) => g.value === value)?.label ?? value;
}
function reviewLabel(value: string): string {
  return REVIEW_STATUSES.find((s) => s.value === value)?.label ?? value;
}
function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

export function RiskTags() {
  const { role } = useAuth();
  const canEdit = role === "super_admin" || role === "reviewer";

  // Lets links from elsewhere (e.g. the dashboard's 待處理事項 list) deep-link
  // straight into a pre-filtered view — read once on mount, not kept in sync
  // afterwards, so manually changing a filter doesn't fight the URL.
  const [searchParams] = useSearchParams();

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [riskGroup, setRiskGroup] = useState<RiskGroup | "">("");
  const [category, setCategory] = useState<RhetoricCategory | "">("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | "">(
    () => (searchParams.get("reviewStatus") as ReviewStatus | null) ?? "",
  );
  const [region, setRegion] = useState("");
  const [needsRecheck, setNeedsRecheck] = useState<boolean>(
    () => searchParams.get("needsRecheck") === "true",
  );
  const [page, setPage] = useState(1);

  const searchTimeout = useRef<number | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    setQ(value);
    window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      setQDebounced(value);
      setPage(1);
    }, 300);
  };

  const filters = {
    q: qDebounced || undefined,
    riskGroup: riskGroup || undefined,
    category: category || undefined,
    reviewStatus: reviewStatus || undefined,
    region: region || undefined,
    needsRecheck: needsRecheck || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "risk-tags", filters],
    queryFn: () => listRiskTags(filters),
    placeholderData: (prev) => prev,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "risk-tags", "stats"],
    queryFn: getRiskTagStats,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">話術風險標籤資料庫</h1>
          <p className="text-sm text-muted-foreground mt-1">
            誇大療效／威脅緊迫情緒操控／假權威社會認同三大類話術的法源、案例與建議文案。
          </p>
        </div>
        <div className="flex gap-2">
          <a href={riskTagExportUrl()}>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" /> 匯出 CSV
            </Button>
          </a>
          {canEdit && (
            <Link href="/risk-tags/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" /> 新增標籤
              </Button>
            </Link>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">標籤總數</p>
              <p className="text-2xl font-bold">{stats.totalTags}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">案例總數</p>
              <p className="text-2xl font-bold">{stats.totalCases}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">待重新審查</p>
              <p className="text-2xl font-bold">{stats.needsRecheckCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">未驗證地區內容</p>
              <p className="text-2xl font-bold">{stats.unverifiedRegionCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {stats && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>三大類分佈</CardTitle>
              <CardDescription>各風險群組的標籤數量</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.byRiskGroup.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">尚無資料</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={stats.byRiskGroup}
                      dataKey="count"
                      nameKey="key"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry) => `${groupLabel(entry.key)} (${entry.count})`}
                    >
                      {stats.byRiskGroup.map((entry) => (
                        <Cell key={entry.key} fill={RISK_GROUP_COLORS[entry.key] ?? "#999"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, _n, item) => [value, groupLabel(item.payload.key)]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>實際送審文案觸發次數 vs. 資料庫案例數</CardTitle>
              <CardDescription>依六大話術分類交叉比對（analysis_records 標註 vs. 風險標籤案例）</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-2">分類</th>
                    <th className="py-2 pr-2 text-right">送審中被標註次數</th>
                    <th className="py-2 pr-2 text-right">資料庫標籤數</th>
                    <th className="py-2 text-right">資料庫案例數</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.categoryCrossReference.map((row) => (
                    <tr key={row.category} className="border-b last:border-0">
                      <td className="py-2 pr-2">{row.category}</td>
                      <td className="py-2 pr-2 text-right font-medium">{row.flaggedInSubmissions}</td>
                      <td className="py-2 pr-2 text-right text-muted-foreground">{row.tagCount}</td>
                      <td className="py-2 text-right text-muted-foreground">{row.caseCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>歷年案例數趨勢</CardTitle>
              <CardDescription>依案例年份彙整（各地區合計）</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.caseCountByYear.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">尚無資料</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.caseCountByYear}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(230 40% 30%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜尋標籤名稱、slug 或定義..."
              className="pl-9"
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <Select
            value={riskGroup}
            onChange={(e) => {
              setRiskGroup(e.target.value as RiskGroup | "");
              setPage(1);
            }}
          >
            <option value="">所有分組</option>
            {RISK_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as RhetoricCategory | "");
              setPage(1);
            }}
          >
            <option value="">所有話術分類</option>
            {RHETORIC_CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select
            value={reviewStatus}
            onChange={(e) => {
              setReviewStatus(e.target.value as ReviewStatus | "");
              setPage(1);
            }}
          >
            <option value="">所有審核狀態</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setPage(1);
            }}
          >
            <option value="">所有地區</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap px-1">
            <input
              type="checkbox"
              checked={needsRecheck}
              onChange={(e) => {
                setNeedsRecheck(e.target.checked);
                setPage(1);
              }}
            />
            只看待重新審查
          </label>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !data || data.riskTags.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">沒有符合條件的風險標籤資料。</p>
      ) : (
        <>
          <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <div className="grid gap-3">
              {data.riskTags.map((tag) => (
                <Link key={tag.id} href={`/risk-tags/${tag.id}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{tag.name}</span>
                        <Badge variant="secondary">{groupLabel(tag.riskGroup)}</Badge>
                        <Badge variant="outline">{tag.category}</Badge>
                        <Badge variant={REVIEW_STATUS_VARIANT[tag.reviewStatus] ?? "outline"}>
                          {reviewLabel(tag.reviewStatus)}
                        </Badge>
                        {tag.active ? (
                          <Badge>已發布</Badge>
                        ) : (
                          <Badge variant="outline">未發布</Badge>
                        )}
                        {tag.needsRecheck && <Badge variant="destructive">待重新審查</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{tag.definition || "（尚未填寫問題定義）"}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span>風險等級：{tag.defaultRiskLevel}</span>
                        <span>·</span>
                        <span>案例數：{tag.caseCount}</span>
                        <span>·</span>
                        <span>
                          地區：
                          {tag.regions.length > 0
                            ? tag.regions.map((r) => regionLabel(r)).join("、")
                            : "尚未填寫"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              共 {data.total} 筆，第 {data.page} / {totalPages} 頁
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一頁
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一頁
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
