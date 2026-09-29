// REST API 核心：路由 + 授權 + 狀態規則 + 稽核 + 通知。
// 同一份程式碼跑在兩個地方：
//   1. server/index.ts —— Node HTTP 伺服器（JSON 檔持久化）
//   2. src/api/local.ts —— 瀏覽器內建 API（localStorage 持久化，GitHub Pages 靜態部署時使用）
// 因此前端不論連哪一個，行為與 API 合約都一致。

import type {
  AuditLog, Client, Comment, Database, IntegrationSettings, Notification, Requirement, ReqStatus, TestRun, User, UserRef,
} from './types.ts'
import {
  ENDED_STATUSES, OPEN_STATUSES, PRIORITIES, actionDef, availableActions, can, canSeeRequirement, clientAccess, currentOwnerId,
  maskEmail, maskPhone, validateClient, validateRequirement, type ActionKey, type FieldErrors,
} from './rules.ts'
import { dueState, lastQaPassed, lastUatPassed, nextStepText, report, workbench } from './metrics.ts'
import { addDays, taipeiDate } from './time.ts'
import { createSeed } from './seed.ts'
import { runAutomation, syncExternalApi } from './automation.ts'

export interface ApiRequest {
  method: string
  path: string
  query?: Record<string, string>
  body?: unknown
  headers?: Record<string, string>
}

export interface ApiResponse {
  status: number
  body: unknown
}

export interface Backend {
  load(): Database
  save(db: Database): void
  now(): Date
  fetchJson(url: string): Promise<unknown>
  mode: 'server' | 'local'
}

export class ApiError extends Error {
  status: number
  code: string
  fields?: FieldErrors
  extra?: Record<string, unknown>
  constructor(status: number, code: string, message: string, fields?: FieldErrors, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
    this.extra = extra
  }
}

interface Ctx {
  db: Database
  now: Date
  today: string
  me: User | null
  backend: Backend
  dirty: boolean
  newAudit: AuditLog[]
  params: Record<string, string>
  query: Record<string, string>
  body: Record<string, unknown>
  headers: Record<string, string>
}

type Handler = (c: Ctx) => unknown | Promise<unknown>

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
  auth: boolean
}

const routes: Route[] = []

function route(method: string, path: string, handler: Handler, auth = true) {
  const keys: string[] = []
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`)
  routes.push({ method, pattern, keys, handler, auth })
}

// ─── 共用工具 ───────────────────────────────────────────────────────────

function id(db: Database, prefix: string): string {
  db.seq[prefix] = (db.seq[prefix] ?? 0) + 1
  return `${prefix}${Date.now().toString(36)}${db.seq[prefix]}`
}

function touch(c: Ctx) {
  c.dirty = true
}

function audit(c: Ctx, action: string, resourceType: string, resourceId: string, detail = '', result: 'ok' | 'denied' = 'ok') {
  const entry: AuditLog = {
    id: id(c.db, 'AU'), actorId: c.me?.id ?? '-', action, resourceType, resourceId, at: c.now.toISOString(), result, detail,
  }
  c.db.audit.unshift(entry)
  c.newAudit.push(entry)
  if (c.db.audit.length > 2000) c.db.audit.length = 2000
  c.dirty = true
}

function deny(c: Ctx, action: string, type: string, rid: string): never {
  audit(c, action, type, rid, '無權限', 'denied')
  // 回應不含任何資源資料（AC-01C）
  throw new ApiError(403, 'FORBIDDEN', '沒有權限執行此操作或查看此資料')
}

function me(c: Ctx): User {
  if (!c.me) throw new ApiError(401, 'UNAUTHENTICATED', '請先登入')
  return c.me
}

/** 站內通知（同一需求同一事件 10 分鐘內不重複，FR-04） */
export function notify(db: Database, now: Date, userIds: string[], text: string, reqId: string | undefined, event: string, kind: Notification['kind'] = 'event', exceptId?: string) {
  const uniq = [...new Set(userIds.filter(Boolean))].filter(u => u !== exceptId)
  for (const userId of uniq) {
    const user = db.users.find(u => u.id === userId)
    if (!user || user.status !== '啟用') continue
    const dedupKey = `${reqId ?? '-'}:${event}:${userId}`
    const dup = db.notifications.find(n => n.dedupKey === dedupKey && now.getTime() - Date.parse(n.at) < 10 * 60 * 1000)
    if (dup) continue
    db.notifications.unshift({ id: `N${now.getTime().toString(36)}${db.notifications.length}`, userId, reqId, text, kind, at: now.toISOString(), read: false, dedupKey })
  }
  if (db.notifications.length > 1000) db.notifications.length = 1000
}

function str(v: unknown, max = 5000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function userRef(u: User): UserRef {
  return { id: u.id, name: u.name, role: u.role, dept: u.dept, status: u.status, manager: u.manager }
}

function findReq(c: Ctx, rid: string, action = 'view'): Requirement {
  const r = c.db.requirements.find(x => x.id === rid || x.no === rid)
  if (!r) throw new ApiError(404, 'NOT_FOUND', '找不到這筆需求')
  if (!canSeeRequirement(c.db, me(c), r)) deny(c, action, 'requirement', rid)
  return r
}

function checkVersion(c: Ctx, current: number) {
  const v = c.body.version
  if (typeof v === 'number' && v !== current) {
    // 同時修改：後送出者收到衝突提示，不得靜默覆寫（PRD 7.4）
    throw new ApiError(409, 'CONFLICT', '這筆資料已被其他人更新，請重新載入後再送出。', undefined, { currentVersion: current })
  }
}

function clientNames(db: Database, r: Requirement): string[] {
  return r.clientIds.map(cid => db.clients.find(c => c.id === cid)?.name ?? '—')
}

function reqSummary(c: Ctx, r: Requirement) {
  return {
    id: r.id, no: r.no, title: r.title, type: r.type, status: r.status, priority: r.priority,
    clientNames: clientNames(c.db, r), ownerId: currentOwnerId(r), reporterId: r.reporterId, pmId: r.pmId, assigneeId: r.assigneeId,
    committedDate: r.committedDate, due: dueState(r, c.today), updatedAt: r.updatedAt, submittedAt: r.submittedAt,
    watching: c.me ? r.watcherIds.includes(c.me.id) : false,
  }
}

function reqDetail(c: Ctx, r: Requirement) {
  const u = me(c)
  const editableContent = r.reporterId === u.id && (r.status === 'DRAFT' || r.status === 'NEED_INFO')
  return {
    ...r,
    clientNames: clientNames(c.db, r),
    ownerId: currentOwnerId(r),
    due: dueState(r, c.today),
    nextStep: nextStepText(c.db, r, c.today),
    actions: availableActions(u, r).map(a => a.key),
    canEdit: editableContent,
    canComment: can.comment(u),
    qaPassed: lastQaPassed(r),
    uatPassed: lastUatPassed(r),
    duplicateOf: r.duplicateOfId ? (() => {
      const d = c.db.requirements.find(x => x.id === r.duplicateOfId)
      return d ? { id: d.id, no: d.no, title: d.title } : undefined
    })() : undefined,
  }
}

function clientDto(c: Ctx, cl: Client) {
  const u = me(c)
  const detail = can.viewContactDetail(u)
  return {
    ...cl,
    ownerName: c.db.users.find(x => x.id === cl.ownerId)?.name ?? '—',
    contacts: cl.contacts.map(ct => (detail ? ct : { ...ct, email: maskEmail(ct.email), phone: maskPhone(ct.phone) })),
    canEdit: can.editClient(u, cl),
    canArchive: can.archiveClient(u),
  }
}

// ─── 登入／工作階段 ─────────────────────────────────────────────────────

route('GET', '/api/health', c => ({ ok: true, mode: c.backend.mode, rev: c.db.rev, time: c.now.toISOString() }), false)

route('GET', '/api/auth/accounts', c => c.db.users.map(u => ({ ...userRef(u), email: u.email })), false)

route('POST', '/api/auth/login', c => {
  const u = c.db.users.find(x => x.id === c.body.userId || x.email === c.body.email)
  // 不透露帳號是否存在以外的資訊（S01 註 2）
  if (!u) throw new ApiError(401, 'SSO_FAILED', 'SSO 驗證失敗，請重新登入或聯繫 IT 服務台。')
  if (u.status !== '啟用') throw new ApiError(403, 'ACCOUNT_DISABLED', '此帳號已停用，無法登入')
  u.lastLogin = c.now.toISOString()
  c.me = u
  audit(c, 'login', 'user', u.id)
  return { token: u.id, user: userRef(u) }
}, false)

route('GET', '/api/auth/me', c => {
  const u = me(c)
  return { user: { ...userRef(u), email: u.email } }
})

route('GET', '/api/changes', c => ({ rev: c.db.rev, updatedAt: c.db.updatedAt }), false)

route('GET', '/api/meta', c => ({
  mode: c.backend.mode,
  rev: c.db.rev,
  updatedAt: c.db.updatedAt,
  counts: { users: c.db.users.length, clients: c.db.clients.length, requirements: c.db.requirements.length, notifications: c.db.notifications.length, audit: c.db.audit.length },
  automation: c.db.automation.slice(0, 20),
}))

// ─── 使用者／帳號（FR-07） ───────────────────────────────────────────────

route('GET', '/api/users', c => {
  const u = me(c)
  return c.db.users.map(x => (can.manageUsers(u) ? x : userRef(x)))
})

function validateUser(c: Ctx, body: Record<string, unknown>, selfId?: string): FieldErrors {
  const e: FieldErrors = {}
  if (str(body.name).trim().length < 1) e.name = '請填寫姓名'
  const email = str(body.email).trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = 'Email 格式不正確'
  else if (c.db.users.some(u => u.email === email && u.id !== selfId)) e.email = 'Email 已被使用'
  if (!['Business', 'PM', 'Developer', 'QA', 'Admin'].includes(str(body.role))) e.role = '請選擇角色'
  return e
}

route('POST', '/api/users', c => {
  const u = me(c)
  if (!can.manageUsers(u)) deny(c, 'create', 'user', '-')
  const e = validateUser(c, c.body)
  if (Object.keys(e).length) throw new ApiError(422, 'VALIDATION', '請修正標示的欄位', e)
  const nu: User = {
    id: id(c.db, 'U'), name: str(c.body.name).trim(), email: str(c.body.email).trim(), role: c.body.role as User['role'],
    manager: c.body.role === 'Business' && c.body.manager === true, dept: str(c.body.dept), status: '啟用', lastLogin: '',
  }
  c.db.users.push(nu)
  audit(c, 'create', 'user', nu.id, `${nu.name}（${nu.role}）`)
  return nu
})

route('PATCH', '/api/users/:id', c => {
  const u = me(c)
  if (!can.manageUsers(u)) deny(c, 'update', 'user', c.params.id)
  const target = c.db.users.find(x => x.id === c.params.id)
  if (!target) throw new ApiError(404, 'NOT_FOUND', '找不到使用者')
  const merged = { ...target, ...c.body }
  const e = validateUser(c, merged, target.id)
  if (Object.keys(e).length) throw new ApiError(422, 'VALIDATION', '請修正標示的欄位', e)
  if (target.id === u.id && merged.status === '停用') throw new ApiError(422, 'SELF_DISABLE', '不能停用自己的帳號')
  const changes: string[] = []
  for (const k of ['name', 'email', 'role', 'dept', 'status', 'manager'] as const) {
    if (k in c.body && (target as unknown as Record<string, unknown>)[k] !== c.body[k]) changes.push(`${k}: ${String((target as unknown as Record<string, unknown>)[k] ?? '')} → ${String(c.body[k])}`)
  }
  target.name = str(merged.name).trim()
  target.email = str(merged.email).trim()
  target.role = merged.role as User['role']
  target.dept = str(merged.dept)
  target.status = merged.status === '停用' ? '停用' : '啟用'
  target.manager = target.role === 'Business' && merged.manager === true
  audit(c, 'update', 'user', target.id, changes.join('；'))
  return target
})

route('GET', '/api/audit', c => {
  const u = me(c)
  if (!can.viewAudit(u)) deny(c, 'view', 'audit', '-')
  const q = (c.query.q ?? '').trim()
  const items = c.db.audit.filter(a => !q || `${a.action} ${a.resourceType} ${a.resourceId} ${a.detail}`.includes(q))
  return items.slice(0, Number(c.query.limit ?? 200))
})

// ─── 客戶（FR-01） ──────────────────────────────────────────────────────

route('GET', '/api/clients', c => {
  const u = me(c)
  if (!can.viewClientList(u)) deny(c, 'list', 'client', '-')
  const q = (c.query.q ?? '').trim().toLowerCase()
  return c.db.clients
    .filter(cl => clientAccess(u, cl) === 'full')
    .filter(cl => !q || cl.name.toLowerCase().includes(q) || cl.taxId.includes(q))
    .filter(cl => !c.query.status || cl.status === c.query.status)
    .filter(cl => !c.query.ownerId || cl.ownerId === c.query.ownerId)
    .map(cl => {
      const reqs = c.db.requirements.filter(r => r.clientIds.includes(cl.id) && r.status !== 'DRAFT')
      return {
        id: cl.id, name: cl.name, taxId: cl.taxId, ownerId: cl.ownerId, ownerName: c.db.users.find(x => x.id === cl.ownerId)?.name ?? '—',
        status: cl.status, industry: cl.industry, contactCount: cl.contacts.length,
        openReqs: reqs.filter(r => OPEN_STATUSES.includes(r.status)).length, totalReqs: reqs.length,
        lastInteraction: [...cl.interactions].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? '', updatedAt: cl.updatedAt,
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
})

/** 關聯需求時可選的客戶（未封存、範圍內） */
route('GET', '/api/clients/options', c => {
  const u = me(c)
  return c.db.clients.filter(cl => cl.status === '啟用' && clientAccess(u, cl) === 'full').map(cl => ({ id: cl.id, name: cl.name }))
})

function findClient(c: Ctx, cid: string, action = 'view'): Client {
  const cl = c.db.clients.find(x => x.id === cid)
  if (!cl) throw new ApiError(404, 'NOT_FOUND', '找不到這個客戶')
  if (clientAccess(me(c), cl) !== 'full') deny(c, action, 'client', cid)
  return cl
}

route('GET', '/api/clients/:id', c => {
  const cl = findClient(c, c.params.id)
  const u = me(c)
  const related = c.db.requirements.filter(r => r.clientIds.includes(cl.id) && r.status !== 'DRAFT')
  const visible = related.filter(r => canSeeRequirement(c.db, u, r))
  return {
    ...clientDto(c, cl),
    interactions: [...cl.interactions].sort((a, b) => b.date.localeCompare(a.date)),
    requirements: visible.map(r => reqSummary(c, r)),
    hiddenRequirements: related.length - visible.length,
  }
})

route('POST', '/api/clients', c => {
  const u = me(c)
  if (!can.editClient(u)) deny(c, 'create', 'client', '-')
  const input = { name: str(c.body.name).trim(), taxId: str(c.body.taxId).trim(), ownerId: str(c.body.ownerId) || u.id, industry: str(c.body.industry) }
  if (!u.manager && input.ownerId !== u.id) throw new ApiError(422, 'VALIDATION', '只能建立自己負責的客戶', { ownerId: '只有業務主管可指定其他負責業務' })
  const { errors, similar } = validateClient(c.db, input)
  if (Object.keys(errors).length) throw new ApiError(422, 'VALIDATION', '請修正標示的欄位', errors)
  // 名稱相似：提示可能重複，確認後可建立，不自動合併（AC-01B）
  if (similar.length && c.body.confirmSimilar !== true) throw new ApiError(409, 'SIMILAR', '可能與既有客戶重複', undefined, { similar })
  const now = c.now.toISOString()
  const cl: Client = { id: id(c.db, 'C'), ...input, status: '啟用', contacts: [], interactions: [], createdAt: now, updatedAt: now, version: 1 }
  c.db.clients.push(cl)
  audit(c, 'create', 'client', cl.id, cl.name)
  return clientDto(c, cl)
})

route('PATCH', '/api/clients/:id', c => {
  const u = me(c)
  const cl = findClient(c, c.params.id, 'update')
  if (!can.editClient(u, cl)) deny(c, 'update', 'client', cl.id)
  checkVersion(c, cl.version)
  const input = {
    name: 'name' in c.body ? str(c.body.name).trim() : cl.name,
    taxId: 'taxId' in c.body ? str(c.body.taxId).trim() : cl.taxId,
    ownerId: 'ownerId' in c.body ? str(c.body.ownerId) : cl.ownerId,
    industry: 'industry' in c.body ? str(c.body.industry) : cl.industry,
  }
  if (input.ownerId !== cl.ownerId && !can.archiveClient(u)) deny(c, 'changeOwner', 'client', cl.id)
  const { errors } = validateClient(c.db, input, cl.id)
  if (Object.keys(errors).length) throw new ApiError(422, 'VALIDATION', '請修正標示的欄位', errors)
  const ownerChanged = input.ownerId !== cl.ownerId
  Object.assign(cl, input, { updatedAt: c.now.toISOString(), version: cl.version + 1 })
  audit(c, ownerChanged ? 'changeOwner' : 'update', 'client', cl.id, ownerChanged ? `負責業務 → ${c.db.users.find(x => x.id === input.ownerId)?.name}` : '')
  if (ownerChanged) notify(c.db, c.now, [input.ownerId], `你成為「${cl.name}」的負責業務`, undefined, `owner:${cl.id}`, 'event', u.id)
  return clientDto(c, cl)
})

route('POST', '/api/clients/:id/archive', c => {
  const u = me(c)
  const cl = findClient(c, c.params.id, 'archive')
  if (!can.archiveClient(u)) deny(c, 'archive', 'client', cl.id)
  const archived = c.body.archived !== false
  cl.status = archived ? '封存' : '啟用'
  cl.updatedAt = c.now.toISOString()
  cl.version++
  audit(c, archived ? 'archive' : 'unarchive', 'client', cl.id, cl.name)
  return clientDto(c, cl)
})

route('POST', '/api/clients/:id/contacts', c => {
  const u = me(c)
  const cl = findClient(c, c.params.id, 'update')
  if (!can.editClient(u, cl)) deny(c, 'update', 'client', cl.id)
  const e: FieldErrors = {}
  if (!str(c.body.name).trim()) e.name = '請填寫姓名'
  const email = str(c.body.email).trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = 'Email 格式不正確'
  if (Object.keys(e).length) throw new ApiError(422, 'VALIDATION', '請修正標示的欄位', e)
  const contactId = str(c.body.id)
  const data = { name: str(c.body.name).trim(), title: str(c.body.title), email, phone: str(c.body.phone) }
  if (contactId) {
    const ct = cl.contacts.find(x => x.id === contactId)
    if (!ct) throw new ApiError(404, 'NOT_FOUND', '找不到聯絡人')
    Object.assign(ct, data)
  } else cl.contacts.push({ id: id(c.db, 'CT'), ...data })
  cl.updatedAt = c.now.toISOString()
  cl.version++
  audit(c, contactId ? 'updateContact' : 'addContact', 'client', cl.id, data.name)
  return clientDto(c, cl)
})

route('DELETE', '/api/clients/:id/contacts/:cid', c => {
  const u = me(c)
  const cl = findClient(c, c.params.id, 'update')
  if (!can.editClient(u, cl)) deny(c, 'update', 'client', cl.id)
  cl.contacts = cl.contacts.filter(x => x.id !== c.params.cid)
  cl.updatedAt = c.now.toISOString()
  cl.version++
  audit(c, 'removeContact', 'client', cl.id, c.params.cid)
  return clientDto(c, cl)
})

route('POST', '/api/clients/:id/interactions', c => {
  const u = me(c)
  const cl = findClient(c, c.params.id, 'addInteraction')
  if (!can.editClient(u, cl)) deny(c, 'addInteraction', 'client', cl.id)
  if (cl.status === '封存') throw new ApiError(422, 'ARCHIVED', '客戶已封存，不能新增互動紀錄（歷史資料仍可查詢）')
  const summary = str(c.body.summary).trim()
  if (summary.length < 1 || summary.length > 1000) throw new ApiError(422, 'VALIDATION', '請修正標示的欄位', { summary: '摘要需 1–1,000 字' })
  cl.interactions.push({
    id: id(c.db, 'I'), date: str(c.body.date) || c.today, actorId: u.id,
    channel: (['面談', '電話', 'Email', 'LINE', '系統'].includes(str(c.body.channel)) ? c.body.channel : '面談') as Client['interactions'][number]['channel'],
    summary, next: str(c.body.next, 500), source: 'manual',
  })
  cl.updatedAt = c.now.toISOString()
  cl.version++
  audit(c, 'addInteraction', 'client', cl.id)
  return { ok: true }
})

// ─── 需求（FR-02／03／04／05） ──────────────────────────────────────────

route('GET', '/api/requirements', c => {
  const u = me(c)
  const q = c.query
  let items = c.db.requirements.filter(r => canSeeRequirement(c.db, u, r))
  const tab = q.tab ?? 'all'
  if (tab === 'mine') items = items.filter(r => r.reporterId === u.id)
  if (tab === 'assigned') items = items.filter(r => currentOwnerId(r) === u.id || [r.pmId, r.assigneeId, r.qaId, r.uatReviewerId].includes(u.id))
  if (tab === 'watching') items = items.filter(r => r.watcherIds.includes(u.id))
  if (tab !== 'mine') items = items.filter(r => r.status !== 'DRAFT' || r.reporterId === u.id)
  if (q.q) {
    const s = q.q.trim().toLowerCase()
    items = items.filter(r => r.no.toLowerCase().includes(s) || r.title.toLowerCase().includes(s) || clientNames(c.db, r).some(n => n.toLowerCase().includes(s)))
  }
  if (q.status) {
    const set = q.status.split(',').flatMap(s => (s === 'open' ? OPEN_STATUSES : s === 'ended' ? ENDED_STATUSES : [s as ReqStatus]))
    items = items.filter(r => set.includes(r.status))
  }
  if (q.type) items = items.filter(r => q.type.split(',').includes(r.type))
  if (q.priority) items = items.filter(r => q.priority.split(',').includes(r.priority || 'none'))
  if (q.owner) items = items.filter(r => currentOwnerId(r) === q.owner)
  if (q.client) items = items.filter(r => r.clientIds.includes(q.client))
  if (q.ids) items = items.filter(r => q.ids.split(',').includes(r.id))
  if (q.due) items = items.filter(r => q.due.split(',').includes(dueState(r, c.today).kind))
  const sort = q.sort ?? 'updated'
  items.sort((a, b) =>
    sort === 'committed' ? (a.committedDate || '9999').localeCompare(b.committedDate || '9999')
      : sort === 'no' ? b.no.localeCompare(a.no)
        : b.updatedAt.localeCompare(a.updatedAt))
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)))
  const page = Math.max(1, Number(q.page ?? 1))
  return { items: items.slice((page - 1) * pageSize, page * pageSize).map(r => reqSummary(c, r)), total: items.length, page, pageSize }
})

route('GET', '/api/requirements/:id', c => reqDetail(c, findReq(c, c.params.id)))

function contentFields(body: Record<string, unknown>) {
  const out: Partial<Requirement> = {}
  const s = (k: keyof Requirement, max = 2000) => {
    if (k in body) (out as Record<string, unknown>)[k] = str(body[k as string], max)
  }
  s('title', 100); s('type'); s('problem'); s('expected'); s('impactScope'); s('impactNote', 500); s('urgency'); s('urgencyNote', 500); s('expectedDate', 10); s('pmId', 40)
  if (Array.isArray(body.clientIds)) out.clientIds = body.clientIds.filter((x): x is string => typeof x === 'string')
  return out
}

function newNumber(db: Database, now: Date): string {
  const ym = taipeiDate(now).slice(0, 7).replace('-', '')
  db.seq[ym] = (db.seq[ym] ?? 0) + 1
  return `REQ-${ym}-${String(db.seq[ym]).padStart(4, '0')}`
}

function pushEvent(c: Ctx, r: Requirement, to: ReqStatus, reason: string) {
  r.history.push({ id: id(c.db, 'EV'), from: r.status, to, actorId: me(c).id, at: c.now.toISOString(), reason })
  r.status = to
}

function submitReq(c: Ctx, r: Requirement) {
  const u = me(c)
  const errors = validateRequirement(c.db, u, r, c.now)
  if (Object.keys(errors).length) throw new ApiError(422, 'VALIDATION', '請完成必填欄位後再提交', errors)
  r.no = r.no || newNumber(c.db, c.now)
  r.submittedAt = c.now.toISOString()
  pushEvent(c, r, 'PENDING_REVIEW', '提交')
  notify(c.db, c.now, [r.pmId], `${u.name} 提交了 ${r.no}「${r.title}」，請評估`, r.id, 'submit', 'event', u.id)
}

route('POST', '/api/requirements', c => {
  const u = me(c)
  if (!can.submitRequirement(u)) deny(c, 'create', 'requirement', '-')
  // 同一次提交因網路重試送出多次 → 只建立一筆（AC-02B）
  const key = c.headers['idempotency-key']
  if (key && c.db.idempotency[key]) {
    const existing = c.db.requirements.find(r => r.id === c.db.idempotency[key])
    if (existing) return reqDetail(c, existing)
  }
  const now = c.now.toISOString()
  const defaultPm = c.db.users.find(x => x.role === 'PM' && x.status === '啟用')
  const r: Requirement = {
    id: id(c.db, 'R'), no: '', clientIds: [], title: '', type: '功能', problem: '', expected: '', impactScope: '', impactNote: '',
    urgency: '', urgencyNote: '', priority: '', status: 'DRAFT', reporterId: u.id, pmId: defaultPm?.id ?? '', assigneeId: '', qaId: '',
    uatReviewerId: u.id, expectedDate: '', committedDate: '', acceptanceCriteria: [], techConfirmed: false, testRuns: [], uatResults: [],
    history: [], dateChanges: [], comments: [], watcherIds: [], submittedAt: '', createdAt: now, updatedAt: now, version: 1,
    ...contentFields(c.body),
  }
  r.history.push({ id: id(c.db, 'EV'), from: '', to: 'DRAFT', actorId: u.id, at: now, reason: '建立草稿' })
  if (c.body.submit === true) submitReq(c, r)
  c.db.requirements.push(r)
  if (key) c.db.idempotency[key] = r.id
  audit(c, r.status === 'DRAFT' ? 'createDraft' : 'submit', 'requirement', r.id, r.no)
  return reqDetail(c, r)
})

route('PATCH', '/api/requirements/:id', c => {
  const u = me(c)
  const r = findReq(c, c.params.id, 'update')
  checkVersion(c, r.version)
  const isReporterEdit = r.reporterId === u.id && (r.status === 'DRAFT' || r.status === 'NEED_INFO')
  const isPm = u.role === 'PM' && r.pmId === u.id
  const content = contentFields(c.body)
  const touchesContent = Object.keys(content).length > 0
  if (touchesContent && !isReporterEdit) deny(c, 'update', 'requirement', r.id)
  if (touchesContent && r.status !== 'DRAFT') {
    // 補件時只允許修改內容欄位，仍需通過檢核
    const merged = { ...r, ...content }
    const errors = validateRequirement(c.db, u, merged, c.now)
    if (Object.keys(errors).length) throw new ApiError(422, 'VALIDATION', '請修正標示的欄位', errors)
  }
  const pmFields = ['priority', 'uatReviewerId', 'acceptanceCriteria'] as const
  const touchesPm = pmFields.some(k => k in c.body)
  if (touchesPm && !isPm) deny(c, 'update', 'requirement', r.id)
  Object.assign(r, content)
  if (touchesPm) {
    if ('priority' in c.body && !PRIORITIES.includes(c.body.priority as never)) throw new ApiError(422, 'VALIDATION', '優先級不正確', { priority: '請選擇優先級' })
    if ('priority' in c.body) r.priority = c.body.priority as Requirement['priority']
    if ('uatReviewerId' in c.body) r.uatReviewerId = str(c.body.uatReviewerId)
    if (Array.isArray(c.body.acceptanceCriteria)) r.acceptanceCriteria = (c.body.acceptanceCriteria as unknown[]).map(x => str(x, 300)).filter(Boolean)
  }
  r.updatedAt = c.now.toISOString()
  r.version++
  audit(c, 'update', 'requirement', r.id, Object.keys(c.body).filter(k => k !== 'version').join(','))
  return reqDetail(c, r)
})

route('POST', '/api/requirements/:id/watch', c => {
  const u = me(c)
  const r = findReq(c, c.params.id)
  r.watcherIds = c.body.watch === false ? r.watcherIds.filter(x => x !== u.id) : [...new Set([...r.watcherIds, u.id])]
  touch(c)
  return { watching: r.watcherIds.includes(u.id) }
})

route('DELETE', '/api/requirements/:id', c => {
  const u = me(c)
  const r = findReq(c, c.params.id, 'delete')
  // 只有草稿可刪除；進入流程後只能取消（保留稽核）
  if (r.status !== 'DRAFT' || r.reporterId !== u.id) throw new ApiError(422, 'NOT_DRAFT', '只有自己的草稿可以刪除；已提交的需求請使用「撤回」')
  c.db.requirements = c.db.requirements.filter(x => x.id !== r.id)
  audit(c, 'deleteDraft', 'requirement', r.id)
  return { ok: true }
})

route('POST', '/api/requirements/:id/comments', c => {
  const u = me(c)
  const r = findReq(c, c.params.id, 'comment')
  if (!can.comment(u)) deny(c, 'comment', 'requirement', r.id)
  const body = str(c.body.body, 2000).trim()
  if (!body) throw new ApiError(422, 'VALIDATION', '請輸入留言內容', { body: '請輸入留言內容' })
  const mentions = c.db.users.filter(x => body.includes(`@${x.name}`)).map(x => x.id)
  const cm: Comment = { id: id(c.db, 'CM'), authorId: u.id, body, mentions, at: c.now.toISOString() }
  r.comments.push(cm)
  r.updatedAt = cm.at
  notify(c.db, c.now, mentions, `${u.name} 在 ${r.no || '草稿'} 提及你：${body.slice(0, 40)}`, r.id, `mention:${cm.id}`, 'mention', u.id)
  audit(c, 'comment', 'requirement', r.id)
  return cm
})

route('PATCH', '/api/requirements/:id/comments/:cid', c => {
  const u = me(c)
  const r = findReq(c, c.params.id, 'comment')
  const cm = r.comments.find(x => x.id === c.params.cid)
  if (!cm) throw new ApiError(404, 'NOT_FOUND', '找不到留言')
  if (cm.authorId !== u.id) deny(c, 'editComment', 'requirement', r.id)
  // 留言可編輯 15 分鐘內、不可刪除（FR-04）
  if (c.now.getTime() - Date.parse(cm.at) > 15 * 60 * 1000) throw new ApiError(422, 'EDIT_WINDOW', '留言超過 15 分鐘，已無法編輯')
  cm.body = str(c.body.body, 2000).trim() || cm.body
  cm.editedAt = c.now.toISOString()
  touch(c)
  return cm
})

// ─── 狀態轉換 ───────────────────────────────────────────────────────────

function need(cond: unknown, fields: FieldErrors, key: string, msg: string) {
  if (!cond) fields[key] = msg
}

function assertFields(fields: FieldErrors, message = '請完成必填欄位') {
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION', message, fields)
}

route('POST', '/api/requirements/:id/actions/:action', c => {
  const u = me(c)
  const r = findReq(c, c.params.id, c.params.action)
  const key = c.params.action as ActionKey
  let def
  try {
    def = actionDef(key)
  } catch {
    throw new ApiError(404, 'UNKNOWN_ACTION', '未知的操作')
  }
  // 只允許表列轉換，其他跳階由後端拒絕並記錄（PRD 7.2）
  if (!def.from.includes(r.status)) {
    audit(c, key, 'requirement', r.id, `非法轉換：${r.status}`, 'denied')
    throw new ApiError(422, 'INVALID_TRANSITION', `目前狀態不能執行「${def.label}」`)
  }
  if (!def.who(u, r)) deny(c, key, 'requirement', r.id)
  checkVersion(c, r.version)

  const b = c.body
  const f: FieldErrors = {}
  const reason = str(b.reason, 2000).trim()
  const nm = (uid: string) => c.db.users.find(x => x.id === uid)?.name ?? ''
  const involved = () => [r.reporterId, r.assigneeId, r.qaId]

  switch (key) {
    case 'submit':
      submitReq(c, r)
      break
    case 'requestInfo':
      need(reason, f, 'reason', '請填寫需要補充的資訊')
      assertFields(f, '要求補件必須填寫原因')
      pushEvent(c, r, 'NEED_INFO', reason)
      notify(c.db, c.now, [r.reporterId], `${u.name} 要求補件 ${r.no}：${reason.slice(0, 40)}`, r.id, 'requestInfo', 'event', u.id)
      break
    case 'resubmit':
      need(reason, f, 'reason', '請說明本次補充的內容')
      assertFields(f)
      pushEvent(c, r, 'PENDING_REVIEW', reason)
      notify(c.db, c.now, [r.pmId], `${u.name} 已補件 ${r.no}，請重新評估`, r.id, 'resubmit', 'event', u.id)
      break
    case 'accept': {
      const sc = (b.scores ?? {}) as Record<string, number>
      for (const k of ['impact', 'urgency', 'strategy', 'cost']) need([1, 2, 3].includes(sc[k]), f, `score_${k}`, '請選擇 1–3 分')
      need(PRIORITIES.includes(b.priority as never), f, 'priority', '請選擇優先級')
      need(str(b.rationale).trim(), f, 'rationale', '請填寫評估說明')
      assertFields(f)
      r.priority = b.priority as Requirement['priority']
      r.evaluation = {
        scores: { impact: sc.impact, urgency: sc.urgency, strategy: sc.strategy, cost: sc.cost },
        rationale: str(b.rationale).trim(), effort: str(b.effort, 100), reviewerId: u.id, at: c.now.toISOString(),
      }
      pushEvent(c, r, 'ACCEPTED', `接受，優先級：${r.priority}。${r.evaluation.rationale}`)
      notify(c.db, c.now, [r.reporterId], `${r.no} 已被接受（優先級：${r.priority}）`, r.id, 'accept', 'event', u.id)
      break
    }
    case 'reject':
      need(reason, f, 'reason', '請填寫不採納理由')
      assertFields(f, '不採納必須填寫理由')
      pushEvent(c, r, 'REJECTED', reason)
      notify(c.db, c.now, [r.reporterId], `${r.no} 不採納：${reason.slice(0, 40)}`, r.id, 'reject', 'event', u.id)
      break
    case 'withdraw':
      need(reason, f, 'reason', '請填寫撤回原因')
      assertFields(f)
      pushEvent(c, r, 'CANCELLED', `提出人撤回：${reason}`)
      notify(c.db, c.now, [r.pmId], `${u.name} 撤回了 ${r.no}`, r.id, 'withdraw', 'event', u.id)
      break
    case 'markDuplicate': {
      const main = c.db.requirements.find(x => x.id === b.duplicateOfId || x.no === b.duplicateOfId)
      need(main && main.id !== r.id, f, 'duplicateOfId', '請選擇主需求')
      assertFields(f)
      r.duplicateOfId = main!.id
      pushEvent(c, r, 'CANCELLED', `標記重複，主需求 ${main!.no}${reason ? `：${reason}` : ''}`)
      notify(c.db, c.now, [r.reporterId], `${r.no} 與 ${main!.no} 重複，已關聯主需求`, r.id, 'duplicate', 'event', u.id)
      break
    }
    case 'reassignPm': {
      const pm = c.db.users.find(x => x.id === b.pmId && x.role === 'PM' && x.status === '啟用')
      need(pm && pm.id !== r.pmId, f, 'pmId', '請選擇其他受理 PM')
      need(reason, f, 'reason', '請填寫改派原因')
      assertFields(f)
      r.history.push({ id: id(c.db, 'EV'), from: r.status, to: r.status, actorId: u.id, at: c.now.toISOString(), reason: `改派受理 PM：${nm(r.pmId)} → ${pm!.name}。${reason}` })
      r.pmId = pm!.id
      notify(c.db, c.now, [pm!.id, r.reporterId], `${r.no} 受理 PM 改為 ${pm!.name}`, r.id, 'reassign', 'event', u.id)
      break
    }
    case 'startDev': {
      const dev = c.db.users.find(x => x.id === b.assigneeId && x.role === 'Developer' && x.status === '啟用')
      const ac = Array.isArray(b.acceptanceCriteria) ? (b.acceptanceCriteria as unknown[]).map(x => str(x, 300).trim()).filter(Boolean) : []
      const committed = str(b.committedDate, 10)
      const uatReviewer = c.db.users.find(x => x.id === (b.uatReviewerId || r.uatReviewerId) && x.status === '啟用')
      // 缺少開發負責人、承諾日期或驗收條件 → 無法轉為開發中（AC-03C）
      need(dev, f, 'assigneeId', '請指派開發負責人')
      need(committed && committed >= c.today, f, 'committedDate', '請設定今天以後的承諾日期')
      need(ac.length >= 2, f, 'acceptanceCriteria', '至少需要 2 條可驗證的驗收條件')
      need(uatReviewer, f, 'uatReviewerId', '請指定業務驗收者')
      need(b.techConfirmed === true, f, 'techConfirmed', '需技術負責人確認可行性')
      assertFields(f, '開發負責人、承諾日期、驗收條件、技術確認四項齊全才能開始開發')
      r.assigneeId = dev!.id
      r.committedDate = committed
      r.acceptanceCriteria = ac
      r.uatReviewerId = uatReviewer!.id
      r.techConfirmed = true
      r.qaId = str(b.qaId) || r.qaId || c.db.users.find(x => x.role === 'QA' && x.status === '啟用')?.id || ''
      pushEvent(c, r, 'IN_DEV', `指派 ${dev!.name}，承諾日期 ${committed}`)
      notify(c.db, c.now, [r.assigneeId, r.reporterId], `${r.no} 開始開發，負責人 ${dev!.name}，承諾日期 ${committed}`, r.id, 'startDev', 'event', u.id)
      break
    }
    case 'changeCommitted': {
      const nd = str(b.committedDate, 10)
      need(nd && nd !== r.committedDate, f, 'committedDate', '請選擇新的承諾日期')
      need(reason, f, 'reason', '變更承諾日期必須填寫原因')
      assertFields(f)
      r.dateChanges.push({ id: id(c.db, 'DC'), field: 'committedDate', oldValue: r.committedDate, newValue: nd, actorId: u.id, at: c.now.toISOString(), reason })
      r.history.push({ id: id(c.db, 'EV'), from: r.status, to: r.status, actorId: u.id, at: c.now.toISOString(), reason: `承諾日期 ${r.committedDate} → ${nd}：${reason}` })
      r.committedDate = nd
      notify(c.db, c.now, [r.reporterId, r.assigneeId], `${r.no} 承諾日期變更為 ${nd}：${reason.slice(0, 30)}`, r.id, 'changeCommitted', 'event', u.id)
      break
    }
    case 'submitTest':
      need(str(b.build).trim(), f, 'build', '請填寫測試版本號')
      need(b.selfTested === true, f, 'selfTested', '請確認已完成自測')
      assertFields(f)
      if (!r.qaId) r.qaId = c.db.users.find(x => x.role === 'QA' && x.status === '啟用')?.id ?? ''
      pushEvent(c, r, 'IN_QA', `測試版本 ${str(b.build).trim()}`)
      notify(c.db, c.now, [r.qaId], `${r.no} 已提供測試版本 ${str(b.build).trim()}，請測試`, r.id, 'submitTest', 'event', u.id)
      break
    case 'recordTest': {
      const cases = (Array.isArray(b.cases) ? b.cases : []) as { caseName?: string; result?: string }[]
      const clean = cases.map(x => ({ caseName: str(x.caseName, 200).trim(), result: x.result === 'FAIL' ? 'FAIL' as const : 'PASS' as const })).filter(x => x.caseName)
      const failed = clean.some(x => x.result === 'FAIL')
      const pass = b.result === 'PASS'
      need(str(b.build).trim(), f, 'build', '請填寫測試版本')
      need(clean.length > 0, f, 'cases', '至少記錄 1 個測試案例')
      if (pass) need(!failed, f, 'cases', '有失敗案例時不能送業務驗收')
      else need(str(b.defectRef).trim(), f, 'defectRef', '測試失敗必須關聯缺陷')
      assertFields(f)
      const tr: TestRun = {
        id: id(c.db, 'TR'), build: str(b.build).trim(), cases: clean, result: pass ? 'PASS' : 'FAIL',
        defectRef: str(b.defectRef, 200).trim(), evidence: str(b.evidence, 500).trim(), testerId: u.id, at: c.now.toISOString(),
      }
      // 前次測試紀錄不被覆寫（AC-05A）
      r.testRuns.push(tr)
      r.qaId = u.id
      if (pass) {
        pushEvent(c, r, 'IN_UAT', `所有案例通過（${tr.build}）`)
        notify(c.db, c.now, [r.uatReviewerId], `${r.no} QA 測試通過，請執行業務驗收`, r.id, 'qaPass', 'event', u.id)
      } else {
        pushEvent(c, r, 'IN_DEV', `測試失敗：${tr.defectRef}`)
        notify(c.db, c.now, [r.assigneeId, r.pmId], `${r.no} 測試失敗（${tr.defectRef}），已退回開發`, r.id, 'qaFail', 'event', u.id)
      }
      break
    }
    case 'uat': {
      const pass = b.result === 'PASS'
      const checked = Array.isArray(b.checked) ? (b.checked as unknown[]).map(x => x === true) : []
      if (pass) need(checked.length === r.acceptanceCriteria.length && checked.every(Boolean), f, 'checked', '請逐項確認所有驗收條件')
      else need(reason, f, 'reason', '選擇退回時必填')
      assertFields(f)
      r.uatResults.push({ id: id(c.db, 'UA'), checked, result: pass ? 'PASS' : 'RETURN', reason, reviewerId: u.id, at: c.now.toISOString() })
      if (pass) {
        r.history.push({ id: id(c.db, 'EV'), from: 'IN_UAT', to: 'IN_UAT', actorId: u.id, at: c.now.toISOString(), reason: '業務驗收通過' })
        notify(c.db, c.now, [r.pmId], `${r.no} 業務驗收通過，可以結案`, r.id, 'uatPass', 'event', u.id)
      } else {
        pushEvent(c, r, 'IN_DEV', `驗收退回：${reason}`)
        notify(c.db, c.now, [r.pmId, r.assigneeId], `${r.no} 業務驗收退回：${reason.slice(0, 30)}`, r.id, 'uatReturn', 'event', u.id)
      }
      break
    }
    case 'close': {
      // 結案必要條件：QA 通過 + UAT 通過 + 交付證據（AC-05C）
      need(lastQaPassed(r), f, 'qa', 'QA 測試尚未通過')
      need(lastUatPassed(r), f, 'uat', '業務驗收尚未通過')
      need(str(b.build).trim(), f, 'build', '請填寫交付版本')
      assertFields(f, '三項檢查皆完成才可結案')
      r.delivery = { build: str(b.build).trim(), releaseDate: str(b.releaseDate, 10) || c.today, note: str(b.note, 500) }
      pushEvent(c, r, 'CLOSED', `交付版本 ${r.delivery.build}${r.delivery.note ? `：${r.delivery.note}` : ''}`)
      notify(c.db, c.now, involved(), `${r.no}「${r.title}」已結案`, r.id, 'close', 'event', u.id)
      break
    }
    case 'reopen':
      need(reason, f, 'reason', '請填寫重新開啟原因')
      assertFields(f)
      // 保留原結案事件，另起新一輪處理（AC-05D）
      pushEvent(c, r, 'PENDING_REVIEW', `重新開啟：${reason}`)
      notify(c.db, c.now, involved(), `${r.no} 已重新開啟：${reason.slice(0, 30)}`, r.id, 'reopen', 'event', u.id)
      break
    case 'cancel':
      need(reason, f, 'reason', '請填寫取消理由')
      need(b.approved === true, f, 'approved', '需決策者同意')
      assertFields(f)
      pushEvent(c, r, 'CANCELLED', reason)
      notify(c.db, c.now, [...involved(), r.pmId], `${r.no} 已取消：${reason.slice(0, 30)}`, r.id, 'cancel', 'event', u.id)
      break
  }
  r.updatedAt = c.now.toISOString()
  r.version++
  audit(c, key, 'requirement', r.id, r.no)
  return reqDetail(c, r)
})

// ─── 工作台／通知／報表 ────────────────────────────────────────────────

route('GET', '/api/workbench', c => workbench(c.db, me(c), c.today))

route('GET', '/api/notifications', c => {
  const u = me(c)
  const items = c.db.notifications.filter(n => n.userId === u.id)
  return { unread: items.filter(n => !n.read).length, items: items.slice(0, 50) }
})

route('POST', '/api/notifications/read', c => {
  const u = me(c)
  const ids = Array.isArray(c.body.ids) ? (c.body.ids as string[]) : null
  for (const n of c.db.notifications) if (n.userId === u.id && (!ids || ids.includes(n.id))) n.read = true
  touch(c)
  return { ok: true }
})

route('GET', '/api/reports', c => {
  const u = me(c)
  if (!can.viewReports(u)) deny(c, 'view', 'report', '-')
  const to = c.query.to || c.today
  const from = c.query.from || addDays(to, -29)
  return report(c.db, u, { from, to, type: c.query.type, ownerId: c.query.ownerId }, c.today, c.now)
})

route('GET', '/api/timeline', c => {
  const u = me(c)
  return c.db.requirements
    .filter(r => canSeeRequirement(c.db, u, r) && r.status !== 'DRAFT' && r.status !== 'REJECTED' && r.status !== 'CANCELLED')
    .map(r => ({ ...reqSummary(c, r), startedAt: r.history.find(e => e.to === 'IN_DEV')?.at ?? r.submittedAt, closedAt: r.history.find(e => e.to === 'CLOSED')?.at ?? '' }))
})

// ─── 現金流（手動編輯） ─────────────────────────────────────────────────

route('GET', '/api/cashflow', c => {
  const u = me(c)
  if (!can.editCashFlow(u)) deny(c, 'view', 'cashflow', '-')
  const reqs = c.db.requirements.filter(r => canSeeRequirement(c.db, u, r))
  return { rows: c.db.cashFlow, openReqs: reqs.filter(r => OPEN_STATUSES.includes(r.status)).length }
})

route('PUT', '/api/cashflow', c => {
  const u = me(c)
  if (!can.editCashFlow(u)) deny(c, 'update', 'cashflow', '-')
  const rows = Array.isArray(c.body.rows) ? (c.body.rows as Record<string, unknown>[]) : null
  if (!rows) throw new ApiError(422, 'VALIDATION', 'rows 必須是陣列')
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0)
  const clean = rows.map(r => ({ month: str(r.month, 7), revenue: num(r.revenue), devCost: num(r.devCost), pmCost: num(r.pmCost), infra: num(r.infra), misc: num(r.misc) }))
  if (clean.some(r => !/^\d{4}-\d{2}$/.test(r.month))) throw new ApiError(422, 'VALIDATION', '月份格式需為 YYYY-MM')
  c.db.cashFlow = clean.sort((a, b) => a.month.localeCompare(b.month))
  audit(c, 'update', 'cashflow', '-', `${clean.length} 列`)
  return { rows: c.db.cashFlow }
})

// ─── 整合設定／外部 API 同步／自動化 ────────────────────────────────────

route('GET', '/api/integrations', c => {
  if (!can.manageIntegrations(me(c))) deny(c, 'view', 'integration', '-')
  return c.db.integrations
})

route('PUT', '/api/integrations', c => {
  if (!can.manageIntegrations(me(c))) deny(c, 'update', 'integration', '-')
  const next = c.body as unknown as IntegrationSettings
  if (!next || !Array.isArray(next.externalApis)) throw new ApiError(422, 'VALIDATION', '設定格式不正確')
  for (const a of next.externalApis) {
    if (!a.name?.trim() || !a.endpoint?.trim()) throw new ApiError(422, 'VALIDATION', 'API 名稱與 Endpoint 必填')
    a.syncMinutes = Math.max(0, Math.min(1440, Number(a.syncMinutes) || 0))
  }
  c.db.integrations = next
  audit(c, 'update', 'integration', '-')
  return c.db.integrations
})

route('POST', '/api/integrations/:id/sync', async c => {
  if (!can.manageIntegrations(me(c))) deny(c, 'sync', 'integration', c.params.id)
  const api = c.db.integrations.externalApis.find(a => a.id === c.params.id)
  if (!api) throw new ApiError(404, 'NOT_FOUND', '找不到這個 API 設定')
  const result = await syncExternalApi(c.db, c.backend, api, c.now)
  audit(c, 'sync', 'integration', api.id, result.message)
  touch(c)
  return result
})

route('POST', '/api/automation/run', async c => {
  me(c)
  const result = await runAutomation(c.db, c.backend, c.now, c.body.force === true)
  if (result.changed) touch(c)
  return result
})

// ─── 資料管理（Admin）：匯出／匯入／重置 ───────────────────────────────

route('GET', '/api/admin/export', c => {
  if (!can.manageUsers(me(c))) deny(c, 'export', 'database', '-')
  audit(c, 'export', 'database', '-')
  return c.db
})

route('POST', '/api/admin/import', c => {
  if (!can.manageUsers(me(c))) deny(c, 'import', 'database', '-')
  const d = c.body as unknown as Database
  if (!d || !Array.isArray(d.users) || !Array.isArray(d.clients) || !Array.isArray(d.requirements)) throw new ApiError(422, 'VALIDATION', '檔案格式不正確：需包含 users、clients、requirements')
  if (!d.users.some(u => u.role === 'Admin' && u.status === '啟用')) throw new ApiError(422, 'VALIDATION', '匯入資料至少需有一位啟用中的 Admin')
  const fresh = createSeed(c.now)
  const merged: Database = { ...fresh, ...d, rev: c.db.rev }
  replaceDb(c, merged)
  audit(c, 'import', 'database', '-', `${d.requirements.length} 筆需求`)
  return { ok: true }
})

route('POST', '/api/admin/reset', c => {
  if (!can.manageUsers(me(c))) deny(c, 'reset', 'database', '-')
  replaceDb(c, { ...createSeed(c.now), rev: c.db.rev })
  audit(c, 'reset', 'database', '-')
  return { ok: true }
})

function replaceDb(c: Ctx, next: Database) {
  for (const k of Object.keys(c.db) as (keyof Database)[]) delete (c.db as unknown as Record<string, unknown>)[k]
  Object.assign(c.db, next)
  c.dirty = true
}

// ─── 分派 ───────────────────────────────────────────────────────────────

export async function handle(backend: Backend, req: ApiRequest): Promise<ApiResponse> {
  const method = req.method.toUpperCase()
  const path = req.path.replace(/\/+$/, '') || '/'
  const headers = Object.fromEntries(Object.entries(req.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
  let matched: Route | undefined
  let params: Record<string, string> = {}
  for (const r of routes) {
    if (r.method !== method) continue
    const m = r.pattern.exec(path)
    if (m) {
      matched = r
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
      break
    }
  }
  if (!matched) return { status: 404, body: { code: 'NO_ROUTE', message: `找不到 API：${method} ${path}` } }

  const db = backend.load()
  const now = backend.now()
  const token = (headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const user = db.users.find(u => u.id === token) ?? null
  const ctx: Ctx = {
    db, now, today: taipeiDate(now), me: user && user.status === '啟用' ? user : null, backend, dirty: false, newAudit: [], params,
    query: req.query ?? {}, body: (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>, headers,
  }
  try {
    if (matched.auth && !ctx.me) {
      // 停用後，新登入與既有登入皆無法取得資料（FR-07）
      throw new ApiError(401, user ? 'ACCOUNT_DISABLED' : 'UNAUTHENTICATED', user ? '此帳號已停用，工作階段已失效' : '請先登入')
    }
    const body = await matched.handler(ctx)
    if (ctx.dirty) {
      db.rev++
      db.updatedAt = now.toISOString()
      backend.save(db)
    }
    return { status: method === 'POST' && /\/api\/(clients|requirements|users)$/.test(path) ? 201 : 200, body }
  } catch (e) {
    if (ctx.newAudit.length) {
      // 失敗的請求不寫入任何資料變更，只保存拒絕紀錄（稽核）
      const fresh = backend.load()
      fresh.audit.unshift(...ctx.newAudit.filter(a => a.result === 'denied'))
      fresh.rev++
      fresh.updatedAt = now.toISOString()
      backend.save(fresh)
    }
    if (e instanceof ApiError) return { status: e.status, body: { code: e.code, message: e.message, fields: e.fields, ...e.extra } }
    return { status: 500, body: { code: 'INTERNAL', message: e instanceof Error ? e.message : '伺服器錯誤' } }
  }
}

export function listRoutes(): string[] {
  return routes.map(r => `${r.method} ${r.pattern.source.replace(/^\^|\$$/g, '').replace(/\(\[\^\/\]\+\)/g, ':param')}`)
}
