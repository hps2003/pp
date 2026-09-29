// S02 我的工作台（登入首頁）：數字卡依角色切換，點擊直接篩選下方清單；
// 清單只列「現在輪到我」的需求；右側只顯示與我相關的異動。

import { useState } from 'react'
import { useQuery } from '../api/live.ts'
import type { DueState, WorkbenchCard } from '../domain/metrics.ts'
import { relTime, taipeiDate } from '../domain/time.ts'
import type { ReqStatus } from '../domain/types.ts'
import { Async, Button, DueText, EmptyState, Icon, StatusChip } from '../ui/kit.tsx'
import { Link, navigate } from '../ui/router.tsx'
import { useMe } from '../ui/session.tsx'

interface WB {
  cards: WorkbenchCard[]
  todo: { id: string; no: string; title: string; status: ReqStatus; todo: string; deadline: string; deadlineState: DueState }[]
  activity: { at: string; reqId: string; reqNo: string; text: string }[]
}

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', hour12: false }).format(new Date()))
  return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'
}

export function Workbench() {
  const me = useMe()
  const q = useQuery<WB>('/api/workbench')
  const [filter, setFilter] = useState<string>('all')

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1>
            {greeting()}，{me.name}
          </h1>
          <div className="sub">以下是需要你處理的項目・{taipeiDate(new Date()).replace(/-/g, '/')}（Asia/Taipei）</div>
        </div>
        {me.role !== 'Admin' && (
          <Link to="/requirements/new" className="btn btn-primary" >
            <Icon name="plus" size={16} /> 提交需求
          </Link>
        )}
      </div>

      <Async q={q}>
        {d => {
          const card = d.cards.find(c => c.key === filter)
          const rows = card ? d.todo.filter(t => card.ids.includes(t.id)) : d.todo
          // 數字卡篩選下方清單；若卡片項目不在「輪到我」清單（例如追蹤中），改到需求列表查看
          const extra = card ? card.ids.filter(id => !d.todo.some(t => t.id === id)) : []
          return (
            <>
              <div className="kpis" style={{ gridTemplateColumns: `repeat(${Math.max(2, d.cards.length)}, 1fr)` }}>
                {d.cards.map(c => (
                  <button key={c.key} className={`kpi ${filter === c.key ? 'active' : ''}`} onClick={() => setFilter(filter === c.key ? 'all' : c.key)} data-testid={`card-${c.key}`} aria-pressed={filter === c.key}>
                    <span className="label">{c.label}</span>
                    <span className="foot">
                      <span className={`value ${c.count > 0 && c.tone !== 'neutral' ? c.tone : ''}`}>{c.count}</span>
                      <span className="go">查看 →</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
                <div>
                  <div className="row" style={{ marginBottom: 12 }}>
                    <h2 style={{ marginRight: 16 }}>待我處理</h2>
                    <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
                      <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                        全部 {d.todo.length}
                      </button>
                      {d.cards.filter(c => c.count > 0).map(c => (
                        <button key={c.key} className={`tab ${filter === c.key ? 'active' : ''}`} onClick={() => setFilter(c.key)}>
                          {c.label.replace(/^待我/, '')} {c.count}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="card">
                    {rows.length === 0 && extra.length === 0 ? (
                      <EmptyState
                        title="目前沒有需要你處理的項目"
                        action={
                          <Link to="/requirements" query={{ tab: me.role === 'Business' ? 'mine' : 'assigned' }}>
                            {me.role === 'Business' ? '查看我提交的需求' : '查看指派給我的需求'}
                          </Link>
                        }
                      />
                    ) : (
                      <div className="table-wrap">
                        <table className="table" data-testid="todo-table">
                          <thead>
                            <tr>
                              <th>編號</th>
                              <th>標題</th>
                              <th>狀態</th>
                              <th>需要你做的事</th>
                              <th>期限</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(t => (
                              <tr key={t.id} className="clickable" onClick={() => navigate(`/requirements/${t.id}`)}>
                                <td className="nowrap">
                                  <Link to={`/requirements/${t.id}`}>{t.no || '草稿'}</Link>
                                </td>
                                <td>{t.title || '（未命名草稿）'}</td>
                                <td>
                                  <StatusChip status={t.status} />
                                </td>
                                <td>{t.todo}</td>
                                <td className="nowrap">
                                  {t.deadline ? <DueText due={t.deadlineState.kind === 'ok' ? { ...t.deadlineState } : t.deadlineState} /> : <span className="muted">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {extra.length > 0 && (
                          <div className="card-body small muted">
                            另有 {extra.length} 筆屬於追蹤項目，
                            <Link to="/requirements" query={{ tab: 'all', ids: extra.join(',') }}>
                              到需求列表查看
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <aside className="card card-pad" data-testid="activity">
                  <h2 style={{ marginBottom: 16 }}>最近更新</h2>
                  {d.activity.length === 0 && <p className="muted small">還沒有與你相關的異動。</p>}
                  <ul className="timeline">
                    {d.activity.map((a, i) => (
                      <li key={i}>
                        <span className="tl-dot" />
                        <div style={{ fontSize: 13.5 }}>{a.text}</div>
                        <Link to={`/requirements/${a.reqId}`} className="small">
                          {a.reqNo || '草稿'}
                        </Link>
                        <div className="small muted">{relTime(a.at)}</div>
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>
            </>
          )
        }}
      </Async>
      {me.role === 'Admin' && (
        <div className="banner info" style={{ marginTop: 16 }}>
          Admin 不參與需求流程。請使用「帳號與權限」管理人員。
          <Button tone="ghost" onClick={() => navigate('/admin/users')}>
            前往
          </Button>
        </div>
      )}
    </div>
  )
}
