import { useMemo } from "react";
import {
  useListNutrientGuidelines,
  useListHealthFoodStats,
  useListNutrientTerms,
  useListLifeStageNutrients,
  type NutrientGuideline,
  type LifeStageNutrient,
} from "@workspace/api-client-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

// Fixed display order — the source CSVs are seeded in this order too (see
// scripts/src/seed-nutrient-data.ts), but the API doesn't guarantee it.
const NUTRIENT_ORDER = ["蛋白質", "鈉", "鉀", "鎂", "鐵"];

function GuidelineRow({ row }: { row: NutrientGuideline }) {
  const details = Object.entries(row.details);
  return (
    <div className="border rounded-md p-3 space-y-1.5 bg-muted/20">
      <p className="font-medium text-sm">{row.lifeStage ?? row.category}</p>
      {details.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {details.map(([key, value]) => (
            <span key={key}>
              <span className="text-foreground/70">{key}：</span>
              {value}
            </span>
          ))}
        </div>
      )}
      {row.notes && <p className="text-xs text-muted-foreground">備註：{row.notes}</p>}
    </div>
  );
}

function NutrientSection({ nutrient, rows }: { nutrient: string; rows: NutrientGuideline[] }) {
  const source = rows[0]?.source;
  return (
    <AccordionItem value={`nutrient-${nutrient}`}>
      <AccordionTrigger>{nutrient}建議攝取量</AccordionTrigger>
      <AccordionContent>
        <div className="space-y-2">
          {rows.map((row) => (
            <GuidelineRow key={row.id} row={row} />
          ))}
          {source && <p className="text-xs text-muted-foreground pt-1">資料來源：{source}</p>}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function StatsSection({
  value,
  title,
  type,
}: {
  value: string;
  title: string;
  type: "efficacy" | "manufacturer";
}) {
  const { data, isLoading } = useListHealthFoodStats({ type });

  return (
    <AccordionItem value={value}>
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
            {(data ?? []).map((stat) => (
              <div
                key={stat.id}
                className="flex items-center justify-between gap-3 text-sm py-1.5 border-b last:border-0"
              >
                <span className="text-foreground/90">{stat.label || "（未分類）"}</span>
                <Badge variant="outline" className="shrink-0">
                  {stat.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function TermsSection() {
  const { data, isLoading } = useListNutrientTerms();

  return (
    <AccordionItem value="terms">
      <AccordionTrigger>保健品名詞說明</AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {(data ?? []).map((term) => (
              <div key={term.id} className="border rounded-md p-3 space-y-1 bg-muted/20">
                <p className="font-medium text-sm">
                  {term.abbreviation && `${term.abbreviation}｜`}
                  {term.chineseName}
                  {term.englishName && (
                    <span className="text-muted-foreground font-normal"> ({term.englishName})</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">{term.definition}</p>
                {term.notes && (
                  <p className="text-xs text-muted-foreground">補充：{term.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function LifeStageGenderGroup({ gender, rows }: { gender: string; rows: LifeStageNutrient[] }) {
  const note = rows.find((r) => r.notes)?.notes;
  return (
    <div className="border rounded-md p-3 bg-muted/20 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{gender}</p>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
          <span>
            {r.nutrient}
            {r.intakeType && <span className="text-muted-foreground">（{r.intakeType}）</span>}
          </span>
          <span className="text-muted-foreground shrink-0">
            {r.amount} {r.unit}
          </span>
        </div>
      ))}
      {note && <p className="text-xs text-muted-foreground pt-1 border-t mt-1.5">{note}</p>}
    </div>
  );
}

function LifeStageSection() {
  const { data, isLoading } = useListLifeStageNutrients();

  const byStage = useMemo(() => {
    const map = new Map<string, Map<string, LifeStageNutrient[]>>();
    for (const row of data ?? []) {
      const genders = map.get(row.lifeStage) ?? new Map<string, LifeStageNutrient[]>();
      const rows = genders.get(row.gender) ?? [];
      rows.push(row);
      genders.set(row.gender, rows);
      map.set(row.lifeStage, genders);
    }
    return map;
  }, [data]);

  return (
    <AccordionItem value="life-stage">
      <AccordionTrigger>成人與孕哺期精華表</AccordionTrigger>
      <AccordionContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(byStage.entries()).map(([stage, genders]) => (
              <div key={stage} className="space-y-2">
                <p className="font-medium text-sm">{stage}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {Array.from(genders.entries()).map(([gender, rows]) => (
                    <LifeStageGenderGroup key={gender} gender={gender} rows={rows} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function NutrientReference() {
  const { data: guidelines, isLoading } = useListNutrientGuidelines();

  const byNutrient = useMemo(() => {
    const map = new Map<string, NutrientGuideline[]>();
    for (const row of guidelines ?? []) {
      const list = map.get(row.nutrient) ?? [];
      list.push(row);
      map.set(row.nutrient, list);
    }
    return map;
  }, [guidelines]);

  return (
    <div className="max-w-3xl mx-auto mt-12">
      <h2 className="text-xl font-serif font-bold text-foreground mb-1">保健營養資訊</h2>
      <p className="text-sm text-muted-foreground mb-4">
        衛福部國健署膳食營養素參考攝取量，以及核准健康食品的統計資料，作為判斷廣告宣稱是否合理的參考依據。
      </p>
      <div className="border rounded-lg bg-card px-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <Accordion type="multiple">
            <TermsSection />
            <LifeStageSection />
            {NUTRIENT_ORDER.map((nutrient) => {
              const rows = byNutrient.get(nutrient);
              if (!rows || rows.length === 0) return null;
              return <NutrientSection key={nutrient} nutrient={nutrient} rows={rows} />;
            })}
            <StatsSection value="stats-efficacy" title="功效分類統計" type="efficacy" />
            <StatsSection value="stats-manufacturer" title="廠商統計" type="manufacturer" />
          </Accordion>
        )}
      </div>
    </div>
  );
}
