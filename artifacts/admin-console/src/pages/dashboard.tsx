import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Loader2,
  FileText,
  Gauge,
  ShieldAlert,
  ClipboardList,
  ScanLine,
  AlertTriangle,
  ShieldQuestion,
  CheckCircle2,
  Plus,
  ScanSearch,
  Download,
  Users,
  ArrowRight,
} from "lucide-react";
import { getStats, getRiskTagStats, riskTagExportUrl, REVIEW_STATUSES, REGION_OPTIONS } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CATEGORY_COLORS: Record<string, string> = {
  "恐懼訴求": "hsl(0 84% 60%)",
  "假稀缺": "hsl(38 92% 50%)",
  "社會認同操控": "hsl(221 83% 53%)",
  "權威借位": "hsl(271 81% 56%)",
  "情緒勒索": "hsl(330 81% 60%)",
  "誇大療效": "hsl(171 77% 44%)",
};

const REVIEW_STATUS_COLORS: Record<string, string> = {
  draft: "hsl(220 9% 60%)",
  pending_review: "hsl(38 92% 50%)",
  approved: "hsl(152 60% 40%)",
  needs_revision: "hsl(0 84% 60%)",
};

const RISK_LEVEL_COLORS: Record<string, string> = {
  "低": "hsl(152 60% 40%)",
  "中": "hsl(38 92% 50%)",
  "高": "hsl(0 84% 60%)",
};

function reviewStatusLabel(value: string): string {
  return REVIEW_STATUSES.find((s) => s.value === value)?.label ?? value;
}

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

export function Dashboard() {
  const { role } = useAuth();
  const canEdit = role === "super_admin" || role === "reviewer";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "records", "stats"],
    queryFn: getStats,
  });

  const { data: riskStats, isLoading: riskStatsLoading } = useQuery({
    queryKey: ["admin", "risk-tags", "stats"],
    queryFn: getRiskTagStats,
  });

  if (isLoading || riskStatsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-muted-foreground">無法載入統計資料，請重新整理再試一次。</p>;
  }

  const pendingReviewCount = riskStats?.byReviewStatus.find((s) => s.key === "pending_review")?.count ?? 0;
  const needsRecheckCount = riskStats?.needsRecheckCount ?? 0;
  const unverifiedCount = riskStats?.unverifiedRegionCount ?? 0;

  const attentionItems = [
    pendingReviewCount > 0 && {
      icon: ClipboardList,
      tone: "amber" as const,
      text: `${pendingReviewCount} 筆風險標籤待審核`,
      href: "/risk-tags?reviewStatus=pending_review",
    },
    needsRecheckCount > 0 && {
      icon: AlertTriangle,
      tone: "red" as const,
      text: `${needsRecheckCount} 筆標籤被標記為需重新審查`,
      href: "/risk-tags?needsRecheck=true",
    },
    unverifiedCount > 0 && {
      icon: ShieldQuestion,
      tone: "amber" as const,
      text: `${unverifiedCount} 筆地區內容尚未驗證來源`,
      href: "/risk-tags",
    },
  ].filter((x): x is Exclude<typeof x, false> => x !== false);

  const toneClass: Record<string, string> = {
    amber: "text-amber-600 bg-amber-500/10",
    red: "text-destructive bg-destructive/10",
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">儀表板</h1>
        <p className="text-sm text-muted-foreground mt-1">話術透視鏡的即時分析與風險標籤資料庫總覽。</p>
      </div>

      {attentionItems.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attentionItems.map((item, i) => (
            <Link key={i} href={item.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${toneClass[item.tone]}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-medium flex-1">{item.text}</p>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-primary" /> 話術分析
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">總分析筆數</p>
                <p className="text-2xl font-bold">{data.totalRecords}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Gauge className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">平均信任度</p>
                <p className="text-2xl font-bold">{data.avgCredibilityScore.toFixed(1)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">偵測到的話術標註總數</p>
                <p className="text-2xl font-bold">
                  {data.categoryBreakdown.reduce((sum, c) => sum + c.count, 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>話術分類分佈</CardTitle>
              <CardDescription>各分類被標註的次數</CardDescription>
            </CardHeader>
            <CardContent>
              {data.categoryBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">尚無資料</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={data.categoryBreakdown}
                      dataKey="count"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.category} (${entry.count})`}
                    >
                      {data.categoryBreakdown.map((entry) => (
                        <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? "#999"} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>信任度評分趨勢</CardTitle>
              <CardDescription>每日平均信任度分數</CardDescription>
            </CardHeader>
            <CardContent>
              {data.scoreTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">尚無資料</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.scoreTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="avgCredibilityScore"
                      stroke="hsl(230 40% 30%)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {riskStats && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" /> 話術風險標籤資料庫
          </h2>

          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">標籤總數</p>
                <p className="text-2xl font-bold">{riskStats.totalTags}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">歷年案例總數</p>
                <p className="text-2xl font-bold">{riskStats.totalCases}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">待審核</p>
                <p className="text-2xl font-bold text-amber-600">{pendingReviewCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">未驗證地區內容</p>
                <p className="text-2xl font-bold text-destructive">{unverifiedCount}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>審核狀態分佈</CardTitle>
                <CardDescription>每個標籤目前所在的審核階段</CardDescription>
              </CardHeader>
              <CardContent>
                {riskStats.byReviewStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">尚無資料</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={riskStats.byReviewStatus} layout="vertical" margin={{ left: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="key"
                        tick={{ fontSize: 12 }}
                        tickFormatter={reviewStatusLabel}
                        width={80}
                      />
                      <Tooltip labelFormatter={(v) => reviewStatusLabel(String(v))} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {riskStats.byReviewStatus.map((entry) => (
                          <Cell key={entry.key} fill={REVIEW_STATUS_COLORS[entry.key] ?? "#999"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>風險等級分佈</CardTitle>
                <CardDescription>依地區內容的實際風險等級（含覆寫）統計</CardDescription>
              </CardHeader>
              <CardContent>
                {riskStats.byRiskLevel.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">尚無資料</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={riskStats.byRiskLevel}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="key" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {riskStats.byRiskLevel.map((entry) => (
                          <Cell key={entry.key} fill={RISK_LEVEL_COLORS[entry.key] ?? "#999"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>送審文案 vs. 資料庫紀錄 交叉比對</CardTitle>
              <CardDescription>
                依六大話術分類，比較「實際送審文案中被標註的次數」與「資料庫中的標籤／案例數量」——落差大代表這類話術很常見，但佐證資料還不夠完整
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-2 font-medium">分類</th>
                    <th className="py-2 pr-2 font-medium text-right">送審中被標註次數</th>
                    <th className="py-2 pr-2 font-medium text-right">資料庫標籤數</th>
                    <th className="py-2 font-medium text-right">資料庫案例數</th>
                  </tr>
                </thead>
                <tbody>
                  {riskStats.categoryCrossReference.map((row) => {
                    const max = Math.max(
                      1,
                      ...riskStats.categoryCrossReference.map((r) => r.flaggedInSubmissions),
                    );
                    return (
                      <tr key={row.category} className="border-b last:border-0">
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: CATEGORY_COLORS[row.category] ?? "#999" }}
                            />
                            {row.category}
                            {row.tagCount === 0 && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-5 text-muted-foreground">
                                尚無標籤
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(row.flaggedInSubmissions / max) * 100}%`,
                                  backgroundColor: CATEGORY_COLORS[row.category] ?? "#999",
                                }}
                              />
                            </div>
                            <span className="font-semibold tabular-nums w-6 text-right">
                              {row.flaggedInSubmissions}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-2 text-right text-muted-foreground tabular-nums">
                          {row.tagCount}
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground tabular-nums">{row.caseCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {riskStats.byRegion.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>地區覆蓋</CardTitle>
                <CardDescription>目前已建立地區內容的分佈</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {riskStats.byRegion.map((r) => (
                    <Badge key={r.key} variant="secondary" className="font-normal">
                      {regionLabel(r.key)}
                      <span className="ml-1.5 opacity-60">{r.count}</span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary" /> 快速操作
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/risk-analyze">
            <Button variant="outline">
              <ScanSearch className="w-4 h-4 mr-2" /> 話術風險分析
            </Button>
          </Link>
          {canEdit && (
            <Link href="/risk-tags/new">
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" /> 新增風險標籤
              </Button>
            </Link>
          )}
          <a href={riskTagExportUrl()}>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" /> 匯出風險標籤報表
            </Button>
          </a>
          <Link href="/records">
            <Button variant="outline">
              <FileText className="w-4 h-4 mr-2" /> 查看分析紀錄
            </Button>
          </Link>
          {role === "super_admin" && (
            <Link href="/users">
              <Button variant="outline">
                <Users className="w-4 h-4 mr-2" /> 使用者管理
              </Button>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
