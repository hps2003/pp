/* ==========================================================================
   GOAMAZING 購精彩 — 首頁互動邏輯
   1. 首屏拆禮物捲動動畫
   2. 導覽列（固定 / 手機抽屜）
   3. 橫向卡片軌道
   4. 諮詢表單 → Gmail 寄信
   ========================================================================== */
(function () {
  'use strict';

  var RECIPIENT = 'service@goamazing.com.tw';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. 視窗尺寸變數 ───────────────────────────────────────────────
     用 JS 同步真實視窗高度到 CSS 變數，解決 iOS Safari 網址列
     伸縮時 100vh 會跳動、造成首屏文字被切掉的問題。            */
  function syncViewport() {
    var doc = document.documentElement;
    doc.style.setProperty('--vh', window.innerHeight * 0.01 + 'px');
    // 緞帶蝴蝶結尺寸：同時受寬度與高度限制，橫置手機也不會爆版
    var bow = Math.max(96, Math.min(190, window.innerWidth * 0.125, window.innerHeight * 0.2));
    doc.style.setProperty('--bow-w', bow.toFixed(0) + 'px');
    // 導覽列實際高度回寫，錨點捲動位移永遠正確
    var nav = $('.nav');
    if (nav) doc.style.setProperty('--nav-h', nav.offsetHeight + 'px');
  }

  /* ── 2. 首屏拆禮物動畫 ───────────────────────────────────────── */
  var stage = {
    wrap:    $('[data-stage]'),
    photo:   $('[data-photo]'),
    veil:    $('[data-veil]'),
    hero:    $('[data-hero]'),
    title:   $('[data-hero-title]'),
    sub:     $('[data-hero-sub]'),
    btns:    $('[data-hero-btns]'),
    panelT:  $('[data-panel="top"]'),
    panelB:  $('[data-panel="bottom"]'),
    lineL:   $('[data-line="l"]'),
    lineR:   $('[data-line="r"]'),
    bowL:    $('[data-bow="l"]'),
    bowR:    $('[data-bow="r"]'),
    hint:    $('[data-hint]'),
    nav:     $('.nav'),
    cycle:   $('[data-cycle]')
  };

  function setStyle(el, css) { if (el) { for (var k in css) el.style[k] = css[k]; } }

  function applyStage(seen) {
    var vh = window.innerHeight, vw = window.innerWidth;
    var seg  = function (a, b) { return Math.min(1, Math.max(0, (seen - a) / (b - a))); };
    var ease = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

    var ribbon = ease(seg(.14, .58));
    var open   = ease(seg(.32, .84));
    var fade   = seg(.58, .86);
    var veil   = 1 - ease(seg(.22, .74));
    var textIn = ease(seg(.66, .96));
    var pull   = vw * .5;

    setStyle(stage.bowL, { transform: 'translate(' + (-ribbon * pull) + 'px,' + (-ribbon * vh * .07) + 'px) rotate(' + (-ribbon * 16) + 'deg)', opacity: String(1 - fade) });
    setStyle(stage.bowR, { transform: 'translate(' + ( ribbon * pull) + 'px,' + (-ribbon * vh * .07) + 'px) rotate(' + ( ribbon * 16) + 'deg)', opacity: String(1 - fade) });
    setStyle(stage.lineL, { transform: 'translateX(' + (-ribbon * pull * 1.3) + 'px)', opacity: String(1 - fade) });
    setStyle(stage.lineR, { transform: 'translateX(' + ( ribbon * pull * 1.3) + 'px)', opacity: String(1 - fade) });
    setStyle(stage.panelT, { transform: 'translateY(' + (-open * 100) + '%)', boxShadow: '0 ' + (open * 26) + 'px ' + (open * 64) + 'px rgba(0,0,0,' + (open * .55) + ')' });
    setStyle(stage.panelB, { transform: 'translateY(' + ( open * 100) + '%)', boxShadow: '0 ' + (-open * 26) + 'px ' + (open * 64) + 'px rgba(0,0,0,' + (open * .55) + ')' });
    setStyle(stage.veil,  { opacity: String(veil) });
    setStyle(stage.photo, { transform: 'scale(' + (1.18 - .09 * ease(seg(.18, 1))) + ')' });
    setStyle(stage.hint,  { opacity: String(1 - seg(0, .10)) });
    setStyle(stage.hero,  { opacity: String(textIn) });

    [stage.title, stage.sub, stage.btns].forEach(function (el, i) {
      var t = ease(seg(.66 + i * .07, .94 + i * .04));
      setStyle(el, { transform: 'translateY(' + ((1 - t) * 34) + 'px)', opacity: String(t) });
    });

    // 循環箭頭隨捲動微幅旋轉
    if (stage.cycle) {
      var r = stage.cycle.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        stage.cycle.style.transform = 'rotate(' + ((vh / 2 - (r.top + r.height / 2)) * 0.42).toFixed(2) + 'deg)';
      }
    }
  }

  function updateNav() {
    if (!stage.nav) return;
    var solid = window.scrollY > window.innerHeight * .5;
    if (solid !== stage.navSolid) {
      stage.navSolid = solid;
      stage.nav.classList.toggle('is-solid', solid);
    }
  }

  var rafId = null;
  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = null;
      if (stage.wrap) {
        var seen = Math.min(1, Math.max(0,
          -stage.wrap.getBoundingClientRect().top / Math.max(1, stage.wrap.offsetHeight - window.innerHeight)));
        applyStage(reduceMotion ? 1 : seen);
      }
      updateNav();
    });
  }

  /* ── 3. 導覽列抽屜 ───────────────────────────────────────────── */
  function initNav() {
    var burger = $('[data-burger]'), drawer = $('[data-drawer]');
    if (!burger || !drawer) return;

    function setOpen(open) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      drawer.classList.toggle('is-open', open);
    }
    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });
    // 點選單項目後自動收合
    $$('a', drawer).forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    // 點外面 / 按 Esc / 放大到桌機寬度 → 收合，避免殘留擋住畫面
    document.addEventListener('click', function (e) {
      if (!drawer.contains(e.target) && !burger.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.matchMedia('(min-width: 900px)').addEventListener('change', function (e) { if (e.matches) setOpen(false); });
  }

  /* ── 4. 橫向卡片軌道 ─────────────────────────────────────────── */
  function railCards(track) { return $$('[data-card]', track); }

  function markCenter(track) {
    var cards = railCards(track);
    if (!cards.length) return;
    var fancy = window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion;
    var mid = track.scrollLeft + track.clientWidth / 2;
    var span = cards[0].offsetWidth + 24;
    var best = null, bestD = Infinity;

    cards.forEach(function (c) {
      var d = (c.offsetLeft + c.offsetWidth / 2 - mid) / span;
      var a = Math.min(Math.abs(d), 1.7);
      var t = 1 - a / 1.7;
      var e = t * t * (3 - 2 * t);
      if (fancy) {
        c.style.transform = 'translateY(' + (-16 * e).toFixed(2) + 'px) scale(' + (0.888 + 0.132 * e).toFixed(4) +
                            ') rotateY(' + (-Math.max(-1.7, Math.min(1.7, d)) * 8).toFixed(2) + 'deg)';
        c.style.opacity = (0.5 + 0.5 * e).toFixed(3);
        c.style.boxShadow = '0 ' + (8 + 24 * e).toFixed(0) + 'px ' + (22 + 34 * e).toFixed(0) +
                            'px rgba(32,30,29,' + (0.04 + 0.13 * e).toFixed(3) + ')';
      } else {
        // 觸控裝置不做 3D 變形：省效能，也避免卡片邊緣被裁切
        c.style.transform = '';
        c.style.opacity = (0.68 + 0.32 * e).toFixed(3);
        c.style.boxShadow = '';
      }
      c.style.zIndex = String(10 + Math.round(e * 10));
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = c; }
    });

    var sh = track.parentElement && track.parentElement.querySelector('[data-rail-shadow]');
    if (sh && best) {
      if (!fancy) { sh.style.opacity = '0'; return; }
      var w = best.offsetWidth * 0.78;
      sh.style.width = w.toFixed(0) + 'px';
      sh.style.transform = 'translateX(' + (best.offsetLeft + best.offsetWidth / 2 - track.scrollLeft - w / 2).toFixed(1) + 'px)';
      sh.style.opacity = String(Math.max(0, 1 - bestD));
    }
  }

  function restRail(track) {
    var cards = railCards(track);
    if (!cards.length) return;
    // 起始停在第二張，暗示左右都還有內容；窄螢幕只放得下一張時就停在第一張
    var card = cards[Math.min(1, cards.length - 1)];
    var max = track.scrollWidth - track.clientWidth;
    track.scrollLeft = Math.max(0, Math.min(max, card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2));
    markCenter(track);
  }

  function centerCard(track, card) {
    track.dataset.touched = '1';
    var max = track.scrollWidth - track.clientWidth;
    var left = Math.max(0, Math.min(max, card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2));
    track.scrollTo({ left: left, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function initRails() {
    $$('[data-rail]').forEach(function (track) {
      var down = false, sx = 0, sl = 0, moved = 0, hoverT = null, raf = null;

      // 滑鼠拖曳（觸控交給瀏覽器原生捲動，體驗最順）
      track.addEventListener('pointerdown', function (e) {
        track.dataset.touched = '1';
        if (e.pointerType === 'touch') return;
        down = true; moved = 0; sx = e.clientX; sl = track.scrollLeft;
        track.style.scrollSnapType = 'none';
      });
      track.addEventListener('pointermove', function (e) {
        if (!down) return;
        var dx = e.clientX - sx;
        moved = Math.max(moved, Math.abs(dx));
        if (moved > 3) e.preventDefault();
        track.scrollLeft = sl - dx;
      });
      function up() {
        if (!down) return;
        down = false;
        setTimeout(function () { track.style.scrollSnapType = 'x mandatory'; }, 60);
      }
      track.addEventListener('pointerup', up);
      track.addEventListener('pointercancel', up);
      track.addEventListener('pointerleave', up);
      track.addEventListener('dragstart', function (e) { e.preventDefault(); });

      track.addEventListener('scroll', function () {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () { markCenter(track); });
      }, { passive: true });

      // 只攔截「明確的橫向」滾輪手勢；垂直滾動一律讓頁面自己捲，
      // 否則在 Windows 觸控板 / 觸控筆電上滑到卡片區會卡住整頁。
      track.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        var max = track.scrollWidth - track.clientWidth;
        if ((e.deltaX > 0 && track.scrollLeft >= max - 1) || (e.deltaX < 0 && track.scrollLeft <= 1)) return;
        e.preventDefault();
        track.scrollLeft += e.deltaX;
      }, { passive: false });

      railCards(track).forEach(function (card) {
        card.addEventListener('click', function () { if (moved < 5) centerCard(track, card); });
        card.addEventListener('mouseenter', function () {
          clearTimeout(hoverT);
          hoverT = setTimeout(function () { if (!down) centerCard(track, card); }, 110);
        });
        card.addEventListener('mouseleave', function () { clearTimeout(hoverT); });
      });

      var id = track.getAttribute('data-rail');
      var nav = $('[data-rail-nav="' + id + '"]');
      if (nav) {
        $$('button[data-dir]', nav).forEach(function (btn) {
          btn.addEventListener('click', function () {
            var first = railCards(track)[0];
            var step = first ? first.offsetWidth + 24 : 300;
            track.dataset.touched = '1';
            track.scrollBy({ left: btn.getAttribute('data-dir') === 'prev' ? -step : step,
                             behavior: reduceMotion ? 'auto' : 'smooth' });
          });
        });
      }

      restRail(track);
      requestAnimationFrame(function () { restRail(track); });
    });
  }

  function relayoutRails() {
    $$('[data-rail]').forEach(function (t) { t.dataset.touched ? markCenter(t) : restRail(t); });
  }

  /* ── 5. 諮詢表單 → Gmail ─────────────────────────────────────────
     點「送出諮詢需求」時，把表單內容組成信件主旨與內文，
     直接開啟 Gmail 撰寫視窗，收件人固定為 service@goamazing.com.tw。

     跨平台策略（不做不可靠的瀏覽器偵測）：
       · Windows / macOS 桌機 → 新分頁開啟 Gmail 網頁版撰寫畫面
       · iOS / iPadOS        → mail.google.com 是 Gmail App 的 Universal Link，
                               裝了 App 會直接跳 App，沒裝則開 Gmail 行動網頁
       · Android             → 同上，由系統 App Links 接手
     另備兩條退路：改用系統預設郵件軟體（mailto:）、或一鍵複製內容。   */
  function initForm() {
    var form = $('[data-consult-form]');
    if (!form) return;

    var statusEl = $('[data-form-status]', form);
    var submitBtn = $('[data-submit]', form);

    function fields() { return $$('[data-field]', form); }

    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.className = 'form-status' + (msg ? ' is-' + (kind || 'ok') : '');
    }

    function showError(input, msg) {
      var box = input.closest('.field');
      var err = box && box.querySelector('.field__err');
      if (err) err.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }

    function validate() {
      var ok = true, firstBad = null;
      fields().forEach(function (input) {
        var label = input.getAttribute('data-field');
        var val = (input.value || '').trim();
        var msg = '';
        if (input.hasAttribute('data-required') && !val) {
          msg = '請填寫' + label;
        } else if (val && input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
          msg = '請輸入正確的電子郵件格式';
        } else if (val && input.type === 'tel' && !/^[\d+\-()#*\s]{6,}$/.test(val)) {
          msg = '請輸入正確的電話號碼';
        }
        if (!showError(input, msg)) { ok = false; if (!firstBad) firstBad = input; }
      });
      if (firstBad) {
        firstBad.focus();
        firstBad.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        setStatus('請確認標示的欄位後再送出。', 'warn');
      }
      return ok;
    }

    // 把畫面上填寫的資料組成信件內容
    function compose() {
      var company = '', lines = [];
      fields().forEach(function (input) {
        var label = input.getAttribute('data-field');
        var val = (input.value || '').trim();
        if (label === '公司名稱') company = val;
        if (!val) return;
        // 多行欄位（需求說明）另起一段，維持信件可讀性
        lines.push(input.tagName === 'TEXTAREA' ? label + '：\n' + val : label + '：' + val);
      });

      var now = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var stamp = now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate()) +
                  ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

      var body = '【企業福利方案諮詢】\n\n' + lines.join('\n') +
                 '\n\n──────────────────\n' +
                 '來源：GOAMAZING 購精彩 官網諮詢表單\n' +
                 '填寫時間：' + stamp + '\n';

      return {
        to: RECIPIENT,
        subject: '企業福利方案諮詢' + (company ? '｜' + company : ''),
        body: body
      };
    }

    function gmailUrl(m) {
      return 'https://mail.google.com/mail/?view=cm&fs=1&tf=1' +
             '&to=' + encodeURIComponent(m.to) +
             '&su=' + encodeURIComponent(m.subject) +
             '&body=' + encodeURIComponent(m.body);
    }
    function mailtoUrl(m) {
      return 'mailto:' + encodeURIComponent(m.to) +
             '?subject=' + encodeURIComponent(m.subject) +
             '&body=' + encodeURIComponent(m.body);
    }

    // 送出：開 Gmail 撰寫視窗
    form.addEventListener('submit', function (e) {
      e.preventDefault();                 // 不做傳統表單送出，改由 Gmail 接手
      setStatus('');
      if (!validate()) return;

      var m = compose();
      var url = gmailUrl(m);

      // window.open 必須在使用者點擊的同一個事件內同步呼叫，
      // 否則 iOS Safari 會當成彈出視窗擋掉。
      var win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win || win.closed || typeof win.closed === 'undefined') {
        // 被封鎖彈出視窗 → 直接在本頁跳轉，確保一定送得出去
        window.location.href = url;
      }
      setStatus('已為您開啟 Gmail 撰寫視窗，內容已自動帶入，確認後按「傳送」即可寄出。若沒有跳出，請改用下方的備用方式。', 'ok');
    });

    // 備用一：系統預設郵件軟體（Outlook / Apple Mail 等）
    var altBtn = $('[data-send-mailto]', form);
    if (altBtn) altBtn.addEventListener('click', function () {
      if (!validate()) return;
      window.location.href = mailtoUrl(compose());
      setStatus('已呼叫您裝置的預設郵件軟體。', 'ok');
    });

    // 備用二：複製信件內容，貼到任何信箱都能寄
    var copyBtn = $('[data-copy]', form);
    if (copyBtn) copyBtn.addEventListener('click', function () {
      if (!validate()) return;
      var m = compose();
      var text = '收件人：' + m.to + '\n主旨：' + m.subject + '\n\n' + m.body;
      function done() { setStatus('信件內容已複製，可直接貼到任何郵件軟體寄給 ' + RECIPIENT + '。', 'ok'); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
      } else {
        legacyCopy(text, done);
      }
    });

    function legacyCopy(text, done) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:absolute;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, text.length);   // iOS 需要明確選取範圍
      try { document.execCommand('copy'); done(); }
      catch (err) { setStatus('複製失敗，請手動寄信至 ' + RECIPIENT + '。', 'warn'); }
      document.body.removeChild(ta);
    }

    // 邊打字邊清除錯誤提示
    fields().forEach(function (input) {
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') === 'true') showError(input, '');
      });
    });
  }

  /* ── 6. 啟動 ─────────────────────────────────────────────────── */
  function init() {
    syncViewport();
    initNav();
    initRails();
    initForm();
    onScroll();

    window.addEventListener('scroll', onScroll, { passive: true });

    var resizeT = null;
    function onResize() {
      syncViewport();
      onScroll();
      clearTimeout(resizeT);
      // 尺寸穩定後才重排卡片，避免手機轉向途中抖動
      resizeT = setTimeout(relayoutRails, 140);
    }
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 200); });

    // 字體載入完成後尺寸會變，重新量一次卡片位置
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { syncViewport(); relayoutRails(); });
    }
    window.addEventListener('load', function () { syncViewport(); relayoutRails(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
