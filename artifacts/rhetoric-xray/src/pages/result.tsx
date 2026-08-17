import { useParams, Link } from "wouter";
import { useGetRecord, getGetRecordQueryKey } from "@workspace/api-client-react";
import { Loader2, ArrowLeft, RefreshCw, AlertTriangle, ShieldCheck, FileCheck2, Store, User, CheckCircle2, Lightbulb, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CredibilityGauge } from "@/components/credibility-gauge";
import { AnnotationLawEvidence } from "@/components/annotation-law-evidence";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  seller: "賣家視角",
  consumer: "消費者視角",
};

const RISK_LEVEL_CLASS: Record<string, string> = {
  "低": "bg-emerald-500 text-white",
  "中": "bg-amber-500 text-white",
  "高": "bg-destructive text-destructive-foreground",
};

interface RhetoricAnnotation {
  textSpan: string;
  category: string;
  explanation: string;
}

const categoryClassMap: Record<string, string> = {
  "恐懼訴求": "highlight-fear text-cat-fear",
  "假稀缺": "highlight-scarcity text-cat-scarcity",
  "社會認同操控": "highlight-social text-cat-social",
  "權威借位": "highlight-authority text-cat-authority",
  "情緒勒索": "highlight-emotion text-cat-emotion",
  "誇大療效": "highlight-efficacy text-cat-efficacy"
};

const badgeClassMap: Record<string, string> = {
  "恐懼訴求": "bg-cat-fear",
  "假稀缺": "bg-cat-scarcity",
  "社會認同操控": "bg-cat-social",
  "權威借位": "bg-cat-authority",
  "情緒勒索": "bg-cat-emotion",
  "誇大療效": "bg-cat-efficacy"
};

const productCategoryLabel: Record<string, string> = {
  drug: "藥品",
  health_food: "健康食品／保健品",
  other: "其他",
};

function getCatSlug(category: string) {
  const map: Record<string, string> = {
    "恐懼訴求": "fear",
    "假稀缺": "scarcity",
    "社會認同操控": "social",
    "權威借位": "authority",
    "情緒勒索": "emotion",
    "誇大療效": "efficacy"
  };
  return map[category] || "fear";
}

function HighlightedText({ text, annotations }: { text: string, annotations: RhetoricAnnotation[] }) {
  if (!annotations || annotations.length === 0) {
    return <p className="whitespace-pre-wrap leading-loose text-lg font-serif">{text}</p>;
  }

  const validAnns = annotations.filter(a => a.textSpan.trim().length > 0);
  if (validAnns.length === 0) {
    return <p className="whitespace-pre-wrap leading-loose text-lg font-serif">{text}</p>;
  }

  // Sort annotations by length descending so longer phrases match first
  const sortedAnns = [...validAnns].sort((a, b) => b.textSpan.length - a.textSpan.length);
  
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(${sortedAnns.map(a => escapeRegExp(a.textSpan)).join('|')})`, 'g');
  
  const parts = text.split(pattern);
  
  return (
    <p className="whitespace-pre-wrap leading-loose text-lg text-foreground/90 font-serif">
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part}</span>;
        
        const matchedAnn = sortedAnns.find(a => a.textSpan === part);
        const catClass = matchedAnn ? categoryClassMap[matchedAnn.category] : "bg-muted";
        
        return (
          <mark key={i} className={cn("px-1.5 mx-0.5 rounded font-bold transition-colors bg-transparent", catClass)}>
            {part}
          </mark>
        );
      })}
    </p>
  );
}

export function Result() {
  const params = useParams();
  const id = Number(params.id);
  const { data: record, isLoading, isError } = useGetRecord(id, {
    query: { enabled: !!id, queryKey: getGetRecordQueryKey(id) }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse font-medium tracking-widest">正在透視分析中...</p>
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <AlertTriangle className="w-16 h-16 text-destructive/80 mb-2" />
        <h2 className="text-2xl font-bold font-serif text-foreground">載入失敗</h2>
        <p className="text-muted-foreground">無法取得該筆分析紀錄，請確認網址是否正確。</p>
        <Link href="/">
          <Button variant="outline" className="mt-4"><ArrowLeft className="w-4 h-4 mr-2"/> 回首頁</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" /> 回首頁
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground font-mono">
          分析時間：{new Date(record.createdAt).toLocaleString()}
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="order-last lg:order-first lg:col-span-2 space-y-8">
          <Card className="border-t-4 border-t-primary shadow-md overflow-hidden">
            <CardHeader className="pb-4 bg-primary/5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-2xl font-serif flex items-center gap-2">
                  {record.role === "seller" ? <Store className="w-6 h-6 text-primary" /> : <User className="w-6 h-6 text-primary" />}
                  {ROLE_LABEL[record.role] ?? record.role}判定
                </CardTitle>
                <Badge className={cn("text-sm py-1 px-3 font-bold gap-1", RISK_LEVEL_CLASS[record.riskLevel] ?? "bg-muted")}>
                  <Gauge className="w-3.5 h-3.5" />
                  風險等級：{record.riskLevel}
                </Badge>
              </div>
              {record.verdict && (
                <CardDescription className="text-lg text-foreground/90 font-medium pt-1">
                  {record.verdict}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {record.coreJudgment && (
                <div>
                  <h4 className="text-sm font-bold text-foreground/70 mb-1.5">核心判斷</h4>
                  <p className="text-foreground/90 leading-relaxed">{record.coreJudgment}</p>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> 主要優點
                  </h4>
                  {record.mainStrengths.length === 0 ? (
                    <p className="text-sm text-muted-foreground">（無）</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {record.mainStrengths.map((s, i) => (
                        <li key={i} className="text-sm text-foreground/80 flex gap-2">
                          <span className="text-emerald-500 shrink-0">＋</span>{s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> 主要風險
                  </h4>
                  {record.mainRisks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">（無）</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {record.mainRisks.map((s, i) => (
                        <li key={i} className="text-sm text-foreground/80 flex gap-2">
                          <span className="text-destructive shrink-0">－</span>{s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {record.improvementSuggestions.length > 0 && (
                <div className="bg-muted/30 rounded-md p-4 border space-y-2">
                  <h4 className="text-sm font-bold text-foreground/70 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4" /> 改進建議
                  </h4>
                  <ul className="space-y-1.5">
                    {record.improvementSuggestions.map((s, i) => (
                      <li key={i} className="text-sm text-foreground/80 flex gap-2">
                        <span className="text-foreground/40 shrink-0">{i + 1}.</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-primary shadow-md overflow-hidden">
            <CardHeader className="pb-4 bg-primary/5">
              <CardTitle className="text-2xl font-serif flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-primary" />
                原文分析
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
               <HighlightedText text={record.originalText} annotations={record.annotations} />
            </CardContent>
          </Card>

          {record.matchedProducts.length > 0 && (
            <Card className="border-t-4 border-t-emerald-500 shadow-sm overflow-hidden">
              <CardHeader className="pb-4 bg-emerald-500/5">
                <CardTitle className="text-lg font-serif flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-emerald-600" />
                  資料庫比對
                </CardTitle>
                <CardDescription>
                  以下產品的核准資料已用來比對本篇文案的療效宣稱是否誇大。
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 space-y-3">
                {record.matchedProducts.map((p) => (
                  <div key={p.id} className="border rounded-md p-4 bg-muted/20 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{p.name}</span>
                      <Badge variant="outline">{productCategoryLabel[p.category] ?? p.category}</Badge>
                      {p.registrationNumber && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {p.registrationNumber}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      核准適應症／功能：{p.approvedUses}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            <h3 className="text-2xl font-serif font-bold px-2 text-foreground">話術拆解清單</h3>
            {record.annotations.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed rounded-lg bg-muted/20">
                <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-lg font-medium text-foreground">這段文字很安全</p>
                <p className="text-muted-foreground">沒有發現明顯的操縱性話術或行銷陷阱。</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {record.annotations.map((ann, idx) => (
                  <Card key={idx} className="overflow-hidden border-l-4 shadow-sm" style={{ borderLeftColor: `hsl(var(--cat-${getCatSlug(ann.category)}))` }}>
                    <CardContent className="p-5 md:p-6 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <span className="font-serif font-bold text-xl leading-relaxed text-foreground/90">
                          「{ann.textSpan}」
                        </span>
                        <Badge className={cn("whitespace-nowrap shrink-0 text-sm py-1 font-bold", badgeClassMap[ann.category] || "bg-muted text-foreground")}>
                          {ann.category}
                        </Badge>
                      </div>
                      <div className="bg-muted/30 p-4 rounded-md border">
                        <p className="text-foreground/80 leading-relaxed text-[15px]">{ann.explanation}</p>
                      </div>
                      <AnnotationLawEvidence category={ann.category} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          
          <Card className="bg-muted/10 border-dashed shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-serif text-foreground/80">中性重寫版本</CardTitle>
              <CardDescription className="text-base">若去除行銷包裝，這段文字的客觀事實如下：</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap leading-relaxed text-foreground/90 text-lg">{record.neutralRewrite}</p>
            </CardContent>
          </Card>
        </div>

        <div className="order-first lg:order-last space-y-6">
          <Card className="shadow-md border-border">
            <CardHeader className="text-center pb-2 bg-muted/10">
              <CardTitle className="text-lg font-serif">綜合信任度評分</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center pt-8 pb-8">
              <CredibilityGauge score={record.credibilityScore} />
              <p className="text-sm text-center text-muted-foreground mt-8 px-4 leading-relaxed">
                分數越低代表使用的操縱性話術越多，可能存在較高的誤導風險，建議保持警覺。
              </p>
            </CardContent>
          </Card>
          
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-md font-serif">話術分類圖例</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.keys(badgeClassMap).map(cat => (
                  <Badge key={cat} className={cn("font-medium", badgeClassMap[cat])}>{cat}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Link href="/">
            <Button className="w-full shadow-sm" size="lg">
              <RefreshCw className="w-4 h-4 mr-2" /> 分析下一篇
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
