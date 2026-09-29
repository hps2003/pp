// 期限、下一步說明、工作台與管理報表（PRD 7.3、FR-04、FR-06）。

import type { Database, Requirement, ReqStatus, User } from './types.ts'
import { ENDED_STATUSES, STATUS_META, canSeeRequirement, currentOwnerId } from './rules.ts'
import { addDays, addWorkingDays, fmtShort, taipeiDate, workingDaysBetween } from './time.ts'

export type DueKind = 'overdue' | 'soon' | 'ok' | 'none'
export interface DueState {
  kind: DueKind
  date: string
  /** overdue：逾期天數；soon：剩餘工作天 */
  days: number
  label: string
}

/** 承諾日期狀態：逾期或剩 2 個工作天內以紅字並寫出天數（S05 註 3） */
export function dueState(r: Pick<Requirement, 'committedDate' | 'status'>, today: string): DueState {
  if (!r.committedDate) return { kind: 'none', date: '', days: 0, label: '未設定' }
  if (ENDED_STATUSES.includes(r.status)) return { kind: 'ok', date: r.committedDate, days: 0, label: fmtShort(r.committedDate) }
  if (r.committedDate < today) {
    const days = Math.round((Date.parse(today) - Date.parse(r.committedDate)) / 86400000)
    return { kind: 'overdue', date: r.committedDate, days, label: `${fmtShort(r.committedDate)}・逾期 ${days} 天` }
  }
  const wd = workingDaysBetween(today, r.committedDate)
  if (wd <= 2) return { kind: 'soon', date: r.committedDate, days: wd, label: wd === 0 ? `${fmtShort(r.committedDate)}・今天到期` : `${fmtShort(r.committedDate)}・剩 ${wd} 天` }
  return { kind: 'ok', date: r.committedDate, days: wd, label: fmtShort(r.committedDate) }
}

export function isOverdue(r: Requirement, today: string): boolean {
  return dueState(r, today).kind === 'overdue'
}

function lastEventTo(r: Requirement, status: ReqStatus) {
  for (let i = r.history.length - 1; i >= 0; i--) if (r.history[i].to === status) return r.history[i]
  return undefined
}

/** 目前狀態的處理期限（工作台「期限」欄） */
export function stepDeadline(r: Requirement): string {
  const entered = lastEventTo(r, r.status)
  const since = entered ? taipeiDate(entered.at) : ''
  switch (r.status) {
    case 'PENDING_REVIEW':
      return since ? addWorkingDays(since, 3) : ''
    case 'NEED_INFO':
      return since ? addDays(since, 7) : ''
    case 'IN_UAT':
      return since ? addWorkingDays(since, 5) : ''
    case 'IN_DEV':
    case 'IN_QA':
      return r.committedDate
    default:
      return ''
  }
}

export function lastUatPassed(r: Requirement): boolean {
  const u = r.uatResults[r.uatResults.length - 1]
  const entered = lastEventTo(r, 'IN_UAT')
  return !!u && u.result === 'PASS' && (!entered || u.at >= entered.at)
}

export function lastQaPassed(r: Requirement): boolean {
  const t = r.testRuns[r.testRuns.length - 1]
  return !!t && t.result === 'PASS'
}

/** 「下一步」橫幅：一句話寫出誰要做什麼、期限何時（S07 註 3、US-03） */
export function nextStepText(db: Database, r: Requirement, today: string): string {
  const name = (id: string) => db.users.find(u => u.id === id)?.name ?? '—'
  const deadline = stepDeadline(r)
  const dl = deadline ? `，建議在 ${fmtShort(deadline)} 前完成` : ''
  const entered = lastEventTo(r, r.status)
  const since = entered ? workingDaysBetween(taipeiDate(entered.at), today) : 0
  switch (r.status) {
    case 'DRAFT':
      return `下一步：由提出人 ${name(r.reporterId)} 完成草稿並提交。草稿保留 30 天。`
    case 'PENDING_REVIEW':
      return `下一步：由受理 PM ${name(r.pmId)} 評估。提交後已 ${since} 個工作天${dl}。`
    case 'NEED_INFO':
      return `下一步：由提出人 ${name(r.reporterId)} 補充資訊（${entered?.reason || '見留言'}）${dl}。`
    case 'ACCEPTED':
      return `下一步：由受理 PM ${name(r.pmId)} 指派開發負責人、承諾日期與驗收條件後開始開發。`
    case 'IN_DEV':
      return `下一步：由開發負責人 ${name(r.assigneeId)} 開發並提交測試版本，承諾日期 ${fmtShort(r.committedDate)}。`
    case 'IN_QA':
      return `下一步：由 QA ${name(r.qaId)} 依驗收條件測試並記錄結果${dl}。`
    case 'IN_UAT':
      return lastUatPassed(r)
        ? `下一步：業務驗收已通過，由受理 PM ${name(r.pmId)} 確認交付證據後結案。`
        : `下一步：由業務驗收者 ${name(r.uatReviewerId)} 以實際工作情境執行 UAT${dl}。`
    case 'CLOSED':
      return `已結案。交付版本 ${r.delivery?.build ?? '—'}，上線日期 ${fmtShort(r.delivery?.releaseDate)}。`
    case 'REJECTED':
      return `不採納：${entered?.reason ?? ''}`
    case 'CANCELLED':
      return `已取消：${entered?.reason ?? ''}`
  }
}

/** 「需要你做的事」用動詞寫出下一步（S02 註 3） */
export function todoText(r: Requirement, me: User): string | null {
  const owner = currentOwnerId(r)
  if (r.status === 'IN_UAT' && r.pmId === me.id && lastUatPassed(r)) return '確認交付證據並結案'
  if (owner !== me.id) return null
  switch (r.status) {
    case 'DRAFT':
      return '完成草稿並提交'
    case 'NEED_INFO': {
      const reason = lastEventTo(r, 'NEED_INFO')?.reason ?? ''
      return `補充資訊${reason ? `：${reason.replace(/^請補充[:：]?/, '').slice(0, 18)}` : ''}`
    }
    case 'PENDING_REVIEW':
      return '評估：接受／補件／不採納'
    case 'ACCEPTED':
      return '指派開發負責人與承諾日期'
    case 'IN_DEV':
      return r.history[r.history.length - 1]?.from === 'IN_QA' || r.history[r.history.length - 1]?.from === 'IN_UAT' ? '修正退回項目並重新提交測試' : '開發並提交測試版本'
    case 'IN_QA':
      return '執行測試並記錄結果'
    case 'IN_UAT':
      return lastUatPassed(r) ? null : '執行 UAT'
    default:
      return null
  }
}

// ─── 工作台 ─────────────────────────────────────────────────────────────

export interface WorkbenchCard {
  key: string
  label: string
  count: number
  tone: 'danger' | 'warning' | 'neutral'
  ids: string[]
}

export function workbench(db: Database, me: User, today: string) {
  const visible = db.requirements.filter(r => canSeeRequirement(db, me, r))
  const open = visible.filter(r => !ENDED_STATUSES.includes(r.status) && r.status !== 'DRAFT')
  const dueSoon = (r: Requirement) => ['soon', 'overdue'].includes(dueState(r, today).kind)
  const mine = (ids: Requirement[]) => ids.map(r => r.id)

  let cards: WorkbenchCard[] = []
  if (me.role === 'Business') {
    const need = open.filter(r => r.status === 'NEED_INFO' && r.reporterId === me.id)
    const uat = open.filter(r => r.status === 'IN_UAT' && r.uatReviewerId === me.id && !lastUatPassed(r))
    const submitted = open.filter(r => r.reporterId === me.id)
    const soon = open.filter(r => dueSoon(r) && (r.reporterId === me.id || me.manager))
    cards = [
      { key: 'needinfo', label: '待我補件', count: need.length, tone: 'warning', ids: mine(need) },
      { key: 'uat', label: '待我驗收', count: uat.length, tone: 'warning', ids: mine(uat) },
      { key: 'submitted', label: '我提交・處理中', count: submitted.length, tone: 'neutral', ids: mine(submitted) },
      { key: 'soon', label: me.manager ? '即將逾期／已逾期' : '即將逾期', count: soon.length, tone: 'danger', ids: mine(soon) },
    ]
  } else if (me.role === 'PM') {
    const review = open.filter(r => r.status === 'PENDING_REVIEW' && r.pmId === me.id)
    const accepted = open.filter(r => r.status === 'ACCEPTED' && r.pmId === me.id)
    const toClose = open.filter(r => r.status === 'IN_UAT' && r.pmId === me.id && lastUatPassed(r))
    const overdue = open.filter(r => r.pmId === me.id && isOverdue(r, today))
    cards = [
      { key: 'review', label: '待評估', count: review.length, tone: 'warning', ids: mine(review) },
      { key: 'accepted', label: '待排程', count: accepted.length, tone: 'neutral', ids: mine(accepted) },
      { key: 'close', label: '待結案', count: toClose.length, tone: 'neutral', ids: mine(toClose) },
      { key: 'overdue', label: '逾期', count: overdue.length, tone: 'danger', ids: mine(overdue) },
    ]
  } else if (me.role === 'Developer') {
    const dev = open.filter(r => r.status === 'IN_DEV' && r.assigneeId === me.id)
    const returned = dev.filter(r => ['IN_QA', 'IN_UAT'].includes(r.history[r.history.length - 1]?.from as string))
    const soon = open.filter(r => r.assigneeId === me.id && dueSoon(r))
    cards = [
      { key: 'dev', label: '開發中', count: dev.length, tone: 'neutral', ids: mine(dev) },
      { key: 'returned', label: '退回待修正', count: returned.length, tone: 'warning', ids: mine(returned) },
      { key: 'soon', label: '即將逾期', count: soon.length, tone: 'danger', ids: mine(soon) },
    ]
  } else if (me.role === 'QA') {
    const qa = open.filter(r => r.status === 'IN_QA' && r.qaId === me.id)
    const weekAgo = addDays(today, -7)
    const tested = visible.filter(r => r.testRuns.some(t => t.testerId === me.id && taipeiDate(t.at) >= weekAgo))
    cards = [
      { key: 'qa', label: '待測試', count: qa.length, tone: 'warning', ids: mine(qa) },
      { key: 'tested', label: '近 7 天已測', count: tested.length, tone: 'neutral', ids: mine(tested) },
    ]
  }

  const todo = visible
    .map(r => ({ r, text: todoText(r, me) }))
    .filter((x): x is { r: Requirement; text: string } => !!x.text)
  // 業務追蹤：自己提交且承諾日即將到期（S02 列表最後一列）
  if (me.role === 'Business') {
    for (const r of open) {
      if (r.reporterId === me.id && dueSoon(r) && !todo.some(t => t.r.id === r.id)) todo.push({ r, text: '（追蹤）承諾日即將到期' })
    }
  }
  const todoRows = todo
    .map(({ r, text }) => {
      const deadline = r.status === 'IN_DEV' || r.status === 'IN_QA' || text.startsWith('（追蹤）') ? r.committedDate : stepDeadline(r)
      const ds = dueState({ committedDate: deadline, status: r.status }, today)
      return { id: r.id, no: r.no, title: r.title, status: r.status, todo: text, deadline, deadlineState: ds }
    })
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))

  // 最近更新：與我相關、由他人造成的異動
  const related = visible.filter(r => [r.reporterId, r.pmId, r.assigneeId, r.qaId, r.uatReviewerId].includes(me.id) || r.watcherIds.includes(me.id))
  const name = (id: string) => db.users.find(u => u.id === id)
  const verb: Partial<Record<ReqStatus, string>> = {
    PENDING_REVIEW: '提交了', NEED_INFO: '要求補件', ACCEPTED: '接受了', IN_DEV: '開始開發', IN_QA: '提交測試版本',
    IN_UAT: '測試通過', CLOSED: '結案了', REJECTED: '不採納', CANCELLED: '取消了',
  }
  const activity = related
    .flatMap(r => [
      ...r.history
        .filter(e => e.actorId !== me.id && e.to !== 'DRAFT')
        .map(e => {
          const u = name(e.actorId)
          const v = e.from === 'IN_QA' && e.to === 'IN_DEV' ? '測試失敗退回' : e.from === 'IN_UAT' && e.to === 'IN_DEV' ? '驗收退回' : verb[e.to]
          return { at: e.at, reqId: r.id, reqNo: r.no, text: `${roleWord(u)} ${u?.name ?? ''} ${v ?? STATUS_META[e.to].label}` }
        }),
      ...r.comments.filter(c => c.authorId !== me.id).map(c => {
        const u = name(c.authorId)
        return { at: c.at, reqId: r.id, reqNo: r.no, text: `${roleWord(u)} ${u?.name ?? ''} 留言` }
      }),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8)

  return { cards, todo: todoRows, activity }
}

function roleWord(u: User | undefined): string {
  if (!u) return ''
  return { Business: '業務', PM: 'PM', Developer: '工程', QA: 'QA', Admin: 'Admin' }[u.role]
}

// ─── 管理報表（FR-06） ──────────────────────────────────────────────────

export interface ReportQuery {
  from: string
  to: string
  type?: string
  ownerId?: string
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function report(db: Database, me: User, q: ReportQuery, today: string, now: Date) {
  // 統計與明細使用相同權限範圍（AC-06B）
  let scope = db.requirements.filter(r => r.status !== 'DRAFT' && canSeeRequirement(db, me, r))
  if (q.type) scope = scope.filter(r => r.type === q.type)
  if (q.ownerId) scope = scope.filter(r => r.pmId === q.ownerId || r.assigneeId === q.ownerId || r.reporterId === q.ownerId)

  const inRange = (iso: string) => {
    const d = taipeiDate(iso)
    return d >= q.from && d <= q.to
  }
  const firstEvent = (r: Requirement, pred: (to: ReqStatus) => boolean) => r.history.find(e => pred(e.to))

  // 新增需求量：期間內首次提交的唯一需求；取消仍計入
  const newItems = scope.filter(r => {
    const s = firstEvent(r, t => t === 'PENDING_REVIEW')
    return s && inRange(s.at)
  })
  // 目前逾期：查詢當下
  const overdueItems = scope.filter(r => isOverdue(r, today))
  // 評估耗時：首次提交 → 首次接受或不採納（工作天）
  const evalSamples = scope
    .map(r => {
      const s = firstEvent(r, t => t === 'PENDING_REVIEW')
      const d = firstEvent(r, t => t === 'ACCEPTED' || t === 'REJECTED')
      return s && d && inRange(d.at) ? { id: r.id, v: workingDaysBetween(taipeiDate(s.at), taipeiDate(d.at)) } : null
    })
    .filter((x): x is { id: string; v: number } => !!x)
  // 交付週期：首次接受 → 首次結案；另列重新開啟數
  const cycleSamples = scope
    .map(r => {
      const a = firstEvent(r, t => t === 'ACCEPTED')
      const c = firstEvent(r, t => t === 'CLOSED')
      return a && c && inRange(c.at) ? { id: r.id, v: workingDaysBetween(taipeiDate(a.at), taipeiDate(c.at)) } : null
    })
    .filter((x): x is { id: string; v: number } => !!x)
  const reopened = scope.filter(r => r.history.some(e => e.from === 'CLOSED')).length

  const countBy = <K extends string>(keys: readonly K[], f: (r: Requirement) => string) =>
    keys.map(k => ({ key: k, count: scope.filter(r => f(r) === k).length, ids: scope.filter(r => f(r) === k).map(r => r.id) }))

  // 週趨勢：新增 vs 結案
  const weeks: { start: string; created: number; closed: number }[] = []
  let ws = q.from
  while (ws <= q.to) {
    const we = addDays(ws, 6)
    const within = (iso?: string) => !!iso && taipeiDate(iso) >= ws && taipeiDate(iso) <= we
    weeks.push({
      start: ws,
      created: scope.filter(r => within(firstEvent(r, t => t === 'PENDING_REVIEW')?.at)).length,
      closed: scope.filter(r => within(firstEvent(r, t => t === 'CLOSED')?.at)).length,
    })
    ws = addDays(ws, 7)
  }

  return {
    query: q,
    timezone: 'Asia/Taipei',
    generatedAt: now.toISOString(),
    scopeSize: scope.length,
    newCount: { value: newItems.length, ids: newItems.map(r => r.id) },
    overdue: { value: overdueItems.length, ids: overdueItems.map(r => r.id) },
    evalTime: { median: median(evalSamples.map(s => s.v)), n: evalSamples.length, ids: evalSamples.map(s => s.id) },
    cycleTime: { median: median(cycleSamples.map(s => s.v)), n: cycleSamples.length, reopened, ids: cycleSamples.map(s => s.id) },
    byType: countBy(['功能', '缺陷', '改善'] as const, r => r.type),
    byStatus: countBy(Object.keys(STATUS_META).filter(s => s !== 'DRAFT') as ReqStatus[], r => r.status),
    byPriority: countBy(['緊急', '高', '一般', '低', ''] as const, r => r.priority),
    weeks,
  }
}
