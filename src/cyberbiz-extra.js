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

  /* ── 2. 首屏定位模式 ───────────────────────────────────────────
     店家版型的外層只要有 overflow（很常見：overflow-x:hidden 會讓
     overflow-y 計算成 auto），position:sticky 就會失效，首屏動畫會壞掉。

     但 position:fixed 不受祖先 overflow 影響，所以不必放棄動畫：
       native → 沒有阻礙，直接用 CSS sticky（最順）
       fix    → 有 overflow 擋住 sticky，改用 JS 模擬（動畫完整保留）
       static → 祖先有 transform/filter/perspective，連 fixed 都會被綁住，
                才退回靜態首屏
     判斷順序由好到壞，只有真的無計可施才會失去動畫。 */
  function ancestorBreaksSticky() {
    for (var p = root.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (/hidden|auto|scroll|clip/.test(cs.overflowY) || /hidden|auto|scroll|clip/.test(cs.overflow)) return true;
    }
    return false;
  }

  // transform / filter / perspective / contain 會讓祖先變成 fixed 的包含區塊
  function ancestorBreaksFixed() {
    for (var p = root.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if ((cs.transform && cs.transform !== 'none') ||
          (cs.filter && cs.filter !== 'none') ||
          (cs.perspective && cs.perspective !== 'none') ||
          (cs.backdropFilter && cs.backdropFilter !== 'none') ||
          /paint|layout|strict|content/.test(cs.contain || '') ||
          /transform|filter|perspective/.test(cs.willChange || '')) return true;
    }
    return false;
  }

  function supportsSticky() {
    return !!(window.CSS && CSS.supports &&
      (CSS.supports('position', 'sticky') || CSS.supports('position', '-webkit-sticky')));
  }

  var mode = 'native';

  function chooseMode() {
    var next = 'native';
    if (!supportsSticky() || ancestorBreaksSticky()) {
      next = ancestorBreaksFixed() ? 'static' : 'fix';
    }
    if (next === mode && root.classList.contains('gx-' + (next === 'native' ? 'js' : next + 'stick'))) return;
    mode = next;
    root.classList.toggle('gx-fixstick', mode === 'fix');
    root.classList.toggle('gx-nostick', mode === 'static');
    if (mode === 'fix') {
      console.info('[goamazing] 外層 overflow 使 sticky 失效，已改用 fixed 模擬，動畫保留。');
    } else if (mode === 'static') {
      console.warn('[goamazing] 外層有 transform/filter，首屏改為靜態顯示。');
    }
    positionStage();
  }

  /* fixed 模擬：依捲動位置在 absolute(頂) → fixed → absolute(底) 之間切換。
     用 class 切換而非行內樣式，因為打包時 position 會被加上 !important。 */
  function positionStage() {
    var stage = root.querySelector('.gx-stage');
    var sticky = root.querySelector('.gx-stage__sticky');
    if (!stage || !sticky) return;
    if (mode !== 'fix') {
      sticky.classList.remove('gx-fx-on', 'gx-fx-end');
      return;
    }
    var r = stage.getBoundingClientRect(), vh = window.innerHeight;
    // fixed 之後會脫離文件流，左右位置要自己補回來
    root.style.setProperty('--gx-stage-l', Math.round(r.left) + 'px');
    root.style.setProperty('--gx-stage-w', Math.round(r.width) + 'px');
    sticky.classList.toggle('gx-fx-on', r.top <= 0 && r.bottom >= vh);
    sticky.classList.toggle('gx-fx-end', r.bottom < vh);
  }

  var stageRaf = null;
  function onStageScroll() {
    if (stageRaf) return;
    stageRaf = requestAnimationFrame(function () { stageRaf = null; positionStage(); });
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
  chooseMode();
  window.addEventListener('scroll', onStageScroll, { passive: true });
  window.addEventListener('resize', function () { syncBleed(); chooseMode(); positionStage(); }, { passive: true });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { syncBleed(); chooseMode(); positionStage(); }, 200);
  });
  window.addEventListener('load', function () { syncBleed(); chooseMode(); positionStage(); });
})();
