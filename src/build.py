#!/usr/bin/env python3
"""
把 src/ 的原始檔打包成單一自帶資源的 HTML。

  python3 src/build.py

輸出：Amazing-Homepage.html（圖片以 data URI 內嵌，可直接開啟或上傳到任何主機）
"""
import base64
import mimetypes
import pathlib
import re
import sys

SRC = pathlib.Path(__file__).resolve().parent
ROOT = SRC.parent
OUT = ROOT / "Amazing-Homepage.html"

ASSET_RE = re.compile(r"\{\{ASSET:([^}]+)\}\}")


def data_uri(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> int:
    html = (SRC / "index.src.html").read_text(encoding="utf-8")
    css = (SRC / "styles.css").read_text(encoding="utf-8")
    js = (SRC / "app.js").read_text(encoding="utf-8")

    # 先換 CSS/JS，再換圖片，避免資產內容被當成樣板標記重複處理
    html = html.replace("/*{{STYLES}}*/", css, 1)
    html = html.replace("/*{{SCRIPT}}*/", js, 1)

    missing = []

    def sub(match: re.Match) -> str:
        name = match.group(1).strip()
        path = SRC / "assets" / name
        if not path.exists():
            missing.append(name)
            return match.group(0)
        return data_uri(path)

    html, count = ASSET_RE.subn(sub, html)

    if missing:
        print("ERROR 找不到資產：" + ", ".join(sorted(set(missing))), file=sys.stderr)
        return 1
    if ASSET_RE.search(html):
        print("ERROR 仍有未替換的樣板標記", file=sys.stderr)
        return 1

    OUT.write_text(html, encoding="utf-8")
    print(f"OK  {OUT.relative_to(ROOT)}  ({len(html.encode('utf-8')) / 1048576:.2f} MB, {count} 個內嵌資產)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
