#!/usr/bin/env python3
"""
驗證 API 模式：CONFIG.apiEndpoint 有填時，表單改為 POST 給後端，
成功就顯示成功訊息並清空表單；後端失敗時要能自動退回 Gmail。
用一個本機小伺服器模擬後端（同時檢查送出的 JSON 內容與 Content-Type）。
"""
import asyncio, json, pathlib, re, sys, threading, tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
received, mode = [], {"fail": False}

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n).decode("utf-8")
        received.append({"ctype": self.headers.get("Content-Type", ""), "body": raw})
        payload = json.dumps({"ok": False, "error": "模擬失敗"} if mode["fail"] else {"ok": True})
        self.send_response(500 if mode["fail"] else 200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload.encode())
    def log_message(self, *a): pass

ok = True
def chk(c, label, extra=""):
    global ok
    print(("  PASS " if c else "  FAIL ") + label + (("  -> " + str(extra)) if (extra and not c) else ""))
    if not c: ok = False

async def main():
    global ok
    srv = HTTPServer(("127.0.0.1", 0), H)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    endpoint = f"http://127.0.0.1:{port}/submit"

    # 取單機版成品，把 apiEndpoint 填進去（等同使用者自己設定 CONFIG）
    html = (ROOT / "Amazing-Homepage.html").read_text(encoding="utf-8")
    patched = html.replace("apiEndpoint: ''", f"apiEndpoint: '{endpoint}'", 1)
    chk(patched != html, "成功注入 apiEndpoint")
    tmp = pathlib.Path(tempfile.mkdtemp()) / "api.html"
    tmp.write_text(patched, encoding="utf-8")

    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(tmp.as_uri(), wait_until="domcontentloaded"); await pg.wait_for_timeout(400)
        await pg.evaluate("()=>{window.__opened=[];"
                          "window.open=function(u){window.__opened.push(u);return{closed:false}};}")

        async def fill():
            await pg.fill("input[name=company]", "購精彩測試公司")
            await pg.fill("input[name=contact]", "王小明")
            await pg.fill("input[name=email]", "katie@amazing888.com.tw")
            await pg.fill("input[name=phone]", "02-1234-5678")
            await pg.fill("textarea[name=message]", "約 300 位員工")

        print("\n[1] 後端正常")
        await fill()
        await pg.click("[data-submit]"); await pg.wait_for_timeout(1200)
        chk(len(received) == 1, "後端收到一次請求", len(received))
        if received:
            r = received[0]
            chk(r["ctype"].startswith("text/plain"),
                "用 text/plain 送出（避免 CORS 預檢）", r["ctype"])
            d = json.loads(r["body"])
            chk(d.get("to") == "service@goamazing.com.tw", "帶上收件人", d.get("to"))
            # 中英文欄位名都要有，後端兩種寫法都接得到
            chk(d.get("公司名稱") == "購精彩測試公司" and d.get("company") == "購精彩測試公司",
                "帶上公司名稱（中英文鍵）", [d.get("公司名稱"), d.get("company")])
            chk(d.get("聯絡人") == "王小明" and d.get("contact") == "王小明", "帶上聯絡人（中英文鍵）")
            chk(d.get("電子郵件") == "katie@amazing888.com.tw" and d.get("email") == "katie@amazing888.com.tw",
                "帶上電子郵件（中英文鍵）")
            chk(d.get("需求說明") == "約 300 位員工" and d.get("message") == "約 300 位員工",
                "帶上需求說明（中英文鍵）")
            chk(d.get("聯絡電話") == "02-1234-5678" and d.get("phone") == "02-1234-5678",
                "帶上聯絡電話（中英文鍵）")
            chk("企業福利方案諮詢" in d.get("subject", ""), "帶上主旨", d.get("subject"))
            chk(d.get("hp") == "", "帶上蜜罐欄位（空字串）", d.get("hp"))
        chk(await pg.evaluate("window.__opened.length") == 0, "成功時不開 Gmail")
        st = await pg.inner_text("[data-form-status]")
        chk("已送出" in st, "顯示送出成功訊息", st[:40])
        chk(await pg.input_value("input[name=company]") == "", "成功後清空表單")

        print("\n[2] 後端故障 → 退回 Gmail")
        mode["fail"] = True
        await fill()
        await pg.click("[data-submit]"); await pg.wait_for_timeout(1200)
        chk(len(received) == 2, "後端收到第二次請求", len(received))
        opened = await pg.evaluate("window.__opened")
        chk(len(opened) == 1 and opened[0].startswith("https://mail.google.com/"),
            "失敗時自動改開 Gmail", opened)
        st2 = await pg.inner_text("[data-form-status]")
        chk("失敗" in st2 and "Gmail" in st2, "提示已改用 Gmail", st2[:60])
        chk(await pg.is_enabled("[data-submit]"), "按鈕重新啟用")

        print("\n[3] 驗證仍生效")
        await pg.fill("input[name=email]", "bad-email")
        before = len(received)
        await pg.click("[data-submit]"); await pg.wait_for_timeout(600)
        chk(len(received) == before, "格式錯誤時不送出到後端")

        chk(not errs, "無 JS 例外", errs[:2])
        await b.close()
    srv.shutdown()
    print("\n" + ("API MODE PASSED" if ok else "API MODE FAILED"))
    return 0 if ok else 1

sys.exit(asyncio.run(main()))
