// S05 需求列表：條件以標籤顯示、可逐一移除或清除全部；條件保留在網址，
// 進入詳細頁再返回不重置（AC-04B）。列表只含授權範圍內資料（AC-04A）。每頁 20 筆。

import { useEffect, useState } from 'react'
import { useQuery } from '../api/live.ts'
import type { DueState } from '../domain/metrics.ts'
import { STATUS_META } from '../domain/rules.ts'
import { relTime } from '../domain/time.ts'
import type { Priority, ReqStatus, ReqType } from '../domain/types.ts'
import { Async, Button, DueText, EmptyState, Icon, StatusChip } from '../ui/kit.tsx'
import { Link, navigate, useRoute } from '../ui/router.tsx'
import { useMe, useUsers } from '../ui/session.tsx'

interface Row {
  id: string
  no: string
  title: string
  type: ReqType
  status: ReqStatus
  priority: Priority | ''
  clientNames: string[]
  ownerId: string
  committedDate: string
  due: DueState
  updatedAt: string
}

const FILTERS = ['status', 'type', 'priority', 'owner', 'due'] as const
const STATUS_OPTIONS = [
  { value: 'open', label: '處理中' },
  { value: 'ended', label: '已結束' },
  ...Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label })),
]
const DUE_OPTIONS = [
  { value: 'overdue', label: '已逾期' },
  { value: 'soon', label: '2 個工作天內到期' },
  { value: 'ok', label: '未到期' },
  { value: 'none', label: '未設定' },
]

export function ReqList() {
  const me = useMe()
  const { query } = useRoute()
  const users = useUsers()
  const defaultTab = me.role === 'Business' ? 'mine' : 'assigned'
  const tab = query.tab ?? defaultTab
  const [search, setSearch] = useState(query.q ?? '')
  useEffect(() => setSearch(query.q ?? ''), [query.q])

  const set = (patch: Record<string, string | undefined>) => navigate('/requirements', { ...query, tab, page: undefined, ...patch }, true)
  const q = useQuery<{ items: Row[]; total: number; page: number; pageSize: number }>('/api/requirements', {
    tab, q: query.q, status: query.status, type: query.type, priority: query.priority, owner: query.owner, due: query.due, ids: query.ids, sort: query.sort, page: query.page,
  })

  const labelOf = (k: (typeof FILTERS)[number], v: string) => {
    if (k === 'status') return `狀態：${STATUS_OPTIONS.find(o => o.value === v)?.label ?? v}`
    if (k === 'type') return `類型：${v}`
    if (k === 'priority') return `優先級：${v === 'none' ? '未設定' : v}`
    if (k === 'owner') return `負責人：${users.name(v)}`
    return `承諾日期：${DUE_OPTIONS.find(o => o.value === v)?.label ?? v}`
  }
  const applied = FILTERS.filter(k => query[k])
  const anyFilter = applied.length > 0 || !!query.q || !!query.ids
  const clearAll = () => navigate('/requirements', { tab }, true)

  const sel = (k: (typeof FILTERS)[number], label: string, options: { value: string; label: string }[]) => (
    <select className="select" style={{ width: 132 }} value={query[k] ?? ''} onChange={e => set({ [k]: e.target.value || undefined })} aria-label={label} data-testid={`filter-${k}`}>
      <option value="">{label}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )

  return (
    <div className="page wide">
      <div className="page-head">
        <h1 style={{ flex: 1 }}>需求</h1>
        {me.role !== 'Admin' && (
          <Link to="/requirements/new" className="btn btn-primary">
            <Icon name="plus" size={16} /> 提交需求
          </Link>
        )}
      </div>

      <div className="tabs" role="tablist">
        {[
          ['all', '全部'],
          ['mine', '我提交的'],
          ['assigned', '指派給我'],
          ['watching', '我關注的'],
        ].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v} className={`tab ${tab === v ? 'active' : ''}`} onClick={() => navigate('/requirements', { ...query, tab: v, page: undefined }, true)}>
            {l}
          </button>
        ))}
      </div>

      <div className="row wrap" style={{ marginBottom: 10 }}>
        <form
          onSubmit={e => {
            e.preventDefault()
            set({ q: search.trim() || undefined })
          }}
          style={{ position: 'relative', width: 280 }}
          role="search"
        >
          <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋編號或標題" aria-label="搜尋編號或標題" data-testid="list-search" style={{ paddingRight: 36 }} />
          <button type="submit" className="icon-btn" style={{ position: 'absolute', right: 4, top: 4, width: 32, height: 32, border: 'none' }} aria-label="搜尋">
            <Icon name="search" size={16} />
          </button>
        </form>
        {sel('status', '狀態', STATUS_OPTIONS)}
        {sel('type', '類型', ['功能', '缺陷', '改善'].map(v => ({ value: v, label: v })))}
        {sel('priority', '優先級', [...['緊急', '高', '一般', '低'].map(v => ({ value: v, label: v })), { value: 'none', label: '未設定' }])}
        {sel('owner', '負責人', users.list.filter(u => u.role !== 'Admin').map(u => ({ value: u.id, label: u.name })))}
        {sel('due', '承諾日期', DUE_OPTIONS)}
      </div>

      <div className="row wrap" style={{ marginBottom: 12, minHeight: 28 }}>
        {anyFilter && <span className="small muted">已套用：</span>}
        {query.q && (
          <span className="tag-filter">
            關鍵字：{query.q}
            <button onClick={() => set({ q: undefined })} aria-label="移除關鍵字">
              ×
            </button>
          </span>
        )}
        {query.ids && (
          <span className="tag-filter">
            指定 {query.ids.split(',').length} 筆
            <button onClick={() => set({ ids: undefined })} aria-label="移除指定清單">
              ×
            </button>
          </span>
        )}
        {applied.map(k => (
          <span key={k} className="tag-filter">
            {labelOf(k, query[k])}
            <button onClick={() => set({ [k]: undefined })} aria-label={`移除 ${labelOf(k, query[k])}`}>
              ×
            </button>
          </span>
        ))}
        {anyFilter && (
          <button className="btn btn-ghost sm" onClick={clearAll} data-testid="clear-filters">
            清除全部
          </button>
        )}
        <span className="spacer" />
        <span className="small muted">
          共 {q.data?.total ?? '—'} 筆・
          <select value={query.sort ?? 'updated'} onChange={e => set({ sort: e.target.value === 'updated' ? undefined : e.target.value })} style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer' }} aria-label="排序">
            <option value="updated">依更新時間排序</option>
            <option value="committed">依承諾日期排序</option>
            <option value="no">依編號排序</option>
          </select>
        </span>
      </div>

      <div className="card">
        <Async
          q={q}
          empty={d =>
            d.items.length === 0 ? (
              anyFilter ? (
                <EmptyState title="找不到符合條件的需求" desc="試著調整或清除篩選條件。" action={<Button onClick={clearAll}>清除篩選</Button>} />
              ) : (
                <EmptyState title="這裡還沒有需求" desc={tab === 'watching' ? '在需求詳細頁點「關注」即可在這裡追蹤。' : undefined} action={me.role !== 'Admin' ? <Link to="/requirements/new">提交第一筆需求</Link> : undefined} />
              )
            ) : null
          }
        >
          {d => (
            <>
              <div className="table-wrap">
                <table className="table" data-testid="req-table">
                  <thead>
                    <tr>
                      <th>編號</th>
                      <th>標題</th>
                      <th>客戶</th>
                      <th>類型</th>
                      <th>狀態</th>
                      <th>優先級</th>
                      <th>目前負責人</th>
                      <th>承諾日期</th>
                      <th>更新</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map(r => (
                      <tr key={r.id} className="clickable" onClick={() => navigate(`/requirements/${r.id}`)}>
                        <td className="nowrap">
                          <Link to={`/requirements/${r.id}`}>{r.no || '草稿'}</Link>
                        </td>
                        <td>{r.title || '（未命名草稿）'}</td>
                        <td>{r.clientNames.length ? r.clientNames.map(n => n.replace(/(股份有限公司|有限公司)$/, '')).join('、') : <span className="muted">（內部）</span>}</td>
                        <td>{r.type}</td>
                        <td>
                          <StatusChip status={r.status} />
                        </td>
                        <td>{r.priority || '—'}</td>
                        <td className="nowrap">{r.ownerId ? users.name(r.ownerId) : '—'}</td>
                        <td className="nowrap">
                          <DueText due={r.due} />
                        </td>
                        <td className="nowrap muted">{relTime(r.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.total > d.pageSize && (
                <div className="row card-body" style={{ justifyContent: 'flex-end' }}>
                  <span className="small muted">
                    第 {d.page} / {Math.ceil(d.total / d.pageSize)} 頁
                  </span>
                  <Button size="sm" disabled={d.page <= 1} onClick={() => navigate('/requirements', { ...query, tab, page: String(d.page - 1) }, true)}>
                    ‹ 上一頁
                  </Button>
                  <Button size="sm" disabled={d.page * d.pageSize >= d.total} onClick={() => navigate('/requirements', { ...query, tab, page: String(d.page + 1) }, true)}>
                    下一頁 ›
                  </Button>
                </div>
              )}
            </>
          )}
        </Async>
      </div>
    </div>
  )
}
