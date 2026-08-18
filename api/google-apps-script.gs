/**
 * GOAMAZING 購精彩 —— 諮詢表單收件 API（Google Apps Script）
 *
 * 用途：讓網頁的「送出諮詢」直接由伺服器寄信，使用者不必再按一次 Gmail 的「傳送」。
 * 優點：完全免費、不用架伺服器、用你自己的 Google 帳號寄出。
 *
 * ── 部署步驟 ──────────────────────────────────────────────
 * 1. 前往 https://script.google.com → 新增專案
 * 2. 把這整個檔案的內容貼進 Code.gs（覆蓋原本的內容）
 * 3. 修改下方 CONFIG 的收件人與通知信箱
 * 4. 右上角「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *      執行身分：我（你的 Google 帳號）
 *      具有存取權的使用者：任何人          ← 一定要選這個，網頁才呼叫得到
 * 5. 按「部署」，第一次會要求授權，允許它代表你寄信
 * 6. 複製產生的「網頁應用程式網址」（https://script.google.com/macros/s/AKfy…/exec）
 * 7. 把網址填進網頁程式碼最上方的 CONFIG.apiEndpoint
 *      單機版：src/app.js（改完執行 python3 src/build.py）
 *      CyberBiz 版：改完執行 python3 src/build_cyberbiz.py，重新貼上片段
 *
 * ── 注意 ──────────────────────────────────────────────────
 * · 網頁是以 Content-Type: text/plain 送出 JSON 字串，這屬於 CORS 的「簡單請求」，
 *   不會觸發預檢（preflight）。Apps Script 不支援回應 OPTIONS 預檢，
 *   所以請不要把前端改成 application/json，否則會被瀏覽器擋下。
 * · Gmail 免費帳號每天約 100 封、Workspace 約 1500 封寄送上限。
 * · 每次修改程式碼後，要重新「部署」→「管理部署作業」→ 編輯 → 版本選「新版本」，
 *   否則線上跑的還是舊版。
 */

const CONFIG = {
  // 收件人：諮詢單會寄到這裡
  to: 'service@goamazing.com.tw',
  // 副本（沒有就留空字串）
  cc: '',
  // 寄件顯示名稱
  senderName: 'GOAMAZING 購精彩 官網',
  // 是否同時把內容存進試算表備份（見下方 SHEET_ID 說明）
  saveToSheet: false,
  // 要備份時，填入試算表 ID（網址 /d/ 與 /edit 中間那段）
  sheetId: '',
};


/** 網頁 POST 進來的入口 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: '沒有收到資料' });
    }

    const data = JSON.parse(e.postData.contents);

    // 蜜罐欄位：正常使用者看不到這個欄位，有填就是機器人 —— 假裝成功、實際丟棄
    if (data.hp) {
      return json({ ok: true, skipped: true });
    }

    // 基本驗證（前端擋過一次，後端再擋一次才安全）
    const company = String(data['公司名稱'] || data.company || '').trim();
    const contact = String(data['聯絡人'] || data.contact || '').trim();
    const email   = String(data['電子郵件'] || data.email || '').trim();
    if (!company || !contact || !email) {
      return json({ ok: false, error: '公司名稱、聯絡人、電子郵件為必填' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return json({ ok: false, error: '電子郵件格式不正確' });
    }

    const subject = String(data.subject || ('企業福利方案諮詢｜' + company)).slice(0, 200);
    const body    = String(data.body || '').slice(0, 20000);

    MailApp.sendEmail({
      to: CONFIG.to,
      cc: CONFIG.cc || undefined,
      subject: subject,
      body: body,
      name: CONFIG.senderName,
      replyTo: email,          // 直接回信就會回給填表的人
    });

    if (CONFIG.saveToSheet && CONFIG.sheetId) {
      appendRow_(data, company, contact, email);
    }

    return json({ ok: true });

  } catch (err) {
    // 回傳 200 + ok:false，前端才讀得到錯誤訊息（Apps Script 的錯誤頁沒有 CORS 標頭）
    return json({ ok: false, error: String(err) });
  }
}


/** 讓你可以直接用瀏覽器開網址，確認部署成功 */
function doGet() {
  return json({ ok: true, message: 'GOAMAZING 諮詢表單 API 運作中' });
}


function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/** 備份到試算表：第一次會自動建立標題列 */
function appendRow_(data, company, contact, email) {
  const sheet = SpreadsheetApp.openById(CONFIG.sheetId).getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['時間', '公司名稱', '聯絡人', '電子郵件', '聯絡電話', '需求說明']);
  }
  sheet.appendRow([
    new Date(),
    company,
    contact,
    email,
    String(data['聯絡電話'] || data.phone || ''),
    String(data['需求說明'] || data.message || ''),
  ]);
}
