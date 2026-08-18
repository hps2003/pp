# GOAMAZING 購精彩 — 企業福利平台首頁

響應式（手機／平板／桌機）單頁網站，內建以 Gmail 寄出的諮詢表單。

## 檔案

| 路徑 | 說明 |
|---|---|
| `Amazing-Homepage.html` | **成品**。單一檔案、圖片已內嵌，可直接雙擊開啟或上傳任何主機 |
| `src/index.src.html` | 原始 HTML（圖片以 `{{ASSET:檔名}}` 標記） |
| `src/styles.css` | 樣式表（行動優先，含完整斷點） |
| `src/app.js` | 互動邏輯（首屏動畫、卡片軌道、選單、Gmail 寄信） |
| `src/assets/` | 圖片素材（24 個） |
| `src/build.py` | 打包器：把 CSS／JS／圖片合成 `Amazing-Homepage.html` |
| `tests/` | Playwright 自動化測試 |

## 修改與重新打包

改 `src/` 底下的檔案，然後執行：

```bash
python3 src/build.py
```

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

## 其他調整

- 圖片重新編碼（照片轉 JPEG、去背圖維持 PNG）：4.9 MB → 475 KB，整頁 13 MB → 0.7 MB
- 字型改用 Google Fonts，並補上 `PingFang TC`／`Microsoft JhengHei` 等系統字型後備，
  離線或封鎖外部資源時仍以正確的中文字體顯示
- 修正原稿「適用企業福利場景」區塊中，5 張卡片標題重複出現、
  且 SVG 路徑外洩到內文的問題
