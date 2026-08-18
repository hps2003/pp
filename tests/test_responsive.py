import asyncio, sys
from playwright.async_api import async_playwright

URL = "file:///home/user/pp/Amazing-Homepage.html"
DEVICES = [
    ("iPhone-SE       320x568",  320, 568,  2, True),
    ("iPhone-12       390x844",  390, 844,  3, True),
    ("Pixel-7         412x915",  412, 915,  3, True),
    ("iPhone-PM       430x932",  430, 932,  3, True),
    ("Phone-landscape 844x390",  844, 390,  3, True),
    ("iPad-portrait   768x1024", 768, 1024, 2, True),
    ("iPad-Air-land  1180x820", 1180, 820, 2, True),
    ("Laptop         1280x800", 1280, 800,  1, False),
    ("Desktop        1920x1080",1920, 1080, 1, False),
    ("Ultrawide      2560x1200",2560, 1200, 1, False),
]

PROBE = """() => {
  const de = document.documentElement, vw = de.clientWidth;
  const out = {hScroll: de.scrollWidth - de.clientWidth, overflow: [], overlap: [], tiny: [], tap: []};

  // does any ancestor clip this element horizontally?
  const clipped = el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (/hidden|clip|auto|scroll/.test(c.overflowX + c.overflow)) return true;
    }
    return false;
  };
  const vis = el => {
    const c = getComputedStyle(el);
    if (c.display==='none'||c.visibility==='hidden'||parseFloat(c.opacity)===0) return false;
    const r = el.getBoundingClientRect();
    return r.width>0 && r.height>0;
  };

  document.querySelectorAll('body *').forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1.5 || r.left < -1.5) && !clipped(el))
      out.overflow.push(el.tagName+'.'+String(el.className||'').slice(0,40)+` L${Math.round(r.left)} R${Math.round(r.right)}`);

    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    if (!el.children.length && el.textContent.trim() && fs < 11)
      out.tiny.push(el.tagName+' '+fs+'px "'+el.textContent.trim().slice(0,18)+'"');

    // interactive targets must be >=40px tall for finger use
    if (/^(A|BUTTON)$/.test(el.tagName) && el.offsetParent !== null) {
      if (r.height < 40 && !el.closest('.footer') && !el.classList.contains('link-alt')
          && !el.classList.contains('nav__link') && !el.classList.contains('skip-link'))
        out.tap.push(el.tagName+'.'+String(el.className||'').slice(0,28)+` h=${Math.round(r.height)}`);
    }
  });

  // text-block overlap: compare visible leaf text nodes that are NOT positioned/animated layers
  const leaves = [...document.querySelectorAll('h1,h2,h3,p,span,b,li,label')]
    .filter(e => vis(e) && e.textContent.trim() && !e.closest('.stage') && !e.closest('[data-rail]'));
  for (let i=0;i<leaves.length;i++) for (let j=i+1;j<leaves.length;j++) {
    const a=leaves[i], b=leaves[j];
    if (a.contains(b)||b.contains(a)) continue;
    const A=a.getBoundingClientRect(), B=b.getBoundingClientRect();
    const ox = Math.min(A.right,B.right)-Math.max(A.left,B.left);
    const oy = Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top);
    if (ox > 6 && oy > 6) {
      const key = a.tagName+'/'+b.tagName;
      if (out.overlap.length < 5) out.overlap.push(key+` ${Math.round(ox)}x${Math.round(oy)}px`);
    }
  }
  return out;
}"""

async def run(b, name, w, h, dpr, touch):
    ctx = await b.new_context(viewport={"width":w,"height":h}, device_scale_factor=dpr,
                              is_mobile=touch, has_touch=touch)
    pg = await ctx.new_page()
    errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" and "ERR_" not in m.text else None)
    await pg.goto(URL, wait_until="domcontentloaded")
    await pg.wait_for_timeout(450)
    await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await pg.wait_for_timeout(500)
    r = await pg.evaluate(PROBE)
    await ctx.close()
    bad=[]
    if r["hScroll"]>1: bad.append(f"H-SCROLL {r['hScroll']}px")
    bad += ["OVERFLOW "+x for x in r["overflow"][:4]]
    bad += ["OVERLAP  "+x for x in r["overlap"][:4]]
    bad += ["TINY     "+x for x in r["tiny"][:3]]
    bad += ["TAP<40   "+x for x in r["tap"][:3]]
    bad += ["JS-ERR   "+e[:80] for e in errs[:2]]
    return name, bad

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        results = await asyncio.gather(*[run(b,*d) for d in DEVICES])
        await b.close()
    fails=0
    for name,bad in results:
        print(("PASS  " if not bad else "ISSUE ")+name)
        for x in bad: print("        -",x)
        fails += bool(bad)
    print(f"\n{len(results)-fails}/{len(results)} viewports clean")
    return 1 if fails else 0

sys.exit(asyncio.run(main()))
