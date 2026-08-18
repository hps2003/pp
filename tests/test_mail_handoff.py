#!/usr/bin/env python3
"""
寄信交接測試：三種平台各自要走正確的路徑，且內容都要完整帶入。

  iPhone / iPad  先喚起 Gmail App（googlegmail:///co），沒安裝則退回 mailto
  Android        直接 mailto，交給系統的預設郵件程式（多數人就是 Gmail）
  電腦           Gmail 網頁版撰寫畫面，另開分頁

手機不能用 Gmail 網頁版的 ?view=cm 撰寫網址：手機瀏覽器會被導去行動版收件匣，
帶入的主旨與內文會整個消失，這正是「手機無法把填的字帶進信裡」的原因。
"""
import asyncio, pathlib, sys, urllib.parse
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
import tempfile

def build_targets():
    """回傳 [(名稱, file URI)]：獨立版，以及包在店家版型裡的 CyberBiz 版。"""
    tmp = pathlib.Path(tempfile.mkdtemp())
    frag = (ROOT / "cyberbiz.html").read_text(encoding="ascii")
    emb = tmp / "embed.html"
    emb.write_bytes(('<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">'
                     '<meta name="viewport" content="width=device-width,initial-scale=1">'
                     '<title>t</title></head><body><div style="max-width:1100px;margin:0 auto">'
                     + frag + '</div></body></html>').encode("ascii"))
    return [("獨立版", (ROOT / "Amazing-Homepage.html").as_uri()),
            ("CyberBiz 版", emb.as_uri())]

IPHONE = ("iPhone", 390, 844, True,
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
          "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
ANDROID = ("Android", 412, 915, True,
           "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) "
           "Chrome/126.0.0.0 Mobile Safari/537.36")
DESKTOP = ("Desktop", 1440, 900, False,
           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
           "Chrome/126.0.0.0 Safari/537.36")

ok = True
def chk(c, label, extra=""):
    global ok
    print(("    PASS " if c else "    FAIL ") + label + (("  -> " + str(extra)) if (extra and not c) else ""))
    if not c: ok = False

def parse_mailto(u):
    rest = u[len("mailto:"):]
    addr, _, q = rest.partition("?")
    return addr, urllib.parse.parse_qs(q)

def check_content(q, subj_key, body_key, label):
    su = q.get(subj_key, [""])[0]
    body = q.get(body_key, [""])[0]
    chk("企業福利方案諮詢" in su and "購精彩測試公司" in su, f"{label}：主旨帶入公司名稱", su)
    for f in ["公司名稱：購精彩測試公司", "聯絡人：王小明",
              "電子郵件：katie@amazing888.com.tw", "聯絡電話：02-1234-5678",
              "需求說明：", "約 300 位員工"]:
        chk(f in body, f"{label}：內文含「{f[:14]}」")

async def run(b, url, name, w, h, touch, ua):
    ctx = await b.new_context(viewport={"width": w, "height": h}, is_mobile=touch,
                              has_touch=touch, user_agent=ua)
    pg = await ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(url, wait_until="domcontentloaded"); await pg.wait_for_timeout(400)
    # 攔截換頁與開新視窗，記錄實際被要求開啟的網址
    await pg.evaluate("""()=>{
      window.__nav=[]; window.__opened=[];
      window.__gxNavigate=function(u){window.__nav.push(u)};
      window.open=function(u){window.__opened.push(u);return{closed:false}};
    }""")
    await pg.fill("input[name=company]", "購精彩測試公司")
    await pg.fill("input[name=contact]", "王小明")
    await pg.fill("input[name=email]", "katie@amazing888.com.tw")
    await pg.fill("input[name=phone]", "02-1234-5678")
    await pg.fill("textarea[name=message]", "約 300 位員工")
    await pg.click("[data-submit]")
    await pg.wait_for_timeout(1500)          # 等 iOS 的退回計時器
    nav = await pg.evaluate("window.__nav")
    opened = await pg.evaluate("window.__opened")
    status = await pg.inner_text("[data-form-status]")
    await ctx.close()
    return nav, opened, status, errs

async def one_target(b, target_name, url):
    print(f"\n{'=' * 46}\n  {target_name}\n{'=' * 46}")

    print("\n[iPhone] 先 Gmail App，沒安裝退回 mailto")
    nav, opened, status, errs = await run(b, url, *IPHONE)
    chk(not opened, "不使用 window.open（iOS 會擋彈出視窗）", opened)
    chk(len(nav) >= 1, "有觸發換頁", nav)
    if nav:
        chk(nav[0].startswith("googlegmail:///co?"), "第一步喚起 Gmail App", nav[0][:40])
        q = urllib.parse.parse_qs(urllib.parse.urlparse(nav[0]).query)
        chk(q.get("to") == ["service@goamazing.com.tw"], "Gmail App 收件人正確", q.get("to"))
        check_content(q, "subject", "body", "Gmail App")
    chk(len(nav) == 2, "沒安裝 Gmail App 時會退回第二步", nav)
    if len(nav) == 2:
        chk(nav[1].startswith("mailto:service@goamazing.com.tw?"),
            "退回 mailto 且收件人未被編碼", nav[1][:50])
        addr, q2 = parse_mailto(nav[1])
        chk(addr == "service@goamazing.com.tw", "mailto 收件人正確", addr)
        check_content(q2, "subject", "body", "mailto")
    chk("Gmail" in status, "有提示使用者", status[:40])
    chk(not errs, "無 JS 例外", errs[:2])

    print("\n[Android] 直接交給系統郵件程式")
    nav, opened, status, errs = await run(b, url, *ANDROID)
    chk(not opened, "不使用 window.open", opened)
    chk(len(nav) == 1, "只觸發一次換頁", nav)
    if nav:
        chk(nav[0].startswith("mailto:service@goamazing.com.tw?"), "使用 mailto", nav[0][:50])
        addr, q = parse_mailto(nav[0])
        check_content(q, "subject", "body", "mailto")
    chk(not errs, "無 JS 例外", errs[:2])

    print("\n[電腦] Gmail 網頁版撰寫畫面")
    nav, opened, status, errs = await run(b, url, *DESKTOP)
    chk(len(opened) == 1, "另開分頁一次", opened)
    if opened:
        chk(opened[0].startswith("https://mail.google.com/mail/?view=cm"),
            "使用 Gmail 網頁撰寫網址", opened[0][:50])
        q = urllib.parse.parse_qs(urllib.parse.urlparse(opened[0]).query)
        chk(q.get("to") == ["service@goamazing.com.tw"], "收件人正確", q.get("to"))
        check_content(q, "su", "body", "Gmail 網頁")
    chk(not nav, "沒有多餘的同頁跳轉", nav)
    chk(not errs, "無 JS 例外", errs[:2])

    print("\n[手機不得使用桌機版 Gmail 撰寫網址]")
    for label, dev in (("iPhone", IPHONE), ("Android", ANDROID)):
        nav, opened, _, _ = await run(b, url, *dev)
        allurls = nav + opened
        chk(not any("mail.google.com" in u for u in allurls),
            f"{label} 沒有連到 mail.google.com（會弄丟內文）", allurls)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        for target_name, url in build_targets():
            await one_target(b, target_name, url)
        await b.close()
    print("\n" + ("MAIL HANDOFF PASSED" if ok else "MAIL HANDOFF FAILED"))
    return 0 if ok else 1


sys.exit(asyncio.run(main()))
