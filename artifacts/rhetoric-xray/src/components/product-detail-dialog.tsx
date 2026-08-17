import type { PublicProduct } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, ShieldQuestion } from "lucide-react";

// Mirrors artifacts/admin-console/src/pages/products.tsx's category labels —
// same reference product database, so the wording stays consistent across
// both apps.
const CATEGORY_LABEL: Record<string, string> = {
  drug: "藥品",
  health_food: "健康食品／保健品",
  other: "其他"
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export function ProductDetailDialog({
  product,
  onClose,
  onAnalyze,
  analyzing
}: {
  product: PublicProduct | null;
  onClose: () => void;
  // Consumer-mode only (藥品查詢 itself only exists in consumer mode) — lets
  // the reader run this product's own official claims through the same
  // consumer risk-judgment pipeline as pasted ad copy, per spec D.
  onAnalyze: (product: PublicProduct) => void;
  analyzing: boolean;
}) {
  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {product && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap pr-6">
                <DialogTitle>{product.name}</DialogTitle>
                <Badge variant="outline">{CATEGORY_LABEL[product.category] ?? product.category}</Badge>
              </div>
              <DialogDescription>核准藥品／保健品資料庫詳細內容</DialogDescription>
            </DialogHeader>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="製造商" value={product.manufacturer} />
              <Field label="申請商" value={product.applicant} />
              <Field label="核准字號" value={product.registrationNumber} />
              <Field label="證況" value={product.certificateStatus} />
              <Field label="藥品代碼" value={product.drugCode} />
              <Field label="方名" value={product.formulaName} />
              <Field label="劑型" value={product.dosageForm} />
              <Field label="發證日期" value={product.issuedDate} />
              <Field label="來源 ID" value={product.sourceId} />
            </div>

            <div className="space-y-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium mb-1">核准適應症／功能</p>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {product.approvedUses}
                </p>
              </div>
              {product.efficacyClaim && (
                <div>
                  <p className="text-sm font-medium mb-1">保健功效宣稱</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {product.efficacyClaim}
                  </p>
                </div>
              )}
              {product.efficacyIngredients && (
                <div>
                  <p className="text-sm font-medium mb-1">保健功效相關成分</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {product.efficacyIngredients}
                  </p>
                </div>
              )}
              {product.ingredients && (
                <div>
                  <p className="text-sm font-medium mb-1">成分</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {product.ingredients}
                  </p>
                </div>
              )}
            </div>

            {(product.warningText || product.warningTextSimplified || product.precautions) && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                  <p className="text-sm font-medium">警語與注意事項</p>
                </div>
                {product.warningTextSimplified && (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {product.warningTextSimplified}
                  </p>
                )}
                {product.warningText && (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {product.warningText}
                  </p>
                )}
                {product.precautions && (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {product.precautions}
                  </p>
                )}
              </div>
            )}

            {product.sourceUrl && (
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline break-all"
              >
                {product.sourceUrl}
              </a>
            )}

            <Button
              className="w-full"
              onClick={() => onAnalyze(product)}
              disabled={analyzing}
            >
              {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldQuestion className="w-4 h-4 mr-2" />}
              以消費者角度分析此產品宣稱的風險
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
