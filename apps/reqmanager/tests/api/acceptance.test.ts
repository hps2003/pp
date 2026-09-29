// PRD 驗收條件（AC）的 API 層測試：直接呼叫 src/domain/api.ts 的 handle()，
// 與 Node 伺服器、瀏覽器內建 API 走同一份程式碼。執行：npm run test:api

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Backend } from '../../src/domain/api.ts'
import { createSeed } from '../../src/domain/seed.ts'
import type { Database } from '../../src/domain/types.ts'

function setup(now = new Date('2026-09-29T02:00:00Z')) {
  let db: Database = createSeed(now)
  const backend: Backend = {
    mode: 'local',
    load: () => structuredClone(db),
    save: d => void (db = structuredClone(d)),
    now: () => now,
    fetchJson: async url => {
      if (url.includes('erp')) return { customers: [{ taxId: '24681357', name: '青禾生技股份有限公司', ownerEmail: 'chou@company.tw' }, { taxId: '11223344', name: '晨光國際有限公司', industry: '國際貿易' }] }
      if (url.includes('hr')) return { employees: [{ email: 'chou@company.tw', active: false }] }
      throw new Error('404')
    },
  }
  const call = async (as: string | null, method: string, path: string, body?: unknown, extra: { query?: Record<string, string>; headers?: Record<string, string> } = {}) => {
    const res = await handle(backend, { method, path, body, query: extra.query, headers: { ...(as ? { authorization: `Bearer ${as}` } : {}), ...extra.headers } })
    return res as { status: number; body: any }
  }
  return { call, db: () => db }
}

const validReq = {
  title: '測試需求：批次匯出', type: '功能', problem: '目前只能逐筆匯出，每月耗時 3 小時。', expected: '可一次勾選多筆並匯出為 Excel。',
  impactScope: '單一客戶', impactNote: '大川科技 5 人', urgency: '中', urgencyNote: '下個月送審', clientIds: ['C001'], pmId: 'U02',
}

test('S01：停用帳號無法登入；停用後既有工作階段失效（FR-07）', async () => {
  const { call } = setup()
  assert.equal((await call(null, 'POST', '/api/auth/login', { userId: 'U09' })).status, 403)
  assert.equal((await call(null, 'POST', '/api/auth/login', { userId: 'U01' })).status, 200)
  assert.equal((await call('U01', 'GET', '/api/workbench')).status, 200)
  assert.equal((await call('U06', 'PATCH', '/api/users/U01', { status: '停用' })).status, 200)
  const r = await call('U01', 'GET', '/api/workbench')
  assert.equal(r.status, 401)
  assert.equal(r.body.code, 'ACCOUNT_DISABLED')
})

test('AC-01A／01B：建立客戶可搜尋；統編重複拒絕；名稱相似需確認', async () => {
  const { call } = setup()
  const dup = await call('U01', 'POST', '/api/clients', { name: '全新公司', taxId: '12345678' })
  assert.equal(dup.status, 422)
  assert.match(dup.body.fields.taxId, /已存在/)
  const similar = await call('U01', 'POST', '/api/clients', { name: '大川科技有限公司', taxId: '13572468' })
  assert.equal(similar.status, 409)
  assert.equal(similar.body.code, 'SIMILAR')
  const ok = await call('U01', 'POST', '/api/clients', { name: '大川科技有限公司', taxId: '13572468', confirmSimilar: true })
  assert.equal(ok.status, 201)
  const found = await call('U01', 'GET', '/api/clients', undefined, { query: { q: '13572468' } })
  assert.equal(found.body.length, 1)
})

test('AC-01C：無權限者以 ID 存取 → 拒絕且不含資料，並寫入稽核', async () => {
  const { call, db } = setup()
  const r = await call('U07', 'GET', '/api/clients/C001') // 周建宏不負責大川科技
  assert.equal(r.status, 403)
  assert.equal(JSON.stringify(r.body).includes('大川'), false)
  assert.ok(db().audit.some(a => a.result === 'denied' && a.resourceId === 'C001'))
  assert.equal((await call('U03', 'GET', '/api/requirements/R03')).status, 403) // 工程未被指派
})

test('FR-07：工程與 QA 的回應不含聯絡人電話與 Email', async () => {
  const { call } = setup()
  const dev = await call('U03', 'GET', '/api/requirements/R09')
  assert.equal(dev.status, 200)
  assert.deepEqual(dev.body.clientNames, ['大川科技股份有限公司'])
  assert.equal(JSON.stringify(dev.body).includes('0912'), false)
  assert.equal((await call('U03', 'GET', '/api/clients/C001')).status, 403)
})

test('AC-01D：負責業務變更後新負責人立即取得存取權', async () => {
  const { call } = setup()
  assert.equal((await call('U07', 'GET', '/api/clients/C002')).status, 403)
  const c = await call('U05', 'GET', '/api/clients/C002')
  assert.equal((await call('U01', 'PATCH', '/api/clients/C002', { ownerId: 'U07', version: c.body.version })).status, 403) // 非主管不可變更
  assert.equal((await call('U05', 'PATCH', '/api/clients/C002', { ownerId: 'U07', version: c.body.version })).status, 200)
  assert.equal((await call('U07', 'GET', '/api/clients/C002')).status, 200)
})

test('AC-01E：封存客戶不能新增互動，也不能關聯新需求', async () => {
  const { call } = setup()
  assert.equal((await call('U05', 'POST', '/api/clients/C001/archive', { archived: true })).status, 200)
  const i = await call('U01', 'POST', '/api/clients/C001/interactions', { summary: '拜訪' })
  assert.equal(i.status, 422)
  assert.equal(i.body.code, 'ARCHIVED')
  const r = await call('U01', 'POST', '/api/requirements', { ...validReq, submit: true })
  assert.equal(r.status, 422)
  assert.match(r.body.fields.clientIds, /封存/)
})

test('AC-02A：缺必填欄位時提交 → 不建立需求並標示欄位', async () => {
  const { call, db } = setup()
  const before = db().requirements.length
  const r = await call('U01', 'POST', '/api/requirements', { title: '只有標題', submit: true })
  assert.equal(r.status, 422)
  for (const k of ['problem', 'expected', 'impactScope', 'urgency']) assert.ok(r.body.fields[k], k)
  assert.equal(db().requirements.length, before)
})

test('AC-02B／02D：重試只建立一筆；提交後為待評估、有編號、PM 收到通知', async () => {
  const { call, db } = setup()
  const h = { headers: { 'idempotency-key': 'k-1' } }
  const a = await call('U01', 'POST', '/api/requirements', { ...validReq, submit: true }, h)
  const b = await call('U01', 'POST', '/api/requirements', { ...validReq, submit: true }, h)
  assert.equal(a.status, 201)
  assert.equal(a.body.id, b.body.id)
  assert.equal(a.body.status, 'PENDING_REVIEW')
  assert.match(a.body.no, /^REQ-\d{6}-\d{4}$/)
  assert.equal(db().requirements.filter(r => r.title === validReq.title).length, 1)
  assert.ok(db().notifications.some(n => n.userId === 'U02' && n.reqId === a.body.id))
})

test('AC-03A／03B：補件與不採納必填原因；非受理 PM 被拒並記錄', async () => {
  const { call, db } = setup()
  const v = (await call('U02', 'GET', '/api/requirements/R03')).body.version
  assert.equal((await call('U02', 'POST', '/api/requirements/R03/actions/requestInfo', { version: v })).status, 422)
  assert.equal((await call('U02', 'POST', '/api/requirements/R03/actions/reject', { version: v })).status, 422)
  assert.equal((await call('U08', 'POST', '/api/requirements/R03/actions/accept', { version: v })).status, 403)
  assert.ok(db().audit.some(a => a.action === 'accept' && a.result === 'denied' && a.actorId === 'U08'))
  assert.equal((await call('U01', 'PATCH', '/api/requirements/R03', { priority: '高', version: v })).status, 403)
})

test('AC-03C：缺負責人、承諾日期或驗收條件 → 無法開始開發', async () => {
  const { call } = setup()
  const v = (await call('U02', 'GET', '/api/requirements/R06')).body.version
  const r = await call('U02', 'POST', '/api/requirements/R06/actions/startDev', { acceptanceCriteria: ['只有一條'], version: v })
  assert.equal(r.status, 422)
  for (const k of ['assigneeId', 'committedDate', 'acceptanceCriteria', 'techConfirmed']) assert.ok(r.body.fields[k], k)
})

test('AC-03D：變更承諾日期必填原因，保留新舊日期並通知提出人', async () => {
  const { call, db } = setup()
  const v = (await call('U02', 'GET', '/api/requirements/R08')).body.version
  assert.equal((await call('U02', 'POST', '/api/requirements/R08/actions/changeCommitted', { committedDate: '2026-10-20', version: v })).status, 422)
  const r = await call('U02', 'POST', '/api/requirements/R08/actions/changeCommitted', { committedDate: '2026-10-20', reason: '客戶追加欄位', version: v })
  assert.equal(r.status, 200)
  assert.equal(r.body.dateChanges.at(-1).newValue, '2026-10-20')
  assert.ok(db().notifications.some(n => n.userId === 'U07' && n.text.includes('承諾日期')))
})

test('AC-04A：列表只含授權範圍；AC-04C：狀態異動記錄操作者、前後狀態與理由', async () => {
  const { call } = setup()
  const dev = await call('U03', 'GET', '/api/requirements', undefined, { query: { tab: 'all' } })
  const ids: string[] = dev.body.items.map((x: { id: string }) => x.id)
  assert.ok(!ids.includes('R03') && ids.includes('R09'))
  const biz = await call('U07', 'GET', '/api/requirements', undefined, { query: { tab: 'all' } })
  assert.ok(biz.body.items.every((x: { clientNames: string[]; reporterId: string }) => x.reporterId === 'U07' || x.clientNames.some(n => n.includes('海岸'))))
  const v = (await call('U02', 'GET', '/api/requirements/R03')).body.version
  const r = await call('U02', 'POST', '/api/requirements/R03/actions/requestInfo', { reason: '請補充客戶數', version: v })
  const ev = r.body.history.at(-1)
  assert.deepEqual([ev.from, ev.to, ev.actorId, ev.reason], ['PENDING_REVIEW', 'NEED_INFO', 'U02', '請補充客戶數'])
})

test('PRD 7.2：非法跳階由後端拒絕', async () => {
  const { call } = setup()
  const r = await call('U02', 'POST', '/api/requirements/R03/actions/close', { build: 'v1' })
  assert.equal(r.status, 422)
  assert.equal(r.body.code, 'INVALID_TRANSITION')
})

test('PRD 7.4：同時修改 → 後送出者收到 409 衝突，不靜默覆寫', async () => {
  const { call } = setup()
  const v = (await call('U02', 'GET', '/api/requirements/R03')).body.version
  assert.equal((await call('U02', 'POST', '/api/requirements/R03/actions/requestInfo', { reason: 'A', version: v })).status, 200)
  const r = await call('U02', 'POST', '/api/requirements/R03/actions/requestInfo', { reason: 'B', version: v })
  assert.ok(r.status === 409 || r.body.code === 'INVALID_TRANSITION')
  const c = await call('U01', 'GET', '/api/clients/C001')
  assert.equal((await call('U01', 'PATCH', '/api/clients/C001', { industry: 'X', version: c.body.version })).status, 200)
  const stale = await call('U01', 'PATCH', '/api/clients/C001', { industry: 'Y', version: c.body.version })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.code, 'CONFLICT')
})

test('AC-05A／05B／05C／05D：完整測試、驗收、結案與重新開啟', async () => {
  const { call } = setup()
  const get = async (as: string) => (await call(as, 'GET', '/api/requirements/R09')).body
  // QA 失敗必須關聯缺陷 → 回到開發中，前次紀錄保留
  let r = await get('U04')
  assert.equal((await call('U04', 'POST', '/api/requirements/R09/actions/recordTest', { build: 'rc3', cases: [{ caseName: 'TC1', result: 'FAIL' }], result: 'FAIL', version: r.version })).status, 422)
  r = (await call('U04', 'POST', '/api/requirements/R09/actions/recordTest', { build: 'rc3', cases: [{ caseName: 'TC1', result: 'FAIL' }], result: 'FAIL', defectRef: 'BUG-1', version: r.version })).body
  assert.equal(r.status, 'IN_DEV')
  r = (await call('U03', 'POST', '/api/requirements/R09/actions/submitTest', { build: 'rc4', selfTested: true, version: r.version })).body
  // 有失敗案例時不能送業務驗收
  assert.equal((await call('U04', 'POST', '/api/requirements/R09/actions/recordTest', { build: 'rc4', cases: [{ caseName: 'TC1', result: 'FAIL' }], result: 'PASS', version: r.version })).status, 422)
  r = (await call('U04', 'POST', '/api/requirements/R09/actions/recordTest', { build: 'rc4', cases: [{ caseName: 'TC1', result: 'PASS' }], result: 'PASS', version: r.version })).body
  assert.equal(r.status, 'IN_UAT')
  assert.equal(r.testRuns.length, 2)
  // 缺 UAT → PM 無法結案
  assert.equal((await call('U02', 'POST', '/api/requirements/R09/actions/close', { build: 'v2.14.0', version: r.version })).status, 422)
  // 非指定驗收者 → 拒絕
  assert.equal((await call('U05', 'POST', '/api/requirements/R09/actions/uat', { result: 'PASS', checked: [true, true], version: r.version })).status, 403)
  r = (await call('U01', 'POST', '/api/requirements/R09/actions/uat', { result: 'PASS', checked: [true, true], version: r.version })).body
  // 缺交付證據 → 無法結案
  assert.equal((await call('U02', 'POST', '/api/requirements/R09/actions/close', { version: r.version })).status, 422)
  r = (await call('U02', 'POST', '/api/requirements/R09/actions/close', { build: 'v2.14.0', version: r.version })).body
  assert.equal(r.status, 'CLOSED')
  r = (await call('U02', 'POST', '/api/requirements/R09/actions/reopen', { reason: '客戶回報仍可重複', version: r.version })).body
  assert.equal(r.status, 'PENDING_REVIEW')
  assert.ok(r.history.some((e: { to: string }) => e.to === 'CLOSED'))
})

test('AC-06B／06C：報表依權限範圍；無樣本時回傳 null（顯示無資料）', async () => {
  const { call } = setup()
  assert.equal((await call('U01', 'GET', '/api/reports')).status, 403)
  const r = await call('U02', 'GET', '/api/reports', undefined, { query: { from: '2020-01-01', to: '2020-01-31' } })
  assert.equal(r.status, 200)
  assert.equal(r.body.evalTime.median, null)
  assert.equal(r.body.timezone, 'Asia/Taipei')
  const all = await call('U02', 'GET', '/api/reports')
  assert.equal(all.body.overdue.value, 1)
  assert.ok(all.body.newCount.value > 0)
})

test('自動化：時限提醒每天只產生一次；外部 API 同步依統編去重並停用離職帳號', async () => {
  const { call, db } = setup()
  await call('U02', 'POST', '/api/automation/run', { force: true })
  const n1 = db().notifications.filter(n => n.kind === 'reminder').length
  assert.ok(n1 > 0)
  await call('U02', 'POST', '/api/automation/run', { force: true })
  assert.equal(db().notifications.filter(n => n.kind === 'reminder').length, n1)
  assert.ok(db().clients.some(c => c.taxId === '24681357'))
  assert.equal(db().clients.find(c => c.taxId === '11223344')!.industry, '國際貿易')
  assert.equal(db().clients.filter(c => c.taxId === '11223344').length, 1)
  assert.equal(db().users.find(u => u.email === 'chou@company.tw')!.status, '停用')
})

test('手動編輯：現金流可儲存，資料版本 rev 遞增供前端自動更新', async () => {
  const { call } = setup()
  const rev0 = (await call(null, 'GET', '/api/changes')).body.rev
  const rows = (await call('U02', 'GET', '/api/cashflow')).body.rows
  rows[0].revenue = 999
  assert.equal((await call('U02', 'PUT', '/api/cashflow', { rows })).status, 200)
  assert.equal((await call('U02', 'GET', '/api/cashflow')).body.rows[0].revenue, 999)
  assert.ok((await call(null, 'GET', '/api/changes')).body.rev > rev0)
  assert.equal((await call('U03', 'PUT', '/api/cashflow', { rows })).status, 403)
})
