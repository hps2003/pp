# 測試

需求：`pip install playwright`（本機另需 `playwright install chromium`）。

```bash
python3 src/build.py              # 先產生兩種成品
python3 src/build_cyberbiz.py

python3 tests/test_responsive.py      # 獨立版：10 種裝置尺寸的版面檢查
python3 tests/test_functional.py      # 獨立版：表單驗證、選單、即時改尺寸
python3 tests/test_mail_handoff.py    # 兩種版本：iPhone / Android / 電腦的寄信路徑
python3 tests/test_stage_modes.py     # 首屏動畫在各種店家版型下都要保留
python3 tests/verify_cyberbiz.py      # CyberBiz 版：靜態結構檢查（不需瀏覽器）
python3 tests/test_encoding.py        # CyberBiz 版：亂碼測試
python3 tests/test_cyberbiz_embed.py  # CyberBiz 版：放進模擬店家版型實測
python3 tests/test_api_mode.py        # API 模式：對真實端點收送與失敗退回
```

| 檔案 | 檢查什麼 |
|---|---|
| `test_responsive.py` | 每個尺寸的橫向捲動、元素溢出、文字重疊、過小文字（<11px）、過小點擊區（<40px）、JS 例外 |
| `test_functional.py` | 必填與 email/電話驗證、備用寄信與複製、手機選單開合、**不重新載入直接改視窗尺寸** |
| `test_mail_handoff.py` | **iPhone**：先喚起 Gmail App（`googlegmail://`），沒安裝時退回 `mailto:`；**Android**：直接 `mailto:`；**電腦**：Gmail 網頁版另開分頁。三者都比對主旨與內文六個欄位，並確認手機不會連到會弄丟內文的桌機版 Gmail 網址 |
| `test_stage_modes.py` | 五種店家版型下首屏的定位模式與動畫：無阻礙→`native`、`overflow-x:hidden`→`fix`、`overflow:auto`→`fix`、`transform`→`native`、`overflow`+`transform`→`static`。前四種都必須「蓋子有動、文字有淡入、首屏有釘住」 |
| `verify_cyberbiz.py` | 是純片段、**整份檔案為純 ASCII 且無 BOM**、所有選擇器都限縮在 `#gx-root`、class/id/keyframes 都有 `gx-` 前綴、錨點對得上、設計變數沒遺失 |
| `test_encoding.py` | 把片段放進宣告 `utf-8` / `big5` / `iso-8859-1` / **完全不宣告**字元集的頁面，比對渲染出的文字、placeholder、alt 是否**逐字相同** |
| `test_cyberbiz_embed.py` | 放進**帶有惡意佈景主題**的模擬店家頁：版面正確、**24 張圖片全部載入且比例未變形**、**貼片段前後店家元素的位置與樣式完全相同**、寄信正常 |
| `test_api_mode.py` | 起一個本機伺服器當後端：送出的 `Content-Type` 與 JSON 欄位正確、成功後清空表單、**後端故障時自動退回寄信流程** |

> 指令碼中的 Chromium 路徑為此環境的預設值，本機執行請改成
> `p.chromium.launch()` 讓 Playwright 自行尋找瀏覽器。
