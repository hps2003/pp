// 說明與回饋：User Flow／Wireframe 拆解（UF-00／UF-01／UF-02、S01–S12），
// 每張畫面連到實作頁面，並列出對應的 PRD 驗收條件。

import { useState } from 'react'
import { ROLE_LABEL } from '../domain/rules.ts'
import type { Role } from '../domain/types.ts'
import { Tabs } from '../ui/kit.tsx'
import { Link } from '../ui/router.tsx'
import { useMe } from '../ui/session.tsx'

const ROLES: Role[] = ['Business', 'PM', 'Developer', 'QA', 'Admin']

const IA: { page: string; route: string; vis: Record<Role, string> }[] = [
  { page: 'S02 我的工作台', route: '/', vis: { Business: '✓', PM: '✓', Developer: '✓', QA: '✓', Admin: '—' } },
  { page: 'S03／S04 客戶', route: '/clients', vis: { Business: '本人負責（主管：全部）', PM: '範圍內', Developer: '僅公司名', QA: '僅公司名', Admin: '—' } },
  { page: 'S05／S07 需求', route: '/requirements', vis: { Business: '本人提交＋負責客戶', PM: '範圍內', Developer: '被指派', QA: '被指派', Admin: '—' } },
  { page: 'S06 提交需求', route: '/requirements/new', vis: { Business: '✓', PM: '✓', Developer: '✓', QA: '✓', Admin: '—' } },
  { page: 'S10 報表', route: '/reports', vis: { Business: '業務主管', PM: '✓', Developer: '—', QA: '—', Admin: '—' } },
  { page: 'S11 帳號與權限', route: '/admin/users', vis: { Business: '—', PM: '—', Developer: '—', QA: '—', Admin: '✓' } },
  { page: 'S12 系統狀態', route: '/system', vis: { Business: '—', PM: '整合與排程', Developer: '—', QA: '—', Admin: '✓' } },
]

const LANES: { role: string; cells: (string | { note: string })[] }[] = [
  { role: '業務', cells: ['建客戶・記互動\n填表提交', { note: '收補件通知\n補充資訊' }, { note: '收接受通知' }, { note: '可查進度' }, '', '執行 UAT\n通過／退回', { note: '收結案通知' }] },
  { role: 'PM', cells: [{ note: '收提交通知' }, '評估\n接受／補件／不採納', '指派開發\n設承諾日期與 AC', { note: '變更承諾日期\n需填原因' }, { note: '監督測試' }, { note: 'UAT 通過通知' }, '確認交付證據\n結案'] },
  { role: '工程', cells: ['', { note: '技術評估・估工' }, { note: '收指派通知' }, '開發\n提交測試版本', { note: '測試失敗\n退回修正' }, { note: 'UAT 退回\n退回修正' }, ''] },
  { role: 'QA', cells: ['', '', '', '', '執行案例\n記錄結果・缺陷', '', ''] },
  { role: 'Admin', cells: ['開停帳號\n設定角色與範圍', '', '', '', '', '', ''] },
]
const STAGES = ['Submit 提交', 'Evaluate 評估', 'Assign 指派', 'Track 開發', 'Test 測試', 'UAT 業務驗收', 'Close 結案']

const SCREENS: { id: string; title: string; route: string; svg?: string; shot?: string; notes: string[]; ac: string }[] = [
  { id: 'S01', title: '登入', route: '/login', svg: 'S01-login.svg', notes: ['只提供企業 SSO 登入（示範以帳號選擇模擬）', '停用帳號／驗證失敗顯示對應訊息', '通知連結進入時登入後回到原頁', '閒置 30 分鐘自動登出並提示'], ac: 'FR-07・10.2' },
  { id: 'S02', title: '我的工作台', route: '/', svg: 'S02-workbench.svg', notes: ['數字卡依角色切換，點擊篩選清單', '只列「現在輪到我」，動詞寫出下一步', '期限剩 2 個工作天內紅字', '右側只顯示與我相關的異動'], ac: 'US-03・7.3' },
  { id: 'S03', shot: 'S03-clients.png', title: '客戶列表', route: '/clients', notes: ['搜尋公司名稱或統編', '只列授權範圍內客戶', '新增客戶：統編重複不允許、名稱相似可確認後建立'], ac: 'AC-01A・01B' },
  { id: 'S04', shot: 'S04-client-detail.png', title: '客戶詳細', route: '/clients/C001', notes: ['基本資料＋聯絡人（敏感欄位依角色遮罩）', '互動紀錄新到舊，標示 LINE／Email／API 同步來源', '封存後禁止新增互動與新關聯'], ac: 'AC-01C・01D・01E' },
  { id: 'S05', title: '需求列表', route: '/requirements', svg: 'S05-req-list.svg', notes: ['篩選以標籤顯示，可逐一移除或清除全部', '條件保留在網址，返回不重置', '狀態＝文字＋顏色；承諾日期逾期紅字寫天數', '分頁頁籤依角色預設'], ac: 'AC-04A・04B' },
  { id: 'S06', shot: 'S06-form-confirm.png', title: '提交需求', route: '/requirements/new', notes: ['分段表單（4 段）＋就地錯誤提示', '草稿自動儲存', '提交產生 REQ-YYYYMM-NNNN；重試只建立一筆'], ac: 'AC-02A・02B・02D' },
  { id: 'S07', title: '需求詳細', route: '/requirements/R03', svg: 'S07-req-detail.svg', notes: ['頁首按鈕依「角色 × 狀態」只露出合法操作', '七階段進度條；不採納／取消改灰色', '「下一步」橫幅寫出誰要做什麼、期限', '時間軸與承諾日期異動不可刪改', '同時編輯衝突提示重新載入'], ac: 'AC-04C・7.2・7.4' },
  { id: 'S08', title: '評估與指派', route: '/requirements/R03', svg: 'S08-evaluate.svg', notes: ['接受：四面向計分＋優先級＋評估說明（必填）', '開始開發：四項齊全才可送出，明列「尚缺」', '補件／不採納：精簡對話框，只有必填原因', '承諾日期變更另開對話框，必填原因'], ac: 'AC-03A・03B・03C・03D' },
  { id: 'S09', title: '測試與驗收', route: '/requirements/R07', svg: 'S09-test-uat.svg', notes: ['QA：逐案記錄，失敗必須關聯缺陷，退回開發且保留前次紀錄', 'UAT：只有指定驗收者可操作，退回必填原因', 'PM 結案：QA 通過＋UAT 通過＋交付證據三項齊全', '已結案可重新開啟，保留原紀錄'], ac: 'AC-05A・05B・05C・05D' },
  { id: 'S10', shot: 'S10-reports.png', title: '管理報表', route: '/reports', notes: ['新增量、逾期、評估耗時、交付週期（中位數＋樣本數）', '篩選日期區間／類型／負責人；點數字下鑽明細', '顯示區間、時區、最後更新時間；無資料顯示「無資料」', '另含時間軸（Gantt）與現金流試算（可編輯）'], ac: 'AC-06A・06B・06C' },
  { id: 'S11', shot: 'S11-accounts.png', title: '帳號與權限', route: '/admin/users', notes: ['角色與範圍分開設定', '停用、角色變更二次確認；停用後既有登入立即失效', '權限矩陣與稽核紀錄'], ac: 'FR-07・6.3' },
  { id: 'S12', shot: 'S12-integrations.png', title: '系統狀態', route: '/system', notes: ['API 串接模式（內建／遠端）與自動更新頻率', '外部 API 同步（ERP 客戶主檔、HR 在職名單）與排程紀錄', '資料匯出／匯入／重置', '無資料／無權限／讀取失敗／衝突 狀態畫面'], ac: '10.1・10.2' },
]

const FLOWS: Record<Role, string[]> = {
  Business: ['S01 登入', 'S02 工作台（待我補件／待我驗收）', 'S03 客戶 → S04 記互動', 'S06 提交需求 → 取得編號', 'S07 查進度／補充資訊', 'S09-B 執行 UAT'],
  PM: ['S01 登入', 'S02 工作台（待評估／待排程／待結案）', 'S07 需求詳細', 'S08-A 接受／補件／不採納', 'S08-B 指派開發', 'S09-C 結案', 'S10 報表'],
  Developer: ['S01 登入', 'S02 工作台（開發中／退回）', 'S07 需求詳細（只看被指派）', '提交測試版本'],
  QA: ['S01 登入', 'S02 工作台（待測試）', 'S07 需求詳細', 'S09-A 記錄測試結果'],
  Admin: ['S01 登入', 'S11 帳號與權限（開停帳號、角色）', 'S12 系統狀態（資料管理）'],
}

export function Docs() {
  const me = useMe()
  const [tab, setTab] = useState<'flow' | 'screens' | 'ia'>('flow')
  return (
    <div className="page wide">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1>說明：User Flow 與 Wireframe</h1>
          <div className="sub">依 PRD v0.3 與 Wireframe（UF-00／UF-01／UF-02、S01–S12）拆解，每張畫面都可點進實作頁面操作。</div>
        </div>
        <a className="btn btn-secondary" href="./deliverables/wireframes.html" target="_blank" rel="noreferrer">
          網頁框線圖
        </a>
        <a className="btn btn-secondary" href="./deliverables/user-flows.html" target="_blank" rel="noreferrer">
          使用者操作圖
        </a>
        <a className="btn btn-secondary" href="mailto:it-helpdesk@company.tw?subject=需求管理平台回饋">
          回饋問題
        </a>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'flow', label: 'UF-01 需求生命週期' },
          { value: 'screens', label: 'S01–S12 畫面' },
          { value: 'ia', label: 'UF-00／02 資訊架構與角色流程' },
        ]}
      />

      {tab === 'flow' && (
        <section className="card card-pad">
          <h2 style={{ marginBottom: 4 }}>UF-01 需求生命週期（跨角色泳道）</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            實心 = 該角色的主要操作；虛線 = 收到通知或可查詢。狀態：草稿 → 待評估 → 待排程 → 開發中 → 待測試 → 待業務驗收 → 已結案（另有待補件、不採納、已取消）。
          </p>
          <div className="table-wrap">
            <div className="swimlane" style={{ minWidth: 900 }}>
              <div className="sl-head">角色</div>
              {STAGES.map(s => (
                <div key={s} className="sl-head">
                  {s}
                </div>
              ))}
              {LANES.map(l => (
                <div key={l.role} style={{ display: 'contents' }}>
                  <div className="sl-role">{l.role}</div>
                  {l.cells.map((c, i) => (
                    <div key={i}>
                      {typeof c === 'string' ? c && <div className="sl-act" style={{ whiteSpace: 'pre-line' }}>{c}</div> : <div className="sl-note" style={{ whiteSpace: 'pre-line' }}>{c.note}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === 'screens' && (
        <div className="wf-grid">
          {SCREENS.map(s => (
            <article key={s.id} className="card wf-card" data-testid={`screen-${s.id}`}>
              <div className="wf-thumb">
                {s.svg ? (
                  <a href={`./wireframes/${s.svg}`} target="_blank" rel="noreferrer" title="開啟原始 Wireframe">
                    <img src={`./wireframes/${s.svg}`} alt={`${s.id} ${s.title} wireframe`} loading="lazy" />
                  </a>
                ) : s.shot ? (
                  <a href={`./screens/${s.shot}`} target="_blank" rel="noreferrer" title="實作畫面截圖（無原始 Wireframe，依 PRD 10.1 與相鄰畫面規格實作）">
                    <img src={`./screens/${s.shot}`} alt={`${s.id} ${s.title} 實作畫面`} loading="lazy" />
                  </a>
                ) : null}
              </div>
              <div className="card-body stack" style={{ gap: 8, flex: 1 }}>
                <div className="row">
                  <span className="chip blue">{s.id}</span>
                  <h3 style={{ flex: 1 }}>{s.title}</h3>
                  {s.route !== '/login' && <Link to={s.route}>開啟 →</Link>}
                </div>
                <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 13 }}>
                  {s.notes.map((n, i) => (
                    <li key={i} className="row" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
                      <span className="anno">{i + 1}</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ol>
                <div className="small muted" style={{ marginTop: 'auto' }}>
                  對應：{s.ac}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'ia' && (
        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-head">
              <h2>UF-00 資訊架構與角色可見性</h2>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>頁面</th>
                    {ROLES.map(r => (
                      <th key={r} style={{ background: r === me.role ? 'var(--primary-weak)' : undefined }}>
                        {ROLE_LABEL[r]}
                        {r === me.role ? '（你）' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {IA.map(row => (
                    <tr key={row.page}>
                      <td>
                        <Link to={row.route}>{row.page}</Link>
                      </td>
                      {ROLES.map(r => (
                        <td key={r} className={row.vis[r] === '—' ? 'muted' : ''} style={{ background: r === me.role ? '#f8faff' : undefined }}>
                          {row.vis[r]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card card-pad">
            <h2 style={{ marginBottom: 12 }}>UF-02 各角色畫面流程</h2>
            <div className="stack">
              {ROLES.map(r => (
                <div key={r} className="row wrap" style={{ gap: 6 }}>
                  <b style={{ width: 80 }}>{ROLE_LABEL[r]}</b>
                  {FLOWS[r].map((s, i) => (
                    <span key={i} className="row" style={{ gap: 6 }}>
                      {i > 0 && <span className="muted">→</span>}
                      <span className="chip gray">{s}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
