// S11 帳號與權限（FR-07）：角色與範圍分開設定；敏感變更（角色、停用）二次確認；
// 離職即停用，歷史紀錄保留；稽核紀錄（僅 Admin／IT 資安可查閱）。

import { useState } from 'react'
import { api } from '../api/client.ts'
import { useMutation, useQuery } from '../api/live.ts'
import { ROLE_LABEL } from '../domain/rules.ts'
import { fmtDateTime, relTime } from '../domain/time.ts'
import type { AuditLog, Role, User } from '../domain/types.ts'
import { Async, Button, Checkbox, Dialog, EmptyState, FormError, SelectField, Tabs, TextField, useToast } from '../ui/kit.tsx'
import { useRoute, navigate } from '../ui/router.tsx'
import { useMe, useUsers } from '../ui/session.tsx'

const MATRIX: [string, string, string, string, string, string][] = [
  ['檢視客戶與聯絡人', '範圍內', '範圍內', '僅公司名', '僅公司名', '✗'],
  ['檢視聯絡人電話／Email', '範圍內', '範圍內', '✗', '✗', '✗'],
  ['新增／編輯客戶與互動', '範圍內', '✗', '✗', '✗', '✗'],
  ['封存客戶、變更負責業務', '業務主管', '✗', '✗', '✗', '✗'],
  ['建立與提交需求', '✓', '✓', '✓', '✓', '✗'],
  ['補件、撤回（待評估前）', '提出人', '✗', '✗', '✗', '✗'],
  ['評估、優先級、指派、承諾日期', '✗', '範圍內', '✗', '✗', '✗'],
  ['更新開發狀態、提交測試版本', '✗', '✗', '被指派', '✗', '✗'],
  ['記錄測試結果與缺陷', '✗', '✗', '✗', '範圍內', '✗'],
  ['UAT 通過／退回', '被指定', '✗', '✗', '✗', '✗'],
  ['結案、不採納、重新開啟', '✗', '範圍內', '✗', '✗', '✗'],
  ['留言', '範圍內', '範圍內', '被指派', '範圍內', '✗'],
  ['檢視管理報表', '業務主管', '範圍內', '✗', '✗', '✗'],
  ['帳號、角色、資料範圍設定', '✗', '✗', '✗', '✗', '依核准單'],
  ['查閱稽核紀錄', '✗', '✗', '✗', '✗', 'IT／資安'],
]

export function Accounts() {
  const { query } = useRoute()
  const tab = (query.view ?? 'users') as 'users' | 'matrix' | 'audit'
  return (
    <div className="page wide">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1>帳號與權限</h1>
          <div className="sub">功能權限（能做什麼）與資料範圍（能看哪些資料）分開控制；後端每次請求都會再檢查。</div>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={v => navigate('/admin/users', { view: v === 'users' ? undefined : v })}
        items={[
          { value: 'users', label: '帳號' },
          { value: 'matrix', label: '權限矩陣' },
          { value: 'audit', label: '稽核紀錄' },
        ]}
      />
      {tab === 'users' && <Users />}
      {tab === 'matrix' && <Matrix />}
      {tab === 'audit' && <Audit />}
    </div>
  )
}

function Users() {
  const me = useMe()
  const toast = useToast()
  const q = useQuery<User[]>('/api/users')
  const [edit, setEdit] = useState<Partial<User> | null>(null)
  const [confirm, setConfirm] = useState<User | null>(null)
  const [search, setSearch] = useState('')
  const toggle = useMutation((u: User) => api.patch(`/api/users/${u.id}`, { status: u.status === '啟用' ? '停用' : '啟用' }))
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" style={{ width: 280 }} placeholder="搜尋姓名、Email、部門" value={search} onChange={e => setSearch(e.target.value)} aria-label="搜尋帳號" />
        <span className="spacer" />
        <Button tone="primary" onClick={() => setEdit({ role: 'Business', status: '啟用' })} data-testid="new-user">
          + 開立帳號
        </Button>
      </div>
      <div className="card">
        <Async q={q}>
          {list => {
            const rows = list.filter(u => !search || `${u.name}${u.email}${u.dept}`.includes(search))
            return rows.length === 0 ? (
              <EmptyState title="找不到符合的帳號" />
            ) : (
              <table className="table" data-testid="user-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>Email</th>
                    <th>角色</th>
                    <th>部門</th>
                    <th>最後登入</th>
                    <th>狀態</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(u => (
                    <tr key={u.id} style={u.status === '停用' ? { background: '#fafafa' } : undefined}>
                      <td>
                        <b className={u.status === '停用' ? 'muted' : ''}>{u.name}</b>
                      </td>
                      <td className="mono">{u.email}</td>
                      <td>
                        <span className="chip gray">
                          {ROLE_LABEL[u.role]}
                          {u.manager ? '・主管' : ''}
                        </span>
                      </td>
                      <td>{u.dept}</td>
                      <td className="muted">{u.lastLogin ? relTime(u.lastLogin) : '—'}</td>
                      <td>{u.status === '啟用' ? <span className="chip" style={{ background: '#dcfae6', color: '#067647' }}>啟用</span> : <span className="chip" style={{ background: '#fee4e2', color: '#b42318' }}>停用</span>}</td>
                      <td className="nowrap">
                        <Button tone="ghost" size="sm" onClick={() => setEdit(u)}>
                          編輯
                        </Button>
                        {u.id !== me.id && (
                          <Button tone={u.status === '啟用' ? 'danger' : 'secondary'} size="sm" onClick={() => setConfirm(u)} data-testid={`toggle-${u.id}`}>
                            {u.status === '啟用' ? '停用' : '啟用'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }}
        </Async>
      </div>
      {edit && <UserDialog user={edit} onClose={() => setEdit(null)} />}
      {confirm && (
        <Dialog
          title={confirm.status === '啟用' ? `停用 ${confirm.name}？` : `重新啟用 ${confirm.name}？`}
          onClose={() => setConfirm(null)}
          testId="confirm-toggle"
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>取消</Button>
              <Button
                tone={confirm.status === '啟用' ? 'danger' : 'primary'}
                disabled={toggle.pending}
                onClick={async () => {
                  if (await toggle.run(confirm)) toast(confirm.status === '啟用' ? '已停用，既有登入立即失效' : '已重新啟用')
                  setConfirm(null)
                }}
                data-testid="dialog-confirm"
              >
                確認{confirm.status === '啟用' ? '停用' : '啟用'}
              </Button>
            </>
          }
        >
          {confirm.status === '啟用' ? (
            <div className="banner warn">
              <div>
                停用後新登入與既有登入皆無法取得資料；歷史紀錄保留原操作者姓名，不會刪除。
                <br />
                未結需求請 PM 於 2 個工作天內轉派；客戶由業務主管指定接手人（PRD 6.3）。
              </div>
            </div>
          ) : (
            <p>重新啟用後此帳號可再次登入。</p>
          )}
        </Dialog>
      )}
    </>
  )
}

function UserDialog({ user, onClose }: { user: Partial<User>; onClose: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: user.name ?? '', email: user.email ?? '', role: user.role ?? 'Business', dept: user.dept ?? '', manager: user.manager ?? false })
  const [confirmStep, setConfirmStep] = useState(false)
  const save = useMutation(() => (user.id ? api.patch(`/api/users/${user.id}`, form) : api.post('/api/users', form)))
  const roleChanged = !!user.id && user.role !== form.role
  const f = save.error?.fields ?? {}
  const doSave = async () => {
    // 角色變更屬敏感變更，需二次確認
    if (roleChanged && !confirmStep) return setConfirmStep(true)
    if (await save.run()) {
      toast(user.id ? '帳號已更新' : '帳號已開立')
      onClose()
    }
  }
  return (
    <Dialog title={user.id ? `編輯 ${user.name}` : '開立帳號'} onClose={onClose} testId="user-dialog"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" onClick={doSave} disabled={save.pending} data-testid="user-save">
            {confirmStep ? '確認變更角色' : '儲存'}
          </Button>
        </>
      }
    >
      <FormError error={save.error} />
      <div className="grid-2">
        <TextField label="姓名" required value={form.name} onChange={v => setForm({ ...form, name: v })} error={f.name} data-testid="u-name" />
        <TextField label="公司 Email" required value={form.email} onChange={v => setForm({ ...form, email: v })} error={f.email} data-testid="u-email" />
      </div>
      <div className="grid-2">
        <SelectField label="角色" required value={form.role} onChange={v => (setForm({ ...form, role: v as Role }), setConfirmStep(false))} options={(['Business', 'PM', 'Developer', 'QA', 'Admin'] as Role[]).map(r => ({ value: r, label: `${ROLE_LABEL[r]}（${r}）` }))} error={f.role} />
        <TextField label="部門" value={form.dept} onChange={v => setForm({ ...form, dept: v })} />
      </div>
      {form.role === 'Business' && (
        <Checkbox checked={form.manager} onChange={v => setForm({ ...form, manager: v })}>
          業務主管範圍（可看全部業務的客戶與報表、封存客戶）
        </Checkbox>
      )}
      {confirmStep && (
        <div className="banner warn" data-testid="role-confirm">
          角色由 {user.role} 變更為 {form.role}，會立即改變此人可見的資料範圍。請確認已有核准單。
        </div>
      )}
    </Dialog>
  )
}

function Matrix() {
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>操作</th>
              {['Business', 'PM', 'Developer', 'QA', 'Admin'].map(r => (
                <th key={r} style={{ textAlign: 'center' }}>
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map(([op, ...cells]) => (
              <tr key={op}>
                <td>{op}</td>
                {cells.map((c, i) => (
                  <td key={i} style={{ textAlign: 'center', color: c === '✗' ? '#98a2b3' : 'var(--text)' }}>
                    {c === '✗' ? <span aria-label="不可操作">✗</span> : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-body small muted">「✗」＝不可操作；後端必須拒絕，不能只靠前端隱藏按鈕。業務主管為 Business 角色加上主管範圍。此矩陣與 src/domain/rules.ts 的權限規則一致。</div>
    </div>
  )
}

function Audit() {
  const users = useUsers()
  const [search, setSearch] = useState('')
  const q = useQuery<AuditLog[]>('/api/audit', { q: search || undefined, limit: 300 })
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" style={{ width: 280 }} placeholder="搜尋動作、資源或內容" value={search} onChange={e => setSearch(e.target.value)} aria-label="搜尋稽核紀錄" />
        <span className="small muted">僅可新增、不可修改；不記錄密碼與權杖。</span>
      </div>
      <div className="card">
        <Async q={q} empty={d => (d.length === 0 ? <EmptyState title="無資料" /> : null)}>
          {rows => (
            <table className="table" data-testid="audit-table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>操作者</th>
                  <th>動作</th>
                  <th>資源</th>
                  <th>結果</th>
                  <th>內容</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id}>
                    <td className="nowrap muted">{fmtDateTime(a.at)}</td>
                    <td>{users.name(a.actorId)}</td>
                    <td className="mono">{a.action}</td>
                    <td className="mono">
                      {a.resourceType}/{a.resourceId}
                    </td>
                    <td>{a.result === 'ok' ? <span className="success-text">成功</span> : <b className="danger-text">拒絕</b>}</td>
                    <td className="small">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Async>
      </div>
    </>
  )
}
