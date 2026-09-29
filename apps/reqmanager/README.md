# 需求管理平台（ReqManager）

依 **PRD v0.3** 與 **User Flow／Wireframe** 實作的企業內部客戶與需求管理平台：
客戶 → 需求 → 評估 → 開發 → 測試 → 業務驗收 → 結案，串成同一條可追溯紀錄。

- 線上展示（GitHub Pages，瀏覽器內建 API）：`https://hps2003.github.io/pp/reqmanager/`
- User Flow／Wireframe 拆解：[`docs/USER-FLOW.md`](docs/USER-FLOW.md)，App 內「說明與回饋」頁也可逐一點進各畫面
- 畫面截圖：[`docs/screenshots/`](docs/screenshots/)（由端對端測試自動產生）

## 交付文件（`docs/deliverables/`，皆為單一 HTML 檔，可直接開啟、寄送或列印）

| 檔案 | 內容 |
|---|---|
| `reqmanager-site.html` | 整個網站的單檔版本（JS／CSS 內嵌，離線可用，使用瀏覽器內建 API） |
| `wireframes.html` | 網頁框線圖：S01–S12 全部 12 張畫面，附編號註解與對應驗收條件 |
| `user-flows.html` | 使用者操作圖：UF-00 網站地圖與角色可見性、UF-01 生命週期泳道、狀態機、UF-02 五個角色操作流程、自動化更新時序 |

框線圖與操作圖也發布在網站上（`/reqmanager/deliverables/`，「說明與回饋」頁有連結）。
修改後執行 `npm run build:all` 重新產生網站、單檔 HTML 與交付文件；CI 會檢查三者與原始碼一致。

## 快速開始

```bash
cd apps/reqmanager
npm install
npm run dev          # 前端開發伺服器 http://localhost:5173（預設使用瀏覽器內建 API）
npm run server       # Node API 伺服器 http://localhost:8787（JSON 檔持久化，另開終端機）
```

登入頁按「使用公司帳號登入」，選擇示範帳號即可切換角色：

| 帳號 | 角色 | 看得到 |
|---|---|---|
| 王小明 | 業務 | 自己提交的需求、負責的客戶（大川、北辰、晨光） |
| 李淑芬 | 業務主管 | 全部客戶、報表、封存客戶 |
| 林雅婷 | PM | 評估、指派、結案、報表、系統整合 |
| 張家豪 | 工程 | 只看被指派的需求 |
| 陳志明 | QA | 待測試的需求 |
| 系統管理員 | Admin | 帳號與權限、系統狀態 |
| 吳國華 | 業務（已停用） | 用來驗證停用帳號無法登入 |

## 架構

```
src/domain/     ← 前後端共用：型別、PRD 規則（權限矩陣、狀態轉換、欄位檢核）、報表、REST API 路由
  api.ts          handle(backend, request) —— 一份程式碼同時給 Node 伺服器與瀏覽器使用
  rules.ts        角色 × 狀態 可執行的操作、資料範圍、遮罩
  automation.ts   時限提醒（PRD 7.3）+ 外部 API 同步（ERP 客戶主檔、HR 在職名單）
server/index.ts ← Node HTTP 伺服器（零相依），提供 /api/* 與建置後前端，允許跨來源
src/api/        ← 前端 API 用戶端（local／http 兩種傳輸）與自動更新（live.ts）
src/screens/    ← S01–S12 畫面
src/ui/         ← 共用元件、版面、路由、工作階段
```

### API 串接

前端透過 `src/api/client.ts` 呼叫 REST API，有兩種模式（在 **S12 系統狀態 → API 與自動更新** 切換）：

| 模式 | 用途 | 資料 |
|---|---|---|
| 瀏覽器內建 API（預設） | GitHub Pages 靜態展示、可用性測試 | 存於該瀏覽器 localStorage |
| 遠端 REST API | 多人共用、正式整合 | Node 伺服器的 JSON 檔，或任何實作相同合約的後端 |

建置時設定 `VITE_API_BASE=https://api.example.com` 即預設連線遠端。主要端點（完整清單見 S12）：

```
POST /api/auth/login                    GET  /api/workbench
GET  /api/requirements?tab&q&status&type&priority&owner&due&page
POST /api/requirements                  （Idempotency-Key 防重複）
GET|PATCH /api/requirements/:id         （PATCH 需帶 version，衝突回 409）
POST /api/requirements/:id/actions/:action   submit|accept|requestInfo|reject|startDev|submitTest|recordTest|uat|close|reopen|…
POST /api/requirements/:id/comments     GET /api/clients[/:id]   POST /api/clients/:id/interactions
GET  /api/reports?from&to&type&ownerId  GET|PUT /api/cashflow    GET|PUT /api/integrations
POST /api/integrations/:id/sync         POST /api/automation/run GET /api/changes
```

錯誤格式 `{ code, message, fields }`：422 欄位檢核、403 無權限（回應不含資料並寫入稽核）、409 版本衝突、401 未登入／帳號停用。

### 自動化更新

- **畫面自動更新**：每 N 秒（預設 10，可設 5／10／30／60／關閉）呼叫 `GET /api/changes` 比對資料版本 `rev`，
  有變更才重新抓取；視窗取得焦點時立即檢查；同一瀏覽器其他分頁寫入時透過 BroadcastChannel 即時更新；
  自己送出修改後立即更新。左下角顯示連線狀態與最後檢查時間。
- **時限提醒**（PRD 7.3）：待評估 3／5 工作天、待補件 7／30 天、承諾日前 2 工作天、逾期、待驗收 5 工作天、草稿 30 天，
  自動產生站內通知，同一規則每天最多一次。
- **外部 API 同步**：依設定頻率抓取 ERP 客戶主檔（依統編去重、更新名稱／產業，新客戶指派負責業務）
  與 HR 在職名單（離職即停用帳號）。示範資料在 `public/mock/`，可改成實際 Endpoint。
- 伺服器每分鐘執行排程；瀏覽器內建 API 模式由前端每 60 秒觸發。

### 手動編輯

客戶與聯絡人、互動紀錄、需求草稿與補件、驗收條件、承諾日期（需原因）、現金流試算表（直接編輯儲存格）、
帳號與角色、整合設定都可在畫面上編輯；Admin 另可在 S12 匯出完整 JSON、手動修改後再匯入，或重置示範資料。
所有寫入都帶版本號，避免覆蓋他人修改，並記錄於稽核紀錄。

## 測試與驗證

```bash
npm run check        # 型別檢查 + 單元測試（5）+ API 驗收測試（18，對應 PRD AC-01～AC-06）
npm run build        # 建置到 repo 根目錄 /reqmanager（GitHub Pages 發布）
npm run test:e2e     # 啟動伺服器，用 Chromium 以 7 個角色走完整流程（22 個情境），並輸出截圖
```

端對端測試涵蓋：停用帳號登入、角色工作台、表單就地錯誤與草稿自動儲存、提交產生編號、
另一位使用者畫面自動出現新需求、篩選保留在網址、PM 接受與開始開發（尚缺項目）、工程越權顯示無權限、
QA 失敗退回與前次紀錄保留、UAT、結案三項檢查、同時修改衝突、客戶統編重複／名稱相似、
現金流手動編輯後他人畫面自動更新、報表下鑽、ERP 同步、停用帳號後既有登入立即失效、說明頁、
瀏覽器內建 API 跨分頁同步。

## 部署

`npm run build` 輸出到 repo 根目錄的 `reqmanager/`（相對路徑），現有的 GitHub Pages workflow 會原樣發布；
CI（`.github/workflows/reqmanager-ci.yml`）會檢查已提交的建置結果與原始碼一致。
正式環境請以 `npm run server`（或容器）部署 API，並把資料檔路徑 `DATA_FILE` 放在有備份的磁碟。

## 尚待確認（PRD 第 15 章）

企業 SSO（D-02）目前以帳號選擇模擬；通知管道（D-07）目前為站內通知，Email 設定僅保存參數；
正式資料庫與既有資料欄位（D-01）確認後，可將 `server/index.ts` 的 JSON 檔存取替換為資料庫，API 合約不變。
