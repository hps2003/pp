# GOAMAZING 購精彩 — CYBERBIZ 自訂HTML 嵌入包

把原本的 React 首頁（`Amazing 購精彩 Homepage`）轉成可放進 **CYBERBIZ「自訂HTML」** 區塊的版本。

## 檔案說明

| 檔案 | 用途 |
|------|------|
| `goamazing-cyberbiz.html` | **要上傳的完整網頁**（約 13MB，圖片、字型、React 全部內嵌，離線可跑、無需外部網路）。 |
| `cyberbiz-embed.html` | **貼進 CYBERBIZ 自訂HTML 的一小段 iframe 語法**。 |

## 為什麼用 iframe 引用？

- 原始檔是一個「自包裝的 React 網頁」，含**滾動開箱動畫、可拖曳輪播、聯絡表單、內嵌圖片**，約 13MB，無法直接貼進自訂HTML 編輯框。
- 用 iframe 引用一個獨立檔案：**動畫與互動全部保留**、**不會與 CYBERBIZ 佈景主題的 CSS 互相干擾**、貼上的內容非常小。

## 使用步驟

### 1. 上傳 `goamazing-cyberbiz.html`
把它放到任何可用網址開啟的靜態空間，取得檔案網址。常見做法：

- **GitHub Pages（免費、最簡單）**：在此 repo 的 Settings → Pages 開啟，來源選 `main`（或本分支）。開啟後網址會是：
  `https://hps2003.github.io/pp/goamazing-cyberbiz.html`
- 或任何靜態主機 / 你自己的網域空間 / CDN。

> ⚠️ 注意：`raw.githubusercontent.com` 的原始檔連結**不能**當 iframe 來源（它會被當成純文字、不會顯示成網頁），請務必用 GitHub **Pages** 或其他正常主機。

### 2. 貼上 iframe
打開 `cyberbiz-embed.html`，把裡面的
`請改成你的檔案網址/goamazing-cyberbiz.html`
換成步驟 1 拿到的真實網址，然後把整段貼進 CYBERBIZ 後台的**自訂HTML** 區塊。

## 關於高度設定（重要）

首頁的主視覺是**跟著捲動觸發的「SCROLL TO UNWRAP」開箱動畫**。

- iframe 使用 `height:100vh`（滿版一個螢幕高、內部自行捲動），動畫才會正常播放。
- 若改成「自動撐高整頁高度」，內層網頁就不會捲動、開箱動畫會停在黑畫面 — 所以**建議維持 `100vh`**。
- 可依版型微調 `height`（例如 `90vh`）與 `min-height`。

## 已驗證

- 桌機（1440px）與手機（390px）版型皆正常、RWD 響應式。
- 離線渲染無任何 JavaScript 錯誤（React 與所有素材皆內嵌）。
