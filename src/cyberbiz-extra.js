/* ==========================================================================
   CyberBiz 嵌入專用補強（接在主程式之後執行）
   只處理「嵌在店家版型裡」才需要的事，單機版不會用到這個檔案。
   ========================================================================== */
(function () {
  'use strict';
  var root = document.getElementById('gx-root');
  if (!root || root.dataset.gxReady) return;   // 同一頁貼兩次時只初始化一次
  root.dataset.gxReady = '1';

  /* ── 1. 滿版寬度 ────────────────────────────────────────────────
     用 clientWidth（不含捲軸）而非 100vw，桌機才不會多出一條橫向捲軸。 */
  function syncBleed() {
    root.style.setProperty('--gx-vw', document.documentElement.clientWidth + 'px');
  }

  /* ── 2. 偵測 position:sticky 是否真的有效 ───────────────────────
     店家版型的外層只要有 overflow:hidden/auto/scroll，sticky 就會失效，
     首屏會變成一整片黑。這裡實際量測，失效就切換成靜態首屏。 */
  function checkSticky() {
    var sticky = root.querySelector('.gx-stage__sticky');
    if (!sticky) return;

    var broken = false;
    for (var p = root.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      var ov = getComputedStyle(p);
      if (/hidden|auto|scroll|clip/.test(ov.overflowY) || /hidden|auto|scroll|clip/.test(ov.overflow)) {
        broken = true; break;
      }
    }
    // 瀏覽器本身不支援 sticky（很舊的機型）也算失效
    if (!CSS || !CSS.supports || !(CSS.supports('position', 'sticky') || CSS.supports('position', '-webkit-sticky'))) {
      broken = true;
    }
    root.classList.toggle('gx-nostick', broken);
    if (broken) console.warn('[goamazing] 外層容器使版面無法使用 sticky，已切換為靜態首屏。');
  }

  /* ── 3. 錨點平滑捲動 ───────────────────────────────────────────
     scroll-behavior 必須設在捲動容器（html）上，嵌入時不該去動店家的全域樣式，
     因此改用 JS 處理，並自動扣掉店家頁首與本頁導覽列的高度。 */
  function offsetTop() {
    var header = parseFloat(getComputedStyle(root).getPropertyValue('--gx-header-h')) || 0;
    var nav = root.querySelector('.gx-nav');
    return header + (nav ? nav.offsetHeight : 0) + 8;
  }

  root.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;                       // 不是本區塊的錨點就交還給瀏覽器
    e.preventDefault();
    var y = target.getBoundingClientRect().top + window.pageYOffset - offsetTop();
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
  });

  syncBleed();
  checkSticky();
  window.addEventListener('resize', function () { syncBleed(); checkSticky(); }, { passive: true });
  window.addEventListener('orientationchange', function () { setTimeout(function () { syncBleed(); checkSticky(); }, 200); });
  window.addEventListener('load', function () { syncBleed(); checkSticky(); });
})();
