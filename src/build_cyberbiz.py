#!/usr/bin/env python3
"""
把 src/ 的原始檔轉成可直接貼進 CyberBiz 的 HTML 片段。

  python3 src/build_cyberbiz.py

產出兩個版本：
  cyberbiz-內嵌圖片.html  圖片以 data URI 內嵌，貼上就能用，不必上傳圖片
  cyberbiz-外連圖片.html  圖片改為外連網址，檔案小很多，但要先把 src/assets/
                          上傳到圖床或 CyberBiz 檔案管理，再把開頭的 IMG_BASE 換掉

轉換內容：
  1. 去掉 <html>/<head>/<body>，只留一個 <div id="gx-root"> 片段
  2. 所有 CSS 選擇器限縮到 #gx-root 之下，不會影響店家其他頁面
  3. 所有 class 加上 gx- 前綴，避免與店家佈景主題的泛用類別互相污染
  4. 所有 id 加上 gx- 前綴（含錨點連結），避免與店家版型的 id 相撞
  5. @keyframes 更名，避免動畫名稱相撞
  6. 字型改用 @import（片段裡不能放 <link> 到 <head>）
"""
import base64
import mimetypes
import pathlib
import re
import sys

SRC = pathlib.Path(__file__).resolve().parent
ROOT_DIR = SRC.parent
ROOT_SEL = "#gx-root"
PREFIX = "gx-"

FONT_IMPORT = (
    '@import url("https://fonts.googleapis.com/css2?'
    'family=Archivo:wght@400;500;600;700;800;900'
    '&family=Noto+Sans+TC:wght@400;500;700;900&display=swap");\n'
)

# ─────────────────────────── 小工具 ───────────────────────────

def split_top_level(text, sep):
    """依 sep 切割，但略過括號、字串內的分隔符。"""
    out, buf, depth, quote = [], [], 0, None
    for ch in text:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch; buf.append(ch); continue
        if ch in "([": depth += 1
        elif ch in ")]": depth -= 1
        if ch == sep and depth == 0:
            out.append("".join(buf)); buf = []
        else:
            buf.append(ch)
    out.append("".join(buf))
    return out


def strip_comments(css):
    """移除 /* … */ 註解，但不動字串與 url() 裡的內容。"""
    out, i, n, quote = [], 0, len(css), None
    while i < n:
        ch = css[i]
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in "\"'":
            quote = ch; out.append(ch); i += 1; continue
        if css.startswith("/*", i):
            j = css.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        out.append(ch); i += 1
    return "".join(out)


def iter_rules(css):
    """把 CSS 切成 (prelude, body, is_block) 序列，body 只在 is_block 時有值。"""
    i, n = 0, len(css)
    while i < n:
        # 找出這條規則的結尾：可能是 { 或 ;
        depth, j, quote = 0, i, None
        start_brace = -1
        while j < n:
            ch = css[j]
            if quote:
                if ch == quote: quote = None
            elif ch in "\"'":
                quote = ch
            elif ch == "{":
                if depth == 0: start_brace = j
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            elif ch == ";" and depth == 0:
                j += 1
                break
            j += 1
        chunk = css[i:j]
        if start_brace >= 0 and depth == 0:
            prelude = chunk[: start_brace - i]
            body = chunk[start_brace - i + 1 : chunk.rfind("}")]
            yield (prelude, body, True)
        else:
            yield (chunk, "", False)
        i = j


def scope_selector(sel):
    parts = []
    for raw in split_top_level(sel, ","):
        s = raw.strip()
        if not s:
            continue
        if s.startswith(ROOT_SEL):
            parts.append(s)
        elif s in (":root", "html", "body"):
            parts.append(ROOT_SEL)
        elif s.startswith("html ") or s.startswith("body "):
            parts.append(ROOT_SEL + " " + s.split(" ", 1)[1])
        elif s == "*":
            parts.append(ROOT_SEL)
            parts.append(ROOT_SEL + " *")
        else:
            parts.append(ROOT_SEL + " " + s)
    return ", ".join(parts)


def scope_css(css, keyframes, _top=True):
    if _top:
        css = strip_comments(css)
    out = []
    for prelude, body, is_block in iter_rules(css):
        p = prelude.strip()
        if not is_block:
            if p:
                out.append(p if p.endswith(";") else p + ";")
            continue
        low = p.lower()
        if low.startswith("@media") or low.startswith("@supports") or low.startswith("@layer"):
            out.append(p + "{\n" + scope_css(body, keyframes, False) + "\n}")
        elif low.startswith("@keyframes") or low.startswith("@-webkit-keyframes"):
            name = p.split()[-1].strip()
            keyframes.add(name)
            out.append(p.rsplit(name, 1)[0] + PREFIX + name + "{" + body + "}")
        elif low.startswith("@font-face") or low.startswith("@import") or low.startswith("@charset"):
            out.append(p + "{" + body + "}")
        else:
            out.append(scope_selector(p) + "{" + body.strip() + "}")
    return "\n".join(x for x in out if x)


# ── 純 ASCII 化 ──────────────────────────────────────────────────────
# CyberBiz 的編輯器 / 資料庫 / 頁面宣告的字元集若不是 UTF-8，中文就會變亂碼。
# 最保險的作法是讓整個片段只含 ASCII 字元：
#   HTML 文字與屬性 → &#xXXXX;   （瀏覽器一定會解回中文）
#   <script> 內      → \uXXXX     （HTML 實體在 script 裡不會被解碼，必須用 JS 逸出）
#   <style>  內      → 本來就只有 ASCII（註解已在 scope_css 移除）
# 這樣不論頁面用哪種編碼載入，文字都不會壞。

def strip_js_line_comments(js):
    """保守地移除「整行都是註解」的行。

    不碰含有程式碼的行——JS 的正規表示式字面量與除法很難分辨，
    只處理整行註解可以完全避免誤判，又能拿掉絕大多數的中文註解。
    """
    out, in_block = [], False
    for line in js.split("\n"):
        t = line.strip()
        if in_block:
            if "*/" in t:
                in_block = False
                after = t.split("*/", 1)[1].strip()
                if after:
                    out.append(line[: len(line) - len(line.lstrip())] + after)
            continue
        if t.startswith("/*"):
            if "*/" in t[2:]:
                after = t.split("*/", 1)[1].strip()
                if after:
                    out.append(line[: len(line) - len(line.lstrip())] + after)
            else:
                in_block = True
            continue
        if t.startswith("//"):
            continue
        out.append(line)
    return "\n".join(out)


def to_ascii_js(js):
    r"""把 JS 內所有非 ASCII 字元換成 \uXXXX。

    字串、樣板字面量、註解、正規表示式裡都是合法的逸出寫法，
    因此不需要判斷所在語境，是純文字層級的安全轉換。
    """
    return "".join(ch if ord(ch) < 128 else "\\u%04x" % ord(ch) for ch in js)


def to_ascii_html(html):
    """把 HTML 的文字與屬性值中的非 ASCII 換成數值字元參照。

    只能用在不含 <style> / <script> 的片段（實體在那兩個元素內不會被解碼）；
    本專案是分開組裝的，符合這個前提。
    """
    return "".join(ch if ord(ch) < 128 else "&#x%X;" % ord(ch) for ch in html)


# 字串與 url() 內容不可以被當成選擇器處理（例如 data URI 裡的 www.w3.org）
# 注意順序：先吃「帶引號的 url()」，否則 data URI 內含的 ")"（例如 filter='url(%23n)'）
# 會讓比對提前結束，後面的引號再吞掉大段 CSS。
_MASKABLE = re.compile(
    r'url\(\s*"[^"]*"\s*\)'      # url("…")
    r"|url\(\s*'[^']*'\s*\)"      # url('…')
    r"|url\([^)'\"]*\)"            # url(…) 無引號
    r'|"[^"]*"'                      # 雙引號字串
    r"|'[^']*'"                      # 單引號字串
)

def mask_literals(css):
    """把字串／url() 換成佔位符，回傳 (遮蔽後文字, 還原函式)。"""
    store = []
    def hide(m):
        store.append(m.group(0))
        return "\x00%d\x00" % (len(store) - 1)
    masked = _MASKABLE.sub(hide, css)
    def restore(text):
        return re.sub(r"\x00(\d+)\x00", lambda m: store[int(m.group(1))], text)
    return masked, restore


# JS 會以行內樣式即時改寫這些屬性，加了 !important 就會蓋掉動畫，必須排除。
NO_IMPORTANT = {
    "transform", "opacity", "box-shadow", "z-index", "scroll-snap-type",
}

def force_important(css):
    """把宣告都加上 !important。

    店家佈景主題常對 h1/p/a/img/button 等「元素選擇器」下 !important；
    我們的 class 前綴擋得住 class 選擇器，卻擋不住這種寫法——
    唯一能贏的方式就是自己也用 !important（同為 important 時比特異性，
    我們的選擇器都含 #gx-root，一定比裸元素高）。
    自訂屬性、@keyframes 內容、以及 JS 動畫用的屬性不加。
    """
    def do_block(body):
        out = []
        for decl in split_top_level(body, ";"):
            d = decl.strip()
            if not d:
                continue
            if "!important" in d or d.startswith("--") or ":" not in d:
                out.append(d); continue
            prop = d.split(":", 1)[0].strip().lower().lstrip("*")
            out.append(d if prop in NO_IMPORTANT else d + " !important")
        return ";".join(out) + (";" if out else "")

    def walk(text, in_keyframes=False):
        out = []
        for prelude, body, is_block in iter_rules(text):
            p = prelude.strip()
            if not is_block:
                if p: out.append(p if p.endswith(";") else p + ";")
                continue
            low = p.lower()
            if low.startswith(("@media", "@supports", "@layer")):
                out.append(p + "{\n" + walk(body, in_keyframes) + "\n}")
            elif low.startswith(("@keyframes", "@-webkit-keyframes")):
                out.append(p + "{" + walk(body, True) + "}")   # keyframes 內不加
            elif low.startswith(("@font-face", "@import", "@charset")):
                out.append(p + "{" + body + "}")
            elif in_keyframes:
                out.append(p + "{" + body + "}")
            else:
                out.append(p + "{" + do_block(body) + "}")
        return "\n".join(x for x in out if x)

    return walk(css)


def collect_classes(css):
    """從 CSS 蒐集所有 class 名稱。

    只擋掉小數（.5em）——class 名稱不會以數字開頭，所以用「前一個字元不是數字或點」
    即可；複合選擇器如 img.photo、.line.l 也必須收得到，否則 HTML 那邊不會改名。
    網址與字串已先被遮蔽，不會誤判。
    """
    masked, _ = mask_literals(css)
    return set(re.findall(r"(?<![\d.])\.([A-Za-z][\w-]*)", masked))

# ─────────────────────────── 主流程 ───────────────────────────

def build(mode, out_name, img_base="https://YOUR-IMAGE-HOST/"):
    html = (SRC / "index.src.html").read_text(encoding="utf-8")
    css = (SRC / "styles.css").read_text(encoding="utf-8")
    overrides = (SRC / "cyberbiz-overrides.css").read_text(encoding="utf-8")
    js = (SRC / "app.js").read_text(encoding="utf-8")
    extra = (SRC / "cyberbiz-extra.js").read_text(encoding="utf-8")

    # ── 1. 蒐集要改名的 class / id ──
    classes = collect_classes(css) | collect_classes(overrides)
    classes = {c for c in classes if not c.startswith(PREFIX)}
    ids = set(re.findall(r'\sid="([^"]+)"', html)) - {"gx-root"}

    # ── 2. CSS：先限縮，再改 class 名 ──
    keyframes = set()
    scoped = scope_css(css, keyframes)

    def rename_classes(text):
        masked, restore = mask_literals(text)
        for c in sorted(classes, key=len, reverse=True):
            pat = r"(?<![\d.])\." + re.escape(c) + r"(?![\w-])"
            masked = re.sub(pat, "." + PREFIX + c, masked)
        return restore(masked)

    scoped = rename_classes(scoped)
    for k in keyframes:                      # animation: amzHint … → gx-amzHint …
        scoped = re.sub(r"(animation(?:-name)?\s*:[^;}]*?)\b%s\b" % re.escape(k),
                        lambda m: m.group(1) + PREFIX + k, scoped)

    # 覆寫檔也要一起加 !important，否則會輸給上面剛加完 !important 的基礎樣式。
    # 兩邊都是 important 時比特異性，覆寫檔的選擇器都更明確（.gx-full、
    # .gx-nostick .gx-stage、#gx-root:not(.gx-js) …），因此仍然是覆寫檔勝出。
    style = FONT_IMPORT + force_important(scoped) + "\n" + force_important(strip_comments(overrides))

    # ── 3. HTML：抽出 <body> 內容 ──
    body = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
    body = re.sub(r"<script>.*?</script>", "", body, flags=re.S).strip()

    # class 改名
    def fix_class_attr(m):
        names = m.group(1).split()
        return 'class="%s"' % " ".join(
            (PREFIX + n if n in classes else n) for n in names
        )
    body = re.sub(r'class="([^"]*)"', fix_class_attr, body)

    # id 與錨點改名
    for i in sorted(ids, key=len, reverse=True):
        body = re.sub(r'(\sid=")%s(")' % re.escape(i), r"\1" + PREFIX + i + r"\2", body)
        body = re.sub(r'(href="#)%s(")' % re.escape(i), r"\1" + PREFIX + i + r"\2", body)
        body = re.sub(r'(aria-controls=")%s(")' % re.escape(i), r"\1" + PREFIX + i + r"\2", body)

    # 抽屜移進導覽列內，才能用 absolute 貼在導覽列正下方
    drawer = re.search(r'<nav class="gx-nav__drawer".*?</nav>', body, re.S)
    if not drawer:
        print("ERROR 找不到手機選單抽屜", file=sys.stderr); return 1
    body = body.replace(drawer.group(0), "", 1)
    body = body.replace("</header>", drawer.group(0) + "\n</header>", 1)

    # ── 4. JS：同步改掉程式碼裡用到的 class 名 ──
    for lit in ["'.field__err'", "'.field'", "'.nav'"]:
        js = js.replace(lit, lit[0] + "." + PREFIX + lit[2:])
    js = js.replace("'is-open'", "'%sis-open'" % PREFIX)
    js = js.replace("'is-solid'", "'%sis-solid'" % PREFIX)
    js = js.replace("'form-status'", "'%sform-status'" % PREFIX)
    js = js.replace("' is-'", "' %sis-'" % PREFIX)
    js = js.replace(".gx-form-status'", ".gx-form-status'")   # 保險：選擇器不重複加前綴

    # 腳本跑起來才加 .gx-js（沒跑到時 CSS 會用保底樣式）
    js_all = (js + "\n" + extra +
              "\n(function(){var r=document.getElementById('gx-root');"
              "if(r)r.classList.add('gx-js');})();\n")
    js_all = to_ascii_js(strip_js_line_comments(js_all))

    # ── 5. 圖片 ──
    missing = []
    def sub_asset(m):
        name = m.group(1).strip()
        path = SRC / "assets" / name
        if not path.exists():
            missing.append(name); return m.group(0)
        if mode == "inline":
            mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
            return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")
        return img_base + name

    body, n_assets = re.subn(r"\{\{ASSET:([^}]+)\}\}", sub_asset, body)
    if missing:
        print("ERROR 找不到資產：" + ", ".join(sorted(set(missing))), file=sys.stderr); return 1

    img_note = ("images are embedded as data URIs - nothing else to upload"
                if mode == "inline" else
                "replace " + img_base + " with your own image URL prefix")
    head_note = (
        "<!-- ============================================================\n"
        "     GOAMAZING homepage - paste-in block for CyberBiz\n"
        "     " + img_note + "\n"
        "\n"
        "     This block is fully self-contained and isolated:\n"
        "       * every CSS rule is scoped under #gx-root\n"
        "       * every class / id is prefixed with gx-\n"
        "       * pure ASCII, so the text cannot turn into mojibake\n"
        "         no matter what charset the page is served with\n"
        "\n"
        "     Two optional switches on the <div> below:\n"
        "       * remove class=\"gx-full\"  -> stay inside the theme container\n"
        "         (default is full-bleed, edge to edge)\n"
        "       * --gx-header-h:0px       -> set to your sticky header height,\n"
        "         e.g. 64px, so this block's own nav sits below it\n"
        "     ============================================================ -->\n"
    )

    if mode == "inline":
        # 圖片已經內嵌在文件裡，沒有網路請求可以延後；留著 lazy 只會讓
        # 捲動到才解碼，出現短暫空白。外連版才需要 lazy。
        body = body.replace(' loading="lazy"', "")

    body = to_ascii_html(body)

    out = (head_note
           + '<div id="gx-root" class="gx-full" style="--gx-header-h:0px">\n'
           + "<style>\n" + style + "\n</style>\n\n"
           + body
           + "\n\n<script>\n" + js_all + "</script>\n</div>\n")

    dest = ROOT_DIR / out_name
    dest.write_text(out, encoding="utf-8")
    kb = len(out.encode("utf-8")) / 1024
    print(f"OK  {out_name}  ({kb:.0f} KB, {n_assets} 張圖, {len(classes)} 個 class 加前綴)")
    return 0


if __name__ == "__main__":
    # 主要成品：單一檔案，複製整份貼上即可
    rc = build("inline", "cyberbiz.html")
    # 備用：編輯器若會過濾 data: 圖片，改用這份並自行上傳圖片
    rc |= build("url", "cyberbiz-external-images.html")
    raise SystemExit(rc)
