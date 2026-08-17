import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Link as LinkIcon,
  Loader2,
  Search,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  ExternalLink,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// Hand-written fetch, not routed through the orval codegen pipeline — same
// reasoning as the risk-tags public surfaces: a small, independent endpoint,
// not worth wiring into the shared OpenAPI spec.

type UrlScanStatus = "safe" | "suspicious" | "high_risk" | "unknown";

interface UrlScanResult {
  id: number;
  checkedAt: string;
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

async function scanUrl(url: string): Promise<UrlScanResult> {
  const res = await fetch("/api/url-scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as UrlScanResult;
}

const STATUS_META: Record<
  UrlScanStatus,
  { label: string; icon: typeof ShieldCheck; badgeClass: string; panelClass: string }
> = {
  safe: {
    label: "安全",
    icon: ShieldCheck,
    badgeClass: "bg-emerald-500 text-white",
    panelClass: "border-emerald-500/40 bg-emerald-500/5",
  },
  suspicious: {
    label: "可疑",
    icon: ShieldAlert,
    badgeClass: "bg-amber-500 text-white",
    panelClass: "border-amber-500/40 bg-amber-500/5",
  },
  high_risk: {
    label: "高風險",
    icon: ShieldX,
    badgeClass: "bg-destructive text-destructive-foreground",
    panelClass: "border-destructive/50 bg-destructive/5",
  },
  unknown: {
    label: "無法確認",
    icon: ShieldQuestion,
    badgeClass: "bg-muted text-muted-foreground",
    panelClass: "border-border bg-muted/20",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  可疑主機格式: "可疑主機格式",
  疑似偽裝網域: "疑似偽裝網域",
  疑似釣魚手法: "疑似釣魚手法",
  缺乏加密: "缺乏加密",
  網域結構可疑: "網域結構可疑",
  高風險網域後綴: "高風險網域後綴",
  縮短網址: "縮短網址",
  疑似冒充品牌: "疑似冒充品牌",
  敏感關鍵字: "敏感關鍵字",
  格式錯誤: "格式錯誤",
  格式不支援: "格式不支援",
};

const FAQ_ITEMS = [
  {
    q: "如何自己辨識可疑網址？",
    a: "留意網域拼字是否與官方一致（例如多了連字號、字母被置換）、是否用 IP 位址取代網域、網址是否異常冗長、是否要求你在陌生頁面輸入帳號密碼或驗證碼。收到簡訊、Email 或社群訊息附的連結，尤其要多一分警覺。",
  },
  {
    q: "點了惡意連結會發生什麼事？",
    a: "常見後果包括：被導向假冒官方頁面騙取帳號密碼、被誘導安裝惡意程式、裝置或瀏覽器資料被竊取、甚至直接被要求輸入付款資訊而造成財損。就算只是「看一下」，也可能觸發自動下載或追蹤，建議先查證再點擊。",
  },
  {
    q: "這個工具能保證網址一定安全嗎？",
    a: "不能。本工具依規則進行結構性分析（例如網域格式、是否冒用品牌、是否使用縮短網址等），沒有連接外部的惡意網站資料庫，無法涵蓋所有已知威脅。「安全」代表沒有偵測到明顯風險特徵，不代表絕對安全，仍建議保持警覺。",
  },
  {
    q: "縮短網址（如 bit.ly）也能檢查嗎？",
    a: "可以。系統會嘗試追蹤縮短網址實際導向的目的地，並針對真正的目標網址進行分析，而不是只看縮短網址本身的網域。",
  },
  {
    q: "查詢紀錄會被保存嗎？",
    a: "會保存查詢結果（網址、風險判定），供平台管理端掌握整體查詢趨勢與常見風險類型，並協助持續改善偵測規則。查詢不需要登入或提供個人身分資訊。",
  },
];

export function UrlCheck() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<UrlScanResult | null>(null);

  const mutation = useMutation({
    mutationFn: scanUrl,
    onSuccess: (data) => setResult(data),
    onError: (err) => toast.error(err instanceof Error ? err.message : "查詢失敗，請稍後再試"),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("請輸入要查詢的網址");
      return;
    }
    setResult(null);
    mutation.mutate(url.trim());
  };

  const meta = result ? STATUS_META[result.status] : null;

  return (
    <div className="space-y-10 animate-in fade-in pb-12">
      <div className="space-y-2 mt-4">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground flex items-center gap-3">
          <LinkIcon className="w-8 h-8 text-primary" />
          網址安全查詢
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          收到可疑的簡訊、Email 或社群訊息連結時，先貼上來查一下——幫助你快速判斷這個網址是否可能是釣魚、詐騙或惡意連結。
        </p>
      </div>

      <Card className="shadow-md border-t-4 border-t-primary">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                inputMode="url"
                placeholder="貼上要查詢的網址，例如 https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-9 h-11 text-base"
                aria-label="要查詢的網址"
              />
            </div>
            <Button type="submit" size="lg" disabled={mutation.isPending} className="sm:w-32">
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "檢查"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {mutation.isPending && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
          <p className="text-muted-foreground animate-pulse">正在分析網址結構與追蹤目的地...</p>
        </div>
      )}

      {result && meta && (
        <Card className={cn("shadow-md overflow-hidden border-2", meta.panelClass)}>
          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <meta.icon className="w-8 h-8 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">查詢結果</p>
                  <p className="text-2xl font-serif font-bold">{meta.label}</p>
                </div>
              </div>
              <Badge className={cn("text-sm py-1.5 px-3 font-bold self-start sm:self-auto", meta.badgeClass)}>
                安全分數 {result.score} / 100
              </Badge>
            </div>

            <div className="bg-background/60 rounded-md p-3 border space-y-1.5">
              <p className="text-sm break-all">
                <span className="text-muted-foreground">查詢網址：</span>
                {result.normalizedUrl}
              </p>
              {result.finalUrl && result.finalUrl !== result.normalizedUrl && (
                <p className="text-sm break-all">
                  <span className="text-muted-foreground">實際導向目的地：</span>
                  {result.finalUrl}
                </p>
              )}
            </div>

            {result.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {result.categories.map((c) => (
                  <Badge key={c} variant="outline">
                    {CATEGORY_LABELS[c] ?? c}
                  </Badge>
                ))}
              </div>
            )}

            {result.riskReasons.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground/70">判定依據</h3>
                <ul className="space-y-1.5">
                  {result.riskReasons.map((r, i) => (
                    <li key={i} className="text-sm text-foreground/80 flex gap-2">
                      <span className="text-foreground/40 shrink-0">・</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-background rounded-md p-4 border flex gap-3">
              <Info className="w-5 h-5 shrink-0 text-primary mt-0.5" />
              <div>
                <p className="font-bold text-sm mb-1">建議</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{result.recommendation}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <h2 className="text-xl font-serif font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> 什麼是惡意網址？
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed">
              惡意網址泛指偽裝成正常網站、實則用來竊取個資、帳號密碼，或散布惡意程式的連結。常見型態包括：假冒銀行／購物網站的釣魚頁面、假借知名品牌名義的詐騙頁面，以及誘導安裝惡意軟體的下載連結。
            </p>
            <p className="text-sm text-foreground/80 leading-relaxed">
              這類連結常透過簡訊、Email、社群訊息或即時通訊軟體傳播，並利用「中獎」「帳戶異常」「包裹待領」等情境製造急迫感，讓人來不及查證就點擊。
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <h2 className="text-xl font-serif font-bold flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-primary" /> 隨時隨地都能查
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed">
              不論是在手機上收到簡訊、在電腦上收到 Email，或是在社群軟體看到朋友分享的連結，都可以先複製貼到這裡查一下，不需要安裝任何應用程式或建立帳號。
            </p>
            <p className="text-sm text-foreground/80 leading-relaxed">
              查詢結果僅供參考，無法涵蓋所有已知惡意網站資料庫——當結果顯示「可疑」或「高風險」時請格外留意；顯示「安全」時，仍建議確認網域拼字與您預期的一致，再輸入任何帳號密碼。
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-xl font-serif font-bold mb-2">常見問答</h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-base font-medium">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
