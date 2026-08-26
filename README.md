# pp — 洪芃薰 作品倉庫 / Portfolio

這個 repository 收錄洪芃薰的作品，並以 **GitHub Pages** 公開發布互動式個人作品集網站。

主網站（首頁 `index.html`）為純靜態站台，不需 build step：`index.html` 載入
`support.js`（自帶 runtime，執行時再從 CDN 取得 React / ReactDOM / Babel），於瀏覽器
端渲染整頁。

## 結構

```
index.html          作品集首頁（進入點）
support.js          頁面 runtime（請勿手動編輯）
image-slot.js       圖片拖放佔位小工具
assets/             圖片、三折頁介紹頁、貓咪場景素材、hero 背景
  ├─ hero-sea.html / sea-scene.js / hero-*.glb·jpg   首頁 3D 海景
  ├─ trifold-*.mount.js                              PPT 三折頁互動元件
  ├─ ppt/resume-slide.js + ppt/image*.png            履歷投影片
  └─ cat-*.webp、welcome-*.webp、tarot.webp 等        場景與插圖素材
cyberbiz/           另一份作品：Cyberbiz 品牌頁的三種匯出版本（A 單塊內嵌圖 /
                    B 單塊外連圖 / C 拆分 HTML·CSS·JS），為獨立標準頁面
.github/workflows/  GitHub Pages 自動部署 workflow
```

所有素材皆使用相對路徑（`./assets/...`），因此無論部署在網域根目錄或 GitHub Pages
的專案子路徑（`https://<USERNAME>.github.io/<REPO>/`）都能正常運作。本專案 Pages
網址為：`https://hps2003.github.io/pp/`。

## 部署到 GitHub Pages

1. 將此 repository 推送到 GitHub。
2. 進入 **Settings → Pages**，將 **Source** 設為 **GitHub Actions**。
3. 推送到 `main`（或到 Actions 頁面手動執行 workflow）——
   `.github/workflows/deploy-pages.yml` 會將整個 repo 原樣上傳並發布，
   不需 `npm install` 或任何 build step。

發布完成後即可透過 `https://hps2003.github.io/pp/` 瀏覽作品集首頁。

## 備註

- 字型由 Google Fonts 載入，首頁 3D 海景的 model viewer 會從 CDN 載入 three.js
  ——兩者皆需執行時的網路連線（與 GitHub Pages 託管本身無關）。
- 聯絡表單會開啟預填內容的 Gmail 撰寫視窗；表單中選取的附件需在 Gmail 內手動
  重新加入（靜態網站無法自行上傳檔案到信箱）。
- `.nojekyll` 確保 Pages 不對檔案套用 Jekyll 處理（此站以 GitHub Actions 直接
  上傳 artifact 發布，原本即不經 Jekyll，此檔為額外保險）。
