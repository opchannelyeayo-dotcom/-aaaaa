import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Hand-written fetch, not routed through @workspace/api-client-react's orval
// pipeline — this is a small, independent read-only surface (mirrors why
// admin-console's lib/api.ts also bypasses that codegen), and adding it to
// the shared OpenAPI spec isn't worth the churn for two GET endpoints.

interface PublicRiskTag {
  slug: string;
  name: string;
  riskGroup: string;
  category: string;
  definition: string;
  riskLevel: "低" | "中" | "高";
  impact: string;
  suggestedCopy: string;
  region: string | null;
  availableRegions: string[];
}

interface RegionOption {
  code: string;
  label: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const RISK_GROUP_LABELS: Record<string, string> = {
  exaggerated_efficacy: "誇大療效",
  urgency_manipulation: "威脅感／緊迫感／情緒操控",
  false_authority_social_proof: "權威／社會認同／群體壓力",
};

const RISK_LEVEL_STYLE: Record<string, string> = {
  高: "border-destructive text-destructive",
  中: "border-amber-500 text-amber-600",
  低: "border-muted-foreground/40 text-muted-foreground",
};

export function RiskTags() {
  const { data: regionsData, isLoading: loadingRegions } = useQuery({
    queryKey: ["public", "risk-tags", "regions"],
    queryFn: () => fetchJson<{ regions: RegionOption[] }>("/api/risk-tags/regions"),
  });
  const [region, setRegion] = useState<string | null>(null);

  const regions = regionsData?.regions ?? [];
  const effectiveRegion = region ?? regions[0]?.code ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public", "risk-tags", effectiveRegion],
    queryFn: () =>
      fetchJson<{ riskTags: PublicRiskTag[] }>(
        `/api/risk-tags${effectiveRegion ? `?region=${encodeURIComponent(effectiveRegion)}` : ""}`,
      ),
    enabled: !loadingRegions,
  });

  const tags = data?.riskTags ?? [];
  const grouped = Object.entries(RISK_GROUP_LABELS).map(([key, label]) => ({
    key,
    label,
    tags: tags.filter((t) => t.riskGroup === key),
  }));

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      <div className="space-y-2 mt-4">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground">話術風險標籤</h1>
        <p className="text-lg text-muted-foreground">
          常見高風險行銷話術的問題所在、法源依據與建議修正方式，幫助買賣雙方在交易前先看懂風險。
        </p>
      </div>

      {regions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">查看地區：</span>
          {regions.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setRegion(r.code)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                effectiveRegion === r.code
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground border-input hover:bg-accent hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {loadingRegions || isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
        </div>
      ) : isError ? (
        <p className="text-center text-muted-foreground py-16">目前無法載入風險標籤資料，請稍後再試。</p>
      ) : tags.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">
          {regions.length === 0 ? "風險標籤資料庫尚未發布任何內容。" : "此地區尚未發布風險標籤內容。"}
        </p>
      ) : (
        <div className="space-y-8">
          {grouped.map(
            (group) =>
              group.tags.length > 0 && (
                <div key={group.key} className="space-y-4">
                  <h2 className="text-xl font-serif font-bold text-foreground">{group.label}</h2>
                  <div className="grid gap-4">
                    {group.tags.map((tag) => (
                      <Card key={tag.slug} className="shadow-sm">
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <ShieldAlert className="w-5 h-5 text-primary shrink-0" />
                              <span className="font-serif font-bold text-lg">{tag.name}</span>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn("font-medium", RISK_LEVEL_STYLE[tag.riskLevel])}
                            >
                              風險等級：{tag.riskLevel}
                            </Badge>
                          </div>
                          <p className="text-foreground/90 leading-relaxed">{tag.definition}</p>
                          {tag.impact && (
                            <div className="flex gap-2 text-sm text-muted-foreground">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                              <p className="leading-relaxed">{tag.impact}</p>
                            </div>
                          )}
                          {tag.suggestedCopy && (
                            <div className="bg-muted/50 rounded-md p-3 text-sm">
                              <p className="font-medium text-foreground mb-1">建議修正方向</p>
                              <p className="text-muted-foreground leading-relaxed">{tag.suggestedCopy}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ),
          )}
        </div>
      )}
    </div>
  );
}
