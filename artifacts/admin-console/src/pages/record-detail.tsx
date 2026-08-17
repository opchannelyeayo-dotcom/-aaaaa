import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteRecord,
  getRecord,
  updateRecord,
  RHETORIC_CATEGORIES,
  type RecordDetail as RecordDetailData,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type AnnotationForm = { textSpan: string; category: string; explanation: string };

interface EditForm {
  originalText: string;
  credibilityScore: string;
  neutralRewrite: string;
  annotations: AnnotationForm[];
}

function toEditForm(record: RecordDetailData): EditForm {
  return {
    originalText: record.originalText,
    credibilityScore: String(record.credibilityScore),
    neutralRewrite: record.neutralRewrite,
    annotations: record.annotations.map((a) => ({ ...a })),
  };
}

export function RecordDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: record, isLoading, isError } = useQuery({
    queryKey: ["admin", "records", id],
    queryFn: () => getRecord(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);

  // Reset edit state whenever we land on a different record (or its data
  // reloads after a save), so stale form values never leak across records.
  useEffect(() => {
    setIsEditing(false);
    setForm(record ? toEditForm(record) : null);
  }, [record]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecord(id),
    onSuccess: () => {
      toast.success("已刪除該筆紀錄");
      queryClient.invalidateQueries({ queryKey: ["admin", "records"] });
      setLocation("/records");
    },
    onError: () => toast.error("刪除失敗，請稍後再試"),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: {
      originalText: string;
      credibilityScore: number;
      neutralRewrite: string;
      annotations: AnnotationForm[];
    }) => updateRecord(id, updates),
    onSuccess: (updated) => {
      toast.success("已儲存變更");
      queryClient.setQueryData(["admin", "records", id], updated);
      queryClient.invalidateQueries({ queryKey: ["admin", "records"], exact: false });
      setIsEditing(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "儲存失敗，請稍後再試");
    },
  });

  const handleSave = () => {
    if (!form) return;

    const originalText = form.originalText.trim();
    const neutralRewrite = form.neutralRewrite.trim();
    const score = Number(form.credibilityScore);

    if (!originalText) {
      toast.error("原文不可為空");
      return;
    }
    if (!neutralRewrite) {
      toast.error("中性改寫版不可為空");
      return;
    }
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      toast.error("信任度分數需為 0-100 之間的數字");
      return;
    }
    for (const ann of form.annotations) {
      if (!ann.textSpan.trim() || !ann.explanation.trim()) {
        toast.error("話術標註的原文片段與說明不可為空");
        return;
      }
      if (!originalText.includes(ann.textSpan.trim())) {
        toast.error(`話術標註「${ann.textSpan}」無法在原文中找到`);
        return;
      }
    }

    updateMutation.mutate({
      originalText,
      credibilityScore: score,
      neutralRewrite,
      annotations: form.annotations.map((a) => ({
        textSpan: a.textSpan.trim(),
        category: a.category,
        explanation: a.explanation.trim(),
      })),
    });
  };

  const updateAnnotation = (index: number, patch: Partial<AnnotationForm>) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            annotations: prev.annotations.map((a, i) => (i === index ? { ...a, ...patch } : a)),
          }
        : prev,
    );
  };

  const removeAnnotation = (index: number) => {
    setForm((prev) =>
      prev ? { ...prev, annotations: prev.annotations.filter((_, i) => i !== index) } : prev,
    );
  };

  const addAnnotation = () => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            annotations: [
              ...prev.annotations,
              { textSpan: "", category: RHETORIC_CATEGORIES[0], explanation: "" },
            ],
          }
        : prev,
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
        <AlertTriangle className="w-12 h-12 text-destructive/80" />
        <p className="text-muted-foreground">找不到這筆分析紀錄。</p>
        <Link href="/records">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> 回列表
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/records">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> 回列表
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={updateMutation.isPending}
                onClick={() => {
                  setForm(toEditForm(record));
                  setIsEditing(false);
                }}
              >
                <X className="w-4 h-4 mr-2" /> 取消
              </Button>
              <Button size="sm" disabled={updateMutation.isPending} onClick={handleSave}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                儲存變更
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="w-4 h-4 mr-2" /> 編輯
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (!window.confirm("確定要刪除這筆分析紀錄嗎？此動作無法復原。")) return;
                  deleteMutation.mutate();
                }}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                刪除紀錄
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>#{record.id}</span>
        <span>·</span>
        <span>{new Date(record.createdAt).toLocaleString()}</span>
        <span>·</span>
        <span>{record.inputType === "image" ? "截圖 OCR" : "文字輸入"}</span>
        {!isEditing && (
          <>
            <span>·</span>
            <span className="font-semibold text-foreground">
              信任度 {record.credibilityScore.toFixed(0)}
            </span>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> 原文
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing && form ? (
            <>
              <Textarea
                value={form.originalText}
                onChange={(e) => setForm({ ...form, originalText: e.target.value })}
                className="min-h-[140px]"
              />
              <div className="space-y-1.5 max-w-[160px]">
                <label className="text-sm font-medium">信任度分數（0-100）</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.credibilityScore}
                  onChange={(e) => setForm({ ...form, credibilityScore: e.target.value })}
                />
              </div>
            </>
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">{record.originalText}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>話術拆解清單</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing && form ? (
            <div className="space-y-4">
              {form.annotations.length === 0 && (
                <p className="text-sm text-muted-foreground">尚無標註，可點下方按鈕新增。</p>
              )}
              <div className="grid gap-3">
                {form.annotations.map((ann, idx) => (
                  <div key={idx} className="border border-border rounded-md p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="原文片段（需完全出現在原文中）"
                          value={ann.textSpan}
                          onChange={(e) => updateAnnotation(idx, { textSpan: e.target.value })}
                        />
                        <Select
                          value={ann.category}
                          onChange={(e) => updateAnnotation(idx, { category: e.target.value })}
                        >
                          {RHETORIC_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                        <Textarea
                          placeholder="說明這句話在做什麼操縱"
                          value={ann.explanation}
                          onChange={(e) => updateAnnotation(idx, { explanation: e.target.value })}
                          className="min-h-[70px]"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAnnotation(idx)}
                        aria-label="刪除此標註"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addAnnotation}>
                <Plus className="w-4 h-4 mr-2" /> 新增標註
              </Button>
            </div>
          ) : record.annotations.length === 0 ? (
            <p className="text-sm text-muted-foreground">這段文字沒有偵測到明顯的操縱性話術。</p>
          ) : (
            <div className="grid gap-3">
              {record.annotations.map((ann, idx) => (
                <div key={idx} className="border border-border rounded-md p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">「{ann.textSpan}」</span>
                    <Badge>{ann.category}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{ann.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>中性重寫版本</CardTitle>
          <CardDescription>去除操控性語言後的客觀版本</CardDescription>
        </CardHeader>
        <CardContent>
          {isEditing && form ? (
            <Textarea
              value={form.neutralRewrite}
              onChange={(e) => setForm({ ...form, neutralRewrite: e.target.value })}
              className="min-h-[100px]"
            />
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {record.neutralRewrite}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
