// 共用 UI 元件：按鈕、表單欄位（就地錯誤提示）、狀態標籤、對話框、抽屜、
// 空白／無權限／讀取失敗三種狀態畫面（PRD 10.1、S12）。

import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { STATUS_META } from '../domain/rules.ts'
import type { ReqStatus } from '../domain/types.ts'
import type { DueState } from '../domain/metrics.ts'
import type { ApiFailure } from '../api/client.ts'

type Tone = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Button({ tone = 'secondary', size, block, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'lg'; block?: boolean }) {
  return <button type="button" className={`btn btn-${tone} ${size ?? ''} ${block ? 'block' : ''} ${className}`} {...rest} />
}

export function StatusChip({ status }: { status: ReqStatus }) {
  const m = STATUS_META[status]
  return (
    <span className="chip" style={{ background: m.bg, color: m.fg }} data-status={status}>
      {m.label}
    </span>
  )
}

export function DueText({ due }: { due: DueState }) {
  if (due.kind === 'none') return <span className="muted">未設定</span>
  return <span className={due.kind === 'overdue' || due.kind === 'soon' ? 'danger-text' : ''}>{due.label}</span>
}

export function Avatar({ name, size }: { name: string; size?: 'sm' }) {
  return (
    <span className={`avatar ${size ?? ''}`} aria-hidden>
      {name.slice(0, 1)}
    </span>
  )
}

// ─── 表單 ───────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: (id: string, invalid: boolean) => ReactNode
}

export function Field({ label, required, error, hint, children }: FieldProps) {
  const id = useId()
  return (
    <div className="field" data-field-error={error ? 'true' : undefined}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children(id, !!error)}
      {error ? <span className="error-msg" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function TextField({ label, required, error, hint, value, onChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { label: string; error?: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      {(id, invalid) => <input id={id} className={`input ${invalid ? 'invalid' : ''}`} value={value} onChange={e => onChange(e.target.value)} aria-invalid={invalid} {...rest} />}
    </Field>
  )
}

export function TextArea({ label, required, error, hint, value, onChange, counter, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { label: string; error?: string; hint?: string; value: string; onChange: (v: string) => void; counter?: number }) {
  return (
    <Field label={label} required={required} error={error} hint={hint ?? (counter ? `${value.trim().length} / ${counter.toLocaleString()} 字` : undefined)}>
      {(id, invalid) => <textarea id={id} className={`textarea ${invalid ? 'invalid' : ''}`} value={value} onChange={e => onChange(e.target.value)} aria-invalid={invalid} {...rest} />}
    </Field>
  )
}

export function SelectField({ label, required, error, hint, value, onChange, options, placeholder = '請選擇', ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & { label: string; error?: string; hint?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      {(id, invalid) => (
        <select id={id} className={`select ${invalid ? 'invalid' : ''}`} value={value} onChange={e => onChange(e.target.value)} aria-invalid={invalid} {...rest}>
          <option value="">{placeholder}</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function Checkbox({ checked, onChange, children, error }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string }) {
  return (
    <div className="field">
      <label className="checkbox">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span>{children}</span>
      </label>
      {error && <span className="error-msg" role="alert">{error}</span>}
    </div>
  )
}

/** 表單層級錯誤（非欄位錯誤，如網路失敗、衝突） */
export function FormError({ error }: { error: ApiFailure | null }) {
  if (!error) return null
  if (error.code === 'CONFLICT') return <ConflictBanner />
  const fieldCount = Object.keys(error.fields).length
  return (
    <div className="banner danger" role="alert">
      <span aria-hidden>!</span>
      <div>
        <b>{error.message}</b>
        {fieldCount > 0 && <div className="small">共 {fieldCount} 個欄位需要修正，已在欄位下方標示。已輸入的內容都保留。</div>}
      </div>
    </div>
  )
}

export function ConflictBanner({ onReload }: { onReload?: () => void }) {
  return (
    <div className="banner warn" role="alert" data-testid="conflict">
      <span aria-hidden>⟳</span>
      <div style={{ flex: 1 }}>
        <b>這筆資料已被其他人更新</b>
        <div className="small">為避免覆蓋他人的修改，你的變更尚未送出。請重新載入最新內容後再送出（PRD 7.4 同時修改）。</div>
      </div>
      {onReload && (
        <Button size="sm" onClick={onReload}>
          重新載入
        </Button>
      )}
    </div>
  )
}

// ─── 對話框／抽屜 ───────────────────────────────────────────────────────

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

export function Dialog({ kicker, title, sub, children, footer, onClose, wide, testId }: { kicker?: string; title: string; sub?: ReactNode; children: ReactNode; footer: ReactNode; onClose: () => void; wide?: boolean; testId?: string }) {
  useEscape(onClose)
  const titleId = useId()
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
        <div className="dialog-head">
          {kicker && <div className="dialog-kicker">{kicker}</div>}
          <h2 id={titleId}>{title}</h2>
          {sub && <div className="dialog-sub">{sub}</div>}
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>
  )
}

export function Drawer({ kicker, title, sub, children, footer, onClose, testId }: { kicker?: string; title: string; sub?: ReactNode; children: ReactNode; footer: ReactNode; onClose: () => void; testId?: string }) {
  useEscape(onClose)
  const titleId = useId()
  return (
    <div className="drawer-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
        <div className="dialog-head row">
          <div style={{ flex: 1 }}>
            {kicker && <div className="dialog-kicker">{kicker}</div>}
            <h2 id={titleId}>{title}</h2>
            {sub && <div className="dialog-sub">{sub}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {footer}
        </div>
      </aside>
    </div>
  )
}

export function useOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onOutside])
  return ref
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(i => (
        <button key={i.value} role="tab" aria-selected={value === i.value} className={`tab ${value === i.value ? 'active' : ''}`} onClick={() => onChange(i.value)}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

// ─── 三種狀態畫面：無資料／無權限／讀取失敗（PRD 10.1） ────────────────

export function EmptyState({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state" data-state="empty">
      <div className="state-icon" aria-hidden>
        ∅
      </div>
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: ApiFailure; onRetry?: () => void }) {
  if (error.status === 403) return <NoPermission />
  if (error.status === 404) return <EmptyState title="找不到這筆資料" desc="可能已被刪除，或網址不正確。" />
  return (
    <div className="state error" data-state="error">
      <div className="state-icon" aria-hidden>
        !
      </div>
      <h3>讀取失敗</h3>
      <p>{error.message}</p>
      {onRetry && (
        <Button tone="secondary" onClick={onRetry}>
          重試
        </Button>
      )}
    </div>
  )
}

export function NoPermission({ desc }: { desc?: string }) {
  return (
    <div className="state lock" data-state="forbidden">
      <div className="state-icon" aria-hidden>
        🔒
      </div>
      <h3>沒有權限查看</h3>
      <p>{desc ?? '這筆資料不在你的授權範圍內。如需存取，請聯繫資料負責人或你的主管申請。'}</p>
    </div>
  )
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card-body stack" aria-busy="true" aria-label="載入中">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

/** 統一處理 loading／error／empty */
export function Async<T>({ q, children, empty }: { q: { data: T | undefined; error: ApiFailure | null; loading: boolean; refetch: () => void }; children: (d: T) => ReactNode; empty?: (d: T) => ReactNode | null }) {
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={q.refetch} />
  if (q.data === undefined) return <Loading />
  const e = empty?.(q.data)
  if (e) return <>{e}</>
  return <>{children(q.data)}</>
}

// ─── Toast ──────────────────────────────────────────────────────────────

interface ToastItem {
  id: number
  text: string
  tone: 'ok' | 'error'
}
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems(s => [...s, { id, text, tone }])
    setTimeout(() => setItems(s => s.filter(x => x.id !== id)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

export function Icon({ name, size = 18 }: { name: 'search' | 'bell' | 'refresh' | 'more' | 'plus' | 'check' | 'x'; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'search':
      return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    case 'bell':
      return <svg {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
    case 'refresh':
      return <svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
    case 'more':
      return <svg {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
    case 'plus':
      return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>
    case 'check':
      return <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>
    case 'x':
      return <svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
  }
}
