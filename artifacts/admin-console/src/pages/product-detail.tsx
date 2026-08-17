import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Trash2, X } from "lucide-react";
import {
  createProduct,
  deleteProduct,
  getProduct,
  updateProduct,
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type ReferenceProduct,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ProductForm {
  name: string;
  category: ProductCategory;
  manufacturer: string;
  registrationNumber: string;
  approvedUses: string;
  ingredients: string;
  sourceUrl: string;
  notes: string;
  drugCode: string;
  formulaName: string;
  dosageForm: string;
  issuedDate: string;
  sourceId: string;
  applicant: string;
  certificateStatus: string;
  efficacyIngredients: string;
  efficacyClaim: string;
  warningText: string;
  warningTextSimplified: string;
  precautions: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  category: "drug",
  manufacturer: "",
  registrationNumber: "",
  approvedUses: "",
  ingredients: "",
  sourceUrl: "",
  notes: "",
  drugCode: "",
  formulaName: "",
  dosageForm: "",
  issuedDate: "",
  sourceId: "",
  applicant: "",
  certificateStatus: "",
  efficacyIngredients: "",
  efficacyClaim: "",
  warningText: "",
  warningTextSimplified: "",
  precautions: "",
};

function toForm(product: ReferenceProduct): ProductForm {
  return {
    name: product.name,
    category: product.category,
    manufacturer: product.manufacturer ?? "",
    registrationNumber: product.registrationNumber ?? "",
    approvedUses: product.approvedUses,
    ingredients: product.ingredients ?? "",
    sourceUrl: product.sourceUrl ?? "",
    notes: product.notes ?? "",
    drugCode: product.drugCode ?? "",
    formulaName: product.formulaName ?? "",
    dosageForm: product.dosageForm ?? "",
    issuedDate: product.issuedDate ?? "",
    sourceId: product.sourceId ?? "",
    applicant: product.applicant ?? "",
    certificateStatus: product.certificateStatus ?? "",
    efficacyIngredients: product.efficacyIngredients ?? "",
    efficacyClaim: product.efficacyClaim ?? "",
    warningText: product.warningText ?? "",
    warningTextSimplified: product.warningTextSimplified ?? "",
    precautions: product.precautions ?? "",
  };
}

export function ProductDetail() {
  const params = useParams();
  const isNew = params.id === "new";
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ["admin", "products", id],
    queryFn: () => getProduct(id),
    enabled: !isNew && Number.isInteger(id) && id > 0,
  });

  const [isEditing, setIsEditing] = useState(isNew);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);

  // Reset edit state whenever we land on a different product (or its data
  // reloads after a save) — same pattern as pages/record-detail.tsx.
  useEffect(() => {
    if (isNew) {
      setIsEditing(true);
      setForm(EMPTY_FORM);
      return;
    }
    setIsEditing(false);
    setForm(product ? toForm(product) : EMPTY_FORM);
  }, [product, isNew]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(id),
    onSuccess: () => {
      toast.success("已刪除該筆產品資料");
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      setLocation("/products");
    },
    onError: () => toast.error("刪除失敗，請稍後再試"),
  });

  const saveMutation = useMutation({
    mutationFn: (input: ProductForm) => {
      const payload = {
        name: input.name.trim(),
        category: input.category,
        approvedUses: input.approvedUses.trim(),
        manufacturer: input.manufacturer.trim() || null,
        registrationNumber: input.registrationNumber.trim() || null,
        ingredients: input.ingredients.trim() || null,
        sourceUrl: input.sourceUrl.trim() || null,
        notes: input.notes.trim() || null,
        drugCode: input.drugCode.trim() || null,
        formulaName: input.formulaName.trim() || null,
        dosageForm: input.dosageForm.trim() || null,
        issuedDate: input.issuedDate.trim() || null,
        sourceId: input.sourceId.trim() || null,
        applicant: input.applicant.trim() || null,
        certificateStatus: input.certificateStatus.trim() || null,
        efficacyIngredients: input.efficacyIngredients.trim() || null,
        efficacyClaim: input.efficacyClaim.trim() || null,
        warningText: input.warningText.trim() || null,
        warningTextSimplified: input.warningTextSimplified.trim() || null,
        precautions: input.precautions.trim() || null,
      };
      return isNew ? createProduct(payload) : updateProduct(id, payload);
    },
    onSuccess: (saved) => {
      toast.success(isNew ? "已新增產品資料" : "已儲存變更");
      queryClient.invalidateQueries({ queryKey: ["admin", "products"], exact: false });
      if (isNew) {
        setLocation(`/products/${saved.id}`);
      } else {
        queryClient.setQueryData(["admin", "products", id], saved);
        setIsEditing(false);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "儲存失敗，請稍後再試");
    },
  });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("產品名稱不可為空");
      return;
    }
    if (!form.approvedUses.trim()) {
      toast.error("核准適應症／功能不可為空");
      return;
    }
    saveMutation.mutate(form);
  };

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isNew && (isError || !product)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
        <AlertTriangle className="w-12 h-12 text-destructive/80" />
        <p className="text-muted-foreground">找不到這筆產品資料。</p>
        <Link href="/products">
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
        <Link href="/products">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> 回列表
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              {!isNew && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    setForm(product ? toForm(product) : EMPTY_FORM);
                    setIsEditing(false);
                  }}
                >
                  <X className="w-4 h-4 mr-2" /> 取消
                </Button>
              )}
              <Button size="sm" disabled={saveMutation.isPending} onClick={handleSave}>
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {isNew ? "新增產品" : "儲存變更"}
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
                  if (!window.confirm("確定要刪除這筆產品資料嗎？此動作無法復原。")) return;
                  deleteMutation.mutate();
                }}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                刪除
              </Button>
            </>
          )}
        </div>
      </div>

      {!isNew && product && !isEditing && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>#{product.id}</span>
          <span>·</span>
          <span>更新於 {new Date(product.updatedAt).toLocaleString()}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>基本資料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">產品名稱</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 max-w-[280px]">
                <label className="text-sm font-medium">分類</label>
                <Select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as ProductCategory })
                  }
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">製造商</label>
                  <Input
                    value={form.manufacturer}
                    onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">核准字號</label>
                  <Input
                    value={form.registrationNumber}
                    onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">藥品代碼</label>
                  <Input
                    value={form.drugCode}
                    onChange={(e) => setForm({ ...form, drugCode: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">方名</label>
                  <Input
                    value={form.formulaName}
                    onChange={(e) => setForm({ ...form, formulaName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">劑型</label>
                  <Input
                    value={form.dosageForm}
                    onChange={(e) => setForm({ ...form, dosageForm: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">發證日期</label>
                  <Input
                    value={form.issuedDate}
                    onChange={(e) => setForm({ ...form, issuedDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">來源 ID</label>
                  <Input
                    value={form.sourceId}
                    onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">申請商</label>
                  <Input
                    value={form.applicant}
                    onChange={(e) => setForm({ ...form, applicant: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">證況</label>
                  <Input
                    value={form.certificateStatus}
                    onChange={(e) => setForm({ ...form, certificateStatus: e.target.value })}
                  />
                </div>
              </div>
            </>
          ) : (
            product && (
              <>
                <div>
                  <p className="text-2xl font-bold">{product.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {PRODUCT_CATEGORIES.find((c) => c.value === product.category)?.label}
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">製造商</p>
                    <p>{product.manufacturer || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">核准字號</p>
                    <p>{product.registrationNumber || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">藥品代碼</p>
                    <p>{product.drugCode || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">方名</p>
                    <p>{product.formulaName || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">劑型</p>
                    <p>{product.dosageForm || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">發證日期</p>
                    <p>{product.issuedDate || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">來源 ID</p>
                    <p>{product.sourceId || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">申請商</p>
                    <p>{product.applicant || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">證況</p>
                    <p>{product.certificateStatus || "—"}</p>
                  </div>
                </div>
              </>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>核准適應症／功能</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              placeholder="例如：緩解關節疼痛、促進鈣質吸收（請依實際核准內容填寫，這是用來比對廣告誇大程度的依據）"
              value={form.approvedUses}
              onChange={(e) => setForm({ ...form, approvedUses: e.target.value })}
              className="min-h-[100px]"
            />
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">{product?.approvedUses}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>保健功效宣稱</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">保健功效宣稱</label>
                <Textarea
                  placeholder="廠商實際宣傳的功效文案，與上方「核准適應症／功能」比對即可看出是否誇大"
                  value={form.efficacyClaim}
                  onChange={(e) => setForm({ ...form, efficacyClaim: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">保健功效相關成分</label>
                <Textarea
                  value={form.efficacyIngredients}
                  onChange={(e) => setForm({ ...form, efficacyIngredients: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground">保健功效宣稱</p>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {product?.efficacyClaim || "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">保健功效相關成分</p>
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {product?.efficacyIngredients || "—"}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>警語與注意事項</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">警語</label>
                <Textarea
                  value={form.warningText}
                  onChange={(e) => setForm({ ...form, warningText: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">警語簡化</label>
                <Textarea
                  value={form.warningTextSimplified}
                  onChange={(e) => setForm({ ...form, warningTextSimplified: e.target.value })}
                  className="min-h-[60px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">注意事項</label>
                <Textarea
                  value={form.precautions}
                  onChange={(e) => setForm({ ...form, precautions: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground">警語</p>
                <p className="whitespace-pre-wrap leading-relaxed">{product?.warningText || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">警語簡化</p>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {product?.warningTextSimplified || "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">注意事項</p>
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {product?.precautions || "—"}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>成分</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={form.ingredients}
              onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
              className="min-h-[80px]"
            />
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {product?.ingredients || "—"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>資料來源／備註</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">資料來源網址</label>
                <Input
                  placeholder="https://..."
                  value={form.sourceUrl}
                  onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">備註</label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
            </>
          ) : (
            <>
              {product?.sourceUrl && (
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline break-all"
                >
                  {product.sourceUrl}
                </a>
              )}
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground text-sm">
                {product?.notes || "—"}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
