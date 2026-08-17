import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { highlightMoney } from "@/lib/highlight-money";

// Hand-written fetch, not routed through the orval codegen pipeline — same
// reasoning as admin-console's lib/api.ts and the /risk-tags page: this is a
// small, independent read surface, not worth adding to the shared OpenAPI
// spec. Only ever returns tags an admin has reviewed and published (see
// routes/risk-tags/index.ts) — drafts never reach the public site.

interface RiskCase {
  year: string;
  title: string;
  summary: string;
  sourceType: string;
  sourceUrl: string | null;
  confidence: string;
}

interface RiskSourceLink {
  label: string;
  url: string;
  sourceType: string;
  confidence: string;
}

interface RegionEvidence {
  region: string;
  legalBasis: string;
  violationAspects: string;
  impact: string | null;
  suggestedCopy: string | null;
  riskLevel: string | null;
  primarySourceType: string;
  sourceLinks: RiskSourceLink[];
  cases: RiskCase[];
  verified: boolean;
  needsReview: boolean;
}

interface CategoryTag {
  slug: string;
  name: string;
  regions: RegionEvidence[];
}

const REGION_LABELS: Record<string, string> = {
  TW: "台灣",
  HK: "香港",
  MO: "澳門",
  SG: "新加坡",
  MY: "馬來西亞",
  JP: "日本",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  law: "法規本文",
  authority: "主管機關公告／裁罰",
  news: "新聞報導",
  judgment: "法院判決",
  academic: "學術／業界資料",
};

async function fetchByCategory(category: string): Promise<CategoryTag[]> {
  const res = await fetch(`/api/risk-tags/by-category/${encodeURIComponent(category)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { tags: CategoryTag[] };
  return data.tags;
}

export function AnnotationLawEvidence({ category }: { category: string }) {
  const { data: tags, isLoading } = useQuery({
    queryKey: ["public", "risk-tags", "by-category", category],
    queryFn: () => fetchByCategory(category),
    staleTime: 5 * 60 * 1000,
  });

  const regions = tags?.[0]?.regions ?? [];

  if (isLoading || regions.length === 0) return null;

  return (
    <div className="pt-1">
      <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-foreground/60 mb-2">
        <Scale className="w-3.5 h-3.5" />
        相關法規與案例
      </div>
      <RegionEvidencePanel regions={regions} />
    </div>
  );
}

function RegionEvidencePanel({ regions }: { regions: RegionEvidence[] }) {
  const [activeRegion, setActiveRegion] = useState(regions[0].region);
  const [expandedCase, setExpandedCase] = useState<number | null>(null);
  const region = regions.find((r) => r.region === activeRegion) ?? regions[0];

  return (
    <div className="space-y-3">
      {regions.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {regions.map((r) => (
            <button
              key={r.region}
              type="button"
              onClick={() => {
                setActiveRegion(r.region);
                setExpandedCase(null);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                r.region === region.region
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground border-input hover:bg-accent hover:text-foreground",
              )}
            >
              {REGION_LABELS[r.region] ?? r.region}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-foreground/80 leading-relaxed">
        <span className="font-bold text-foreground/60">
          {REGION_LABELS[region.region] ?? region.region}法源：
        </span>
        {highlightMoney(region.legalBasis)}
      </p>

      {region.cases.length > 0 && (
        <div className="space-y-1.5">
          {region.cases.map((c, idx) => {
            const expanded = expandedCase === idx;
            return (
              <div key={idx} className="rounded-md border bg-background/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedCase(expanded ? null : idx)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/60 transition-colors"
                >
                  <span className="flex items-center gap-1.5 flex-wrap min-w-0 text-xs">
                    <span className="font-medium text-foreground/90 truncate">
                      {c.year} · {c.title}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px] py-0 px-1.5 h-5">
                      {SOURCE_TYPE_LABELS[c.sourceType] ?? c.sourceType}
                    </Badge>
                    <Badge variant="secondary" className="shrink-0 text-[10px] py-0 px-1.5 h-5">
                      可信度：{c.confidence}
                    </Badge>
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
                {expanded && (
                  <div className="px-3 pb-3 pt-1 space-y-1.5 border-t text-xs">
                    <p className="text-foreground/70 leading-relaxed">{highlightMoney(c.summary)}</p>
                    {c.sourceUrl && (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline break-all"
                      >
                        查看原始來源
                        <ExternalLink className="w-3 h-3 shrink-0" />
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
  );
}
