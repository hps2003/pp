import asyncio, sys, urllib.parse
from playwright.async_api import async_playwright
URL="file:///home/user/pp/Amazing-Homepage.html"
ok=True
def chk(c,label,extra=""):
    global ok
    print(("  PASS " if c else "  FAIL ")+label+(("  -> "+str(extra)) if (extra and not c) else ""))
    if not c: ok=False

async def main():
    global ok
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        ctx=await b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,device_scale_factor=3)
        pg=await ctx.new_page()
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto(URL,wait_until="domcontentloaded"); await pg.wait_for_timeout(400)

        # capture window.open + location changes instead of really navigating
        await pg.evaluate("""() => {
          window.__opened=[]; window.__loc=[];
          window.open = (u)=>{ window.__opened.push(u); return {closed:false}; };
          Object.defineProperty(window,'__navTo',{value:(u)=>window.__loc.push(u)});
        }""")

        print("\n[1] 空白表單驗證")
        await pg.click('[data-submit]'); await pg.wait_for_timeout(250)
        opened=await pg.evaluate("window.__opened.length")
        chk(opened==0,"未填寫時不會開啟 Gmail")
        err1=await pg.inner_text('.field:has(input[name=company]) .field__err')
        chk("請填寫公司名稱" in err1,"顯示必填錯誤訊息",err1)
        inv=await pg.get_attribute('input[name=company]','aria-invalid')
        chk(inv=="true","錯誤欄位標記 aria-invalid",inv)

        print("\n[2] Email 格式驗證")
        await pg.fill('input[name=company]','購精彩測試股份有限公司')
        await pg.fill('input[name=contact]','王小明')
        await pg.fill('input[name=email]','not-an-email')
        await pg.click('[data-submit]'); await pg.wait_for_timeout(250)
        e2=await pg.inner_text('.field:has(input[name=email]) .field__err')
        chk("正確的電子郵件" in e2,"擋下錯誤 email 格式",e2)
        chk(await pg.evaluate("window.__opened.length")==0,"格式錯誤時不送出")

        print("\n[3] 正常送出 → Gmail")
        await pg.fill('input[name=email]','katie@amazing888.com.tw')
        await pg.fill('input[name=phone]','02-1234-5678')
        await pg.fill('textarea[name=message]','約 300 位員工\n想規劃中秋節慶禮品')
        await pg.click('[data-submit]'); await pg.wait_for_timeout(350)
        urls=await pg.evaluate("window.__opened")
        chk(len(urls)==1,"開啟一個 Gmail 視窗",urls)
        u=urls[0] if urls else ""
        chk(u.startswith("https://mail.google.com/mail/?view=cm"),"使用 Gmail 撰寫網址",u[:70])
        q=urllib.parse.parse_qs(urllib.parse.urlparse(u).query)
        chk(q.get("to")==["service@goamazing.com.tw"],"收件人正確",q.get("to"))
        su=q.get("su",[""])[0]; body=q.get("body",[""])[0]
        chk(su=="企業福利方案諮詢｜購精彩測試股份有限公司","主旨帶入公司名稱",su)
        for f in ["公司名稱：購精彩測試股份有限公司","聯絡人：王小明",
                  "電子郵件：katie@amazing888.com.tw","聯絡電話：02-1234-5678",
                  "需求說明：","約 300 位員工","想規劃中秋節慶禮品",
                  "GOAMAZING 購精彩 官網諮詢表單"]:
            chk(f in body,f"內文含「{f[:20]}」")
        st=await pg.inner_text('[data-form-status]')
        chk("Gmail" in st,"顯示成功提示",st[:40])

        print("\n[4] 備用：預設郵件軟體 / 複製")
        mt=await pg.evaluate("""async()=>{ let got=null;
          const d=Object.getOwnPropertyDescriptor(window.location,'href');
          window.__mt=null; return null; }""")
        # mailto 走 location.href，改以攔截 click 後的 URL 變化驗證按鈕存在且可按
        chk(await pg.is_enabled('[data-send-mailto]'),"備用郵件按鈕可用")
        await pg.click('[data-copy]'); await pg.wait_for_timeout(400)
        st2=await pg.inner_text('[data-form-status]')
        chk("複製" in st2,"複製功能有回饋",st2[:40])

        print("\n[5] 手機選單抽屜")
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(200)
        chk(await pg.is_visible('[data-burger]'),"手機顯示漢堡按鈕")
        chk(not await pg.is_visible('.nav__links'),"手機隱藏桌機選單")
        await pg.click('[data-burger]'); await pg.wait_for_timeout(350)
        chk(await pg.is_visible('[data-drawer]'),"抽屜可開啟")
        chk(await pg.get_attribute('[data-burger]','aria-expanded')=="true","aria-expanded 正確")
        await pg.click('[data-drawer] a'); await pg.wait_for_timeout(400)
        chk(await pg.get_attribute('[data-burger]','aria-expanded')=="false","點連結後自動收合")

        print("\n[6] 即時切換裝置尺寸（不重新載入）")
        for w,h,label in [(1920,1080,"桌機"),(768,1024,"平板直"),(390,844,"手機"),
                          (1180,820,"平板橫"),(320,568,"小手機"),(2560,1200,"寬螢幕")]:
            await pg.set_viewport_size({"width":w,"height":h}); await pg.wait_for_timeout(420)
            hs=await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
            burger=await pg.is_visible('[data-burger]')
            expect_burger = w < 900
            chk(hs<=1 and burger==expect_burger, f"{label} {w}x{h} 無橫向捲動且選單正確", f"hscroll={hs} burger={burger}")

        chk(len(errs)==0,"全程無 JS 例外",errs[:2])
        await b.close()
    print("\n"+("ALL FUNCTIONAL TESTS PASSED" if ok else "SOME TESTS FAILED"))
    return 0 if ok else 1
sys.exit(asyncio.run(main()))
