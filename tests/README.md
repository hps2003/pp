# 測試

需求：`pip install playwright`（本機另需 `playwright install chromium`）。

```bash
python3 src/build.py              # 先產生兩種成品
python3 src/build_cyberbiz.py

python3 tests/test_responsive.py      # 獨立版：10 種裝置尺寸的版面檢查
python3 tests/test_functional.py      # 獨立版：Gmail 寄信、驗證、選單、即時改尺寸
python3 tests/verify_cyberbiz.py      # CyberBiz 版：靜態結構檢查（不需瀏覽器）
python3 tests/test_encoding.py        # CyberBiz 版：亂碼測試
python3 tests/test_cyberbiz_embed.py  # CyberBiz 版：放進模擬店家版型實測
python3 tests/test_api_mode.py        # API 模式：對真實端點收送與失敗退回
```

| 檔案 | 檢查什麼 |
|---|---|
| `test_responsive.py` | 每個尺寸的橫向捲動、元素溢出、文字重疊、過小文字（<11px）、過小點擊區（<40px）、JS 例外 |
| `test_functional.py` | 必填與 email/電話驗證、Gmail 網址與內文欄位、備用寄信與複製、手機選單開合、**不重新載入直接改視窗尺寸** |
| `verify_cyberbiz.py` | 是純片段、**整份檔案為純 ASCII 且無 BOM**、所有選擇器都限縮在 `#gx-root`、class/id/keyframes 都有 `gx-` 前綴、錨點對得上、設計變數沒遺失 |
| `test_encoding.py` | 把片段放進宣告 `utf-8` / `big5` / `iso-8859-1` / **完全不宣告**字元集的頁面，比對渲染出的文字、placeholder、alt 是否**逐字相同**，並掃描亂碼徵兆 |
| `test_cyberbiz_embed.py` | 放進**帶有惡意佈景主題**的模擬店家頁（固定頁首＋`max-width` 容器＋大量 `!important`）：版面正確、**24 張圖片全部載入且比例未變形**、**貼片段前後店家元素的位置與樣式完全相同**、Gmail 寄信正常、`sticky` 失效時能切換保底模式 |
| `test_api_mode.py` | 起一個本機伺服器當後端：送出的 `Content-Type` 與 JSON 欄位正確、成功後清空表單、**後端故障時自動退回 Gmail**、驗證仍生效 |

> 指令碼中的 Chromium 路徑為此環境的預設值，本機執行請改成
> `p.chromium.launch()` 讓 Playwright 自行尋找瀏覽器。
