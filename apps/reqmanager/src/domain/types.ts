// 資料模型 — 對應 PRD v0.3 第 09 章邏輯資料模型。
// 伺服器（server/）與瀏覽器內建 API（src/api/local.ts）共用同一份型別。

export type Role = 'Business' | 'PM' | 'Developer' | 'QA' | 'Admin'

export type ReqStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'NEED_INFO'
  | 'ACCEPTED'
  | 'IN_DEV'
  | 'IN_QA'
  | 'IN_UAT'
  | 'CLOSED'
  | 'REJECTED'
  | 'CANCELLED'

export type ReqType = '功能' | '缺陷' | '改善'
export type Priority = '緊急' | '高' | '一般' | '低'
export type Urgency = '高' | '中' | '低'
export type ImpactScope = '單一客戶' | '多客戶' | '內部團隊' | '全公司'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** 業務主管 = Business 角色 + 主管範圍（PRD 6.1） */
  manager?: boolean
  dept: string
  status: '啟用' | '停用'
  lastLogin: string
}

export interface Contact {
  id: string
  name: string
  title: string
  email: string
  phone: string
}

export interface Interaction {
  id: string
  date: string
  actorId: string
  channel: '面談' | '電話' | 'Email' | 'LINE' | '系統'
  summary: string
  next: string
  source: 'manual' | 'line' | 'email' | 'api'
  rawRef?: string
}

export interface Client {
  id: string
  name: string
  taxId: string
  ownerId: string
  status: '啟用' | '封存'
  industry: string
  contacts: Contact[]
  interactions: Interaction[]
  createdAt: string
  updatedAt: string
  version: number
}

export interface StatusEvent {
  id: string
  from: ReqStatus | ''
  to: ReqStatus
  actorId: string
  at: string
  reason: string
}

export interface DateChange {
  id: string
  field: 'committedDate' | 'expectedDate'
  oldValue: string
  newValue: string
  actorId: string
  at: string
  reason: string
}

export interface Evaluation {
  scores: { impact: number; urgency: number; strategy: number; cost: number }
  rationale: string
  effort: string
  reviewerId: string
  at: string
}

export interface TestCaseResult {
  caseName: string
  result: 'PASS' | 'FAIL'
}

export interface TestRun {
  id: string
  build: string
  cases: TestCaseResult[]
  result: 'PASS' | 'FAIL'
  defectRef: string
  evidence: string
  testerId: string
  at: string
}

export interface UatResult {
  id: string
  checked: boolean[]
  result: 'PASS' | 'RETURN'
  reason: string
  reviewerId: string
  at: string
}

export interface Comment {
  id: string
  authorId: string
  body: string
  mentions: string[]
  at: string
  editedAt?: string
}

export interface Requirement {
  id: string
  no: string
  clientIds: string[]
  title: string
  type: ReqType
  problem: string
  expected: string
  impactScope: ImpactScope | ''
  impactNote: string
  urgency: Urgency | ''
  urgencyNote: string
  priority: Priority | ''
  status: ReqStatus
  reporterId: string
  pmId: string
  assigneeId: string
  /** 負責測試的 QA；進入待測試時若未指定，帶入第一位啟用中的 QA */
  qaId: string
  uatReviewerId: string
  expectedDate: string
  committedDate: string
  acceptanceCriteria: string[]
  techConfirmed: boolean
  evaluation?: Evaluation
  testRuns: TestRun[]
  uatResults: UatResult[]
  delivery?: { build: string; releaseDate: string; note: string }
  duplicateOfId?: string
  history: StatusEvent[]
  dateChanges: DateChange[]
  comments: Comment[]
  watcherIds: string[]
  submittedAt: string
  createdAt: string
  updatedAt: string
  version: number
}

export interface Notification {
  id: string
  userId: string
  reqId?: string
  text: string
  kind: 'event' | 'reminder' | 'mention'
  at: string
  read: boolean
  /** 同一需求同一事件 10 分鐘內不重複（PRD FR-04） */
  dedupKey: string
}

export interface AuditLog {
  id: string
  actorId: string
  action: string
  resourceType: string
  resourceId: string
  at: string
  result: 'ok' | 'denied'
  detail: string
}

export interface CashFlowRow {
  month: string
  revenue: number
  devCost: number
  pmCost: number
  infra: number
  misc: number
}

export interface IntegrationSettings {
  email: { enabled: boolean; smtpHost: string; smtpPort: string; fromName: string; notifyOn: string[] }
  line: { enabled: boolean; webhookUrl: string; targetGroupId: string; notifyOn: string[] }
  externalApis: {
    id: string
    name: string
    endpoint: string
    method: 'GET' | 'POST'
    enabled: boolean
    /** 自動同步頻率（分鐘），0 = 僅手動 */
    syncMinutes: number
    lastSyncAt: string
    lastStatus: 'ok' | 'error' | 'untested'
    lastMessage: string
  }[]
}

export interface AutomationRun {
  at: string
  created: number
  note: string
}

export interface Database {
  /** 每次寫入 +1，前端以此判斷是否需要自動重新整理 */
  rev: number
  updatedAt: string
  seq: Record<string, number>
  users: User[]
  clients: Client[]
  requirements: Requirement[]
  notifications: Notification[]
  audit: AuditLog[]
  cashFlow: CashFlowRow[]
  integrations: IntegrationSettings
  automation: AutomationRun[]
  /** 冪等鍵 → 需求 ID（AC-02B） */
  idempotency: Record<string, string>
}

/** 對前端公開的使用者摘要 */
export type UserRef = Pick<User, 'id' | 'name' | 'role' | 'dept' | 'status'> & { manager?: boolean }
