/* 은혜의말씀 — 사용자 글자 크기(홈·Reader 공용)
   ────────────────────────────────────────────────────────────
   화면마다 정해 둔 글자 크기 위계(큰 제목·본문·작은 설명)는 그대로 두고,
   :root의 --gomna-text-scale 하나로 앱 전체의 "읽는 글자"만 함께 조절한다.
   각 CSS 규칙의 font-size를 calc(원래값 * var(--gomna-text-scale))로 한 번만 바꿔 두므로
   버튼을 누르면 변수 하나만 바뀌어 모든 화면이 즉시 함께 변한다.
   아이콘·사진·로고의 width/height는 건드리지 않는다. */
(function () {
  var STEPS = [18, 20, 22, 24, 26];
  var BASE_STEP = 22;   /* 22px 단계 = 지금 운영 화면과 같은 크기(비율 1). 기본값을 억지로 키우지 않는다 */
  var BASE_FONT = 17;   /* 기존 --font-size 기본값. 같은 비율을 곱해 기존 규칙과 어긋나지 않게 한다 */
  var STORAGE_KEY = 'gomna_font_step_v1';
  var SCALE_VAR = '--gomna-text-scale';
  var STYLE_ID = 'gomna-text-scale-css';
  /* 아이콘·로고 글자는 읽는 글자가 아니므로 확대 대상에서 뺀다. */
  var SKIP_SELECTOR = /(^|[^\w-])(icon|logo|emoji|spinner|glyph|badge-dot)([^\w-]|$)/i;
  var root = document.documentElement;
  var doneSheets = [];
  var currentStep = null;
  var rescanTimer = 0;

  function clampStep(px) {
    var value = parseFloat(px);
    if (!isFinite(value)) return BASE_STEP;
    /* 기존 설정값·예전 값도 새 5단계 중 가장 가까운 값으로 옮긴다. */
    var best = STEPS[0], gap = Math.abs(value - STEPS[0]);
    for (var i = 1; i < STEPS.length; i++) {
      var d = Math.abs(value - STEPS[i]);
      if (d < gap) { best = STEPS[i]; gap = d; }
    }
    return best;
  }

  function readSaved() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (raw === null || raw === '') return BASE_STEP;
    return clampStep(raw);
  }

  function save(step) {
    try { window.localStorage.setItem(STORAGE_KEY, String(step)); } catch (e) {}
  }

  /* ── 규칙 한 번만 고치기 ───────────────────────────────── */

  function wrapFontSize(style) {
    var value = style.getPropertyValue('font-size');
    if (!value) return;
    if (value.indexOf(SCALE_VAR) !== -1) return;      /* 이미 처리한 규칙 */
    /* --font-size 등 변수를 쓰는 규칙은 그 변수에 이미 비율이 들어 있어 두 번 곱하면 안 된다. */
    if (value.indexOf('var(') !== -1) return;
    /* em·%·ex·ch는 부모 글자에 비례하므로 그대로 두면 자동으로 함께 커진다. */
    if (/(\d|\))\s*(em|ex|ch)\b/i.test(value) || value.indexOf('%') !== -1) return;
    if (!/\d/.test(value)) return;                    /* inherit·smaller 같은 키워드 */
    var priority = '';
    try { priority = style.getPropertyPriority('font-size'); } catch (e) {}
    try {
      style.setProperty('font-size', 'calc((' + value + ') * var(' + SCALE_VAR + ', 1))', priority);
    } catch (e) {}
  }

  function walkRules(rules) {
    if (!rules) return;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule) continue;
      var inner = null;
      try { inner = rule.cssRules; } catch (e) { inner = null; }
      if (inner && inner.length) { walkRules(inner); continue; }  /* @media·@supports 안쪽 */
      if (!rule.style || typeof rule.selectorText !== 'string') continue;
      if (SKIP_SELECTOR.test(rule.selectorText)) continue;
      wrapFontSize(rule.style);
    }
  }

  function scanSheets() {
    var sheets = document.styleSheets;
    if (!sheets) return;
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      if (!sheet || doneSheets.indexOf(sheet) !== -1) continue;
      var node = sheet.ownerNode;
      if (node && node.id === STYLE_ID) { doneSheets.push(sheet); continue; }
      var rules = null;
      /* 다른 출처(CDN 글꼴 등)의 규칙은 읽을 수 없다. 그때는 건너뛰고 다음 기회에 다시 본다. */
      try { rules = sheet.cssRules; } catch (e) { rules = null; }
      if (!rules) continue;
      doneSheets.push(sheet);
      walkRules(rules);
    }
  }

  /* 마크업에 직접 적힌 style="font-size:…"도 같은 방식으로 한 번만 감싼다.
     (오늘의 말씀은 자동 줄맞춤이 스스로 크기를 계산하므로 건드리지 않는다) */
  function scanInline() {
    var list;
    try { list = document.querySelectorAll('[style*="font-size"]:not([data-gomna-text-scaled])'); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      try { el.setAttribute('data-gomna-text-scaled', '1'); } catch (e) {}
      if (el.id === 'verse-text') continue;
      wrapFontSize(el.style);
    }
  }

  function rescan() {
    scanSheets();
    scanInline();
  }

  function scheduleRescan() {
    if (rescanTimer) return;
    rescanTimer = window.setTimeout(function () { rescanTimer = 0; rescan(); }, 60);
  }

  /* ── 적용 ──────────────────────────────────────────────── */

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    /* :where로 두어 페이지가 이미 정한 body 글자 크기가 있으면 그 값이 이긴다.
       비율 1일 때 브라우저 기본(16px)과 같아서 지금 화면 모습은 달라지지 않는다. */
    style.textContent = ':root{' + SCALE_VAR + ':1}'
      + ':where(body){font-size:calc(16px * var(' + SCALE_VAR + ',1))}'
      /* 버튼·입력칸은 부모 글자를 물려받지 않는다. 따로 정해 둔 크기가 없을 때만 기본값에 비율을 곱한다.
         기본 단계(22px)에서는 이 규칙을 켜지 않아서 브라우저마다 다른 기본 모습이 그대로 유지된다. */
      + ':where(html.gomna-text-scaled) :where(button,input,select,textarea)'
      + '{font-size:calc(13.3333px * var(' + SCALE_VAR + ',1))}'
      + '.font-control{display:flex;align-items:center;justify-content:center;gap:20px;margin:6px 0 12px}'
      + '.font-btn{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:52px;height:52px;padding:0;'
      + 'border-radius:50%;border:1px solid rgba(184,134,11,.34);background:#FFFDF8;color:#4A2511;'
      + 'font-family:inherit;font-size:20px;font-weight:700;line-height:1;cursor:pointer}'
      + '.font-btn:active{background:#F7EEE0}'
      + '.font-btn:disabled{opacity:.38;cursor:default}'
      + '.font-size-display{min-width:88px;text-align:center;font-size:20px;font-weight:800;color:#4A2511;'
      + 'font-variant-numeric:tabular-nums}';
    (document.head || root).appendChild(style);
  }

  function applyStep(step, persist) {
    currentStep = step;
    var scale = Math.round((step / BASE_STEP) * 10000) / 10000;
    try {
      root.style.setProperty(SCALE_VAR, String(scale));
      /* 기존 --font-size를 쓰는 규칙(Reader 본문 등)도 같은 비율로 함께 맞춘다. */
      root.style.setProperty('--font-size', (Math.round(BASE_FONT * scale * 100) / 100) + 'px');
    } catch (e) {}
    try {
      if (step === BASE_STEP) root.classList.remove('gomna-text-scaled');
      else root.classList.add('gomna-text-scaled');
    } catch (e) {}
    if (persist) save(step);
    rescan();          /* 늦게 붙은 스타일이 있으면 이때 함께 처리한다 */
    refreshControl();
    afterChange();
  }

  /* 글자 크기가 바뀐 뒤 스스로 크기를 계산하는 화면만 다시 맞춘다. */
  function afterChange() {
    try {
      if (typeof window.scheduleFitDailyVerseText === 'function') window.scheduleFitDailyVerseText();
      else if (typeof window.fitDailyVerseText === 'function') window.fitDailyVerseText();
    } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('gomna:text-scale', { detail: { step: currentStep } })); } catch (e) {}
  }

  function refreshControl() {
    var display = document.getElementById('fontDisplay');
    if (display) display.textContent = currentStep + 'px';
    var index = STEPS.indexOf(currentStep);
    var minus = document.getElementById('fontMinusBtn');
    var plus = document.getElementById('fontPlusBtn');
    if (minus) {
      minus.disabled = (index <= 0);
      minus.setAttribute('aria-disabled', index <= 0 ? 'true' : 'false');
    }
    if (plus) {
      plus.disabled = (index >= STEPS.length - 1);
      plus.setAttribute('aria-disabled', index >= STEPS.length - 1 ? 'true' : 'false');
    }
  }

  /* 한 번 누르면 한 단계(2px)만 움직인다. 양 끝에서는 더 움직이지 않는다. */
  function stepBy(direction) {
    var index = STEPS.indexOf(currentStep);
    if (index === -1) index = STEPS.indexOf(BASE_STEP);
    var next = index + (direction < 0 ? -1 : 1);
    if (next < 0) next = 0;
    if (next > STEPS.length - 1) next = STEPS.length - 1;
    if (STEPS[next] === currentStep) { refreshControl(); return currentStep; }
    applyStep(STEPS[next], true);
    return currentStep;
  }

  function setStep(px) {
    applyStep(clampStep(px), true);
    return currentStep;
  }

  ensureStyle();
  applyStep(readSaved(), false);   /* 저장해 둔 값은 첫 그림 전에 먼저 반영해 깜빡임을 막는다 */
  rescan();

  /* 나중에 붙는 스타일(설정 시트·계정 화면·번역 등)도 같은 방식으로 처리한다. */
  try {
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var tag = added[j].nodeName;
          if (tag === 'STYLE' || tag === 'LINK') { scheduleRescan(); return; }
        }
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  } catch (e) {}

  document.addEventListener('DOMContentLoaded', function () { rescan(); refreshControl(); });
  window.addEventListener('load', function () { rescan(); refreshControl(); });
  window.setTimeout(rescan, 1200);
  window.setTimeout(rescan, 3000);

  /* 설정 화면의 －/＋ 버튼이 쓰는 기존 이름을 그대로 유지한다. */
  window.changeFont = function (delta) { return stepBy(delta < 0 ? -1 : 1); };

  window.GomnaTextScale = {
    steps: STEPS.slice(),
    base: BASE_STEP,
    get: function () { return currentStep; },
    set: setStep,
    step: stepBy,
    refresh: function () { rescan(); refreshControl(); },
    scale: function () { return currentStep / BASE_STEP; }
  };
})();
