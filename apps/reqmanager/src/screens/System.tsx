// S12 系統狀態：API 串接模式、自動更新設定、外部 API 同步與自動化排程、資料匯出／匯入，
// 以及全站共用的空白／無權限／讀取失敗／衝突等狀態畫面。

import { useRef, useState } from 'react'
import { ApiFailure, api, loadConfig, resetLocalDatabase, saveConfig, type ApiConfig } from '../api/client.ts'
import { live, useLiveStatus, useMutation, useQuery } from '../api/live.ts'
import { listRoutes } from '../domain/api.ts'
import { fmtDateTime, relTime, taipeiTime } from '../domain/time.ts'
import type { AutomationRun, IntegrationSettings } from '../domain/types.ts'
import { Async, Button, Checkbox, ConflictBanner, EmptyState, ErrorState, FormError, NoPermission, Tabs, TextField, useToast } from '../ui/kit.tsx'
import { navigate, useRoute } from '../ui/router.tsx'
import { useMe } from '../ui/session.tsx'

export function SystemStatus() {
  const me = useMe()
  const { query } = useRoute()
  const tab = (query.view ?? 'api') as 'api' | 'integrations' | 'data' | 'states'
  const items = [
    { value: 'api' as const, label: 'API 與自動更新' },
    { value: 'integrations' as const, label: '外部整合與排程' },
    ...(me.role === 'Admin' ? [{ value: 'data' as const, label: '資料管理' }] : []),
    { value: 'states' as const, label: '狀態畫面' },
  ]
  return (
    <div className="page wide">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1>系統狀態</h1>
          <div className="sub">API 串接、自動化更新與資料管理</div>
        </div>
      </div>
      <Tabs value={tab} onChange={v => navigate('/system', { view: v === 'api' ? undefined : v })} items={items} />
      {tab === 'api' && <ApiPanel />}
      {tab === 'integrations' && <Integrations />}
      {tab === 'data' && me.role === 'Admin' && <DataPanel />}
      {tab === 'states' && <States />}
    </div>
  )
}

function ApiPanel() {
  const toast = useToast()
  const status = useLiveStatus()
  const [cfg, setCfg] = useState<ApiConfig>(loadConfig)
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const meta = useQuery<{ mode: string; rev: number; updatedAt: string; counts: Record<string, number> }>('/api/meta')
  const current = loadConfig()

  const testConn = async () => {
    setTest(null)
    if (cfg.mode === 'local') return setTest({ ok: true, text: '瀏覽器內建 API 可用（資料存於此瀏覽器）' })
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/api/health`)
      const body = (await res.json()) as { ok: boolean; mode: string; rev: number }
      setTest({ ok: res.ok, text: res.ok ? `連線成功：${body.mode} 模式，資料版本 rev ${body.rev}` : `HTTP ${res.status}` })
    } catch {
      setTest({ ok: false, text: '無法連線。請確認伺服器已啟動（npm run server）且網址正確。' })
    }
  }
  const apply = () => {
    const modeChanged = cfg.mode !== current.mode || cfg.baseUrl !== current.baseUrl
    saveConfig(cfg)
    if (modeChanged) {
      // 換資料來源後需重新登入（不同後端的帳號與權杖不共用）
      window.location.hash = '#/login'
      window.location.reload()
      return
    }
    live.start()
    toast('已套用自動更新設定')
  }

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="card card-pad stack" data-testid="api-settings">
        <h2>API 串接</h2>
        <label className="checkbox">
          <input type="radio" name="mode" checked={cfg.mode === 'local'} onChange={() => setCfg({ ...cfg, mode: 'local' })} />
          <span>
            <b>瀏覽器內建 API</b>
            <span className="small muted" style={{ display: 'block' }}>
              與伺服器相同的 REST 合約與規則，資料存於此瀏覽器（localStorage），同一瀏覽器多分頁即時同步。適合展示與可用性測試。
            </span>
          </span>
        </label>
        <label className="checkbox">
          <input type="radio" name="mode" checked={cfg.mode === 'http'} onChange={() => setCfg({ ...cfg, mode: 'http' })} data-testid="mode-http" />
          <span>
            <b>遠端 REST API 伺服器</b>
            <span className="small muted" style={{ display: 'block' }}>
              連線到 Node API 伺服器（apps/reqmanager/server）或任何實作相同合約的後端，多人共用同一份資料。
            </span>
          </span>
        </label>
        {cfg.mode === 'http' && <TextField label="API 網址" value={cfg.baseUrl} onChange={v => setCfg({ ...cfg, baseUrl: v })} placeholder="http://localhost:8787（留空 = 與網頁同網域）" data-testid="api-base" />}
        <div className="field">
          <label htmlFor="poll">自動更新頻率</label>
          <select id="poll" className="select" value={cfg.pollSec} onChange={e => setCfg({ ...cfg, pollSec: Number(e.target.value) })} data-testid="poll-sec">
            {[5, 10, 30, 60, 0].map(s => (
              <option key={s} value={s}>
                {s ? `每 ${s} 秒檢查資料版本` : '關閉（僅手動重新整理）'}
              </option>
            ))}
          </select>
          <span className="hint">只比對資料版本號（rev），有變更才重新抓取畫面資料；視窗重新取得焦點時也會立即檢查。</span>
        </div>
        {test && <div className={`banner ${test.ok ? 'success' : 'danger'}`}>{test.text}</div>}
        <div className="row">
          <Button onClick={testConn}>測試連線</Button>
          <span className="spacer" />
          <Button tone="primary" onClick={apply} data-testid="apply-config">
            套用
          </Button>
        </div>
      </section>

      <div className="stack" style={{ gap: 16 }}>
        <section className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>目前狀態</h2>
          <dl className="kv" data-testid="live-status">
            <dt>資料來源</dt>
            <dd>{current.mode === 'local' ? '瀏覽器內建 API' : `遠端 API ${current.baseUrl || '（同網域）'}`}</dd>
            <dt>連線</dt>
            <dd className={status.state === 'error' ? 'danger-text' : 'success-text'}>{status.state === 'error' ? `中斷：${status.message}` : '正常'}</dd>
            <dt>資料版本</dt>
            <dd className="mono">rev {status.rev >= 0 ? status.rev : '—'}</dd>
            <dt>最後檢查</dt>
            <dd>{status.lastChecked ? taipeiTime(status.lastChecked) : '—'}</dd>
            <dt>最後變更</dt>
            <dd>{meta.data ? relTime(meta.data.updatedAt) : '—'}</dd>
            <dt>資料量</dt>
            <dd>{meta.data ? `需求 ${meta.data.counts.requirements}・客戶 ${meta.data.counts.clients}・帳號 ${meta.data.counts.users}・稽核 ${meta.data.counts.audit}` : '—'}</dd>
          </dl>
        </section>
        <section className="card card-pad">
          <h2 style={{ marginBottom: 8 }}>API 端點（{listRoutes().length}）</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            授權：<span className="mono">Authorization: Bearer &lt;token&gt;</span>；錯誤回應格式 <span className="mono">{'{ code, message, fields }'}</span>；409 = 版本衝突；422 = 欄位檢核失敗；403 = 無權限（不含任何資料）。
          </p>
          <div className="mono" style={{ maxHeight: 260, overflow: 'auto', fontSize: 12, lineHeight: 1.8 }}>
            {listRoutes().map(r => (
              <div key={r}>{r}</div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Integrations() {
  const me = useMe()
  const toast = useToast()
  const q = useQuery<IntegrationSettings>(me.role === 'Admin' || me.role === 'PM' ? '/api/integrations' : null)
  const runs = useQuery<{ automation: AutomationRun[] }>('/api/meta')
  const [draft, setDraft] = useState<IntegrationSettings | null>(null)
  const data = draft ?? q.data
  const save = useMutation((d: IntegrationSettings) => api.put('/api/integrations', d))
  const [syncing, setSyncing] = useState('')
  const run = useMutation(() => api.post<{ note: string }>('/api/automation/run', { force: true }))

  const sync = async (id: string) => {
    setSyncing(id)
    try {
      const r = await api.post<{ ok: boolean; message: string }>(`/api/integrations/${id}/sync`)
      toast(r.ok ? `同步完成：${r.message}` : `同步失敗：${r.message}`, r.ok ? 'ok' : 'error')
      live.bump()
    } catch (e) {
      toast(e instanceof ApiFailure ? e.message : '同步失敗', 'error')
    } finally {
      setSyncing('')
    }
  }
  const setApi = (i: number, patch: Partial<IntegrationSettings['externalApis'][number]>) =>
    data && setDraft({ ...data, externalApis: data.externalApis.map((a, j) => (j === i ? { ...a, ...patch } : a)) })

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <div className="card-head">
          <h2 style={{ flex: 1 }}>外部 API 同步</h2>
          {draft && <span className="small warning-text">有未儲存的變更</span>}
          <Button size="sm" disabled={!draft} onClick={() => setDraft(null)}>
            還原
          </Button>
          <Button
            size="sm"
            tone="primary"
            disabled={!draft || save.pending}
            onClick={async () => {
              if (draft && (await save.run(draft))) {
                setDraft(null)
                toast('整合設定已儲存')
              }
            }}
            data-testid="integrations-save"
          >
            儲存設定
          </Button>
        </div>
        <FormError error={save.error} />
        <Async q={q}>
          {() => (
            <div className="table-wrap">
              <table className="table" data-testid="external-apis">
                <thead>
                  <tr>
                    <th>名稱</th>
                    <th>Endpoint</th>
                    <th>自動同步</th>
                    <th>最後同步</th>
                    <th>結果</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data!.externalApis.map((a, i) => (
                    <tr key={a.id}>
                      <td>
                        <label className="checkbox">
                          <input type="checkbox" checked={a.enabled} onChange={e => setApi(i, { enabled: e.target.checked })} aria-label={`啟用 ${a.name}`} />
                          <input className="input" style={{ height: 32, width: 150 }} value={a.name} onChange={e => setApi(i, { name: e.target.value })} aria-label="名稱" />
                        </label>
                      </td>
                      <td>
                        <input className="input mono" style={{ height: 32, minWidth: 220 }} value={a.endpoint} onChange={e => setApi(i, { endpoint: e.target.value })} aria-label="Endpoint" />
                      </td>
                      <td>
                        <select className="select" style={{ height: 32, width: 130 }} value={a.syncMinutes} onChange={e => setApi(i, { syncMinutes: Number(e.target.value) })} aria-label="同步頻率">
                          {[0, 1, 5, 15, 30, 60, 1440].map(m => (
                            <option key={m} value={m}>
                              {m === 0 ? '僅手動' : m === 1440 ? '每天' : `每 ${m} 分鐘`}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="muted nowrap">{a.lastSyncAt ? relTime(a.lastSyncAt) : '尚未同步'}</td>
                      <td className="small">
                        {a.lastStatus === 'ok' && <span className="success-text">✓ {a.lastMessage}</span>}
                        {a.lastStatus === 'error' && <span className="danger-text">✗ {a.lastMessage}</span>}
                        {a.lastStatus === 'untested' && <span className="muted">未測試</span>}
                      </td>
                      <td className="nowrap">
                        <Button size="sm" disabled={!!syncing || !!draft} onClick={() => sync(a.id)} data-testid={`sync-${a.id}`} title={draft ? '請先儲存設定' : undefined}>
                          {syncing === a.id ? '同步中…' : '立即同步'}
                        </Button>
                        <Button tone="ghost" size="sm" style={{ color: 'var(--danger)' }} onClick={() => data && setDraft({ ...data, externalApis: data.externalApis.filter((_, j) => j !== i) })} aria-label={`移除 ${a.name}`}>
                          ✕
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="card-body row">
                <Button
                  size="sm"
                  tone="ghost"
                  onClick={() => data && setDraft({ ...data, externalApis: [...data.externalApis, { id: `API${Date.now().toString(36)}`, name: '新的 API', endpoint: 'https://', method: 'GET', enabled: false, syncMinutes: 0, lastSyncAt: '', lastStatus: 'untested', lastMessage: '' }] })}
                >
                  + 新增 API
                </Button>
                <span className="small muted">
                  名稱或網址含 ERP／customer 會套用「客戶主檔」對應（依統編去重、不自動覆蓋名稱相似者）；含 HR／employee 會套用「在職名單」對應（離職即停用帳號）。
                </span>
              </div>
            </div>
          )}
        </Async>
      </section>

      {data && (
        <section className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>通知管道</h2>
          <div className="grid-2">
            <Checkbox checked={data.email.enabled} onChange={v => setDraft({ ...data, email: { ...data.email, enabled: v } })}>
              站內通知 + 公司 Email（{data.email.smtpHost}:{data.email.smtpPort}）
            </Checkbox>
            <Checkbox checked={data.line.enabled} onChange={v => setDraft({ ...data, line: { ...data.line, enabled: v } })}>
              LINE／Teams／Slack（列為後續，D-07 待 IT 確認）
            </Checkbox>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            同一需求同一事件 10 分鐘內不重複通知；通知失敗不影響需求建立（AC-02C）。
          </p>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2 style={{ flex: 1 }}>自動化排程紀錄</h2>
          <span className="small muted">時限提醒（PRD 7.3）+ 到期的外部 API 同步；伺服器每分鐘、瀏覽器內建 API 每 60 秒執行</span>
          <Button size="sm" disabled={run.pending} onClick={async () => { const r = await run.run(); if (r) toast(r.note) }} data-testid="run-automation">
            立即執行
          </Button>
        </div>
        <Async q={runs} empty={d => (d.automation.length === 0 ? <EmptyState title="尚無執行紀錄" desc="沒有需要處理的項目時不會留下紀錄。" /> : null)}>
          {d => (
            <table className="table" data-testid="automation-log">
              <tbody>
                {d.automation.map((r, i) => (
                  <tr key={i}>
                    <td className="nowrap muted" style={{ width: 140 }}>
                      {fmtDateTime(r.at)}
                    </td>
                    <td>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Async>
      </section>
    </div>
  )
}

function DataPanel() {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<ApiFailure | null>(null)
  const reset = useMutation(() => api.post('/api/admin/reset'))

  const exportJson = async () => {
    const db = await api.get<unknown>('/api/admin/export')
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reqmanager-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (f: File) => {
    setErr(null)
    try {
      const data = JSON.parse(await f.text()) as unknown
      await api.post('/api/admin/import', data)
      live.bump()
      toast('已匯入資料')
    } catch (e) {
      setErr(e instanceof ApiFailure ? e : new ApiFailure(422, { message: '不是有效的 JSON 檔案' }))
    }
  }
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="card card-pad stack">
        <h2>匯出／匯入</h2>
        <p className="muted" style={{ margin: 0 }}>
          匯出完整資料（JSON）可用 Excel／程式手動編輯後再匯入。匯入會取代目前資料並寫入稽核紀錄。
        </p>
        <FormError error={err} />
        <div className="row">
          <Button onClick={exportJson} data-testid="export">
            匯出 JSON
          </Button>
          <Button onClick={() => file.current?.click()}>匯入 JSON…</Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={e => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
      </section>
      <section className="card card-pad stack">
        <h2>重置示範資料</h2>
        <p className="muted" style={{ margin: 0 }}>
          重新產生相對於今天日期的示範資料（逾期、即將到期等狀態會重新計算）。
        </p>
        <div className="row">
          <Button
            tone="danger"
            onClick={async () => {
              if (!window.confirm('確定重置為示範資料？目前資料會被取代。')) return
              if (await reset.run()) toast('已重置示範資料')
            }}
            data-testid="reset"
          >
            重置示範資料
          </Button>
          {loadConfig().mode === 'local' && (
            <Button
              tone="ghost"
              onClick={() => {
                if (!window.confirm('清除此瀏覽器的本機資料並重新登入？')) return
                resetLocalDatabase()
                window.location.hash = '#/login'
                window.location.reload()
              }}
            >
              清除本機資料
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

/** 全站共用的狀態畫面一覽（S05 註 5、S07 註 5 引用） */
function States() {
  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-head">
          <h3>無資料（清單篩選無結果）</h3>
        </div>
        <EmptyState title="找不到符合條件的需求" desc="試著調整或清除篩選條件。" action={<Button>清除篩選</Button>} />
      </section>
      <section className="card">
        <div className="card-head">
          <h3>無權限（修改網址 ID／越權）</h3>
        </div>
        <NoPermission />
      </section>
      <section className="card">
        <div className="card-head">
          <h3>讀取失敗（網路或伺服器錯誤）</h3>
        </div>
        <ErrorState error={new ApiFailure(0, { message: '無法連線到 API 伺服器，請稍後再試。' })} onRetry={() => {}} />
      </section>
      <section className="card card-pad stack">
        <h3>同時修改衝突</h3>
        <ConflictBanner onReload={() => {}} />
        <h3>表單檢核失敗</h3>
        <FormError error={new ApiFailure(422, { message: '請完成必填欄位後再提交', fields: { title: 'x', problem: 'x' } })} />
        <h3>工作階段</h3>
        <div className="banner neutral">因閒置 30 分鐘已自動登出</div>
        <div className="banner danger">此帳號已停用，無法登入</div>
      </section>
    </div>
  )
}
