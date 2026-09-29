// 示範資料：依 Wireframe（S02／S05／S07）中的人物與需求建立，日期相對於「今天」產生，
// 因此任何時間開啟都能看到「剩 2 天」「逾期 3 天」等狀態。

import type { Database, Requirement, ReqStatus, StatusEvent, TestRun, UatResult, User } from './types.ts'
import { addDays, addWorkingDays, taipeiDate } from './time.ts'

const users: User[] = [
  { id: 'U01', name: '王小明', email: 'wang@company.tw', role: 'Business', dept: '業務一部', status: '啟用', lastLogin: '' },
  { id: 'U02', name: '林雅婷', email: 'lin@company.tw', role: 'PM', dept: '產品部', status: '啟用', lastLogin: '' },
  { id: 'U03', name: '張家豪', email: 'chang@company.tw', role: 'Developer', dept: '工程部', status: '啟用', lastLogin: '' },
  { id: 'U04', name: '陳志明', email: 'chen@company.tw', role: 'QA', dept: '品管部', status: '啟用', lastLogin: '' },
  { id: 'U05', name: '李淑芬', email: 'lee@company.tw', role: 'Business', manager: true, dept: '業務一部', status: '啟用', lastLogin: '' },
  { id: 'U06', name: '系統管理員', email: 'admin@company.tw', role: 'Admin', dept: 'IT 部門', status: '啟用', lastLogin: '' },
  { id: 'U07', name: '周建宏', email: 'chou@company.tw', role: 'Business', dept: '業務二部', status: '啟用', lastLogin: '' },
  { id: 'U08', name: '黃美華', email: 'huang@company.tw', role: 'PM', dept: '產品部', status: '啟用', lastLogin: '' },
  { id: 'U09', name: '吳國華', email: 'wu@company.tw', role: 'Business', dept: '業務一部', status: '停用', lastLogin: '' },
]

export const DEMO_USERS = users

interface Step {
  to: ReqStatus
  day: number // 相對今天的天數（負數 = 過去）
  by: string
  reason?: string
}

export function createSeed(now: Date = new Date()): Database {
  const today = taipeiDate(now)
  const at = (day: number, hh = 10, mm = 0) => {
    const d = addDays(today, day)
    // 台北時間 → UTC（台北 = UTC+8）
    return new Date(`${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`).toISOString()
  }

  const seq: Record<string, number> = {}
  const nextNo = (iso: string) => {
    const ym = taipeiDate(iso).slice(0, 7).replace('-', '')
    seq[ym] = (seq[ym] ?? 0) + 1
    return `REQ-${ym}-${String(seq[ym]).padStart(4, '0')}`
  }

  let evId = 0
  const history = (steps: Step[]): StatusEvent[] => {
    let prev: ReqStatus | '' = ''
    return steps.map((s, i) => {
      const ev: StatusEvent = { id: `EV${++evId}`, from: prev, to: s.to, actorId: s.by, at: at(s.day, 9 + (i % 8), (5 + i * 7) % 60), reason: s.reason ?? '' }
      prev = s.to
      return ev
    })
  }

  const base = (p: Partial<Requirement> & Pick<Requirement, 'id' | 'title' | 'type' | 'reporterId' | 'pmId'>, steps: Step[]): Requirement => {
    const h = history(steps)
    const submitted = h.find(e => e.to === 'PENDING_REVIEW')
    const last = h[h.length - 1]
    return {
      no: submitted ? nextNo(submitted.at) : '',
      clientIds: [],
      problem: '',
      expected: '',
      impactScope: '單一客戶',
      impactNote: '',
      urgency: '中',
      urgencyNote: '',
      priority: '',
      status: last.to,
      assigneeId: '',
      qaId: '',
      uatReviewerId: p.reporterId,
      expectedDate: '',
      committedDate: '',
      acceptanceCriteria: [],
      techConfirmed: false,
      testRuns: [],
      uatResults: [],
      history: h,
      dateChanges: [],
      comments: [],
      watcherIds: [],
      submittedAt: submitted?.at ?? '',
      createdAt: h[0].at,
      updatedAt: last.at,
      version: h.length,
      ...p,
    }
  }

  const run = (id: string, day: number, build: string, cases: [string, 'PASS' | 'FAIL'][], defectRef = ''): TestRun => ({
    id,
    build,
    cases: cases.map(([caseName, result]) => ({ caseName, result })),
    result: cases.some(c => c[1] === 'FAIL') ? 'FAIL' : 'PASS',
    defectRef,
    evidence: defectRef ? '' : 'https://wiki.company.tw/qa/report',
    testerId: 'U04',
    at: at(day, 16),
  })

  const uat = (id: string, day: number, by: string, n: number, result: UatResult['result'], reason = ''): UatResult => ({
    id,
    checked: Array.from({ length: n }, () => result === 'PASS'),
    result,
    reason,
    reviewerId: by,
    at: at(day, 11),
  })

  const requirements: Requirement[] = []
  const add = (r: Requirement) => requirements.push(r)

  // 已結案（較早）— 提供交付週期與評估耗時的歷史樣本
  add(base({
    id: 'R01', title: '庫存預警推播通知', type: '功能', reporterId: 'U01', pmId: 'U02', assigneeId: 'U03', qaId: 'U04',
    clientIds: ['C001'], priority: '一般', problem: '庫存不足時業務無法及時得知，常在客戶下單後才發現缺貨。', expected: '庫存低於安全量時，系統自動以站內通知與 Email 提醒負責業務。',
    impactScope: '多客戶', impactNote: '所有使用庫存模組的業務', urgency: '低', urgencyNote: '無明確時限',
    committedDate: addDays(today, -20), acceptanceCriteria: ['低於安全量 5 分鐘內送出通知', '同一品項 24 小時內不重複通知'], techConfirmed: true,
    delivery: { build: 'v2.12.0', releaseDate: addDays(today, -22), note: '已上線' },
  }, [
    { to: 'DRAFT', day: -62, by: 'U01' }, { to: 'PENDING_REVIEW', day: -62, by: 'U01' }, { to: 'ACCEPTED', day: -60, by: 'U02', reason: '影響多位業務，排入下個週期' },
    { to: 'IN_DEV', day: -50, by: 'U02', reason: '指派張家豪' }, { to: 'IN_QA', day: -32, by: 'U03', reason: '測試版本 v2.12.0-rc1' },
    { to: 'IN_UAT', day: -29, by: 'U04', reason: '所有案例通過' }, { to: 'CLOSED', day: -24, by: 'U02', reason: '交付版本 v2.12.0' },
  ]))
  requirements[0].testRuns = [run('TR01', -29, 'v2.12.0-rc1', [['TC-01 低於安全量通知', 'PASS'], ['TC-02 24 小時內不重複', 'PASS']])]
  requirements[0].uatResults = [uat('UA01', -25, 'U01', 2, 'PASS')]

  add(base({
    id: 'R02', title: '登入頁面雙因素驗證', type: '功能', reporterId: 'U07', pmId: 'U02', assigneeId: 'U03', qaId: 'U04',
    clientIds: ['C004'], priority: '高', problem: '目前僅密碼登入，不符合客戶的資安稽核要求。', expected: '支援 TOTP 雙因素驗證，可由管理者強制啟用。',
    impactScope: '全公司', impactNote: '所有使用者', urgency: '高', urgencyNote: '客戶年度稽核',
    committedDate: addDays(today, -10), acceptanceCriteria: ['可綁定 Google Authenticator', '管理者可強制啟用'], techConfirmed: true,
    delivery: { build: 'v2.13.0', releaseDate: addDays(today, -9), note: '' },
  }, [
    { to: 'DRAFT', day: -45, by: 'U07' }, { to: 'PENDING_REVIEW', day: -45, by: 'U07' }, { to: 'NEED_INFO', day: -44, by: 'U02', reason: '請補充稽核條文與期限' },
    { to: 'PENDING_REVIEW', day: -43, by: 'U07', reason: '已附上稽核條文，期限為年底' }, { to: 'ACCEPTED', day: -41, by: 'U02' },
    { to: 'IN_DEV', day: -38, by: 'U02' }, { to: 'IN_QA', day: -18, by: 'U03', reason: '測試版本 v2.13.0-rc2' },
    { to: 'IN_UAT', day: -14, by: 'U04' }, { to: 'CLOSED', day: -9, by: 'U02', reason: '交付版本 v2.13.0' },
  ]))
  requirements[1].testRuns = [
    run('TR02', -16, 'v2.13.0-rc1', [['TC-01 綁定 Authenticator', 'PASS'], ['TC-02 強制啟用', 'FAIL']], 'BUG-801 強制啟用未生效'),
    run('TR03', -14, 'v2.13.0-rc2', [['TC-01 綁定 Authenticator', 'PASS'], ['TC-02 強制啟用', 'PASS']]),
  ]
  requirements[1].uatResults = [uat('UA02', -10, 'U07', 2, 'PASS')]

  // 待評估（S07 PM 視角範例）
  add(base({
    id: 'R03', title: '報價單匯出需含稅別欄位', type: '功能', reporterId: 'U01', pmId: 'U02', clientIds: ['C001', 'C003'],
    problem: '客戶匯出報價單後，需要手動在 Excel 補上每一列的稅別，容易漏填，財務對帳時常退件。',
    expected: '匯出的 Excel 報價單要有「稅別」欄，值為應稅／免稅／零稅率。',
    impactScope: '多客戶', impactNote: '目前 3 家客戶每月需手動補稅別，約 40 張報價單', urgency: '中', urgencyNote: '10 月底前客戶需送審',
    expectedDate: addDays(today, 32),
  }, [{ to: 'DRAFT', day: -1, by: 'U01' }, { to: 'PENDING_REVIEW', day: -1, by: 'U01' }]))
  requirements[2].comments = [
    { id: 'CM1', authorId: 'U01', body: '客戶補充：只有 B2B 報價需要，零售報價單不用。', mentions: [], at: at(-1, 15, 40) },
    { id: 'CM2', authorId: 'U02', body: '@王小明 了解，另外請確認是否需要回溯舊報價單。', mentions: ['U01'], at: at(-1, 16, 5) },
  ]

  add(base({
    id: 'R04', title: '客戶等級自動升降', type: '改善', reporterId: 'U01', pmId: 'U02', clientIds: ['C002'],
    problem: '客戶等級需業務每季手動調整，常忘記更新，導致折扣錯誤。', expected: '依近 12 個月交易額自動調整客戶等級，並通知負責業務。',
    impactScope: '多客戶', impactNote: '全部 Enterprise 客戶', urgency: '中', urgencyNote: '下季調價前',
  }, [
    { to: 'DRAFT', day: -6, by: 'U01' }, { to: 'PENDING_REVIEW', day: -6, by: 'U01' },
    { to: 'NEED_INFO', day: -4, by: 'U02', reason: '請補充預期結果：升降級門檻與通知對象' },
  ]))

  add(base({
    id: 'R05', title: '報價單折扣上限提醒', type: '改善', reporterId: 'U01', pmId: 'U08', clientIds: ['C001'],
    problem: '業務給出超過權限的折扣時，系統沒有任何提醒，事後才被主管退回。', expected: '折扣超過個人權限時跳出提醒並需填寫原因，送主管核准。',
    impactScope: '內部團隊', impactNote: '業務一部 12 人', urgency: '低', urgencyNote: '無明確時限',
  }, [
    { to: 'DRAFT', day: -9, by: 'U01' }, { to: 'PENDING_REVIEW', day: -9, by: 'U01' },
    { to: 'NEED_INFO', day: -8, by: 'U08', reason: '請補充影響客戶數與近三個月被退回的次數' },
  ]))

  // 待排程
  add(base({
    id: 'R06', title: '業務週報自動彙整', type: '功能', reporterId: 'U05', pmId: 'U02', priority: '高',
    problem: '業務主管每週五需手動彙整 8 位業務的週報，約花費 2 小時。', expected: '系統每週五 17:00 自動彙整互動紀錄與需求進度，產生週報草稿。',
    impactScope: '內部團隊', impactNote: '業務主管與 8 位業務', urgency: '中', urgencyNote: '本季內',
    evaluation: { scores: { impact: 2, urgency: 2, strategy: 3, cost: 2 }, rationale: '直接支持年度「業務效率」目標，技術上可沿用報表模組。', effort: '約 6 人天', reviewerId: 'U02', at: at(-2, 14) },
  }, [{ to: 'DRAFT', day: -5, by: 'U05' }, { to: 'PENDING_REVIEW', day: -5, by: 'U05' }, { to: 'ACCEPTED', day: -2, by: 'U02', reason: '接受，優先級：高' }]))

  // 待業務驗收
  add(base({
    id: 'R07', title: '訂單查詢支援多條件', type: '功能', reporterId: 'U01', pmId: 'U02', assigneeId: 'U03', qaId: 'U04', uatReviewerId: 'U01',
    clientIds: ['C003'], priority: '高', problem: '訂單查詢只能用單一條件，業務要反覆查詢再手動比對。', expected: '可同時以客戶、日期區間、狀態、業務員篩選訂單。',
    impactScope: '單一客戶', impactNote: '晨光國際採購部 6 人', urgency: '高', urgencyNote: '客戶旺季前需上線',
    committedDate: addWorkingDays(today, 5), acceptanceCriteria: ['可同時套用 4 種條件', '查詢結果 2 秒內回應', '條件可儲存為常用查詢'], techConfirmed: true,
    evaluation: { scores: { impact: 2, urgency: 3, strategy: 2, cost: 2 }, rationale: '客戶旺季前需求，影響訂單處理效率。', effort: '約 8 人天', reviewerId: 'U02', at: at(-25) },
  }, [
    { to: 'DRAFT', day: -27, by: 'U01' }, { to: 'PENDING_REVIEW', day: -27, by: 'U01' }, { to: 'ACCEPTED', day: -25, by: 'U02' },
    { to: 'IN_DEV', day: -21, by: 'U02', reason: '指派張家豪，承諾日期已確認' }, { to: 'IN_QA', day: -4, by: 'U03', reason: '測試版本 v2.14.0-rc1' },
    { to: 'IN_UAT', day: -1, by: 'U04', reason: '所有案例通過' },
  ]))
  requirements[6].testRuns = [run('TR04', -1, 'v2.14.0-rc1', [['TC-01 多條件查詢', 'PASS'], ['TC-02 回應時間', 'PASS'], ['TC-03 常用查詢', 'PASS']])]

  // 開發中・即將逾期
  add(base({
    id: 'R08', title: '出貨通知 Email 範本', type: '改善', reporterId: 'U07', pmId: 'U02', assigneeId: 'U03', qaId: 'U04', uatReviewerId: 'U07',
    clientIds: ['C004'], priority: '一般', problem: '出貨通知信內容固定，無法依客戶加入物流單號與聯絡窗口。', expected: '可為每位客戶設定 Email 範本，自動帶入物流單號與窗口。',
    impactScope: '單一客戶', impactNote: '海岸物流', urgency: '中', urgencyNote: '客戶已反映兩次',
    committedDate: addWorkingDays(today, 2), acceptanceCriteria: ['範本可插入物流單號變數', '可依客戶設定不同範本'], techConfirmed: true,
  }, [
    { to: 'DRAFT', day: -20, by: 'U07' }, { to: 'PENDING_REVIEW', day: -20, by: 'U07' }, { to: 'ACCEPTED', day: -18, by: 'U02' },
    { to: 'IN_DEV', day: -12, by: 'U02', reason: '指派張家豪' },
  ]))
  requirements[7].comments = [{ id: 'CM3', authorId: 'U03', body: '範本變數已完成，剩客戶別設定頁，預計後天提交測試。', mentions: [], at: at(-1, 17, 20) }]

  // 待測試
  add(base({
    id: 'R09', title: '發票號碼重複檢查', type: '缺陷', reporterId: 'U01', pmId: 'U02', assigneeId: 'U03', qaId: 'U04',
    clientIds: ['C001'], priority: '緊急', problem: '同一張發票號碼可以重複輸入，造成對帳錯誤，本月已發生 3 次。', expected: '輸入已存在的發票號碼時阻擋並提示原單據編號。',
    impactScope: '單一客戶', impactNote: '大川科技財務部', urgency: '高', urgencyNote: '月底結帳前必須修正',
    committedDate: addWorkingDays(today, 1), acceptanceCriteria: ['重複號碼無法儲存', '提示訊息含原單據編號'], techConfirmed: true,
  }, [
    { to: 'DRAFT', day: -8, by: 'U01' }, { to: 'PENDING_REVIEW', day: -8, by: 'U01' }, { to: 'ACCEPTED', day: -7, by: 'U02', reason: '緊急：本週期處理' },
    { to: 'IN_DEV', day: -7, by: 'U02' }, { to: 'IN_QA', day: -2, by: 'U03', reason: '測試版本 v2.14.0-rc3' },
  ]))

  // 開發中・已逾期（內部需求）
  add(base({
    id: 'R10', title: '匯率更新排程失敗', type: '缺陷', reporterId: 'U03', pmId: 'U02', assigneeId: 'U03', qaId: 'U04', uatReviewerId: 'U02',
    priority: '緊急', problem: '每日 06:00 的匯率更新排程近一週有 3 天失敗，外幣報價使用舊匯率。', expected: '排程失敗時自動重試 3 次並通知維運，報價頁顯示匯率更新時間。',
    impactScope: '全公司', impactNote: '所有外幣報價', urgency: '高', urgencyNote: '影響報價正確性',
    committedDate: addDays(today, -3), acceptanceCriteria: ['失敗自動重試 3 次', '失敗時通知維運', '報價頁顯示匯率更新時間'], techConfirmed: true,
  }, [
    { to: 'DRAFT', day: -12, by: 'U03' }, { to: 'PENDING_REVIEW', day: -12, by: 'U03' }, { to: 'ACCEPTED', day: -11, by: 'U02' },
    { to: 'IN_DEV', day: -10, by: 'U02' }, { to: 'IN_QA', day: -6, by: 'U03', reason: '測試版本 v2.13.4' },
    { to: 'IN_DEV', day: -5, by: 'U04', reason: '測試失敗：BUG-872 重試後未通知維運' },
  ]))
  requirements[9].testRuns = [run('TR05', -5, 'v2.13.4', [['TC-01 自動重試', 'PASS'], ['TC-02 通知維運', 'FAIL'], ['TC-03 顯示更新時間', 'PASS']], 'BUG-872 重試後未通知維運')]

  // 不採納／已取消／草稿
  add(base({
    id: 'R11', title: '客戶生日自動寄送賀卡', type: '功能', reporterId: 'U07', pmId: 'U02', clientIds: ['C004'],
    problem: '業務常忘記客戶窗口生日，希望系統自動寄送電子賀卡。', expected: '每日自動寄送生日賀卡給當天生日的客戶窗口。',
    impactScope: '多客戶', impactNote: '所有客戶窗口', urgency: '低', urgencyNote: '無',
  }, [{ to: 'DRAFT', day: -15, by: 'U07' }, { to: 'PENDING_REVIEW', day: -15, by: 'U07' }, { to: 'REJECTED', day: -13, by: 'U02', reason: '屬行銷自動化，不在第一版範圍（PRD 02 非目標）' }]))

  add(base({
    id: 'R12', title: '報價單匯出加稅別', type: '功能', reporterId: 'U07', pmId: 'U02', clientIds: ['C004'], duplicateOfId: 'R03',
    problem: '報價單匯出沒有稅別欄位，客戶需要手動補上。', expected: '報價單匯出含稅別欄位。',
    impactScope: '單一客戶', impactNote: '海岸物流', urgency: '中', urgencyNote: '',
  }, [{ to: 'DRAFT', day: -1, by: 'U07' }, { to: 'PENDING_REVIEW', day: -1, by: 'U07' }, { to: 'CANCELLED', day: 0, by: 'U02', reason: '與既有需求重複，已關聯主需求' }]))

  add(base({
    id: 'R13', title: '報價單範本支援英文版', type: '功能', reporterId: 'U01', pmId: 'U02', clientIds: ['C003'],
    problem: '晨光國際的海外窗口看不懂中文報價單。', expected: '',
    impactScope: '單一客戶', impactNote: '', urgency: '中', urgencyNote: '',
  }, [{ to: 'DRAFT', day: 0, by: 'U01' }]))

  return {
    rev: 1,
    updatedAt: now.toISOString(),
    seq,
    users: users.map(u => ({ ...u, lastLogin: u.status === '啟用' ? at(-1, 9) : at(-40, 9) })),
    clients: [
      {
        id: 'C001', name: '大川科技股份有限公司', taxId: '12345678', ownerId: 'U01', status: '啟用', industry: '製造業',
        contacts: [
          { id: 'CT01', name: '張志豪', title: '採購主管', email: 'chang@dachuan.com.tw', phone: '0912-345-678' },
          { id: 'CT02', name: '李美玲', title: '財務經理', email: 'li@dachuan.com.tw', phone: '0922-456-123' },
        ],
        interactions: [
          { id: 'I01', date: addDays(today, -1), actorId: 'U01', channel: '面談', summary: '客戶確認 Q4 規劃，報價單稅別欄位是財務送審的前提。', next: '追蹤報價單稅別需求評估', source: 'manual' },
          { id: 'I02', date: addDays(today, -12), actorId: 'U01', channel: 'LINE', summary: '客戶反映發票號碼重複輸入，本月已發生 3 次。', next: '提交缺陷需求', source: 'line', rawRef: 'LINE#msg_9a3f' },
        ],
        createdAt: at(-400), updatedAt: at(-1), version: 1,
      },
      {
        id: 'C002', name: '北辰精密工業股份有限公司', taxId: '87654321', ownerId: 'U01', status: '啟用', industry: '精密機械',
        contacts: [{ id: 'CT03', name: '吳建明', title: 'IT 主管', email: 'wu@beichen.com.tw', phone: '0933-567-890' }],
        interactions: [{ id: 'I03', date: addDays(today, -6), actorId: 'U01', channel: '電話', summary: '討論客戶等級調整規則，客戶希望自動化。', next: '補充升降級門檻', source: 'manual' }],
        createdAt: at(-300), updatedAt: at(-6), version: 1,
      },
      {
        id: 'C003', name: '晨光國際有限公司', taxId: '11223344', ownerId: 'U01', status: '啟用', industry: '貿易業',
        contacts: [{ id: 'CT04', name: '陳靜怡', title: '採購部長', email: 'chen@morninglight.com', phone: '0944-678-901' }],
        interactions: [],
        createdAt: at(-200), updatedAt: at(-30), version: 1,
      },
      {
        id: 'C004', name: '海岸物流股份有限公司', taxId: '55667788', ownerId: 'U07', status: '啟用', industry: '物流業',
        contacts: [{ id: 'CT05', name: '林宏志', title: '營運經理', email: 'lin@coastlog.com.tw', phone: '0955-111-222' }],
        interactions: [{ id: 'I04', date: addDays(today, -3), actorId: 'U07', channel: 'Email', summary: '客戶再次詢問出貨通知範本上線時間。', next: '回覆承諾日期', source: 'email', rawRef: 'MAIL#<a81c@coastlog.com.tw>' }],
        createdAt: at(-150), updatedAt: at(-3), version: 1,
      },
      {
        id: 'C005', name: '遠東資訊服務有限公司', taxId: '99887766', ownerId: 'U07', status: '封存', industry: '資訊服務',
        contacts: [], interactions: [],
        createdAt: at(-500), updatedAt: at(-90), version: 2,
      },
    ],
    requirements,
    notifications: [],
    audit: [],
    cashFlow: Array.from({ length: 6 }, (_, i) => {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + i)
      return {
        month: d.toISOString().slice(0, 7),
        revenue: [200000, 320000, 480000, 350000, 420000, 560000][i],
        devCost: [150000, 180000, 160000, 120000, 140000, 200000][i],
        pmCost: 40000,
        infra: [15000, 15000, 18000, 18000, 20000, 20000][i],
        misc: [10000, 12000, 8000, 10000, 10000, 15000][i],
      }
    }),
    integrations: {
      email: { enabled: true, smtpHost: 'smtp.company.tw', smtpPort: '587', fromName: '需求管理平台', notifyOn: ['submit', 'status', 'mention', 'reminder'] },
      line: { enabled: false, webhookUrl: '', targetGroupId: '', notifyOn: ['status'] },
      externalApis: [
        { id: 'API1', name: 'ERP 客戶主檔', endpoint: './mock/erp-customers.json', method: 'GET', enabled: true, syncMinutes: 5, lastSyncAt: '', lastStatus: 'untested', lastMessage: '' },
        { id: 'API2', name: 'HR 在職名單', endpoint: './mock/hr-employees.json', method: 'GET', enabled: true, syncMinutes: 30, lastSyncAt: '', lastStatus: 'untested', lastMessage: '' },
      ],
    },
    automation: [],
    idempotency: {},
  }
}
