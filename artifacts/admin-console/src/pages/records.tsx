import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Download, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteRecord,
  exportUrl,
  listRecords,
  RHETORIC_CATEGORIES,
  type InputType,
  type SortOption,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 20;

export function Records() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [inputType, setInputType] = useState<InputType | "">("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const filters = {
    q: qDebounced || undefined,
    inputType: inputType || undefined,
    category: category || undefined,
    sort,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "records", filters],
    queryFn: () => listRecords(filters),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecord,
    onSuccess: () => {
      toast.success("已刪除該筆紀錄");
      queryClient.invalidateQueries({ queryKey: ["admin", "records"] });
    },
    onError: () => toast.error("刪除失敗，請稍後再試"),
    onSettled: () => setPendingDeleteId(null),
  });

  // Debounce the search box so every keystroke doesn't fire a request —
  // simple timeout-based debounce is enough here, no need for a library.
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
        <h1 className="text-2xl font-bold">分析紀錄</h1>
        <a href={exportUrl({ q: qDebounced || undefined, inputType: inputType || undefined, category: category || undefined, sort })}>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" /> 匯出 CSV
          </Button>
        </a>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜尋原文內容..."
              className="pl-9"
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <Select
            value={inputType}
            onChange={(e) => {
              setInputType(e.target.value as InputType | "");
              setPage(1);
            }}
          >
            <option value="">所有來源</option>
            <option value="text">文字輸入</option>
            <option value="image">截圖 OCR</option>
          </Select>
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">所有話術分類</option>
            {RHETORIC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortOption);
              setPage(1);
            }}
          >
            <option value="newest">最新優先</option>
            <option value="oldest">最舊優先</option>
            <option value="score_asc">信任度：低到高</option>
            <option value="score_desc">信任度：高到低</option>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !data || data.records.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">沒有符合條件的紀錄。</p>
      ) : (
        <>
          <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <div className="grid gap-3">
              {data.records.map((record) => (
                <Card key={record.id}>
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <Link href={`/records/${record.id}`} className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(record.createdAt).toLocaleString()}</span>
                        <span>·</span>
                        <span>{record.inputType === "image" ? "截圖 OCR" : "文字輸入"}</span>
                        <span>·</span>
                        <span>信任度 {record.credibilityScore.toFixed(0)}</span>
                      </div>
                      <p className="text-sm truncate">{record.originalText}</p>
                      {record.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {record.categories.map((c) => (
                            <Badge key={c}>{c}</Badge>
                          ))}
                        </div>
                      )}
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                      disabled={deleteMutation.isPending && pendingDeleteId === record.id}
                      onClick={() => {
                        if (!window.confirm("確定要刪除這筆分析紀錄嗎？此動作無法復原。")) return;
                        setPendingDeleteId(record.id);
                        deleteMutation.mutate(record.id);
                      }}
                    >
                      {deleteMutation.isPending && pendingDeleteId === record.id ? (
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
