// 產生單一檔案的網站 HTML（JS／CSS 全部內嵌），可直接雙擊開啟或寄送：
//   npm run build:single → docs/deliverables/reqmanager-site.html
// 使用瀏覽器內建 API，資料存在開啟者的瀏覽器；外部 API 同步使用內建示範資料。

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reqm-single-'))
execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', tmp, '--emptyOutDir'], { cwd: root, stdio: 'inherit' })

let html = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8')
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, f) => `<style>\n${fs.readFileSync(path.join(tmp, f), 'utf8')}\n</style>`)
let app = ''
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g, (_, f: string) => {
  app += fs.readFileSync(path.join(tmp, f), 'utf8').replace(/<\/script/gi, '<\\/script')
  return ''
})
if (!app) throw new Error('找不到應用程式腳本')
// 內嵌腳本放在 body 結尾，確保 #root 已存在；用函式取代避免 $ 字元被解讀
html = html.replace('</body>', () => `<script type="module">\n${app}\n</script>\n</body>`)
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('仍有未內嵌的資源')

const out = path.join(root, 'docs/deliverables/reqmanager-site.html')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, html)
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`✓ ${path.relative(process.cwd(), out)}（${(fs.statSync(out).size / 1024).toFixed(0)} KB）`)
