# 測試

需求：`pip install playwright`（本機另需 `playwright install chromium`）。

```bash
python3 src/build.py            # 先產生 Amazing-Homepage.html
python3 tests/test_responsive.py   # 10 種裝置尺寸的版面檢查
python3 tests/test_functional.py   # Gmail 寄信、表單驗證、選單、即時改變尺寸
```

`test_responsive.py` 針對每個尺寸檢查：
- 頁面是否出現橫向捲動（破版最常見的徵兆）
- 是否有元素超出畫面且未被容器裁切
- 文字區塊之間是否互相重疊
- 是否有小於 11px 的文字
- 可點擊元素高度是否小於 40px
- 是否有 JavaScript 例外

`test_functional.py` 驗證表單必填與 email/電話格式、Gmail 撰寫網址與內文欄位、
備用寄信與複製、手機選單開合，以及**不重新載入頁面**直接改變視窗尺寸時版面是否正確。

> 指令碼中的 Chromium 路徑為此環境的預設值，本機執行請改成
> `p.chromium.launch()` 讓 Playwright 自行尋找瀏覽器。
