# GOAMAZING 購精彩 — 企業福利平台首頁

響應式（手機／平板／桌機）單頁網站，內建以 Gmail 寄出的諮詢表單。

## 檔案

| 路徑 | 說明 |
|---|---|
| `Amazing-Homepage.html` | **獨立網站版**。單一檔案、圖片已內嵌，可直接雙擊開啟或上傳任何主機 |
| `cyberbiz-內嵌圖片.html` | **CyberBiz 版（建議）**。可貼上的片段，圖片已內嵌，不必上傳圖片 |
| `cyberbiz-外連圖片.html` | CyberBiz 版，圖片改外連（約 97 KB），需先把 `src/assets/` 上傳到圖床 |
| `api/google-apps-script.gs` | 後端收信 API（選用），讓表單由伺服器直接寄出 |
| `src/index.src.html` | 原始 HTML（圖片以 `{{ASSET:檔名}}` 標記） |
| `src/styles.css` | 樣式表（行動優先，含完整斷點） |
| `src/app.js` | 互動邏輯（首屏動畫、卡片軌道、選單、Gmail 寄信） |
| `src/assets/` | 圖片素材（24 個） |
| `src/cyberbiz-overrides.css` | 只有嵌入 CyberBiz 才需要的樣式覆寫 |
| `src/cyberbiz-extra.js` | 只有嵌入 CyberBiz 才需要的補強腳本 |
| `src/build.py` | 打包器：產生 `Amazing-Homepage.html` |
| `src/build_cyberbiz.py` | 打包器：產生兩個 CyberBiz 片段 |
| `tests/` | Playwright 自動化測試 |

## 修改與重新打包

改 `src/` 底下的檔案，然後執行：

```bash
python3 src/build.py            # 獨立網站版
python3 src/build_cyberbiz.py   # CyberBiz 版（兩個檔案）
```

兩種版本共用同一份 `styles.css` 與 `app.js`，改一次兩邊都會更新。

## 響應式設計

行動優先，由小到大逐層加強：

| 斷點 | 目標裝置 | 主要變化 |
|---|---|---|
| base | 手機直式 | 單欄；按鈕整列；選單收成漢堡 |
| ≥ 520px | 大手機 | 表單欄位兩欄 |
| ≥ 600px | 手機橫式／小平板 | 按鈕並排；特色卡兩欄 |
| ≥ 900px | 平板 | 顯示完整導覽列；OMO 與數據三欄並排 |
| ≥ 1200px | 筆電／桌機 | 保證標語四欄；卡片加寬 |
| ≥ 1600px | 大桌機 | 版心維持 1560px 置中 |

尺寸之間全部用 `clamp()` 流動縮放，因此**兩個斷點中間的任何寬度也不會破版**；
轉向或改變視窗大小時由 `resize` / `orientationchange` 事件即時重算，不需重新整理。

### 針對 iOS 的處理
- 輸入框字級固定 16px —— 低於 16px 時 Safari 會在聚焦時自動放大整頁而破版
- 首屏高度用 `100svh`（fallback `100vh`），網址列伸縮時不會忽高忽低
- `viewport-fit=cover` + `env(safe-area-inset-*)`，瀏海與動態島機型不會遮住內容
- `-webkit-text-size-adjust:100%`，橫置時字級不被自動放大
- `-webkit-backdrop-filter`、`-webkit-overflow-scrolling` 等前綴齊備

### 針對 Windows／桌機的處理
- 隱藏卡片軌道的捲軸（`scrollbar-width` + `::-webkit-scrollbar`）
- 滑鼠可拖曳卡片軌道
- 只攔截「明確的橫向」滾輪手勢；垂直滾動一律讓頁面自己捲，
  觸控板或觸控筆電滑到卡片區不會卡住整頁

### 共通
- `overflow-x: clip` 攔截任何橫向溢出（用 `clip` 而非 `hidden`，才不會破壞 `position: sticky`）
- 所有可點擊元素至少 44×44px
- 錨點捲動預留導覽列高度（`scroll-margin-top`），標題不會被固定列蓋住
- 支援 `prefers-reduced-motion`，系統設定要求減少動態時關閉所有動畫

## 「送出諮詢」→ Gmail

按下 **以 Gmail 送出諮詢** 後，表單內容會組成信件並開啟 Gmail 撰寫視窗，
收件人固定為 `service@goamazing.com.tw`。

主旨：`企業福利方案諮詢｜{公司名稱}`

內文：

```
【企業福利方案諮詢】

公司名稱：…
聯絡人：…
電子郵件：…
聯絡電話：…
需求說明：
…

──────────────────
來源：GOAMAZING 購精彩 官網諮詢表單
填寫時間：YYYY/MM/DD HH:MM
```

### 跨平台方式

不做不可靠的瀏覽器偵測，一律開啟 Gmail 網頁版撰寫網址
（`https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=…&su=…&body=…`）：

- **Windows / macOS 桌機** — 新分頁開啟 Gmail 撰寫畫面
- **iOS / iPadOS** — `mail.google.com` 是 Gmail App 的 Universal Link，
  裝了 App 會直接跳進 App，沒裝則開 Gmail 行動網頁
- **Android** — 同上，由系統 App Links 接手

`window.open` 在使用者點擊的同一個事件內同步呼叫（否則 iOS Safari 會當成彈出視窗擋掉）；
若仍被封鎖則改用同頁跳轉，確保一定送得出去。

另備兩條退路，供沒有 Gmail 帳號的使用者：
- **改用預設郵件軟體** — `mailto:`，交給 Outlook／Apple Mail 等
- **複製信件內容** — 複製到剪貼簿，貼到任何信箱寄出

送出前會先驗證必填欄位與 email／電話格式，錯誤訊息為繁體中文並標記 `aria-invalid`。

> 註：這是「代開信件」而非伺服器寄信，使用者仍需在 Gmail 按下「傳送」。
> 若要改成不經使用者確認、直接由後端寄出，需要另外架設收件 API。

## 貼進 CyberBiz

用 `cyberbiz-內嵌圖片.html`（圖片已內嵌，不必另外上傳）。

1. CyberBiz 後台 →「網路商店」→「頁面管理」→ 新增或編輯頁面
2. 內容編輯器切到 **HTML／原始碼模式**（`<>` 按鈕）
3. 打開 `cyberbiz-內嵌圖片.html`，**整個檔案全選複製**，貼上後存檔
4. 預覽確認

### 這個版本和獨立版差在哪

嵌進店家版型會遇到獨立網頁不會有的問題，打包時已自動處理：

| 問題 | 處理方式 |
|---|---|
| 樣式外洩污染店家其他頁面 | 所有選擇器都限縮在 `#gx-root` 之下 |
| 店家佈景主題的樣式滲進來 | 所有 class／id 加上 `gx-` 前綴，佈景的 `.btn`／`.card` 等泛用類別碰不到我們 |
| 佈景用 `h2{…!important}` 這類**元素選擇器**硬蓋 | class 前綴擋不住這種寫法，因此片段內的宣告也都加上 `!important`；同為 `!important` 時比特異性，我們的選擇器都含 `#gx-root`，一定贏過裸元素 |
| 固定導覽列蓋住店家頁首 | 改成 `sticky` 並壓低 `z-index` |
| 內容被包在有 `max-width` 的容器裡 | 自動滿版跳出容器（寬度用 JS 量測，不含捲軸，不會多出橫向捲軸） |
| 外層容器有 `overflow` 導致 `sticky` 失效、首屏變全黑 | JS 會偵測並自動切換成靜態首屏 |
| 腳本被擋掉 | CSS 保底樣式讓首屏文字直接顯示 |
| 錨點捲動 | 改由 JS 處理，不去動店家的全域 `scroll-behavior` |

### 兩個常用調整

貼上後最外層是這一行，多數情況不用改：

```html
<div id="gx-root" class="gx-full" style="--gx-header-h:0px">
```

- **不要滿版**（想跟著店家容器寬度）→ 刪掉 `class="gx-full"`
- **店家頁首是固定的**（捲動時一直在最上面）→ 把 `--gx-header-h` 改成頁首高度，例如 `--gx-header-h:64px`，本頁導覽列就會停在它下面而不重疊

頁尾如果和店家頁尾重複，刪掉 HTML 裡 `<!-- 頁尾 -->` 那一段即可。

### 想改成外連圖片

`cyberbiz-外連圖片.html` 只有約 97 KB，適合 CMS 欄位有長度限制時使用：

1. 把 `src/assets/` 裡 24 個檔案上傳到 CyberBiz 檔案管理或任何圖床
2. 把檔案裡的 `https://請換成你的圖片網址/` 全部取代成你的網址前綴（結尾要有 `/`）

## 設定 API（選用）

**預設不需要 API** —— 按下送出會開啟 Gmail 撰寫視窗，使用者再按一次「傳送」。
如果希望**使用者按一次就寄出、不跳 Gmail**，就需要一個後端端點，因為純前端網頁無法自己寄信。

### 步驟

**1. 建立端點** —— 附了現成的 Google Apps Script（免費、免架伺服器、用你自己的 Google 帳號寄信）：

照著 `api/google-apps-script.gs` 檔頭的步驟做，重點是部署時要選

- 執行身分：**我**
- 具有存取權的使用者：**任何人** ← 沒選這個網頁會呼叫不到

部署完會拿到一段網址：`https://script.google.com/macros/s/AKfy…/exec`

**2. 填進網頁** —— 打開 `src/app.js`，最上方：

```js
var CONFIG = {
  recipient:   'service@goamazing.com.tw',
  apiEndpoint: ''      // ← 貼上剛才那段網址
};
```

**3. 重新打包並貼上**

```bash
python3 src/build.py            # 獨立網站版
python3 src/build_cyberbiz.py   # CyberBiz 版
```

填了 `apiEndpoint` 之後行為就變成：送出 → 顯示「傳送中…」→ 成功後清空表單並顯示感謝訊息。
**萬一後端故障，會自動退回開啟 Gmail**，使用者不會白填一次。

### 送出的資料長這樣

`POST`，`Content-Type: text/plain;charset=utf-8`，內容是 JSON 字串：

```json
{
  "to": "service@goamazing.com.tw",
  "subject": "企業福利方案諮詢｜購精彩股份有限公司",
  "body": "【企業福利方案諮詢】…（完整信件內文）",
  "source": "goamazing-homepage",
  "company": "購精彩股份有限公司", "公司名稱": "購精彩股份有限公司",
  "contact": "王小明",             "聯絡人":   "王小明",
  "email":   "ming@example.com",   "電子郵件": "ming@example.com",
  "phone":   "02-1234-5678",       "聯絡電話": "02-1234-5678",
  "message": "…",                  "需求說明": "…",
  "hp": ""
}
```

中英文欄位名都會送，後端用哪一種寫法都接得到。
回傳 `{"ok":true}` 視為成功，`{"ok":false,"error":"…"}` 視為失敗。

**為什麼是 `text/plain` 而不是 `application/json`？**
`application/json` 會觸發瀏覽器的 CORS 預檢（OPTIONS），而 Google Apps Script 無法回應預檢，請求會被擋掉。
`text/plain` 屬於「簡單請求」，不會預檢。若你改用自己的伺服器，記得回應 `Access-Control-Allow-Origin`。

**`hp` 是什麼？** 蜜罐欄位。真人看不到也 tab 不到，只有機器人會填；後端看到有值就直接丟棄，用來擋垃圾訊息。

### 不想寫程式的替代方案

- **Formspree／Basin** —— 註冊後拿到一個網址，直接填進 `apiEndpoint` 即可（免費額度約每月 50 封）
- **CyberBiz 內建的聯絡表單** —— 如果只要最基本的收件，可以直接用後台既有的表單功能，就不需要這個表單區塊

> 注意：`apiEndpoint` 是寫在前端的公開網址，任何人都可以呼叫。
> 附的 Apps Script 已內建蜜罐與必填驗證；若遇到大量濫用，再加上 reCAPTCHA 或速率限制。

## 其他調整

- 圖片重新編碼（照片轉 JPEG、去背圖維持 PNG）：4.9 MB → 475 KB，整頁 13 MB → 0.7 MB
- 字型改用 Google Fonts，並補上 `PingFang TC`／`Microsoft JhengHei` 等系統字型後備，
  離線或封鎖外部資源時仍以正確的中文字體顯示
- 修正原稿「適用企業福利場景」區塊中，5 張卡片標題重複出現、
  且 SVG 路徑外洩到內文的問題
