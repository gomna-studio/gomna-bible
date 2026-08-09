/* 은혜의말씀 — 설정 화면(홈·Reader 공용)
   ────────────────────────────────────────────────────────────
   이 파일은 설정 화면의 구조·문구·모양만 담당한다.
   실제 기능은 모두 프로젝트에 이미 있는 것을 그대로 부른다.
     언어      → translate_feature.js의 window.GomnaOpenLanguageModal()
     글자 크기 → js/gomna-text-scale.js의 window.GomnaTextScale (gomna_font_step_v1)
     테마      → js/gomna-theme.js의 window.GomnaTheme (gomna_theme_v1)
     쿠키      → 기존 쿠키 동의 배너(window.openCookieSettings)
   새 언어 체계·새 글자 크기 체계·새 테마 체계를 중복해서 만들지 않는다.
   재생 속도·이어듣기는 설정에서 다루지 않는다(Reader 오디오 플레이어에 그대로 있다). */
(function () {
  /* ── 본문 줄 간격 ──────────────────────────────────────────
     읽는 본문(성경 본문·말씀풀이)에만 적용한다. 메뉴·버튼·계정 화면은 건드리지 않는다.
     각 규칙의 원래 줄 간격에 비율만 곱해 두어 기본값에서는 지금 화면과 똑같다. */
  var READ_LINE_KEY = 'gomna_read_line_v1';
  var READ_LINE_VAR = '--gomna-read-line';
  var READ_LINE_STEPS = [
    { id: 'default', label: '기본', ratio: 1 },
    { id: 'relaxed', label: '여유롭게', ratio: 1.12 },
    { id: 'wide', label: '넓게', ratio: 1.25 }
  ];
  /* 읽는 본문에 해당하는 기존 선택자만 고른다. */
  function isReadingSelector(selectorText) {
    if (!selectorText || selectorText.indexOf('::') !== -1) return false;
    if (selectorText.indexOf('.verse-text') !== -1) return true;
    if (selectorText.indexOf('.content-box') !== -1) return true;
    if (selectorText.indexOf('.faith-resource-body') !== -1) return true;
    if (selectorText.indexOf('.commentary-table') !== -1 && / td\b/.test(selectorText)) return true;
    return false;
  }

  var readLineSheets = [];

  function wrapReadingLineHeight() {
    function walk(rules) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        var inner = null;
        try { inner = rule.cssRules; } catch (e) { inner = null; }
        if (inner && inner.length) { walk(inner); continue; }
        if (!rule.style || typeof rule.selectorText !== 'string') continue;
        if (!isReadingSelector(rule.selectorText)) continue;
        var value = rule.style.getPropertyValue('line-height');
        if (!value || value.indexOf(READ_LINE_VAR) !== -1 || !/\d/.test(value)) continue;
        try {
          rule.style.setProperty('line-height', 'calc((' + value + ') * var(' + READ_LINE_VAR + ', 1))',
            rule.style.getPropertyPriority('line-height'));
        } catch (e) {}
      }
    }
    var sheets = document.styleSheets;
    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      if (!sheet || readLineSheets.indexOf(sheet) !== -1) continue;
      var rules = null;
      try { rules = sheet.cssRules; } catch (e) { rules = null; }
      if (!rules) continue;
      readLineSheets.push(sheet);
      walk(rules);
    }
  }

  function readLineStep() {
    var saved = null;
    try { saved = window.localStorage.getItem(READ_LINE_KEY); } catch (e) {}
    for (var i = 0; i < READ_LINE_STEPS.length; i++) {
      if (READ_LINE_STEPS[i].id === saved) return READ_LINE_STEPS[i];
    }
    return READ_LINE_STEPS[0];
  }

  function applyReadLine(step, persist) {
    try {
      document.documentElement.style.setProperty(READ_LINE_VAR, String(step.ratio));
    } catch (e) {}
    if (persist) {
      try { window.localStorage.setItem(READ_LINE_KEY, step.id); } catch (e) {}
    }
    wrapReadingLineHeight();
  }

  applyReadLine(readLineStep(), false);
  document.addEventListener('DOMContentLoaded', wrapReadingLineHeight);
  window.addEventListener('load', wrapReadingLineHeight);


  /* ── 언어 ──────────────────────────────────────────────────
     기존 지구본 언어창(GomnaOpenLanguageModal)을 그대로 연다. */
  function currentLangCode() {
    try {
      var attr = document.documentElement.getAttribute('data-gomna-ui-lang');
      if (attr) return attr;
    } catch (e) {}
    try {
      if (window.GomnaUII18n && typeof window.GomnaUII18n.getLanguage === 'function' &&
        window.GomnaUII18n.isActive && window.GomnaUII18n.isActive()) {
        return window.GomnaUII18n.getLanguage() || 'ko';
      }
    } catch (e) {}
    try {
      if (window.GomnaUII18n && typeof window.GomnaUII18n.readValidGoogTransTarget === 'function') {
        var target = window.GomnaUII18n.readValidGoogTransTarget();
        if (target) return target;
      }
    } catch (e) {}
    try { if (window.__gomnaLastLang) return window.__gomnaLastLang; } catch (e) {}
    return 'ko';
  }

  /* 언어 이름은 브라우저가 알려 주는 그 언어의 이름을 쓴다(목록을 새로 만들지 않는다). */
  function langLabel(code) {
    var value = String(code || '').trim();
    if (!value) return '한국어';
    try {
      if (window.Intl && typeof Intl.DisplayNames === 'function') {
        var names = new Intl.DisplayNames([value], { type: 'language' });
        var label = names.of(value);
        if (label && label !== value) return label;
      }
    } catch (e) {}
    return value.toUpperCase();
  }

  function openLanguagePicker() {
    if (typeof window.GomnaOpenLanguageModal === 'function') {
      try { if (typeof window.closeSettings === 'function') window.closeSettings(); } catch (e) {}
      window.GomnaOpenLanguageModal();
      return true;
    }
    var globe = document.querySelector('.gt-btn');
    if (globe) {
      try { if (typeof window.closeSettings === 'function') window.closeSettings(); } catch (e) {}
      globe.click();
      return true;
    }
    return false;
  }

  /* ── 쿠키 및 분석 설정 ─────────────────────────────────────
     기존 동의 배너를 그대로 다시 띄운다. 동의 로직은 손대지 않는다. */
  window.openCookieSettings = function () {
    var readerBanner = document.getElementById('cookie-banner');
    var homeBanner = document.getElementById('home-cookie-banner');
    var saved = localStorage.getItem('cookieChoice');
    if (saved) {
      try {
        var consent = JSON.parse(saved);
        var analyticsToggle = document.getElementById('analyticsToggle');
        var marketingToggle = document.getElementById('marketingToggle');
        if (analyticsToggle) analyticsToggle.checked = !!consent.analytics;
        if (marketingToggle) marketingToggle.checked = !!consent.marketing;
      } catch (e) {}
    }
    if (readerBanner) {
      readerBanner.style.display = 'block';
      return;
    }
    if (homeBanner) homeBanner.removeAttribute('hidden');
  };

  /* ── 여기부터 설정 화면 ────────────────────────────────── */

  var popup = document.getElementById('settingsPopup');
  if (!popup) return;
  var box = popup.querySelector('.popup-box');
  if (!box) return;
  var fontCtrl = box.querySelector('.font-control');   /* 기존 글자 크기 조절을 그대로 옮겨 쓴다 */
  if (!fontCtrl) return;
  var oldClose = box.querySelector('.popup-close');    /* 큰 주황색 닫기 버튼은 쓰지 않는다 */

  if (!document.getElementById('settings-sheet-styles')) {
    var styleEl = document.createElement('style');
    styleEl.id = 'settings-sheet-styles';
    styleEl.textContent =
      '#settingsPopup.popup-overlay{align-items:flex-end;padding:0}' +
      '#settingsPopup .settings-sheet-box{width:100%;max-width:420px;max-height:min(86dvh,780px);' +
      'border-radius:20px 20px 0 0;padding:0;margin:0;background:#FFFDF8;text-align:left;' +
      'display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 32px rgba(61,40,24,.14)}' +
      /* 머리글: 제목 + × (또는 ‹ 뒤로 + 화면 제목) */
      '#settingsPopup .settings-head{flex:0 0 auto;display:flex;align-items:center;gap:6px;' +
      'padding:14px 10px 12px 18px;border-bottom:1px solid rgba(180,140,90,.16)}' +
      '#settingsPopup .settings-head-back{display:none;align-items:center;gap:4px;min-height:36px;padding:0 6px 0 0;' +
      'border:none;background:transparent;color:#8A6A45;font-family:inherit;font-size:14.5px;font-weight:600;cursor:pointer}' +
      '#settingsPopup .settings-head-back[data-visible="1"]{display:inline-flex}' +
      '#settingsPopup .settings-head-back:active{opacity:.7}' +
      '#settingsPopup .settings-head-title{flex:1;min-width:0;font-size:17px;font-weight:800;color:#3D2818;line-height:1.3}' +
      '#settingsPopup .settings-head-close{flex-shrink:0;width:38px;height:38px;padding:0;border:none;border-radius:12px;' +
      'background:transparent;color:#8A6A45;font-family:inherit;font-size:17px;cursor:pointer}' +
      '#settingsPopup .settings-head-close:hover{background:#F7EEE0}' +
      /* 하위 화면이 짧아도 시트가 갑자기 쪼그라들지 않게 최소 높이를 둔다 */
      '#settingsPopup .settings-sheet-scroll{flex:1 1 auto;min-height:210px;overflow-y:auto;' +
      '-webkit-overflow-scrolling:touch;overscroll-behavior:contain;' +
      'padding:0 0 calc(14px + env(safe-area-inset-bottom,0px))}' +
      /* 구역 제목은 실제 메뉴보다 작고 옅게 */
      '#settingsPopup .settings-section{padding:0}' +
      '#settingsPopup .settings-section-title{padding:16px 18px 6px;font-size:12.5px;font-weight:700;' +
      'color:#A38F72;letter-spacing:-.1px;line-height:1.3}' +
      /* 메뉴 한 줄: 왼쪽 이름 · 오른쪽 현재값 + › */
      '#settingsPopup .settings-menu-row{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;' +
      'min-height:52px;padding:9px 18px;border:none;border-top:1px solid rgba(180,140,90,.13);' +
      'background:transparent;color:#3D2818;font-family:inherit;font-size:15.5px;font-weight:600;' +
      'text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '#settingsPopup .settings-section .settings-menu-row:first-of-type{border-top:1px solid rgba(180,140,90,.13)}' +
      '#settingsPopup .settings-menu-row:active{background:rgba(244,232,205,.5)}' +
      '#settingsPopup .settings-row-label{flex:1 1 auto;min-width:0}' +
      '#settingsPopup .settings-row-value{flex:0 1 auto;max-width:54%;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap;text-align:right;font-size:14.5px;font-weight:600;color:#8A7355}' +
      '#settingsPopup .settings-row-arrow{flex-shrink:0;width:7px;height:7px;margin-left:2px;' +
      'border-right:2px solid #C3AB86;border-bottom:2px solid #C3AB86;transform:rotate(-45deg)}' +
      /* 토글: 켜짐만 강조색 */
      '#settingsPopup .settings-toggle{position:relative;flex-shrink:0;width:46px;height:28px;padding:0;border:none;' +
      'border-radius:999px;background:#D9CFBE;cursor:pointer;transition:background .16s}' +
      '#settingsPopup .settings-toggle[aria-checked="true"]{background:#2563EB}' +
      '#settingsPopup .settings-toggle[aria-checked="true"]:hover{background:#1D4ED8}' +
      '#settingsPopup .settings-toggle[aria-checked="true"]:active{background:#1E40AF}' +
      '#settingsPopup .settings-toggle-knob{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;' +
      'background:#fff;box-shadow:0 1px 3px rgba(60,40,20,.26);transition:transform .16s}' +
      '#settingsPopup .settings-toggle[aria-checked="true"] .settings-toggle-knob{transform:translateX(18px)}' +
      /* 하위 화면의 선택 목록: 고른 것만 강조색 + 체크 */
      '#settingsPopup .settings-option{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;' +
      'min-height:52px;padding:9px 18px;border:none;border-top:1px solid rgba(180,140,90,.13);' +
      'background:transparent;color:#3D2818;font-family:inherit;font-size:15.5px;font-weight:600;' +
      'text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '#settingsPopup .settings-option:active{background:rgba(244,232,205,.5)}' +
      '#settingsPopup .settings-option-label{flex:1;min-width:0}' +
      '#settingsPopup .settings-option-check{flex-shrink:0;width:16px;text-align:center;color:#2563EB;' +
      'font-weight:800;visibility:hidden}' +
      '#settingsPopup .settings-option[aria-checked="true"] .settings-option-check{visibility:visible}' +
      '#settingsPopup .settings-option[aria-checked="true"] .settings-option-label{color:#2563EB;font-weight:700}' +
      '#settingsPopup .settings-font-panel{padding:14px 18px 6px}' +
      '#settingsPopup .settings-font-panel .font-control{margin:0}' +
      '@media(min-width:769px){#settingsPopup.popup-overlay{align-items:center;padding:24px}' +
      '#settingsPopup .settings-sheet-box{border-radius:20px;max-height:min(84vh,780px)}}';
    document.head.appendChild(styleEl);
  }

  box.classList.add('settings-sheet-box');
  box.innerHTML = '';
  if (oldClose) oldClose.remove();

  /* ── 머리글 ─────────────────────────────────────────────── */
  var head = document.createElement('div');
  head.className = 'settings-head';

  var backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'settings-head-back';
  backBtn.innerHTML = '‹ 뒤로';
  backBtn.addEventListener('click', function () { showMainView(); });

  var titleEl = document.createElement('div');
  titleEl.className = 'settings-head-title';
  titleEl.id = 'settingsSheetTitle';
  titleEl.textContent = '설정';

  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'settings-head-close';
  closeBtn.id = 'settingsSheetClose';
  closeBtn.setAttribute('aria-label', '닫기');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', function () {
    if (typeof window.closeSettings === 'function') window.closeSettings();
    else popup.classList.remove('show');
  });

  head.appendChild(backBtn);
  head.appendChild(titleEl);
  head.appendChild(closeBtn);

  var scrollEl = document.createElement('div');
  scrollEl.className = 'settings-sheet-scroll';

  var mainView = document.createElement('div');
  mainView.id = 'settingsMainView';

  /* ── 만들기 도구 ─────────────────────────────────────────── */
  function addSection(title) {
    var section = document.createElement('div');
    section.className = 'settings-section';
    var heading = document.createElement('div');
    heading.className = 'settings-section-title';
    heading.textContent = title;
    section.appendChild(heading);
    mainView.appendChild(section);
    return section;
  }

  /* 왼쪽 이름 · 오른쪽 현재값 + › */
  function addRow(section, options) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'settings-menu-row';
    row.setAttribute('data-action', options.action);
    var label = document.createElement('span');
    label.className = 'settings-row-label';
    label.textContent = options.label;
    row.appendChild(label);
    var value = null;
    if (options.value !== false) {
      value = document.createElement('span');
      value.className = 'settings-row-value';
      row.appendChild(value);
    }
    var arrow = document.createElement('span');
    arrow.className = 'settings-row-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    row.appendChild(arrow);
    row.addEventListener('click', options.onClick);
    section.appendChild(row);
    return { row: row, value: value };
  }

  function addToggleRow(section, options) {
    var row = document.createElement('div');
    row.className = 'settings-menu-row';
    row.setAttribute('data-action', options.action);
    var label = document.createElement('span');
    label.className = 'settings-row-label';
    label.textContent = options.label;
    var value = document.createElement('span');
    value.className = 'settings-row-value';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'settings-toggle';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', options.label);
    toggle.innerHTML = '<span class="settings-toggle-knob"></span>';
    toggle.addEventListener('click', function () { options.onToggle(); });
    row.appendChild(label);
    row.appendChild(value);
    row.appendChild(toggle);
    section.appendChild(row);
    return { row: row, value: value, toggle: toggle };
  }

  /* 하위 화면(선택 목록) 만들기 */
  function makeSubView(title) {
    var view = document.createElement('div');
    view.hidden = true;
    view.setAttribute('data-sub-title', title);
    scrollEl.appendChild(view);
    return view;
  }

  function addOption(view, label, selected, onClick) {
    var option = document.createElement('button');
    option.type = 'button';
    option.className = 'settings-option';
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', selected ? 'true' : 'false');
    var check = document.createElement('span');
    check.className = 'settings-option-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    var text = document.createElement('span');
    text.className = 'settings-option-label';
    text.textContent = label;
    option.appendChild(check);
    option.appendChild(text);
    option.addEventListener('click', onClick);
    view.appendChild(option);
    return option;
  }

  /* ── 화면 전환 ─────────────────────────────────────────── */
  var subViews = [];

  function showMainView() {
    mainView.hidden = false;
    for (var i = 0; i < subViews.length; i++) subViews[i].hidden = true;
    titleEl.textContent = '설정';
    backBtn.removeAttribute('data-visible');
    refreshValues();
    scrollEl.scrollTop = 0;
  }

  function showSubView(view) {
    mainView.hidden = true;
    for (var i = 0; i < subViews.length; i++) subViews[i].hidden = (subViews[i] !== view);
    titleEl.textContent = view.getAttribute('data-sub-title') || '설정';
    backBtn.setAttribute('data-visible', '1');
    scrollEl.scrollTop = 0;
  }

  /* ── 기본 설정 ─────────────────────────────────────────── */
  var basicSection = addSection('기본 설정');
  var langRow = addRow(basicSection, {
    label: '언어',
    action: 'language',
    onClick: function () {
      if (!openLanguagePicker()) langRow.value.textContent = langLabel(currentLangCode());
    }
  });

  /* ── 화면 ──────────────────────────────────────────────── */
  var screenSection = addSection('화면');
  var fontView = makeSubView('글자 크기');
  subViews.push(fontView);
  var fontPanel = document.createElement('div');
  fontPanel.className = 'settings-font-panel';
  fontPanel.appendChild(fontCtrl);           /* 기존 － / 현재px / ＋ 조절을 그대로 쓴다 */
  fontView.appendChild(fontPanel);

  var fontRow = addRow(screenSection, {
    label: '글자 크기',
    action: 'font',
    onClick: function () {
      showSubView(fontView);
      try { if (window.GomnaTextScale) window.GomnaTextScale.refresh(); } catch (e) {}
    }
  });

  /* 테마는 공용 테마 스크립트(js/gomna-theme.js)가 실제로 적용한다. */
  var themeView = makeSubView('테마');
  subViews.push(themeView);
  var themeOptions = [];
  (function buildThemeOptions() {
    var list = (window.GomnaTheme && window.GomnaTheme.options) || [];
    for (var i = 0; i < list.length; i++) {
      (function (option) {
        var el = addOption(themeView, option.label, themePref() === option.id, function () {
          try { if (window.GomnaTheme) window.GomnaTheme.set(option.id); } catch (e) {}
          markThemeOptions();
          themeRow.value.textContent = themeLabel();
        });
        themeOptions.push({ id: option.id, el: el });
      })(list[i]);
    }
  })();

  function themePref() {
    try { if (window.GomnaTheme) return window.GomnaTheme.get(); } catch (e) {}
    return 'light';
  }

  function themeLabel() {
    try { if (window.GomnaTheme) return window.GomnaTheme.label(); } catch (e) {}
    return '라이트 모드';
  }

  function markThemeOptions() {
    var now = themePref();
    for (var i = 0; i < themeOptions.length; i++) {
      themeOptions[i].el.setAttribute('aria-checked', themeOptions[i].id === now ? 'true' : 'false');
    }
  }

  var themeRow = addRow(screenSection, {
    label: '테마',
    action: 'theme',
    onClick: function () { markThemeOptions(); showSubView(themeView); }
  });

  /* ── 읽기 ──────────────────────────────────────────────── */
  var readSection = addSection('읽기');
  var lineView = makeSubView('본문 줄 간격');
  subViews.push(lineView);
  var lineOptions = [];
  (function buildLineOptions() {
    for (var i = 0; i < READ_LINE_STEPS.length; i++) {
      (function (step) {
        var option = addOption(lineView, step.label, readLineStep().id === step.id, function () {
          applyReadLine(step, true);
          markLineOptions();
          lineRow.value.textContent = step.label;
        });
        lineOptions.push({ id: step.id, el: option });
      })(READ_LINE_STEPS[i]);
    }
  })();

  function markLineOptions() {
    var now = readLineStep().id;
    for (var i = 0; i < lineOptions.length; i++) {
      lineOptions[i].el.setAttribute('aria-checked', lineOptions[i].id === now ? 'true' : 'false');
    }
  }

  var lineRow = addRow(readSection, {
    label: '본문 줄 간격',
    action: 'line-height',
    onClick: function () { markLineOptions(); showSubView(lineView); }
  });

  /* ── 개인정보 ──────────────────────────────────────────── */
  var privacySection = addSection('개인정보');
  addRow(privacySection, {
    label: '쿠키 및 분석 설정',
    action: 'cookie',
    value: false,
    onClick: function () {
      try { if (typeof window.closeSettings === 'function') window.closeSettings(); } catch (e) {}
      window.openCookieSettings();
    }
  });

  /* ── 앱 정보 ───────────────────────────────────────────── */
  var appSection = addSection('앱 정보');
  addRow(appSection, {
    label: '개인정보처리방침',
    action: 'privacy',
    value: false,
    onClick: function () { location.href = '/privacy.html'; }
  });
  addRow(appSection, {
    label: '서비스 이용약관',
    action: 'terms',
    value: false,
    onClick: function () { location.href = '/terms.html'; }
  });

  /* ── 현재값 갱신 ───────────────────────────────────────── */
  function refreshValues() {
    langRow.value.textContent = langLabel(currentLangCode());
    var step = null;
    try { if (window.GomnaTextScale) step = window.GomnaTextScale.get(); } catch (e) {}
    fontRow.value.textContent = (step || 22) + 'px';
    themeRow.value.textContent = themeLabel();
    lineRow.value.textContent = readLineStep().label;
  }

  scrollEl.appendChild(mainView);
  box.appendChild(head);
  box.appendChild(scrollEl);
  refreshValues();

  /* 글자 크기가 바뀌면 설정 메인의 현재값도 곧바로 맞춘다. */
  window.addEventListener('gomna:text-scale', function () {
    try { fontRow.value.textContent = (window.GomnaTextScale.get() || 22) + 'px'; } catch (e) {}
  });
  /* 언어가 바뀌면 현재값을 다시 읽는다. */
  window.addEventListener('gomna:ui-language-changed', function () {
    try { langRow.value.textContent = langLabel(currentLangCode()); } catch (e) {}
  });
  /* 테마가 바뀌면(자동에서 기기 설정이 바뀐 경우 포함) 현재값을 다시 읽는다. */
  window.addEventListener('gomna:theme-changed', function () {
    try { themeRow.value.textContent = themeLabel(); markThemeOptions(); } catch (e) {}
  });

  var origOpen = window.openSettings;
  window.openSettings = function () {
    if (origOpen) origOpen();
    showMainView();
  };
})();
