// 前端 API 用戶端。兩種傳輸方式實作同一份 REST 合約：
//   - local：瀏覽器內建 API（src/domain/api.ts + localStorage），GitHub Pages 靜態部署預設使用
//   - http ：連線到 Node API 伺服器（server/index.ts）或任何實作相同合約的後端
// 模式、網址與自動更新頻率可在「S12 系統狀態」頁切換，設定存於 localStorage。

import { handle, type ApiRequest, type Backend } from '../domain/api.ts'
import { createSeed } from '../domain/seed.ts'
import type { Database } from '../domain/types.ts'
import type { FieldErrors } from '../domain/rules.ts'

export interface ApiConfig {
  mode: 'local' | 'http'
  baseUrl: string
  /** 自動更新間隔秒數；0 = 關閉 */
  pollSec: number
}

const CONFIG_KEY = 'reqmanager.config'
const DB_KEY = 'reqmanager.db.v1'
const TOKEN_KEY = 'reqmanager.token'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 私密模式等情況下忽略 */
  }
}

export function loadConfig(): ApiConfig {
  const envBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
  const fallback: ApiConfig = { mode: envBase ? 'http' : 'local', baseUrl: envBase, pollSec: 10 }
  try {
    return { ...fallback, ...(JSON.parse(safeGet(CONFIG_KEY) ?? '{}') as Partial<ApiConfig>) }
  } catch {
    return fallback
  }
}

export function saveConfig(c: ApiConfig) {
  safeSet(CONFIG_KEY, JSON.stringify(c))
}

export class ApiFailure extends Error {
  status: number
  code: string
  fields: FieldErrors
  extra: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.message ?? `HTTP ${status}`))
    this.status = status
    this.code = String(body.code ?? 'ERROR')
    this.fields = (body.fields as FieldErrors) ?? {}
    this.extra = body
  }
}

// ─── 瀏覽器內建 API ─────────────────────────────────────────────────────

let memoryDb: Database | null = null
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('reqmanager') : null

const localBackend: Backend = {
  mode: 'local',
  load() {
    if (!memoryDb) {
      const raw = safeGet(DB_KEY)
      memoryDb = raw ? (JSON.parse(raw) as Database) : createSeed(new Date())
      if (!raw) safeSet(DB_KEY, JSON.stringify(memoryDb))
    }
    return structuredClone(memoryDb)
  },
  save(db) {
    memoryDb = structuredClone(db)
    safeSet(DB_KEY, JSON.stringify(db))
    // 通知同一瀏覽器的其他分頁立即重新整理
    channel?.postMessage({ type: 'rev', rev: db.rev })
  },
  now: () => new Date(),
  async fetchJson(url) {
    const res = await fetch(new URL(url, document.baseURI), { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
}

/** 其他分頁寫入 localStorage 時，丟棄記憶體快取 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === DB_KEY) memoryDb = null
  })
  channel?.addEventListener('message', () => {
    memoryDb = null
  })
}

export function onExternalChange(fn: () => void): () => void {
  const h = () => fn()
  channel?.addEventListener('message', h)
  return () => channel?.removeEventListener('message', h)
}

export function resetLocalDatabase() {
  memoryDb = null
  safeSet(DB_KEY, null)
}

// ─── 請求 ───────────────────────────────────────────────────────────────

export function getToken(): string {
  return safeGet(TOKEN_KEY) ?? ''
}
export function setToken(t: string | null) {
  safeSet(TOKEN_KEY, t)
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined | null>
  body?: unknown
  headers?: Record<string, string>
}

function cleanQuery(q?: RequestOptions['query']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(q ?? {})) if (v !== undefined && v !== null && v !== '') out[k] = String(v)
  return out
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const cfg = loadConfig()
  const headers: Record<string, string> = { ...opts.headers }
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  const query = cleanQuery(opts.query)

  if (cfg.mode === 'local') {
    // 模擬網路延遲，讓載入狀態與 UI 回饋與真實後端一致
    await new Promise(r => setTimeout(r, 60 + Math.random() * 90))
    const req: ApiRequest = { method, path, query, body: opts.body, headers }
    const res = await handle(localBackend, req)
    if (res.status >= 400) throw new ApiFailure(res.status, res.body as Record<string, unknown>)
    return res.body as T
  }

  const base = cfg.baseUrl.replace(/\/+$/, '')
  const qs = new URLSearchParams(query).toString()
  let res: Response
  try {
    res = await fetch(`${base}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { ...headers, ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiFailure(0, { code: 'NETWORK', message: `無法連線到 API 伺服器（${base || '同網域'}），請確認伺服器已啟動或到「系統狀態」切換模式。` })
  }
  const body = (await res.json().catch(() => ({ message: `HTTP ${res.status}` }))) as Record<string, unknown>
  if (!res.ok) throw new ApiFailure(res.status, body)
  return body as T
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, { body: body ?? {}, headers }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path),
}
