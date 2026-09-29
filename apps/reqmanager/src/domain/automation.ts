// 自動化更新：
//   1. 時限提醒（PRD 7.3）——依狀態停留時間產生站內通知，同一規則每天最多一次。
//   2. 外部 API 同步——依設定頻率抓取 ERP 客戶主檔／HR 在職名單，
//      以統編去重更新客戶（不自動覆蓋名稱相似者），並依 HR 名單停用離職帳號。
// 伺服器每分鐘執行一次；瀏覽器內建 API 在每次自動重新整理時執行。

import type { Backend } from './api.ts'
import type { Client, Database, IntegrationSettings } from './types.ts'
import { notify } from './api.ts'
import { lastUatPassed } from './metrics.ts'
import { addWorkingDays, taipeiDate, workingDaysBetween } from './time.ts'

type ExternalApi = IntegrationSettings['externalApis'][number]

function lastEntered(r: Database['requirements'][number]) {
  for (let i = r.history.length - 1; i >= 0; i--) if (r.history[i].to === r.status && r.history[i].from !== r.status) return r.history[i]
  return r.history[r.history.length - 1]
}

/** 產生時限提醒，回傳新增的通知數 */
export function runReminders(db: Database, now: Date): number {
  const today = taipeiDate(now)
  const before = db.notifications.length
  const once = (key: string, userIds: string[], text: string, reqId: string) => {
    // 以「規則 + 日期」為去重鍵，確保每天最多提醒一次
    const k = `${key}:${today}`
    if (db.notifications.some(n => n.dedupKey.startsWith(`${reqId}:${k}`))) return
    notify(db, now, userIds, text, reqId, k, 'reminder')
  }
  const manager = db.users.filter(u => u.role === 'Business' && u.manager && u.status === '啟用').map(u => u.id)

  for (const r of db.requirements) {
    const ev = lastEntered(r)
    if (!ev) continue
    const since = taipeiDate(ev.at)
    const wd = workingDaysBetween(since, today)
    switch (r.status) {
      case 'PENDING_REVIEW':
        if (wd >= 5) once('review5', [r.pmId, ...manager], `${r.no} 已待評估 ${wd} 個工作天，已通知業務主管`, r.id)
        else if (wd >= 3) once('review3', [r.pmId], `${r.no} 已待評估 ${wd} 個工作天，請盡快評估`, r.id)
        break
      case 'NEED_INFO': {
        const days = Math.round((Date.parse(today) - Date.parse(since)) / 86400000)
        if (days >= 30) once('info30', [r.pmId], `${r.no} 待補件已 ${days} 天未回覆，可取消並註明`, r.id)
        else if (days >= 7) once('info7', [r.reporterId], `${r.no} 待補件已 ${days} 天，請補充資訊`, r.id)
        break
      }
      case 'IN_DEV':
      case 'IN_QA':
        if (r.committedDate && r.committedDate >= today && r.committedDate <= addWorkingDays(today, 2)) {
          once('due', [r.assigneeId, r.pmId], `${r.no} 承諾日期 ${r.committedDate.slice(5).replace('-', '/')} 即將到期`, r.id)
        } else if (r.committedDate && r.committedDate < today) {
          once('overdue', [r.assigneeId, r.pmId], `${r.no} 已超過承諾日期，請更新進度或變更承諾日期`, r.id)
        }
        break
      case 'IN_UAT':
        if (!lastUatPassed(r) && wd >= 5) once('uat5', [r.uatReviewerId, r.pmId], `${r.no} 待業務驗收已 ${wd} 個工作天`, r.id)
        break
      case 'DRAFT': {
        const days = Math.round((Date.parse(today) - Date.parse(taipeiDate(r.createdAt))) / 86400000)
        if (days >= 30) once('draft30', [r.reporterId], `草稿「${r.title || '未命名'}」已保留 ${days} 天，請提交或刪除`, r.id)
        break
      }
    }
  }
  return db.notifications.length - before
}

interface ErpCustomer {
  taxId: string
  name: string
  industry?: string
  ownerEmail?: string
}
interface HrEmployee {
  email: string
  name?: string
  dept?: string
  active: boolean
}

function asArray(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)[key])) return (data as Record<string, unknown[]>)[key]
  throw new Error(`回應格式不正確：預期陣列或 { ${key}: [] }`)
}

export async function syncExternalApi(db: Database, backend: Backend, api: ExternalApi, now: Date): Promise<{ ok: boolean; message: string; changed: number }> {
  api.lastSyncAt = now.toISOString()
  try {
    const data = await backend.fetchJson(api.endpoint)
    let changed = 0
    let message = ''
    if (/erp|customer|客戶/i.test(`${api.name} ${api.endpoint}`)) {
      const rows = asArray(data, 'customers') as ErpCustomer[]
      let created = 0
      let updated = 0
      for (const row of rows) {
        if (!row || !/^\d{8}$/.test(String(row.taxId ?? ''))) continue
        const existing = db.clients.find(c => c.taxId === row.taxId)
        const owner = db.users.find(u => u.email === row.ownerEmail && u.role === 'Business' && u.status === '啟用')
        if (existing) {
          const patch: Partial<Client> = {}
          if (row.name && row.name !== existing.name) patch.name = row.name
          if (row.industry && row.industry !== existing.industry) patch.industry = row.industry
          if (Object.keys(patch).length) {
            Object.assign(existing, patch, { updatedAt: now.toISOString(), version: existing.version + 1 })
            existing.interactions.push({
              id: `I${now.getTime().toString(36)}${updated}`, date: taipeiDate(now), actorId: 'system', channel: '系統',
              summary: `[ERP 同步] 更新${Object.keys(patch).map(k => (k === 'name' ? '公司名稱' : '產業別')).join('、')}`, next: '', source: 'api', rawRef: `${api.name}#${row.taxId}`,
            })
            updated++
          }
        } else if (owner && row.name) {
          const iso = now.toISOString()
          db.clients.push({
            id: `C${now.getTime().toString(36)}${created}`, name: row.name, taxId: row.taxId, ownerId: owner.id, status: '啟用',
            industry: row.industry ?? '', contacts: [], interactions: [], createdAt: iso, updatedAt: iso, version: 1,
          })
          notify(db, now, [owner.id], `ERP 同步新增客戶「${row.name}」，負責業務為你`, undefined, `erp:${row.taxId}`)
          created++
        }
      }
      changed = created + updated
      message = `讀取 ${rows.length} 筆：新增 ${created}、更新 ${updated}`
    } else if (/hr|employee|人員|在職/i.test(`${api.name} ${api.endpoint}`)) {
      const rows = asArray(data, 'employees') as HrEmployee[]
      let disabled = 0
      let updated = 0
      for (const row of rows) {
        const u = db.users.find(x => x.email === row.email)
        if (!u) continue
        if (row.active === false && u.status === '啟用' && u.role !== 'Admin') {
          // 離職：當日停用帳號（PRD 6.3）
          u.status = '停用'
          disabled++
          db.audit.unshift({ id: `AU${now.getTime().toString(36)}${disabled}`, actorId: 'system', action: 'disable', resourceType: 'user', resourceId: u.id, at: now.toISOString(), result: 'ok', detail: `HR 同步：${u.name} 已離職` })
        }
        if (row.dept && row.dept !== u.dept) {
          u.dept = row.dept
          updated++
        }
      }
      changed = disabled + updated
      message = `讀取 ${rows.length} 筆：停用 ${disabled}、更新部門 ${updated}`
    } else {
      const n = Array.isArray(data) ? data.length : Object.keys((data as object) ?? {}).length
      message = `連線成功，取得 ${n} 筆資料（未設定對應規則，僅測試連線）`
    }
    api.lastStatus = 'ok'
    api.lastMessage = message
    return { ok: true, message, changed }
  } catch (e) {
    api.lastStatus = 'error'
    api.lastMessage = e instanceof Error ? e.message : String(e)
    return { ok: false, message: api.lastMessage, changed: 0 }
  }
}

/** 執行排程：提醒 + 到期的外部 API 同步。force = 手動觸發（同步所有啟用中的 API） */
export async function runAutomation(db: Database, backend: Backend, now: Date, force = false) {
  const reminders = runReminders(db, now)
  const synced: string[] = []
  for (const api of db.integrations.externalApis) {
    if (!api.enabled) continue
    const due = force ? true : api.syncMinutes > 0 && (!api.lastSyncAt || now.getTime() - Date.parse(api.lastSyncAt) >= api.syncMinutes * 60000)
    if (!due) continue
    const r = await syncExternalApi(db, backend, api, now)
    synced.push(`${api.name}：${r.ok ? r.message : `失敗（${r.message}）`}`)
  }
  const changed = reminders > 0 || synced.length > 0
  const note = [reminders ? `新增 ${reminders} 則時限提醒` : '', ...synced].filter(Boolean).join('；') || '無需處理的項目'
  // 沒有任何變更時不寫入，避免觸發所有使用者的自動重新整理
  if (changed || force) {
    db.automation.unshift({ at: now.toISOString(), created: reminders, note })
    if (db.automation.length > 50) db.automation.length = 50
  }
  return { reminders, synced, note, changed: changed || force }
}
