// 工作階段：企業 SSO（示範環境以帳號選擇模擬）、閒置 30 分鐘自動登出（PRD 10.2）、
// 帳號被停用時既有登入立即失效（FR-07）。

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiFailure, api, getToken, setToken } from '../api/client.ts'
import { live, useQuery } from '../api/live.ts'
import type { UserRef } from '../domain/types.ts'
import { navigate } from './router.tsx'

export const IDLE_MS = 30 * 60 * 1000

interface Session {
  user: UserRef | null
  ready: boolean
  login: (userId: string) => Promise<void>
  logout: (reason?: string) => void
  logoutReason: string
}

const Ctx = createContext<Session>({ user: null, ready: false, login: async () => {}, logout: () => {}, logoutReason: '' })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRef | null>(null)
  const [ready, setReady] = useState(false)
  const [logoutReason, setLogoutReason] = useState('')

  const logout = useCallback((reason = '') => {
    setToken(null)
    setUser(null)
    setLogoutReason(reason)
    live.stop()
    const current = window.location.hash
    navigate('/login', reason && current && !current.startsWith('#/login') ? { returnTo: current.replace(/^#/, '') } : undefined, true)
  }, [])

  // 啟動時還原工作階段
  useEffect(() => {
    if (!getToken()) return setReady(true)
    api
      .get<{ user: UserRef }>('/api/auth/me')
      .then(r => {
        setUser(r.user)
        live.start()
      })
      .catch((e: unknown) => {
        setToken(null)
        if (e instanceof ApiFailure && e.code === 'ACCOUNT_DISABLED') setLogoutReason('此帳號已停用，無法登入')
      })
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (userId: string) => {
    const r = await api.post<{ token: string; user: UserRef }>('/api/auth/login', { userId })
    setToken(r.token)
    setUser(r.user)
    setLogoutReason('')
    live.start()
  }, [])

  // API 回應 401（例如帳號在使用中被停用）→ 登出
  useEffect(() => {
    const h = (e: Event) => {
      const err = (e as CustomEvent<ApiFailure>).detail
      if (getToken()) logout(err.code === 'ACCOUNT_DISABLED' ? '此帳號已停用，工作階段已失效' : '登入已失效，請重新登入')
    }
    window.addEventListener('reqmanager:unauthorized', h)
    return () => window.removeEventListener('reqmanager:unauthorized', h)
  }, [logout])

  // 閒置自動登出
  useEffect(() => {
    if (!user) return
    let last = Date.now()
    const bump = () => (last = Date.now())
    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart']
    events.forEach(ev => window.addEventListener(ev, bump, { passive: true }))
    const t = setInterval(() => {
      if (Date.now() - last > IDLE_MS) logout('因閒置 30 分鐘已自動登出')
    }, 15000)
    return () => {
      events.forEach(ev => window.removeEventListener(ev, bump))
      clearInterval(t)
    }
  }, [user, logout])

  return <Ctx.Provider value={{ user, ready, login, logout, logoutReason }}>{children}</Ctx.Provider>
}

export function useSession() {
  return useContext(Ctx)
}

export function useMe(): UserRef {
  const { user } = useSession()
  if (!user) throw new Error('not logged in')
  return user
}

/** 使用者名冊（ID → 姓名），供各畫面顯示 */
export function useUsers() {
  const q = useQuery<(UserRef & { email?: string })[]>('/api/users')
  const byId = useMemo(() => new Map((q.data ?? []).map(u => [u.id, u])), [q.data])
  const name = useCallback((id: string | undefined) => (id ? byId.get(id)?.name ?? (id === 'system' ? '系統' : '—') : '—'), [byId])
  return { list: q.data ?? [], byId, name, loading: q.loading }
}
