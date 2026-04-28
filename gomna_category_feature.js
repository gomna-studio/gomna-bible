/* ============================================================ */
/* 은혜의말씀 - 카테고리 3단 자동 안내 기능 (2026.4.28)         */
/* 제거하려면 index.html에서 이 파일 불러오는 <script> 줄 삭제   */
/* ============================================================ */
(function(){
  // === 1. 스타일 주입 ===
  var styleEl = document.createElement('style');
  styleEl.id = 'cat-feature-styles';
  styleEl.textContent =
    '.cat-section{margin-bottom:24px}' +
    '.cat-trow{display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap}' +
    '.cat-trow .section-title{margin:0 !important}' +
    '.cat-replay{padding:4px 11px 4px 9px;border-radius:999px;border:1px solid rgba(184,134,11,0.45);background:rgba(255,250,244,0.92);color:#7a4b17;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px;flex-shrink:0;white-space:nowrap;line-height:1;animation:catInfoIn 0.4s ease-out both;font-family:inherit}' +
    '.cat-replay:hover{background:rgba(255,245,225,1);border-color:rgba(184,134,11,0.65)}' +
    '.cat-replay:active{transform:scale(0.95)}' +
    '.cat-replay-icon{font-size:13px;font-weight:900;display:inline-block;line-height:1}' +
    '.cat-replay-icon.is-spinning{animation:catSpin 0.7s ease-in-out}' +
    '.cat-tagrow{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;max-height:80px;overflow:hidden;transition:max-height 0.45s ease,opacity 0.4s ease,margin 0.35s ease}' +
    '.cat-tag{display:inline-block;border-radius:999px;background:rgba(191,139,34,0.15);border:1px solid rgba(191,139,34,0.25);padding:4px 11px;font-size:11px;font-weight:800;color:#76480f;animation:catTagIn 0.4s ease-out both}' +
    '.cat-desc-box{border-radius:0 12px 12px 0;background:rgba(255,255,255,0.75);border:1px solid #eadfd7;border-left:4px solid #c08a2c;padding:10px 12px;animation:catBoxIn 0.6s ease-out both;max-height:140px;overflow:hidden;transition:max-height 0.45s ease,opacity 0.4s ease,padding 0.35s ease,margin 0.35s ease,border-top-width 0.35s ease,border-bottom-width 0.35s ease,border-left-width 0.35s ease;margin-bottom:12px}' +
    '.cat-desc-txt{font-size:13px;line-height:1.6;font-weight:600;color:#5a3b2a;margin:0;animation:catTxtIn 0.7s ease-out both}' +
    '.cat-collapsed{max-height:0 !important;opacity:0 !important;padding-top:0 !important;padding-bottom:0 !important;margin-top:0 !important;margin-bottom:0 !important;border-top-width:0 !important;border-bottom-width:0 !important;border-left-width:0 !important}' +
    '@keyframes catTagIn{from{opacity:0;transform:translateY(8px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}' +
    '@keyframes catBoxIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}' +
    '@keyframes catTxtIn{from{opacity:0}to{opacity:1}}' +
    '@keyframes catInfoIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}' +
    '@keyframes catSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
  document.head.appendChild(styleEl);

  // === 2. 카테고리 정보 ===
  var otInfo = {
    "모세오경": {tags:["율법서","언약서"], desc:"창조와 구원, 그리고 하나님 백성의 법과 언약이 시작되는 말씀입니다."},
    "역사서":   {tags:["구속사서","신정사서","사서(史書)"], desc:"순종과 불순종의 역사 속에서도 신실하게 일하시는 하나님의 이야기입니다."},
    "시가서":   {tags:["지혜서","찬양서"], desc:"고난과 삶의 자리에서 하나님께 올려드린 기도와 찬양, 그리고 지혜의 말씀입니다."},
    "대선지서": {tags:["대예언서","예언서"], desc:"이스라엘과 열방을 향한 심판의 경고와 회복의 약속을 담은 말씀입니다."},
    "소선지서": {tags:["열두예언서","소예언서"], desc:"타락한 시대를 향해 돌아오라 부르시는 하나님의 사랑과 공의의 말씀입니다."}
  };
  var ntInfo = {
    "복음서":   {tags:["복음서","복음기록서"], desc:"예수 그리스도의 생애와 십자가 죽음, 그리고 부활의 기쁜 소식입니다."},
    "역사서":   {tags:["초대교회사","사도행전사"], desc:"성령의 임재로 세워진 교회가 땅끝까지 복음을 전해 가는 이야기입니다."},
    "바울서신": {tags:["바울서신","교리서신","목회서신"], desc:"교회의 질서를 세우고 복음의 진리를 가르치는 목회 편지입니다."},
    "공동서신": {tags:["공동서신","보편서신","권면서신"], desc:"고난과 박해 속에서도 성도들이 믿음을 지키도록 격려하는 권면의 말씀입니다."},
    "예언서":   {tags:["묵시문학서","예언서","계시서"], desc:"다시 오실 예수님과 함께 완성될 영원한 하나님 나라의 승리의 약속입니다."}
  };

  function enhanceView(viewId, info){
    var view = document.getElementById(viewId);
    if (!view) return;
    var titles = view.querySelectorAll('.section-title');
    for (var i = 0; i < titles.length; i++) enhanceTitle(titles[i], info);
  }

  function enhanceTitle(titleEl, info){
    if (titleEl.parentElement && titleEl.parentElement.classList.contains('cat-trow')) return;
    var raw = titleEl.textContent.trim();
    var spaceIdx = raw.indexOf(' ');
    var catName = (spaceIdx > -1) ? raw.substring(spaceIdx + 1).trim() : raw;
    var data = info[catName];
    if (!data) return;

    var section = document.createElement('div');
    section.className = 'cat-section';
    section.setAttribute('data-cat', catName);

    var trow = document.createElement('div');
    trow.className = 'cat-trow';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-replay';
    btn.setAttribute('aria-label', catName + ' 다시보기');
    btn.innerHTML = '<span class="cat-replay-icon">↻</span> 다시보기';

    var tagrow = document.createElement('div');
    tagrow.className = 'cat-tagrow';
    for (var i = 0; i < data.tags.length; i++) {
      var span = document.createElement('span');
      span.className = 'cat-tag';
      span.style.animationDelay = (0.4 + i * 0.15) + 's';
      span.textContent = data.tags[i];
      tagrow.appendChild(span);
    }

    var box = document.createElement('div');
    box.className = 'cat-desc-box';
    box.style.animationDelay = '1.0s';
    var p = document.createElement('p');
    p.className = 'cat-desc-txt';
    p.style.animationDelay = '1.2s';
    p.textContent = data.desc;
    box.appendChild(p);

    var parent = titleEl.parentNode;
    var nextSib = titleEl.nextElementSibling;

    parent.insertBefore(section, titleEl);
    trow.appendChild(titleEl);
    trow.appendChild(btn);
    section.appendChild(trow);
    section.appendChild(tagrow);
    section.appendChild(box);

    if (nextSib && nextSib.classList && nextSib.classList.contains('book-grid')) {
      section.appendChild(nextSib);
    }

    setupAnimation(section, btn);
  }

  function setupAnimation(sec, btn){
    var tagrow = sec.querySelector('.cat-tagrow');
    var tags = sec.querySelectorAll('.cat-tag');
    var box = sec.querySelector('.cat-desc-box');
    var txt = sec.querySelector('.cat-desc-txt');
    var icon = btn.querySelector('.cat-replay-icon');
    var timer = null;

    function hide(){
      if (tagrow) tagrow.classList.add('cat-collapsed');
      if (box) box.classList.add('cat-collapsed');
    }

    function showAgain(){
      if (icon) {
        icon.classList.remove('is-spinning');
        void icon.offsetHeight;
        icon.classList.add('is-spinning');
      }
      var els = [];
      for (var i = 0; i < tags.length; i++) els.push(tags[i]);
      if (box) els.push(box);
      if (txt) els.push(txt);
      for (var j = 0; j < els.length; j++) els[j].style.animation = 'none';
      void sec.offsetHeight;

      var tagDelays = [0.1, 0.25, 0.4];
      for (var k = 0; k < tags.length; k++) {
        tags[k].style.animation = 'catTagIn 0.4s ease-out ' + (tagDelays[k] !== undefined ? tagDelays[k] : 0.4) + 's both';
      }
      if (box) box.style.animation = 'catBoxIn 0.5s ease-out 0.65s both';
      if (txt) txt.style.animation = 'catTxtIn 0.6s ease-out 0.85s both';

      if (tagrow) tagrow.classList.remove('cat-collapsed');
      if (box) box.classList.remove('cat-collapsed');

      if (timer) clearTimeout(timer);
      timer = setTimeout(hide, 4500);
    }

    timer = setTimeout(hide, 4900);
    btn.addEventListener('click', showAgain);
  }

  function wrapRender(fnName, viewId, info){
    if (typeof window[fnName] !== 'function') return false;
    if (window[fnName].__catWrapped) return true;
    var original = window[fnName];
    var wrapped = function(){
      var result = original.apply(this, arguments);
      enhanceView(viewId, info);
      return result;
    };
    wrapped.__catWrapped = true;
    window[fnName] = wrapped;
    return true;
  }

  var attempts = 0;
  function init(){
    var hasOld = wrapRender('renderOldTestament', 'oldView', otInfo);
    var hasNew = wrapRender('renderNewTestament', 'newView', ntInfo);
    if ((!hasOld || !hasNew) && attempts < 30) {
      attempts++;
      setTimeout(init, 200);
      return;
    }
    enhanceView('oldView', otInfo);
    enhanceView('newView', ntInfo);
    console.log('[은혜의말씀] 카테고리 3단 안내 기능 로드 완료');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
