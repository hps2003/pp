// S06 提交需求：分段表單、就地錯誤提示、草稿自動儲存；提交後產生 REQ-YYYYMM-NNNN。
// 同一次提交因網路重試送出多次 → 只建立一筆（Idempotency-Key，AC-02B）。
// 也用於「編輯草稿」與「補充資訊」（待補件時提出人修改內容並重新送出）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFailure, api } from '../api/client.ts'
import { live, useQuery } from '../api/live.ts'
import { validateRequirement, type FieldErrors } from '../domain/rules.ts'
import { addDays, taipeiDate, taipeiTime } from '../domain/time.ts'
import type { Database, Requirement, User } from '../domain/types.ts'
import { Button, ConflictBanner, ErrorState, Field, FormError, Loading, SelectField, TextArea, TextField, useToast } from '../ui/kit.tsx'
import { Link, navigate } from '../ui/router.tsx'
import { useMe, useUsers } from '../ui/session.tsx'

type Detail = Requirement & { clientNames: string[]; canEdit: boolean }

interface Form {
  title: string
  type: string
  pmId: string
  expectedDate: string
  problem: string
  expected: string
  impactScope: string
  impactNote: string
  urgency: string
  urgencyNote: string
  clientIds: string[]
}

const EMPTY: Form = { title: '', type: '', pmId: '', expectedDate: '', problem: '', expected: '', impactScope: '', impactNote: '', urgency: '', urgencyNote: '', clientIds: [] }

const SECTIONS = [
  { title: '基本資訊', fields: ['title', 'type', 'pmId', 'expectedDate'] },
  { title: '需求描述', fields: ['problem', 'expected'] },
  { title: '影響與客戶', fields: ['impactScope', 'impactNote', 'urgency', 'urgencyNote', 'clientIds'] },
  { title: '確認提交', fields: [] },
]

function fromReq(r: Requirement): Form {
  return {
    title: r.title, type: r.type, pmId: r.pmId, expectedDate: r.expectedDate, problem: r.problem, expected: r.expected,
    impactScope: r.impactScope, impactNote: r.impactNote, urgency: r.urgency, urgencyNote: r.urgencyNote, clientIds: r.clientIds,
  }
}

export function ReqForm({ id }: { id?: string }) {
  const existing = useQuery<Detail>(id ? `/api/requirements/${id}` : null)
  if (!id) return <FormBody />
  if (existing.error) return <div className="page"><div className="card"><ErrorState error={existing.error} onRetry={existing.refetch} /></div></div>
  if (!existing.data) return <div className="page"><div className="card"><Loading /></div></div>
  if (!existing.data.canEdit)
    return (
      <div className="page">
        <div className="card">
          <ErrorState error={new ApiFailure(403, { message: '目前狀態不能編輯內容' })} />
        </div>
      </div>
    )
  return <FormBody initial={existing.data} />
}

function FormBody({ initial }: { initial?: Detail }) {
  const me = useMe()
  const users = useUsers()
  const toast = useToast()
  const clients = useQuery<{ id: string; name: string }[]>('/api/clients/options')
  const [form, setForm] = useState<Form>(() => (initial ? fromReq(initial) : EMPTY))
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<ApiFailure | null>(null)
  const [draft, setDraft] = useState<{ id: string; version: number } | null>(initial ? { id: initial.id, version: initial.version } : null)
  const [savedAt, setSavedAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<Detail | null>(null)
  const [resubmitNote, setResubmitNote] = useState('')
  const dirty = useRef(false)
  const inflight = useRef<Promise<unknown> | null>(null)
  const idemKey = useRef(`sub-${me.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const isResubmit = initial?.status === 'NEED_INFO'
  const today = taipeiDate(new Date())

  // 受理 PM 依專案預設帶入，可改選（D-08 預設：依專案預設 PM）
  useEffect(() => {
    if (!form.pmId && users.list.length) {
      const pm = users.list.find(u => u.role === 'PM' && u.status === '啟用')
      if (pm) setForm(f => ({ ...f, pmId: pm.id }))
    }
  }, [users.list, form.pmId])

  const update = <K extends keyof Form>(k: K, v: Form[K]) => {
    dirty.current = true
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: undefined }))
  }

  // 與後端相同的檢核規則，先在前端就地提示
  const pseudoDb = useMemo(
    () => ({
      users: users.list as unknown as User[],
      clients: (clients.data ?? []).map(c => ({ ...c, status: '啟用', ownerId: me.id, taxId: '', contacts: [], interactions: [] })),
    }) as unknown as Database,
    [users.list, clients.data, me.id],
  )
  const validate = useCallback(() => validateRequirement(pseudoDb, { ...(me as unknown as User), manager: true }, form, new Date()), [pseudoDb, me, form])

  // 草稿自動儲存（僅新需求與草稿；補件中的需求需按送出才會更新）
  const save = useCallback(async (): Promise<{ id: string; version: number } | null> => {
    if (isResubmit) return draft
    if (!form.title.trim() && !form.problem.trim()) return draft
    setSaving(true)
    try {
      const p = draft
        ? api.patch<Detail>(`/api/requirements/${draft.id}`, { ...form, version: draft.version })
        : api.post<Detail>('/api/requirements', form)
      inflight.current = p
      const r = await p
      const next = { id: r.id, version: r.version }
      setDraft(next)
      setSavedAt(new Date().toISOString())
      dirty.current = false
      return next
    } catch (e) {
      if (e instanceof ApiFailure && e.code === 'CONFLICT') setFormError(e)
      return draft
    } finally {
      inflight.current = null
      setSaving(false)
    }
  }, [draft, form, isResubmit])

  useEffect(() => {
    if (!dirty.current || isResubmit) return
    const t = setTimeout(() => void save(), 1500)
    return () => clearTimeout(t)
  }, [form, save, isResubmit])

  const goto = (n: number) => {
    if (n > step) {
      const e = validate()
      const own = Object.fromEntries(Object.entries(e).filter(([k]) => SECTIONS[step].fields.includes(k)))
      if (Object.keys(own).length) {
        setErrors(own)
        return
      }
    }
    setErrors({})
    setStep(n)
  }

  const showServerErrors = (err: ApiFailure) => {
    setFormError(err)
    if (Object.keys(err.fields).length) {
      setErrors(err.fields)
      const first = SECTIONS.findIndex(s => s.fields.some(f => err.fields[f]))
      if (first >= 0) setStep(first)
    }
  }

  const submit = async () => {
    setFormError(null)
    const e = validate()
    if (isResubmit && !resubmitNote.trim()) e.resubmitNote = '請說明本次補充的內容'
    if (Object.keys(e).length) {
      // 缺必填欄位 → 不建立需求，就地標示缺漏欄位，已輸入內容保留（AC-02A）
      setErrors(e)
      const first = SECTIONS.findIndex(s => s.fields.some(f => e[f]))
      setStep(first >= 0 ? first : 3)
      setFormError(new ApiFailure(422, { message: '請完成必填欄位後再提交', fields: e }))
      return
    }
    setSubmitting(true)
    try {
      // 等待進行中的自動儲存，避免同時建立兩筆
      if (inflight.current) {
        await inflight.current.catch(() => undefined)
        setSubmitting(false)
        return void setTimeout(() => void submitRef.current(), 0)
      }
      let result: Detail
      if (isResubmit && initial) {
        const saved = await api.patch<Detail>(`/api/requirements/${initial.id}`, { ...form, version: initial.version })
        result = await api.post<Detail>(`/api/requirements/${initial.id}/actions/resubmit`, { reason: resubmitNote.trim(), version: saved.version })
        toast('已補件，受理 PM 會收到通知')
        live.bump()
        navigate(`/requirements/${initial.id}`)
        return
      }
      if (draft) {
        const d = await save()
        result = await api.post<Detail>(`/api/requirements/${d!.id}/actions/submit`, { version: d!.version })
      } else {
        result = await api.post<Detail>('/api/requirements', { ...form, submit: true }, { 'idempotency-key': idemKey.current })
      }
      live.bump()
      setDone(result)
    } catch (err) {
      if (err instanceof ApiFailure) showServerErrors(err)
    } finally {
      setSubmitting(false)
    }
  }

  const submitRef = useRef(submit)
  submitRef.current = submit

  const discard = async () => {
    if (draft && !isResubmit) {
      if (!window.confirm('確定刪除這份草稿？此動作無法復原。')) return
      await api.del(`/api/requirements/${draft.id}`).catch(() => undefined)
      live.bump()
    }
    navigate('/requirements', { tab: 'mine' })
  }

  if (done) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }} data-testid="submit-success">
          <div className="state-icon" style={{ margin: '0 auto 12px', width: 56, height: 56, borderRadius: '50%', background: 'var(--success-weak)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
            ✓
          </div>
          <h1>已提交需求</h1>
          <p className="muted">
            需求編號 <b className="mono" style={{ color: 'var(--text)', fontSize: 16 }} data-testid="req-no">{done.no}</b>
            <br />
            狀態為「待評估」，受理 PM {users.name(done.pmId)} 已收到通知。之後可隨時在需求列表查詢進度。
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            <Link to={`/requirements/${done.id}`} className="btn btn-primary">
              查看需求
            </Link>
            <Link to="/" className="btn btn-secondary">
              回到工作台
            </Link>
            <Button
              tone="ghost"
              onClick={() => {
                idemKey.current = `sub-${me.id}-${Date.now()}`
                setForm(EMPTY)
                setDraft(null)
                setDone(null)
                setStep(0)
              }}
            >
              再提交一筆
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const err = (k: string) => errors[k]
  const pmOptions = users.list.filter(u => u.role === 'PM' && u.status === '啟用').map(u => ({ value: u.id, label: u.name }))
  const clientOpts = clients.data ?? []

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="breadcrumb">
        <Link to="/requirements">需求</Link> / {isResubmit ? `${initial!.no} 補充資訊` : draft ? '編輯草稿' : '提交需求'}
      </div>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1>{isResubmit ? '補充資訊' : '提交需求'}</h1>
          <div className="sub">
            {isResubmit
              ? '依受理 PM 的補件說明修改內容，送出後回到「待評估」。前次內容與意見會保留在時間軸。'
              : '完整填寫一次送出，減少來回補件。期望日期僅供參考，不代表承諾。'}
          </div>
        </div>
        {!isResubmit && (
          <span className="small muted" data-testid="autosave" aria-live="polite">
            {saving ? '儲存中…' : savedAt ? `草稿已自動儲存 ${taipeiTime(savedAt)}` : draft ? '草稿' : '輸入後自動儲存草稿'}
          </span>
        )}
      </div>

      {isResubmit && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <div>
            <b>PM 的補件說明：</b>
            {[...initial!.history].reverse().find(e => e.to === 'NEED_INFO')?.reason}
          </div>
        </div>
      )}

      {/* 分段指示 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="stepper" aria-label="表單進度">
          {SECTIONS.map((s, i) => (
            <button key={s.title} className={`step ${i < step ? 'done' : i === step ? 'current' : ''}`} onClick={() => (i < step ? goto(i) : goto(i))} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }} aria-current={i === step ? 'step' : undefined}>
              <span className="node">{i < step && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}</span>
              {i + 1}. {s.title}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-pad stack" style={{ gap: 18 }} data-testid={`form-step-${step}`}>
        <FormError error={formError?.code === 'CONFLICT' ? null : formError} />
        {formError?.code === 'CONFLICT' && <ConflictBanner onReload={() => window.location.reload()} />}

        {step === 0 && (
          <>
            <TextField label="標題" required value={form.title} onChange={v => update('title', v)} error={err('title')} maxLength={100} hint={`${form.title.trim().length} / 100 字・一句話說明要解決什麼`} placeholder="例：報價單匯出需含稅別欄位" data-testid="f-title" />
            <div className="grid-2">
              <Field label="類型" required error={err('type')}>
                {() => (
                  <div className="seg" role="radiogroup" aria-label="類型">
                    {['功能', '缺陷', '改善'].map(t => (
                      <button key={t} type="button" role="radio" aria-checked={form.type === t} className={form.type === t ? 'on' : ''} onClick={() => update('type', t)} data-testid={`f-type-${t}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <SelectField label="受理 PM" required value={form.pmId} onChange={v => update('pmId', v)} options={pmOptions} error={err('pmId')} hint="依專案預設帶入，可改選" />
            </div>
            <TextField label="期望日期（選填）" type="date" value={form.expectedDate} onChange={v => update('expectedDate', v)} error={err('expectedDate')} min={addDays(today, 1)} hint="需晚於今日；僅供參考，不代表承諾日期" />
          </>
        )}

        {step === 1 && (
          <>
            <TextArea label="目前遇到的問題" required value={form.problem} onChange={v => update('problem', v)} error={err('problem')} counter={2000} rows={5} placeholder="描述現況：誰、在什麼情境、遇到什麼困難、造成什麼影響（至少 10 字）" data-testid="f-problem" />
            <TextArea label="預期結果" required value={form.expected} onChange={v => update('expected', v)} error={err('expected')} counter={2000} rows={4} placeholder="完成後使用者可以做到什麼？如何判斷已解決？（至少 10 字）" data-testid="f-expected" />
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid-2">
              <SelectField label="影響範圍" required value={form.impactScope} onChange={v => update('impactScope', v)} error={err('impactScope')} options={['單一客戶', '多客戶', '內部團隊', '全公司'].map(v => ({ value: v, label: v }))} data-testid="f-impactScope" />
              <TextField label="影響對象與規模" required value={form.impactNote} onChange={v => update('impactNote', v)} error={err('impactNote')} placeholder="例：3 家客戶、每月約 40 張報價單" hint="不需估算金額" data-testid="f-impactNote" />
            </div>
            <div className="grid-2">
              <Field label="急迫性" required error={err('urgency')}>
                {() => (
                  <div className="seg" role="radiogroup" aria-label="急迫性">
                    {['高', '中', '低'].map(t => (
                      <button key={t} type="button" role="radio" aria-checked={form.urgency === t} className={form.urgency === t ? 'on' : ''} onClick={() => update('urgency', t)} data-testid={`f-urgency-${t}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <TextField label="急迫原因" required value={form.urgencyNote} onChange={v => update('urgencyNote', v)} error={err('urgencyNote')} placeholder="例：10 月底前客戶需送審" data-testid="f-urgencyNote" />
            </div>
            <Field label="關聯客戶（可多選；內部需求可不填）" error={err('clientIds')} hint="只列出你有權限且未封存的客戶">
              {() => (
                <div className="row wrap" data-testid="f-clients">
                  {clientOpts.length === 0 && <span className="small muted">沒有可關聯的客戶</span>}
                  {clientOpts.map(c => {
                    const on = form.clientIds.includes(c.id)
                    return (
                      <button key={c.id} type="button" className={`btn sm ${on ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={on} onClick={() => update('clientIds', on ? form.clientIds.filter(x => x !== c.id) : [...form.clientIds, c.id])}>
                        {on ? '✓ ' : ''}
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <h3>請確認內容</h3>
            <dl className="kv" data-testid="confirm">
              <dt>標題</dt>
              <dd>{form.title || <span className="danger-text">未填寫</span>}</dd>
              <dt>類型</dt>
              <dd>{form.type || <span className="danger-text">未選擇</span>}</dd>
              <dt>受理 PM</dt>
              <dd>{users.name(form.pmId)}</dd>
              <dt>期望日期</dt>
              <dd>{form.expectedDate ? form.expectedDate.replace(/-/g, '/') : '—'}</dd>
              <dt>問題</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{form.problem || '—'}</dd>
              <dt>預期結果</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{form.expected || '—'}</dd>
              <dt>影響範圍</dt>
              <dd>
                {form.impactScope || '—'}｜{form.impactNote || '—'}
              </dd>
              <dt>急迫性</dt>
              <dd>
                {form.urgency || '—'}｜{form.urgencyNote || '—'}
              </dd>
              <dt>關聯客戶</dt>
              <dd>{form.clientIds.map(id => clientOpts.find(c => c.id === id)?.name ?? id).join('、') || '（內部需求）'}</dd>
            </dl>
            {isResubmit && <TextArea label="本次補充說明" required value={resubmitNote} onChange={setResubmitNote} error={err('resubmitNote')} rows={3} placeholder="說明補充了哪些資訊，會寫入時間軸並通知受理 PM" data-testid="f-resubmit" />}
            <div className="banner info">提交後狀態為「待評估」並產生需求編號，受理 PM 會收到通知。</div>
          </>
        )}

        <div className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <Button tone="ghost" onClick={discard} style={{ color: 'var(--text-2)' }}>
            {draft && !isResubmit ? '刪除草稿' : '取消'}
          </Button>
          <span className="spacer" />
          {step > 0 && <Button onClick={() => goto(step - 1)}>← 上一步</Button>}
          {step < 3 ? (
            <Button tone="primary" onClick={() => goto(step + 1)} data-testid="next-step">
              下一步 →
            </Button>
          ) : (
            <Button tone="primary" onClick={submit} disabled={submitting} data-testid="submit-req">
              {submitting ? '送出中…' : isResubmit ? '送出補件' : '提交需求'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
