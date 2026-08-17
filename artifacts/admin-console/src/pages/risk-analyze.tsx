import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, ScanSearch, ShieldAlert } from "lucide-react";
import {
  analyzeRiskText,
  RiskAnalysisUnavailableError,
  REGION_OPTIONS,
  SOURCE_TYPES,
  type RiskAnalysisResult,
  type MatchedRegion,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { highlightMoney } from "@/lib/highlight-money";

const CONTEXT_OPTIONS = [
  { value: "", label: "未指定" },
  { value: "銷售", label: "銷售" },
  { value: "客服", label: "客服" },
  { value: "醫療", label: "醫療" },
  { value: "直播", label: "直播帶貨" },
  { value: "社群貼文", label: "社群貼文／KOL" },
];

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  高: "destructive",
  中: "secondary",
  低: "outline",
};

const CONFIDENCE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  高: "default",
  中: "secondary",
  低: "outline",
};

function regionLabel(code: string): string {
  return REGION_OPTIONS.find((r) => r.value === code)?.label ?? code;
}

function sourceTypeLabel(value: string): string {
  return SOURCE_TYPES.find((s) => s.value === value)?.label ?? value;
}

export function RiskAnalyze() {
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<RiskAnalysisResult | null>(null);
  const [unavailable, setUnavailable] = useState<RiskAnalysisUnavailableError | null>(null);

  const mutation = useMutation({
    mutationFn: () => analyzeRiskText(text.trim(), context || undefined),
    onSuccess: (data) => {
      setResult(data);
      setUnavailable(null);
    },
    onError: (err) => {
      if (err instanceof RiskAnalysisUnavailableError) {
        setUnavailable(err);
        setResult(null);
        return;
      }
      toast.error(err instanceof Error ? err.message : "分析失敗，請稍後再試");
    },
  });

  const handleAnalyze = () => {
    if (!text.trim()) {
      toast.error("請先貼上要分析的話術內容");
      return;
    }
    setResult(null);
    setUnavailable(null);
    mutation.mutate();
  };

  const displayed = result ?? unavailable?.payload.fallback ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">話術風險分析</h1>
        <p className="text-sm text-muted-foreground mt-1">
          貼上一段話術，立即取得風險標籤、判定依據與建議改寫，並可查看資料庫中對應的法條與案例佐證。
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">待分析文字</label>
            <Textarea
              placeholder="貼上廣告文案、客服對話或銷售話術..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[140px]"
            />
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">使用場景（選填）</label>
              <Select value={context} onChange={(e) => setContext(e.target.value)} className="min-w-[160px]">
                {CONTEXT_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button disabled={mutation.isPending} onClick={handleAnalyze}>
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ScanSearch className="w-4 h-4 mr-2" />
              )}
              分析
            </Button>
          </div>
        </CardContent>
      </Card>

      {unavailable && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-destructive">{unavailable.payload.message}</p>
              <p className="text-sm text-muted-foreground">
                以下為依內建通則產生的臨時判斷，僅供暫時參考，服務恢復後請重新分析以取得完整結果。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {displayed && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" />
                <CardTitle>{displayed.tag}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[displayed.severity] ?? "outline"}>
                  風險等級：{displayed.severity}
                </Badge>
                <Badge variant="outline">信心度 {Math.round(displayed.confidence * 100)}%</Badge>
              </div>
            </div>
            <CardDescription>{displayed.explanation}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">觸發依據（關鍵詞比對）</p>
              {displayed.evidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">無明確關鍵詞證據，建議人工複核。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {displayed.evidence.map((e, idx) => (
                    <Badge key={idx} variant="secondary" className="font-normal">
                      {e}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-muted/50 rounded-md p-3">
              <p className="text-sm font-medium mb-1">建議改寫</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{displayed.recommended_rewrite}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {displayed && (
        <Card>
          <CardHeader>
            <CardTitle>法源與案例佐證</CardTitle>
            <CardDescription>
              {displayed.matchedTag
                ? `對應資料庫標籤「${displayed.matchedTag.name}」，可依地區查看實際法條、行政處分與判決案例。`
                : "此判定尚未對應到資料庫中的既有標籤，暫無法條與案例佐證可查看。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {displayed.regions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                資料庫中尚無此標籤對應的地區內容，可至「話術風險標籤」頁面補上法源與案例。
              </p>
            ) : (
              <RegionEvidence regions={displayed.regions} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RegionEvidence({ regions }: { regions: MatchedRegion[] }) {
  const [activeRegion, setActiveRegion] = useState(regions[0]?.region ?? "");
  const [expandedCase, setExpandedCase] = useState<number | null>(null);

  const region = regions.find((r) => r.region === activeRegion) ?? regions[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {regions.map((r) => (
          <Button
            key={r.region}
            type="button"
            size="sm"
            variant={r.region === region.region ? "default" : "outline"}
            onClick={() => {
              setActiveRegion(r.region);
              setExpandedCase(null);
            }}
          >
            {regionLabel(r.region)}
          </Button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground mb-1">法源依據</p>
          <p className="whitespace-pre-wrap leading-relaxed">
            {region.legalBasis ? highlightMoney(region.legalBasis) : "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">可能違反的法規面向</p>
          <p className="whitespace-pre-wrap leading-relaxed">
            {region.violationAspects ? highlightMoney(region.violationAspects) : "—"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={region.verified ? "default" : "outline"}>
          {region.verified ? "來源已驗證" : "尚未驗證"}
        </Badge>
        {region.needsReview && <Badge variant="destructive">待複核</Badge>}
        {region.riskLevel && <Badge variant="secondary">此地區風險等級：{region.riskLevel}</Badge>}
      </div>

      <div>
        <p className="text-sm font-medium mb-2">歷年案例與糾紛（{region.cases.length}）</p>
        {region.cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">此地區尚未填寫案例。</p>
        ) : (
          <div className="space-y-2">
            {region.cases.map((c, idx) => {
              const expanded = expandedCase === idx;
              return (
                <div key={idx} className="border rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedCase(expanded ? null : idx)}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-accent transition-colors"
                  >
                    <span className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-medium truncate">
                        {c.year} · {c.title}
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        {sourceTypeLabel(c.sourceType)}
                      </Badge>
                      <Badge variant={CONFIDENCE_VARIANT[c.confidence] ?? "outline"} className="shrink-0">
                        可信度：{c.confidence}
                      </Badge>
                    </span>
                    <ChevronDown
                      className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-180")}
                    />
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3 space-y-2 text-sm border-t pt-3">
                      <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {highlightMoney(c.summary)}
                      </p>
                      {c.sourceUrl && (
                        <a
                          href={c.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline break-all"
                        >
                          {c.sourceUrl}
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(region.impact || region.suggestedCopy) && (
        <div className="grid sm:grid-cols-2 gap-3 text-sm pt-2 border-t">
          {region.impact && (
            <div>
              <p className="text-muted-foreground mb-1">風險影響</p>
              <p className="whitespace-pre-wrap leading-relaxed">{region.impact}</p>
            </div>
          )}
          {region.suggestedCopy && (
            <div>
              <p className="text-muted-foreground mb-1">建議文案（此地區版）</p>
              <p className="whitespace-pre-wrap leading-relaxed">{region.suggestedCopy}</p>
            </div>
          )}
        </div>
      )}

      {region.sourceLinks.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground mb-2">來源連結</p>
          <ul className="space-y-1 text-sm">
            {region.sourceLinks.map((l, idx) => (
              <li key={idx} className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{sourceTypeLabel(l.sourceType)}</Badge>
                <Badge variant={CONFIDENCE_VARIANT[l.confidence] ?? "outline"}>{l.confidence}</Badge>
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
    </div>
  );
}
