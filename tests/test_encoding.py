#!/usr/bin/env python3
"""
驗證「不會亂碼」：整份片段是純 ASCII，
因此即使頁面宣告 big5 / latin-1 / 完全沒宣告字元集，中文仍然正確顯示。
"""
import asyncio, pathlib, re, sys, tempfile
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

frag=(ROOT/'cyberbiz.html').read_text(encoding='ascii')
tmp=pathlib.Path(tempfile.mkdtemp())

# 故意用「錯誤/缺少」的字元集載入，模擬 CMS 沒有正確宣告 UTF-8 的情況
cases={
 'utf8':      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>%s</body></html>',
 'big5':      '<!DOCTYPE html><html><head><meta charset="big5"></head><body>%s</body></html>',
 'latin1':    '<!DOCTYPE html><html><head><meta charset="iso-8859-1"></head><body>%s</body></html>',
 'nocharset': '<!DOCTYPE html><html><head></head><body>%s</body></html>',
}
for k,tpl in cases.items():
    (tmp/f'{k}.html').write_bytes((tpl%frag).encode('ascii'))

EXTRACT="""()=>{
  const r=document.getElementById('gx-root');
  const t=[];
  r.querySelectorAll('h1,h2,h3,p,span,b,li,label,a,button').forEach(e=>{
    if(e.children.length===0){const s=e.textContent.trim(); if(s)t.push(s);}
  });
  const ph=[...r.querySelectorAll('input,textarea')].map(e=>e.placeholder||'');
  const alt=[...r.querySelectorAll('img')].map(e=>e.alt||'');
  return {text:t, ph:ph, alt:alt};
}"""

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME)
        results={}
        for k in cases:
            ctx=await b.new_context(viewport={"width":1280,"height":900})
            pg=await ctx.new_page()
            await pg.goto((tmp/f'{k}.html').as_uri(),wait_until="domcontentloaded")
            await pg.wait_for_timeout(500)
            results[k]=await pg.evaluate(EXTRACT)
            await ctx.close()
        await b.close()

    base=results['utf8']
    print(f"抽出可見文字 {len(base['text'])} 段、placeholder {len(base['ph'])} 個、alt {len(base['alt'])} 個\n")
    ok=True
    for k in cases:
        same = results[k]==base
        print(("  PASS " if same else "  FAIL ")+f"charset={k:10s} 文字與 UTF-8 版完全一致")
        ok = ok and same
    # 亂碼徵兆：常見的 UTF-8 被誤讀成 latin1 的字元
    bad=re.compile(r'[ÃÂå¤æè][\x80-\xbf\w]|�')
    joined=" ".join(base['text']+base['ph']+base['alt'])
    hasbad=bool(bad.search(joined))
    print(("  PASS " if not hasbad else "  FAIL ")+"沒有亂碼徵兆（Ã/Â/å/�）")
    ok = ok and not hasbad
    # 抽樣顯示
    print("\n實際渲染出的文字（抽樣）:")
    for s in base['text'][:6]: print("   ", s[:46])
    print("   placeholder:", base['ph'][:2])
    print("   alt:", [a for a in base['alt'] if a][:3])
    print("\n"+("MOJIBAKE TEST PASSED" if ok else "MOJIBAKE TEST FAILED"))
    return 0 if ok else 1
sys.exit(asyncio.run(main()))
import asyncio, pathlib, re, sys, tempfile
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

frag=(ROOT/'cyberbiz.html').read_text(encoding='ascii')
tmp=pathlib.Path(tempfile.mkdtemp())

# 故意用「錯誤/缺少」的字元集載入，模擬 CMS 沒有正確宣告 UTF-8 的情況
cases={
 'utf8':      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>%s</body></html>',
 'big5':      '<!DOCTYPE html><html><head><meta charset="big5"></head><body>%s</body></html>',
 'latin1':    '<!DOCTYPE html><html><head><meta charset="iso-8859-1"></head><body>%s</body></html>',
 'nocharset': '<!DOCTYPE html><html><head></head><body>%s</body></html>',
}
for k,tpl in cases.items():
    (tmp/f'{k}.html').write_bytes((tpl%frag).encode('ascii'))

EXTRACT="""()=>{
  const r=document.getElementById('gx-root');
  const t=[];
  r.querySelectorAll('h1,h2,h3,p,span,b,li,label,a,button').forEach(e=>{
    if(e.children.length===0){const s=e.textContent.trim(); if(s)t.push(s);}
  });
  const ph=[...r.querySelectorAll('input,textarea')].map(e=>e.placeholder||'');
  const alt=[...r.querySelectorAll('img')].map(e=>e.alt||'');
  return {text:t, ph:ph, alt:alt};
}"""

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=CHROME)
        results={}
        for k in cases:
            ctx=await b.new_context(viewport={"width":1280,"height":900})
            pg=await ctx.new_page()
            await pg.goto((tmp/f'{k}.html').as_uri(),wait_until="domcontentloaded")
            await pg.wait_for_timeout(500)
            results[k]=await pg.evaluate(EXTRACT)
            await ctx.close()
        await b.close()

    base=results['utf8']
    print(f"抽出可見文字 {len(base['text'])} 段、placeholder {len(base['ph'])} 個、alt {len(base['alt'])} 個\n")
    ok=True
    for k in cases:
        same = results[k]==base
        print(("  PASS " if same else "  FAIL ")+f"charset={k:10s} 文字與 UTF-8 版完全一致")
        ok = ok and same
    # 亂碼徵兆：常見的 UTF-8 被誤讀成 latin1 的字元
    bad=re.compile(r'[ÃÂå¤æè][\x80-\xbf\w]|�')
    joined=" ".join(base['text']+base['ph']+base['alt'])
    hasbad=bool(bad.search(joined))
    print(("  PASS " if not hasbad else "  FAIL ")+"沒有亂碼徵兆（Ã/Â/å/�）")
    ok = ok and not hasbad
    # 抽樣顯示
    print("\n實際渲染出的文字（抽樣）:")
    for s in base['text'][:6]: print("   ", s[:46])
    print("   placeholder:", base['ph'][:2])
    print("   alt:", [a for a in base['alt'] if a][:3])
    print("\n"+("MOJIBAKE TEST PASSED" if ok else "MOJIBAKE TEST FAILED"))
    return 0 if ok else 1
sys.exit(asyncio.run(main()))
