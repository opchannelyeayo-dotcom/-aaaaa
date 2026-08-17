import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, Loader2, Search, ShieldAlert, Trash2 } from "lucide-react";
import { listUrlScans, deleteUrlScan, type UrlScanStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const STATUS_META: Record<UrlScanStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  safe: { label: "安全", variant: "default" },
  suspicious: { label: "可疑", variant: "secondary" },
  high_risk: { label: "高風險", variant: "destructive" },
  unknown: { label: "無法判斷", variant: "outline" },
};

export function UrlScans() {
  const { role } = useAuth();
  const canDelete = role === "super_admin";
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [status, setStatus] = useState<UrlScanStatus | "">("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const searchTimeout = useRef<number | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    setQ(value);
    window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      setQDebounced(value);
      setPage(1);
    }, 300);
  };

  const filters = { q: qDebounced || undefined, status: status || undefined, page, pageSize: PAGE_SIZE };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "url-scans", filters],
    queryFn: () => listUrlScans(filters),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUrlScan,
    onSuccess: () => {
      toast.success("已刪除該筆查詢紀錄");
      queryClient.invalidateQueries({ queryKey: ["admin", "url-scans"] });
    },
    onError: () => toast.error("刪除失敗，請稍後再試"),
    onSettled: () => setPendingDeleteId(null),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">網址查詢紀錄</h1>
        <p className="text-sm text-muted-foreground mt-1">
          消費者端「網址安全查詢」工具的查詢歷史，僅供瀏覽與清除測試資料，判定結果不可手動編輯。
        </p>
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(STATUS_META) as UrlScanStatus[]).map((s) => (
            <Card key={s}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{STATUS_META[s].label}</p>
                <p className="text-2xl font-bold">{data.statusCounts[s] ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜尋網域..."
              className="pl-9"
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as UrlScanStatus | "");
              setPage(1);
            }}
          >
            <option value="">所有狀態</option>
            {(Object.keys(STATUS_META) as UrlScanStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !data || data.scans.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">沒有符合條件的查詢紀錄。</p>
      ) : (
        <>
          <div className={cn("grid gap-3", isFetching && "opacity-60 transition-opacity")}>
            {data.scans.map((scan) => {
              const meta = STATUS_META[scan.status];
              const expanded = expandedId === scan.id;
              return (
                <Card key={scan.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : scan.id)}
                        className="flex-1 min-w-0 flex items-start gap-3 text-left"
                      >
                        <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium font-mono text-sm truncate">{scan.domain}</span>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                            <span className="text-xs text-muted-foreground">分數 {scan.score}</span>
                          </div>
                          <p className="text-xs text-muted-foreground break-all truncate">{scan.normalizedUrl}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(scan.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 text-muted-foreground shrink-0 transition-transform mt-0.5",
                            expanded && "rotate-180",
                          )}
                        />
                      </button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-destructive"
                          disabled={deleteMutation.isPending && pendingDeleteId === scan.id}
                          onClick={() => {
                            if (!window.confirm("確定要刪除這筆查詢紀錄嗎？此動作無法復原。")) return;
                            setPendingDeleteId(scan.id);
                            deleteMutation.mutate(scan.id);
                          }}
                        >
                          {deleteMutation.isPending && pendingDeleteId === scan.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>

                    {expanded && (
                      <div className="pt-3 border-t space-y-3 text-sm">
                        {scan.finalUrl && scan.finalDomain !== scan.domain && (
                          <div>
                            <p className="text-muted-foreground mb-1">實際導向</p>
                            <p className="break-all">{scan.finalUrl}</p>
                          </div>
                        )}
                        {scan.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {scan.categories.map((c) => (
                              <Badge key={c} variant="outline" className="font-normal">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div>
                          <p className="text-muted-foreground mb-1">判定依據</p>
                          <ul className="space-y-1">
                            {scan.riskReasons.map((r, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">・</span>
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-muted/50 rounded-md p-3">
                          <p className="font-medium mb-1">建議</p>
                          <p className="text-muted-foreground leading-relaxed">{scan.recommendation}</p>
                        </div>
                        <a
                          href={scan.normalizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline text-xs break-all"
                        >
                          在新分頁開啟原始網址（請自行評估風險）
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
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
