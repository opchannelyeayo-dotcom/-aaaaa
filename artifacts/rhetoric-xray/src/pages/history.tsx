import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListRecords, useGetRecordStats } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Calendar, FileText, Image as ImageIcon, ChevronRight, ShieldCheck, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function History() {
  const { data: records, isLoading: loadingRecords } = useListRecords();
  const { data: stats, isLoading: loadingStats } = useGetRecordStats();
  const [query, setQuery] = useState("");

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records?.filter(record => record.originalText.toLowerCase().includes(q));
  }, [records, query]);

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      <div className="space-y-2 mt-4">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground">歷史紀錄</h1>
        <p className="text-lg text-muted-foreground">過去分析過的所有廣告文案與結果。</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 animate-in slide-in-from-bottom-2">
          <Card className="shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">總分析筆數</p>
              <p className="text-2xl sm:text-3xl font-serif font-bold text-primary">{stats.totalRecords}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">平均信任度</p>
              <p className="text-2xl sm:text-3xl font-serif font-bold" style={{ color: stats.avgCredibilityScore < 40 ? 'var(--color-destructive)' : stats.avgCredibilityScore < 70 ? '#f59e0b' : '#10b981' }}>
                {Math.round(stats.avgCredibilityScore)}
              </p>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-2 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-3">常見話術分佈</p>
              <div className="flex flex-wrap gap-2">
                {stats.categoryBreakdown.map(cat => (
                  <Badge key={cat.category} variant="secondary" className="font-medium text-xs py-1 border-muted-foreground/20">
                    {cat.category} <span className="ml-1 opacity-60">({cat.count})</span>
                  </Badge>
                ))}
                {stats.categoryBreakdown.length === 0 && (
                  <span className="text-sm text-muted-foreground">尚無資料</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!loadingRecords && !loadingStats && records && records.length > 0 && (
        <div className="relative animate-in slide-in-from-bottom-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜尋原文內容..."
            className="pl-9 pr-9"
            aria-label="搜尋歷史紀錄"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="清除搜尋"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {loadingRecords || loadingStats ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
        </div>
      ) : (
        <div className="grid gap-4 mt-8 animate-in slide-in-from-bottom-4">
          <h2 className="text-xl font-serif font-bold text-foreground mb-2">
            {query ? `搜尋結果（${filteredRecords?.length ?? 0}）` : "近期分析"}
          </h2>
          {filteredRecords?.map(record => (
            <Link key={record.id} href={`/result/${record.id}`}>
              <Card className="hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group border-l-4" style={{ borderLeftColor: record.credibilityScore < 40 ? 'var(--color-destructive)' : record.credibilityScore < 70 ? '#f59e0b' : '#10b981' }}>
                <CardContent className="p-4 sm:p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="flex items-center text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-sm">
                        <Calendar className="w-3.5 h-3.5 mr-1" />
                        {new Date(record.createdAt).toLocaleDateString()}
                      </span>
                      <Badge variant="outline" className="text-xs py-0 h-6 border-muted-foreground/30 text-muted-foreground">
                        {record.inputType === "image" ? <ImageIcon className="w-3 h-3 mr-1.5" /> : <FileText className="w-3 h-3 mr-1.5" />}
                        {record.inputType === "image" ? "圖片辨識" : "文字輸入"}
                      </Badge>
                      <Badge variant={record.annotationCount > 0 ? "destructive" : "secondary"} className="text-xs py-0 h-6 border-transparent">
                        發現 {record.annotationCount} 個話術
                      </Badge>
                      <Badge variant="outline" className="text-xs py-0 h-6 border-muted-foreground/30 text-muted-foreground">
                        {record.role === "seller" ? "賣家視角" : "消費者視角"}
                      </Badge>
                    </div>
                    <p className="text-base text-foreground/90 line-clamp-2 font-serif leading-relaxed">
                      {record.originalText}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 sm:border-l sm:pl-4">
                    <div className="text-left sm:text-center sm:min-w-[60px]">
                      <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">信任度</p>
                      <p className="text-2xl font-bold font-serif leading-none"
                         style={{ color: record.credibilityScore < 40 ? 'var(--color-destructive)' : record.credibilityScore < 70 ? '#f59e0b' : '#10b981' }}>
                        {record.credibilityScore}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-muted/50 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {records?.length === 0 && (
             <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/10">
               <ShieldCheck className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
               <p className="text-lg font-medium text-foreground">目前還沒有任何分析紀錄</p>
               <p className="text-muted-foreground mt-2 mb-6">開始分析第一篇廣告文案吧！</p>
               <Link href="/">
                 <Button>開始分析</Button>
               </Link>
             </div>
          )}
          {records && records.length > 0 && filteredRecords?.length === 0 && (
             <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/10">
               <Search className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
               <p className="text-lg font-medium text-foreground">找不到符合「{query}」的紀錄</p>
               <p className="text-muted-foreground mt-2 mb-6">試試其他關鍵字。</p>
               <Button variant="outline" onClick={() => setQuery("")}>清除搜尋</Button>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
