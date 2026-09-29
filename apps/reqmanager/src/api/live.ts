// 自動化更新：定時以 /api/changes 比對資料版本（rev），有變更才重新抓取畫面資料。
// 另外在視窗重新取得焦點、其他分頁寫入、以及自己送出修改後立即更新。

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ApiFailure, api, getToken, loadConfig, onExternalChange } from './client.ts'

export interface LiveStatus {
  rev: number
  lastChecked: string
  lastChanged: string
  state: 'idle' | 'ok' | 'error'
  message: string
  pollSec: number
}

type Listener = () => void

class LiveSync {
  status: LiveStatus = { rev: -1, lastChecked: '', lastChanged: '', state: 'idle', message: '', pollSec: loadConfig().pollSec }
  private statusListeners = new Set<Listener>()
  private changeListeners = new Set<Listener>()
  private timer: ReturnType<typeof setInterval> | undefined
  private lastAutomation = 0
  private ticking = false

  start() {
    this.stop()
    const sec = loadConfig().pollSec
    this.setStatus({ pollSec: sec })
    if (sec > 0) this.timer = setInterval(() => void this.tick(), sec * 1000)
    void this.tick()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  async tick(force = false) {
    if (this.ticking) return
    if (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    this.ticking = true
    try {
      const cfg = loadConfig()
      // 瀏覽器內建 API 沒有背景排程，改由前端每 60 秒觸發一次自動化（提醒 + 外部 API 同步）
      if (cfg.mode === 'local' && getToken() && Date.now() - this.lastAutomation > 60000) {
        this.lastAutomation = Date.now()
        await api.post('/api/automation/run').catch(() => undefined)
      }
      const r = await api.get<{ rev: number; updatedAt: string }>('/api/changes')
      const changed = this.status.rev !== -1 && r.rev !== this.status.rev
      this.setStatus({ rev: r.rev, lastChecked: new Date().toISOString(), state: 'ok', message: '', ...(changed ? { lastChanged: new Date().toISOString() } : {}) })
      if (changed || force) this.emitChange()
    } catch (e) {
      this.setStatus({ lastChecked: new Date().toISOString(), state: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      this.ticking = false
    }
  }

  /** 自己送出修改後呼叫：立即讓所有畫面重新抓取 */
  bump() {
    void this.tick(true)
  }

  private setStatus(p: Partial<LiveStatus>) {
    this.status = { ...this.status, ...p }
    this.statusListeners.forEach(l => l())
  }

  private emitChange() {
    this.changeListeners.forEach(l => l())
  }

  subscribeStatus = (l: Listener) => {
    this.statusListeners.add(l)
    return () => void this.statusListeners.delete(l)
  }

  onChange(l: Listener) {
    this.changeListeners.add(l)
    return () => void this.changeListeners.delete(l)
  }
}

export const live = new LiveSync()

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => void live.tick())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void live.tick()
  })
  onExternalChange(() => void live.tick(true))
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(live.subscribeStatus, () => live.status)
}

export interface QueryState<T> {
  data: T | undefined
  error: ApiFailure | null
  loading: boolean
  /** 資料最後一次成功取得的時間 */
  fetchedAt: string
  refetch: () => Promise<void>
}

/** 讀取資料並在資料版本變更時自動更新 */
export function useQuery<T>(path: string | null, query?: Record<string, string | number | undefined>): QueryState<T> {
  const key = path ? `${path}?${JSON.stringify(query ?? {})}` : ''
  const [state, setState] = useState<{ data: T | undefined; error: ApiFailure | null; loading: boolean; fetchedAt: string; key: string }>({
    data: undefined, error: null, loading: !!path, fetchedAt: '', key,
  })
  const seq = useRef(0)
  const qRef = useRef(query)
  qRef.current = query

  const load = useCallback(async () => {
    if (!path) return
    const my = ++seq.current
    setState(s => ({ ...s, loading: true, ...(s.key !== key ? { data: undefined, error: null, key } : {}) }))
    try {
      const data = await api.get<T>(path, qRef.current)
      if (my === seq.current) setState({ data, error: null, loading: false, fetchedAt: new Date().toISOString(), key })
    } catch (e) {
      const err = e instanceof ApiFailure ? e : new ApiFailure(0, { message: String(e) })
      if (my === seq.current) setState(s => ({ ...s, error: err, loading: false, key }))
      if (err.status === 401) window.dispatchEvent(new CustomEvent('reqmanager:unauthorized', { detail: err }))
    }
  }, [key, path])

  useEffect(() => {
    void load()
    return live.onChange(() => void load())
  }, [load])

  const stale = state.key !== key
  return { data: stale ? undefined : state.data, error: stale ? null : state.error, loading: stale ? true : state.loading, fetchedAt: state.fetchedAt, refetch: load }
}

/** 送出修改：成功後觸發全域重新整理，失敗時回傳 ApiFailure 供表單就地顯示 */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiFailure | null>(null)
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true)
      setError(null)
      try {
        const r = await fn(...args)
        live.bump()
        return r
      } catch (e) {
        const err = e instanceof ApiFailure ? e : new ApiFailure(0, { message: String(e) })
        setError(err)
        if (err.status === 401) window.dispatchEvent(new CustomEvent('reqmanager:unauthorized', { detail: err }))
        return undefined
      } finally {
        setPending(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  )
  return { run, pending, error, setError }
}
