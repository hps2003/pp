// S03 客戶列表／S04 客戶詳細（FR-01）：搜尋公司名或統編、敏感欄位遮罩、封存提示、
// 統編重複不允許建立、名稱相似可確認後建立（AC-01B）、封存後不能新增互動（AC-01E）。

import { useState } from 'react'
import { ApiFailure, api } from '../api/client.ts'
import { live, useMutation, useQuery } from '../api/live.ts'
import { fmtDate, relTime } from '../domain/time.ts'
import type { Client, Contact, Interaction } from '../domain/types.ts'
import {
  Async, Button, ConflictBanner, Dialog, DueText, EmptyState, ErrorState, FormError, Icon, Loading, SelectField, StatusChip, Tabs, TextArea,
  TextField, useToast,
} from '../ui/kit.tsx'
import { Link, navigate, useRoute } from '../ui/router.tsx'
import { useMe, useUsers } from '../ui/session.tsx'
import type { DueState } from '../domain/metrics.ts'
import type { ReqStatus } from '../domain/types.ts'

interface ClientRow {
  id: string
  name: string
  taxId: string
  ownerId: string
  ownerName: string
  status: '啟用' | '封存'
  industry: string
  contactCount: number
  openReqs: number
  totalReqs: number
  lastInteraction: string
  updatedAt: string
}

type ClientDetail = Client & {
  ownerName: string
  canEdit: boolean
  canArchive: boolean
  requirements: { id: string; no: string; title: string; status: ReqStatus; due: DueState; updatedAt: string }[]
  hiddenRequirements: number
}

export function ClientList() {
  const me = useMe()
  const { query } = useRoute()
  const [search, setSearch] = useState(query.q ?? '')
  const q = useQuery<ClientRow[]>('/api/clients', { q: query.q, status: query.status })
  const [creating, setCreating] = useState(false)
  const set = (patch: Record<string, string | undefined>) => navigate('/clients', { ...query, ...patch }, true)
  return (
    <div className="page wide">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1>客戶</h1>
          <div className="sub">{me.role === 'Business' ? (me.manager ? '業務主管：可查看全部客戶、封存與變更負責業務' : '你負責的客戶') : '授權範圍內的客戶'}</div>
        </div>
        {me.role === 'Business' && (
          <Button tone="primary" onClick={() => setCreating(true)} data-testid="new-client">
            <Icon name="plus" size={16} /> 新增客戶
          </Button>
        )}
      </div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <form onSubmit={e => (e.preventDefault(), set({ q: search.trim() || undefined }))} style={{ width: 320 }} role="search">
          <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋公司名稱或統一編號" aria-label="搜尋公司名稱或統一編號" data-testid="client-search" />
        </form>
        <select className="select" style={{ width: 140 }} value={query.status ?? ''} onChange={e => set({ status: e.target.value || undefined })} aria-label="狀態">
          <option value="">狀態：全部</option>
          <option value="啟用">啟用</option>
          <option value="封存">封存</option>
        </select>
        {(query.q || query.status) && (
          <Button tone="ghost" size="sm" onClick={() => (setSearch(''), navigate('/clients', {}, true))}>
            清除篩選
          </Button>
        )}
      </div>
      <div className="card">
        <Async q={q} empty={d => (d.length === 0 ? <EmptyState title={query.q || query.status ? '找不到符合條件的客戶' : '還沒有客戶'} action={me.role === 'Business' ? <Button onClick={() => setCreating(true)}>新增客戶</Button> : undefined} /> : null)}>
          {d => (
            <div className="table-wrap">
              <table className="table" data-testid="client-table">
                <thead>
                  <tr>
                    <th>公司名稱</th>
                    <th>統一編號</th>
                    <th>產業</th>
                    <th>負責業務</th>
                    <th className="num">處理中需求</th>
                    <th>最近互動</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {d.map(c => (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`/clients/${c.id}`)}>
                      <td>
                        <Link to={`/clients/${c.id}`}>{c.name}</Link>
                      </td>
                      <td className="mono">{c.taxId || '—'}</td>
                      <td>{c.industry || '—'}</td>
                      <td>{c.ownerName}</td>
                      <td className="num">
                        {c.openReqs} <span className="muted small">/ {c.totalReqs}</span>
                      </td>
                      <td className="muted">{c.lastInteraction ? fmtDate(c.lastInteraction) : '—'}</td>
                      <td>{c.status === '封存' ? <span className="chip gray">封存</span> : <span className="chip" style={{ background: '#dcfae6', color: '#067647' }}>啟用</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
      {creating && <ClientDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

function ClientDialog({ client, onClose }: { client?: ClientDetail; onClose: () => void }) {
  const me = useMe()
  const users = useUsers()
  const toast = useToast()
  const [form, setForm] = useState({ name: client?.name ?? '', taxId: client?.taxId ?? '', industry: client?.industry ?? '', ownerId: client?.ownerId ?? me.id })
  const [similar, setSimilar] = useState<string[]>([])
  const [err, setErr] = useState<ApiFailure | null>(null)
  const [pending, setPending] = useState(false)
  const submit = async (confirmSimilar = false) => {
    setPending(true)
    setErr(null)
    try {
      const r = client
        ? await api.patch<ClientDetail>(`/api/clients/${client.id}`, { ...form, version: client.version })
        : await api.post<ClientDetail>('/api/clients', { ...form, confirmSimilar })
      live.bump()
      toast(client ? '已更新客戶資料' : '已建立客戶')
      onClose()
      if (!client) navigate(`/clients/${r.id}`)
    } catch (e) {
      if (!(e instanceof ApiFailure)) throw e
      if (e.code === 'SIMILAR') setSimilar((e.extra.similar as string[]) ?? [])
      else setErr(e)
    } finally {
      setPending(false)
    }
  }
  const f = err?.fields ?? {}
  return (
    <Dialog title={client ? '編輯客戶' : '新增客戶'} onClose={onClose} testId="client-dialog"
      footer={
        similar.length > 0 ? (
          <>
            <Button onClick={() => setSimilar([])}>返回修改</Button>
            <Button tone="primary" onClick={() => submit(true)} disabled={pending} data-testid="confirm-similar">
              確認不是同一家，仍要建立
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>取消</Button>
            <Button tone="primary" onClick={() => submit(false)} disabled={pending} data-testid="client-save">
              儲存
            </Button>
          </>
        )
      }
    >
      {err?.code === 'CONFLICT' ? <ConflictBanner /> : <FormError error={err} />}
      {similar.length > 0 && (
        <div className="banner warn" data-testid="similar-warning">
          <div>
            <b>可能與既有客戶重複</b>
            <div className="small">名稱相似：{similar.join('、')}。系統不會自動合併；若確認是不同公司，可繼續建立。</div>
          </div>
        </div>
      )}
      <TextField label="公司名稱" required value={form.name} onChange={v => (setForm({ ...form, name: v }), setSimilar([]))} error={f.name} maxLength={100} data-testid="c-name" />
      <div className="grid-2">
        <TextField label="統一編號" value={form.taxId} onChange={v => setForm({ ...form, taxId: v.replace(/\D/g, '').slice(0, 8) })} error={f.taxId} hint="8 碼數字；全系統唯一，作為去重依據" inputMode="numeric" data-testid="c-taxid" />
        <TextField label="產業別" value={form.industry} onChange={v => setForm({ ...form, industry: v })} />
      </div>
      <SelectField label="負責業務" required value={form.ownerId} onChange={v => setForm({ ...form, ownerId: v })} disabled={!me.manager} error={f.ownerId} hint={me.manager ? '變更後新負責人立即取得存取權（AC-01D）' : '只有業務主管可指定其他負責業務'} options={users.list.filter(u => u.role === 'Business' && u.status === '啟用').map(u => ({ value: u.id, label: u.name }))} />
    </Dialog>
  )
}

export function ClientDetailScreen({ id }: { id: string }) {
  const q = useQuery<ClientDetail>(`/api/clients/${id}`)
  const [tab, setTab] = useState<'info' | 'interactions' | 'reqs'>('info')
  const [editing, setEditing] = useState(false)
  const [contact, setContact] = useState<Partial<Contact> | null>(null)
  const [logging, setLogging] = useState(false)
  const toast = useToast()
  const archive = useMutation((archived: boolean) => api.post(`/api/clients/${id}/archive`, { archived }))
  const removeContact = useMutation((cid: string) => api.del(`/api/clients/${id}/contacts/${cid}`))
  const users = useUsers()

  if (q.error && !q.data)
    return (
      <div className="page">
        <div className="breadcrumb">
          <Link to="/clients">客戶</Link> / {id}
        </div>
        <div className="card">
          <ErrorState error={q.error} onRetry={q.refetch} />
        </div>
      </div>
    )
  if (!q.data) return <div className="page"><div className="card"><Loading rows={6} /></div></div>
  const c = q.data
  const archived = c.status === '封存'
  return (
    <div className="page wide" data-testid="client-detail">
      <div className="breadcrumb">
        <Link to="/clients">客戶</Link> / {c.name}
      </div>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div className="row wrap" style={{ flex: 1 }}>
          <h1>{c.name}</h1>
          {archived ? <span className="chip gray">封存</span> : <span className="chip" style={{ background: '#dcfae6', color: '#067647' }}>啟用</span>}
        </div>
        {c.canEdit && (
          <Button onClick={() => setEditing(true)} data-testid="edit-client">
            編輯
          </Button>
        )}
        {c.canArchive && (
          <Button
            tone={archived ? 'secondary' : 'danger'}
            onClick={async () => {
              if (!window.confirm(archived ? '確定解除封存？' : '封存後禁止新增互動與關聯新需求，但保留歷史查詢。確定封存？')) return
              if (await archive.run(!archived)) toast(archived ? '已解除封存' : '已封存')
            }}
            data-testid="archive-client"
          >
            {archived ? '解除封存' : '封存'}
          </Button>
        )}
      </div>
      {archived && (
        <div className="banner warn" style={{ marginBottom: 16 }} data-testid="archived-banner">
          此客戶已封存：不能新增互動或關聯新需求；既有需求照常進行，歷史資料仍可查詢。{c.canArchive ? '業務主管可解除封存。' : ''}
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'info', label: '基本資料與聯絡人' },
          { value: 'interactions', label: `互動紀錄 (${c.interactions.length})` },
          { value: 'reqs', label: `關聯需求 (${c.requirements.length})` },
        ]}
      />
      {tab === 'info' && (
        <div className="grid-2">
          <section className="card card-pad">
            <h2 style={{ marginBottom: 16 }}>公司資料</h2>
            <dl className="kv">
              <dt>公司名稱</dt>
              <dd>{c.name}</dd>
              <dt>統一編號</dt>
              <dd className="mono">{c.taxId || '—'}</dd>
              <dt>產業別</dt>
              <dd>{c.industry || '—'}</dd>
              <dt>負責業務</dt>
              <dd>{c.ownerName}</dd>
              <dt>建立日期</dt>
              <dd>{fmtDate(c.createdAt.slice(0, 10))}</dd>
              <dt>最後更新</dt>
              <dd>{relTime(c.updatedAt)}</dd>
            </dl>
          </section>
          <section className="card card-pad" data-testid="contacts">
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 style={{ flex: 1 }}>聯絡人</h2>
              {c.canEdit && (
                <Button size="sm" onClick={() => setContact({})} data-testid="add-contact">
                  + 新增聯絡人
                </Button>
              )}
            </div>
            {c.contacts.length === 0 && <p className="muted">尚無聯絡人</p>}
            <div className="stack" style={{ gap: 10 }}>
              {c.contacts.map(ct => (
                <div key={ct.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                  <div className="row">
                    <b>{ct.name}</b>
                    <span className="small muted">{ct.title}</span>
                    <span className="spacer" />
                    {c.canEdit && (
                      <>
                        <Button tone="ghost" size="sm" onClick={() => setContact(ct)}>
                          編輯
                        </Button>
                        <Button tone="ghost" size="sm" style={{ color: 'var(--danger)' }} onClick={async () => window.confirm(`刪除聯絡人 ${ct.name}？`) && (await removeContact.run(ct.id))}>
                          刪除
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="small">{ct.email || '—'}</div>
                  <div className="small">📞 {ct.phone || '—'}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {tab === 'interactions' && (
        <section className="card card-pad" data-testid="interactions">
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ flex: 1 }}>互動紀錄（新到舊）</h2>
            {c.canEdit && (
              <Button tone="primary" size="sm" onClick={() => setLogging(true)} disabled={archived} title={archived ? '客戶已封存' : undefined} data-testid="add-interaction">
                + 記錄互動
              </Button>
            )}
          </div>
          {c.interactions.length === 0 && <EmptyState title="尚無互動紀錄" desc="記錄每次拜訪、電話與往來，交接時新負責人能看到完整脈絡（US-01）。" />}
          <ul className="timeline">
            {c.interactions.map((n: Interaction) => (
              <li key={n.id}>
                <span className="tl-dot" />
                <div className="row wrap">
                  <b>{fmtDate(n.date)}</b>
                  <span className="chip gray">{n.channel}</span>
                  {n.source !== 'manual' && <span className="chip blue">{n.source === 'api' ? 'API 同步' : `${n.source.toUpperCase()} 同步`}</span>}
                  <span className="small muted">{users.name(n.actorId)}</span>
                </div>
                <div style={{ marginTop: 4 }}>{n.summary}</div>
                {n.next && <div className="small" style={{ color: 'var(--primary)' }}>下一步：{n.next}</div>}
                {n.rawRef && <div className="small muted mono">來源：{n.rawRef}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {tab === 'reqs' && (
        <section className="card">
          {c.requirements.length === 0 ? (
            <EmptyState title="尚無關聯需求" action={!archived && c.canEdit ? <Link to="/requirements/new">提交需求</Link> : undefined} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>編號</th>
                  <th>標題</th>
                  <th>狀態</th>
                  <th>承諾日期</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {c.requirements.map(r => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/requirements/${r.id}`)}>
                    <td>
                      <Link to={`/requirements/${r.id}`}>{r.no}</Link>
                    </td>
                    <td>{r.title}</td>
                    <td>
                      <StatusChip status={r.status} />
                    </td>
                    <td>
                      <DueText due={r.due} />
                    </td>
                    <td className="muted">{relTime(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {c.hiddenRequirements > 0 && <div className="card-body small muted">另有 {c.hiddenRequirements} 筆需求不在你的授權範圍內。</div>}
        </section>
      )}
      {editing && <ClientDialog client={c} onClose={() => setEditing(false)} />}
      {contact && <ContactDialog clientId={c.id} contact={contact} onClose={() => setContact(null)} />}
      {logging && <InteractionDialog clientId={c.id} onClose={() => setLogging(false)} />}
    </div>
  )
}

function ContactDialog({ clientId, contact, onClose }: { clientId: string; contact: Partial<Contact>; onClose: () => void }) {
  const [form, setForm] = useState({ id: contact.id ?? '', name: contact.name ?? '', title: contact.title ?? '', email: contact.email ?? '', phone: contact.phone ?? '' })
  const save = useMutation(() => api.post(`/api/clients/${clientId}/contacts`, form))
  const f = save.error?.fields ?? {}
  return (
    <Dialog title={contact.id ? '編輯聯絡人' : '新增聯絡人'} onClose={onClose} testId="contact-dialog"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={save.pending} onClick={async () => (await save.run()) && onClose()} data-testid="contact-save">
            儲存
          </Button>
        </>
      }
    >
      <FormError error={save.error} />
      <div className="grid-2">
        <TextField label="姓名" required value={form.name} onChange={v => setForm({ ...form, name: v })} error={f.name} data-testid="ct-name" />
        <TextField label="職稱" value={form.title} onChange={v => setForm({ ...form, title: v })} />
      </div>
      <div className="grid-2">
        <TextField label="Email" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} error={f.email} />
        <TextField label="電話" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="0912-345-678" />
      </div>
      <div className="hint">電話與 Email 屬敏感欄位，工程與 QA 帳號看不到（PRD FR-07）。</div>
    </Dialog>
  )
}

function InteractionDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), channel: '面談', summary: '', next: '' })
  const save = useMutation(() => api.post(`/api/clients/${clientId}/interactions`, form))
  const err: ApiFailure | null = save.error
  return (
    <Dialog title="記錄互動" onClose={onClose} testId="interaction-dialog"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={save.pending || !form.summary.trim()} onClick={async () => (await save.run()) && onClose()} data-testid="interaction-save">
            儲存
          </Button>
        </>
      }
    >
      <FormError error={err} />
      <div className="grid-2">
        <TextField label="日期" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} />
        <SelectField label="管道" value={form.channel} onChange={v => setForm({ ...form, channel: v })} options={['面談', '電話', 'Email', 'LINE'].map(v => ({ value: v, label: v }))} />
      </div>
      <TextArea label="摘要" required value={form.summary} onChange={v => setForm({ ...form, summary: v })} counter={1000} rows={4} error={err?.fields.summary} data-testid="i-summary" />
      <TextField label="下一步（選填）" value={form.next} onChange={v => setForm({ ...form, next: v })} />
    </Dialog>
  )
}
