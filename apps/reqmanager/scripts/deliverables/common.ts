// 交付文件（框線圖、使用者操作圖）共用：頁面外框、樣式、流程圖排版。

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function page(title: string, subtitle: string, nav: { id: string; label: string }[], body: string, extraCss = ''): string {
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
:root {
  --bg: #f5f6f8; --surface: #fff; --border: #eaecf0; --border-strong: #d0d5dd; --text: #1d2939; --text-2: #475467; --muted: #667085;
  --primary: #2f6fed; --primary-weak: #eaf1fe; --anno: #f97316; --danger: #d92d20; --warn-bg: #fef0c7; --warn: #93370d; --ok: #067647;
  font-family: 'Noto Sans TC', 'Noto Sans CJK TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif;
  color: var(--text); font-size: 15px; line-height: 1.55;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
a { color: var(--primary); }
.doc-head { background: var(--surface); border-bottom: 1px solid var(--border); padding: 28px 16px 0; }
.doc-head .inner, .doc-main { max-width: 1320px; margin: 0 auto; }
.doc-head h1 { margin: 0; font-size: 26px; }
.doc-head p { margin: 6px 0 16px; color: var(--muted); }
.toc { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 0; }
.toc a { padding: 10px 12px; color: var(--text-2); text-decoration: none; white-space: nowrap; border-bottom: 2px solid transparent; font-size: 14px; }
.toc a:hover { color: var(--primary); border-bottom-color: var(--primary); }
.doc-main { padding: 24px 16px 64px; }
section.sheet { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 28px; scroll-margin-top: 16px; overflow: hidden; }
.sheet-head { display: flex; align-items: baseline; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.sheet-head .id { font-weight: 700; color: var(--anno); }
.sheet-head h2 { margin: 0; font-size: 20px; }
.sheet-head .meta { color: var(--muted); font-size: 13px; margin-left: auto; }
.sheet-body { display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
.sheet-body > .canvas-wrap { padding: 20px; background: #eef0f3; border-right: 1px solid var(--border); min-width: 0; }
.notes { padding: 20px 22px; font-size: 14px; }
.notes ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.notes li { display: flex; gap: 10px; }
.notes .ref { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
.n { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--anno); color: #fff; font-size: 12px; font-weight: 700; font-style: normal; line-height: 1; }
.legend-row { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: var(--text-2); padding: 12px 22px; border-top: 1px solid var(--border); background: #fafbfc; }
.legend-row span { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 900px) { .sheet-body { grid-template-columns: 1fr; } .sheet-body > .canvas-wrap { border-right: none; border-bottom: 1px solid var(--border); padding: 12px; } }
@media print { body { background: #fff; } .doc-head .toc { display: none; } section.sheet { break-inside: avoid; page-break-inside: avoid; } }
${extraCss}
</style>
</head>
<body>
<header class="doc-head"><div class="inner">
<h1>${esc(title)}</h1>
<p>${subtitle}</p>
<nav class="toc">${nav.map(n => `<a href="#${n.id}">${esc(n.label)}</a>`).join('')}</nav>
</div></header>
<main class="doc-main">
${body}
</main>
</body>
</html>
`
}

// ─── 流程圖排版：節點放在格子上，連線自動走直角 ─────────────────────────

export interface FNode {
  id: string
  label: string
  col: number
  row: number
  kind?: 'step' | 'screen' | 'decision' | 'start' | 'end' | 'system' | 'status' | 'note'
  /** 狀態節點配色 */
  fg?: string
  bg?: string
  w?: number
}

export interface FEdge {
  from: string
  to: string
  label?: string
  /** 'h' 先水平後垂直（預設）；'v' 先垂直後水平；'loop-down'／'loop-up' 從下方或上方繞回 */
  route?: 'h' | 'v' | 'loop-down' | 'loop-up'
  dashed?: boolean
  tone?: 'normal' | 'back' | 'ok'
  /** 標籤沿線位置 0–1 */
  at?: number
  /** 手動路徑：以格子座標（欄, 列；可為小數，整數＝格子中心）列出轉折點 */
  path?: [number, number][]
}

export interface FlowOpts {
  cellW?: number
  cellH?: number
  lanes?: { label: string; rows: number }[]
  cols?: number
  rows?: number
  title?: string
  laneW?: number
  colHeads?: string[]
}

export function flow(nodes: FNode[], edges: FEdge[], o: FlowOpts = {}): string {
  const cw = o.cellW ?? 190
  const ch = o.cellH ?? 96
  const laneW = o.lanes ? o.laneW ?? 96 : 0
  // 上方保留空間給繞行的連線與標籤
  const headH = o.colHeads ? 40 : 30
  const cols = o.cols ?? Math.max(...nodes.map(n => n.col)) + 1
  const rows = o.rows ?? (o.lanes ? o.lanes.reduce((s, l) => s + l.rows, 0) : Math.max(...nodes.map(n => n.row)) + 1)
  const W = laneW + cols * cw + 16
  const H = headH + rows * ch + 16
  const cx = (n: FNode) => laneW + n.col * cw + cw / 2
  const cy = (n: FNode) => headH + n.row * ch + ch / 2
  // 依文字長度決定節點寬度，避免文字超出框線
  const textW = (label: string) => Math.max(...label.split('\n').map(l => [...l].reduce((s2, c) => s2 + (c.charCodeAt(0) > 255 ? 13.5 : 7.8), 0)))
  const size = (n: FNode) => {
    const tw = textW(n.label)
    if (n.kind === 'decision') return { w: Math.min(cw - 10, Math.max(132, tw * 1.7 + 20)), h: 64 }
    if (n.kind === 'start' || n.kind === 'end') return { w: Math.min(cw - 10, Math.max(104, tw + 30)), h: 36 }
    if (n.kind === 'status') return { w: Math.min(cw - 10, Math.max(n.w ?? 112, tw + 32)), h: 38 }
    return { w: Math.min(cw - 10, Math.max(n.w ?? cw - 36, tw + 22)), h: n.label.includes('\n') ? 56 : 52 }
  }
  const byId = new Map(nodes.map(n => [n.id, n]))
  const out: string[] = []
  out.push(`<svg class="flow" viewBox="0 0 ${W} ${H}" style="max-width:${W}px" role="img" aria-label="${esc(o.title ?? '流程圖')}" xmlns="http://www.w3.org/2000/svg">`)
  out.push(`<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#475467"/></marker>
<marker id="ah-back" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d92d20"/></marker>
<marker id="ah-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#067647"/></marker>
</defs>`)
  // 泳道
  if (o.lanes) {
    let r = 0
    o.lanes.forEach((l, i) => {
      const y = headH + r * ch
      const h = l.rows * ch
      out.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${i % 2 ? '#fafbfc' : '#ffffff'}"/>`)
      out.push(`<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="#eaecf0"/>`)
      out.push(`<rect x="0" y="${y}" width="${laneW}" height="${h}" fill="#f2f4f7"/>`)
      out.push(`<text x="${laneW / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#1d2939">${esc(l.label)}</text>`)
      r += l.rows
    })
    out.push(`<line x1="${laneW}" x2="${laneW}" y1="${headH}" y2="${H}" stroke="#d0d5dd"/>`)
  }
  if (o.colHeads) {
    out.push(`<rect x="0" y="0" width="${W}" height="${headH}" fill="#1d2939"/>`)
    o.colHeads.forEach((h, i) => out.push(`<text x="${laneW + i * cw + cw / 2}" y="25" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${esc(h)}</text>`))
  }
  // 連線（先畫在節點下方）
  const labels: string[] = []
  for (const e of edges) {
    const a = byId.get(e.from)!
    const b = byId.get(e.to)!
    if (!a || !b) throw new Error(`edge ${e.from} → ${e.to}`)
    const sa = size(a)
    const sb = size(b)
    const ax = cx(a), ay = cy(a), bx = cx(b), by = cy(b)
    let pts: [number, number][]
    const route = e.route ?? 'h'
    if (e.path) {
      pts = e.path.map(([c, r]) => [laneW + c * cw + cw / 2, headH + r * ch + ch / 2] as [number, number])
    } else if (route === 'loop-down' || route === 'loop-up') {
      const dir = route === 'loop-down' ? 1 : -1
      const y0 = ay + (dir * sa.h) / 2
      const y1 = by + (dir * sb.h) / 2
      const yy = (dir > 0 ? Math.max(y0, y1) : Math.min(y0, y1)) + dir * 22
      pts = [[ax, y0], [ax, yy], [bx, yy], [bx, y1]]
    } else if (ay === by) {
      const s = bx > ax ? 1 : -1
      pts = [[ax + (s * sa.w) / 2, ay], [bx - (s * sb.w) / 2, by]]
    } else if (ax === bx) {
      const s = by > ay ? 1 : -1
      pts = [[ax, ay + (s * sa.h) / 2], [bx, by - (s * sb.h) / 2]]
    } else if (route === 'v') {
      const s = bx > ax ? 1 : -1
      pts = [[ax, ay + ((by > ay ? 1 : -1) * sa.h) / 2], [ax, by], [bx - (s * sb.w) / 2, by]]
    } else {
      const s = by > ay ? 1 : -1
      pts = [[ax + ((bx > ax ? 1 : -1) * sa.w) / 2, ay], [bx, ay], [bx, by - (s * sb.h) / 2]]
    }
    const tone = e.tone ?? 'normal'
    const color = tone === 'back' ? '#d92d20' : tone === 'ok' ? '#067647' : '#475467'
    const marker = tone === 'back' ? 'ah-back' : tone === 'ok' ? 'ah-ok' : 'ah'
    out.push(`<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6"${e.dashed ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#${marker})"/>`)
    if (e.label) {
      // 標籤放在最長線段上
      let best = 0, bestLen = -1
      for (let i = 0; i < pts.length - 1; i++) {
        const len = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1])
        if (len > bestLen) { bestLen = len; best = i }
      }
      const t = e.at ?? 0.5
      const lx = pts[best][0] + (pts[best + 1][0] - pts[best][0]) * t
      const ly = pts[best][1] + (pts[best + 1][1] - pts[best][1]) * t
      const tw = [...e.label].reduce((s, ch2) => s + (ch2.charCodeAt(0) > 255 ? 12 : 7), 0) + 10
      labels.push(`<rect x="${lx - tw / 2}" y="${ly - 10}" width="${tw}" height="20" rx="4" fill="#fff" stroke="${tone === 'normal' ? '#eaecf0' : color}"/><text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="12" fill="${tone === 'normal' ? '#475467' : color}">${esc(e.label)}</text>`)
    }
  }
  // 節點
  for (const n of nodes) {
    const { w, h } = size(n)
    const x = cx(n) - w / 2
    const y = cy(n) - h / 2
    const lines = n.label.split('\n')
    const text = (color: string, weight = 500) =>
      lines.map((l, i) => `<text x="${cx(n)}" y="${cy(n) + 5 + (i - (lines.length - 1) / 2) * 16}" text-anchor="middle" font-size="13" font-weight="${weight}" fill="${color}">${esc(l)}</text>`).join('')
    switch (n.kind) {
      case 'decision':
        out.push(`<polygon points="${cx(n)},${y} ${x + w},${cy(n)} ${cx(n)},${y + h} ${x},${cy(n)}" fill="#fffaeb" stroke="#dc6803" stroke-width="1.5"/>${text('#93370d')}`)
        break
      case 'start':
      case 'end':
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${n.kind === 'start' ? '#1d2939' : '#067647'}"/>${text('#fff', 700)}`)
        break
      case 'screen':
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#eaf1fe" stroke="#2f6fed" stroke-width="1.5"/>${text('#1d4ed8', 700)}`)
        break
      case 'system':
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#f2f4f7" stroke="#98a2b3" stroke-dasharray="4 3"/>${text('#475467')}`)
        break
      case 'status':
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${n.bg ?? '#f2f4f7'}" stroke="${n.fg ?? '#475467'}" stroke-width="1.5"/>${text(n.fg ?? '#475467', 700)}`)
        break
      case 'note':
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#fff" stroke="#d0d5dd" stroke-dasharray="3 3"/>${text('#667085', 400)}`)
        break
      default:
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#fff" stroke="#475467" stroke-width="1.3"/>${text('#1d2939')}`)
    }
  }
  out.push(...labels)
  out.push('</svg>')
  return `<div class="flow-scroll">${out.join('\n')}</div>`
}
