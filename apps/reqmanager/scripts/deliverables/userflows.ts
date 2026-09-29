// 使用者操作圖：UF-00 網站地圖、UF-01 需求生命週期泳道、需求狀態機、
// UF-02 各角色操作流程、自動化更新與 API 串接時序。

import { STATUS_META } from '../../src/domain/rules.ts'
import type { ReqStatus } from '../../src/domain/types.ts'
import { esc, flow, page, type FNode } from './common.ts'

const st = (id: ReqStatus, col: number, row: number, w?: number): FNode => ({ id, label: STATUS_META[id].label, col, row, kind: 'status', fg: STATUS_META[id].fg, bg: STATUS_META[id].bg, w })

// ─── UF-00 網站地圖 ─────────────────────────────────────────────────────

const sitemap = flow(
  [
    { id: 'start', label: '開啟網站', col: 0, row: 0, kind: 'start' },
    { id: 's01', label: 'S01 登入', col: 1, row: 0, kind: 'screen' },
    { id: 'sso', label: 'SSO 驗證', col: 2, row: 0, kind: 'decision' },
    { id: 'err', label: '顯示錯誤訊息\n（停用／驗證失敗）', col: 3, row: 0, kind: 'note' },
    { id: 'nav', label: '依角色顯示左側導覽', col: 2, row: 1 },
    { id: 's02', label: 'S02 工作台', col: 0, row: 2, kind: 'screen' },
    { id: 's05', label: 'S05 需求列表', col: 1, row: 2, kind: 'screen' },
    { id: 's06', label: 'S06 提交需求', col: 2, row: 2, kind: 'screen' },
    { id: 's03', label: 'S03 客戶列表', col: 3, row: 2, kind: 'screen' },
    { id: 's10', label: 'S10 報表', col: 4, row: 2, kind: 'screen' },
    { id: 's11', label: 'S11 帳號與權限', col: 5, row: 2, kind: 'screen' },
    { id: 's12', label: 'S12 系統狀態', col: 6, row: 2, kind: 'screen' },
    { id: 's07', label: 'S07 需求詳細', col: 1, row: 3, kind: 'screen' },
    { id: 's04', label: 'S04 客戶詳細', col: 3, row: 3, kind: 'screen' },
    { id: 'n10', label: '時間軸・現金流試算', col: 4, row: 3, kind: 'note' },
    { id: 'n12', label: '外部整合・資料管理', col: 6, row: 3, kind: 'note' },
    { id: 's08', label: 'S08 評估與指派\n（對話框）', col: 0, row: 4, kind: 'screen' },
    { id: 's09', label: 'S09 測試與驗收\n（抽屜）', col: 2, row: 4, kind: 'screen' },
    { id: 'docs', label: '說明與回饋\n（全部角色可見）', col: 6, row: 0, kind: 'note' },
  ],
  [
    { from: 'start', to: 's01' },
    { from: 's01', to: 'sso' },
    { from: 'sso', to: 'err', label: '失敗', tone: 'back' },
    { from: 'err', to: 's01', route: 'loop-up', tone: 'back', label: '重新登入' },
    { from: 'sso', to: 'nav', label: '成功' },
    { from: 'nav', to: 's02', label: '業務・PM・工程・QA', at: 0.45 },
    { from: 'nav', to: 's05' },
    { from: 'nav', to: 's06' },
    { from: 'nav', to: 's03', label: '業務・PM' },
    { from: 'nav', to: 's10', label: 'PM・業務主管', at: 0.62 },
    { from: 'nav', to: 's11', label: 'Admin', at: 0.72 },
    { from: 'nav', to: 's12', label: 'Admin・PM', at: 0.85 },
    { from: 's05', to: 's07', label: '點列' },
    { from: 's06', to: 's07', route: 'v', label: '提交後' },
    { from: 's03', to: 's04', label: '點列' },
    { from: 's10', to: 'n10', dashed: true },
    { from: 's12', to: 'n12', dashed: true },
    { from: 's07', to: 's08', route: 'v', label: 'PM' },
    { from: 's07', to: 's09', route: 'v', label: 'QA・驗收者・PM' },
  ],
  { cellW: 176, cellH: 100, title: 'UF-00 網站地圖' },
)

const visibility = `<table class="vis">
<thead><tr><th>頁面</th><th>業務</th><th>業務主管</th><th>PM</th><th>工程</th><th>QA</th><th>Admin</th></tr></thead>
<tbody>
${[
  ['S02 工作台', '✓', '✓', '✓', '✓', '✓', '—'],
  ['S03／S04 客戶', '本人負責', '全部＋封存', '範圍內', '僅公司名', '僅公司名', '—'],
  ['S05／S07 需求', '本人提交＋負責客戶', '全部', '範圍內', '被指派', '被指派', '—'],
  ['S06 提交需求', '✓', '✓', '✓', '✓', '✓', '—'],
  ['S08 評估與指派', '—', '—', '受理 PM', '—', '—', '—'],
  ['S09 測試與驗收', '被指定驗收者', '—', '結案', '—', '記錄測試', '—'],
  ['S10 報表', '—', '✓', '✓', '—', '—', '—'],
  ['S11 帳號與權限', '—', '—', '—', '—', '—', '✓'],
  ['S12 系統狀態', '—', '—', '整合與排程', '—', '—', '✓'],
].map(r => `<tr>${r.map((c, i) => (i === 0 ? `<th>${c}</th>` : `<td class="${c === '—' ? 'no' : ''}">${c}</td>`)).join('')}</tr>`).join('\n')}
</tbody></table>`

// ─── UF-01 需求生命週期泳道 ─────────────────────────────────────────────

const lifecycle = flow(
  [
    { id: 'b1', label: 'S06 填表提交', col: 0, row: 0, kind: 'screen' },
    { id: 'p1', label: '評估', col: 1, row: 1, kind: 'decision' },
    { id: 'rej', label: '不採納', col: 1, row: 2, kind: 'status', fg: '#475467', bg: '#eaecf0' },
    { id: 'b2', label: '補充資訊', col: 2, row: 0 },
    { id: 'p2', label: 'S08-B 指派開發', col: 3, row: 1, kind: 'screen' },
    { id: 'd1', label: '開發・提交\n測試版本', col: 4, row: 2 },
    { id: 'q1', label: '測試結果', col: 5, row: 3, kind: 'decision' },
    { id: 'b3', label: '業務驗收', col: 7, row: 0, kind: 'decision' },
    { id: 'p3', label: 'S09-C 結案', col: 8, row: 1, kind: 'screen' },
    { id: 'end', label: '已結案', col: 9, row: 1, kind: 'end' },
    { id: 'n1', label: '產生 REQ 編號\n通知受理 PM', col: 0, row: 4, kind: 'system' },
    { id: 'n2', label: '通知提出人', col: 2, row: 4, kind: 'system' },
    { id: 'n3', label: '通知開發・提出人', col: 3, row: 4, kind: 'system' },
    { id: 'n4', label: '通知 QA', col: 5, row: 4, kind: 'system' },
    { id: 'n6', label: '通知驗收者', col: 7, row: 4, kind: 'system' },
    { id: 'n5', label: '通知提出人\n工程・QA', col: 9, row: 4, kind: 'system' },
  ],
  [
    { from: 'b1', to: 'p1', route: 'v', label: '提交' },
    { from: 'p1', to: 'rej', label: '理由必填' },
    { from: 'p1', to: 'b2', label: '要求補件', tone: 'back' },
    { from: 'b2', to: 'p1', route: 'loop-up', label: '補件重送' },
    { from: 'p1', to: 'p2', label: '接受', tone: 'ok', at: 0.6 },
    { from: 'p2', to: 'd1', route: 'v', label: '承諾日期・AC' },
    { from: 'd1', to: 'q1', label: '提交測試' },
    { from: 'q1', to: 'd1', route: 'loop-down', label: '失敗＋缺陷（保留前次紀錄）', tone: 'back' },
    { from: 'q1', to: 'b3', label: '通過', tone: 'ok', at: 0.35 },
    { from: 'b3', to: 'p3', label: '通過', tone: 'ok' },
    { from: 'b3', to: 'd1', route: 'loop-up', label: '退回（原因必填）', tone: 'back', at: 0.3 },
    { from: 'p3', to: 'end' },
  ],
  { cellW: 150, cellH: 112, laneW: 96, lanes: [{ label: '業務', rows: 1 }, { label: 'PM', rows: 1 }, { label: '工程', rows: 1 }, { label: 'QA', rows: 1 }, { label: '系統通知', rows: 1 }], colHeads: ['Submit', 'Evaluate', '補件', 'Assign', 'Track', 'Test', '', 'UAT', 'Close', ''], title: 'UF-01 需求生命週期' },
)

// ─── 狀態機（PRD 7.2） ──────────────────────────────────────────────────

const states = flow(
  [
    st('NEED_INFO', 1, 0), st('DRAFT', 0, 1), st('PENDING_REVIEW', 1, 1), st('ACCEPTED', 2, 1), st('IN_DEV', 3, 1), st('IN_QA', 4, 1), st('IN_UAT', 5, 1, 122), st('CLOSED', 6, 1),
    st('REJECTED', 1, 2), st('CANCELLED', 2, 2),
  ],
  [
    { from: 'DRAFT', to: 'PENDING_REVIEW', label: '提交' },
    { from: 'PENDING_REVIEW', to: 'ACCEPTED', label: '接受', tone: 'ok' },
    { from: 'ACCEPTED', to: 'IN_DEV', label: '指派' },
    { from: 'IN_DEV', to: 'IN_QA', label: '測試版本' },
    { from: 'IN_QA', to: 'IN_UAT', label: 'QA 通過', tone: 'ok' },
    { from: 'IN_UAT', to: 'CLOSED', label: 'PM 結案', tone: 'ok' },
    { from: 'PENDING_REVIEW', to: 'NEED_INFO', path: [[0.78, 0.8], [0.78, 0.2]], label: '要求補件', tone: 'back', at: 0.25 },
    { from: 'NEED_INFO', to: 'PENDING_REVIEW', path: [[1.22, 0.2], [1.22, 0.8]], label: '補件重送', at: 0.75 },
    { from: 'PENDING_REVIEW', to: 'REJECTED', path: [[0.9, 1.2], [0.9, 1.8]], label: '不採納' },
    { from: 'PENDING_REVIEW', to: 'CANCELLED', path: [[1.2, 1.2], [1.2, 1.45], [1.5, 1.45], [1.5, 2], [1.7, 2]], label: '撤回／重複', dashed: true, at: 0.5 },
    { from: 'ACCEPTED', to: 'CANCELLED', path: [[2, 1.2], [2, 1.8]], label: 'PM 取消' },
    { from: 'IN_DEV', to: 'CANCELLED', path: [[2.8, 1.2], [2.8, 2], [2.3, 2]], label: 'PM 取消', at: 0.5 },
    { from: 'IN_QA', to: 'IN_DEV', path: [[4, 1.2], [4, 1.42], [3.1, 1.42], [3.1, 1.2]], label: '測試失敗', tone: 'back' },
    { from: 'IN_UAT', to: 'IN_DEV', path: [[5, 1.2], [5, 1.68], [3.2, 1.68], [3.2, 1.2]], label: '驗收退回', tone: 'back', at: 0.3 },
    { from: 'CLOSED', to: 'PENDING_REVIEW', path: [[6, 0.8], [6, 0.45], [1.28, 0.45], [1.28, 0.8]], label: '重新開啟（原因必填）', tone: 'back', at: 0.45 },
  ],
  { cellW: 170, cellH: 100, title: '需求狀態機' },
)

// ─── UF-02 各角色操作流程 ───────────────────────────────────────────────

const flowBiz = flow(
  [
    { id: 'a', label: '＋提交需求', col: 0, row: 0, kind: 'start' },
    { id: 'b', label: '① 基本資訊', col: 1, row: 0, kind: 'screen' },
    { id: 'c', label: '② 需求描述', col: 2, row: 0, kind: 'screen' },
    { id: 'd', label: '③ 影響與客戶', col: 3, row: 0, kind: 'screen' },
    { id: 'e', label: '④ 確認提交', col: 4, row: 0, kind: 'screen' },
    { id: 'f', label: '檢核通過？', col: 5, row: 0, kind: 'decision' },
    { id: 'g', label: '取得 REQ 編號', col: 6, row: 0, kind: 'end' },
    { id: 'h', label: '就地標示錯誤\n跳到該段・內容保留', col: 5, row: 1 },
    { id: 'i', label: '每 1.5 秒自動儲存草稿', col: 2, row: 2, kind: 'system' },
    { id: 'j', label: '重試只建立一筆\n（Idempotency-Key）', col: 6, row: 1, kind: 'system' },
  ],
  [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' },
    { from: 'e', to: 'f' }, { from: 'f', to: 'g', label: '是', tone: 'ok' }, { from: 'f', to: 'h', label: '否', tone: 'back' },
    { from: 'h', to: 'b', label: '修正後再送', tone: 'back', at: 0.5 },
    { from: 'i', to: 'c', dashed: true }, { from: 'j', to: 'g', dashed: true },
  ],
  { cellW: 180, cellH: 92, title: '業務：提交需求' },
)

const flowPm = flow(
  [
    { id: 'a', label: '工作台：待評估', col: 0, row: 0, kind: 'start' },
    { id: 'b', label: 'S07 需求詳細', col: 1, row: 0, kind: 'screen' },
    { id: 'c', label: '資訊足夠？', col: 2, row: 0, kind: 'decision' },
    { id: 'd', label: '值得做？', col: 3, row: 0, kind: 'decision' },
    { id: 'e', label: 'S08-A 計分\n優先級・說明', col: 4, row: 0, kind: 'screen' },
    st('ACCEPTED', 5, 0),
    { id: 'g', label: 'S08-B 負責人\n承諾日・AC', col: 6, row: 0, kind: 'screen' },
    { id: 'h', label: '四項齊全？', col: 7, row: 0, kind: 'decision' },
    st('IN_DEV', 8, 0),
    { id: 'i', label: '要求補件（原因必填）', col: 2, row: 1 },
    { id: 'j', label: '不採納（理由必填）', col: 3, row: 2 },
    { id: 'k', label: '按鈕停用\n列出「尚缺」', col: 7, row: 1, kind: 'note' },
    st('NEED_INFO', 2, 2),
  ],
  [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd', label: '是' }, { from: 'd', to: 'e', label: '是', tone: 'ok' },
    { from: 'e', to: 'ACCEPTED' }, { from: 'ACCEPTED', to: 'g' }, { from: 'g', to: 'h' }, { from: 'h', to: 'IN_DEV', label: '是', tone: 'ok' },
    { from: 'c', to: 'i', label: '否', tone: 'back' }, { from: 'i', to: 'NEED_INFO' }, { from: 'd', to: 'j', label: '否', tone: 'back' },
    { from: 'h', to: 'k', label: '否', tone: 'back' }, { from: 'k', to: 'g', tone: 'back' },
  ],
  { cellW: 172, cellH: 92, title: 'PM：評估與指派' },
)

const flowDevQa = flow(
  [
    { id: 'a', label: '工作台：開發中', col: 0, row: 0, kind: 'start' },
    { id: 'b', label: '工程：提交測試版本\n版本號＋自測確認', col: 1, row: 0, kind: 'screen' },
    st('IN_QA', 2, 0),
    { id: 'c', label: 'QA：S09-A\n逐案記錄結果', col: 3, row: 0, kind: 'screen' },
    { id: 'd', label: '全部通過？', col: 4, row: 0, kind: 'decision' },
    st('IN_UAT', 5, 0, 122),
    { id: 'e', label: '關聯缺陷（必填）\n退回開發中', col: 4, row: 1 },
    { id: 'f', label: '前次測試紀錄保留', col: 3, row: 2, kind: 'system' },
  ],
  [
    { from: 'a', to: 'b' }, { from: 'b', to: 'IN_QA' }, { from: 'IN_QA', to: 'c' }, { from: 'c', to: 'd' },
    { from: 'd', to: 'IN_UAT', label: '是', tone: 'ok' }, { from: 'd', to: 'e', label: '否', tone: 'back' },
    { from: 'e', to: 'b', label: '修正後重新提交', tone: 'back' }, { from: 'f', to: 'e', dashed: true, route: 'h' },
  ],
  { cellW: 170, cellH: 92, title: '工程與 QA：開發與測試' },
)

const flowUat = flow(
  [
    { id: 'a', label: '通知：請執行 UAT', col: 0, row: 0, kind: 'start' },
    { id: 'b', label: '業務：S09-B\n逐項確認 AC', col: 1, row: 0, kind: 'screen' },
    { id: 'c', label: '符合實際任務？', col: 2, row: 0, kind: 'decision' },
    { id: 'd', label: 'PM：S09-C\n結案前三項檢查', col: 3, row: 0, kind: 'screen' },
    { id: 'e', label: '交付證據齊全？', col: 4, row: 0, kind: 'decision' },
    { id: 'f', label: '已結案', col: 5, row: 0, kind: 'end' },
    { id: 'g', label: '退回（原因必填）', col: 2, row: 1 },
    st('IN_DEV', 2, 2),
    { id: 'h', label: '填交付版本・上線日期', col: 4, row: 1 },
    { id: 'i', label: '可「重新開啟」\n保留原結案紀錄', col: 5, row: 1, kind: 'note' },
  ],
  [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd', label: '通過', tone: 'ok' }, { from: 'd', to: 'e' }, { from: 'e', to: 'f', label: '是', tone: 'ok' },
    { from: 'c', to: 'g', label: '否', tone: 'back' }, { from: 'g', to: 'IN_DEV' }, { from: 'e', to: 'h', label: '否' },
    { from: 'h', to: 'd', tone: 'back' }, { from: 'f', to: 'i', dashed: true },
  ],
  { cellW: 180, cellH: 92, title: '業務驗收與 PM 結案' },
)

const flowAdmin = flow(
  [
    { id: 'a', label: '收到離職核准', col: 0, row: 0, kind: 'start' },
    { id: 'b', label: 'S11 帳號列表', col: 1, row: 0, kind: 'screen' },
    { id: 'c', label: '按「停用」', col: 2, row: 0 },
    { id: 'd', label: '二次確認？', col: 3, row: 0, kind: 'decision' },
    { id: 'e', label: '帳號停用', col: 4, row: 0 },
    { id: 'f', label: '既有登入立即失效\n寫入稽核紀錄', col: 5, row: 0, kind: 'system' },
    { id: 'g', label: 'PM 轉派未結需求', col: 6, row: 0, kind: 'end' },
    { id: 'h', label: 'HR 在職名單同步\n（離職自動停用）', col: 0, row: 1, kind: 'system' },
  ],
  [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e', label: '確認', tone: 'ok' },
    { from: 'd', to: 'b', route: 'loop-up', label: '取消' }, { from: 'e', to: 'f' }, { from: 'f', to: 'g' },
    { from: 'h', to: 'e', dashed: true, label: '自動化' },
  ],
  { cellW: 175, cellH: 90, title: 'Admin：人員異動' },
)

// ─── 自動化更新與 API 串接 ──────────────────────────────────────────────

const autoUpdate = flow(
  [
    { id: 'a1', label: '按「提交需求」', col: 0, row: 0 },
    { id: 'fa1', label: 'POST /api/requirements\nIdempotency-Key', col: 1, row: 1, kind: 'screen' },
    { id: 'api1', label: '檢核・建立 REQ 編號\n資料版本 rev +1', col: 2, row: 2, kind: 'system' },
    { id: 'fa2', label: '顯示 REQ 編號', col: 3, row: 1, kind: 'screen' },
    { id: 'fb1', label: 'GET /api/changes\n（每 10 秒）', col: 3, row: 3, kind: 'screen' },
    { id: 'api2', label: '回傳最新 rev', col: 4, row: 2, kind: 'system' },
    { id: 'fb2', label: 'rev 不同 →\n重新抓取畫面資料', col: 5, row: 3, kind: 'screen' },
    { id: 'b1', label: '工作台出現新需求\n通知鈴 +1', col: 6, row: 4 },
    { id: 'job', label: '排程：時限提醒\nERP／HR 同步', col: 6, row: 2, kind: 'system' },
  ],
  [
    { from: 'a1', to: 'fa1' }, { from: 'fa1', to: 'api1', route: 'v' }, { from: 'api1', to: 'fa2', route: 'v', label: '201 Created' },
    { from: 'fb1', to: 'api2', route: 'v' }, { from: 'api2', to: 'fb2', route: 'v' }, { from: 'fb2', to: 'b1' },
    { from: 'job', to: 'api2', dashed: true, label: '每分鐘' },
  ],
  { cellW: 175, cellH: 84, laneW: 110, lanes: [{ label: '業務 王小明', rows: 1 }, { label: '網頁（業務）', rows: 1 }, { label: 'REST API', rows: 1 }, { label: '網頁（PM）', rows: 1 }, { label: 'PM 林雅婷', rows: 1 }], title: '自動化更新時序' },
)

const legend = `<div class="legend-row">
<span><svg width="54" height="22"><rect x="1" y="1" width="52" height="20" rx="10" fill="#1d2939"/></svg>起點</span>
<span><svg width="54" height="22"><rect x="1" y="1" width="52" height="20" rx="5" fill="#eaf1fe" stroke="#2f6fed" stroke-width="1.5"/></svg>畫面（S01–S12）</span>
<span><svg width="54" height="22"><rect x="1" y="1" width="52" height="20" rx="5" fill="#fff" stroke="#475467"/></svg>使用者操作</span>
<span><svg width="54" height="22"><polygon points="27,1 53,11 27,21 1,11" fill="#fffaeb" stroke="#dc6803" stroke-width="1.5"/></svg>判斷</span>
<span><svg width="54" height="22"><rect x="1" y="1" width="52" height="20" rx="5" fill="#f2f4f7" stroke="#98a2b3" stroke-dasharray="4 3"/></svg>系統自動處理</span>
<span><svg width="54" height="22"><rect x="1" y="1" width="52" height="20" rx="10" fill="#e8f0fe" stroke="#1d4ed8" stroke-width="1.5"/></svg>需求狀態</span>
<span><svg width="44" height="12"><line x1="0" y1="6" x2="40" y2="6" stroke="#067647" stroke-width="2"/></svg>通過</span>
<span><svg width="44" height="12"><line x1="0" y1="6" x2="40" y2="6" stroke="#d92d20" stroke-width="2"/></svg>退回／失敗</span>
<span><svg width="44" height="12"><line x1="0" y1="6" x2="40" y2="6" stroke="#475467" stroke-width="2" stroke-dasharray="5 4"/></svg>自動／附帶</span>
</div>`

const sheet = (id: string, kicker: string, title: string, desc: string, content: string) =>
  `<section class="sheet" id="${id}"><div class="sheet-head"><span class="id">${esc(kicker)}</span><h2>${esc(title)}</h2><span class="meta">${desc}</span></div><div class="flow-body">${content}</div>${legend}</section>`

const CSS = `
.flow-body { padding: 18px 22px; }
.flow-scroll { overflow-x: auto; }
svg.flow { display: block; width: 100%; height: auto; margin: 0 auto; font-family: inherit; }
.flow-body h3 { font-size: 16px; margin: 22px 0 8px; } .flow-body h3:first-child { margin-top: 0; }
.flow-body p { color: var(--text-2); margin: 0 0 10px; font-size: 14px; }
table.vis { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 18px; }
table.vis th, table.vis td { border-bottom: 1px solid var(--border); padding: 8px 10px; text-align: left; }
table.vis thead th { background: #f9fafb; color: var(--text-2); }
table.vis td.no { color: #98a2b3; }
.grid2 { display: grid; grid-template-columns: 1fr; gap: 8px; }
`

export function renderUserFlows(): string {
  const body = [
    sheet('uf00', 'UF-00', '網站地圖與角色可見性', '登入後依角色顯示導覽；直接輸入網址也會由後端檢查權限', `${sitemap}${visibility}`),
    sheet('uf01', 'UF-01', '需求生命週期（跨角色泳道）', 'Submit → Evaluate → Assign → Track → Test → UAT → Close', `<p>每一步都寫入狀態時間軸（操作者、時間、前後狀態、理由），並依 PRD FR-04 通知下一位負責人。</p>${lifecycle}`),
    sheet('states', 'PRD 7.2', '需求狀態機', '只允許表列轉換，其他跳階一律由後端拒絕並記錄', `<p>主流程：草稿 → 待評估 → 待排程 → 開發中 → 待測試 → 待業務驗收 → 已結案。紅線為退回路徑，全部需要填寫原因。</p>${states}`),
    sheet('uf02', 'UF-02', '各角色操作流程', '以畫面與判斷點描述每個角色完成主要任務的步驟', `
      <h3>業務：提交需求（S06）</h3><p>缺必填欄位不建立需求，就地標示並保留內容（AC-02A）；網路重試只建立一筆（AC-02B）。</p>${flowBiz}
      <h3>PM：評估與指派（S07 → S08）</h3><p>補件、不採納必填原因（AC-03A）；四項齊全才能開始開發（AC-03C）。</p>${flowPm}
      <h3>工程與 QA：開發與測試（S07 → S09-A）</h3><p>測試失敗必須關聯缺陷，退回開發且前次紀錄保留（AC-05A）。</p>${flowDevQa}
      <h3>業務驗收與 PM 結案（S09-B → S09-C）</h3><p>只有指定驗收者可操作（AC-05B）；QA 通過＋UAT 通過＋交付證據三項齊全才可結案（AC-05C）。</p>${flowUat}
      <h3>Admin：人員異動（S11）</h3><p>停用當日生效，既有登入立即失效；HR 在職名單同步可自動停用離職帳號（PRD 6.3）。</p>${flowAdmin}`),
    sheet('auto', 'API', '自動化更新與 API 串接', '一位使用者的修改，其他人畫面不重新整理即可看到', `<p>前端每 10 秒以 <code>GET /api/changes</code> 比對資料版本 rev，有變更才重新抓取；視窗取得焦點與同瀏覽器其他分頁寫入時立即更新。伺服器每分鐘執行時限提醒與外部 API 同步。</p>${autoUpdate}`),
  ].join('\n')
  return page(
    '需求管理平台｜使用者操作圖（User Flow）',
    'PRD v0.3・UF-00 網站地圖／UF-01 需求生命週期／狀態機／UF-02 各角色操作流程／自動化更新',
    [
      { id: 'uf00', label: 'UF-00 網站地圖' },
      { id: 'uf01', label: 'UF-01 生命週期泳道' },
      { id: 'states', label: '狀態機' },
      { id: 'uf02', label: 'UF-02 角色操作流程' },
      { id: 'auto', label: '自動化更新' },
    ],
    body,
    CSS,
  )
}
