import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useProcessOcr, useAnalyzeRhetoric, useSearchProducts, getSearchProductsQueryKey, ApiError, type PublicProduct } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NutrientReference } from "@/components/nutrient-reference";
import { ProductDetailDialog } from "@/components/product-detail-dialog";
import { toast } from "sonner";
import { Type, Image as ImageIcon, Pill, Loader2, UploadCloud, ArrowRight, Search, Store, User } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_TEXT_LENGTH = 6000;
const MAX_IMAGE_MB = 8;

// Mirrors artifacts/admin-console/src/pages/products.tsx — same reference
// product database, so the category labels stay consistent across both apps.
const productCategoryLabel: Record<string, string> = {
  drug: "藥品",
  health_food: "健康食品／保健品",
  other: "其他"
};

// The backend deliberately hides the real cause of 5xx errors from the
// client (see artifacts/api-server/src/app.ts) so it never leaks a stack
// trace to end users — the actual reason (missing OPENAI_API_KEY, DB
// connection failure, etc.) only appears in the api-server terminal/log
// output. Here we just distinguish "reached the server, it rejected the
// request" (ApiError, has a status code) from "never reached the server at
// all" (a raw fetch failure — usually a proxy/port misconfiguration when
// running locally), since that split is the fastest way to know where to
// look next.
function describeRequestError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return `${fallback}（HTTP ${error.status}：${error.message}）`;
  }
  if (error instanceof TypeError) {
    return `${fallback}（無法連線到後端伺服器，請確認 api-server 是否正在執行）`;
  }
  return fallback;
}

export function Home() {
  const [, setLocation] = useLocation();
  // Role is a layer above the three input-method tabs (spec: "貼上文字 / 上
  // 傳圖片 / 藥品查詢 是內容輸入入口，不是角色判斷邏輯本身") — it decides
  // which input methods are available and which analysis prompt runs, not
  // what kind of content is being submitted.
  const [role, setRole] = useState<"seller" | "consumer">("consumer");
  const [mode, setMode] = useState<"text" | "image" | "product">("text");
  const [inputType, setInputType] = useState<"text" | "image">("text");
  const [textContent, setTextContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [productQuery, setProductQuery] = useState("");
  const [submittedProductQuery, setSubmittedProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);

  const processOcr = useProcessOcr({
    mutation: {
      onSuccess: (data) => {
        const extracted = data.ocrText?.trim() ?? "";
        if (!extracted) {
          toast.error("沒有在圖片中辨識到文字，請換一張更清楚的截圖再試一次");
          return;
        }
        setTextContent(extracted);
        setInputType("image");
        setMode("text"); // Switch back to text to show the extracted result
        toast.success("文字萃取成功，請確認或修改內容");
      },
      onError: (error) => toast.error(describeRequestError(error, "影像處理失敗，請重試"))
    }
  });

  const analyze = useAnalyzeRhetoric({
    mutation: {
      // The gpt-4o call this hits regularly takes 4+ seconds, which is long
      // enough for a flaky local connection to drop mid-request (the browser
      // then throws a plain network TypeError, not an ApiError). Retrying
      // that case automatically avoids surfacing a one-off connection blip
      // as "analysis failed" — but only for that case: an ApiError means the
      // request actually reached the server and got a real response (4xx/5xx),
      // so retrying would just repeat the same outcome at the cost of another
      // OpenAI call.
      retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
      retryDelay: 1000,
      onSuccess: (data) => {
        setLocation(`/result/${data.recordId}`);
      },
      onError: (error) => toast.error(describeRequestError(error, "分析失敗，請稍後再試"))
    }
  });

  // Only fetches once the user is on this tab, so switching to "text"/"image"
  // doesn't leave a stray products request running in the background.
  const productSearch = useSearchProducts(
    { q: submittedProductQuery || undefined },
    {
      query: {
        enabled: mode === "product",
        queryKey: getSearchProductsQueryKey({ q: submittedProductQuery || undefined })
      }
    }
  );

  const handleProductSearch = () => {
    setSubmittedProductQuery(productQuery.trim());
  };

  // 藥品查詢 only exists in consumer mode (spec D) — switching to seller
  // while it's open would leave the UI on a tab that no longer has a button
  // for it, so fall back to 貼上文字 in that case.
  const handleRoleChange = (nextRole: "seller" | "consumer") => {
    setRole(nextRole);
    if (nextRole === "seller" && mode === "product") {
      setMode("text");
    }
  };

  // Lets a consumer jump straight from a 藥品查詢 result into a consumer-mode
  // risk analysis of that product's own official claims (spec D: "消費者模
  // 式若使用藥品查詢，應將查詢結果納入判定"), instead of 藥品查詢 being a
  // dead-end lookup with no path into the judgment pipeline.
  const handleAnalyzeProduct = (product: PublicProduct) => {
    const parts = [
      `產品名稱：${product.name}`,
      product.registrationNumber && `核准字號：${product.registrationNumber}`,
      `核准適應症／功能：${product.approvedUses}`,
      product.efficacyClaim && `保健功效宣稱：${product.efficacyClaim}`,
      product.warningTextSimplified && `警語：${product.warningTextSimplified}`,
      product.precautions && `注意事項：${product.precautions}`,
    ].filter(Boolean);
    setSelectedProduct(null);
    analyze.mutate({ data: { inputType: "text", textContent: parts.join("\n"), role: "consumer" } });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("請選擇圖片檔案（JPG、PNG、WEBP 等）");
      e.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`圖片檔案過大，請上傳 ${MAX_IMAGE_MB}MB 以下的圖片`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;

      const parts = result.split(",");
      if (parts.length !== 2) return;

      const mimeMatch = parts[0].match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : file.type;
      const imageBase64 = parts[1];

      processOcr.mutate({ data: { imageBase64, mimeType } });
    };
    reader.onerror = () => {
      toast.error("圖片讀取失敗，請重試");
    };
    reader.readAsDataURL(file);
    // reset input value so the same file can be selected again
    e.target.value = '';
  };

  const handleAnalyze = () => {
    if (!textContent.trim()) {
      toast.error("請輸入要分析的文字");
      return;
    }
    if (textContent.length > MAX_TEXT_LENGTH) {
      toast.error(`文字內容過長，請控制在 ${MAX_TEXT_LENGTH} 字以內`);
      return;
    }
    analyze.mutate({ data: { inputType, textContent, role } });
  };

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      <div className="text-center space-y-4 mb-8 mt-4">
        <h1 className="text-3xl md:text-5xl font-serif font-bold text-foreground tracking-tight">揭開話術的面紗</h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          將可疑的健康產品廣告文字貼上，或是上傳廣告圖片。<br className="hidden md:inline" />
          話術透視鏡會為您標示其中的行銷陷阱與操縱手法。
        </p>
      </div>

      <Card className="max-w-3xl mx-auto border-2 shadow-lg overflow-hidden transition-all">
        <div className="flex border-b-2 border-primary/10 bg-primary/5">
          <button
            onClick={() => handleRoleChange("seller")}
            className={cn("flex-1 py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors", role === "seller" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-primary/10")}
          >
            <Store className="w-4 h-4" />
            賣家
          </button>
          <button
            onClick={() => handleRoleChange("consumer")}
            className={cn("flex-1 py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors", role === "consumer" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-primary/10")}
          >
            <User className="w-4 h-4" />
            消費者
          </button>
        </div>

        <div className="flex border-b bg-muted/20">
          <button
            onClick={() => setMode("text")}
            className={cn("flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors", mode === "text" ? "bg-background border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}
          >
            <Type className="w-4 h-4" />
            貼上文字
          </button>
          <button
            onClick={() => setMode("image")}
            className={cn("flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors", mode === "image" ? "bg-background border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}
          >
            <ImageIcon className="w-4 h-4" />
            上傳圖片
          </button>
          {role === "consumer" && (
            <button
              onClick={() => setMode("product")}
              className={cn("flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors", mode === "product" ? "bg-background border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}
            >
              <Pill className="w-4 h-4" />
              藥品查詢
            </button>
          )}
        </div>

        <CardContent className="p-6 md:p-8">
           {mode === "text" && (
             <div className="space-y-4 animate-in slide-in-from-right-2">
               <Textarea
                 placeholder="請輸入或貼上廣告文字內容..."
                 className="min-h-[240px] text-base resize-none focus-visible:ring-primary/50"
                 value={textContent}
                 onChange={(e) => {
                   setTextContent(e.target.value);
                   if (inputType === "image" && e.target.value === "") {
                     setInputType("text");
                   }
                 }}
               />
               <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
                 <span className={cn("text-xs tabular-nums", textContent.length > MAX_TEXT_LENGTH ? "text-destructive font-medium" : "text-muted-foreground")}>
                   {textContent.length} / {MAX_TEXT_LENGTH} 字
                 </span>
                 <Button size="lg" className="w-full sm:w-auto text-base" onClick={handleAnalyze} disabled={analyze.isPending || !textContent.trim() || textContent.length > MAX_TEXT_LENGTH}>
                   {analyze.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                   {role === "seller" ? "開始賣家分析" : "開始消費者分析"}
                 </Button>
               </div>
             </div>
           )}
           {mode === "image" && (
             <div className="animate-in slide-in-from-left-2">
               <div
                 className="border-2 border-dashed border-primary/20 rounded-xl p-6 sm:p-12 text-center hover:bg-primary/5 hover:border-primary/40 transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[240px]"
                 onClick={() => !processOcr.isPending && fileInputRef.current?.click()}
               >
                 <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                 {processOcr.isPending ? (
                   <div className="flex flex-col items-center text-primary">
                     <Loader2 className="w-10 h-10 animate-spin mb-4" />
                     <p className="font-bold">正在辨識圖片文字...</p>
                     <p className="text-sm text-muted-foreground mt-2">這可能需要幾秒鐘的時間</p>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center text-muted-foreground">
                     <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                       <UploadCloud className="w-8 h-8 text-primary" />
                     </div>
                     <p className="font-bold text-foreground text-lg mb-2">點擊選擇圖片</p>
                     <p className="text-sm">支援 JPG, PNG, WEBP 等常見格式</p>
                     <p className="text-xs mt-4 bg-muted px-3 py-1 rounded-full">我們將自動為您擷取圖片中的文字</p>
                   </div>
                 )}
               </div>
             </div>
           )}
           {mode === "product" && (
             <div className="animate-in slide-in-from-right-2 space-y-4">
               <div className="flex gap-2">
                 <Input
                   placeholder="輸入藥品／保健品名稱、廠商或核准字號..."
                   value={productQuery}
                   onChange={(e) => setProductQuery(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === "Enter") handleProductSearch();
                   }}
                 />
                 <Button onClick={handleProductSearch} disabled={productSearch.isFetching}>
                   {productSearch.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                   <span className="ml-2 hidden sm:inline">查詢</span>
                 </Button>
               </div>

               <div className="min-h-[240px] max-h-[420px] overflow-y-auto space-y-3 pr-1">
                 {productSearch.isLoading ? (
                   <div className="flex flex-col items-center justify-center text-muted-foreground py-16">
                     <Loader2 className="w-8 h-8 animate-spin mb-3" />
                     <p>查詢中...</p>
                   </div>
                 ) : productSearch.isError ? (
                   <div className="flex flex-col items-center justify-center text-muted-foreground py-16">
                     <p>查詢失敗，請稍後再試</p>
                   </div>
                 ) : !productSearch.data || productSearch.data.length === 0 ? (
                   <div className="flex flex-col items-center justify-center text-muted-foreground py-16 text-center px-4">
                     <Pill className="w-10 h-10 mb-3 opacity-40" />
                     <p>{submittedProductQuery ? "找不到符合的藥品／保健品資料" : "輸入關鍵字查詢核准藥品／保健品資料"}</p>
                   </div>
                 ) : (
                   productSearch.data.map((p) => (
                     <button
                       key={p.id}
                       type="button"
                       onClick={() => setSelectedProduct(p)}
                       className="w-full text-left border rounded-md p-4 bg-muted/20 space-y-1.5 hover:bg-muted/40 hover:border-primary/40 transition-colors cursor-pointer"
                     >
                       <div className="flex items-center gap-2 flex-wrap">
                         <span className="font-bold">{p.name}</span>
                         <Badge variant="outline">{productCategoryLabel[p.category] ?? p.category}</Badge>
                         {p.registrationNumber && (
                           <span className="text-xs text-muted-foreground font-mono">{p.registrationNumber}</span>
                         )}
                       </div>
                       {p.manufacturer && (
                         <p className="text-xs text-muted-foreground">製造商：{p.manufacturer}</p>
                       )}
                       <p className="text-sm text-muted-foreground leading-relaxed">
                         核准適應症／功能：{p.approvedUses}
                       </p>
                     </button>
                   ))
                 )}
               </div>
             </div>
           )}
        </CardContent>
      </Card>

      <NutrientReference />

      <div className="max-w-3xl mx-auto mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <div className="space-y-2 p-4">
          <div className="mx-auto w-12 h-12 bg-cat-fear/10 text-cat-fear rounded-full flex items-center justify-center mb-3">
             <span className="font-serif font-bold text-xl">1</span>
          </div>
          <h3 className="font-bold">輸入廣告內容</h3>
          <p className="text-sm text-muted-foreground">上傳長輩群組傳來的保健食品圖片，或直接貼上文案。</p>
        </div>
        <div className="space-y-2 p-4">
          <div className="mx-auto w-12 h-12 bg-cat-scarcity/10 text-cat-scarcity rounded-full flex items-center justify-center mb-3">
             <span className="font-serif font-bold text-xl">2</span>
          </div>
          <h3 className="font-bold">AI 智慧分析</h3>
          <p className="text-sm text-muted-foreground">系統會自動辨識六大常見的操縱性話術與行銷陷阱。</p>
        </div>
        <div className="space-y-2 p-4">
          <div className="mx-auto w-12 h-12 bg-cat-social/10 text-cat-social rounded-full flex items-center justify-center mb-3">
             <span className="font-serif font-bold text-xl">3</span>
          </div>
          <h3 className="font-bold">拆解與還原</h3>
          <p className="text-sm text-muted-foreground">獲得客觀的信任度評分，並看見去除包裝後的事實。</p>
        </div>
      </div>

      <ProductDetailDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAnalyze={handleAnalyzeProduct}
        analyzing={analyze.isPending}
      />
    </div>
  );
}
