#!/usr/bin/env python3
"""deck.py — build an editable PPTX from a JSON spec, using themes and page
patterns distilled from reference decks (see references/visual-patterns.md).

    python3 deck.py spec.json out.pptx          # build + lint
    python3 deck.py --list                      # list themes and patterns

Everything is native PowerPoint: text boxes, shapes and real charts (bar,
line, doughnut) whose data stays editable. The skill's rules are enforced:
font floors (16/20/30/44 pt), one accent per chart, fade-only transitions,
and a lint report (body text length, contrast, chart limits, sources).

Spec shape (all keys optional unless noted):
{
  "theme": "deep_blue",                 # see THEMES
  "font": {"latin": "...", "ea": "..."},# overrides theme fonts
  "footer": "Company · 2026",
  "slides": [ {"type": "cover", ...}, ... ]   # see PATTERNS / docstrings
}
Titles accept **double asterisks** around the conclusion phrase to colour it.
"""
from __future__ import annotations

import json
import re
import sys
from copy import deepcopy

from lxml import etree
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_MARKER_STYLE
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

# --------------------------------------------------------------------------
# Themes — palettes and card language taken from the reference decks.
# --------------------------------------------------------------------------
BASE = dict(
    latin="Microsoft JhengHei", ea="Microsoft JhengHei",
    radius=0.16, card="soft", cover="dark", title_bar=False,
)
THEMES = {
    "deep_blue": dict(BASE,
        bg="#f4f6fb", surface="#ffffff", surface2="#e8edff", ink="#141a3a", muted="#5b6275",
        primary="#2340d8", on_primary="#ffffff", accent="#5b78ff", on_accent="#0b1033",
        highlight="#9db1ff", track="#d7ddf0", title_accent="#2340d8",
        dark1="#070b26", dark2="#1d2fb8", on_dark="#ffffff", accent_on_dark="#a9baff",
        frame="#2340d8"),
    "friendly": dict(BASE,
        bg="#ffffff", surface="#ffffff", surface2="#eef6fd", ink="#0d2a40", muted="#4f6272",
        primary="#0d4a7a", on_primary="#ffffff", accent="#2f9be8", on_accent="#0d2a40",
        highlight="#f6c945", track="#dbe6ef", title_accent="#0d4a7a",
        dark1="#0d4a7a", dark2="#13609c", on_dark="#ffffff", accent_on_dark="#f6c945",
        frame="#e6edf3", card="line", cover="panel", title_bar=True),
    "infographic_navy": dict(BASE,
        bg="#eef0f7", surface="#ffffff", surface2="#e3e7f5", ink="#151d3b", muted="#535b78",
        primary="#1f2f5c", on_primary="#ffffff", accent="#3a7bfd", on_accent="#0b1433",
        highlight="#ffb347", track="#d3d8ea", title_accent="#1f2f5c",
        dark1="#141d3d", dark2="#2b3f7a", on_dark="#ffffff", accent_on_dark="#9cc0ff",
        frame="#1f2f5c"),
    "eco_green": dict(BASE,
        bg="#ffffff", surface="#ffffff", surface2="#eef6ec", ink="#16261d", muted="#4d5e54",
        primary="#1e7a45", on_primary="#ffffff", accent="#4caf50", on_accent="#10251a",
        highlight="#a5d6a7", track="#dce9dc", title_accent="#1e7a45",
        dark1="#245c34", dark2="#357a44", on_dark="#ffffff", accent_on_dark="#e3f6c9",
        frame="#5f9e4a", cover="panel", radius=0.3),
    "fintech_teal": dict(BASE,
        bg="#f4fbf8", surface="#ffffff", surface2="#e3f5ee", ink="#0f1f1c", muted="#4b5d58",
        primary="#0e5e52", on_primary="#ffffff", accent="#1fbf8f", on_accent="#062a2a",
        highlight="#9be3cb", track="#d5e6e0", title_accent="#0e5e52",
        dark1="#04201f", dark2="#0b4a42", on_dark="#ffffff", accent_on_dark="#5fe0b5",
        frame="#0e5e52"),
    "humanizer": dict(BASE,
        latin="DM Sans", ea="Microsoft JhengHei",
        bg="#f0ffdd", surface="#fffdf8", surface2="#f5efe0", ink="#2d1f16", muted="#6b5749",
        primary="#2a4b9e", on_primary="#fffdf8", accent="#c8706f", on_accent="#2d1f16",
        highlight="#f2c832", track="#e3d8c4", title_accent="#2a4b9e",
        dark1="#2a4b9e", dark2="#1f3a80", on_dark="#fffdf8", accent_on_dark="#f2c832",
        frame="#ffe5ee", card="outline", cover="panel"),
}

# Font floors (pt) — the skill's rules.
F_MIN, F_CARD, F_TITLE, F_KPI, F_COVER = 16, 20, 30, 44, 48
W, H = 13.333, 7.5
MX = 0.6                     # side margin
CT, CB = 2.55, 6.85          # content top / bottom

LINT: list[str] = []


# --------------------------------------------------------------------------
# Low-level helpers
# --------------------------------------------------------------------------
def rgb(h: str) -> RGBColor:
    return RGBColor.from_string(h.lstrip("#").upper())


def _lum(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def contrast(a, b):
    x, y = sorted([_lum(a), _lum(b)])
    return (y + .05) / (x + .05)


class Ctx:
    def __init__(self, prs, theme, spec):
        self.prs, self.t, self.spec = prs, theme, spec
        self.page = 0
        self.body_chars = 0


def _set_alpha(fill_fmt, alpha_pct):
    srgb = fill_fmt._xPr.find(qn("a:solidFill")).find(qn("a:srgbClr"))
    a = etree.SubElement(srgb, qn("a:alpha"))
    a.set("val", str(int(alpha_pct * 1000)))


def shape(s, kind, x, y, w, h, fill=None, line=None, lw=1.0, radius=None,
          dash=False, alpha=None, rot=0):
    sh = s.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.shadow.inherit = False
    if fill:
        sh.fill.solid()
        sh.fill.fore_color.rgb = rgb(fill)
        if alpha is not None:
            _set_alpha(sh.fill, alpha)
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = rgb(line)
        sh.line.width = Pt(lw)
        if dash:
            sh.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    else:
        sh.line.fill.background()
    if radius is not None and kind == MSO_SHAPE.ROUNDED_RECTANGLE:
        sh.adjustments[0] = min(0.5, radius / max(0.01, min(w, h)))
    if rot:
        sh.rotation = rot
    if sh.has_text_frame:
        sh.text_frame.text = ""
    return sh


def rect(s, x, y, w, h, fill=None, line=None, lw=1.0, r=None, **kw):
    kind = MSO_SHAPE.ROUNDED_RECTANGLE if r else MSO_SHAPE.RECTANGLE
    return shape(s, kind, x, y, w, h, fill, line, lw, radius=r, **kw)


def gradient(s, x, y, w, h, c1, c2, angle=315, r=None):
    sh = rect(s, x, y, w, h, fill=c1, r=r)
    sh.fill.gradient()
    sh.fill.gradient_angle = angle
    st = sh.fill.gradient_stops
    st[0].color.rgb, st[0].position = rgb(c1), 0
    st[1].color.rgb, st[1].position = rgb(c2), 1.0
    return sh


def _font(run, ctx, size, color, bold=False):
    size = max(size, F_MIN)
    f = run.font
    f.size, f.bold = Pt(size), bold
    f.color.rgb = rgb(color)
    f.name = ctx.t["latin"]
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):
        el = rPr.find(qn(tag))
        if el is None:
            el = etree.SubElement(rPr, qn(tag))
        el.set("typeface", ctx.t["ea"])


def text(ctx, s, x, y, w, h, content, size=F_MIN, color=None, bold=False,
         align="l", anchor="t", accent=None, bg=None, spacing=1.15, body=False):
    """content: str (\\n = new paragraph; **x** = accent run) or list of str."""
    color = color or ctx.t["ink"]
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.02)
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    paras = content if isinstance(content, list) else str(content).split("\n")
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
        p.line_spacing = spacing
        for j, part in enumerate(re.split(r"\*\*", para)):
            if not part:
                continue
            r = p.add_run()
            r.text = part
            _font(r, ctx, size, (accent or ctx.t["title_accent"]) if j % 2 else color, bold or bool(j % 2))
    if body:
        ctx.body_chars += sum(len(re.sub(r"[\s*]", "", p)) for p in paras)
    if bg and contrast(color, bg) < (3.0 if size >= 24 else 4.5):
        LINT.append(f"P{ctx.page:02d} contrast {contrast(color, bg):.2f}:1 for '{str(paras[0])[:12]}' ({color} on {bg})")
    return tb


def card(ctx, s, x, y, w, h, emphasis=False, dashed=False, fill=None):
    t = ctx.t
    r = t["radius"]
    if dashed:
        return rect(s, x, y, w, h, fill=fill, line=t["muted"], lw=1.5, r=r, dash=True)
    if t["card"] == "outline":
        rect(s, x + 0.06, y + 0.09, w, h, fill=t["ink"], r=r)
        return rect(s, x, y, w, h, fill=fill or (t["primary"] if emphasis else t["surface"]), line=t["ink"], lw=2, r=r)
    if t["card"] == "line":
        return rect(s, x, y, w, h, fill=fill or (t["primary"] if emphasis else t["surface"]),
                    line=t["primary"] if emphasis else t["track"], lw=1.25, r=r)
    return rect(s, x, y, w, h, fill=fill or (t["primary"] if emphasis else t["surface2"]), r=r)


def card_fill(ctx, emphasis):
    t = ctx.t
    if emphasis:
        return t["primary"]
    return t["surface2"] if t["card"] == "soft" else t["surface"]


def badge(ctx, s, x, y, d, label, fill=None, color=None):
    t = ctx.t
    fill = fill or t["accent"]
    c = shape(s, MSO_SHAPE.OVAL, x, y, d, d, fill=fill,
              line=t["ink"] if t["card"] == "outline" else None, lw=2)
    text(ctx, s, x - 0.2, y, d + 0.4, d, label, F_MIN, color or t["on_accent"], True, "c", "m", bg=fill)
    return c


def pill(ctx, s, x, y, label, fill=None, color=None, size=F_MIN, h=0.42):
    t = ctx.t
    fill = fill or t["primary"]
    w = 0.5 + 0.2 * len(label) * (1.0 if re.search(r"[぀-鿿]", label) else 0.62)
    rect(s, x, y, w, h, fill=fill, r=h / 2)
    text(ctx, s, x, y, w, h, label, size, color or t["on_primary"], True, "c", "m", bg=fill)
    return w


def new_slide(ctx, bg=None, notes=None):
    s = ctx.prs.slides.add_slide(ctx.prs.slide_layouts[6])
    ctx.page += 1
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = rgb(bg or ctx.t["bg"])
    if notes:
        s.notes_slide.notes_text_frame.text = notes
    # fade transition only (skill rule)
    tr = etree.SubElement(s._element, qn("p:transition"))
    tr.set("spd", "med")
    etree.SubElement(tr, qn("p:fade"))
    return s


def header(ctx, s, sp, dark=False):
    """Section tag → two-line conclusion title (accent run) → grey subtitle."""
    t = ctx.t
    ink = t["on_dark"] if dark else t["ink"]
    if sp.get("tag"):
        if t["title_bar"]:
            text(ctx, s, MX, 0.42, 6, 0.4, sp["tag"], F_MIN, t["accent_on_dark"] if dark else t["primary"], True)
        else:
            pill(ctx, s, MX, 0.4, sp["tag"], fill=t["accent_on_dark"] if dark else t["primary"],
                 color=t["dark1"] if dark else t["on_primary"])
    x = MX
    if t["title_bar"]:
        rect(s, MX, 0.92, 0.09, 0.95, fill=t["accent_on_dark"] if dark else t["primary"])
        x = MX + 0.28
    text(ctx, s, x, 0.85, W - x - MX, 1.1, sp.get("title", ""), F_TITLE, ink, True,
         accent=t["accent_on_dark"] if dark else t["title_accent"], spacing=1.05,
         bg=t["dark1"] if dark else t["bg"])
    if sp.get("subtitle"):
        text(ctx, s, x, 1.98, W - x - MX, 0.45, sp["subtitle"], F_MIN,
             t["accent_on_dark"] if dark else t["muted"], bg=t["dark1"] if dark else t["bg"])
    if len(re.sub(r"[\s*]", "", sp.get("title", ""))) > 28:
        LINT.append(f"P{ctx.page:02d} title over 28 characters — shorten to the conclusion")


def footer(ctx, s, sp, dark=False):
    t = ctx.t
    c = t["on_dark"] if dark else t["muted"]
    if sp.get("source"):
        text(ctx, s, MX, 6.95, 9.5, 0.4, "資料來源：" + sp["source"], F_MIN, c)
    foot = ctx.spec.get("footer")
    label = f"{foot}  ·  {ctx.page:02d}" if foot else f"{ctx.page:02d}"
    text(ctx, s, W - MX - 3.5, 6.95, 3.5, 0.4, label, F_MIN, c, align="r")


def glass(ctx, s, x, y, n=4, color=None):
    """Abstract translucent slabs — the 'glass plate' motif of dark covers."""
    color = color or ctx.t["accent_on_dark"]
    for i in range(n):
        rect(s, x + i * 0.45, y + i * 0.55, 3.0, 2.0, fill=color, line=color, lw=1.25,
             r=0.12, alpha=10 + i * 6, rot=-18)


def image(ctx, s, path, x, y, w=None, h=None):
    try:
        s.shapes.add_picture(path, Inches(x), Inches(y),
                             Inches(w) if w else None, Inches(h) if h else None)
    except Exception as e:  # missing / unsupported image: keep building
        LINT.append(f"P{ctx.page:02d} image not placed ({path}): {e}")


# --------------------------------------------------------------------------
# Charts (native, editable)
# --------------------------------------------------------------------------
def _chart_base(ctx, chart, legend=False):
    chart.has_title = False
    chart.font.size = Pt(F_MIN)
    chart.font.name = ctx.t["latin"]
    chart.font.color.rgb = rgb(ctx.t["muted"])
    chart.has_legend = legend
    if legend:
        chart.legend.include_in_layout = False
        chart.legend.font.size = Pt(F_MIN)


def _axes(ctx, chart, show_values=False):
    va = chart.value_axis
    va.has_major_gridlines = False
    va.visible = show_values
    va.tick_labels.font.size = Pt(F_MIN)
    ca = chart.category_axis
    ca.tick_labels.font.size = Pt(F_MIN)
    ca.format.line.color.rgb = rgb(ctx.t["track"])
    ca.has_major_gridlines = False


def series_colors(ctx):
    t = ctx.t
    return [t["primary"], t["accent"], t["highlight"], t["muted"]]


def bar_chart(ctx, s, x, y, w, h, cats, series, highlight=None, fmt='0'):
    cd = CategoryChartData()
    cd.categories = cats
    for se in series:
        cd.add_series(se["name"], se["values"])
    gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    ch = gf.chart
    _chart_base(ctx, ch, legend=len(series) > 1)
    _axes(ctx, ch)
    plot = ch.plots[0]
    plot.gap_width = 70
    plot.has_data_labels = True
    plot.data_labels.font.size = Pt(F_MIN)
    plot.data_labels.font.bold = True
    plot.data_labels.number_format = fmt
    plot.data_labels.number_format_is_linked = False
    plot.data_labels.position = XL_LABEL_POSITION.OUTSIDE_END
    cols = series_colors(ctx)
    for i, se in enumerate(plot.series):
        se.format.fill.solid()
        if len(series) == 1:
            se.format.fill.fore_color.rgb = rgb(ctx.t["track"])
            hi = len(cats) - 1 if highlight is None else highlight
            pt = se.points[hi]
            pt.format.fill.solid()
            pt.format.fill.fore_color.rgb = rgb(ctx.t["primary"])
        else:
            se.format.fill.fore_color.rgb = rgb(cols[i % 4])
        if ctx.t["card"] == "outline":
            se.format.line.color.rgb = rgb(ctx.t["ink"])
            se.format.line.width = Pt(1.5)
    if len(series) > 3:
        LINT.append(f"P{ctx.page:02d} bar chart has {len(series)} series — keep ≤ 3")
    return ch


def line_chart(ctx, s, x, y, w, h, cats, series, fmt='0'):
    cd = CategoryChartData()
    cd.categories = cats
    for se in series:
        cd.add_series(se["name"], se["values"])
    gf = s.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    ch = gf.chart
    _chart_base(ctx, ch, legend=len(series) > 1)
    if len(series) > 1:
        from pptx.enum.chart import XL_LEGEND_POSITION
        ch.legend.position = XL_LEGEND_POSITION.BOTTOM
    _axes(ctx, ch, show_values=True)
    ch.value_axis.format.line.fill.background()
    for i, se in enumerate(ch.plots[0].series):
        main = i == 0
        c = ctx.t["primary"] if main else ctx.t["track"] if len(series) == 2 else series_colors(ctx)[i % 4]
        se.format.line.color.rgb = rgb(c)
        se.format.line.width = Pt(4 if main else 2.25)
        se.smooth = False
        se.marker.style = XL_MARKER_STYLE.CIRCLE
        se.marker.size = 9 if main else 6
        se.marker.format.fill.solid()
        se.marker.format.fill.fore_color.rgb = rgb(c)
        se.marker.format.line.color.rgb = rgb(c)
    if len(series) > 4:
        LINT.append(f"P{ctx.page:02d} line chart has {len(series)} lines — keep ≤ 4")
    return ch


def doughnut(ctx, s, x, y, d, cats, values, colors, hole=58, labels=False, outline=None):
    cd = CategoryChartData()
    cd.categories = cats
    cd.add_series("s", values)
    gf = s.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Inches(x), Inches(y), Inches(d), Inches(d), cd)
    ch = gf.chart
    _chart_base(ctx, ch)
    plot = ch.plots[0]
    hs = plot._element.find(qn("c:holeSize"))
    if hs is None:
        hs = etree.SubElement(plot._element, qn("c:holeSize"))
    hs.set("val", str(hole))
    plot.has_data_labels = labels
    se = plot.series[0]
    for i, c in enumerate(colors):
        pt = se.points[i]
        pt.format.fill.solid()
        pt.format.fill.fore_color.rgb = rgb(c)
        pt.format.line.color.rgb = rgb(outline or ctx.t["surface"])
        pt.format.line.width = Pt(2 if outline else 1.5)
    return ch


# --------------------------------------------------------------------------
# Page patterns
# --------------------------------------------------------------------------
def p_cover(ctx, sp):
    """title, subtitle, tag, meta[list], image(path)"""
    t = ctx.t
    if t["cover"] == "dark":
        s = new_slide(ctx, t["dark1"], sp.get("notes"))
        gradient(s, 0, 0, W, H, t["dark1"], t["dark2"], 330)
        glass(ctx, s, 8.0, 1.0)
        ink, acc, bg = t["on_dark"], t["accent_on_dark"], t["dark1"]
        x0, y0 = MX + 0.2, 1.5
    else:
        s = new_slide(ctx, t["frame"], sp.get("notes"))
        if t["card"] == "outline":
            rect(s, 0.48, 0.5, W - 0.9, H - 0.9, fill=t["ink"], r=0.4)
        rect(s, 0.4, 0.4, W - 0.8, H - 0.8, fill=t["surface"],
             line=t["ink"] if t["card"] == "outline" else None, lw=2, r=0.4)
        ink, acc, bg = t["ink"], t["title_accent"], t["surface"]
        x0, y0 = MX + 0.5, 1.3
    if sp.get("tag"):
        pill(ctx, s, x0, y0 - 0.6, sp["tag"], fill=acc, color=t["dark1"] if t["cover"] == "dark" else t["on_primary"])
    text(ctx, s, x0, y0, 7.6, 2.4, sp.get("title", ""), F_COVER, ink, True, accent=acc, spacing=1.05, anchor="b", bg=bg)
    if sp.get("subtitle"):
        text(ctx, s, x0, y0 + 2.55, 7.6, 0.6, sp["subtitle"], 22, ink, bg=bg)
    meta = sp.get("meta", [])
    if meta:
        my = y0 + 3.45
        rect(s, x0, my, 0.05, 0.42 * len(meta), fill=acc)
        text(ctx, s, x0 + 0.25, my - 0.04, 7, 0.45 * len(meta), meta, F_MIN, ink, spacing=1.2, bg=bg)
    if sp.get("image"):
        image(ctx, s, sp["image"], 8.6, 1.4, h=4.6)
    return s


def p_agenda(ctx, sp):
    """title, items[{title, keywords}] (≤5)"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    gradient(s, 0, 0, 4.4, H, t["dark1"], t["dark2"], 300)
    glass(ctx, s, 0.2, 3.6, n=3)
    text(ctx, s, MX, 0.9, 3.4, 1.6, sp.get("title", "Contents"), 36, t["on_dark"], True, bg=t["dark1"])
    items = sp.get("items", [])[:5]
    step = (CB - 0.9) / max(1, len(items))
    for i, it in enumerate(items):
        y = 0.9 + i * step
        text(ctx, s, 5.0, y, 1.2, 0.8, f"{i + 1:02d}", 36, t["title_accent"], True)
        text(ctx, s, 6.3, y + 0.05, 6.4, 0.5, it["title"], 24, t["ink"], True)
        if it.get("keywords"):
            text(ctx, s, 6.3, y + 0.6, 6.4, 0.45, it["keywords"], F_MIN, t["muted"], body=True)
        if i < len(items) - 1:
            rect(s, 5.0, y + step - 0.12, W - 5.0 - MX, 0.015, fill=t["track"])
    footer(ctx, s, sp)
    return s


def p_section(ctx, sp):
    """number, tag, title, question"""
    t = ctx.t
    s = new_slide(ctx, t["dark1"], sp.get("notes"))
    gradient(s, 0, 0, W, H, t["dark1"], t["dark2"], 20)
    num = str(sp.get("number", ""))
    text(ctx, s, 6.2, -0.6, 7.0, 8.0, num, 400, t["accent_on_dark"], True, "r", "m")
    for sh in list(s.shapes)[-1:]:  # make the numeral translucent
        for r in sh.text_frame.paragraphs[0].runs:
            clr = r._r.find(qn("a:rPr")).find(qn("a:solidFill")).find(qn("a:srgbClr"))
            etree.SubElement(clr, qn("a:alpha")).set("val", "28000")
    if sp.get("tag"):
        pill(ctx, s, MX + 0.2, 2.3, sp["tag"], fill=t["accent_on_dark"], color=t["dark1"])
    text(ctx, s, MX + 0.2, 2.95, 7.5, 1.9, sp.get("title", ""), 44, t["on_dark"], True,
         accent=t["accent_on_dark"], spacing=1.05, bg=t["dark1"])
    if sp.get("question"):
        text(ctx, s, MX + 0.2, 4.95, 7, 0.6, sp["question"], 20, t["on_dark"], bg=t["dark1"])
    return s


def _metric(ctx, s, x, y, w, value, label, bg, color=None, size=F_KPI, align="l"):
    t = ctx.t
    text(ctx, s, x, y, w, 0.85, str(value), size, color or t["title_accent"], True, align, "b", bg=bg)
    text(ctx, s, x, y + 0.9, w, 0.5, label, F_MIN, t["muted"] if bg != t["primary"] else t["on_primary"], align=align, bg=bg, body=True)


def p_problem(ctx, sp):
    """tag,title,subtitle, layout: columns|stack,
    issues[{title, text, value, label}], statement (stack only)"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    issues = sp.get("issues", [])[:3]
    if sp.get("layout", "columns") == "columns":
        n = len(issues)
        gap = 0.35
        cw = (W - 2 * MX - gap * (n - 1)) / n
        for i, it in enumerate(issues):
            x = MX + i * (cw + gap)
            if t["card"] == "outline":
                card(ctx, s, x, CT, cw, 4.1)
            else:
                rect(s, x, CT, cw, 4.1, fill=t["surface"], line=t["track"], lw=1, r=t["radius"])
            gradient(s, x, CT, cw, 1.9, t["dark1"], t["dark2"], 315, r=t["radius"])
            text(ctx, s, x + 0.3, CT + 0.2, cw - 0.6, 0.4, f"Problem {i + 1:02d}", F_MIN, t["accent_on_dark"], True, bg=t["dark1"])
            text(ctx, s, x + 0.3, CT + 0.7, cw - 0.6, 1.1, it["title"], 24, t["on_dark"], True, bg=t["dark1"])
            if it.get("text"):
                text(ctx, s, x + 0.3, CT + 2.15, cw - 0.6, 0.8, it["text"], F_MIN, t["muted"], bg=t["surface"], body=True)
            if it.get("value") is not None:
                text(ctx, s, x + 0.3, CT + 2.95, cw - 0.6, 0.95, str(it["value"]), F_KPI, t["title_accent"], True, "r", "b", bg=t["surface"])
    else:
        st = sp.get("statement", "")
        card(ctx, s, MX, CT, 6.0, 1.8, fill=t["surface2"])
        text(ctx, s, MX + 0.35, CT + 0.2, 5.3, 1.4, st, 24, t["title_accent"], True, "c", "m", bg=t["surface2"], body=True)
        mw = 6.0 / max(1, len(issues))
        for i, it in enumerate(issues):
            x = MX + i * mw
            if i:
                rect(s, x, CT + 2.25, 0.02, 1.7, fill=t["track"])
            text(ctx, s, x + 0.2, CT + 2.25, mw - 0.3, 0.5, it.get("label", ""), F_MIN, t["muted"], bg=t["bg"])
            val = str(it.get("value", ""))
            text(ctx, s, x + 0.2, CT + 2.8, mw - 0.3, 1.0, val, F_KPI if len(val) <= 3 else 36, t["title_accent"], True, bg=t["bg"])
        ch = (CB - CT - 0.3) / max(1, len(issues))
        for i, it in enumerate(issues):
            y = CT + i * ch
            card(ctx, s, 7.0, y, W - 7.0 - MX, ch - 0.15)
            text(ctx, s, 7.3, y + 0.15, W - 7.6 - MX, 0.5, it["title"], F_CARD, t["primary"], True, bg=card_fill(ctx, False))
            if it.get("text"):
                text(ctx, s, 7.3, y + 0.62, W - 7.6 - MX, ch - 0.85, it["text"], F_MIN, t["muted"], bg=card_fill(ctx, False), body=True)
    footer(ctx, s, sp)
    return s


def p_cards(ctx, sp):
    """tag,title,subtitle, items[{title, text, value}] (2–6), highlight(idx),
    effects[{label, value, trend: up|down}] → dashed band"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    items = sp.get("items", [])[:6]
    effects = sp.get("effects")
    n = len(items)
    cols = n if n <= 4 else 3
    rows = 1 if n <= 4 else 2
    bottom = CB - (1.9 if effects else 0)
    gap = 0.3
    cw = (W - 2 * MX - gap * (cols - 1)) / cols
    chh = (bottom - CT - gap * (rows - 1)) / rows
    for i, it in enumerate(items):
        r_, c_ = divmod(i, cols)
        x, y = MX + c_ * (cw + gap), CT + r_ * (chh + gap)
        emph = sp.get("highlight") == i
        card(ctx, s, x, y, cw, chh, emphasis=emph)
        bg = card_fill(ctx, emph)
        ink = t["on_primary"] if emph else t["ink"]
        badge(ctx, s, x + 0.3, y + 0.3, 0.55, f"{i + 1:02d}",
              fill=t["highlight"] if emph else t["accent"], color=t["on_accent"] if not emph else t["ink"])
        tight = bool(it.get("value")) and chh < 3.2
        text(ctx, s, x + 0.3, y + (0.95 if tight else 1.0), cw - 0.6, 0.55, it["title"], F_CARD, ink, True, bg=bg)
        if it.get("text"):
            text(ctx, s, x + 0.3, y + (1.45 if tight else 1.75), cw - 0.6, 0.6 if tight else chh - 1.9, it["text"], F_MIN,
                 t["on_primary"] if emph else t["muted"], bg=bg, body=True)
        if it.get("value"):
            vy = y + chh - 0.62
            rect(s, x + 0.25, vy, cw - 0.5, 0.48, fill=t["surface"] if t["card"] == "soft" or emph else t["surface2"], r=0.1)
            text(ctx, s, x + 0.25, vy, cw - 0.5, 0.48, it["value"], F_MIN, t["primary"], True, "c", "m",
                 bg=t["surface"] if t["card"] == "soft" or emph else t["surface2"], body=True)
    if effects:
        by = CB - 1.3
        card(ctx, s, MX + 1.0, by, W - 2 * MX - 2.0, 1.3, dashed=True)
        lbl = sp.get("effects_label", "預期效果")
        lw_ = 0.5 + 0.2 * len(lbl)
        rect(s, W / 2 - lw_ / 2, by - 0.22, lw_, 0.44, fill=t["bg"])
        text(ctx, s, W / 2 - lw_ / 2, by - 0.22, lw_, 0.44, lbl, F_MIN, t["ink"], True, "c", "m")
        ew = (W - 2 * MX - 2.6) / len(effects)
        for i, e in enumerate(effects):
            ex = MX + 1.3 + i * ew
            pill(ctx, s, ex + 0.1, by + 0.15, e["label"], fill=t["primary"])
            arrow = {"up": " ↑", "down": " ↓"}.get(e.get("trend"), "")
            text(ctx, s, ex, by + 0.6, ew - 0.2, 0.65, f"{e['value']}{arrow}", 32, t["title_accent"], True, "l", "m")
    footer(ctx, s, sp)
    return s


def p_process(ctx, sp):
    """tag,title,subtitle, steps[{label, title, text}] (3–6)"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    steps = sp.get("steps", [])[:6]
    n = len(steps)
    aw = 0.45
    cw = (W - 2 * MX - aw * (n - 1)) / n
    y, h = CT + 0.45, CB - CT - 0.7
    for i, st in enumerate(steps):
        x = MX + i * (cw + aw)
        last = i == n - 1
        card(ctx, s, x, y, cw, h, emphasis=last and sp.get("highlight_last", False))
        bg = card_fill(ctx, last and sp.get("highlight_last", False))
        ink = t["on_primary"] if bg == t["primary"] else t["ink"]
        badge(ctx, s, x + cw / 2 - 0.35, y - 0.35, 0.7, str(i + 1),
              fill=t["primary"], color=t["on_primary"])
        if st.get("label"):
            lab = st["label"].upper() if len(st["label"]) * 0.17 < cw - 0.3 else st["label"]
            text(ctx, s, x + 0.05, y + 0.55, cw - 0.1, 0.4, lab, F_MIN,
                 t["on_primary"] if bg == t["primary"] else t["title_accent"], True, "c", bg=bg)
        text(ctx, s, x + 0.15, y + 1.0, cw - 0.3, 0.9, st["title"], F_CARD, ink, True, "c", bg=bg)
        if st.get("text"):
            text(ctx, s, x + 0.2, y + 1.85, cw - 0.4, h - 2.0, st["text"], F_MIN,
                 t["on_primary"] if bg == t["primary"] else t["muted"], align="c", bg=bg, body=True)
        if not last:
            shape(s, MSO_SHAPE.CHEVRON, x + cw + 0.1, y + h / 2 - 0.2, aw - 0.2, 0.4, fill=t["accent"])
    footer(ctx, s, sp)
    return s


def p_roadmap(ctx, sp):
    """tag,title,subtitle, phases[{period, title, items[]}], kpis[{value,label}]"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    ph = sp.get("phases", [])[:5]
    kpis = sp.get("kpis")
    n = len(ph)
    gap = 0.25
    cw = (W - 2 * MX - gap * (n - 1)) / n
    bottom = CB - (1.4 if kpis else 0)
    shape(s, MSO_SHAPE.RIGHT_ARROW, MX, CT, W - 2 * MX, 0.32, fill=t["track"])
    tints = [t["highlight"], t["accent"], t["primary"], t["dark2"], t["dark1"]]
    for i, p in enumerate(ph):
        x = MX + i * (cw + gap)
        fill = tints[min(len(tints) - 1, i * (len(tints) - 1) // max(1, n - 1))] if n > 1 else t["primary"]
        on = t["on_primary"] if contrast(t["on_primary"], fill) >= 4.5 else t["ink"]
        rect(s, x, CT + 0.5, cw, 0.6, fill=fill, r=0.08)
        text(ctx, s, x, CT + 0.5, cw, 0.6, p["period"], F_MIN, on, True, "c", "m", bg=fill)
        card(ctx, s, x, CT + 1.25, cw, bottom - CT - 1.25)
        bg = card_fill(ctx, False)
        text(ctx, s, x + 0.2, CT + 1.4, cw - 0.4, 0.8, p["title"], F_CARD, t["ink"], True, bg=bg)
        if p.get("items"):
            text(ctx, s, x + 0.2, CT + 2.2, cw - 0.4, bottom - CT - 2.3, ["· " + it for it in p["items"]],
                 F_MIN, t["muted"], bg=bg, body=True)
    if kpis:
        kw = (W - 2 * MX) / len(kpis)
        for i, k in enumerate(kpis):
            x = MX + i * kw
            text(ctx, s, x, CB - 1.25, kw - 0.2, 0.45, k["label"], F_MIN, t["muted"], align="c", bg=t["bg"])
            text(ctx, s, x, CB - 0.85, kw - 0.2, 0.85, str(k["value"]), 36, t["title_accent"], True, "c", bg=t["bg"])
    footer(ctx, s, sp)
    return s


def p_kpi(ctx, sp):
    """tag,title,subtitle, style: tile|ring, items[{value, unit, label, sub, percent}]"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    items = sp.get("items", [])[:4]
    n = len(items)
    gap = 0.4
    cw = (W - 2 * MX - gap * (n - 1)) / n
    for i, k in enumerate(items):
        x = MX + i * (cw + gap)
        if sp.get("style") == "ring" and k.get("percent") is not None:
            pill(ctx, s, x + cw / 2 - 0.2 - 0.1 * len(k["label"]), CT, k["label"])
            d = min(cw - 0.4, 3.2)
            cx = x + (cw - d) / 2
            doughnut(ctx, s, cx, CT + 0.6, d, ["v", "rest"], [k["percent"], 100 - k["percent"]],
                     [t["primary"], t["track"]], hole=72)
            text(ctx, s, cx, CT + 0.6, d, d, f"{k['value']}{k.get('unit', '')}", 30 if d < 2.6 else 36, t["title_accent"], True, "c", "m")
            if k.get("sub"):
                text(ctx, s, x, CT + 0.75 + d, cw, 0.5, k["sub"], F_MIN, t["muted"], align="c", body=True)
        else:
            emph = sp.get("highlight") == i
            card(ctx, s, x, CT + 0.2, cw, CB - CT - 0.4, emphasis=emph)
            bg = card_fill(ctx, emph)
            val = f"{k['value']}**{k.get('unit', '')}**" if k.get("unit") else str(k["value"])
            text(ctx, s, x + 0.3, CT + 0.6, cw - 0.6, 1.3, val, 60, t["on_primary"] if emph else t["title_accent"], True,
                 accent=t["on_primary"] if emph else t["title_accent"], anchor="b", bg=bg)
            text(ctx, s, x + 0.3, CT + 2.05, cw - 0.6, 0.6, k["label"], F_CARD, t["on_primary"] if emph else t["ink"], True, bg=bg)
            if k.get("sub"):
                text(ctx, s, x + 0.3, CT + 2.7, cw - 0.6, 1.4, k["sub"], F_MIN, t["on_primary"] if emph else t["muted"], bg=bg, body=True)
    footer(ctx, s, sp)
    return s


def _insight(ctx, s, sp, x, y, w, h):
    t = ctx.t
    ins = sp.get("insight")
    if not ins:
        return
    card(ctx, s, x, y, w, h, emphasis=True)
    text(ctx, s, x + 0.3, y + 0.3, w - 0.6, 0.45, ins.get("label", ""), F_MIN, t["on_primary"], bg=t["primary"])
    text(ctx, s, x + 0.3, y + 0.75, w - 0.6, 1.1, str(ins.get("value", "")), F_KPI, t["on_primary"], True, bg=t["primary"])
    if ins.get("notes"):
        text(ctx, s, x + 0.3, y + 1.95, w - 0.6, h - 2.1, ["· " + n for n in ins["notes"]], F_MIN, t["on_primary"],
             bg=t["primary"], body=True)


def p_bar(ctx, sp):
    """tag,title,subtitle, categories, series[{name, values}], highlight, insight{label,value,notes}, source, format"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    left = 3.9 if sp.get("insight") else 0
    _insight(ctx, s, sp, MX, CT, left - 0.35, CB - CT)
    card(ctx, s, MX + left, CT, W - 2 * MX - left, CB - CT, fill=t["surface"])
    bar_chart(ctx, s, MX + left + 0.25, CT + 0.2, W - 2 * MX - left - 0.5, CB - CT - 0.4,
              sp["categories"], sp["series"], sp.get("highlight"), sp.get("format", "0"))
    if not sp.get("source"):
        LINT.append(f"P{ctx.page:02d} chart without a source")
    footer(ctx, s, sp)
    return s


def p_line(ctx, sp):
    """tag,title,subtitle, categories, series[{name, values}] (first = focus),
    callout{value, label}, side{title, points[]}, source, format"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    side = sp.get("side")
    cw = W - 2 * MX - (4.0 if side else 0)
    card(ctx, s, MX, CT, cw, CB - CT, fill=t["surface"])
    if t["card"] != "outline":
        rect(s, MX, CT, cw, CB - CT, line=t["accent"], lw=1.5, r=t["radius"])
    line_chart(ctx, s, MX + 0.3, CT + 0.85, cw - 0.6, CB - CT - 1.05, sp["categories"], sp["series"], sp.get("format", "0"))
    co = sp.get("callout")
    if co:
        text(ctx, s, MX + cw - 3.7, CT + 0.1, 3.4, 0.85, str(co["value"]), F_KPI, t["title_accent"], True, "r", bg=t["surface"])
        text(ctx, s, MX + 0.35, CT + 0.25, cw - 4.2, 0.5, co.get("label", ""), F_MIN, t["muted"], bg=t["surface"])
    if side:
        x = MX + cw + 0.35
        text(ctx, s, x, CT, 3.65, 0.6, side["title"], F_CARD, t["ink"], True)
        for i, ptxt in enumerate(side.get("points", [])[:4]):
            y = CT + 0.8 + i * 1.0
            badge(ctx, s, x, y, 0.5, str(i + 1), fill=t["primary"], color=t["on_primary"])
            text(ctx, s, x + 0.65, y, 3.0, 0.9, ptxt, F_MIN, t["ink"], bg=t["bg"], body=True)
    if not sp.get("source"):
        LINT.append(f"P{ctx.page:02d} chart without a source")
    footer(ctx, s, sp)
    return s


def p_pie(ctx, sp):
    """tag,title,subtitle, categories, values, focus(idx), center{value,label}, source"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    cats, vals = sp["categories"], sp["values"]
    if len(cats) > 5:
        LINT.append(f"P{ctx.page:02d} pie has {len(cats)} slices — merge into ≤ 5 (others)")
    total = sum(vals) or 1
    focus = sp.get("focus", max(range(len(vals)), key=lambda i: vals[i]))
    neutrals = [t["track"], t["surface2"], t["highlight"], t["accent"]]
    colors, k = [], 0
    for i in range(len(vals)):
        if i == focus:
            colors.append(t["primary"])
        else:
            colors.append(neutrals[k % len(neutrals)])
            k += 1
    d = CB - CT
    doughnut(ctx, s, MX + 0.4, CT, d, cats, vals, colors, hole=55,
             outline=t["ink"] if t["card"] == "outline" else None)
    c = sp.get("center")
    if c:
        text(ctx, s, MX + 0.4, CT + d / 2 - 0.65, d, 0.8, str(c["value"]), 40, t["title_accent"], True, "c", "m")
        text(ctx, s, MX + 0.4, CT + d / 2 + 0.15, d, 0.45, c.get("label", ""), F_MIN, t["muted"], align="c")
    lx = MX + d + 1.2
    rh = min(0.85, (CB - CT) / len(cats))
    for i, (cat, v) in enumerate(zip(cats, vals)):
        y = CT + 0.2 + i * rh
        emph = i == focus
        rect(s, lx, y + 0.12, 0.32, 0.32, fill=colors[i], line=t["ink"], lw=1, r=0.06)
        text(ctx, s, lx + 0.5, y, 4.6, 0.6, cat, F_CARD if emph else F_MIN, t["ink"], emph, anchor="m", body=True)
        text(ctx, s, W - MX - 1.8, y, 1.8, 0.6, f"{v / total * 100:.0f}%", 28 if emph else 20,
             t["title_accent"] if emph else t["muted"], True, "r", "m")
    if not sp.get("source"):
        LINT.append(f"P{ctx.page:02d} chart without a source")
    footer(ctx, s, sp)
    return s


def p_table(ctx, sp):
    """tag,title,subtitle, columns[], rows[[...]], highlight_row(idx), source"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    cols, rows = sp["columns"], sp["rows"]
    if len(cols) > 5 or len(rows) > 6:
        LINT.append(f"P{ctx.page:02d} table {len(cols)}×{len(rows)} — keep ≤ 5 columns × 6 rows")
    rh = min(0.75, (CB - CT) / (len(rows) + 1))
    gf = s.shapes.add_table(len(rows) + 1, len(cols), Inches(MX), Inches(CT), Inches(W - 2 * MX), Inches(rh * (len(rows) + 1)))
    tbl = gf.table
    tblPr = tbl._tbl.tblPr
    for attr in ("bandRow", "firstRow"):
        tblPr.set(attr, "0")
    style = tblPr.find(qn("a:tableStyleId"))
    if style is not None:
        tblPr.remove(style)

    def is_num(v):
        return bool(re.fullmatch(r"[\s+\-−]?[\d.,]+\s*[%A-Za-z兆億萬人年月倍x]*", str(v)))

    hi = sp.get("highlight_row")
    for r in range(len(rows) + 1):
        tbl.rows[r].height = Inches(rh)
        for c in range(len(cols)):
            cell = tbl.cell(r, c)
            val = cols[c] if r == 0 else rows[r - 1][c]
            if r == 0:
                fill, color, bold = t["primary"], t["on_primary"], True
            elif hi == r - 1:
                fill, color, bold = t["highlight"], t["ink"], True
            else:
                fill = t["surface"] if r % 2 else t["surface2"]
                color, bold = t["ink"], c == 0
            cell.fill.solid()
            cell.fill.fore_color.rgb = rgb(fill)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left = cell.margin_right = Inches(0.15)
            tf = cell.text_frame
            tf.text = ""
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.RIGHT if (r and c and is_num(val)) else PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER
            run = p.add_run()
            run.text = str(val)
            _font(run, ctx, F_MIN, color, bold)
            if contrast(color, fill) < 4.5:
                LINT.append(f"P{ctx.page:02d} table contrast {contrast(color, fill):.2f}:1")
    footer(ctx, s, sp)
    return s


def p_venn(ctx, sp):
    """tag,title,subtitle, sets[{title, text}] (2|3), center"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    sets = sp.get("sets", [])[:3]
    fills = [t["primary"], t["accent"], t["highlight"]]
    d = 3.0 if len(sets) == 3 else 3.6
    cx = W / 2
    if len(sets) == 2:
        pos = [(cx - d + 0.55, CT + 0.35), (cx - 0.55, CT + 0.35)]
        tpos = [(pos[0][0] + 0.25, pos[0][1] + d / 2 - 0.6, "l"), (pos[1][0] + d - 2.15, pos[1][1] + d / 2 - 0.6, "r")]
        ccen = (cx - 0.9, CT + 0.35 + d / 2 - 0.4)
    else:
        pos = [(cx - d / 2, CT - 0.05), (cx - d + 0.35, CT + 1.25), (cx - 0.35, CT + 1.25)]
        tpos = [(pos[0][0] + 0.4, pos[0][1] + 0.3, "c"), (pos[1][0] + 0.15, pos[1][1] + 1.55, "l"),
                (pos[2][0] + d - 2.35, pos[2][1] + 1.55, "r")]
        ccen = (cx - 0.9, CT + 1.45)
    for i, (x, y) in enumerate(pos):
        shape(s, MSO_SHAPE.OVAL, x, y, d, d, fill=fills[i], alpha=30,
              line=t["ink"] if t["card"] == "outline" else fills[i], lw=2 if t["card"] == "outline" else 1.5)
    for i, st in enumerate(sets):
        x, y, al = tpos[i]
        w = 2.2
        text(ctx, s, x, y, w, 0.5, st["title"], F_CARD, t["ink"], True, al)
        if st.get("text"):
            text(ctx, s, x, y + 0.5, w, 0.9, st["text"], F_MIN, t["ink"], align=al, body=True)
    if sp.get("center"):
        text(ctx, s, ccen[0], ccen[1], 1.8, 0.8, sp["center"], F_MIN, t["ink"], True, "c", "m")
    footer(ctx, s, sp)
    return s


def p_hub(ctx, sp):
    """tag,title,subtitle, center, nodes[{title, text}] (4)"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    cx, cy = W / 2, (CT + CB) / 2
    shape(s, MSO_SHAPE.OVAL, cx - 1.9, cy - 1.9, 3.8, 3.8, line=t["accent"], lw=10)
    shape(s, MSO_SHAPE.OVAL, cx - 1.35, cy - 1.35, 2.7, 2.7, fill=t["primary"],
          line=t["ink"] if t["card"] == "outline" else None, lw=2)
    text(ctx, s, cx - 1.2, cy - 1.0, 2.4, 2.0, sp.get("center", ""), F_CARD, t["on_primary"], True, "c", "m", bg=t["primary"])
    nodes = sp.get("nodes", [])[:4]
    spots = [(MX, CT + 0.1, "l"), (W - MX - 3.9, CT + 0.1, "l"), (MX, CB - 1.75, "l"), (W - MX - 3.9, CB - 1.75, "l")]
    dots = [(cx - 1.75, cy - 1.45), (cx + 1.25, cy - 1.45), (cx - 1.75, cy + 0.95), (cx + 1.25, cy + 0.95)]
    for i, nd in enumerate(nodes):
        x, y, _ = spots[i]
        card(ctx, s, x, y, 3.9, 1.65)
        bg = card_fill(ctx, False)
        text(ctx, s, x + 0.25, y + 0.15, 3.4, 0.5, nd["title"], F_CARD, t["primary"], True, bg=bg)
        if nd.get("text"):
            text(ctx, s, x + 0.25, y + 0.68, 3.4, 0.9, nd["text"], F_MIN, t["muted"], bg=bg, body=True)
        dx, dy = dots[i]
        badge(ctx, s, dx, dy, 0.5, str(i + 1), fill=t["highlight"], color=t["ink"])
    footer(ctx, s, sp)
    return s


def p_before_after(ctx, sp):
    """tag,title,subtitle, before{title, items[]}, after{title, items[]}, metrics[{label, value}]"""
    t = ctx.t
    s = new_slide(ctx, t["bg"], sp.get("notes"))
    header(ctx, s, sp)
    mets = sp.get("metrics")
    bottom = CB - (1.35 if mets else 0)
    pw = (W - 2 * MX - 1.2) / 2
    grey = "#eef0f2" if t["card"] != "outline" else t["surface2"]
    for side, x, emph in (("before", MX, False), ("after", MX + pw + 1.2, True)):
        d = sp.get(side, {})
        fill = t["surface2"] if emph else grey
        card(ctx, s, x, CT + 0.25, pw, bottom - CT - 0.25, fill=fill)
        pill(ctx, s, x + 0.3, CT, side.upper(), fill=t["primary"] if emph else t["muted"])
        text(ctx, s, x + 0.35, CT + 0.6, pw - 0.7, 0.6, d.get("title", ""), 24, t["primary"] if emph else t["ink"], True, bg=fill)
        text(ctx, s, x + 0.35, CT + 1.3, pw - 0.7, bottom - CT - 1.5, ["· " + i for i in d.get("items", [])],
             F_MIN, t["ink"], bg=fill, spacing=1.3, body=True)
    shape(s, MSO_SHAPE.RIGHT_ARROW, MX + pw + 0.25, (CT + bottom) / 2 - 0.35, 0.7, 0.7, fill=t["accent"])
    if mets:
        mw = (W - 2 * MX) / len(mets)
        for i, m in enumerate(mets):
            x = MX + i * mw
            if i:
                rect(s, x, CB - 1.1, 0.02, 1.0, fill=t["track"])
            text(ctx, s, x, CB - 1.15, mw, 0.45, m["label"], F_MIN, t["muted"], align="c", bg=t["bg"])
            text(ctx, s, x, CB - 0.75, mw, 0.75, str(m["value"]), 36, t["title_accent"], True, "c", bg=t["bg"])
    footer(ctx, s, sp)
    return s


def p_closing(ctx, sp):
    """title, subtitle, contact[], image"""
    t = ctx.t
    s = new_slide(ctx, t["dark1"], sp.get("notes"))
    gradient(s, 0, 0, W, H, t["dark1"], t["dark2"], 330)
    glass(ctx, s, 8.6, 2.2, n=3)
    text(ctx, s, MX + 0.2, 1.7, 8, 2.2, sp.get("title", ""), F_COVER, t["on_dark"], True,
         accent=t["accent_on_dark"], anchor="b", spacing=1.05, bg=t["dark1"])
    if sp.get("subtitle"):
        text(ctx, s, MX + 0.2, 4.05, 8, 0.6, sp["subtitle"], 22, t["on_dark"], bg=t["dark1"])
    if sp.get("contact"):
        rect(s, MX + 0.2, 4.95, 0.05, 0.42 * len(sp["contact"]), fill=t["accent_on_dark"])
        text(ctx, s, MX + 0.45, 4.9, 8, 0.45 * len(sp["contact"]), sp["contact"], F_MIN, t["on_dark"], spacing=1.2, bg=t["dark1"])
    if sp.get("image"):
        image(ctx, s, sp["image"], 9.0, 2.0, h=4.0)
    return s


PATTERNS = {
    "cover": p_cover, "agenda": p_agenda, "section": p_section, "problem": p_problem,
    "cards": p_cards, "process": p_process, "roadmap": p_roadmap, "kpi": p_kpi,
    "bar": p_bar, "line": p_line, "pie": p_pie, "table": p_table, "venn": p_venn,
    "hub": p_hub, "before_after": p_before_after, "closing": p_closing,
}
NO_BODY_RULE = {"cover", "agenda", "section", "closing"}


def build(spec: dict, out: str) -> list[str]:
    LINT.clear()
    theme = deepcopy(THEMES[spec.get("theme", "deep_blue")])
    if spec.get("font"):
        theme.update({k: v for k, v in spec["font"].items() if k in ("latin", "ea")})
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(W), Inches(H)
    ctx = Ctx(prs, theme, spec)
    for sp in spec["slides"]:
        kind = sp.get("type")
        if kind not in PATTERNS:
            raise SystemExit(f"unknown slide type {kind!r}; choose from {', '.join(PATTERNS)}")
        ctx.body_chars = 0
        PATTERNS[kind](ctx, sp)
        if kind not in NO_BODY_RULE and ctx.body_chars > 20 * spec.get("body_char_factor", 2):
            LINT.append(f"P{ctx.page:02d} {kind}: {ctx.body_chars} body characters — aim for ~20, split or cut")
    prs.save(out)
    return list(LINT)


def main(argv):
    if len(argv) > 1 and argv[1] == "--list":
        print("themes:  ", ", ".join(THEMES))
        for k, f in PATTERNS.items():
            print(f"{k:13s}", (f.__doc__ or "").strip().replace("\n", " "))
        return 0
    if len(argv) != 3:
        print(__doc__)
        return 2
    spec = json.load(open(argv[1], encoding="utf-8"))
    issues = build(spec, argv[2])
    print(f"[OK] {argv[2]} — {len(spec['slides'])} slides, theme {spec.get('theme', 'deep_blue')}")
    for i in issues:
        print("[LINT]", i)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
