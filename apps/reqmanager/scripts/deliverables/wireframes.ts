// 網頁框線圖（Wireframe）：S01–S12 全部畫面的低擬真線框，與實作版面一致，
// 每張附編號註解。尺寸以 1440×900 桌面為基準，整張依容器寬度等比例縮放。

import { esc, page } from './common.ts'

const n = (k: number) => `<i class="n">${k}</i>`
const btn = (label: string, kind: 'p' | 's' | 'd' | 'g' | 'x' = 's') => `<span class="b b-${kind}">${esc(label)}</span>`
const chip = (label: string, tone: 'y' | 'b' | 'p' | 'c' | 'o' | 'g' | 'r' | 'n' = 'n') => `<span class="c c-${tone}">${esc(label)}</span>`
const input = (ph: string, cls = '') => `<span class="in ${cls}">${esc(ph)}</span>`
const sel = (ph: string, w = 9) => `<span class="in sel" style="width:${w}em">${esc(ph)}<b>▾</b></span>`
const field = (label: string, body: string, req = false, err = '') => `<div class="f"><span class="fl">${esc(label)}${req ? '<em>*</em>' : ''}</span>${body}${err ? `<span class="fe">${esc(err)}</span>` : ''}</div>`
const card = (title: string, body: string, extra = '', style = '') => `<div class="card" style="${style}">${title ? `<div class="ch">${title}${extra}</div>` : ''}<div class="cb">${body}</div></div>`
const table = (heads: string[], rows: string[][], cols?: string) =>
  `<div class="t" style="--cols:${cols ?? heads.map(() => '1fr').join(' ')}"><div class="tr th">${heads.map(h => `<span>${h}</span>`).join('')}</div>${rows.map(r => `<div class="tr">${r.map(c => `<span>${c}</span>`).join('')}</div>`).join('')}</div>`
const kv = (pairs: [string, string][]) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`

const NAV: Record<string, string[]> = {
  Business: ['工作台', '需求', '客戶'],
  Manager: ['工作台', '需求', '客戶', '報表'],
  PM: ['工作台', '需求', '客戶', '報表', '系統狀態'],
  Dev: ['工作台', '需求'],
  Admin: ['帳號與權限', '系統狀態'],
}

function shell(role: keyof typeof NAV, active: string, user: [string, string], content: string, annoTop = '', annoLive = '') {
  return `<div class="frame">
  <div class="tb"><span class="logo"><i></i>需求管理平台</span>${role === 'Admin' ? '<span style="flex:1"></span>' : `<span class="search">搜尋需求編號、標題或客戶<b>⌕</b></span>`}${annoTop}<span class="bell">🔔<sup>3</sup></span><span class="user"><i>${user[0].slice(0, 1)}</i><span><b>${user[0]}</b><small>${user[1]}</small></span></span></div>
  <div class="shell">
    <nav class="sb">${NAV[role].map(x => `<span class="ni ${x === active ? 'on' : ''}"><i></i>${x}</span>`).join('')}
      <span class="sp"></span><span class="ni ${active === '說明' ? 'on' : ''}"><i></i>說明與回饋</span><span class="live"><i></i>自動更新・每 10 秒<br/>最後檢查 17:49 ⟳ ${annoLive}</span></nav>
    <div class="main">${content}</div>
  </div>
</div>`
}

const overlay = (content: string, caption: string) => `<div class="frame dark"><div class="ov-cap">${esc(caption)}</div><div class="ov">${content}</div></div>`
const dialog = (kicker: string, title: string, sub: string, body: string, foot: string, w = 30) =>
  `<div class="dlg" style="width:${w}em"><div class="k">${esc(kicker)}</div><h4>${esc(title)}</h4><div class="sub">${esc(sub)}</div><div class="db">${body}</div><div class="df">${foot}</div></div>`

interface Screen {
  id: string
  title: string
  route: string
  roles: string
  frame: string
  notes: string[]
  ref: string
}

const SCREENS: Screen[] = [
  {
    id: 'S01', title: '登入', route: '#/login', roles: '全部（未登入）',
    frame: `<div class="frame"><div class="center">
      <div class="login">
        <i class="mark"></i><h3>需求管理平台</h3><p class="mu">集中提交與追蹤產品需求</p>
        <div class="banner r">此帳號已停用，無法登入<br/><small>如有疑問請聯繫你的主管或 IT 服務台。</small> ${n(2)}</div>
        <div class="row">${btn('使用公司帳號登入', 'p').replace('class="b', 'style="flex:1;justify-content:center" class="b')}${n(1)}</div>
        <div class="acct"><span>王小明 <small>Business</small></span><span>林雅婷 <small>PM</small></span><span>張家豪 <small>Developer</small></span><span class="mu">…選擇公司帳號（SSO 模擬）</span></div>
        <hr/><p class="mu sm">僅限公司內部員工使用<br/>帳號或權限問題請聯繫 IT 服務台（分機 1234）</p>
      </div></div></div>`,
    notes: [
      '只提供企業 SSO 登入，不在平台內設密碼；示範環境以「選擇公司帳號」模擬 SSO 回傳身分（D-02 待 IT 確認）。',
      '帳號停用、無角色或驗證失敗時顯示對應訊息，不透露帳號是否存在以外的資訊；紅框只在失敗時出現。',
      '登入成功導向 S02；由通知連結進入時，登入後回到原本要看的頁面（returnTo）。',
      '閒置 30 分鐘自動登出，回到本頁並提示「因閒置 30 分鐘已自動登出」。',
    ],
    ref: 'FR-07・PRD 10.2',
  },
  {
    id: 'S02', title: '我的工作台（登入首頁）', route: '#/', roles: '業務・PM・工程・QA',
    frame: shell('Business', '工作台', ['王小明', 'Business'], `
      <div class="ph"><div><h3>午安，王小明</h3><p class="mu">以下是需要你處理的項目・2026/09/29（Asia/Taipei）</p></div><span class="sp"></span>${n(1)}${btn('＋ 提交需求', 'p')}</div>
      <div class="kpis">${n(2)}${[['待我補件', '2', 'o'], ['待我驗收', '1', 'o'], ['我提交・處理中', '5', ''], ['即將逾期', '1', 'r']].map(([l, v, t]) => `<div class="kpi"><span class="mu">${l}</span><b class="${t}">${v}</b><span class="go">查看 →</span></div>`).join('')}</div>
      <div class="cols" style="grid-template-columns:1fr 17em">
        <div><div class="row"><h4>待我處理</h4><span class="tabs"><u>全部 5</u><span>補件 2</span><span>驗收 1</span><span>即將逾期 1</span></span>${n(3)}</div>
        ${card('', table(['編號', '標題', '狀態', '需要你做的事', '期限'], [
          ['<a>REQ-202609-0003</a>', '報價單折扣上限提醒', chip('待補件', 'y'), '補充資訊：影響客戶數', '<span class="red">09/28・逾期 1 天</span>'],
          ['<a>REQ-202609-0007</a>', '發票號碼重複檢查', chip('待測試', 'c'), '（追蹤）承諾日即將到期', '<span class="red">09/30・剩 1 天</span>'],
          ['<a>REQ-202609-0002</a>', '客戶等級自動升降', chip('待補件', 'y'), '補充資訊：升降級門檻', '10/02'],
          ['<a>REQ-202609-0005</a>', '訂單查詢支援多條件', chip('待業務驗收', 'o'), '執行 UAT', '10/05'],
          ['<a>草稿</a>', '報價單範本支援英文版', chip('草稿'), '完成草稿並提交', '—'],
        ], '9.5em 1.4fr 6em 1.6fr 7.5em'))}</div>
        ${card(`最近更新 ${n(4)}`, ['PM 林雅婷 留言', 'QA 陳志明 測試通過', '工程 張家豪 提交測試版本', 'PM 林雅婷 要求補件'].map(t => `<div class="tl"><i></i><span>${t}<br/><a class="sm">REQ-202609-000x</a><br/><small class="mu">昨天 16:05</small></span></div>`).join(''))}
      </div>`, '', n(6)),
    notes: [
      '主要行動「提交需求」固定在右上；所有角色都可提交，Admin 不顯示並直接導向 S11。',
      '數字卡依角色切換：業務＝待我補件／待我驗收／我提交・處理中／即將逾期；PM＝待評估／待排程／待結案／逾期；工程＝開發中／退回待修正／即將逾期；QA＝待測試／近 7 天已測。點擊卡片直接篩選下方清單。',
      '清單只列「現在輪到我」的需求，「需要你做的事」用動詞寫出下一步；期限剩 2 個工作天內以紅字並寫天數（PRD 7.3）。',
      '右側只顯示與我相關、由他人造成的異動，點擊進入 S07。',
      '空狀態：「目前沒有需要你處理的項目」＋「查看我提交的需求」連結。',
      '左下角顯示自動更新狀態與最後檢查時間，可立即重新整理；資料有異動時畫面自動更新。',
    ],
    ref: 'US-03・PRD 7.3',
  },
  {
    id: 'S03', title: '客戶列表', route: '#/clients', roles: '業務（本人負責；主管全部）・PM',
    frame: shell('Business', '客戶', ['王小明', 'Business'], `
      <div class="ph"><div><h3>客戶</h3><p class="mu">你負責的客戶</p></div><span class="sp"></span>${n(3)}${btn('＋ 新增客戶', 'p')}</div>
      <div class="row">${input('搜尋公司名稱或統一編號', 'w30')}${sel('狀態：全部')}${n(1)}</div>
      ${card('', table(['公司名稱', '統一編號', '產業', '負責業務', '處理中需求', '最近互動', '狀態'], [
        ['<a>大川科技股份有限公司</a>', '12345678', '製造業', '王小明', '3 / 5', '2026/09/28', chip('啟用', 'g')],
        ['<a>北辰精密工業股份有限公司</a>', '87654321', '精密機械', '王小明', '1 / 1', '2026/09/23', chip('啟用', 'g')],
        ['<a>晨光國際有限公司</a>', '11223344', '貿易業', '王小明', '2 / 3', '—', chip('啟用', 'g')],
        ['<a>遠東資訊服務有限公司</a>', '99887766', '資訊服務', '周建宏', '0 / 0', '—', chip('封存')],
      ], '2fr 1fr 1fr 1fr 1fr 1fr 5em'))}${n(2)}
      <div class="float" style="right:2em;bottom:2em;width:26em">${dialog('', '新增客戶', '', `${field('公司名稱', input('大川科技有限公司'), true)}<div class="banner y">可能與既有客戶重複：大川科技股份有限公司。系統不會自動合併。${n(4)}</div><div class="g2">${field('統一編號', input('12345678', 'err'), false, '統一編號已存在，不能重複建立')}${field('負責業務', sel('王小明', 10), true)}</div>`, `${btn('返回修改')}${btn('確認不是同一家，仍要建立', 'p')}`, 26)}</div>`),
    notes: [
      '搜尋比對公司名稱或統一編號；可依狀態（啟用／封存）篩選，條件保留在網址。',
      '只列授權範圍內客戶：業務＝本人負責，業務主管＝全部，PM＝範圍內；工程與 QA 沒有此頁（只在需求中看到公司名）。',
      '新增客戶：公司名稱 1–100 字、統一編號 8 碼數字、負責業務需為啟用中的業務（僅主管可指定他人）。',
      '統編重複不允許建立；名稱相似時提示可能重複，確認後可建立，不自動合併（AC-01B）。',
    ],
    ref: 'FR-01・AC-01A・AC-01B',
  },
  {
    id: 'S04', title: '客戶詳細', route: '#/clients/:id', roles: '業務（範圍內）・PM',
    frame: shell('Manager', '客戶', ['李淑芬', 'Business・主管'], `
      <p class="mu sm"><a>客戶</a> / 大川科技股份有限公司</p>
      <div class="ph"><h3>大川科技股份有限公司</h3>${chip('啟用', 'g')}<span class="sp"></span>${btn('編輯')}${btn('封存', 'd')}${n(4)}</div>
      <div class="banner y">此客戶已封存：不能新增互動或關聯新需求；既有需求照常進行，歷史資料仍可查詢。${n(5)}</div>
      <div class="tabs big"><u>基本資料與聯絡人</u><span>互動紀錄 (2)</span><span>關聯需求 (5)</span>${n(1)}</div>
      <div class="cols" style="grid-template-columns:1fr 1fr 1fr">
        ${card('公司資料', kv([['公司名稱', '大川科技股份有限公司'], ['統一編號', '12345678'], ['產業別', '製造業'], ['負責業務', '王小明'], ['建立日期', '2025/08/25']]))}
        ${card(`聯絡人 ${n(2)}`, `<div class="mini"><b>張志豪</b> <small class="mu">採購主管</small><br/>chang@dachuan.com.tw<br/>📞 0912-345-678</div><div class="mini"><b>李美玲</b> <small class="mu">財務經理</small><br/>l•••@dachuan.com.tw<br/>📞 09xx-xxx-123 <small class="mu">（工程／QA 看到的遮罩）</small></div>`, `<span class="sp"></span>${btn('＋ 新增聯絡人')}`)}
        ${card(`互動紀錄（新到舊）${n(3)}`, `<div class="tl"><i></i><span><b>2026/09/28</b> ${chip('面談')}<br/>客戶確認 Q4 規劃…<br/><small class="blue">下一步：追蹤稅別需求</small></span></div><div class="tl"><i></i><span><b>2026/09/17</b> ${chip('LINE')} ${chip('LINE 同步', 'b')}<br/>客戶反映發票號碼重複…<br/><small class="mu">來源：LINE#msg_9a3f</small></span></div>`, `<span class="sp"></span>${btn('＋ 記錄互動', 'p')}`)}
      </div>`),
    notes: [
      '三個頁籤：基本資料與聯絡人／互動紀錄／關聯需求（只列授權範圍內，另註明隱藏筆數）。',
      '聯絡人電話與 Email 屬敏感欄位：業務、PM 看完整內容；工程、QA 的 API 回應不含這些資料，畫面顯示遮罩（09xx-xxx-123）。',
      '互動紀錄新到舊，記錄者由系統帶入；LINE／Email／ERP API 同步的紀錄標示來源與原始參照。',
      '業務主管可封存／解除封存與變更負責業務；變更後新負責人立即取得存取權（AC-01D）。敏感操作二次確認。',
      '封存後禁止新增互動或關聯新需求，歷史資料仍可查詢（AC-01E）；無權限者用網址存取時回傳「沒有權限查看」且不含資料（AC-01C）。',
    ],
    ref: 'FR-01・AC-01C・AC-01D・AC-01E',
  },
  {
    id: 'S05', title: '需求列表', route: '#/requirements?tab=&status=&type=…', roles: '全部（Admin 除外）',
    frame: shell('Business', '需求', ['王小明', 'Business'], `
      <div class="ph"><h3>需求</h3><span class="sp"></span>${btn('＋ 提交需求', 'p')}</div>
      <div class="tabs big"><span>全部</span><u>我提交的</u><span>指派給我</span><span>我關注的</span>${n(4)}</div>
      <div class="row">${input('搜尋編號或標題 ⌕', 'w20')}${n(1)}${sel('狀態', 7)}${sel('類型', 7)}${sel('優先級', 7)}${sel('負責人', 7)}${sel('承諾日期', 7)}</div>
      <div class="row sm">已套用：${chip('狀態：處理中 ×', 'b')}${chip('類型：功能 ×', 'b')}<a>清除全部</a><span class="sp"></span><span class="mu">共 7 筆・依更新時間排序 ▾</span></div>
      ${card('', table(['編號', '標題', '客戶', '類型', `狀態 ${n(2)}`, '優先級', '目前負責人', `承諾日期 ${n(3)}`, '更新'], [
        ['<a>REQ-202609-0005</a>', '訂單查詢支援多條件', '晨光國際', '功能', chip('待業務驗收', 'o'), '高', '王小明', '10/06', '昨天'],
        ['<a>REQ-202609-0001</a>', '報價單匯出需含稅別欄位', '大川科技、晨光國際', '功能', chip('待評估', 'b'), '—', '林雅婷', '<span class="mu">未設定</span>', '昨天'],
        ['<a>REQ-202609-0007</a>', '發票號碼重複檢查', '大川科技', '缺陷', chip('待測試', 'c'), '緊急', '陳志明', '<span class="red">09/30・剩 1 天</span>', '09/27'],
        ['<a>REQ-202609-0008</a>', '匯率更新排程失敗', '（內部）', '缺陷', chip('開發中', 'p'), '緊急', '張家豪', '<span class="red">09/26・逾期 3 天</span>', '09/24'],
        ['<a>REQ-202609-0002</a>', '客戶等級自動升降', '北辰精密', '改善', chip('待補件', 'y'), '—', '王小明', '<span class="mu">未設定</span>', '09/25'],
      ], '9.5em 1.6fr 1.2fr 3em 6.5em 3.5em 5em 8em 3.5em'))}${n(5)}`),
    notes: [
      '搜尋比對編號、標題與客戶名稱；篩選條件以標籤顯示，可逐一移除或「清除全部」。條件保留在網址，進入詳細頁再返回不重置（AC-04B）。',
      '狀態一律「文字＋顏色」，不單靠顏色辨識（PRD 10.1）。',
      '承諾日期：逾期或剩 2 個工作天內以紅字並寫出天數；未設定顯示灰字。',
      '頁籤：業務預設「我提交的」；PM、工程、QA 預設「指派給我」。列表只含授權範圍內資料（AC-04A）。',
      '無結果顯示「找不到符合條件的需求」＋「清除篩選」；每頁 20 筆，可依更新時間／承諾日期／編號排序。',
    ],
    ref: 'FR-04・AC-04A・AC-04B',
  },
  {
    id: 'S06', title: '提交需求', route: '#/requirements/new', roles: '全部（Admin 除外）',
    frame: shell('Business', '需求', ['王小明', 'Business'], `
      <div class="narrow">
      <p class="mu sm"><a>需求</a> / 提交需求</p>
      <div class="ph"><div><h3>提交需求</h3><p class="mu">完整填寫一次送出，減少來回補件。期望日期僅供參考，不代表承諾。</p></div><span class="sp"></span><span class="mu sm">草稿已自動儲存 17:52 ${n(3)}</span></div>
      <div class="card"><div class="steps">${['基本資訊', '需求描述', '影響與客戶', '確認提交'].map((s, i) => `<span class="${i < 1 ? 'done' : i === 1 ? 'cur' : ''}"><i></i>${i + 1}. ${s}</span>`).join('')}</div>${n(1)}</div>
      ${card('', `<div class="banner r">請完成必填欄位後再提交<br/><small>共 2 個欄位需要修正，已在欄位下方標示。已輸入的內容都保留。</small>${n(2)}</div>
        ${field('目前遇到的問題', `<span class="ta">業務每月需逐筆匯出…</span>`, true, '問題描述至少 10 字')}
        ${field('預期結果', `<span class="ta err"></span>`, true, '預期結果至少 10 字')}
        <div class="row" style="border-top:1px solid #eaecf0;padding-top:.8em"><span class="mu">刪除草稿</span><span class="sp"></span>${btn('← 上一步')}${btn('下一步 →', 'p')}${n(4)}</div>`)}
      </div>`),
    notes: [
      '分段表單：①基本資訊（標題 1–100 字、類型、受理 PM 依專案預設帶入、期望日期需晚於今日）②需求描述（問題、預期結果各 10–2,000 字）③影響與客戶（影響範圍＋描述、急迫性＋原因、關聯客戶多選，只列授權且未封存）④確認提交。',
      '缺必填欄位時不建立需求：就地標示缺漏欄位並跳到第一個有錯的段落，已輸入內容保留（AC-02A）。前後端使用同一套檢核規則。',
      '輸入後 1.5 秒自動儲存草稿；草稿僅提出人可見，保留 30 天未提交會提醒。',
      '提交時帶 Idempotency-Key，網路重試只建立一筆（AC-02B）；成功頁顯示 REQ-YYYYMM-NNNN，狀態為待評估，受理 PM 收到通知（AC-02D）。同一表單也用於「補充資訊」（待補件時必填本次補充說明）。',
    ],
    ref: 'FR-02・AC-02A～AC-02D',
  },
  {
    id: 'S07', title: '需求詳細（PM 視角・待評估）', route: '#/requirements/:id', roles: '範圍內所有角色',
    frame: shell('PM', '需求', ['林雅婷', 'PM'], `
      <p class="mu sm"><a>需求</a> / REQ-202609-0001</p>
      <div class="ph"><h3>報價單匯出需含稅別欄位</h3>${chip('待評估', 'b')}${chip('功能')}<span class="sp"></span>${n(1)}${btn('不採納', 'd')}${btn('要求補件')}${btn('接受', 'p')}${btn('⋯')}</div>
      <div class="card"><div class="steps">${['提交', '評估', '排程', '開發', '測試', '業務驗收', '結案'].map((s, i) => `<span class="${i < 1 ? 'done' : i === 1 ? 'cur' : ''}"><i></i>${s}</span>`).join('')}</div>${n(2)}</div>
      <div class="banner b">下一步：由受理 PM 林雅婷評估。提交後已 1 個工作天，建議在 10/01 前完成。${n(3)}</div>
      <div class="cols" style="grid-template-columns:1fr 18em">
        <div>${card(`<span class="tabs"><u>需求內容</u><span>評估與測試紀錄</span><span>編輯紀錄</span></span>`, `<b class="sm">目前遇到的問題</b><p>客戶匯出報價單後需手動補稅別…</p><b class="sm">預期結果</b><p>匯出的 Excel 報價單要有「稅別」欄…</p><b class="sm">影響範圍</b><p>多客戶｜3 家客戶每月約 40 張</p>`)}
        ${card('留言 2', `<div class="mini"><b>王小明</b> <small class="mu">Business・昨天 15:40</small><br/>客戶補充：只有 B2B 報價需要。</div><div class="mini"><b>林雅婷</b> <small class="mu">PM・昨天 16:05</small><br/><a>@王小明</a> 請確認是否回溯舊報價單。</div>${input('輸入留言，使用 @ 提及同事…', 'w100')}`)}</div>
        <div>${card('資訊', kv([['提出人', '王小明'], ['受理 PM', '林雅婷'], ['開發負責人', '—'], ['業務驗收者', '王小明'], ['關聯客戶', '大川科技、晨光國際'], ['承諾日期', '<span class="mu">未設定</span>']]))}
        ${card(`狀態時間軸 ${n(4)}`, `<div class="tl"><i class="on"></i><span>${chip('待評估', 'b')} ← 草稿<br/><small class="mu">王小明・09/28 10:12</small></span></div><div class="tl"><i></i><span>${chip('草稿')}<br/><small class="mu">王小明・09/28 09:05</small></span></div>`)}</div>
      </div>${n(5)}`),
    notes: [
      '頁首按鈕依「角色 × 狀態」只露出此刻合法的操作（PRD 7.2）：待評估的 PM 看到接受／要求補件／不採納；「⋯」內有關注、複製連結、標記重複、改派受理 PM。業務在待補件時只看到「補充資訊」；工程在開發中看到「提交測試版本」；QA 看到「記錄測試結果」。後端再檢查一次。',
      '七階段進度條；不採納／已取消時改為灰色並標示結束原因。',
      '「下一步」橫幅用一句話寫出誰要做什麼、期限何時（US-03）；逾期時改為紅色。',
      '時間軸記錄每一次狀態與承諾日期異動，含操作者、時間、前後狀態與理由，不可刪改（AC-04C）。',
      '同時編輯衝突時，送出會被擋下並提示重新載入（見 S12）；留言可 @提及同事並通知對方，15 分鐘內可編輯、不可刪除。',
    ],
    ref: 'FR-04・AC-04C・PRD 7.2／7.4',
  },
  {
    id: 'S08', title: '評估與指派（對話框）', route: 'S07 上的對話框', roles: '受理 PM',
    frame: overlay(`<div class="row top">
      ${dialog('S08-A', '接受需求', 'REQ-202609-0001 報價單匯出需含稅別欄位', `<b class="sm">評估計分（1–3 分，僅供排序參考）${n(1)}</b>
        ${['影響範圍', '急迫性', '策略價值', '技術成本（小＝3）'].map((d, i) => `<div class="row"><span style="flex:1">${d}</span><span class="seg">${[1, 2, 3].map(k => `<span class="${k === [2, 2, 1, 3][i] ? 'on' : ''}">${k}</span>`).join('')}</span></div>`).join('')}
        <div class="right b7">合計 8 / 12</div>
        <div class="g2">${field('優先級', sel('高', 11), true)}${field('技術初估（選填）', input('約 3 人天'))}</div>
        ${field('評估說明', `<span class="ta">影響 3 家 B2B 客戶…</span>`, true)}
        <div class="banner gr sm">接受後狀態變為「待排程」並通知提出人；接受不代表立即開發。</div>`, `${btn('取消')}${btn('確認接受', 'p')}`, 26)}
      ${dialog('S08-B', '開始開發', '狀態：待排程 → 開發中', `<div class="g2">${field('開發負責人', sel('張家豪', 11), true)}${field('承諾日期', input('2026/10/24'), true)}</div>
        ${field('驗收條件（AC）', `<span class="ta err">1. 匯出報價單含「稅別」欄<br/>2. <span class="mu">輸入下一條…</span></span>`, true, '至少需要 2 條可驗證的驗收條件')}
        <div class="g2">${field('業務驗收者', sel('王小明', 11), true)}<span class="chk">☑ 技術負責人已確認可行性</span></div>
        <div class="banner y"><b>尚缺：驗收條件</b> ${n(3)}<br/><small>開發負責人、承諾日期、驗收條件、技術確認四項齊全才能開始開發（AC-03C）</small></div>`, `${btn('取消')}${btn('開始開發', 'x')}`, 27)}
      ${dialog('S08-C', '要求補件', 'REQ-202609-0001', `${field('需要補充的資訊', `<span class="ta err"></span>`, true, '請填寫需要補充的資訊')}<div class="banner gr sm">送出後狀態變為「待補件」並通知提出人。</div>${n(4)}<br/><br/><b class="sm">變更承諾日期 ${n(2)}</b>${field('新的承諾日期', input('2026/10/31'), true)}${field('變更原因', `<span class="ta"></span>`, true)}`, `${btn('取消')}${btn('送出', 'x')}`, 19)}
    </div>`, '對話框疊在 S07 需求詳細之上（背景以深灰遮罩表示）'),
    notes: [
      '計分為排序參考，不自動決定優先級；優先級（緊急／高／一般／低）與評估說明必填，寫入評估紀錄供日後追溯（FR-03）。',
      '承諾日期變更另開對話框，必填變更原因；時間軸顯示新舊日期並通知提出人（AC-03D）。',
      '條件不齊全時主要按鈕停用，並在按鈕上方明確列出「尚缺」哪些項目，不只是反灰；後端也再檢查一次。',
      '「要求補件」「不採納」「撤回」「重新開啟」「取消」使用同一個精簡對話框：只有必填原因欄位＋確認按鈕（AC-03A）。非受理 PM 送出會被後端拒絕並寫入稽核（AC-03B）。',
    ],
    ref: 'FR-03・AC-03A～AC-03D',
  },
  {
    id: 'S09', title: '測試與驗收（右側抽屜）', route: 'S07 右側操作抽屜', roles: 'QA・業務驗收者・受理 PM',
    frame: overlay(`<div class="row top">
      ${dialog('S09-A・QA', '記錄測試結果', 'REQ-202609-0007', `${field('測試版本', input('v2.14.0-rc3'), true)}${table(['案例', '結果'], [['TC-01 重複號碼無法儲存', chip('通過', 'g')], ['TC-02 提示含原單據編號', chip('失敗', 'r')]], '1fr 4em')}${n(1)}${field('缺陷連結', input('BUG-882 零稅率顯示為空白'), true)}${field('測試證據', input('截圖或測試報告連結'))}`, `${btn('測試通過，送業務驗收', 'x')}${btn('測試失敗，退回開發', 'd')}<small class="mu">有失敗案例時「通過」按鈕停用</small>`, 20)}
      ${dialog('S09-B・業務驗收者', '業務驗收（UAT）', '請用實際工作情境逐項確認：', `<div class="mini">☑ 可同時套用 4 種條件</div><div class="mini">☑ 查詢結果 2 秒內回應</div><div class="mini">☐ 條件可儲存為常用查詢</div>${n(2)}<b class="sm">結果</b><div class="row">○ 通過 ◉ 退回</div>${field('退回原因', `<span class="ta err"></span>`, true, '選擇退回時必填')}<div class="banner gr sm">退回後由 PM 判斷是缺陷（退回開發）或新範圍（另建需求）。</div>`, btn('送出驗收結果', 'p'), 20)}
      ${dialog('S09-C・PM', '結案', 'REQ-202609-0005', `<b class="sm">結案前檢查 ${n(3)}</b><div class="row"><span class="ok">✓</span> QA 測試通過<span class="sp"></span><small class="mu">09/28 陳志明</small></div><div class="row"><span class="ok">✓</span> 業務驗收通過<span class="sp"></span><small class="mu">09/29 王小明</small></div><div class="row"><span class="bad">!</span> 交付證據<span class="sp"></span><small class="red">尚未提供</small></div>${field('交付版本', input('例：v2.14.0'), true)}${field('上線日期', input('2026/10/03'))}${field('備註（選填）', input('給提出人的說明'))}`, `${btn('確認結案', 'x')}<small class="mu">三項檢查皆完成才可結案（AC-05C）</small>`, 20)}
    </div>`, '以下三個面板是 S07 需求詳細右側的操作抽屜，依角色與狀態出現'),
    notes: [
      'QA 每個案例記錄結果與證據；任一失敗必須關聯缺陷，送出後需求回到「開發中」並通知開發與 PM，前次紀錄保留不覆寫（AC-05A）。',
      '只有被指定的業務驗收者看得到此面板（AC-05B）；檢查清單直接來自 S08-B 的驗收條件，全部勾選才可選「通過」。',
      '結案檢查清單三項齊全才能結案，缺項以紅字指出（AC-05C）；結案後通知提出人、工程、QA。',
      '已結案的需求在「⋯」提供「重新開啟」，必填原因並保留原結案與驗收紀錄，回到待評估另起新一輪（AC-05D）。',
    ],
    ref: 'FR-05・AC-05A～AC-05D',
  },
  {
    id: 'S10', title: '管理報表', route: '#/reports', roles: 'PM・業務主管',
    frame: shell('PM', '報表', ['林雅婷', 'PM'], `
      <div class="ph"><div><h3>報表</h3><p class="mu">統計與明細使用相同權限範圍（AC-06B）</p></div></div>
      <div class="tabs big"><u>管理報表</u><span>時間軸</span><span>現金流試算</span>${n(4)}</div>
      <div class="card"><div class="cb row">日期區間 ${input('2026/08/31')} – ${input('2026/09/29')} ${btn('近 7 天')}${btn('近 30 天')}${sel('類型：全部')}${sel('負責人：全部')}<span class="sp"></span>${btn('⟳ 重新整理')}${n(1)}</div></div>
      <p class="mu sm">2026/08/31–2026/09/29・時區 Asia/Taipei・最後更新 17:49・範圍內需求 12 筆 ${n(3)}</p>
      <div class="kpis">${[['新增需求量', '10 筆', '期間內首次提交'], ['目前逾期', '1 筆', '查詢當下'], ['評估耗時（中位數）', '1.5 工作天', '樣本 6'], ['交付週期（中位數）', '無資料', '樣本 0']].map(([l, v, s]) => `<div class="kpi"><span class="mu">${l}</span><b>${v}</b><span class="go">${s}・明細 →</span></div>`).join('')}${n(2)}</div>
      <div class="cols" style="grid-template-columns:1fr 1fr 1fr">${['狀態分布', '類型分布', '優先級分布'].map(t => card(t, [70, 40, 90, 30].map(w => `<div class="bar"><span>項目</span><i style="width:${w}%"></i><a>${Math.round(w / 15)}</a></div>`).join(''))).join('')}</div>
      ${card('每週新增 vs 結案', `<div class="chart">${[3, 1, 4, 2, 3].map((v, i) => `<span><i style="height:${v * 22}%"></i><i class="o" style="height:${[1, 0, 1, 0, 2][i] * 22}%"></i></span>`).join('')}</div>`)}`),
    notes: [
      '篩選：日期區間（預設最近 30 天）、類型、負責人；點擊指標或分布數字下鑽到明細清單，可再開到需求列表。',
      '指標口徑依 FR-06：新增量（首次提交，取消仍計入）、目前逾期（無承諾日期不算）、評估耗時與交付週期（工作天中位數＋樣本數，另列重新開啟數）。',
      '頁面顯示日期區間、時區、最後更新時間與樣本數；無資料時顯示「無資料」而非 0%（AC-06C）。資料異動時自動更新。',
      '另有「時間軸」（Gantt，逾期以紅色與文字標示）與「現金流試算」（可直接編輯儲存格，淨額與累計即時計算，儲存後他人畫面自動更新）。',
    ],
    ref: 'FR-06・AC-06A～AC-06C',
  },
  {
    id: 'S11', title: '帳號與權限', route: '#/admin/users', roles: 'Admin（稽核：IT／資安）',
    frame: shell('Admin', '帳號與權限', ['系統管理員', 'Admin'], `
      <div class="ph"><div><h3>帳號與權限</h3><p class="mu">功能權限與資料範圍分開控制；後端每次請求都會再檢查。</p></div></div>
      <div class="tabs big"><u>帳號</u><span>權限矩陣</span><span>稽核紀錄</span>${n(3)}</div>
      <div class="row">${input('搜尋姓名、Email、部門', 'w20')}<span class="sp"></span>${btn('＋ 開立帳號', 'p')}${n(1)}</div>
      ${card('', table(['姓名', 'Email', '角色', '部門', '最後登入', '狀態', ''], [
        ['王小明', 'wang@company.tw', chip('業務'), '業務一部', '昨天', chip('啟用', 'g'), '<a>編輯</a> ' + btn('停用', 'd')],
        ['李淑芬', 'lee@company.tw', chip('業務・主管'), '業務一部', '昨天', chip('啟用', 'g'), '<a>編輯</a> ' + btn('停用', 'd')],
        ['林雅婷', 'lin@company.tw', chip('PM'), '產品部', '剛剛', chip('啟用', 'g'), '<a>編輯</a> ' + btn('停用', 'd')],
        ['吳國華', 'wu@company.tw', chip('業務'), '業務一部', '08/20', chip('停用', 'r'), '<a>編輯</a> ' + btn('啟用')],
      ], '1fr 1.4fr 1fr 1fr 1fr 1fr 1.2fr'))}
      <div class="float" style="right:2em;bottom:2em;width:24em">${dialog('', '停用 周建宏？', '', `<div class="banner y sm">停用後新登入與既有登入皆無法取得資料；歷史紀錄保留原操作者姓名。未結需求請 PM 於 2 個工作天內轉派。${n(2)}</div>`, `${btn('取消')}${btn('確認停用', 'd')}`, 24)}</div>`),
    notes: [
      '開立帳號：姓名、公司 Email（唯一）、角色、部門；業務可加上「主管範圍」。一位使用者一個主要角色。',
      '停用與角色變更屬敏感變更，需二次確認；停用後新登入與既有登入立即失效，歷史紀錄保留（PRD 6.3）。HR 在職名單同步時，離職者自動停用。',
      '權限矩陣頁籤列出 PRD 6.1 全部規則；稽核紀錄記錄登入、指派、權限變更、狀態變更、拒絕的越權嘗試，僅可新增。',
    ],
    ref: 'FR-07・PRD 6.1／6.3',
  },
  {
    id: 'S12', title: '系統狀態', route: '#/system', roles: 'Admin・PM（整合與排程）',
    frame: shell('Admin', '系統狀態', ['系統管理員', 'Admin'], `
      <div class="ph"><div><h3>系統狀態</h3><p class="mu">API 串接、自動化更新與資料管理</p></div></div>
      <div class="tabs big"><u>API 與自動更新</u><span>外部整合與排程</span><span>資料管理</span><span>狀態畫面</span></div>
      <div class="cols" style="grid-template-columns:1fr 1fr">
        ${card(`API 串接 ${n(1)}`, `<div class="mini">◉ <b>瀏覽器內建 API</b><br/><small class="mu">同一份 REST 合約，資料存於此瀏覽器</small></div><div class="mini">○ <b>遠端 REST API 伺服器</b><br/>${input('http://localhost:8787', 'w100')}</div>${field('自動更新頻率', sel('每 10 秒檢查資料版本', 16))}<div class="row"><span class="sp"></span>${btn('測試連線')}${btn('套用', 'p')}</div>${n(2)}`)}
        <div>${card(`外部 API 同步 ${n(3)}`, table(['名稱', '自動同步', '結果', ''], [['ERP 客戶主檔', '每 5 分鐘', '<span class="okt">✓ 新增 1、更新 1</span>', btn('立即同步')], ['HR 在職名單', '每 30 分鐘', '<span class="okt">✓ 停用 0</span>', btn('立即同步')]], '1.2fr 1fr 1.4fr 6em'))}
        ${card(`狀態畫面 ${n(4)}`, `<div class="cols" style="grid-template-columns:1fr 1fr 1fr;gap:.5em"><div class="state">∅<br/><b>找不到符合條件的需求</b><br/>${btn('清除篩選')}</div><div class="state">🔒<br/><b>沒有權限查看</b></div><div class="state">!<br/><b>讀取失敗</b><br/>${btn('重試')}</div></div><div class="banner y sm">⟳ 這筆資料已被其他人更新，請重新載入後再送出。 ${btn('重新載入')}</div>`)}</div>
      </div>`),
    notes: [
      'API 模式：瀏覽器內建（GitHub Pages 展示、可用性測試）或遠端 REST API 伺服器（多人共用）；兩者 API 合約與規則完全相同，切換後重新登入。',
      '自動更新頻率 5／10／30／60 秒或關閉：只比對資料版本號，有變更才重新抓取；視窗取得焦點與同瀏覽器其他分頁寫入時立即更新。',
      '外部 API 同步：ERP 客戶主檔（依統編去重、不自動覆蓋名稱相似者）與 HR 在職名單（離職即停用）；另有時限提醒排程（PRD 7.3）與執行紀錄。Admin 可匯出／匯入 JSON 手動編輯、重置示範資料。',
      '全站共用的三種狀態畫面：無資料、無權限、讀取失敗，以及同時修改衝突提示（PRD 10.1、7.4）。',
    ],
    ref: 'PRD 10.1・10.2',
  },
]

const CSS = `
.canvas-wrap { container-type: inline-size; }
.frame { position: relative; width: 100%; aspect-ratio: 1440 / 900; background: #f5f6f8; border: 1px solid #d0d5dd; border-radius: 6px; overflow: hidden; font-size: 1.12cqw; line-height: 1.45; color: #1d2939; box-shadow: 0 1px 3px rgba(16,24,40,.08); }
.frame * { box-sizing: border-box; }
.frame .n { width: 1.7em; height: 1.7em; font-size: .85em; vertical-align: middle; margin: 0 .3em; }
.frame h3 { margin: 0; font-size: 1.7em; }
.frame h4 { margin: 0; font-size: 1.35em; }
.frame p { margin: .2em 0; }
.frame a { color: #2f6fed; text-decoration: none; }
.mu { color: #667085; } .sm { font-size: .88em; } .red { color: #d92d20; } .blue { color: #2f6fed; } .okt { color: #067647; } .b7 { font-weight: 700; } .right { text-align: right; }
.tb { height: 4em; background: #fff; border-bottom: 1px solid #eaecf0; display: flex; align-items: center; gap: 1em; padding: 0 1.4em; }
.logo { display: flex; align-items: center; gap: .6em; font-weight: 700; font-size: 1.15em; width: 14.2em; }
.logo i { width: 1.6em; height: 1.6em; border-radius: .4em; background: #1d2939; display: inline-block; }
.search { flex: 0 1 30em; margin: 0 auto; height: 2.6em; border: 1px solid #d0d5dd; border-radius: .4em; display: flex; align-items: center; justify-content: space-between; padding: 0 .9em; color: #98a2b3; }
.bell { position: relative; width: 2.6em; height: 2.6em; border: 1px solid #eaecf0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .9em; }
.bell sup { position: absolute; top: -.3em; right: -.3em; background: #d92d20; color: #fff; border-radius: 1em; font-size: .75em; padding: 0 .4em; }
.user { display: flex; align-items: center; gap: .5em; } .user > i { width: 2.3em; height: 2.3em; border-radius: 50%; background: #e4e7ec; display: flex; align-items: center; justify-content: center; font-style: normal; font-weight: 700; color: #475467; }
.user b { display: block; font-size: .95em; } .user small { color: #667085; font-size: .78em; }
.shell { display: flex; height: calc(100% - 4em); }
.sb { width: 15.3em; background: #fff; border-right: 1px solid #eaecf0; padding: 1.1em .8em; display: flex; flex-direction: column; gap: .3em; }
.ni { display: flex; align-items: center; gap: .8em; padding: .7em 1em; border-radius: .55em; color: #475467; }
.ni i { width: 1.1em; height: 1.1em; border-radius: .25em; background: #e4e7ec; }
.ni.on { background: #eaf1fe; color: #2f6fed; font-weight: 500; } .ni.on i { background: #2f6fed; }
.sp { flex: 1; }
.live { font-size: .78em; color: #667085; border-top: 1px solid #eaecf0; padding: .8em 1em 0; } .live i { display: inline-block; width: .7em; height: .7em; border-radius: 50%; background: #12b76a; margin-right: .4em; }
.main { flex: 1; min-width: 0; padding: 1.8em 2.2em; display: flex; flex-direction: column; gap: 1em; overflow: hidden; position: relative; }
.narrow { max-width: 60em; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 1em; }
.ph { display: flex; align-items: center; gap: .7em; }
.row { display: flex; align-items: center; gap: .6em; flex-wrap: wrap; } .row.top { align-items: flex-start; flex-wrap: nowrap; justify-content: center; gap: 1em; }
.cols { display: grid; gap: 1em; align-items: start; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: .8em; align-items: end; }
.b { display: inline-flex; align-items: center; height: 2.5em; padding: 0 1.1em; border-radius: .4em; border: 1px solid #d0d5dd; background: #fff; font-weight: 500; white-space: nowrap; font-size: .95em; }
.b-p { background: #2f6fed; border-color: #2f6fed; color: #fff; } .b-d { color: #d92d20; border-color: #fda29b; } .b-x { background: #eaecf0; border-color: #eaecf0; color: #98a2b3; }
.c { display: inline-flex; align-items: center; height: 1.6em; padding: 0 .6em; border-radius: 1em; font-size: .82em; font-weight: 500; white-space: nowrap; background: #f2f4f7; color: #475467; }
.c-y { background: #fef0c7; color: #b54708; } .c-b { background: #e8f0fe; color: #1d4ed8; } .c-p { background: #f4ebff; color: #6941c6; } .c-c { background: #cff9fe; color: #0e7090; } .c-o { background: #ffe6d5; color: #c4320a; } .c-g { background: #dcfae6; color: #067647; } .c-r { background: #fee4e2; color: #b42318; }
.in { display: inline-flex; align-items: center; justify-content: space-between; height: 2.6em; border: 1px solid #d0d5dd; border-radius: .4em; background: #fff; padding: 0 .8em; color: #98a2b3; white-space: nowrap; font-size: .95em; }
.in.w20 { width: 20em; } .in.w30 { width: 30em; } .in.w100 { width: 100%; } .in.err, .ta.err { border-color: #d92d20; } .in b { color: #667085; font-weight: 400; }
.ta { display: block; min-height: 4.2em; border: 1px solid #d0d5dd; border-radius: .4em; background: #fff; padding: .6em .8em; color: #475467; }
.f { display: flex; flex-direction: column; gap: .3em; } .fl { font-size: .88em; font-weight: 500; color: #475467; } .fl em { color: #d92d20; font-style: normal; } .fe { font-size: .82em; color: #d92d20; }
.card { background: #fff; border: 1px solid #eaecf0; border-radius: .6em; position: relative; }
.cb.row { flex-direction: row; align-items: center; }
.ch { display: flex; align-items: center; gap: .5em; padding: .9em 1.2em; border-bottom: 1px solid #eaecf0; font-weight: 700; font-size: 1.05em; }
.cb { padding: .9em 1.2em; display: flex; flex-direction: column; gap: .6em; }
.t { font-size: .92em; } .tr { display: grid; grid-template-columns: var(--cols); gap: .6em; padding: .75em .3em; border-bottom: 1px solid #eaecf0; align-items: center; } .tr:last-child { border-bottom: none; }
.tr.th { background: #f9fafb; font-weight: 700; color: #475467; font-size: .9em; padding: .6em .3em; } .tr > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1em; position: relative; }
.kpis > .n { position: absolute; left: -1.2em; top: -.8em; }
.kpi { background: #fff; border: 1px solid #eaecf0; border-radius: .6em; padding: 1em 1.2em; display: flex; flex-direction: column; gap: .2em; }
.kpi b { font-size: 2em; line-height: 1.1; } .kpi b.o { color: #b54708; } .kpi b.r { color: #d92d20; } .kpi .go { color: #2f6fed; font-size: .82em; text-align: right; }
.tabs { display: inline-flex; gap: 1.3em; color: #475467; margin-left: 1em; } .tabs u { color: #2f6fed; text-decoration: none; font-weight: 700; border-bottom: 2px solid #2f6fed; padding-bottom: .3em; }
.tabs.big { margin-left: 0; border-bottom: 1px solid #eaecf0; padding-bottom: .5em; display: flex; }
.tl { display: flex; gap: .7em; padding-bottom: .7em; font-size: .92em; } .tl > i { width: .75em; height: .75em; border-radius: 50%; background: #d0d5dd; margin-top: .35em; flex-shrink: 0; } .tl > i.on, .cb .tl:first-child > i { background: #2f6fed; }
.kv { display: grid; grid-template-columns: 6em 1fr; gap: .55em .8em; margin: 0; font-size: .92em; } .kv dt { color: #667085; } .kv dd { margin: 0; }
.mini { border: 1px solid #eaecf0; border-radius: .45em; padding: .6em .8em; font-size: .9em; }
.steps { display: flex; padding: 1.2em 1.5em .9em; } .steps span { flex: 1; display: flex; flex-direction: column; align-items: center; gap: .4em; color: #667085; font-size: .9em; position: relative; }
.steps span i { width: 1.4em; height: 1.4em; border-radius: 50%; border: 2px solid #d0d5dd; background: #fff; z-index: 1; }
.steps span::before { content: ''; position: absolute; top: .65em; left: -50%; width: 100%; height: 2px; background: #d0d5dd; } .steps span:first-child::before { display: none; }
.steps .done, .steps .cur { color: #2f6fed; } .steps .done i { background: #2f6fed; border-color: #2f6fed; } .steps .cur i { border-color: #2f6fed; box-shadow: inset 0 0 0 .25em #fff, inset 0 0 0 1em #2f6fed; } .steps .done::before, .steps .cur::before { background: #2f6fed; } .steps .cur { font-weight: 700; }
.card > .n { position: absolute; right: .6em; top: .6em; }
.banner { border-radius: .55em; padding: .75em 1em; font-size: .95em; } .banner.b { background: #eaf1fe; color: #1d4ed8; } .banner.y { background: #fef0c7; color: #93370d; } .banner.r { background: #fef3f2; color: #b42318; border: 1px solid #fecdca; } .banner.gr { background: #f2f4f7; color: #475467; }
.seg { display: inline-flex; gap: .25em; } .seg span { width: 3.6em; height: 2.2em; border: 1px solid #d0d5dd; border-radius: .35em; display: flex; align-items: center; justify-content: center; font-weight: 700; } .seg .on { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.chk { font-size: .92em; padding-bottom: .6em; }
.bar { display: grid; grid-template-columns: 4em 1fr 1.5em; gap: .6em; align-items: center; font-size: .85em; } .bar i { height: .9em; background: #2a78d6; border-radius: .25em; display: block; } .bar a { font-weight: 700; text-align: right; }
.chart { display: flex; align-items: flex-end; justify-content: space-around; height: 7em; border-bottom: 1px solid #eaecf0; } .chart span { display: flex; align-items: flex-end; gap: .2em; height: 100%; } .chart i { width: 1.4em; background: #2a78d6; border-radius: .25em .25em 0 0; display: block; } .chart i.o { background: #eb6834; }
.state { border: 1px dashed #d0d5dd; border-radius: .45em; text-align: center; padding: .6em; font-size: .85em; }
.ok { width: 1.5em; height: 1.5em; border-radius: 50%; background: #ecfdf3; color: #067647; display: inline-flex; align-items: center; justify-content: center; } .bad { width: 1.5em; height: 1.5em; border-radius: 50%; background: #fef3f2; color: #d92d20; display: inline-flex; align-items: center; justify-content: center; }
.float { position: absolute; z-index: 5; } .float .dlg { box-shadow: 0 1em 3em rgba(16,24,40,.3); border: 1px solid #d0d5dd; }
.center { display: flex; align-items: center; justify-content: center; height: 100%; }
.login { width: 32em; background: #fff; border: 1px solid #eaecf0; border-radius: .6em; padding: 2.4em 2.6em 1.8em; text-align: center; display: flex; flex-direction: column; gap: .9em; }
.login .mark { width: 3.3em; height: 3.3em; border-radius: .8em; background: #1d2939; margin: 0 auto; display: block; } .login hr { border: none; border-top: 1px solid #eaecf0; width: 100%; margin: .4em 0; } .login .banner { text-align: left; }
.acct { border: 1px dashed #d0d5dd; border-radius: .5em; display: flex; flex-direction: column; text-align: left; font-size: .9em; } .acct span { padding: .45em .9em; border-bottom: 1px solid #eaecf0; } .acct span:last-child { border-bottom: none; }
.frame.dark { background: #475467; } .ov-cap { color: #e4e7ec; padding: 1.6em 2em 0; font-size: .95em; } .ov { padding: 1.4em 2em; height: calc(100% - 3.4em); overflow: hidden; }
.dlg { background: #fff; border-radius: .8em; padding: 1.5em 1.7em; display: flex; flex-direction: column; gap: .35em; flex-shrink: 0; }
.dlg .k { color: #2f6fed; font-weight: 700; font-size: .82em; } .dlg h4 { font-size: 1.35em; } .dlg .sub { color: #667085; font-size: .88em; }
.dlg .db { display: flex; flex-direction: column; gap: .65em; margin: .7em 0; } .dlg .df { display: flex; justify-content: flex-end; gap: .5em; flex-wrap: wrap; align-items: center; margin-top: auto; }
.intro { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 24px; }
.intro div { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; font-size: 14px; }
.intro b { display: block; margin-bottom: 4px; }
`

export function renderWireframes(): string {
  const body = `
<div class="intro">
  <div><b>範圍</b>S01–S12 全部 12 張畫面（PRD 10.1 主要頁面 + 登入與系統狀態），版面與實作一致。</div>
  <div><b>讀法</b>左側為 1440×900 桌面線框（依寬度等比例縮放），右側為編號註解；<i class="n">1</i> 對應畫面上的橘色圓點。</div>
  <div><b>視覺規則</b>狀態一律「文字＋顏色」、表單錯誤就地提示、區分無資料／無權限／讀取失敗、日期 YYYY/MM/DD、Asia/Taipei。</div>
  <div><b>實際操作</b>每張畫面都可在網站的對應路由操作，路由標在標題右側。</div>
</div>
${SCREENS.map(s => `<section class="sheet" id="${s.id}">
  <div class="sheet-head"><span class="id">${s.id}</span><h2>${esc(s.title)}</h2><span class="meta">路由 <code>${esc(s.route)}</code>・${esc(s.roles)}</span></div>
  <div class="sheet-body">
    <div class="canvas-wrap">${s.frame}</div>
    <div class="notes"><ol>${s.notes.map((t, i) => `<li><i class="n">${i + 1}</i><span>${esc(t)}</span></li>`).join('')}</ol><div class="ref">對應：${esc(s.ref)}</div></div>
  </div>
</section>`).join('\n')}
<section class="sheet"><div class="legend-row">
  <span>${chip('草稿')}${chip('待評估', 'b')}${chip('待補件', 'y')}${chip('待排程', 'b')}${chip('開發中', 'p')}${chip('待測試', 'c')}${chip('待業務驗收', 'o')}${chip('已結案', 'g')}</span>
  <span><span class="b b-p">主要操作</span><span class="b">次要操作</span><span class="b b-d">危險操作</span><span class="b b-x">條件不齊（停用）</span></span>
</div></section>`
  return page(
    '需求管理平台｜網頁框線圖（Wireframe）',
    'PRD v0.3・S01–S12・1440×900 桌面版・版面與已實作網站一致',
    SCREENS.map(s => ({ id: s.id, label: `${s.id} ${s.title.replace(/（.*）/, '')}` })),
    body,
    CSS,
  )
}
