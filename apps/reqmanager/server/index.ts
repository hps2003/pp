// Node API 伺服器（零相依套件）：node server/index.ts
//   PORT=8787          監聽埠
//   DATA_FILE=...      JSON 資料檔（預設 server/data/db.json，不存在時以示範資料建立）
//   AUTOMATION_SEC=60  自動化排程（時限提醒 + 外部 API 同步）間隔秒數，0 = 關閉
// 同時提供 /api/* 與建置後的前端（../../reqmanager），並允許跨來源呼叫，
// 讓 GitHub Pages 上的前端也能在「系統狀態」頁切換為連線到此伺服器。

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handle, type Backend } from '../src/domain/api.ts'
import { createSeed } from '../src/domain/seed.ts'
import { runAutomation } from '../src/domain/automation.ts'
import type { Database } from '../src/domain/types.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 8787)
const DATA_FILE = process.env.DATA_FILE ?? path.join(here, 'data', 'db.json')
const STATIC_DIR = path.resolve(here, '../../../reqmanager')
const PUBLIC_DIR = path.resolve(here, '../public')
const AUTOMATION_SEC = Number(process.env.AUTOMATION_SEC ?? 60)

let cache: Database | null = null

function readDb(): Database {
  if (!cache) {
    if (fs.existsSync(DATA_FILE)) cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Database
    else {
      cache = createSeed(new Date())
      persist(cache)
    }
  }
  return structuredClone(cache)
}

function persist(db: Database) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  // 先寫暫存檔再改名，避免寫入中斷造成資料毀損
  const tmp = `${DATA_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, DATA_FILE)
}

const backend: Backend = {
  mode: 'server',
  load: readDb,
  save(db) {
    cache = structuredClone(db)
    persist(db)
  },
  now: () => new Date(),
  async fetchJson(url) {
    // 相對路徑（./mock/...）由本機 public/ 提供，方便離線示範
    if (url.startsWith('./') || url.startsWith('/')) {
      const file = path.join(PUBLIC_DIR, url.replace(/^\.?\//, ''))
      if (!file.startsWith(PUBLIC_DIR)) throw new Error('不允許的路徑')
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = new URL(req.url ?? '/', 'http://x')
  for (const dir of [STATIC_DIR, PUBLIC_DIR]) {
    let file = path.join(dir, decodeURIComponent(url.pathname))
    if (!file.startsWith(dir)) return false
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
      return true
    }
  }
  return false
}

const server = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'authorization, content-type, idempotency-key')
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return void res.writeHead(204).end()

  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && serveStatic(req, res)) return
    return void res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
  }

  let raw = ''
  for await (const chunk of req) raw += chunk
  let body: unknown
  try {
    body = raw ? JSON.parse(raw) : undefined
  } catch {
    return void res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ code: 'BAD_JSON', message: 'JSON 格式錯誤' }))
  }
  const started = Date.now()
  const out = await handle(backend, {
    method: req.method ?? 'GET',
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
    headers: req.headers as Record<string, string>,
  })
  res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(out.body))
  if (process.env.LOG !== '0') console.log(`${req.method} ${url.pathname} ${out.status} ${Date.now() - started}ms`)
})

let timer: NodeJS.Timeout | undefined
if (AUTOMATION_SEC > 0) {
  timer = setInterval(async () => {
    const db = readDb()
    const r = await runAutomation(db, backend, new Date())
    if (r.changed) {
      db.rev++
      db.updatedAt = new Date().toISOString()
      backend.save(db)
      console.log(`[automation] ${r.note}`)
    }
  }, AUTOMATION_SEC * 1000)
}

server.listen(PORT, () => {
  console.log(`ReqManager API  http://localhost:${PORT}/api/health`)
  console.log(`前端（需先 npm run build）http://localhost:${PORT}/`)
  console.log(`資料檔 ${DATA_FILE}`)
})

process.on('SIGTERM', () => {
  clearInterval(timer)
  server.close()
})
