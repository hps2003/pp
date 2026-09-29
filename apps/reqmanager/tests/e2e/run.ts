// 端對端測試：啟動 Node API 伺服器（含建置後前端），以多個瀏覽器身分走完
// 「提交 → 評估 → 指派 → 開發 → 測試 → 業務驗收 → 結案」，並驗證：
//   - 使用者互動：就地錯誤、按鈕依角色 × 狀態顯示、條件不齊時停用
//   - 自動化更新：另一位使用者的畫面不重新整理即看到變更
//   - 手動編輯：客戶、現金流編輯後其他人自動看到
//   - 權限：越權網址顯示無權限；同時修改顯示衝突
//   - 視覺：各畫面截圖存到 docs/screenshots/
// 執行：npm run build && npm run test:e2e

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const shots = path.join(root, 'docs/screenshots')
const PORT = 8790 + Math.floor(Math.random() * 100)
const BASE = `http://localhost:${PORT}/`
const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reqm-')), 'db.json')
fs.mkdirSync(shots, { recursive: true })

const server = spawn(process.execPath, ['server/index.ts'], { cwd: root, env: { ...process.env, PORT: String(PORT), DATA_FILE: dataFile, AUTOMATION_SEC: '0', LOG: '0' }, stdio: 'inherit' })
const cleanup = () => server.kill()
process.on('exit', cleanup)

let passed = 0
const errors: string[] = []
async function step(name: string, fn: () => Promise<void>) {
  const t = Date.now()
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name} (${Date.now() - t}ms)`)
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message.split('\n').slice(0, 4).join('\n    ') : e}`)
    cleanup()
    process.exit(1)
  }
}

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}api/health`)).ok) return
    } catch {
      /* 尚未啟動 */
    }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('server did not start')
}

async function as(browser: Browser, userId: string, pollSec = 2): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' })
  // 連線到 Node API 伺服器（同網域），自動更新每 2 秒
  await ctx.addInitScript(cfg => localStorage.setItem('reqmanager.config', cfg), JSON.stringify({ mode: 'http', baseUrl: '', pollSec }))
  // 外部字型在離線環境可能無法載入，不影響功能
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort())
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${userId}: ${e.message}`))
  await page.goto(`${BASE}#/login`)
  await page.getByTestId('sso-login').click()
  await page.getByTestId(`account-${userId}`).click()
  await page.waitForSelector('.sidebar')
  return { ctx, page }
}

const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage })

await waitServer()
const browser = await chromium.launch()
console.log(`E2E against ${BASE}`)

let reqId = ''
let reqNo = ''
const title = `E2E 報價單批次匯出 ${Date.now().toString(36)}`

const biz = await as(browser, 'U01')
const pm = await as(browser, 'U02')

await step('S01 登入：停用帳號顯示錯誤訊息', async () => {
  const ctx = await browser.newContext()
  await ctx.addInitScript(() => localStorage.setItem('reqmanager.config', JSON.stringify({ mode: 'http', baseUrl: '', pollSec: 0 })))
  const p = await ctx.newPage()
  await p.goto(`${BASE}#/login`)
  await shot(p, 'S01-login')
  await p.getByTestId('sso-login').click()
  await p.getByTestId('account-U09').click()
  await p.getByTestId('login-error').getByText('此帳號已停用').waitFor()
  await ctx.close()
})

await step('S02 工作台（業務）：數字卡依角色、點卡片篩選清單', async () => {
  const { page } = biz
  await page.getByTestId('card-needinfo').waitFor()
  assert.equal(await page.getByTestId('card-needinfo').locator('.value').textContent(), '2')
  await shot(page, 'S02-workbench-business')
  await page.getByTestId('card-needinfo').click()
  assert.equal(await page.getByTestId('todo-table').locator('tbody tr').count(), 2)
})

await step('S02 工作台（PM）：待評估／待排程／待結案／逾期', async () => {
  await pm.page.getByTestId('card-review').waitFor()
  assert.equal(await pm.page.getByTestId('card-review').locator('.value').textContent(), '1')
  await shot(pm.page, 'S02-workbench-pm')
})

await step('S06 提交需求：缺必填就地提示，內容保留（AC-02A）', async () => {
  const { page } = biz
  await page.goto(`${BASE}#/requirements/new`)
  await page.getByTestId('next-step').click()
  await page.locator('[data-field-error="true"]').first().waitFor()
  assert.ok((await page.locator('.error-msg').count()) >= 2)
  await shot(page, 'S06-form-errors')
  await page.getByTestId('f-title').fill(title)
  await page.getByTestId('f-type-功能').click()
  await page.getByTestId('next-step').click()
  await page.getByTestId('f-problem').fill('業務每月需逐筆匯出 200 張報價單，平均耗時 3 小時。')
  await page.getByTestId('f-expected').fill('可一次勾選多張報價單並匯出為單一 Excel 檔。')
  await page.getByTestId('next-step').click()
  await page.getByTestId('f-impactScope').selectOption('單一客戶')
  await page.getByTestId('f-impactNote').fill('大川科技業務 5 人')
  await page.getByTestId('f-urgency-高').click()
  await page.getByTestId('f-urgencyNote').fill('客戶 Q4 旺季前需要')
  await page.getByTestId('f-clients').getByText('大川科技股份有限公司').click()
  await page.getByTestId('next-step').click()
  await page.getByTestId('confirm').getByText(title).waitFor()
  await page.getByTestId('autosave').getByText('草稿已自動儲存').waitFor({ timeout: 5000 })
  await shot(page, 'S06-form-confirm')
})

await step('S06 提交成功：產生 REQ 編號（AC-02D）', async () => {
  const { page } = biz
  await page.getByTestId('submit-req').click()
  await page.getByTestId('submit-success').waitFor()
  reqNo = (await page.getByTestId('req-no').textContent()) ?? ''
  assert.match(reqNo, /^REQ-\d{6}-\d{4}$/)
  await shot(page, 'S06-submitted')
  await page.getByRole('link', { name: '查看需求' }).click()
  await page.getByTestId('req-detail').waitFor()
  reqId = page.url().split('/').pop()!
})

await step('自動化更新：PM 工作台不重新整理即出現新需求', async () => {
  const { page } = pm
  await page.goto(`${BASE}#/`)
  await page.getByTestId('todo-table').getByText(title).waitFor({ timeout: 8000 })
  await page.getByTestId('bell').locator('.badge-count').waitFor()
})

await step('S05 需求列表：篩選標籤、條件保留在網址（AC-04B）', async () => {
  const { page } = pm
  await page.goto(`${BASE}#/requirements?tab=all`)
  await page.getByTestId('filter-status').selectOption('PENDING_REVIEW')
  await page.getByTestId('filter-type').selectOption('功能')
  await page.getByTestId('req-table').getByText(title).waitFor()
  await shot(page, 'S05-list-filtered')
  await page.getByTestId('req-table').getByText(title).click()
  await page.getByTestId('req-detail').waitFor()
  await page.goBack()
  await page.locator('.tag-filter').getByText('狀態：待評估').waitFor()
  await page.getByTestId('list-search').fill('不存在的關鍵字xyz')
  await page.getByTestId('list-search').press('Enter')
  await page.getByText('找不到符合條件的需求').waitFor()
  await page.getByRole('button', { name: '清除篩選' }).click()
  await page.getByTestId('req-table').waitFor()
})

await step('S07／S08-A PM 接受：計分與說明必填後才可送出', async () => {
  const { page } = pm
  await page.goto(`${BASE}#/requirements/${reqId}`)
  await page.getByTestId('action-accept').waitFor()
  assert.equal(await page.getByTestId('action-startDev').count(), 0)
  await shot(page, 'S07-detail-pm')
  await page.getByTestId('action-accept').click()
  const dlg = page.getByTestId('dialog-accept')
  assert.ok(await dlg.getByTestId('dialog-confirm').isDisabled())
  for (const k of ['impact', 'urgency', 'strategy', 'cost']) await dlg.getByTestId(`score-${k}-2`).click()
  await dlg.getByTestId('f-priority').selectOption('高')
  await dlg.getByTestId('f-rationale').fill('影響大川科技報價流程，改動範圍小。')
  await shot(page, 'S08-accept')
  await dlg.getByTestId('dialog-confirm').click()
  await page.locator('[data-testid="req-detail"][data-status="ACCEPTED"]').waitFor()
})

await step('S08-B 開始開發：列出尚缺項目，齊全才可送出（AC-03C）', async () => {
  const { page } = pm
  await page.getByTestId('action-startDev').click()
  const dlg = page.getByTestId('dialog-startDev')
  await dlg.getByTestId('missing').waitFor()
  assert.ok(await dlg.getByTestId('dialog-confirm').isDisabled())
  await dlg.getByTestId('f-assignee').selectOption('U03')
  const d = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  await dlg.getByTestId('f-committed').fill(d)
  await dlg.getByLabel('驗收條件 1').fill('可勾選多張報價單匯出')
  await dlg.getByLabel('驗收條件 2').fill('匯出檔包含全部勾選項目')
  await shot(page, 'S08-startdev-missing')
  await dlg.getByText('技術負責人已確認可行性').click()
  assert.equal(await dlg.getByTestId('missing').count(), 0)
  await dlg.getByTestId('dialog-confirm').click()
  await page.locator('[data-testid="req-detail"][data-status="IN_DEV"]').waitFor()
})

await step('權限：工程只看得到被指派的需求；越權網址顯示無權限（AC-01C）', async () => {
  const dev = await as(browser, 'U03')
  await dev.page.goto(`${BASE}#/requirements/R03`)
  await dev.page.locator('[data-state="forbidden"]').waitFor()
  await shot(dev.page, 'S12-no-permission')
  await dev.page.goto(`${BASE}#/requirements/${reqId}`)
  await dev.page.getByTestId('action-submitTest').click()
  const dlg = dev.page.getByTestId('dialog-submitTest')
  await dlg.getByTestId('f-build').fill('v2.15.0-rc1')
  await dlg.getByText('已完成自測').click()
  await dlg.getByTestId('dialog-confirm').click()
  await dev.page.locator('[data-testid="req-detail"][data-status="IN_QA"]').waitFor()
  await dev.ctx.close()
})

await step('S09-A QA：有失敗案例時「通過」停用；失敗需缺陷連結並退回開發', async () => {
  const qa = await as(browser, 'U04')
  await qa.page.goto(`${BASE}#/requirements/${reqId}`)
  await qa.page.getByTestId('action-recordTest').click()
  const d = qa.page.getByTestId('drawer-qa')
  await d.getByTestId('case-1-FAIL').click()
  assert.ok(await d.getByTestId('qa-pass').isDisabled())
  assert.ok(await d.getByTestId('qa-fail').isDisabled())
  await d.getByTestId('f-defect').fill('BUG-901 漏匯出最後一筆')
  await shot(qa.page, 'S09-qa-fail')
  await d.getByTestId('qa-fail').click()
  await qa.page.locator('[data-testid="req-detail"][data-status="IN_DEV"]').waitFor()
  await qa.ctx.close()
  // 工程修正後重新提交，QA 通過
  const dev = await as(browser, 'U03')
  await dev.page.goto(`${BASE}#/requirements/${reqId}`)
  await dev.page.getByTestId('action-submitTest').click()
  await dev.page.getByTestId('f-build').fill('v2.15.0-rc2')
  await dev.page.getByText('已完成自測').click()
  await dev.page.getByTestId('dialog-confirm').click()
  await dev.page.locator('[data-testid="req-detail"][data-status="IN_QA"]').waitFor()
  await dev.ctx.close()
  const qa2 = await as(browser, 'U04')
  await qa2.page.goto(`${BASE}#/requirements/${reqId}`)
  await qa2.page.getByTestId('action-recordTest').click()
  await qa2.page.getByTestId('f-build').fill('v2.15.0-rc2')
  await qa2.page.getByTestId('qa-pass').click()
  await qa2.page.locator('[data-testid="req-detail"][data-status="IN_UAT"]').waitFor()
  await qa2.page.getByTestId('tab-records').click()
  assert.equal(await qa2.page.getByText('v2.15.0-rc1').count() > 0, true) // 前次紀錄保留（AC-05A）
  await qa2.ctx.close()
})

await step('S09-B 業務驗收：逐項確認後通過（只有指定驗收者看得到）', async () => {
  const { page } = biz
  await page.goto(`${BASE}#/requirements/${reqId}`)
  await page.getByTestId('action-uat').click()
  const d = page.getByTestId('drawer-uat')
  await d.getByTestId('uat-pass').check()
  assert.ok(await d.getByTestId('uat-submit').isDisabled())
  await d.getByTestId('uat-check-0').check()
  await d.getByTestId('uat-check-1').check()
  await shot(page, 'S09-uat')
  await d.getByTestId('uat-submit').click()
  await page.getByTestId('next-step').getByText('業務驗收已通過').waitFor()
})

await step('S09-C 結案：三項檢查齊全才可結案（AC-05C）', async () => {
  const { page } = pm
  await page.goto(`${BASE}#/requirements/${reqId}`)
  await page.getByTestId('action-close').click()
  const d = page.getByTestId('drawer-close')
  assert.ok(await d.getByTestId('close-confirm').isDisabled())
  await d.getByTestId('f-build').fill('v2.15.0')
  await shot(page, 'S09-close')
  await d.getByTestId('close-confirm').click()
  await page.locator('[data-testid="req-detail"][data-status="CLOSED"]').waitFor()
  await shot(page, 'S07-detail-closed', true)
})

await step('自動化更新：業務的需求頁自動顯示已結案', async () => {
  await biz.page.locator('[data-testid="req-detail"][data-status="CLOSED"]').waitFor({ timeout: 8000 })
})

await step('同時修改：舊版本送出顯示衝突提示（PRD 7.4）', async () => {
  // 關閉自動更新的第二個 PM 分頁，模擬「畫面停留在舊版本」
  const stale = await as(browser, 'U02', 0)
  const page = stale.page
  await page.goto(`${BASE}#/requirements/R06`)
  await page.getByTestId('action-startDev').waitFor()
  // 模擬另一位 PM 同時改了這筆需求（直接呼叫 API）
  const cur = (await (await fetch(`${BASE}api/requirements/R06`, { headers: { authorization: 'Bearer U02' } })).json()) as { version: number }
  await fetch(`${BASE}api/requirements/R06`, { method: 'PATCH', headers: { authorization: 'Bearer U02', 'content-type': 'application/json' }, body: JSON.stringify({ priority: '緊急', version: cur.version }) })
  await page.getByTestId('more-menu').click()
  await page.getByTestId('menu-reassignPm').click()
  await page.locator('.dialog select').selectOption('U08')
  await page.locator('.dialog textarea').fill('產品線調整')
  await page.getByTestId('dialog-confirm').click()
  await page.getByTestId('conflict').waitFor()
  await shot(page, 'S12-conflict')
  await stale.ctx.close()
})

await step('S03／S04 客戶：統編重複不可建立、名稱相似需確認；手動編輯互動', async () => {
  const { page } = biz
  await page.goto(`${BASE}#/clients`)
  await page.getByTestId('client-table').waitFor()
  await shot(page, 'S03-clients')
  await page.getByTestId('new-client').click()
  await page.getByTestId('c-name').fill('大川科技有限公司')
  await page.getByTestId('c-taxid').fill('12345678')
  await page.getByTestId('client-save').click()
  await page.getByText('統一編號已存在').waitFor()
  await page.getByTestId('c-taxid').fill('13572468')
  await page.getByTestId('client-save').click()
  await page.getByTestId('similar-warning').waitFor()
  await page.getByTestId('confirm-similar').click()
  await page.getByTestId('client-detail').waitFor()
  await page.getByRole('tab', { name: /互動紀錄/ }).click()
  await page.getByTestId('add-interaction').click()
  await page.getByTestId('i-summary').fill('初次拜訪，確認報價單流程。')
  await page.getByTestId('interaction-save').click()
  await page.getByTestId('interactions').getByText('初次拜訪').waitFor()
  await page.goto(`${BASE}#/clients/C001`)
  await page.getByTestId('contacts').getByText('0912-345-678').waitFor()
  await shot(page, 'S04-client-detail')
})

await step('手動編輯＋自動更新：PM 修改現金流，業務主管畫面自動更新', async () => {
  const mgr = await as(browser, 'U05')
  await mgr.page.goto(`${BASE}#/reports?view=cashflow`)
  await mgr.page.getByTestId('cf-0-revenue').waitFor()
  const { page } = pm
  await page.goto(`${BASE}#/reports?view=cashflow`)
  await page.getByTestId('cf-0-revenue').fill('777000')
  await page.getByTestId('cashflow-save').click()
  await page.getByText('現金流已儲存').waitFor()
  await mgr.page.waitForFunction(() => (document.querySelector('[data-testid="cf-0-revenue"]') as HTMLInputElement)?.value === '777000', undefined, { timeout: 8000 })
  await shot(page, 'S10-cashflow', true)
  await mgr.ctx.close()
})

await step('S10 管理報表：指標、下鑽明細、時間軸', async () => {
  const { page } = pm
  await page.goto(`${BASE}#/reports`)
  await page.getByTestId('report-meta').getByText('Asia/Taipei').waitFor()
  await page.getByTestId('kpi-目前逾期').click()
  await page.getByTestId('drill').locator('tbody tr').first().waitFor()
  await shot(page, 'S10-reports', true)
  await page.goto(`${BASE}#/reports?view=timeline`)
  await page.getByTestId('gantt').waitFor()
  await shot(page, 'S10-timeline')
})

await step('S12 外部 API 同步（ERP 客戶主檔）與自動化排程', async () => {
  const { page } = pm
  await page.goto(`${BASE}#/system?view=integrations`)
  await page.getByTestId('sync-API1').click()
  await page.getByText(/同步完成：讀取 5 筆/).waitFor()
  await page.getByTestId('run-automation').click()
  await page.getByTestId('automation-log').locator('tr').first().waitFor()
  await shot(page, 'S12-integrations')
  await page.goto(`${BASE}#/clients`)
  // PM 可看全部客戶，ERP 新增的客戶自動出現
  await page.getByTestId('client-table').getByText('青禾生技股份有限公司').waitFor()
})

await step('S11 帳號與權限：停用需二次確認，被停用者既有登入立即失效', async () => {
  const victim = await as(browser, 'U07')
  const admin = await as(browser, 'U06')
  await admin.page.getByTestId('user-table').waitFor()
  await shot(admin.page, 'S11-accounts')
  await admin.page.getByTestId('toggle-U07').click()
  await admin.page.getByTestId('confirm-toggle').getByTestId('dialog-confirm').click()
  await admin.page.getByText('已停用，既有登入立即失效').waitFor()
  await victim.page.getByTestId('login').waitFor({ timeout: 8000 })
  await victim.page.getByText('此帳號已停用').waitFor()
  await admin.page.goto(`${BASE}#/admin/users?view=audit`)
  await admin.page.getByTestId('audit-table').getByText('拒絕').first().waitFor()
  await victim.ctx.close()
  await admin.ctx.close()
})

await step('說明頁：UF-00／01／02 與 S01–S12 畫面拆解', async () => {
  const { page } = biz
  await page.goto(`${BASE}#/docs`)
  await shot(page, 'UF-01-lifecycle')
  await page.getByRole('tab', { name: 'S01–S12 畫面' }).click()
  assert.equal(await page.locator('[data-testid^="screen-S"]').count(), 12)
  await shot(page, 'S00-screen-index', true)
})

await step('瀏覽器內建 API 模式（GitHub Pages）：同一瀏覽器兩個分頁自動同步', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort())
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('reqmanager.config')) localStorage.setItem('reqmanager.config', JSON.stringify({ mode: 'local', baseUrl: '', pollSec: 30 }))
  })
  const a = await ctx.newPage()
  await a.goto(`${BASE}#/login`)
  await a.getByTestId('sso-login').click()
  await a.getByTestId('account-U01').click()
  await a.waitForSelector('.sidebar')
  await a.goto(`${BASE}#/requirements?tab=mine`)
  await a.getByTestId('req-table').waitFor()
  const b = await ctx.newPage()
  await b.goto(`${BASE}#/requirements/R13/edit`)
  await b.getByTestId('f-title').fill('報價單範本支援英文版（跨分頁同步測試）')
  await b.getByTestId('autosave').getByText('草稿已自動儲存').waitFor({ timeout: 6000 })
  // 分頁 A 輪詢間隔 30 秒，但 BroadcastChannel 會立即通知
  await a.getByTestId('req-table').getByText('跨分頁同步測試').waitFor({ timeout: 5000 })
  await ctx.close()
})

await browser.close()
cleanup()
if (errors.length) {
  console.error(`\n頁面錯誤：\n${errors.join('\n')}`)
  process.exit(1)
}
console.log(`\n${passed} 個情境全部通過；截圖：${path.relative(process.cwd(), shots)}/`)
process.exit(0)
