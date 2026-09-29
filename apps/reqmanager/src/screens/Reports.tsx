// S10 管理報表（FR-06）：指標卡、分布、趨勢、篩選、下鑽明細；顯示日期區間、時區、
// 最後更新時間與樣本數；無資料時顯示「無資料」而非 0%（AC-06C）。
// 另含「時間軸」（Gantt）與「現金流試算」（可直接編輯儲存格）。

import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client.ts'
import { useMutation, useQuery } from '../api/live.ts'
import type { DueState } from '../domain/metrics.ts'
import { STATUS_META } from '../domain/rules.ts'
import { addDays, fmtDate, fmtShort, taipeiDate, taipeiTime } from '../domain/time.ts'
import type { CashFlowRow, ReqStatus } from '../domain/types.ts'
import { Async, Button, DueText, EmptyState, FormError, Icon, Loading, StatusChip, Tabs, useToast } from '../ui/kit.tsx'
import { Link, navigate, useRoute } from '../ui/router.tsx'
import { useMe, useUsers } from '../ui/session.tsx'

// 圖表色：經 dataviz 驗證的預設分類色第 1、2 槽（藍／橘），文字一律使用文字色
const SERIES = ['#2a78d6', '#eb6834']

interface Bucket {
  key: string
  count: number
  ids: string[]
}
interface Report {
  query: { from: string; to: string; type?: string; ownerId?: string }
  timezone: string
  generatedAt: string
  scopeSize: number
  newCount: { value: number; ids: string[] }
  overdue: { value: number; ids: string[] }
  evalTime: { median: number | null; n: number; ids: string[] }
  cycleTime: { median: number | null; n: number; reopened: number; ids: string[] }
  byType: Bucket[]
  byStatus: Bucket[]
  byPriority: Bucket[]
  weeks: { start: string; created: number; closed: number }[]
}

export function Reports() {
  const me = useMe()
  const { query } = useRoute()
  const tab = (query.view ?? 'overview') as 'overview' | 'timeline' | 'cashflow'
  return (
    <div className="page wide">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1>報表</h1>
          <div className="sub">{me.role === 'PM' ? '受理範圍內的需求' : '業務主管：全部業務的需求'}・統計與明細使用相同權限範圍（AC-06B）</div>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={v => navigate('/reports', { view: v === 'overview' ? undefined : v })}
        items={[
          { value: 'overview', label: '管理報表' },
          { value: 'timeline', label: '時間軸' },
          { value: 'cashflow', label: '現金流試算' },
        ]}
      />
      {tab === 'overview' && <Overview />}
      {tab === 'timeline' && <Timeline />}
      {tab === 'cashflow' && <CashFlow />}
    </div>
  )
}

function Overview() {
  const { query } = useRoute()
  const users = useUsers()
  const today = taipeiDate(new Date())
  const to = query.to ?? today
  const from = query.from ?? addDays(to, -29)
  const q = useQuery<Report>('/api/reports', { from, to, type: query.type, ownerId: query.ownerId })
  const [drill, setDrill] = useState<{ label: string; ids: string[] } | null>(null)
  const set = (p: Record<string, string | undefined>) => navigate('/reports', { ...query, ...p }, true)
  const preset = (days: number) => set({ from: addDays(today, -(days - 1)), to: today })

  return (
    <>
      <div className="card card-pad row wrap" style={{ marginBottom: 16, gap: 12 }}>
        <label className="row small">
          日期區間
          <input type="date" className="input" style={{ width: 150 }} value={from} max={to} onChange={e => set({ from: e.target.value })} aria-label="開始日期" />
          –
          <input type="date" className="input" style={{ width: 150 }} value={to} min={from} onChange={e => set({ to: e.target.value })} aria-label="結束日期" />
        </label>
        <div className="row">
          {[7, 30, 90].map(d => (
            <Button key={d} size="sm" onClick={() => preset(d)}>
              近 {d} 天
            </Button>
          ))}
        </div>
        <select className="select" style={{ width: 120 }} value={query.type ?? ''} onChange={e => set({ type: e.target.value || undefined })} aria-label="類型">
          <option value="">類型：全部</option>
          {['功能', '缺陷', '改善'].map(t => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className="select" style={{ width: 140 }} value={query.ownerId ?? ''} onChange={e => set({ ownerId: e.target.value || undefined })} aria-label="負責人">
          <option value="">負責人：全部</option>
          {users.list.filter(u => u.role !== 'Admin').map(u => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <Button size="sm" onClick={() => q.refetch()} data-testid="report-refresh">
          <Icon name="refresh" size={14} /> 重新整理
        </Button>
      </div>

      <Async q={q}>
        {r => (
          <>
            <div className="small muted" style={{ marginBottom: 12 }} data-testid="report-meta">
              {fmtDate(r.query.from)}–{fmtDate(r.query.to)}・時區 {r.timezone}・最後更新 {taipeiTime(r.generatedAt)}・範圍內需求 {r.scopeSize} 筆（開啟頁面時查詢，可手動重新整理，資料異動時自動更新）
            </div>
            <div className="kpis">
              <Kpi label="新增需求量" value={r.newCount.value} unit="筆" note="期間內首次提交；取消仍計入" onClick={() => setDrill({ label: '新增需求', ids: r.newCount.ids })} />
              <Kpi label="目前逾期" value={r.overdue.value} unit="筆" tone={r.overdue.value ? 'danger' : undefined} note="查詢當下；無承諾日期不算逾期" onClick={() => setDrill({ label: '目前逾期', ids: r.overdue.ids })} />
              <Kpi label="評估耗時（中位數）" value={r.evalTime.median} unit="工作天" note={`樣本 ${r.evalTime.n}・目標 ≤ 3 工作天`} onClick={() => setDrill({ label: '評估耗時樣本', ids: r.evalTime.ids })} />
              <Kpi label="交付週期（中位數）" value={r.cycleTime.median} unit="工作天" note={`樣本 ${r.cycleTime.n}・重新開啟 ${r.cycleTime.reopened}`} onClick={() => setDrill({ label: '交付週期樣本', ids: r.cycleTime.ids })} />
            </div>

            <div className="grid-3" style={{ marginBottom: 16 }}>
              <BarCard title="狀態分布" items={r.byStatus.filter(b => b.count > 0).map(b => ({ ...b, label: STATUS_META[b.key as ReqStatus].label }))} onPick={b => setDrill({ label: `狀態：${b.label}`, ids: b.ids })} />
              <BarCard title="類型分布" items={r.byType.map(b => ({ ...b, label: b.key }))} onPick={b => setDrill({ label: `類型：${b.label}`, ids: b.ids })} />
              <BarCard title="優先級分布" items={r.byPriority.map(b => ({ ...b, label: b.key || '未設定' }))} onPick={b => setDrill({ label: `優先級：${b.label}`, ids: b.ids })} />
            </div>

            <WeeklyChart weeks={r.weeks} />

            {drill && <Drill label={drill.label} ids={drill.ids} onClose={() => setDrill(null)} />}
          </>
        )}
      </Async>
    </>
  )
}

function Kpi({ label, value, unit, note, tone, onClick }: { label: string; value: number | null; unit: string; note: string; tone?: 'danger'; onClick: () => void }) {
  return (
    <button className="kpi" onClick={onClick} data-testid={`kpi-${label}`}>
      <span className="label">{label}</span>
      {value === null ? (
        <span className="value muted" style={{ fontSize: 22 }}>
          無資料
        </span>
      ) : (
        <span className={`value ${tone ?? ''}`}>
          {Number.isInteger(value) ? value : value.toFixed(1)} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>{unit}</span>
        </span>
      )}
      <span className="foot">
        <span>{note}</span>
        <span className="go">明細 →</span>
      </span>
    </button>
  )
}

function BarCard({ title, items, onPick }: { title: string; items: { key: string; label: string; count: number; ids: string[] }[]; onPick: (b: { label: string; ids: string[] }) => void }) {
  const max = Math.max(1, ...items.map(i => i.count))
  const total = items.reduce((s, i) => s + i.count, 0)
  return (
    <section className="card card-pad">
      <h3 style={{ marginBottom: 14 }}>{title}</h3>
      {total === 0 ? (
        <p className="muted">無資料</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {items.map(i => (
            <div key={i.key} className="bar-row" title={`${i.label}：${i.count} 筆（${Math.round((i.count / total) * 100)}%）`}>
              <span>{i.label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(i.count / max) * 100}%`, background: SERIES[0] }} />
              </div>
              <button onClick={() => onPick(i)} disabled={i.count === 0} aria-label={`${i.label} ${i.count} 筆，查看明細`}>
                {i.count}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function WeeklyChart({ weeks }: { weeks: Report['weeks'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...weeks.flatMap(w => [w.created, w.closed]))
  const W = 1100
  const H = 200
  const pad = { l: 28, r: 8, t: 12, b: 28 }
  const bw = (W - pad.l - pad.r) / Math.max(1, weeks.length)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const ticks = Array.from(new Set([0, Math.ceil(max / 2), max]))
  const empty = weeks.every(w => w.created === 0 && w.closed === 0)
  return (
    <section className="card card-pad">
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ flex: 1 }}>每週新增 vs 結案</h3>
        <div className="legend">
          <span><i style={{ background: SERIES[0] }} />新增</span>
          <span><i style={{ background: SERIES[1] }} />結案</span>
        </div>
      </div>
      {empty ? (
        <p className="muted">無資料</p>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="每週新增與結案需求數">
            {ticks.map(t => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eaecf0" />
                <text x={pad.l - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="#667085">
                  {t}
                </text>
              </g>
            ))}
            {weeks.map((w, i) => {
              const x = pad.l + i * bw
              const barW = Math.min(24, (bw - 16) / 2)
              const cx = x + bw / 2
              return (
                <g key={w.start} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={x} y={pad.t} width={bw} height={H - pad.t - pad.b} fill={hover === i ? '#f2f4f7' : 'transparent'} />
                  {w.created > 0 && <rect x={cx - barW - 1} y={y(w.created)} width={barW} height={y(0) - y(w.created)} rx="3" fill={SERIES[0]} />}
                  {w.closed > 0 && <rect x={cx + 1} y={y(w.closed)} width={barW} height={y(0) - y(w.closed)} rx="3" fill={SERIES[1]} />}
                  <text x={cx} y={H - 10} fontSize="11" textAnchor="middle" fill="#667085">
                    {fmtShort(w.start)}
                  </text>
                </g>
              )
            })}
          </svg>
          {hover !== null && (
            <div className="card small" style={{ position: 'absolute', top: 0, left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, transform: 'translateX(-50%)', padding: '6px 10px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {fmtShort(weeks[hover].start)} 起一週：新增 {weeks[hover].created}・結案 {weeks[hover].closed}
            </div>
          )}
        </div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="small muted" style={{ cursor: 'pointer' }}>
          以表格檢視
        </summary>
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>週起始</th>
              <th className="num">新增</th>
              <th className="num">結案</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => (
              <tr key={w.start}>
                <td>{fmtDate(w.start)}</td>
                <td className="num">{w.created}</td>
                <td className="num">{w.closed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

interface Row {
  id: string
  no: string
  title: string
  status: ReqStatus
  ownerId: string
  due: DueState
}

function Drill({ label, ids, onClose }: { label: string; ids: string[]; onClose: () => void }) {
  const users = useUsers()
  const q = useQuery<{ items: Row[]; total: number }>(ids.length ? '/api/requirements' : null, { tab: 'all', ids: ids.join(','), pageSize: 100 })
  useEffect(() => {
    document.getElementById('drill')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [label])
  return (
    <section className="card" id="drill" style={{ marginTop: 16 }} data-testid="drill">
      <div className="card-head">
        <h3 style={{ flex: 1 }}>
          明細：{label}（{ids.length} 筆）
        </h3>
        {ids.length > 0 && (
          <Link to="/requirements" query={{ tab: 'all', ids: ids.join(',') }}>
            在需求列表開啟
          </Link>
        )}
        <Button size="sm" tone="ghost" onClick={onClose}>
          關閉
        </Button>
      </div>
      {ids.length === 0 ? (
        <EmptyState title="無資料" />
      ) : !q.data ? (
        <Loading />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>編號</th>
              <th>標題</th>
              <th>狀態</th>
              <th>目前負責人</th>
              <th>承諾日期</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map(r => (
              <tr key={r.id} className="clickable" onClick={() => navigate(`/requirements/${r.id}`)}>
                <td>
                  <Link to={`/requirements/${r.id}`}>{r.no}</Link>
                </td>
                <td>{r.title}</td>
                <td>
                  <StatusChip status={r.status} />
                </td>
                <td>{r.ownerId ? users.name(r.ownerId) : '—'}</td>
                <td>
                  <DueText due={r.due} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ─── 時間軸（Gantt） ────────────────────────────────────────────────────

interface TimelineRow extends Row {
  submittedAt: string
  startedAt: string
  closedAt: string
  committedDate: string
}

function Timeline() {
  const q = useQuery<TimelineRow[]>('/api/timeline')
  const [weeks, setWeeks] = useState(8)
  const today = taipeiDate(new Date())
  const start = addDays(today, -Math.round(weeks * 7 * 0.4))
  const end = addDays(start, weeks * 7)
  const span = weeks * 7
  const pos = (d: string) => Math.max(0, Math.min(100, ((Date.parse(d) - Date.parse(start)) / 86400000 / span) * 100))
  const cols = Array.from({ length: 8 }, (_, i) => addDays(start, Math.round((span / 8) * i)))
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="small muted" style={{ flex: 1 }}>
          長條 = 開始開發（或提交）到承諾日期；紅線 = 今天；逾期以紅色表示並寫出文字。
        </span>
        {[4, 8, 16].map(w => (
          <Button key={w} size="sm" tone={weeks === w ? 'primary' : 'secondary'} onClick={() => setWeeks(w)}>
            {w} 週
          </Button>
        ))}
      </div>
      <div className="card">
        <Async q={q} empty={d => (d.length === 0 ? <EmptyState title="無資料" /> : null)}>
          {rows => (
            <div className="gantt" data-testid="gantt">
              <div className="gantt-label small muted" style={{ fontWeight: 700 }}>
                需求
              </div>
              <div className="gantt-label small muted" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', borderRight: 'none', padding: '10px 0' }}>
                {cols.map(c => (
                  <span key={c} style={{ paddingLeft: 6 }}>
                    {fmtShort(c)}
                  </span>
                ))}
              </div>
              {rows
                .slice()
                .sort((a, b) => (a.committedDate || '9999').localeCompare(b.committedDate || '9999'))
                .map(r => {
                  const s = taipeiDate(r.startedAt || r.submittedAt)
                  const e = r.closedAt ? taipeiDate(r.closedAt) : r.committedDate || addDays(today, 7)
                  const left = pos(s)
                  const width = Math.max(1.5, pos(e) - left)
                  const m = STATUS_META[r.status]
                  const overdue = r.due.kind === 'overdue'
                  const visible = e >= start && s <= end
                  return (
                    <div key={r.id} className="gantt-row">
                      <div className="gantt-label">
                        <Link to={`/requirements/${r.id}`} className="small mono">
                          {r.no}
                        </Link>
                        <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                      </div>
                      <div className="gantt-track">
                        <div className="gantt-today" style={{ left: `${pos(today)}%` }} />
                        {visible && (
                          <div className="gantt-bar" style={{ left: `${left}%`, width: `${width}%`, background: overdue ? '#d92d20' : m.fg }} title={`${m.label}・${fmtDate(s)} → ${r.committedDate ? fmtDate(r.committedDate) : '未設定承諾日期'}`}>
                            {overdue ? `逾期 ${r.due.days} 天` : m.label}
                            {r.committedDate && ` → ${fmtShort(r.committedDate)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </Async>
      </div>
    </>
  )
}

// ─── 現金流試算（手動編輯） ──────────────────────────────────────────────

function CashFlow() {
  const q = useQuery<{ rows: CashFlowRow[]; openReqs: number }>('/api/cashflow')
  const toast = useToast()
  const [rows, setRows] = useState<CashFlowRow[] | null>(null)
  const dirty = rows !== null
  const data = rows ?? q.data?.rows ?? []
  const save = useMutation((r: CashFlowRow[]) => api.put('/api/cashflow', { rows: r }))
  const net = (r: CashFlowRow) => r.revenue - r.devCost - r.pmCost - r.infra - r.misc
  const cumulative = useMemo(() => data.reduce<number[]>((acc, r) => [...acc, (acc[acc.length - 1] ?? 0) + net(r)], []), [data])
  const totals = data.reduce((t, r) => ({ revenue: t.revenue + r.revenue, cost: t.cost + r.devCost + r.pmCost + r.infra + r.misc }), { revenue: 0, cost: 0 })
  const payback = data.findIndex((_, i) => cumulative[i] >= 0)
  const edit = (i: number, k: keyof CashFlowRow, v: string) => setRows(data.map((r, j) => (j === i ? { ...r, [k]: k === 'month' ? v : Number(v) || 0 } : r)))
  const addMonth = () => {
    const last = data[data.length - 1]?.month ?? taipeiDate(new Date()).slice(0, 7)
    const d = new Date(`${last}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + 1)
    setRows([...data, { month: d.toISOString().slice(0, 7), revenue: 0, devCost: 0, pmCost: 40000, infra: 15000, misc: 0 }])
  }
  const money = (n: number) => `NT$ ${n.toLocaleString()}`
  const maxV = Math.max(1, ...data.flatMap(r => [r.revenue, r.revenue - net(r)]))

  if (q.error && !q.data) return <Async q={q}>{() => null}</Async>
  if (!q.data) return <div className="card"><Loading /></div>
  return (
    <>
      <div className="kpis">
        {[
          ['預估總收入', money(totals.revenue), ''],
          ['預估總成本', money(totals.cost), ''],
          ['預估淨現金流', money(totals.revenue - totals.cost), totals.revenue - totals.cost < 0 ? 'danger' : ''],
          ['累計回正月份', payback >= 0 ? data[payback].month.replace('-', '/') : '期間內未回正', ''],
        ].map(([l, v, t]) => (
          <div key={l} className="kpi" style={{ cursor: 'default' }}>
            <span className="label">{l}</span>
            <span className={`value ${t}`} style={{ fontSize: 22 }}>
              {v}
            </span>
          </div>
        ))}
      </div>
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ flex: 1 }}>每月收入 vs 成本</h3>
          <div className="legend">
            <span><i style={{ background: SERIES[0] }} />收入</span>
            <span><i style={{ background: SERIES[1] }} />成本</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, data.length)}, 1fr)`, gap: 8, alignItems: 'end', height: 150 }}>
          {data.map(r => {
            const cost = r.revenue - net(r)
            return (
              <div key={r.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }} title={`${r.month}：收入 ${money(r.revenue)}、成本 ${money(cost)}、淨額 ${money(net(r))}`}>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 120 }}>
                  <div style={{ width: 16, height: `${(r.revenue / maxV) * 100}%`, background: SERIES[0], borderRadius: '4px 4px 0 0' }} />
                  <div style={{ width: 16, height: `${(cost / maxV) * 100}%`, background: SERIES[1], borderRadius: '4px 4px 0 0' }} />
                </div>
                <span className="small muted">{r.month.slice(5)} 月</span>
              </div>
            )
          })}
        </div>
      </section>
      <section className="card" data-testid="cashflow">
        <div className="card-head">
          <h3 style={{ flex: 1 }}>月度試算表（可直接編輯儲存格）</h3>
          {dirty && <span className="small warning-text">有未儲存的變更</span>}
          <Button size="sm" onClick={addMonth}>
            + 新增月份
          </Button>
          <Button size="sm" disabled={!dirty} onClick={() => setRows(null)}>
            還原
          </Button>
          <Button
            size="sm"
            tone="primary"
            disabled={!dirty || save.pending}
            onClick={async () => {
              if (rows && (await save.run(rows))) {
                setRows(null)
                toast('現金流已儲存，其他使用者會自動看到更新')
              }
            }}
            data-testid="cashflow-save"
          >
            儲存
          </Button>
        </div>
        <FormError error={save.error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>月份</th>
                <th className="num">收入</th>
                <th className="num">開發成本</th>
                <th className="num">PM 成本</th>
                <th className="num">基礎設施</th>
                <th className="num">雜項</th>
                <th className="num">淨現金流</th>
                <th className="num">累計</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input type="month" className="input" style={{ height: 32, width: 140 }} value={r.month} onChange={e => edit(i, 'month', e.target.value)} aria-label="月份" />
                  </td>
                  {(['revenue', 'devCost', 'pmCost', 'infra', 'misc'] as const).map(k => (
                    <td key={k} className="num">
                      <input type="number" className="input mono" style={{ height: 32, textAlign: 'right', width: 120 }} value={r[k]} onChange={e => edit(i, k, e.target.value)} aria-label={`${r.month} ${k}`} data-testid={`cf-${i}-${k}`} />
                    </td>
                  ))}
                  <td className={`num mono ${net(r) < 0 ? 'danger-text' : 'success-text'}`} data-testid={`cf-${i}-net`}>
                    {net(r).toLocaleString()}
                  </td>
                  <td className={`num mono ${cumulative[i] < 0 ? 'danger-text' : ''}`}>{cumulative[i].toLocaleString()}</td>
                  <td>
                    <Button tone="ghost" size="sm" style={{ color: 'var(--danger)' }} onClick={() => setRows(data.filter((_, j) => j !== i))} aria-label={`刪除 ${r.month}`}>
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-body small muted">淨現金流與累計即時計算；按「儲存」後寫入 API，其他使用者畫面會自動更新。目前處理中需求 {q.data.openReqs} 筆。</div>
      </section>
    </>
  )
}
