// 產生交付文件：網頁框線圖、使用者操作圖（皆為單一 HTML 檔，可直接開啟或列印）
//   npm run build:deliverables → docs/deliverables/*.html，並複製到 public/deliverables/ 供網站連結

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderWireframes } from './deliverables/wireframes.ts'
import { renderUserFlows } from './deliverables/userflows.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = { 'wireframes.html': renderWireframes(), 'user-flows.html': renderUserFlows() }
for (const dir of ['docs/deliverables', 'public/deliverables']) {
  fs.mkdirSync(path.join(root, dir), { recursive: true })
  for (const [name, html] of Object.entries(files)) fs.writeFileSync(path.join(root, dir, name), html)
}
for (const [name, html] of Object.entries(files)) console.log(`✓ docs/deliverables/${name}（${(html.length / 1024).toFixed(0)} KB）`)
