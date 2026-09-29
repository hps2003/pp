// PRD 第 06 章（權限矩陣）與第 07 章（狀態與轉換規則）的單一來源。
// 前端用來「只露出此刻合法的操作」，後端（server 與內建 API）用同一份規則再檢查一次。

import type { Client, Database, Priority, Requirement, ReqStatus, Role, User } from './types.ts'
import { taipeiDate } from './time.ts'

export const STATUS_META: Record<ReqStatus, { label: string; fg: string; bg: string; stage: number }> = {
  DRAFT: { label: '草稿', fg: '#475467', bg: '#F2F4F7', stage: 0 },
  PENDING_REVIEW: { label: '待評估', fg: '#1D4ED8', bg: '#E8F0FE', stage: 1 },
  NEED_INFO: { label: '待補件', fg: '#B54708', bg: '#FEF0C7', stage: 1 },
  ACCEPTED: { label: '待排程', fg: '#175CD3', bg: '#D1E9FF', stage: 2 },
  IN_DEV: { label: '開發中', fg: '#6941C6', bg: '#F4EBFF', stage: 3 },
  IN_QA: { label: '待測試', fg: '#0E7090', bg: '#CFF9FE', stage: 4 },
  IN_UAT: { label: '待業務驗收', fg: '#C4320A', bg: '#FFE6D5', stage: 5 },
  CLOSED: { label: '已結案', fg: '#067647', bg: '#DCFAE6', stage: 6 },
  REJECTED: { label: '不採納', fg: '#475467', bg: '#EAECF0', stage: -1 },
  CANCELLED: { label: '已取消', fg: '#475467', bg: '#F2F4F7', stage: -1 },
}

export const STAGES = ['提交', '評估', '排程', '開發', '測試', '業務驗收', '結案'] as const

export const OPEN_STATUSES: ReqStatus[] = ['PENDING_REVIEW', 'NEED_INFO', 'ACCEPTED', 'IN_DEV', 'IN_QA', 'IN_UAT']
export const ENDED_STATUSES: ReqStatus[] = ['CLOSED', 'REJECTED', 'CANCELLED']

export const PRIORITIES: Priority[] = ['緊急', '高', '一般', '低']
export const PRIORITY_HINT: Record<Priority, string> = {
  緊急: '本開發週期內處理',
  高: '下個週期',
  一般: '排入 Backlog',
  低: '有餘力再做',
}

export const ROLE_LABEL: Record<Role, string> = {
  Business: '業務',
  PM: 'PM',
  Developer: '工程',
  QA: 'QA',
  Admin: 'Admin',
}

// ─── 目前負責人（PRD 7.1） ───────────────────────────────────────────────

export function currentOwnerId(r: Requirement): string {
  switch (r.status) {
    case 'DRAFT':
    case 'NEED_INFO':
      return r.reporterId
    case 'PENDING_REVIEW':
    case 'ACCEPTED':
      return r.pmId
    case 'IN_DEV':
      return r.assigneeId
    case 'IN_QA':
      return r.qaId
    case 'IN_UAT':
      return r.uatReviewerId
    default:
      return ''
  }
}

// ─── 資料範圍（PRD 6.1 權限矩陣、AC-04A） ────────────────────────────────

export function canSeeRequirement(db: Database, u: User, r: Requirement): boolean {
  if (u.status !== '啟用') return false
  if (r.status === 'DRAFT') return r.reporterId === u.id // 草稿僅提出人可見
  if (r.reporterId === u.id || r.watcherIds.includes(u.id)) return true
  switch (u.role) {
    case 'Business':
      if (u.manager) return true
      if (r.uatReviewerId === u.id) return true
      return r.clientIds.some(cid => db.clients.find(c => c.id === cid)?.ownerId === u.id)
    case 'PM':
      return true
    case 'Developer':
      return r.assigneeId === u.id
    case 'QA':
      return r.qaId === u.id || r.testRuns.some(t => t.testerId === u.id)
    default:
      return false
  }
}

export type ClientAccess = 'full' | 'name' | 'none'

export function clientAccess(u: User, c: Client): ClientAccess {
  if (u.status !== '啟用') return 'none'
  if (u.role === 'Business') return u.manager || c.ownerId === u.id ? 'full' : 'none'
  if (u.role === 'PM') return 'full'
  if (u.role === 'Developer' || u.role === 'QA') return 'name'
  return 'none'
}

export const can = {
  viewClientList: (u: User) => u.role === 'Business' || u.role === 'PM',
  /** 新增／編輯客戶與互動：僅範圍內 Business */
  editClient: (u: User, c?: Client) => u.role === 'Business' && (!c || u.manager === true || c.ownerId === u.id),
  /** 封存、變更負責業務：業務主管 */
  archiveClient: (u: User) => u.role === 'Business' && u.manager === true,
  /** 檢視聯絡人電話／Email：Business、PM 範圍內 */
  viewContactDetail: (u: User) => u.role === 'Business' || u.role === 'PM',
  submitRequirement: (u: User) => u.role !== 'Admin',
  viewReports: (u: User) => u.role === 'PM' || (u.role === 'Business' && u.manager === true),
  manageUsers: (u: User) => u.role === 'Admin',
  viewAudit: (u: User) => u.role === 'Admin',
  comment: (u: User) => u.role !== 'Admin',
  editCashFlow: (u: User) => u.role === 'PM' || (u.role === 'Business' && u.manager === true),
  manageIntegrations: (u: User) => u.role === 'Admin' || u.role === 'PM',
}

/** 非敏感角色看到的電話遮罩：0912-345-678 → 09xx-xxx-678（PRD FR-07） */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return '••••'
  return `${digits.slice(0, 2)}xx-xxx-${digits.slice(-3)}`
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return '••••'
  return `${name.slice(0, 1)}•••@${domain}`
}

// ─── 狀態轉換（PRD 7.2） ────────────────────────────────────────────────

export type ActionKey =
  | 'submit'
  | 'requestInfo'
  | 'resubmit'
  | 'accept'
  | 'reject'
  | 'withdraw'
  | 'markDuplicate'
  | 'startDev'
  | 'submitTest'
  | 'recordTest'
  | 'uat'
  | 'close'
  | 'reopen'
  | 'cancel'
  | 'changeCommitted'
  | 'reassignPm'

export interface ActionDef {
  key: ActionKey
  label: string
  from: ReqStatus[]
  /** 誰可以執行（後端判斷） */
  who: (u: User, r: Requirement) => boolean
  tone: 'primary' | 'secondary' | 'danger'
  /** 放在「⋯」選單 */
  menu?: boolean
}

const isPm = (u: User, r: Requirement) => u.role === 'PM' && r.pmId === u.id

export const ACTIONS: ActionDef[] = [
  { key: 'submit', label: '提交', from: ['DRAFT'], who: (u, r) => r.reporterId === u.id, tone: 'primary' },
  { key: 'accept', label: '接受', from: ['PENDING_REVIEW'], who: isPm, tone: 'primary' },
  { key: 'requestInfo', label: '要求補件', from: ['PENDING_REVIEW'], who: isPm, tone: 'secondary' },
  { key: 'reject', label: '不採納', from: ['PENDING_REVIEW'], who: isPm, tone: 'danger' },
  { key: 'resubmit', label: '補充資訊', from: ['NEED_INFO'], who: (u, r) => r.reporterId === u.id, tone: 'primary' },
  { key: 'startDev', label: '開始開發', from: ['ACCEPTED'], who: isPm, tone: 'primary' },
  { key: 'submitTest', label: '提交測試版本', from: ['IN_DEV'], who: (u, r) => r.assigneeId === u.id, tone: 'primary' },
  { key: 'recordTest', label: '記錄測試結果', from: ['IN_QA'], who: u => u.role === 'QA', tone: 'primary' },
  { key: 'uat', label: '業務驗收', from: ['IN_UAT'], who: (u, r) => r.uatReviewerId === u.id, tone: 'primary' },
  { key: 'close', label: '結案', from: ['IN_UAT'], who: isPm, tone: 'primary' },
  { key: 'changeCommitted', label: '變更承諾日期', from: ['IN_DEV', 'IN_QA', 'IN_UAT'], who: isPm, tone: 'secondary', menu: true },
  { key: 'withdraw', label: '撤回需求', from: ['PENDING_REVIEW', 'NEED_INFO'], who: (u, r) => r.reporterId === u.id, tone: 'danger', menu: true },
  { key: 'markDuplicate', label: '標記重複', from: ['PENDING_REVIEW', 'NEED_INFO'], who: isPm, tone: 'secondary', menu: true },
  { key: 'reassignPm', label: '改派受理 PM', from: ['PENDING_REVIEW', 'NEED_INFO', 'ACCEPTED'], who: isPm, tone: 'secondary', menu: true },
  { key: 'cancel', label: '取消需求', from: ['ACCEPTED', 'IN_DEV'], who: isPm, tone: 'danger', menu: true },
  { key: 'reopen', label: '重新開啟', from: ['CLOSED'], who: isPm, tone: 'secondary', menu: true },
]

export function actionDef(key: ActionKey): ActionDef {
  const def = ACTIONS.find(a => a.key === key)
  if (!def) throw new Error(`unknown action ${key}`)
  return def
}

/** 「角色 × 狀態」下此刻合法的操作（S07 頁首按鈕） */
export function availableActions(u: User, r: Requirement): ActionDef[] {
  if (u.status !== '啟用') return []
  return ACTIONS.filter(a => a.from.includes(r.status) && a.who(u, r))
}

// ─── 欄位檢核（PRD FR-02） ──────────────────────────────────────────────

export type FieldErrors = Partial<Record<string, string>>

export interface RequirementDraftInput {
  title?: string
  type?: string
  problem?: string
  expected?: string
  impactScope?: string
  impactNote?: string
  urgency?: string
  urgencyNote?: string
  clientIds?: string[]
  expectedDate?: string
  pmId?: string
}

const len = (s: string | undefined) => (s ?? '').trim().length

export function validateRequirement(db: Database, u: User, input: RequirementDraftInput, now: Date): FieldErrors {
  const e: FieldErrors = {}
  if (len(input.title) < 1) e.title = '請填寫標題'
  else if (len(input.title) > 100) e.title = '標題最多 100 字'
  if (!['功能', '缺陷', '改善'].includes(input.type ?? '')) e.type = '請選擇類型'
  if (len(input.problem) < 10) e.problem = '問題描述至少 10 字'
  else if (len(input.problem) > 2000) e.problem = '問題描述最多 2,000 字'
  if (len(input.expected) < 10) e.expected = '預期結果至少 10 字'
  else if (len(input.expected) > 2000) e.expected = '預期結果最多 2,000 字'
  if (!['單一客戶', '多客戶', '內部團隊', '全公司'].includes(input.impactScope ?? '')) e.impactScope = '請選擇影響範圍'
  else if (len(input.impactNote) < 1) e.impactNote = '請描述影響對象與範圍'
  if (!['高', '中', '低'].includes(input.urgency ?? '')) e.urgency = '請選擇急迫性'
  else if (len(input.urgencyNote) < 1) e.urgencyNote = '請說明急迫原因'
  for (const cid of input.clientIds ?? []) {
    const c = db.clients.find(x => x.id === cid)
    if (!c) e.clientIds = '關聯客戶不存在'
    else if (c.status === '封存') e.clientIds = `「${c.name}」已封存，不能關聯新需求`
    else if (clientAccess(u, c) === 'none' && u.role === 'Business') e.clientIds = `沒有「${c.name}」的存取權`
  }
  if (input.expectedDate && input.expectedDate <= taipeiDate(now)) e.expectedDate = '期望日期需晚於今日'
  const pm = db.users.find(x => x.id === input.pmId)
  if (!pm || pm.role !== 'PM' || pm.status !== '啟用') e.pmId = '請選擇受理 PM'
  return e
}

export interface ClientInput {
  name?: string
  taxId?: string
  ownerId?: string
  industry?: string
}

export function validateClient(db: Database, input: ClientInput, selfId?: string): { errors: FieldErrors; similar: string[] } {
  const e: FieldErrors = {}
  const name = (input.name ?? '').trim()
  if (name.length < 1 || name.length > 100) e.name = '公司名稱需 1–100 字'
  const taxId = (input.taxId ?? '').trim()
  if (taxId && !/^\d{8}$/.test(taxId)) e.taxId = '統一編號為 8 碼數字'
  else if (taxId && db.clients.some(c => c.taxId === taxId && c.id !== selfId)) e.taxId = '統一編號已存在，不能重複建立（AC-01B）'
  const owner = db.users.find(u => u.id === input.ownerId)
  if (!owner || owner.role !== 'Business' || owner.status !== '啟用') e.ownerId = '負責業務需為啟用中的 Business 使用者'
  const norm = normalizeCompany(name)
  const similar = norm
    ? db.clients.filter(c => c.id !== selfId && (normalizeCompany(c.name).includes(norm) || norm.includes(normalizeCompany(c.name)))).map(c => c.name)
    : []
  return { errors: e, similar }
}

/** 公司名稱正規化比對（FR-08 去重規則同一套） */
export function normalizeCompany(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/(股份有限公司|有限公司|股份公司|公司|企業社|工業|科技)$/g, '')
    .toLowerCase()
}
