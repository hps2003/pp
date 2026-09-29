// S07 需求詳細 + S08 評估與指派（對話框）+ S09 測試與驗收（右側操作抽屜）。
// 頁首按鈕依「角色 × 狀態」顯示，只露出此刻合法的操作（PRD 7.2）；後端再檢查一次。

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ApiFailure, api } from '../api/client.ts'
import { useMutation, useQuery } from '../api/live.ts'
import type { DueState } from '../domain/metrics.ts'
import { ACTIONS, PRIORITIES, PRIORITY_HINT, STAGES, STATUS_META, type ActionKey } from '../domain/rules.ts'
import { addWorkingDays, fmtDate, fmtDateTime, fmtShort, relTime, taipeiDate } from '../domain/time.ts'
import type { Requirement } from '../domain/types.ts'
import {
  Avatar, Button, Checkbox, ConflictBanner, Dialog, Drawer, DueText, ErrorState, Field, FormError, Icon, Loading, SelectField,
  StatusChip, TextArea, TextField, useOutside, useToast,
} from '../ui/kit.tsx'
import { Link, navigate } from '../ui/router.tsx'
import { useMe, useUsers } from '../ui/session.tsx'

export type Detail = Requirement & {
  clientNames: string[]
  ownerId: string
  due: DueState
  nextStep: string
  actions: ActionKey[]
  canEdit: boolean
  canComment: boolean
  qaPassed: boolean
  uatPassed: boolean
  duplicateOf?: { id: string; no: string; title: string }
}

type Panel = ActionKey | null

export function ReqDetail({ id }: { id: string }) {
  const q = useQuery<Detail>(`/api/requirements/${id}`)
  const [panel, setPanel] = useState<Panel>(null)
  if (q.error && !q.data)
    return (
      <div className="page">
        <div className="breadcrumb">
          <Link to="/requirements">需求</Link> / {id}
        </div>
        <div className="card">
          <ErrorState error={q.error} onRetry={q.refetch} />
        </div>
      </div>
    )
  if (!q.data)
    return (
      <div className="page">
        <div className="card">
          <Loading rows={6} />
        </div>
      </div>
    )
  return (
    <>
      <DetailView r={q.data} onAction={setPanel} reload={q.refetch} />
      {panel && <ActionPanel r={q.data} action={panel} onClose={() => setPanel(null)} reload={q.refetch} />}
    </>
  )
}

function Stepper({ r }: { r: Detail }) {
  const meta = STATUS_META[r.status]
  const ended = r.status === 'REJECTED' || r.status === 'CANCELLED'
  // 結束時以最後到達的階段顯示灰色進度條
  const stage = ended ? Math.max(0, ...r.history.filter(e => STATUS_META[e.to].stage >= 0).map(e => STATUS_META[e.to].stage)) : meta.stage
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className={`stepper ${ended ? 'ended' : ''}`} data-testid="stepper" aria-label={`進度：${meta.label}`}>
        {STAGES.map((s, i) => {
          const cls = r.status === 'CLOSED' || i < stage ? 'done' : i === stage ? 'current' : ''
          return (
            <div key={s} className={`step ${cls}`} aria-current={cls === 'current' ? 'step' : undefined}>
              <span className="node">{cls === 'done' && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}</span>
              {s}
            </div>
          )
        })}
      </div>
      {ended && (
        <div className="card-body small" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-2)' }}>
          已結束：{meta.label}
        </div>
      )}
    </div>
  )
}

function MoreMenu({ r, onAction }: { r: Detail; onAction: (a: ActionKey) => void }) {
  const me = useMe()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutside(close)
  const watching = r.watcherIds.includes(me.id)
  const watch = useMutation(() => api.post(`/api/requirements/${r.id}/watch`, { watch: !watching }))
  const menuActions = ACTIONS.filter(a => a.menu && r.actions.includes(a.key))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button onClick={() => setOpen(o => !o)} aria-label="更多操作" data-testid="more-menu">
        <Icon name="more" />
      </Button>
      {open && (
        <div className="menu">
          <button
            onClick={async () => {
              setOpen(false)
              if (await watch.run()) toast(watching ? '已取消關注' : '已關注，異動會出現在「我關注的」')
            }}
          >
            {watching ? '取消關注' : '關注此需求'}
          </button>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href)
              toast('已複製連結')
              setOpen(false)
            }}
          >
            複製連結
          </button>
          {menuActions.length > 0 && <hr />}
          {menuActions.map(a => (
            <button key={a.key} onClick={() => (setOpen(false), onAction(a.key))} style={a.tone === 'danger' ? { color: 'var(--danger)' } : undefined} data-testid={`menu-${a.key}`}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailView({ r, onAction, reload }: { r: Detail; onAction: (a: ActionKey) => void; reload: () => void }) {
  const users = useUsers()
  const [tab, setTab] = useState<'content' | 'records' | 'changes'>('content')
  const buttons = ACTIONS.filter(a => !a.menu && r.actions.includes(a.key))
  const ownerName = r.ownerId ? users.name(r.ownerId) : '—'

  const handle = (a: ActionKey) => {
    // 草稿提交與補件走 S06 表單（含完整檢核與就地錯誤）
    if (a === 'submit' || a === 'resubmit') return navigate(`/requirements/${r.id}/edit`)
    onAction(a)
  }

  return (
    <div className="page wide" data-testid="req-detail" data-status={r.status}>
      <div className="breadcrumb">
        <Link to="/requirements">需求</Link> / {r.no || '草稿'}
      </div>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div className="row wrap" style={{ flex: 1, gap: 10 }}>
          <h1>{r.title || '（未命名草稿）'}</h1>
          <StatusChip status={r.status} />
          <span className="chip gray">{r.type}</span>
          {r.priority && <span className="chip gray">優先級：{r.priority}</span>}
        </div>
        <div className="row" data-testid="actions">
          {buttons
            .slice()
            .reverse()
            .map(a => (
              <Button key={a.key} tone={a.tone} onClick={() => handle(a.key)} data-testid={`action-${a.key}`}>
                {a.label}
              </Button>
            ))}
          {r.canEdit && r.status === 'DRAFT' && (
            <Button onClick={() => navigate(`/requirements/${r.id}/edit`)} data-testid="edit-draft">
              編輯
            </Button>
          )}
          <MoreMenu r={r} onAction={handle} />
        </div>
      </div>

      <Stepper r={r} />

      <div className={`banner ${r.status === 'CLOSED' ? 'success' : r.status === 'REJECTED' || r.status === 'CANCELLED' ? 'neutral' : r.due.kind === 'overdue' ? 'danger' : 'info'}`} style={{ marginBottom: 16 }} data-testid="next-step">
        {r.nextStep}
        {r.due.kind === 'overdue' && <b>（已逾期 {r.due.days} 天）</b>}
      </div>
      {r.duplicateOf && (
        <div className="banner neutral" style={{ marginBottom: 16 }}>
          此需求與 <Link to={`/requirements/${r.duplicateOf.id}`}>{r.duplicateOf.no}「{r.duplicateOf.title}」</Link> 重複，已關聯主需求。
        </div>
      )}

      <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-head" style={{ paddingBottom: 0, borderBottom: 'none' }}>
              <div className="tabs" style={{ marginBottom: 0, flex: 1 }}>
                <button className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>
                  需求內容
                </button>
                <button className={`tab ${tab === 'records' ? 'active' : ''}`} onClick={() => setTab('records')} data-testid="tab-records">
                  評估與測試紀錄
                </button>
                <button className={`tab ${tab === 'changes' ? 'active' : ''}`} onClick={() => setTab('changes')}>
                  編輯紀錄
                </button>
              </div>
            </div>
            <div className="card-body prose">
              {tab === 'content' && (
                <>
                  <div className="section-label">目前遇到的問題</div>
                  <p>{r.problem || '—'}</p>
                  <div className="section-label">預期結果</div>
                  <p>{r.expected || '—'}</p>
                  <div className="section-label">影響範圍</div>
                  <p>
                    {r.impactScope || '—'}｜{r.impactNote || '—'}
                  </p>
                  <div className="section-label">急迫性</div>
                  <p>
                    {r.urgency || '—'}｜{r.urgencyNote || '—'}
                  </p>
                  {r.acceptanceCriteria.length > 0 && (
                    <>
                      <div className="section-label">驗收條件（AC）</div>
                      <ol style={{ margin: '0 0 8px', paddingLeft: 20 }}>
                        {r.acceptanceCriteria.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ol>
                    </>
                  )}
                </>
              )}
              {tab === 'records' && <Records r={r} />}
              {tab === 'changes' && (
                <>
                  {r.dateChanges.length === 0 && <p className="muted">尚無承諾日期異動。</p>}
                  <ul className="timeline">
                    {r.dateChanges
                      .slice()
                      .reverse()
                      .map(d => (
                        <li key={d.id}>
                          <span className="tl-dot" />
                          承諾日期 {fmtDate(d.oldValue)} → <b>{fmtDate(d.newValue)}</b>
                          <div className="small muted">
                            {users.name(d.actorId)}・{fmtDateTime(d.at)}・原因：{d.reason}
                          </div>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
          </section>
          <Comments r={r} />
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card card-pad">
            <h2 style={{ marginBottom: 16 }}>資訊</h2>
            <dl className="kv" data-testid="info">
              <dt>需求編號</dt>
              <dd className="mono">{r.no || '（提交後產生）'}</dd>
              <dt>目前負責人</dt>
              <dd>{ownerName}</dd>
              <dt>提出人</dt>
              <dd>{users.name(r.reporterId)}</dd>
              <dt>受理 PM</dt>
              <dd>{users.name(r.pmId)}</dd>
              <dt>開發負責人</dt>
              <dd>{r.assigneeId ? users.name(r.assigneeId) : '—'}</dd>
              <dt>QA</dt>
              <dd>{r.qaId ? users.name(r.qaId) : '—'}</dd>
              <dt>業務驗收者</dt>
              <dd>{users.name(r.uatReviewerId)}</dd>
              <dt>關聯客戶</dt>
              <dd>{r.clientNames.length ? r.clientNames.join('、') : '（內部）'}</dd>
              <dt>優先級</dt>
              <dd>{r.priority || '—'}</dd>
              <dt>期望日期</dt>
              <dd>{fmtDate(r.expectedDate)}</dd>
              <dt>承諾日期</dt>
              <dd>
                <DueText due={r.due} />
              </dd>
            </dl>
          </section>
          <section className="card card-pad" data-testid="history">
            <h2 style={{ marginBottom: 16 }}>狀態時間軸</h2>
            <ul className="timeline">
              {r.history
                .slice()
                .reverse()
                .map(e => (
                  <li key={e.id}>
                    <span className="tl-dot" />
                    <StatusChip status={e.to} />
                    {e.from && e.from !== e.to && <span className="small muted"> ← {STATUS_META[e.from].label}</span>}
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {users.name(e.actorId)}・{fmtDateTime(e.at)}
                    </div>
                    {e.reason && <div className="small" style={{ color: 'var(--text-2)' }}>{e.reason}</div>}
                  </li>
                ))}
            </ul>
            <p className="small muted" style={{ margin: 0 }}>
              記錄操作者、時間、前後狀態與理由，不可刪改（AC-04C）
            </p>
          </section>
          <Button tone="ghost" onClick={reload} style={{ alignSelf: 'flex-start' }}>
            <Icon name="refresh" size={14} /> 重新載入
          </Button>
        </div>
      </div>
    </div>
  )
}

function Records({ r }: { r: Detail }) {
  const users = useUsers()
  const ev = r.evaluation
  return (
    <>
      <div className="section-label">評估紀錄</div>
      {ev ? (
        <p>
          影響 {ev.scores.impact}・急迫 {ev.scores.urgency}・策略 {ev.scores.strategy}・成本 {ev.scores.cost}（合計 {ev.scores.impact + ev.scores.urgency + ev.scores.strategy + ev.scores.cost} / 12）
          <br />
          {ev.rationale}
          {ev.effort && <><br />技術初估：{ev.effort}</>}
          <br />
          <span className="small muted">
            {users.name(ev.reviewerId)}・{fmtDateTime(ev.at)}
          </span>
        </p>
      ) : (
        <p className="muted">尚未評估</p>
      )}
      <div className="section-label">測試紀錄（{r.testRuns.length}）</div>
      {r.testRuns.length === 0 && <p className="muted">尚無測試紀錄</p>}
      {r.testRuns
        .slice()
        .reverse()
        .map(t => (
          <div key={t.id} className="card" style={{ padding: 12, marginBottom: 10, boxShadow: 'none' }}>
            <div className="row">
              <b>{t.build}</b>
              <span className="chip" style={t.result === 'PASS' ? { background: '#dcfae6', color: '#067647' } : { background: '#fee4e2', color: '#b42318' }}>
                {t.result === 'PASS' ? '通過' : '失敗'}
              </span>
              <span className="spacer" />
              <span className="small muted">
                {users.name(t.testerId)}・{fmtDateTime(t.at)}
              </span>
            </div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {t.cases.map((c, i) => (
                <li key={i}>
                  {c.caseName}：<span className={c.result === 'PASS' ? 'success-text' : 'danger-text'}>{c.result === 'PASS' ? '通過' : '失敗'}</span>
                </li>
              ))}
            </ul>
            {t.defectRef && <div className="small danger-text">缺陷：{t.defectRef}</div>}
            {t.evidence && <div className="small">證據：{t.evidence}</div>}
          </div>
        ))}
      <div className="section-label">業務驗收（{r.uatResults.length}）</div>
      {r.uatResults.length === 0 && <p className="muted">尚無驗收紀錄</p>}
      {r.uatResults.map(u => (
        <p key={u.id}>
          <b className={u.result === 'PASS' ? 'success-text' : 'danger-text'}>{u.result === 'PASS' ? '通過' : '退回'}</b>
          {u.reason && `：${u.reason}`}
          <br />
          <span className="small muted">
            {users.name(u.reviewerId)}・{fmtDateTime(u.at)}
          </span>
        </p>
      ))}
      {r.delivery && (
        <>
          <div className="section-label">交付證據</div>
          <p>
            版本 {r.delivery.build}・上線 {fmtDate(r.delivery.releaseDate)}
            {r.delivery.note && `・${r.delivery.note}`}
          </p>
        </>
      )}
    </>
  )
}

function Comments({ r }: { r: Detail }) {
  const users = useUsers()
  const me = useMe()
  const [body, setBody] = useState('')
  const post = useMutation(() => api.post(`/api/requirements/${r.id}/comments`, { body }))
  const mentionMatch = /@([^\s@]*)$/.exec(body)
  const suggestions = mentionMatch ? users.list.filter(u => u.status === '啟用' && u.role !== 'Admin' && u.name.includes(mentionMatch[1])).slice(0, 5) : []
  const render = (text: string) =>
    text.split(/(@\S+)/g).map((part, i) =>
      part.startsWith('@') && users.list.some(u => part.startsWith(`@${u.name}`)) ? (
        <b key={i} style={{ color: 'var(--primary)' }}>
          {part}
        </b>
      ) : (
        part
      ),
    )
  return (
    <section className="card card-pad" data-testid="comments">
      <h2 style={{ marginBottom: 16 }}>留言 {r.comments.length}</h2>
      <div className="stack" style={{ gap: 16, marginBottom: 16 }}>
        {r.comments.map(c => {
          const u = users.byId.get(c.authorId)
          return (
            <div key={c.id} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <Avatar name={u?.name ?? '?'} />
              <div style={{ flex: 1 }}>
                <div>
                  <b>{u?.name}</b>{' '}
                  <span className="small muted">
                    {u?.role}・{relTime(c.at)}
                    {c.editedAt && '（已編輯）'}
                  </span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{render(c.body)}</div>
              </div>
            </div>
          )
        })}
        {r.comments.length === 0 && <p className="muted small" style={{ margin: 0 }}>還沒有留言。</p>}
      </div>
      {r.canComment ? (
        <form
          onSubmit={async e => {
            e.preventDefault()
            if (!body.trim()) return
            if (await post.run()) setBody('')
          }}
          style={{ position: 'relative' }}
        >
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Avatar name={me.name} />
            <textarea className="textarea" rows={2} value={body} onChange={e => setBody(e.target.value)} placeholder="輸入留言，使用 @ 提及同事…" aria-label="留言" style={{ minHeight: 44 }} data-testid="comment-input" />
            <Button tone="primary" type="submit" disabled={!body.trim() || post.pending} data-testid="comment-send">
              送出
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="menu" style={{ left: 44, right: 'auto', top: 'auto', bottom: '100%' }}>
              {suggestions.map(u => (
                <button key={u.id} type="button" onClick={() => setBody(body.replace(/@([^\s@]*)$/, `@${u.name} `))}>
                  @{u.name} <span className="small muted">{u.role}</span>
                </button>
              ))}
            </div>
          )}
          {post.error && <div className="error-msg">{post.error.message}</div>}
          <div className="hint" style={{ marginLeft: 44 }}>
            被 @提及的人會收到通知；留言 15 分鐘內可編輯、不可刪除。
          </div>
        </form>
      ) : (
        <p className="small muted">你的角色不能留言。</p>
      )}
    </section>
  )
}

// ─── S08／S09 操作面板 ──────────────────────────────────────────────────

function ActionPanel({ r, action, onClose, reload }: { r: Detail; action: ActionKey; onClose: () => void; reload: () => void }) {
  const toast = useToast()
  const [conflict, setConflict] = useState(false)
  const m = useMutation((body: Record<string, unknown>) => api.post<Detail>(`/api/requirements/${r.id}/actions/${action}`, { ...body, version: r.version }))
  const submit = async (body: Record<string, unknown>, msg: string) => {
    setConflict(false)
    const res = await m.run(body)
    if (res) {
      toast(msg)
      onClose()
    } else if (m.error?.code === 'CONFLICT') setConflict(true)
  }
  const common = { r, onClose, submit, pending: m.pending, error: m.error, conflict: conflict || m.error?.code === 'CONFLICT', reload: () => (reload(), onClose()) }
  switch (action) {
    case 'accept':
      return <AcceptDialog {...common} />
    case 'startDev':
      return <StartDevDialog {...common} />
    case 'recordTest':
      return <QaDrawer {...common} />
    case 'uat':
      return <UatDrawer {...common} />
    case 'close':
      return <CloseDrawer {...common} />
    case 'submitTest':
      return <SubmitTestDialog {...common} />
    case 'changeCommitted':
      return <ChangeDateDialog {...common} />
    case 'markDuplicate':
      return <DuplicateDialog {...common} />
    case 'reassignPm':
      return <ReassignDialog {...common} />
    default:
      return <ReasonDialog {...common} action={action} />
  }
}

interface PanelProps {
  r: Detail
  onClose: () => void
  submit: (body: Record<string, unknown>, msg: string) => Promise<void>
  pending: boolean
  error: ApiFailure | null
  conflict: boolean
  reload: () => void
}

function PanelErrors({ error, conflict, reload }: Pick<PanelProps, 'error' | 'conflict' | 'reload'>) {
  if (conflict) return <ConflictBanner onReload={reload} />
  return <FormError error={error} />
}

/** 「要求補件」「不採納」「撤回」「重新開啟」「取消」共用精簡對話框：只有必填原因（S08 註 4） */
function ReasonDialog({ r, onClose, submit, pending, error, conflict, reload, action }: PanelProps & { action: ActionKey }) {
  const users = useUsers()
  const [reason, setReason] = useState('')
  const [approved, setApproved] = useState(false)
  const cfg: Partial<Record<ActionKey, { title: string; label: string; placeholder: string; tone: 'primary' | 'danger'; btn: string; note: string }>> = {
    requestInfo: { title: '要求補件', label: '需要補充的資訊', placeholder: '具體說明缺少什麼，例如：影響客戶數、目前人工作業步驟', tone: 'primary', btn: '送出補件要求', note: `送出後狀態變為「待補件」，並通知提出人 ${users.name(r.reporterId)}。` },
    reject: { title: '不採納', label: '不採納理由', placeholder: '說明不採納的原因，提出人會看到這段文字', tone: 'danger', btn: '確認不採納', note: `送出後通知提出人 ${users.name(r.reporterId)}，需求結束但保留紀錄。` },
    withdraw: { title: '撤回需求', label: '撤回原因', placeholder: '例如：客戶已不需要', tone: 'danger', btn: '確認撤回', note: '撤回後狀態變為「已取消」，受理 PM 會收到通知。' },
    reopen: { title: '重新開啟', label: '重新開啟原因', placeholder: '說明為何重新開啟；新範圍請另建需求', tone: 'primary', btn: '確認重新開啟', note: '保留原結案與驗收事件，需求回到「待評估」另起新一輪處理（AC-05D）。' },
    cancel: { title: '取消需求', label: '取消理由', placeholder: '說明取消原因', tone: 'danger', btn: '確認取消', note: '取消需決策者同意，會通知所有相關人。' },
  }
  const c = cfg[action]!
  const fieldErr = error?.fields.reason
  return (
    <Dialog kicker={r.no} title={c.title} sub={r.title} onClose={onClose} testId={`dialog-${action}`}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone={c.tone} disabled={pending || !reason.trim() || (action === 'cancel' && !approved)} onClick={() => submit({ reason, approved }, `${c.title}：已送出`)} data-testid="dialog-confirm">
            {c.btn}
          </Button>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <TextArea label={c.label} required value={reason} onChange={setReason} placeholder={c.placeholder} rows={4} error={fieldErr} autoFocus data-testid="dialog-reason" />
      {action === 'cancel' && <Checkbox checked={approved} onChange={setApproved} error={error?.fields.approved}>決策者已同意取消</Checkbox>}
      <div className="banner neutral small">{c.note}</div>
    </Dialog>
  )
}

/** S08-A 接受需求：計分為排序參考，不自動決定優先級；說明必填 */
function AcceptDialog({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const users = useUsers()
  const [scores, setScores] = useState<Record<string, number>>({})
  const [priority, setPriority] = useState('')
  const [effort, setEffort] = useState('')
  const [rationale, setRationale] = useState('')
  const dims: [string, string][] = [
    ['impact', '影響範圍'],
    ['urgency', '急迫性'],
    ['strategy', '策略價值'],
    ['cost', '技術成本（小＝3）'],
  ]
  const total = dims.reduce((s, [k]) => s + (scores[k] ?? 0), 0)
  const complete = dims.every(([k]) => scores[k]) && priority && rationale.trim()
  return (
    <Dialog kicker="S08-A" title="接受需求" sub={`${r.no} ${r.title}`} onClose={onClose} testId="dialog-accept"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={pending || !complete} onClick={() => submit({ scores, priority, effort, rationale }, '已接受，狀態變為待排程')} data-testid="dialog-confirm">
            確認接受
          </Button>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <div>
        <h3 style={{ marginBottom: 12 }}>評估計分（1–3 分，僅供排序參考）</h3>
        <div className="stack" style={{ gap: 10 }}>
          {dims.map(([k, label]) => (
            <div key={k} className="row">
              <span style={{ flex: 1 }}>{label}</span>
              <div className="seg" role="radiogroup" aria-label={label}>
                {[1, 2, 3].map(n => (
                  <button key={n} type="button" role="radio" aria-checked={scores[k] === n} className={scores[k] === n ? 'on' : ''} onClick={() => setScores(s => ({ ...s, [k]: n }))} data-testid={`score-${k}-${n}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-2)' }}>合計 {total} / 12</div>
        </div>
      </div>
      <div className="grid-2">
        <SelectField label="優先級" required value={priority} onChange={setPriority} options={PRIORITIES.map(p => ({ value: p, label: `${p}（${PRIORITY_HINT[p]}）` }))} hint="緊急／高／一般／低" error={error?.fields.priority} data-testid="f-priority" />
        <TextField label="技術初估（選填）" value={effort} onChange={setEffort} placeholder="約 3 人天" hint="由技術負責人提供" />
      </div>
      <TextArea label="評估說明" required value={rationale} onChange={setRationale} rows={3} error={error?.fields.rationale} placeholder="說明接受的理由，會寫入評估紀錄供日後追溯" data-testid="f-rationale" />
      <div className="banner neutral small">
        <div>
          接受後狀態變為「待排程」，會通知提出人 {users.name(r.reporterId)}。
          <br />
          接受不代表立即開發，開發前仍需指派負責人與承諾日期。
        </div>
      </div>
    </Dialog>
  )
}

/** S08-B 開始開發：四項齊全才能開始（AC-03C），按鈕上方明確列出尚缺項目 */
function StartDevDialog({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const users = useUsers()
  const [assigneeId, setAssignee] = useState(r.assigneeId)
  const [committedDate, setDate] = useState(r.committedDate)
  const [ac, setAc] = useState<string[]>(r.acceptanceCriteria.length ? [...r.acceptanceCriteria, ''] : [''])
  const [uatReviewerId, setUat] = useState(r.uatReviewerId || r.reporterId)
  const [techConfirmed, setTech] = useState(false)
  const today = taipeiDate(new Date())
  const acClean = ac.map(a => a.trim()).filter(Boolean)
  const missing = [
    !assigneeId && '開發負責人',
    !(committedDate && committedDate >= today) && '承諾日期',
    acClean.length < 2 && '驗收條件',
    !uatReviewerId && '業務驗收者',
    !techConfirmed && '技術確認',
  ].filter(Boolean) as string[]
  return (
    <Dialog kicker="S08-B" title="開始開發" sub={<>狀態：待排程 → 開發中・{r.no}</>} onClose={onClose} wide testId="dialog-startDev"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={pending || missing.length > 0} onClick={() => submit({ assigneeId, committedDate, acceptanceCriteria: acClean, uatReviewerId, techConfirmed }, '已開始開發，負責人已收到通知')} data-testid="dialog-confirm">
            開始開發
          </Button>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <div className="grid-2">
        <SelectField label="開發負責人" required value={assigneeId} onChange={setAssignee} options={users.list.filter(u => u.role === 'Developer' && u.status === '啟用').map(u => ({ value: u.id, label: u.name }))} error={error?.fields.assigneeId} data-testid="f-assignee" />
        <TextField label="承諾日期" required type="date" value={committedDate} onChange={setDate} min={today} hint={`已與技術負責人確認・建議不早於 ${fmtShort(addWorkingDays(today, 5))}`} error={error?.fields.committedDate} data-testid="f-committed" />
      </div>
      <Field label="驗收條件（AC）" required error={acClean.length < 2 && ac.some(a => a.trim()) ? '至少需要 2 條可驗證的驗收條件' : error?.fields.acceptanceCriteria}>
        {() => (
          <div className="stack" style={{ gap: 8 }} data-testid="f-ac">
            {ac.map((a, i) => (
              <div key={i} className="row">
                <span className="muted" style={{ width: 20 }}>
                  {i + 1}.
                </span>
                <input
                  className="input"
                  value={a}
                  placeholder="輸入下一條…"
                  aria-label={`驗收條件 ${i + 1}`}
                  onChange={e => {
                    const next = [...ac]
                    next[i] = e.target.value
                    if (i === ac.length - 1 && e.target.value) next.push('')
                    setAc(next)
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Field>
      <div className="grid-2" style={{ alignItems: 'center' }}>
        <SelectField label="業務驗收者" required value={uatReviewerId} onChange={setUat} options={users.list.filter(u => u.role === 'Business' && u.status === '啟用').map(u => ({ value: u.id, label: u.name }))} hint="預設為提出人，可改派" />
        <Checkbox checked={techConfirmed} onChange={setTech}>
          技術負責人已確認可行性
        </Checkbox>
      </div>
      {missing.length > 0 && (
        <div className="banner warn" data-testid="missing">
          <div>
            <b>尚缺：{missing.join('、')}</b>
            <div className="small">開發負責人、承諾日期、驗收條件、技術確認四項齊全才能開始開發（PRD AC-03C）</div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function SubmitTestDialog({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const [build, setBuild] = useState('')
  const [selfTested, setSelf] = useState(false)
  return (
    <Dialog kicker={r.no} title="提交測試版本" sub="狀態：開發中 → 待測試" onClose={onClose} testId="dialog-submitTest"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={pending || !build.trim() || !selfTested} onClick={() => submit({ build, selfTested }, '已提交測試版本，QA 已收到通知')} data-testid="dialog-confirm">
            提交測試
          </Button>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <TextField label="測試版本號" required value={build} onChange={setBuild} placeholder="例：v2.14.0-rc3" error={error?.fields.build} data-testid="f-build" />
      <Checkbox checked={selfTested} onChange={setSelf} error={error?.fields.selfTested}>
        已完成自測，驗收條件皆可驗證
      </Checkbox>
      <div className="section-label">驗收條件</div>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {r.acceptanceCriteria.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ol>
    </Dialog>
  )
}

function ChangeDateDialog({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const [date, setDate] = useState(r.committedDate)
  const [reason, setReason] = useState('')
  return (
    <Dialog kicker={r.no} title="變更承諾日期" sub={`目前承諾日期 ${fmtDate(r.committedDate)}`} onClose={onClose} testId="dialog-changeCommitted"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={pending || !reason.trim() || !date || date === r.committedDate} onClick={() => submit({ committedDate: date, reason }, '承諾日期已變更，提出人已收到通知')} data-testid="dialog-confirm">
            確認變更
          </Button>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <TextField label="新的承諾日期" required type="date" value={date} onChange={setDate} error={error?.fields.committedDate} />
      <TextArea label="變更原因" required value={reason} onChange={setReason} rows={3} error={error?.fields.reason} placeholder="時間軸會顯示新舊日期與原因（AC-03D）" data-testid="dialog-reason" />
    </Dialog>
  )
}

function DuplicateDialog({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const list = useQuery<{ items: { id: string; no: string; title: string }[] }>('/api/requirements', { tab: 'all', pageSize: 100 })
  const [main, setMain] = useState('')
  const [reason, setReason] = useState('')
  const options = (list.data?.items ?? []).filter(x => x.id !== r.id && x.no).map(x => ({ value: x.id, label: `${x.no} ${x.title}` }))
  return (
    <Dialog kicker={r.no} title="標記重複" sub="重複項轉為已取消，保留來源與客戶關聯" onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={pending || !main} onClick={() => submit({ duplicateOfId: main, reason }, '已標記重複')} data-testid="dialog-confirm">
            確認
          </Button>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <SelectField label="主需求" required value={main} onChange={setMain} options={options} error={error?.fields.duplicateOfId} />
      <TextArea label="說明（選填）" value={reason} onChange={setReason} rows={2} />
    </Dialog>
  )
}

function ReassignDialog({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const users = useUsers()
  const [pmId, setPm] = useState('')
  const [reason, setReason] = useState('')
  return (
    <Dialog kicker={r.no} title="改派受理 PM" sub={`目前受理 PM：${users.name(r.pmId)}`} onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={pending || !pmId || !reason.trim()} onClick={() => submit({ pmId, reason }, '已改派受理 PM')} data-testid="dialog-confirm">
            確認改派
          </Button>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <SelectField label="新的受理 PM" required value={pmId} onChange={setPm} options={users.list.filter(u => u.role === 'PM' && u.status === '啟用' && u.id !== r.pmId).map(u => ({ value: u.id, label: u.name }))} />
      <TextArea label="改派原因" required value={reason} onChange={setReason} rows={2} placeholder="例：請假代理、產品線調整" />
    </Dialog>
  )
}

/** S09-A QA 記錄測試結果：任一失敗必須關聯缺陷；有失敗案例時「通過」按鈕停用 */
function QaDrawer({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const lastBuild = useMemo(() => /測試版本\s*(\S+)/.exec([...r.history].reverse().find(e => e.to === 'IN_QA')?.reason ?? '')?.[1] ?? '', [r.history])
  const [build, setBuild] = useState(lastBuild)
  const [cases, setCases] = useState(() => r.acceptanceCriteria.map((a, i) => ({ caseName: `TC-${String(i + 1).padStart(2, '0')} ${a}`, result: 'PASS' as 'PASS' | 'FAIL' })))
  const [defectRef, setDefect] = useState('')
  const [evidence, setEvidence] = useState('')
  const failed = cases.some(c => c.result === 'FAIL')
  return (
    <Drawer kicker="S09-A・QA" title="記錄測試結果" sub={`${r.no} ${r.title}`} onClose={onClose} testId="drawer-qa"
      footer={
        <>
          <Button tone="primary" block disabled={pending || failed || !build.trim() || cases.length === 0} onClick={() => submit({ build, cases, result: 'PASS', evidence }, '測試通過，已送業務驗收')} data-testid="qa-pass">
            測試通過，送業務驗收
          </Button>
          <Button tone="danger" block disabled={pending || !failed || !defectRef.trim() || !build.trim()} onClick={() => submit({ build, cases, result: 'FAIL', defectRef, evidence }, '測試失敗，已退回開發')} data-testid="qa-fail">
            測試失敗，退回開發
          </Button>
          <span className="hint">有失敗案例時「通過」按鈕停用；前次測試紀錄保留不覆寫（AC-05A）</span>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <TextField label="測試版本" required value={build} onChange={setBuild} error={error?.fields.build} data-testid="f-build" />
      <div className="card" style={{ boxShadow: 'none' }}>
        <table className="table">
          <thead>
            <tr>
              <th>案例</th>
              <th style={{ width: 120 }}>結果</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c, i) => (
              <tr key={i}>
                <td>
                  <input className="input" style={{ height: 32 }} value={c.caseName} onChange={e => setCases(cs => cs.map((x, j) => (j === i ? { ...x, caseName: e.target.value } : x)))} aria-label={`案例 ${i + 1}`} />
                </td>
                <td>
                  <div className="seg">
                    {(['PASS', 'FAIL'] as const).map(v => (
                      <button key={v} type="button" className={c.result === v ? 'on' : ''} style={{ minWidth: 44, height: 30, ...(c.result === v && v === 'FAIL' ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : {}) }} onClick={() => setCases(cs => cs.map((x, j) => (j === i ? { ...x, result: v } : x)))} data-testid={`case-${i}-${v}`}>
                        {v === 'PASS' ? '通過' : '失敗'}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-body" style={{ paddingTop: 8 }}>
          <Button tone="ghost" size="sm" onClick={() => setCases(cs => [...cs, { caseName: `TC-${String(cs.length + 1).padStart(2, '0')} `, result: 'PASS' }])}>
            + 新增案例
          </Button>
        </div>
      </div>
      <TextField label="缺陷連結" required={failed} value={defectRef} onChange={setDefect} placeholder="例：BUG-882 零稅率顯示為空白" error={error?.fields.defectRef ?? (failed && !defectRef.trim() ? '測試失敗必須關聯缺陷' : undefined)} data-testid="f-defect" />
      <TextField label="測試證據" value={evidence} onChange={setEvidence} placeholder="截圖或測試報告連結" />
    </Drawer>
  )
}

/** S09-B 業務驗收（UAT）：只有被指定的業務驗收者看得到（AC-05B） */
function UatDrawer({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const [checked, setChecked] = useState<boolean[]>(r.acceptanceCriteria.map(() => false))
  const [result, setResult] = useState<'PASS' | 'RETURN' | ''>('')
  const [reason, setReason] = useState('')
  const allChecked = checked.every(Boolean)
  const ok = result === 'PASS' ? allChecked : result === 'RETURN' ? !!reason.trim() : false
  return (
    <Drawer kicker="S09-B・業務驗收者" title="業務驗收（UAT）" sub="請用實際工作情境逐項確認：" onClose={onClose} testId="drawer-uat"
      footer={
        <Button tone="primary" block disabled={pending || !ok} onClick={() => submit({ result, checked, reason }, result === 'PASS' ? '驗收通過，已通知 PM 結案' : '已退回，PM 與開發負責人已收到通知')} data-testid="uat-submit">
          送出驗收結果
        </Button>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <div className="stack" style={{ gap: 8 }}>
        {r.acceptanceCriteria.map((a, i) => (
          <label key={i} className="checkbox card" style={{ padding: '12px 14px', boxShadow: 'none' }}>
            <input type="checkbox" checked={checked[i]} onChange={e => setChecked(c => c.map((x, j) => (j === i ? e.target.checked : x)))} data-testid={`uat-check-${i}`} />
            <span>{a}</span>
          </label>
        ))}
      </div>
      <Field label="結果" required>
        {() => (
          <div className="row" style={{ gap: 20 }} role="radiogroup">
            <label className="checkbox">
              <input type="radio" name="uat" checked={result === 'PASS'} onChange={() => setResult('PASS')} data-testid="uat-pass" /> 通過
            </label>
            <label className="checkbox">
              <input type="radio" name="uat" checked={result === 'RETURN'} onChange={() => setResult('RETURN')} data-testid="uat-return" /> 退回
            </label>
          </div>
        )}
      </Field>
      {result === 'PASS' && !allChecked && <div className="error-msg">選擇通過前，請逐項確認所有驗收條件</div>}
      {result === 'RETURN' && <TextArea label="退回原因" required value={reason} onChange={setReason} rows={4} placeholder="說明哪一項沒有達成，以及實際看到的情況" error={!reason.trim() ? '選擇退回時必填' : undefined} data-testid="dialog-reason" />}
      <div className="banner neutral small">退回後由 PM 判斷是缺陷（退回開發）或新範圍（另建需求）。</div>
    </Drawer>
  )
}

/** S09-C PM 結案：三項檢查皆完成才可結案（AC-05C） */
function CloseDrawer({ r, onClose, submit, pending, error, conflict, reload }: PanelProps) {
  const users = useUsers()
  const [build, setBuild] = useState('')
  const [releaseDate, setRelease] = useState(taipeiDate(new Date()))
  const [note, setNote] = useState('')
  const qa = [...r.testRuns].reverse()[0]
  const uat = [...r.uatResults].reverse()[0]
  const checks: { ok: boolean; label: string; meta: ReactNode }[] = [
    { ok: r.qaPassed, label: 'QA 測試通過', meta: qa ? `${fmtShort(taipeiDate(qa.at))} ${users.name(qa.testerId)}` : '尚未測試' },
    { ok: r.uatPassed, label: '業務驗收通過', meta: uat && r.uatPassed ? `${fmtShort(taipeiDate(uat.at))} ${users.name(uat.reviewerId)}` : '尚未通過' },
    { ok: !!build.trim(), label: '交付證據', meta: build.trim() ? build : '尚未提供' },
  ]
  const allOk = checks.every(c => c.ok)
  return (
    <Drawer kicker="S09-C・PM" title="結案" sub={`${r.no} ${r.title}`} onClose={onClose} testId="drawer-close"
      footer={
        <>
          <Button tone="primary" block disabled={pending || !allOk} onClick={() => submit({ build, releaseDate, note }, '已結案，提出人、工程、QA 已收到通知')} data-testid="close-confirm">
            確認結案
          </Button>
          <span className="hint">三項檢查皆完成才可結案（AC-05C）</span>
        </>
      }
    >
      <PanelErrors error={error} conflict={conflict} reload={reload} />
      <h3>結案前檢查</h3>
      <div className="stack" style={{ gap: 10 }} data-testid="close-checks">
        {checks.map(c => (
          <div key={c.label} className="row">
            <span className="avatar sm" style={{ background: c.ok ? 'var(--success-weak)' : 'var(--danger-weak)', color: c.ok ? 'var(--success)' : 'var(--danger)' }}>
              {c.ok ? '✓' : '!'}
            </span>
            <span style={{ flex: 1 }}>{c.label}</span>
            <span className={`small ${c.ok ? 'muted' : 'danger-text'}`}>{c.meta}</span>
          </div>
        ))}
      </div>
      <TextField label="交付版本" required value={build} onChange={setBuild} placeholder="例：v2.14.0" error={error?.fields.build} data-testid="f-build" />
      <TextField label="上線日期" type="date" value={releaseDate} onChange={setRelease} />
      <TextField label="備註（選填）" value={note} onChange={setNote} placeholder="給提出人的說明" />
    </Drawer>
  )
}
