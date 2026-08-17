# 話術透視鏡 (Ad Rhetoric X-Ray)

線上小工具，讓使用者貼上廣告文案或上傳截圖，AI 即時標註心理操控話術，並給出可信度分數與中性改寫版本。

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — 啟動 API server（port 8080）
- `pnpm --filter @workspace/rhetoric-xray run dev` — 啟動前端（port 由環境注入）
- `pnpm --filter @workspace/admin-console run dev` — 啟動後台管理（port 由環境注入）
- `pnpm run typecheck` — 全套 typecheck
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — 從 OpenAPI spec 重新產生 hooks + Zod schemas（僅 rhetoric-xray 使用此管線；admin-console 走手寫 fetch client，見下方「後台管理」）
- `pnpm --filter @workspace/db run push` — 推送 DB schema 變更（dev only）

必需環境變數：
- `DATABASE_URL` — Postgres 連線字串（Replit 自動注入）
- `OPENAI_API_KEY` — OpenAI API 金鑰（使用者提供）
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — 後台管理登入帳密（使用者提供，Replit 上需自行加到 Deployment Secrets，不會自動注入）
- `ADMIN_SESSION_SECRET` — 後台登入 session cookie 簽章密鑰（建議設定固定值，否則每次重啟/重新部署都會強制登出所有人）

### 本地端執行（非 Replit）

在 Replit 上，`PORT`、`BASE_PATH`、`DATABASE_URL` 等環境變數都由平台自動注入；
拉到本機直接跑會因為這些變數不存在而在啟動瞬間丟出例外（`api-server` 的
`src/index.ts`、`lib/db/src/index.ts`、`rhetoric-xray` 的 `vite.config.ts`
都有明確的必填檢查），整個網站因此打不開。

本機執行步驟：

1. `cp .env.example .env`，填入 `DATABASE_URL`（本機或雲端 Postgres 皆可）、
   `OPENAI_API_KEY`，若要跑後台管理另填 `ADMIN_USERNAME` / `ADMIN_PASSWORD`
   / `ADMIN_SESSION_SECRET`
2. `pnpm install`
3. `pnpm --filter @workspace/db run push`（推送 DB schema）
4. 開一個終端機：`pnpm --filter @workspace/api-server run dev`（port 8080）
5. 另開一個終端機：`pnpm --filter @workspace/rhetoric-xray run dev`（port 21905）
6. 若要跑後台管理，再開一個終端機：`pnpm --filter @workspace/admin-console run dev`（port 21906）
7. 瀏覽器開 http://localhost:21905（主站）或 http://localhost:21906（後台）

`PORT`／`BASE_PATH` 在本機未設定時會自動 fallback 成與
`.replit-artifact/artifact.toml` 相同的預設值（api-server: 8080；前端:
21905 / `/`；後台: 21906 / `/admin/`），不需要另外設定。前端的 `/api/*` 請求
在本機會透過 Vite dev server 的 proxy 轉發到 `http://localhost:8080`（見
`vite.config.ts`），對應 Replit 上路徑路由器的行為。

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS, TanStack Query, Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (v4), drizzle-zod
- AI: OpenAI gpt-4o（話術分析）+ gpt-4o-mini（OCR）
- API codegen: Orval（從 OpenAPI spec）
- Build: esbuild (CJS bundle)

## 專案檔案結構

```
├── artifacts/
│   ├── api-server/           # Express 後端
│   │   └── src/routes/
│   │       ├── rhetoric/     # POST /api/ocr + POST /api/analyze
│   │       ├── records/      # GET /api/records, /records/stats, /records/:id（公開，供 /history 使用）
│   │       └── admin/        # /api/admin/*（帳密保護，供後台管理使用）
│   ├── rhetoric-xray/        # React 前端（公開網站）
│   │   └── src/
│   │       ├── pages/        # Home / Result / History 頁面
│   │       └── components/   # 標註顯示、可信度儀表等元件
│   └── admin-console/        # React 後台管理（帳密保護，獨立部署路徑 /admin）
│       └── src/
│           ├── pages/        # Login / Dashboard / Records / RecordDetail
│           └── lib/          # 手寫 fetch client（不走 orval codegen）+ auth context
├── lib/
│   ├── api-spec/openapi.yaml # API 合約（單一真實來源）
│   ├── api-client-react/     # 產生的 React Query hooks
│   ├── api-zod/              # 產生的 Zod schemas（後端驗證用）
│   └── db/src/schema/
│       └── analysis-records.ts  # 分析紀錄資料表 schema
```

## 功能（MVP 必做）

1. ✅ 文字輸入：貼上廣告文案
2. ✅ 截圖上傳 + OCR：上傳圖片 → OpenAI vision 辨識文字 → 使用者確認
3. ✅ AI 話術分析：gpt-4o 標註六大話術類型
4. ✅ 可信度分數視覺化儀表
5. ✅ 中性改寫版
6. ✅ 原文顏色標籤標註（六種話術各有專屬顏色）
7. ✅ 資料庫留存 + 查詢頁（/history）
8. ✅ 後端中介層（避免 API key 暴露）

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /api/ocr | 圖片 OCR 文字辨識 |
| POST | /api/analyze | AI 話術分析 + 存入 DB |
| GET  | /api/records | 列出所有分析紀錄（公開，供 /history 使用）|
| GET  | /api/records/stats | 統計摘要（總數、平均分、話術分類統計）|
| GET  | /api/records/:id | 單筆分析紀錄詳情 |

### 後台管理 API（帳密保護）

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /api/admin/login | 登入，成功後核發簽章 session cookie |
| POST | /api/admin/logout | 登出，清除 session cookie |
| GET  | /api/admin/session | 檢查目前 session 是否仍有效 |
| GET  | /api/admin/records | 分析紀錄列表：支援 `q`（原文關鍵字搜尋）、`inputType`、`category`、`sort`、`page`、`pageSize` |
| GET  | /api/admin/records/stats | 儀表板統計：總筆數、平均信任度、話術分類分佈、每日評分趨勢 |
| GET  | /api/admin/records/export | CSV 匯出（套用與列表相同的篩選條件）|
| GET  | /api/admin/records/:id | 單筆分析紀錄完整內容 |
| PATCH | /api/admin/records/:id | 編輯單筆紀錄（原文／信任度分數／中性改寫版／話術標註，欄位皆為選填，只更新有帶的欄位）|
| DELETE | /api/admin/records/:id | 刪除單筆分析紀錄 |

## 話術分類系統（六大類型）

恐懼訴求 / 假稀缺 / 社會認同操控 / 權威借位 / 情緒勒索 / 誇大療效

## Architecture decisions

- OCR 與分析分開為兩個端點，讓使用者在 OCR 後可確認與修改文字再送分析
- `GET /records/stats` 路由註冊在 `GET /records/:id` 之前，防止 Express 把 "stats" 當 id 解析（`/admin/records/export` 同理，註冊在 `/admin/records/:id` 之前）
- 資料庫 annotations 欄位使用 jsonb 儲存，不另建 annotation table（符合「無帳號、無複雜關聯」的設計）
- body size limit 調整為 20mb 以容納 base64 圖片上傳
- 後台管理（admin-console）是獨立於主站的 artifact，走自己的 `/admin` 路徑與 port，登入用簽章 cookie（`lib/admin-auth.ts`），不引入 express-session/jsonwebtoken 等新依賴
- 後台的 `category` 篩選是在記憶體中過濾（annotations 存在 jsonb 陣列裡，不是獨立欄位），與 `/records/stats` 既有的「整表撈出來在 JS 聚合」風格一致；量小時無感，量大後可考慮 jsonb containment 查詢
- admin-console 的 API 呼叫是手寫的 fetch client（`src/lib/api.ts`），未走 `lib/api-spec` 的 orval codegen 管線——後台是獨立、認證方式不同的小型介面，沒有必要共用公開站的 OpenAPI 合約

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- 執行 codegen 後記得重新跑 typecheck，Orval 產生的 zod.int() 在 zod v3 不存在，OpenAPI spec 中所有 integer 欄位需改用 number 型別
