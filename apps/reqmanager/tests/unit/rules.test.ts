// 領域規則單元測試：工作天、期限狀態、合法操作、遮罩。執行：npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addWorkingDays, workingDaysBetween, taipeiDate } from '../../src/domain/time.ts'
import { dueState } from '../../src/domain/metrics.ts'
import { availableActions, maskPhone, normalizeCompany } from '../../src/domain/rules.ts'
import { createSeed } from '../../src/domain/seed.ts'

test('工作天：跳過週末', () => {
  assert.equal(addWorkingDays('2026-10-02', 1), '2026-10-05') // 週五 + 1 = 週一
  assert.equal(workingDaysBetween('2026-10-02', '2026-10-05'), 1)
  assert.equal(workingDaysBetween('2026-09-28', '2026-10-02'), 4)
})

test('台北時區：UTC 16:30 已是隔天', () => {
  assert.equal(taipeiDate('2026-09-29T16:30:00Z'), '2026-09-30')
})

test('承諾日期狀態：逾期／剩 2 個工作天內／未設定', () => {
  assert.equal(dueState({ committedDate: '2026-09-26', status: 'IN_DEV' }, '2026-09-29').kind, 'overdue')
  assert.equal(dueState({ committedDate: '2026-09-26', status: 'IN_DEV' }, '2026-09-29').days, 3)
  assert.equal(dueState({ committedDate: '2026-10-01', status: 'IN_DEV' }, '2026-09-29').label, '10/01・剩 2 天')
  assert.equal(dueState({ committedDate: '2026-10-09', status: 'IN_DEV' }, '2026-09-29').kind, 'ok')
  assert.equal(dueState({ committedDate: '', status: 'ACCEPTED' }, '2026-09-29').kind, 'none')
  assert.equal(dueState({ committedDate: '2026-09-01', status: 'CLOSED' }, '2026-09-29').kind, 'ok')
})

test('角色 × 狀態：只露出合法操作（S07 註 1）', () => {
  const db = createSeed(new Date('2026-09-29T02:00:00Z'))
  const u = (id: string) => db.users.find(x => x.id === id)!
  const r = (id: string) => db.requirements.find(x => x.id === id)!
  const keys = (uid: string, rid: string) => availableActions(u(uid), r(rid)).map(a => a.key)
  assert.deepEqual(keys('U02', 'R03').filter(k => ['accept', 'requestInfo', 'reject'].includes(k)).sort(), ['accept', 'reject', 'requestInfo'])
  assert.deepEqual(keys('U01', 'R03'), ['withdraw'])
  assert.deepEqual(keys('U01', 'R04'), ['resubmit', 'withdraw'])
  assert.deepEqual(keys('U03', 'R08'), ['submitTest'])
  assert.deepEqual(keys('U04', 'R09'), ['recordTest'])
  assert.ok(keys('U01', 'R07').includes('uat'))
  assert.deepEqual(keys('U06', 'R03'), [])
})

test('敏感欄位遮罩與公司名稱正規化', () => {
  assert.equal(maskPhone('0912-345-678'), '09xx-xxx-678')
  assert.equal(normalizeCompany('大川科技股份有限公司'), normalizeCompany('大川科技有限公司'))
})
