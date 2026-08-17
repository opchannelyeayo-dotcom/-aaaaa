// One-off importer for the 衛福部國健署 nutrient reference-intake CSVs and the
// health-food aggregate-stat CSVs (see 藥品查詢 on the public homepage).
// Source files live outside the repo (a local folder the user maintains) —
// point NUTRIENT_DATA_DIR at wherever that folder is. Safe to re-run: it
// clears all four tables before re-inserting, so it's also how you pick up
// updated/added source files.
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import {
  db,
  pool,
  nutrientIntakeGuidelinesTable,
  healthFoodStatsTable,
  nutrientTermsTable,
  lifeStageNutrientsTable,
  type InsertNutrientIntakeGuideline,
  type InsertHealthFoodStat,
  type InsertNutrientTerm,
  type InsertLifeStageNutrient,
} from "@workspace/db";

const NUTRIENT_DATA_DIR =
  process.env.NUTRIENT_DATA_DIR ??
  "C:\\Users\\opcha\\Desktop\\ai辨別\\Script-Insight-Tool\\藥品";

const NUTRIENT_GUIDELINE_FILES: { file: string; nutrient: string }[] = [
  { file: "保健食品_蛋白質建議攝取量.csv", nutrient: "蛋白質" },
  { file: "保健食品_鈉建議攝取量.csv", nutrient: "鈉" },
  { file: "保健食品_鉀建議攝取量.csv", nutrient: "鉀" },
  { file: "保健食品_鎂建議攝取量.csv", nutrient: "鎂" },
  { file: "保健食品_鐵建議攝取量.csv", nutrient: "鐵" },
];

const KNOWN_GUIDELINE_COLUMNS = new Set([
  "資料分類",
  "生命期年齡層",
  "備註",
  "資料可信度",
  "資料來源",
  "AI檢索用文字",
  // Internal data-maintenance flag for whoever curates the source CSV (鉀/
  // 鎂/鐵), not information a site visitor can act on — same treatment as
  // 資料可信度 above.
  "需人工複核性別差異",
]);

// The source CSVs use a bare "-"/"－" to mean "official guideline doesn't
// define this figure for this row" (e.g. 鉀/鐵/蛋白質's per-kg-bodyweight
// column for life stages where only a converted absolute amount exists) —
// not an actual value. Surfacing it verbatim in the UI (e.g. "建議量_g_每
// 公斤體重_每日：-") reads as broken data, so treat it as absent.
const PLACEHOLDER_VALUES = new Set(["-", "－"]);

function readCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true, bom: true, trim: true });
}

function loadGuidelines(): InsertNutrientIntakeGuideline[] {
  const rows: InsertNutrientIntakeGuideline[] = [];

  for (const { file, nutrient } of NUTRIENT_GUIDELINE_FILES) {
    const filePath = path.join(NUTRIENT_DATA_DIR, file);
    const records = readCsv(filePath);

    for (const record of records) {
      // Columns beyond the shared set vary per nutrient (性別 for 蛋白質,
      // 建議攝取量類別 + 約當食鹽克數 + 原始文字 for 鈉, 需人工複核性別差異
      // for 鉀/鎂/鐵) — keep them verbatim rather than hard-coding each shape.
      const details: Record<string, string> = {};
      for (const [key, value] of Object.entries(record)) {
        if (!KNOWN_GUIDELINE_COLUMNS.has(key) && value && !PLACEHOLDER_VALUES.has(value.trim())) {
          details[key] = value;
        }
      }

      rows.push({
        nutrient,
        category: record["資料分類"],
        lifeStage: record["生命期年齡層"] || null,
        notes: record["備註"] || null,
        reliability: record["資料可信度"] || null,
        source: record["資料來源"] || null,
        searchText: record["AI檢索用文字"] || record["資料分類"],
        details,
      });
    }
  }

  return rows;
}

function loadStats(): InsertHealthFoodStat[] {
  const rows: InsertHealthFoodStat[] = [];

  const efficacyPath = path.join(NUTRIENT_DATA_DIR, "健康食品_功效分類統計.csv");
  for (const record of readCsv(efficacyPath)) {
    const label = record["功效"]?.trim();
    const count = Number(record["產品數"]);
    if (!label || !Number.isFinite(count)) continue; // a couple of source rows have a blank 功效 cell
    rows.push({ statType: "efficacy", label, count });
  }

  const manufacturerPath = path.join(NUTRIENT_DATA_DIR, "健康食品_廠商統計.csv");
  for (const record of readCsv(manufacturerPath)) {
    const label = record["廠商"]?.trim();
    const count = Number(record["產品數"]);
    if (!label || !Number.isFinite(count)) continue;
    rows.push({ statType: "manufacturer", label, count });
  }

  return rows;
}

function loadNutrientTerms(): InsertNutrientTerm[] {
  const filePath = path.join(NUTRIENT_DATA_DIR, "保健食品_名詞說明.csv");
  return readCsv(filePath).map((record) => ({
    category: record["資料分類"],
    abbreviation: record["縮寫"] || null,
    chineseName: record["中文全名"],
    englishName: record["英文全名"] || null,
    definition: record["定義"],
    notes: record["備註"] || null,
    reliability: record["資料可信度"] || null,
    source: record["資料來源"] || null,
    searchText: record["AI檢索用文字"] || record["中文全名"],
  }));
}

function loadLifeStageNutrients(): InsertLifeStageNutrient[] {
  const filePath = path.join(NUTRIENT_DATA_DIR, "保健食品_成人與孕哺期精華表.csv");
  return readCsv(filePath).map((record) => ({
    category: record["資料分類"],
    lifeStage: record["生命期年齡層"],
    gender: record["性別"],
    nutrient: record["營養素"],
    intakeType: record["攝取量類型"] || null,
    amount: record["建議攝取量數值"],
    unit: record["單位"],
    notes: record["備註"] || null,
    reliability: record["資料可信度"] || null,
    source: record["資料來源"] || null,
    searchText: record["AI檢索用文字"] || record["營養素"],
  }));
}

// Every filename this script currently knows how to parse. Anything else
// sitting in NUTRIENT_DATA_DIR is a file nobody's wired up a table/parser/UI
// section for yet — reported (not silently imported), since guessing at an
// unfamiliar health-data CSV's column meaning is worse than just flagging it
// for a human to look at.
const KNOWN_FILENAMES = new Set([
  ...NUTRIENT_GUIDELINE_FILES.map((f) => f.file),
  "健康食品_功效分類統計.csv",
  "健康食品_廠商統計.csv",
  "保健食品_名詞說明.csv",
  "保健食品_成人與孕哺期精華表.csv",
]);

function reportUnrecognizedFiles(): void {
  const entries = fs.readdirSync(NUTRIENT_DATA_DIR);
  const unrecognized = entries.filter(
    (name) => name.toLowerCase().endsWith(".csv") && !KNOWN_FILENAMES.has(name),
  );

  if (unrecognized.length > 0) {
    console.warn(
      `\n⚠ Found ${unrecognized.length} CSV file(s) in ${NUTRIENT_DATA_DIR} that this script doesn't ` +
        `know how to import yet (skipped):\n` +
        unrecognized.map((name) => `  - ${name}`).join("\n") +
        `\nAsk Claude to add support for these — it needs to see the columns before it can write a ` +
        `parser, table, and UI section for them.\n`,
    );
  }
}

async function main() {
  reportUnrecognizedFiles();

  const guidelines = loadGuidelines();
  const stats = loadStats();
  const terms = loadNutrientTerms();
  const lifeStageRows = loadLifeStageNutrients();

  await db.delete(nutrientIntakeGuidelinesTable);
  await db.delete(healthFoodStatsTable);
  await db.delete(nutrientTermsTable);
  await db.delete(lifeStageNutrientsTable);

  if (guidelines.length > 0) {
    await db.insert(nutrientIntakeGuidelinesTable).values(guidelines);
  }
  if (stats.length > 0) {
    await db.insert(healthFoodStatsTable).values(stats);
  }
  if (terms.length > 0) {
    await db.insert(nutrientTermsTable).values(terms);
  }
  if (lifeStageRows.length > 0) {
    await db.insert(lifeStageNutrientsTable).values(lifeStageRows);
  }

  console.log(
    `Seeded ${guidelines.length} nutrient guideline rows, ${stats.length} health-food stat rows, ` +
      `${terms.length} nutrient term rows, and ${lifeStageRows.length} life-stage nutrient rows.`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
