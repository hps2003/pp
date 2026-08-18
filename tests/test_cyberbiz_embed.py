#!/usr/bin/env python3
"""
把 CyberBiz 片段放進「模擬店家版型」裡測試：
  · 固定頁首 + 有 max-width 的容器 + 大量會污染的佈景主題 CSS
  · 另一版在外層加 overflow-x:hidden，驗證 sticky 失效時的保底模式
只檢查 #gx-root 之內的元素（店家版型本身壞掉不是我們的問題）。
"""
import asyncio, pathlib, sys, tempfile
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

THEME = """<style>
*{box-sizing:content-box}
body{margin:0;font-family:Arial;background:#fff;color:#333;font-size:14px;line-height:1.4}
.shop-header{position:sticky;top:0;z-index:100;height:64px;background:#222;color:#fff;
  display:flex;align-items:center;padding:0 20px;font-weight:bold}
.shop-container{max-width:1100px;margin:0 auto;padding:24px 16px}
.btn{display:block!important;background:lime!important;border:6px dashed red!important;
     padding:40px!important;font-size:30px!important;width:100%!important}
.card{background:magenta!important;border:8px solid blue!important;padding:50px!important}
.nav{position:static!important;background:yellow!important;height:200px!important}
.section{padding:100px!important;background:cyan!important}
.footer{background:orange!important;font-size:40px!important}
img{border:5px solid green!important;width:100%!important;height:auto!important}
h1,h2,h3{color:purple!important;font-size:60px!important;margin:60px 0!important}
p{margin:40px 0!important;font-size:22px!important}
ul{padding-left:80px!important;list-style:square!important}
button{background:brown!important;color:#fff!important;border-radius:50px!important;padding:30px!important}
a{text-decoration:underline!important;color:red!important}
input,textarea{border:6px solid teal!important;font-size:9px!important;padding:30px!important}
</style>"""

DEVICES = [
    ("iPhone-SE   320x568",  320, 568,  True),
    ("iPhone-12   390x844",  390, 844,  True),
    ("iPad        768x1024", 768, 1024, True),
    ("Laptop     1280x800", 1280, 800,  False),
    ("Desktop    1920x1080",1920, 1080, False),
    ("Ultrawide  2560x1200",2560, 1200, False),
]

PROBE = """() => {
  const de=document.documentElement, vw=de.clientWidth;
  const root=document.getElementById('gx-root');
  const out={hScroll:de.scrollWidth-de.clientWidth, overflow:[], overlap:[], tap:[], tiny:[]};
  if(!root){out.overflow.push('NO #gx-root');return out;}
  const clipped=el=>{for(let p=el.parentElement;p;p=p.parentElement){
    const c=getComputedStyle(p); if(/hidden|clip|auto|scroll/.test(c.overflowX+c.overflow))return true;} return false;};
  const vis=el=>{const c=getComputedStyle(el);
    if(c.display==='none'||c.visibility==='hidden'||parseFloat(c.opacity)===0)return false;
    const r=el.getBoundingClientRect(); return r.width>0&&r.height>0;};

  root.querySelectorAll('*').forEach(el=>{
    if(!vis(el))return;
    const r=el.getBoundingClientRect();
    if((r.right>vw+1.5||r.left<-1.5)&&!clipped(el)
       && !el.closest('.gx-stage') && !el.closest('[data-rail]'))
      out.overflow.push(el.tagName+'.'+String(el.className||'').slice(0,36)+` L${Math.round(r.left)} R${Math.round(r.right)}`);
    const cs=getComputedStyle(el), fs=parseFloat(cs.fontSize);
    if(!el.children.length&&el.textContent.trim()&&fs<11)
      out.tiny.push(el.tagName+' '+fs+'px');
    if(/^(A|BUTTON)$/.test(el.tagName)&&el.offsetParent!==null&&r.height<40
       && !el.closest('.gx-footer') && !el.classList.contains('gx-link-alt')
       && !el.classList.contains('gx-skip-link'))
      out.tap.push(el.tagName+'.'+String(el.className||'').slice(0,26)+` h=${Math.round(r.height)}`);
  });

  // 文字重疊（排除首屏疊層與橫向卡片軌道）
  const leaves=[...root.querySelectorAll('h1,h2,h3,p,span,b,li,label')]
    .filter(e=>vis(e)&&e.textContent.trim()&&!e.closest('.gx-stage')&&!e.closest('[data-rail]'));
  for(let i=0;i<leaves.length;i++)for(let j=i+1;j<leaves.length;j++){
    const a=leaves[i],b=leaves[j]; if(a.contains(b)||b.contains(a))continue;
    const A=a.getBoundingClientRect(),B=b.getBoundingClientRect();
    const ox=Math.min(A.right,B.right)-Math.max(A.left,B.left);
    const oy=Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top);
    if(ox>6&&oy>6&&out.overlap.length<5) out.overlap.push(a.tagName+'/'+b.tagName+` ${Math.round(ox)}x${Math.round(oy)}`);
  }
  return out;
}"""

async def run(b, url, name, w, h, touch, expect_nostick):
    ctx = await b.new_context(viewport={"width":w,"height":h}, is_mobile=touch, has_touch=touch)
    pg = await ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(url, wait_until="domcontentloaded"); await pg.wait_for_timeout(500)
    await pg.evaluate("window.scrollTo(0,document.body.scrollHeight)"); await pg.wait_for_timeout(500)
    r = await pg.evaluate(PROBE)
    nostick = await pg.evaluate("document.getElementById('gx-root').classList.contains('gx-nostick')")
    hasjs = await pg.evaluate("document.getElementById('gx-root').classList.contains('gx-js')")
    await ctx.close()
    bad=[]
    if r["hScroll"]>1: bad.append(f"H-SCROLL {r['hScroll']}px")
    bad += ["OVERFLOW "+x for x in r["overflow"][:3]]
    bad += ["OVERLAP  "+x for x in r["overlap"][:3]]
    bad += ["TAP<40   "+x for x in r["tap"][:3]]
    bad += ["TINY     "+x for x in r["tiny"][:2]]
    bad += ["JS-ERR   "+e[:70] for e in errs[:2]]
    if not hasjs: bad.append("gx-js 未加上（腳本沒跑）")
    if nostick != expect_nostick:
        bad.append(f"gx-nostick={nostick} 但預期 {expect_nostick}")
    return name, bad

async def functional(b, url):
    """在店家版型裡驗證 Gmail 寄信、選單，以及「沒有污染店家版型」。"""
    import urllib.parse
    bad = []
    def chk(c, label, extra=""):
        if not c: bad.append(label + (("  -> " + str(extra)) if extra else ""))

    ctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(url, wait_until="domcontentloaded"); await pg.wait_for_timeout(600)
    # 必須包在箭頭函式裡回傳 undefined：若讓賦值式成為完成值，
    # Playwright 序列化回傳值時會實際呼叫這個函式，多記錄一筆假的呼叫。
    await pg.evaluate("()=>{window.__opened=[];"
                      "window.open=function(u){window.__opened.push(u);return{closed:false}};}")

    # 未填寫不應開啟 Gmail
    await pg.click("[data-submit]"); await pg.wait_for_timeout(300)
    chk(await pg.evaluate("window.__opened.length") == 0, "未填寫時仍開了 Gmail",
        await pg.evaluate("window.__opened"))
    chk("請填寫公司名稱" in await pg.inner_text(".gx-field:has(input[name=company]) .gx-field__err"),
        "沒有顯示必填錯誤訊息")

    # 正常送出
    await pg.fill("input[name=company]", "購精彩測試公司")
    await pg.fill("input[name=contact]", "王小明")
    await pg.fill("input[name=email]", "katie@amazing888.com.tw")
    await pg.fill("input[name=phone]", "02-1234-5678")
    await pg.fill("textarea[name=message]", "約 300 位員工")
    await pg.click("[data-submit]"); await pg.wait_for_timeout(400)
    opened = await pg.evaluate("window.__opened")
    chk(len(opened) == 1, "Gmail 開啟次數不是 1", opened)
    if opened:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(opened[-1]).query)
        chk(q.get("to") == ["service@goamazing.com.tw"], "收件人錯誤", q.get("to"))
        body = q.get("body", [""])[0]
        for f in ["公司名稱：購精彩測試公司", "聯絡人：王小明",
                  "電子郵件：katie@amazing888.com.tw", "約 300 位員工"]:
            chk(f in body, f"信件內文缺少「{f[:16]}」")
    cls = await pg.get_attribute("[data-form-status]", "class")
    chk("gx-form-status" in cls and "gx-is-ok" in cls, "狀態列 class 沒有前綴", cls)

    # 手機選單
    await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(300)
    chk(await pg.is_visible("[data-burger]"), "手機沒有顯示漢堡按鈕")
    await pg.click("[data-burger]"); await pg.wait_for_timeout(350)
    chk(await pg.is_visible("[data-drawer]"), "抽屜打不開")
    chk(await pg.evaluate("!!document.querySelector('.gx-nav [data-drawer]')"), "抽屜沒有移進導覽列")
    await pg.click("[data-drawer] a"); await pg.wait_for_timeout(700)
    chk(await pg.get_attribute("[data-burger]", "aria-expanded") == "false", "點選後沒有收合")
    chk(await pg.evaluate("window.scrollY") > 100, "錨點捲動沒有作用")

    # 隔離性：店家版型必須維持原樣
    r = await pg.evaluate("""()=>{
      const h=document.querySelector('.shop-header'), t=document.querySelector('.shop-container>h2');
      return {pos:getComputedStyle(h).position, color:getComputedStyle(t).color,
              size:getComputedStyle(t).fontSize, bg:getComputedStyle(document.body).backgroundColor};}""")
    chk(r["pos"] == "sticky", "店家頁首的 sticky 被破壞", r["pos"])
    chk(r["color"] == "rgb(128, 0, 128)", "店家標題顏色被我們改掉", r["color"])
    chk(r["size"] == "60px", "店家標題字級被我們改掉", r["size"])
    chk(r["bg"] == "rgb(255, 255, 255)", "body 背景被我們改掉", r["bg"])
    chk(not errs, "有 JS 例外", errs[:2])
    await ctx.close()
    return bad


async def main():
    frag = (ROOT/"cyberbiz-內嵌圖片.html").read_text(encoding="utf-8")
    tmp = pathlib.Path(tempfile.mkdtemp())
    def write(nm, o, c):
        p = tmp/nm
        p.write_text(f"""<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title>{THEME}</head><body>
<header class="shop-header">模擬店家頁首</header>{o}<div class="shop-container">
<h2>店家自訂頁面</h2>{frag}</div>{c}<footer>店家頁尾</footer></body></html>""", encoding="utf-8")
        return p.as_uri()

    normal = write("normal.html", "", "")
    overflow = write("overflow.html", '<div style="overflow-x:hidden">', "</div>")

    fails = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        for label, url, expect in [("一般店家版型", normal, False),
                                   ("外層 overflow:hidden（sticky 失效）", overflow, True)]:
            print(f"\n── {label} ──")
            res = await asyncio.gather(*[run(b, url, *d, expect) for d in DEVICES])
            for name, bad in res:
                print(("  PASS  " if not bad else "  ISSUE ")+name)
                for x in bad: print("          -", x)
                fails += bool(bad)
        print("\n── 功能：Gmail 寄信 / 選單 / 隔離性 ──")
        fbad = await functional(b, normal)
        for x in fbad: print("          -", x)
        print("  PASS  嵌入後功能正常" if not fbad else "  ISSUE 嵌入後功能異常")
        fails += bool(fbad)
        await b.close()
    total = len(DEVICES)*2 + 1
    print(f"\n{total-fails}/{total} 通過")
    return 1 if fails else 0

sys.exit(asyncio.run(main()))
