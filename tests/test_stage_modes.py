#!/usr/bin/env python3
"""
首屏「拆禮物」動畫在各種店家版型下都要保留。

position:sticky 只要祖先有 overflow 就會失效（overflow-x:hidden 會讓
overflow-y 計算成 auto，這在佈景主題極常見）。程式會依序退而求其次：
  native → 直接用 CSS sticky
  fix    → sticky 被 overflow 擋住，改用 position:fixed 模擬（動畫保留）
  static → 祖先有 transform，連 fixed 都被綁住，才放棄動畫
"""
import asyncio, pathlib, sys, tempfile
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
frag=(ROOT/'cyberbiz.html').read_text(encoding='ascii')
tmp=pathlib.Path(tempfile.mkdtemp())

def page(open_,close_):
    return f'''<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{margin:0;font-family:Arial}}.c{{max-width:1100px;margin:0 auto}}</style></head><body>
<header style="height:60px;background:#222;color:#fff">shop</header>
{open_}<div class="c">{frag}</div>{close_}
<footer style="height:200px;background:#eee">footer</footer></body></html>'''

cases = {
 'A-無阻礙(應為 native)':        ('', ''),
 'B-overflow-x:hidden(應為 fix)': ('<div style="overflow-x:hidden">', '</div>'),
 'C-overflow:auto(應為 fix)':     ('<div style="overflow:auto">', '</div>'),
 'D-transform(應為 native)':      ('<div style="transform:translateZ(0)">', '</div>'),
 'E-overflow+transform(應為 static)': ('<div style="transform:translateZ(0)"><div style="overflow-x:hidden">', '</div></div>'),
}
for k,(o,c) in cases.items():
    (tmp/f'{k}.html').write_bytes(page(o,c).encode('utf-8'))

async def main():
    ok=True
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path=CHROME)
        for k,(o,c) in cases.items():
            ctx=await b.new_context(viewport={"width":1280,"height":900})
            pg=await ctx.new_page()
            await pg.goto((tmp/f'{k}.html').as_uri(),wait_until="load"); await pg.wait_for_timeout(700)
            mode=await pg.evaluate("""()=>{const r=document.getElementById('gx-root');
              return r.classList.contains('gx-fixstick')?'fix':r.classList.contains('gx-nostick')?'static':'native';}""")
            # 捲到舞台中段，量測動畫是否真的在跑
            samples=[]
            stageH=await pg.evaluate("document.querySelector('#gx-root .gx-stage').offsetHeight")
            for frac in (0.05,0.35,0.65,0.92):
                await pg.evaluate(f"window.scrollTo(0,{int(stageH*frac)})"); await pg.wait_for_timeout(350)
                s=await pg.evaluate("""()=>{const g=s=>document.querySelector('#gx-root '+s);
                  const p=g('.gx-stage__panel--top'), h=g('.gx-hero'), st=g('.gx-stage__sticky');
                  const rs=st.getBoundingClientRect();
                  return {panelT:p?getComputedStyle(p).transform:'none',
                          heroOp:h?+getComputedStyle(h).opacity:-1,
                          stickyTop:Math.round(rs.top), stickyH:Math.round(rs.height)};}""")
                samples.append(s)
            await ctx.close()
            expect=k.split('應為 ')[1].rstrip(')')
            moved = len({s['panelT'] for s in samples})>1
            faded = max(s['heroOp'] for s in samples)-min(s['heroOp'] for s in samples) > 0.5
            pinned = all(abs(s['stickyTop'])<=2 for s in samples[1:3])
            good = (mode==expect) and (moved and faded and pinned if expect!='static' else True)
            print(("  PASS " if good else "  FAIL ")+f"{k:32s} mode={mode:7s} 蓋子有動={moved} 文字有淡入={faded} 首屏有釘住={pinned}")
            if not good:
                for s in samples: print("        ", s)
            ok = ok and good
        await b.close()
    print("\n"+("STAGE ANIMATION PASSED" if ok else "STAGE ANIMATION FAILED"))
    return 0 if ok else 1
sys.exit(asyncio.run(main()))
