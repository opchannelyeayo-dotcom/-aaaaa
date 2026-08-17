import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteProduct,
  importProducts,
  listProducts,
  PRODUCT_CATEGORIES,
  type ImportProductsResult,
  type ProductCategory,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 20;

function categoryLabel(category: ProductCategory): string {
  return PRODUCT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function Products() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [category, setCategory] = useState<ProductCategory | "">("");
  const [page, setPage] = useState(1);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<ImportProductsResult | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const filters = {
    q: qDebounced || undefined,
    category: category || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "products", filters],
    queryFn: () => listProducts(filters),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      toast.success("已刪除該筆產品資料");
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: () => toast.error("刪除失敗，請稍後再試"),
    onSettled: () => setPendingDeleteId(null),
  });

  const importMutation = useMutation({
    mutationFn: importProducts,
    onSuccess: (result) => {
      setImportResult(result);
      if (result.imported > 0) {
        toast.success(`已匯入 ${result.imported} / ${result.total} 筆產品資料`);
        queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      } else {
        toast.error("沒有任何一筆資料成功匯入，請檢查 CSV 內容");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "匯入失敗，請稍後再試");
    },
  });

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result;
      if (!(buffer instanceof ArrayBuffer)) return;

      // Excel on Traditional Chinese Windows saves "CSV" as Big5 by default,
      // not UTF-8 — decoding those bytes as UTF-8 doesn't throw, it just
      // turns every Chinese header/value into U+FFFD replacement characters,
      // which then silently fails to match any column alias. Detect that and
      // re-decode as Big5 instead of asking the user to re-save their file.
      let text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      if (text.includes("�")) {
        text = new TextDecoder("big5").decode(buffer);
      }
      importMutation.mutate(text);
    };
    reader.onerror = () => toast.error("檔案讀取失敗，請重試");
    reader.readAsArrayBuffer(file);
  };

  // Same debounce approach as pages/records.tsx.
  const searchTimeout = useRef<number | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    setQ(value);
    window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      setQDebounced(value);
      setPage(1);
    }, 300);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">藥品／保健品資料庫</h1>
          <p className="text-sm text-muted-foreground mt-1">
            用來比對廣告文案宣稱的療效是否與核准適應症相符。
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button
            variant="outline"
            disabled={importMutation.isPending}
            onClick={() => importInputRef.current?.click()}
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            匯入 CSV
          </Button>
          <Link href="/products/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" /> 新增產品
            </Button>
          </Link>
        </div>
      </div>

      {importResult && (
        <Card className={importResult.skipped.length > 0 ? "border-amber-500/50" : undefined}>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                匯入結果：成功 {importResult.imported} / {importResult.total} 筆
              </p>
              <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>
                關閉
              </Button>
            </div>
            {importResult.skipped.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {importResult.skipped.map((s) => (
                  <p key={s.row} className="text-muted-foreground">
                    第 {s.row} 列略過：{s.reason}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜尋產品名稱、製造商或核准字號..."
              className="pl-9"
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ProductCategory | "");
              setPage(1);
            }}
          >
            <option value="">所有分類</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !data || data.products.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">沒有符合條件的產品資料。</p>
      ) : (
        <>
          <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <div className="grid gap-3">
              {data.products.map((product) => (
                <Card key={product.id}>
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <Link href={`/products/${product.id}`} className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{product.name}</span>
                        <Badge>{categoryLabel(product.category)}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {product.manufacturer && <span>{product.manufacturer}</span>}
                        {product.registrationNumber && (
                          <>
                            <span>·</span>
                            <span>{product.registrationNumber}</span>
                          </>
                        )}
                        {product.drugCode && (
                          <>
                            <span>·</span>
                            <span>藥品代碼 {product.drugCode}</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {product.approvedUses}
                      </p>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                      disabled={deleteMutation.isPending && pendingDeleteId === product.id}
                      onClick={() => {
                        if (!window.confirm("確定要刪除這筆產品資料嗎？此動作無法復原。")) return;
                        setPendingDeleteId(product.id);
                        deleteMutation.mutate(product.id);
                      }}
                    >
                      {deleteMutation.isPending && pendingDeleteId === product.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </CardContent>
                </Card>
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
