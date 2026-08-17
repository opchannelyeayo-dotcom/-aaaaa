# 話術透視鏡 — Code Review 報告

審查範圍：`artifacts/api-server`（Express 後端）、`artifacts/rhetoric-xray`（React 前端，正式上線頁面）、`lib/*`（共用套件、DB schema、API 規格）。`artifacts/mockup-sandbox` 為 Replit 內建設計預覽工具（`/__mockup`，非正式上線路徑），僅列入「多餘程式碼」章節參考。

比對基準：`話術透視鏡_開發文件.md`。

## 總評

架構、API 端點、資料庫欄位、頁面流程與開發文件高度一致：8 項必做功能都有對應實作、`/records/stats` 確實註冊在 `/records/:id` 之前（如 `replit.md` 所述）、OCR 與分析確實拆成兩個端點讓使用者能先確認文字。**沒有發現重大架構性偏離**。主要問題集中在：LLM／外部 API 呼叫缺乏容錯與逾時保護、公開端點沒有濫用防護、以及行動裝置版面在窄螢幕下的細節斷版。以下逐項列出，「狀態」欄標示本次是否已直接修正。

---

## 缺失清單

| 檔案 | 問題 | 嚴重度 | 建議修法 | 狀態 |
|---|---|---|---|---|
| `artifacts/rhetoric-xray/index.html` | `viewport` 設定 `maximum-scale=1`，鎖死手機瀏覽器的雙指縮放。開發文件情境一、二明確以「長輩」「中高齡族群」為核心受眾，鎖死縮放直接牴觸此目標 | 高 | 移除或放寬 `maximum-scale`，改用 `maximum-scale=5.0` 並保留 `initial-scale=1.0` | ✅ 已修正 |
| `artifacts/api-server/src/app.ts` | 完全沒有 Express 錯誤處理 middleware。OpenAI 呼叫失敗、body 超過 20MB、JSON 格式錯誤等，都會落到 Express 預設錯誤頁（回傳 HTML，非 JSON），前端 `customFetch` 雖能容錯解析但使用者只會看到籠統錯誤，開發環境甚至可能外洩 stack trace | 高 | 加上 4 參數的全域錯誤處理 middleware，統一回傳 JSON 錯誤訊息 | ✅ 已修正 |
| `artifacts/api-server/src/routes/rhetoric/index.ts` — `/ocr`、`/analyze` | 呼叫 `openai.chat.completions.create()` 沒有設定 `timeout`，預設可能掛住很久。使用者只會看到「正在辨識圖片文字...」或分析中的轉圈動畫，卻永遠沒有結果也沒有錯誤提示，等同「沒反應的流程」 | 高 | OpenAI client 加上 `timeout` 與 `maxRetries`，逾時後自然拋錯並交給全域錯誤處理回傳 JSON | ✅ 已修正（`timeout: 60_000`, `maxRetries: 2`） |
| 同上 | `/ocr`、`/analyze` 完全沒有速率限制。由於文件明訂「不需登入」，這兩個端點等於公開給任何人呼叫付費的 OpenAI API，惡意或誤觸的迴圈呼叫會直接造成帳單失控 | 高 | 加上以 IP 為 key 的簡易限流（本次採用純記憶體版本，避免引入新依賴） | ✅ 已修正（10 分鐘內每 IP 上限 30 次） |
| 同上 | `textContent`、`imageBase64` 沒有長度／大小上限驗證，只受限於 Express 20MB 的 body 上限，超長輸入會被送進 LLM，直接墊高 token 成本與延遲 | 中 | 後端加上長度檢查（文字 6000 字、圖片 base64 約 8MB），提前以 400 拒絕 | ✅ 已修正 |
| 同上 — `/analyze` | `credibilityScore` 直接信任 LLM 回傳值，若 LLM 回傳非數字或 `NaN`，`Math.min/Math.max` 運算結果仍是 `NaN`。此時**資料已寫入資料庫**，才在最後 `AnalyzeRhetoricResponse.parse()` 因型別不符而丟例外，造成資料庫留下分析結果不完整的「孤兒紀錄」，且該筆紀錄之後在信任度儀表板會顯示異常（空白圓弧、無錯誤訊息） | 中 | 寫入資料庫前先以 `Number.isFinite` 防呆，非法值 fallback 為 50 | ✅ 已修正 |
| 同上 — `/analyze` | `annotations` 過濾邏輯只檢查 `category` 是否落在六大分類，未驗證 `textSpan` 是否真的能在原文中逐字找到。前端 `HighlightedText` 是用「在原文中搜尋 textSpan」的方式疊加顏色標籤，若 LLM 略為改寫措辭，該標註會**在「話術拆解清單」出現、卻在原文中完全沒有顏色標記**，破壞開發文件必做功能 #6「原文顏色標籤標註（疊加顯示）」的一致性，且沒有任何錯誤提示 | 中 | 過濾時加上 `textContent.includes(a.textSpan)`，確保保留的標註一定能在原文中命中 | ✅ 已修正 |
| 同上 — `/ocr` | 未檢查 `imageBase64` 是否為空字串、`mimeType` 是否為圖片類型，任何字串都會被組成 data URL 直接送給 OpenAI vision API | 低 | 加上空值與 `mimeType.startsWith("image/")` 檢查 | ✅ 已修正 |
| `artifacts/rhetoric-xray/src/pages/home.tsx` | OCR 成功回呼（`onSuccess`）沒有檢查 `ocrText` 是否為空字串，圖片辨識不到任何文字時仍會顯示「文字萃取成功，請確認或修改內容」的成功提示，使用者會誤以為系統正常運作，直接違反驗收標準 #2「系統能正確辨識出圖片中的文字並顯示供確認」 | 高 | 空結果時改為錯誤提示，請使用者換一張更清楚的截圖 | ✅ 已修正 |
| 同上 | 檔案上傳僅靠 `<input accept="image/*">` 過濾（可被繞過），且沒有檔案大小限制，大檔案會直接讀成 base64 送到後端才被 20MB 限制擋下，使用者要等完整讀檔＋上傳才會看到錯誤 | 中 | 前端加上 `file.type` 與 8MB 大小的即時檢查 | ✅ 已修正 |
| 同上 | 文字輸入框沒有長度提示，使用者貼上超長文字才在送出後被後端拒絕，體驗生硬 | 低 | 加上即時字數計數器（6000 字上限）與送出前檢查 | ✅ 已修正 |
| 同上 | `mode`（UI 分頁狀態）與 `inputType`（實際送出的來源類型）兩個 state 用途相近，略增可讀性負擔 | 低（程式碼品質） | 可考慮合併或用 `useReducer` 管理，非必要 | 建議，未修改 |
| `artifacts/rhetoric-xray/src/pages/result.tsx` | 手機（`<lg`，約 1024px 以下）版面沿用 DOM 順序顯示，可信度評分卡排在「原文分析」「話術拆解清單」「中性重寫版」**之後**，使用者要滑到頁面最下方才看得到分數，對主打快速判讀的中高齡受眾不友善 | 中 | 加上 `order-first lg:order-last` / `order-last lg:order-first`，手機版讓評分卡優先顯示 | ✅ 已修正 |
| `artifacts/rhetoric-xray/src/pages/history.tsx` | 紀錄卡片在窄螢幕（約 <375px）用水平 `flex items-center justify-between` 排列，右側信任度分數區塊與左側標籤/摘要文字互相擠壓 | 中 | 改為 `flex-col sm:flex-row`，窄螢幕直式堆疊、加上分隔線 | ✅ 已修正 |
| 同上 | 頂部統計卡片在手機上 padding／字級與桌機相同，略顯擁擠 | 低 | 加上 `sm:` 響應式 padding／字級 | ✅ 已修正 |
| `artifacts/api-server/src/app.ts` | `cors()` 未帶任何參數，等同開放任意來源呼叫 API。由於本專案無登入機制，直接風險有限，但任何第三方網站都能嵌入呼叫、消耗 OpenAI 額度 | 低～中 | 正式環境建議改為白名單限制前端網域來源 | 建議，未修改（需要知道正式部署網域才能設定，暫不變更避免誤鎖自家前端） |
| `artifacts/api-server/src/routes/records/index.ts` | `GET /records`、`GET /records/stats` 沒有分頁，每次都撈整張表進記憶體排序／統計 | 低 | 文件已明訂「以可穩定跑通測試為門檻，非企業級高併發」，目前規模可接受；未來紀錄量成長後建議加 `limit/offset` | 建議，未修改（規格內可接受） |
| `lib/db/src/schema/analysis-records.ts` | `created_at` 無索引，`GET /records` 依此欄位排序 | 低 | 同上，量小時無感，未來可加 index | 建議，未修改 |
| `lib/api-spec/openapi.yaml` / `lib/api-zod/src/generated/*` | `textContent`、`imageBase64` 未定義 `maxLength`，本次新增的長度限制只加在後端手寫邏輯，OpenAPI 規格文件與實際行為出現落差（因為 generated 檔案標註「Do not edit manually」，本次未直接改動以免與下次 `orval codegen` 衝突） | 低 | 下次跑 `pnpm --filter @workspace/api-spec run codegen` 前，先把 `maxLength` 補進 `openapi.yaml` | 建議，未修改 |
| `artifacts/mockup-sandbox/**` | 與 `artifacts/rhetoric-xray/src/components/ui` 幾乎完整重複約 40 個 shadcn UI 元件檔，另有獨立 `App.tsx`／`vite.config.ts`。這是 Replit 設計預覽工具（`/__mockup`，僅 development 服務，無 production 設定），不進入正式建置流程，但造成 repo 內大量重複程式碼 | 低 | 屬 Replit 工具鏈產物，建議保留（刪除可能影響 Replit 內建設計畫布），僅記錄供知悉 | 建議，未刪除 |
| `attached_assets/話術透視鏡_開發文件__1785829447429.md` | 與外部上傳的開發文件內容完全相同的重複檔案 | 低 | 可保留一份即可，非必要重複 | 建議，未刪除 |
| `artifacts/rhetoric-xray/src/components/ui/*.tsx` | 55 個 shadcn 元件檔中，實際被 `pages/`／`components/` 引用的只有約 14 個，其餘約 40 個未被任何程式碼匯入（Vite 建置時會被排除在 bundle 外，不影響上線效能，純粹是 repo 維護負擔） | 低 | 可視需要清理未使用元件，非急迫 | 建議，未刪除 |
| `artifacts/rhetoric-xray/src/index.css` | 定義了完整的 `.dark` 深色主題變數，但整個前端沒有任何切換 `dark` class 的邏輯，屬死程式碼 | 低 | 若無 dark mode 規劃可移除，或之後串接 `prefers-color-scheme` | 建議，未修改 |
| `scripts/src/hello.ts` | pnpm workspace 樣板留下的 `console.log("Hello from @workspace/scripts")` 範例腳本，未被任何流程呼叫 | 低 | 可刪除 | 建議，未刪除 |

---

## 與開發文件比對結論

- API 端點（`/healthz /ocr /analyze /records /records/stats /records/:id`）、六大話術分類、資料庫欄位、頁面流程（首頁 → 分析結果頁 → 歷史查詢頁）**皆與文件一致**，無帳號系統、無多語言、無其他品類分析等「刻意不做」項目也都確認沒有誤做。
- 「效能與擴充性以可穩定跑通測試為門檻」——`GET /records` 無分頁、無 DB index，在文件明訂的小規模測試範圍內可接受，僅列為未來擴充建議，非本階段缺失。
- 主要落差在「中高齡族群」這個明確受眾設定與 `maximum-scale=1` 鎖死縮放的衝突，以及若干「靜默失敗」流程（OCR 空結果誤報成功、標註與原文不一致）與驗收標準的字面要求有出入，本次已一併修正。

---

## 已完成的行動項目

1. **手機版最佳化**：viewport 允許縮放並加入手機 Web App meta 標籤；`history.tsx`、`result.tsx`、`home.tsx` 針對窄螢幕（<640px）調整排版順序、間距與觸控區塊，直接覆蓋原檔案。
2. **後端容錯與防護**：新增全域錯誤處理 middleware（統一回傳 JSON）、OpenAI 呼叫逾時保護、簡易 IP 限流、輸入長度驗證、`credibilityScore` NaN 防呆、`textSpan` 命中驗證。
3. **前端一致性修正**：OCR 空結果不再誤報成功、圖片上傳加入型別與大小前置驗證、文字輸入加上即時字數提示。

## 尚未處理（建議事項，風險較低或需額外決策）

- CORS 白名單化（需先確認正式部署網域）
- `/records` 分頁與 DB index（目前規模下無感）
- `openapi.yaml` 補上 `maxLength` 並重跑 codegen
- 清理 `mockup-sandbox` 重複元件、未使用的 shadcn 元件、`.dark` 死程式碼、`scripts/hello.ts`

## 驗證建議

本次修改為手動編輯 TypeScript／TSX 原始碼，未在此環境執行 `pnpm install` / `pnpm run build`（受限於沙盒無法安裝完整 workspace 依賴）。建議部署前於 Replit 執行：

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

確認型別與建置皆無誤後再上線。
