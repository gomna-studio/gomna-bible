/* 은혜의말씀 — 화면 테마(홈·Reader 공용)
   ────────────────────────────────────────────────────────────
   테마는 html의 data-gomna-theme 하나로 바뀐다(요소마다 색을 직접 칠하지 않는다).

     data-gomna-theme="light"  지금까지의 아이보리 화면 그대로
     data-gomna-theme="dark"   차분한 웜 다크

   속성 이름에 gomna를 붙인 이유: css/gomna-audio-player.css에 이미
   [data-theme="light"] / [data-theme="dark"] 규칙(네이비 계열)이 들어 있어
   그 이름을 쓰면 라이트 화면까지 함께 바뀐다. 이름을 나눠 충돌을 막는다.

   방식:
     1) 다크 팔레트를 공용 변수로 한 곳에 정의한다(--gomna-bg / surface / text ...).
     2) 이미 있는 CSS 규칙은 절대 고치지 않고, 그 규칙의 색만 살펴서
        "html[data-theme='dark'] 같은선택자 { ... }" 형태의 덮어쓰기 규칙을
        따로 한 장의 스타일로 만들어 붙인다.
     → 라이트 모드는 규칙이 하나도 바뀌지 않으므로 지금 화면과 완전히 같다.

   색을 고르는 기준:
     흰색·아이보리 배경 → --gomna-surface / --gomna-surface-soft
     짙은 갈색·검정 글자 → --gomna-text / --gomna-text-muted
     옅은 경계선        → --gomna-border
     짙은 파랑·초록·빨강 글자 → 색은 그대로 두고 밝기만 올려 읽히게 한다
   금색과 강조색(#2563EB), 사진·그라디언트는 건드리지 않는다. */
(function () {
  var STORAGE_KEY = 'gomna_theme_v1';
  var PALETTE_ID = 'gomna-theme-palette';
  var GENERATED_ID = 'gomna-theme-generated';
  var FIX_ID = 'gomna-theme-fixes';
  var OPTIONS = [
    { id: 'light', label: '라이트 모드' },
    { id: 'dark', label: '다크 모드' },
    { id: 'auto', label: '자동' }
  ];
  /* 다크 팔레트 */
  var BG = '#181310';
  var SURFACE = '#262019';
  var SURFACE_SOFT = '#2E2720';
  var TEXT = '#F1E6D6';
  var TEXT_MUTED = '#B8A68E';
  var BORDER = 'rgba(240,226,202,.16)';
  var ACCENT = '#2563EB';
  /* 강조색은 라이트와 똑같이 유지한다. */
  var KEEP = { '#2563eb': 1, '#1d4ed8': 1, '#1e40af': 1, 'rgb(37, 99, 235)': 1 };

  var root = document.documentElement;
  var doneSheets = [];
  var pref = 'light';
  var media = null;
  var rescanTimer = 0;
  var generated = null;
  var generatedCount = 0;

  function readPref() {
    var saved = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch (e) {}
    for (var i = 0; i < OPTIONS.length; i++) {
      if (OPTIONS[i].id === saved) return saved;
    }
    return 'light';   /* 저장값이 없으면 지금 화면(라이트) 그대로 */
  }

  function deviceDark() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
    catch (e) { return false; }
  }

  function resolve(next) {
    return next === 'dark' || (next === 'auto' && deviceDark()) ? 'dark' : 'light';
  }

  /* ── 색 살펴보기 ─────────────────────────────────────────── */
  function parseColor(token) {
    var text = String(token).trim().toLowerCase();
    if (text === 'white') return [255, 255, 255, 1];
    if (text === 'black') return [0, 0, 0, 1];
    var hex = text.match(/^#([0-9a-f]{3,8})$/);
    if (hex) {
      var body = hex[1];
      if (body.length === 3 || body.length === 4) {
        var expanded = '';
        for (var i = 0; i < body.length; i++) expanded += body[i] + body[i];
        body = expanded;
      }
      if (body.length !== 6 && body.length !== 8) return null;
      return [
        parseInt(body.slice(0, 2), 16), parseInt(body.slice(2, 4), 16), parseInt(body.slice(4, 6), 16),
        body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1
      ];
    }
    var rgb = text.match(/^rgba?\(([^)]+)\)$/);
    if (!rgb) return null;
    var parts = rgb[1].split(/[\s,\/]+/).filter(function (p) { return p !== ''; });
    if (parts.length < 3) return null;
    var values = [];
    for (var k = 0; k < 3; k++) {
      var num = parseFloat(parts[k]);
      if (isNaN(num)) return null;
      values.push(parts[k].indexOf('%') !== -1 ? Math.round(num * 2.55) : num);
    }
    var alpha = 1;
    if (parts.length > 3) {
      var a = parseFloat(parts[3]);
      if (!isNaN(a)) alpha = parts[3].indexOf('%') !== -1 ? a / 100 : a;
    }
    values.push(alpha);
    return values;
  }

  function brightness(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }

  function saturation(c) {
    var max = Math.max(c[0], c[1], c[2]);
    return max === 0 ? 0 : (max - Math.min(c[0], c[1], c[2])) / max;
  }

  function hue(c) {
    var r = c[0], g = c[1], b = c[2];
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return 0;
    var h;
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    return h < 0 ? h + 360 : h;
  }

  /* 회색빛이거나 따뜻한(갈색·베이지) 색인가 — 금색·파랑·초록은 제외 */
  function neutralOrWarm(c, satLimit) {
    var s = saturation(c);
    if (s <= 0.18) return true;
    var h = hue(c);
    return s <= satLimit && h >= 12 && h <= 62;
  }

  /* 유채색 글자는 색을 유지하고 밝기만 올린다(아이보리와 섞는다). */
  function lift(c, amount) {
    var target = [241, 230, 214];
    var out = [];
    for (var i = 0; i < 3; i++) out.push(Math.round(c[i] + (target[i] - c[i]) * amount));
    var alpha = c[3] < 1 ? Math.min(1, c[3] + 0.25) : 1;
    return alpha < 1
      ? 'rgba(' + out[0] + ',' + out[1] + ',' + out[2] + ',' + Math.round(alpha * 100) / 100 + ')'
      : 'rgb(' + out[0] + ',' + out[1] + ',' + out[2] + ')';
  }

  /* 밝은 색을 같은 결의 어두운 색으로 바꾼다(옅은 그라디언트를 살릴 때 쓴다). */
  function darkenLight(c) {
    var t = Math.min(1, Math.max(0, (brightness(c) - 0.72) / 0.28));
    var from = [24, 19, 16], to = [46, 39, 32];
    var out = [];
    for (var i = 0; i < 3; i++) out.push(Math.round(from[i] + (to[i] - from[i]) * t));
    return c[3] < 1
      ? 'rgba(' + out[0] + ',' + out[1] + ',' + out[2] + ',' + c[3] + ')'
      : 'rgb(' + out[0] + ',' + out[1] + ',' + out[2] + ')';
  }

  /* 사진·장식 그림은 테마 때문에 바꾸지 않는다. */
  var DECOR_RE = /\.b-|verse-card|globe|logo|icon|badge|photo|shade|avatar|thumb|spinner|skeleton/i;
  /* 토글 손잡이처럼 흰색이어야 하는 부품은 배경을 바꾸지 않는다. */
  var KEEP_WHITE_RE = /knob|handle|thumb|switch-dot|toggle-dot/i;
  var COLOR_TOKEN_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)/g;

  /* 옅은 아이보리 그라디언트는 색만 어둡게 바꿔 결을 살린다(유채색 그라디언트는 그대로). */
  function darkGradient(value, selectorText) {
    if (value.indexOf('gradient') === -1 || value.indexOf('url(') !== -1) return null;
    if (selectorText && DECOR_RE.test(selectorText)) return null;
    var tokens = value.match(COLOR_TOKEN_RE);
    if (!tokens || !tokens.length) return null;
    for (var i = 0; i < tokens.length; i++) {
      var color = parseColor(tokens[i]);
      if (!color) return null;
      if (color[3] < 0.5) continue;                     /* 살짝 덧칠한 층은 그대로 */
      if (brightness(color) < 0.72 || !neutralOrWarm(color, 0.4)) return null;
    }
    return value.replace(COLOR_TOKEN_RE, function (token) {
      var color = parseColor(token);
      if (!color || color[3] < 0.5) return token;
      return darkenLight(color);
    });
  }

  var BG_PROPS = { 'background-color': 1 };
  var INK_PROPS = { 'color': 1, 'fill': 1, 'stroke': 1, '-webkit-text-fill-color': 1 };
  var LINE_RE = /-color$/;   /* border-*-color, outline-color, column-rule-color … */

  /* 이 색을 다크에서 무엇으로 바꿀지 정한다. 바꿀 필요가 없으면 null. */
  function darkValue(prop, value) {
    var text = String(value).trim();
    if (!text || text === 'transparent' || text === 'currentcolor' || text === 'inherit') return null;
    if (text.indexOf('var(') !== -1 || text.indexOf('gradient') !== -1 || text.indexOf('url(') !== -1) return null;
    if (KEEP[text.toLowerCase()]) return null;
    var color = parseColor(text);
    if (!color) return null;
    if (KEEP['#' + [color[0], color[1], color[2]].map(function (v) {
      return ('0' + v.toString(16)).slice(-2);
    }).join('')]) return null;
    var b = brightness(color);
    if (BG_PROPS[prop]) {
      if (color[3] < 0.6) return null;                          /* 반투명 덧칠은 그대로 */
      if (b < 0.72 || !neutralOrWarm(color, 0.45)) return null;  /* 유채색 배경은 그대로 */
      return b >= 0.93 ? 'var(--gomna-surface)' : 'var(--gomna-surface-soft)';
    }
    if (INK_PROPS[prop]) {
      if (color[3] < 0.3) return null;
      if (b > 0.55) return null;                                 /* 이미 밝은 글자는 그대로 */
      if (neutralOrWarm(color, 0.75)) {
        return b <= 0.32 ? 'var(--gomna-text)' : 'var(--gomna-text-muted)';
      }
      if (b <= 0.45) return lift(color, 0.62);                   /* 짙은 파랑·초록·빨강은 밝기만 올린다 */
      return null;
    }
    if (LINE_RE.test(prop)) {
      if (b < 0.6 || !neutralOrWarm(color, 0.42)) return null;
      return 'var(--gomna-border)';
    }
    return null;
  }

  /* 색을 담아 둔 CSS 변수도 같은 팔레트로 묶는다(쓰임을 모르니 밝기로만 판단한다).
     변수 선언은 style[i]로 훑을 수 없어 cssText에서 직접 읽는다. */
  var CUSTOM_RE = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+)/g;

  function customOverrides(style) {
    var text = style.cssText || '';
    if (text.indexOf('--') === -1) return '';
    var out = '';
    var match;
    CUSTOM_RE.lastIndex = 0;
    while ((match = CUSTOM_RE.exec(text))) {
      var prop = match[1];
      var raw = match[2].trim();
      var bang = /!important$/i.test(raw);
      if (bang) raw = raw.replace(/!important$/i, '').trim();
      if (KEEP[raw.toLowerCase()]) continue;
      var color = parseColor(raw);
      if (!color) continue;
      var b = brightness(color);
      var next = null;
      if (color[3] >= 0.6 && b >= 0.72 && neutralOrWarm(color, 0.45)) next = 'var(--gomna-surface-soft)';
      else if (b <= 0.32 && neutralOrWarm(color, 0.75)) next = 'var(--gomna-text)';
      else if (b <= 0.5 && neutralOrWarm(color, 0.75)) next = 'var(--gomna-text-muted)';
      if (!next) continue;
      out += prop + ':' + next + (bang ? '!important' : '') + ';';
    }
    return out;
  }

  /* var()가 섞인 축약 선언(background: … var(…) …)은 낱개 속성이 비어 있어
     축약 값을 직접 읽어 색만 바꿔 준다. */
  var SHORTHANDS = ['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'outline'];

  function shorthandOverrides(style, selectorText) {
    var out = '';
    for (var i = 0; i < SHORTHANDS.length; i++) {
      var prop = SHORTHANDS[i];
      var value = style.getPropertyValue(prop);
      if (!value || value.indexOf('var(') === -1) continue;   /* 낱개로 잘 풀린 선언은 위에서 처리했다 */
      var next = null;
      if (prop === 'background') {
        if (selectorText && KEEP_WHITE_RE.test(selectorText)) continue;
        next = darkGradient(value, selectorText);
        if (!next) next = darkValue('background-color', value);
      } else {
        next = value.replace(COLOR_TOKEN_RE, function (token) {
          var color = parseColor(token);
          if (!color || brightness(color) < 0.6 || !neutralOrWarm(color, 0.42)) return token;
          return 'var(--gomna-border)';
        });
        if (next === value) next = null;
      }
      if (!next) continue;
      out += prop + ':' + next + (style.getPropertyPriority(prop) ? '!important' : '') + ';';
    }
    return out;
  }

  function overridesFor(style, selectorText) {
    var out = customOverrides(style) + shorthandOverrides(style, selectorText);
    for (var i = 0; i < style.length; i++) {
      var prop = style[i];
      if (!prop) continue;
      var next = null;
      if (BG_PROPS[prop] && selectorText && KEEP_WHITE_RE.test(selectorText)) continue;
      if (prop === 'background-image') {
        next = darkGradient(style.getPropertyValue(prop), selectorText);
      } else if (BG_PROPS[prop] || INK_PROPS[prop] || LINE_RE.test(prop)) {
        next = darkValue(prop, style.getPropertyValue(prop));
      }
      if (!next) continue;
      out += prop + ':' + next + (style.getPropertyPriority(prop) ? '!important' : '') + ';';
    }
    return out;
  }

  /* "html[data-theme='dark']"를 선택자 앞에 붙인다. html/:root로 시작하면 그 자리에 끼운다. */
  function scopeSelector(selectorText) {
    var parts = selectorText.split(',');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var sel = parts[i].trim();
      if (!sel) continue;
      if (sel.indexOf('::view-transition') === 0) continue;
      if (/^html\b/i.test(sel)) out.push(sel.replace(/^html/i, 'html[data-gomna-theme="dark"]'));
      else if (/^:root\b/i.test(sel)) out.push(sel.replace(/^:root/i, ':root[data-gomna-theme="dark"]'));
      else out.push('html[data-gomna-theme="dark"] ' + sel);
    }
    return out.join(',');
  }

  function collect(rules, condition, buffer) {
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var inner = null;
      try { inner = rule.cssRules; } catch (e) { inner = null; }
      if (inner && inner.length) {
        var nextCondition = condition;
        if (rule.media && rule.media.mediaText) {
          nextCondition = (condition ? condition + ' and ' : '') + '(' + rule.media.mediaText + ')';
        } else if (rule.conditionText && rule.type === 12 /* @supports */) {
          nextCondition = condition;
        } else if (rule.type === 7 /* @keyframes */) {
          continue;                                   /* 애니메이션 단계는 건드리지 않는다 */
        }
        collect(inner, nextCondition, buffer);
        continue;
      }
      if (!rule.style || typeof rule.selectorText !== 'string') continue;
      var decls = overridesFor(rule.style, rule.selectorText);
      if (!decls) continue;
      var selector = scopeSelector(rule.selectorText);
      if (!selector) continue;
      var text = selector + '{' + decls + '}';
      if (condition) text = '@media ' + condition + '{' + text + '}';
      buffer.push(text);
      generatedCount++;
    }
  }

  function scanSheets() {
    if (!generated) return;
    var sheets = document.styleSheets;
    var buffer = [];
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      if (!sheet || doneSheets.indexOf(sheet) !== -1) continue;
      var owner = sheet.ownerNode;
      if (owner && (owner.id === PALETTE_ID || owner.id === GENERATED_ID || owner.id === FIX_ID)) {
        doneSheets.push(sheet);
        continue;
      }
      var rules = null;
      try { rules = sheet.cssRules; } catch (e) { rules = null; }
      if (!rules) continue;                     /* 아직 못 받아온 스타일은 다음 검사에서 */
      doneSheets.push(sheet);
      try { collect(rules, '', buffer); } catch (e) {}
    }
    if (buffer.length) generated.appendChild(document.createTextNode(buffer.join('')));
  }

  function rescan() {
    try { scanSheets(); } catch (e) {}
  }

  function scheduleRescan() {
    if (rescanTimer) return;
    rescanTimer = window.setTimeout(function () { rescanTimer = 0; rescan(); }, 60);
  }

  /* ── 팔레트와 손질 규칙 ─────────────────────────────────── */
  /* style 속성으로 직접 칠해 둔 자리(말씀풀이 본문 등)를 한 규칙으로 모아 준다. */
  function inlineFix(prop, values, declaration) {
    var selectors = [];
    for (var i = 0; i < values.length; i++) {
      selectors.push('html[data-gomna-theme="dark"] [style*="' + prop + ':' + values[i] + '"]');
      selectors.push('html[data-gomna-theme="dark"] [style*="' + prop + ': ' + values[i] + '"]');
    }
    return selectors.join(',') + '{' + declaration + '}';
  }

  function ensureStyles() {
    if (document.getElementById(PALETTE_ID)) return;
    var head = document.head || root;

    var palette = document.createElement('style');
    palette.id = PALETTE_ID;
    palette.textContent =
      'html[data-gomna-theme="dark"]{color-scheme:dark;' +
      '--gomna-bg:' + BG + ';--gomna-surface:' + SURFACE + ';--gomna-surface-soft:' + SURFACE_SOFT + ';' +
      '--gomna-text:' + TEXT + ';--gomna-text-muted:' + TEXT_MUTED + ';--gomna-border:' + BORDER + ';' +
      '--gomna-accent:' + ACCENT + ';--gomna-shadow:0 10px 30px rgba(0,0,0,.55)}' +
      'html[data-gomna-theme="dark"] body{background:var(--gomna-bg)!important;color:var(--gomna-text)}';
    head.appendChild(palette);

    generated = document.createElement('style');
    generated.id = GENERATED_ID;
    head.appendChild(generated);

    /* 자동 판단으로는 어색해지는 자리만 손으로 맞춘다. */
    var fixes = document.createElement('style');
    fixes.id = FIX_ID;
    fixes.textContent =
      /* 화면들이 이미 쓰던 색 변수는 쓰임에 맞춰 직접 묶는다(자동 판단보다 이 값이 우선) */
      'html[data-gomna-theme="dark"]{' +
      '--gm-ink:var(--gomna-text);--gm-card-bg:var(--gomna-surface);--gm-btn-bg:var(--gomna-surface-soft);' +
      '--gm-card-border:var(--gomna-border);--gm-card-border-slim:1px solid var(--gomna-border);' +
      '--gm-card-divider:var(--gomna-border);--gm-card-shadow:0 1px 2px rgba(0,0,0,.45);' +
      '--gm-gold-deep:#D9AE64;--gm-cream:var(--gomna-surface-soft);' +
      '--gm-hover-surface:rgba(255,240,215,.10);--gm-hover-btn:rgba(255,240,215,.10);' +
      '--gm-hover-btn-strong:rgba(255,240,215,.13);--gm-hover-chip:rgba(255,240,215,.10);' +
      '--gm-hover-active:rgba(255,240,215,.16);' +
      '--text:var(--gomna-text);--text-light:var(--gomna-text-muted);' +
      '--primary:var(--gomna-text);--primary-dark:var(--gomna-text);' +
      '--cream:var(--gomna-surface);--border:var(--gomna-border)}' +
      /* 큰 바탕 */
      'html[data-gomna-theme="dark"] .phone-frame{background:var(--gomna-bg)!important;box-shadow:none}' +
      'html[data-gomna-theme="dark"] .container{background:transparent}' +
      /* 사진 위에 얹힌 글자는 라이트와 같게 둔다(사진은 그대로이므로) */
      'html[data-gomna-theme="dark"] .verse-card .gm-btn-today-open{color:#111;border-color:rgba(0,0,0,.7)}' +
      'html[data-gomna-theme="dark"] .verse-card .verse-date-btn{color:#5a4632;border-color:rgba(180,140,90,.42)}' +
      'html[data-gomna-theme="dark"] .verse-card .verse-date-btn svg{stroke:#6a5542}' +
      /* 입력칸은 라이트 색이 남지 않게 한 번 더 맞춘다 */
      'html[data-gomna-theme="dark"] :where(input,select,textarea)' +
      '{background-color:var(--gomna-surface-soft);color:var(--gomna-text);border-color:var(--gomna-border)}' +
      'html[data-gomna-theme="dark"] :where(input,textarea)::placeholder{color:var(--gomna-text-muted)}' +
      /* 흰 동그라미로 보여야 하는 작은 부품 */
      'html[data-gomna-theme="dark"] .settings-toggle-knob,' +
      'html[data-gomna-theme="dark"] .gomna-audio-toggle-knob{background:' + TEXT + '!important}' +
      /* 인라인 style로 칠해 둔 자리(쿠키 안내·말씀풀이 본문 등) */
      'html[data-gomna-theme="dark"] #cookie-banner{background:rgba(38,32,25,.97)!important;' +
      'color:var(--gomna-text)!important;border-color:var(--gomna-border)!important}' +
      'html[data-gomna-theme="dark"] #cookie-banner :where(div,label,span,p){color:var(--gomna-text)!important}' +
      'html[data-gomna-theme="dark"] #cookie-banner a{color:#D9AE64!important}' +
      'html[data-gomna-theme="dark"] #cookie-banner button[onclick*="reject"]' +
      '{background:var(--gomna-surface-soft)!important;color:var(--gomna-text)!important;' +
      'border-color:var(--gomna-border)!important}' +
      /* 인라인 style 값은 브라우저가 rgb()로 다시 적어 두기도 해서 두 표기를 모두 본다 */
      inlineFix('background', ['#fff', 'rgb(255, 255, 255)', '#f5f5f5', 'rgb(245, 245, 245)'],
        'background:var(--gomna-surface-soft)!important') +
      inlineFix('color', ['#333', 'rgb(51, 51, 51)', '#5a3818', 'rgb(90, 56, 24)',
        '#5D4516', 'rgb(93, 69, 22)'], 'color:var(--gomna-text)!important') +
      inlineFix('color', ['#888', 'rgb(136, 136, 136)', '#6e5536', 'rgb(110, 85, 54)',
        '#6B5028', 'rgb(107, 80, 40)'], 'color:var(--gomna-text-muted)!important') +
      inlineFix('color', ['#1565C0', 'rgb(21, 101, 192)'], 'color:#8FBEEC!important') +
      inlineFix('color', ['#2E7D32', 'rgb(46, 125, 50)'], 'color:#8BC98E!important') +
      inlineFix('color', ['#c00', 'rgb(204, 0, 0)'], 'color:#F0958C!important') +
      inlineFix('color', ['#8B6914', 'rgb(139, 105, 20)'], 'color:#D9AE64!important') +
      /* 주요 액션은 라이트와 같은 강조색을 유지한다 */
      'html[data-gomna-theme="dark"] .gomna-pe-save{background:' + ACCENT + ';border-color:' + ACCENT + ';color:#FFFFFF}' +
      'html[data-gomna-theme="dark"] .settings-toggle[aria-checked="true"]{background:' + ACCENT + '}' +
      'html[data-gomna-theme="dark"] .settings-option[aria-checked="true"] .settings-option-label,' +
      'html[data-gomna-theme="dark"] .settings-option-check{color:' + ACCENT + '}';
    head.appendChild(fixes);
  }

  /* ── 적용 ────────────────────────────────────────────────── */
  function announce(mode) {
    try {
      window.dispatchEvent(new CustomEvent('gomna:theme-changed', { detail: { pref: pref, mode: mode } }));
    } catch (e) {}
  }

  function apply(next, persist) {
    pref = next;
    var mode = resolve(next);
    try {
      root.setAttribute('data-gomna-theme', mode);
      root.setAttribute('data-gomna-theme-pref', next);
    } catch (e) {}
    if (persist) {
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    }
    watchDevice();
    rescan();
    announce(mode);
    return mode;
  }

  /* 자동일 때는 기기 설정이 바뀌면 새로고침 없이 곧바로 따라간다. */
  function onDeviceChange() {
    if (pref !== 'auto') return;
    var mode = resolve('auto');
    if (root.getAttribute('data-gomna-theme') === mode) return;
    root.setAttribute('data-gomna-theme', mode);
    announce(mode);
  }

  function watchDevice() {
    if (media) return;
    try { media = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { media = null; }
    if (!media) return;
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onDeviceChange);
    else if (typeof media.addListener === 'function') media.addListener(onDeviceChange);
  }

  ensureStyles();
  apply(readPref(), false);   /* 저장값은 첫 그림 전에 반영해 깜빡임을 막는다 */

  /* 나중에 붙는 스타일(계정·프로필·설정·언어창·오디오 등)도 같은 방식으로 처리한다. */
  try {
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === 'STYLE' || node.tagName === 'LINK') { scheduleRescan(); return; }
        }
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  } catch (e) {}

  document.addEventListener('DOMContentLoaded', rescan);
  window.addEventListener('load', rescan);
  window.setTimeout(rescan, 1200);
  window.setTimeout(rescan, 3000);

  function resolveId(next) {
    for (var i = 0; i < OPTIONS.length; i++) {
      if (OPTIONS[i].id === next) return next;
    }
    return 'light';
  }

  window.GomnaTheme = {
    options: OPTIONS.slice(),
    get: function () { return pref; },
    mode: function () { return root.getAttribute('data-gomna-theme') || 'light'; },
    label: function (id) {
      var target = id || pref;
      for (var i = 0; i < OPTIONS.length; i++) {
        if (OPTIONS[i].id === target) return OPTIONS[i].label;
      }
      return OPTIONS[0].label;
    },
    set: function (next) { return apply(resolveId(next), true); },
    refresh: rescan,
    ruleCount: function () { return generatedCount; }
  };
})();
