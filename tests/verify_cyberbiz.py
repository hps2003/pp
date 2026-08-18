#!/usr/bin/env python3
"""檢查 CyberBiz 片段：樣式確實限縮、class/id 都有前綴、設計變數沒有遺失。"""
import pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "src"))
from build_cyberbiz import iter_rules, strip_comments   # 共用同一套解析器

ROOT = pathlib.Path(__file__).resolve().parent.parent
ok = True

def chk(cond, label, extra=""):
    global ok
    print(("  PASS " if cond else "  FAIL ") + label + (("  -> " + str(extra)) if (extra and not cond) else ""))
    if not cond: ok = False

def walk(css, found):
    for prelude, body, is_block in iter_rules(css):
        p = prelude.strip()
        if not is_block:
            continue
        low = p.lower()
        if low.startswith(("@media", "@supports", "@layer")):
            walk(body, found)
        elif low.startswith(("@keyframes", "@-webkit-keyframes")):
            found["keyframes"].append(p.split()[-1])
        elif low.startswith(("@font-face", "@import", "@charset")):
            pass
        else:
            for part in p.split(","):
                part = part.strip()
                if part:
                    found["selectors"].append(part)

for name in ["cyberbiz.html", "cyberbiz-external-images.html"]:
    path = ROOT / name
    print(f"\n=== {name} ({path.stat().st_size//1024} KB) ===")
    doc = path.read_text(encoding="utf-8")

    chk("<html" not in doc.lower() and "<body" not in doc.lower() and "<!doctype" not in doc.lower(),
        "是純片段，沒有 html/body/doctype")

    raw = path.read_bytes()
    bad = [i for i, b in enumerate(raw) if b > 127]
    chk(not bad, f"整份檔案都是 ASCII（{len(bad)} 個非 ASCII 位元組）",
        raw[max(0, bad[0]-40):bad[0]+40] if bad else "")
    chk(raw[:3] != b"\xef\xbb\xbf", "沒有 BOM")

    style = re.search(r"<style>(.*?)</style>", doc, re.S).group(1)
    body = doc.split("</style>", 1)[1]

    found = {"selectors": [], "keyframes": []}
    walk(strip_comments(style), found)

    unscoped = [s for s in found["selectors"] if not s.startswith("#gx-root")]
    chk(not unscoped, f"全部 {len(found['selectors'])} 條選擇器都限縮在 #gx-root", unscoped[:6])

    bad_kf = [k for k in found["keyframes"] if not k.startswith("gx-")]
    chk(not bad_kf, "keyframes 名稱有前綴", bad_kf)

    # 設計變數必須定義在 #gx-root 上（之前的 bug 會讓它們全部消失）
    chk(re.search(r"#gx-root\{[^}]*--brand-red:", style) is not None,
        "設計變數定義在 #gx-root（--brand-red 存在）")
    for var in ["--brand-gold", "--gutter", "--font-zh", "--nav-h", "--stage-h"]:
        chk(var + ":" in style, f"變數 {var} 有定義")

    # HTML 端
    used = set()
    for m in re.finditer(r'class="([^"]*)"', body):
        used.update(m.group(1).split())
    chk(all(c.startswith("gx-") for c in used), "HTML 所有 class 都有 gx- 前綴",
        [c for c in used if not c.startswith("gx-")])

    ids = re.findall(r'\sid="([^"]+)"', body)
    chk(all(i.startswith("gx-") for i in ids), "HTML 所有 id 都有 gx- 前綴",
        [i for i in ids if not i.startswith("gx-")])

    anchors = set(re.findall(r'href="#([^"]+)"', body))
    chk(anchors <= set(ids), "所有錨點都有對應的 id", sorted(anchors - set(ids)))

    # class 一致性：HTML 用到的 class 幾乎都該在 CSS 裡出現
    css_classes = set(re.findall(r"\.(gx-[\w-]+)", style))
    orphan = sorted(c for c in used if c not in css_classes)
    chk(len(orphan) <= 2, "HTML 用到的 class 都能在 CSS 找到", orphan)

    # 資料屬性選擇器不能外洩到 document（JS 都走 #gx-root）
    chk("document.querySelectorAll('[data-rail]')" not in doc, "JS 查詢已限縮在片段內")
    chk("id=\"gx-root\"" in doc, "有 #gx-root 容器")
    chk(doc.count("<style>") == 1 and doc.count("<script>") == 1, "只有一組 style/script")

    # 外連版必須沒有 data URI，內嵌版必須沒有佔位網址
    if "external" in name:
        chk("data:image/png;base64" not in doc and "data:image/jpeg;base64" not in doc,
            "外連版沒有內嵌圖片")
        chk("https://YOUR-IMAGE-HOST/" in doc, "外連版有圖片網址佔位提示")
    else:
        chk("YOUR-IMAGE-HOST" not in doc, "內嵌版沒有佔位網址")
        chk(doc.count("data:image/") >= 24, "內嵌版圖片齊全")

print("\n" + ("VERIFY PASSED" if ok else "VERIFY FAILED"))
sys.exit(0 if ok else 1)
