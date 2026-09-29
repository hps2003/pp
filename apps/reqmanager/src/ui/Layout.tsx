// 版面：頂部列（搜尋、通知、使用者）+ 左側導覽（依角色顯示，UF-00 資訊架構與角色可見性）。

import { useCallback, useState, type ReactNode } from 'react'
import { api } from '../api/client.ts'
import { live, useLiveStatus, useQuery } from '../api/live.ts'
import { ROLE_LABEL } from '../domain/rules.ts'
import { relTime, taipeiTime } from '../domain/time.ts'
import type { Notification, UserRef } from '../domain/types.ts'
import { Avatar, Icon, useOutside } from './kit.tsx'
import { Link, navigate, useRoute } from './router.tsx'
import { useSession } from './session.tsx'

export interface NavItem {
  to: string
  label: string
  match: (path: string) => boolean
}

export function navFor(u: UserRef): NavItem[] {
  const items: NavItem[] = []
  const add = (to: string, label: string, match: (p: string) => boolean) => items.push({ to, label, match })
  if (u.role !== 'Admin') {
    add('/', '工作台', p => p === '/')
    add('/requirements', '需求', p => p.startsWith('/requirements'))
  }
  if (u.role === 'Business' || u.role === 'PM') add('/clients', '客戶', p => p.startsWith('/clients'))
  if (u.role === 'PM' || (u.role === 'Business' && u.manager)) add('/reports', '報表', p => p.startsWith('/reports'))
  if (u.role === 'Admin') add('/admin/users', '帳號與權限', p => p.startsWith('/admin'))
  if (u.role === 'Admin' || u.role === 'PM') add('/system', '系統狀態', p => p.startsWith('/system'))
  return items
}

function LiveIndicator() {
  const s = useLiveStatus()
  const off = s.pollSec === 0
  return (
    <div className="live-pill" data-testid="live-indicator" title={s.message || undefined}>
      <span className={`live-dot ${s.state === 'error' ? 'error' : off ? 'off' : ''}`} aria-hidden />
      <span style={{ flex: 1 }}>
        {s.state === 'error' ? '連線中斷，稍後自動重試' : off ? '自動更新已關閉' : `自動更新・每 ${s.pollSec} 秒`}
        <br />
        {s.lastChecked && <span>最後檢查 {taipeiTime(s.lastChecked)}</span>}
      </span>
      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => live.bump()} aria-label="立即重新整理" title="立即重新整理">
        <Icon name="refresh" size={14} />
      </button>
    </div>
  )
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const q = useQuery<{ unread: number; items: Notification[] }>('/api/notifications')
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutside(close)
  const markAll = async () => {
    await api.post('/api/notifications/read', {})
    live.bump()
  }
  const openItem = async (n: Notification) => {
    await api.post('/api/notifications/read', { ids: [n.id] })
    live.bump()
    setOpen(false)
    if (n.reqId) navigate(`/requirements/${n.reqId}`)
  }
  const unread = q.data?.unread ?? 0
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen(o => !o)} aria-label={`通知，${unread} 則未讀`} data-testid="bell">
        <Icon name="bell" />
        {unread > 0 && <span className="badge-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="通知">
          <div className="card-head">
            <h3 style={{ flex: 1 }}>通知</h3>
            <button className="btn btn-ghost sm" onClick={markAll} disabled={!unread}>
              全部標為已讀
            </button>
          </div>
          <div style={{ overflowY: 'auto' }}>
            {(q.data?.items ?? []).length === 0 && <div className="state"><p>目前沒有通知</p></div>}
            {(q.data?.items ?? []).map(n => (
              <button key={n.id} onClick={() => openItem(n)} className="row" style={{ width: '100%', textAlign: 'left', background: n.read ? 'none' : '#f8faff', border: 'none', borderBottom: '1px solid var(--border)', padding: '12px 16px', cursor: 'pointer', alignItems: 'flex-start' }}>
                <span className="live-dot" style={{ marginTop: 6, visibility: n.read ? 'hidden' : 'visible', background: n.kind === 'reminder' ? 'var(--warning)' : 'var(--primary)', boxShadow: 'none' }} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5 }}>
                    {n.kind === 'reminder' && <b className="warning-text">[提醒] </b>}
                    {n.kind === 'mention' && <b style={{ color: 'var(--primary)' }}>[@提及] </b>}
                    {n.text}
                  </span>
                  <span className="small muted">{relTime(n.at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserMenu({ user }: { user: UserRef }) {
  const { logout } = useSession()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutside(close)
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-chip" onClick={() => setOpen(o => !o)} data-testid="user-menu">
        <Avatar name={user.name} />
        <span className="uc-text">
          <b>{user.name}</b>
          <span>
            {user.role}
            {user.manager ? '・主管' : ''}
          </span>
        </span>
      </button>
      {open && (
        <div className="menu">
          <div style={{ padding: '8px 12px' }} className="small muted">
            {user.dept}・{ROLE_LABEL[user.role]}
            {user.manager ? '（業務主管）' : ''}
          </div>
          <hr />
          <button onClick={() => logout('')}>切換帳號</button>
          <button onClick={() => logout('你已登出')}>登出</button>
        </div>
      )}
    </div>
  )
}

export function Layout({ user, children }: { user: UserRef; children: ReactNode }) {
  const route = useRoute()
  const [q, setQ] = useState('')
  const nav = navFor(user)
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate('/requirements', { tab: 'all', q: q.trim() || undefined })
  }
  return (
    <>
      <header className="topbar">
        <Link to={user.role === 'Admin' ? '/admin/users' : '/'} className="brand">
          <span className="brand-mark">需</span>需求管理平台
        </Link>
        {user.role !== 'Admin' && (
          <form className="global-search" onSubmit={submitSearch} role="search">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋需求編號、標題或客戶" aria-label="搜尋需求編號、標題或客戶" data-testid="global-search" />
            <Icon name="search" />
          </form>
        )}
        <div className="topbar-right">
          {user.role !== 'Admin' && <Notifications />}
          <UserMenu user={user} />
        </div>
      </header>
      <nav className="mobile-nav" aria-label="主要導覽（行動版）">
        {nav.map(n => (
          <Link key={n.to} to={n.to} className={`nav-item ${n.match(route.path) ? 'active' : ''}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="shell">
        <nav className="sidebar" aria-label="主要導覽">
          {nav.map(n => (
            <Link key={n.to} to={n.to} className={`nav-item ${n.match(route.path) ? 'active' : ''}`}>
              <span className="dot" />
              {n.label}
            </Link>
          ))}
          <div className="nav-section">
            <Link to="/docs" className={`nav-item ${route.path.startsWith('/docs') ? 'active' : ''}`}>
              <span className="dot" />
              說明與回饋
            </Link>
            <LiveIndicator />
          </div>
        </nav>
        <main className="main" id="main">
          {children}
        </main>
      </div>
    </>
  )
}
