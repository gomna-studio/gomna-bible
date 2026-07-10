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
    '@keyframes catSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
    '.scripture-category-info{font-size:10px;font-weight:600;color:#9a7a62;opacity:0.72;line-height:1;user-select:none;pointer-events:none}' +
    '.scripture-category-description{font-size:11.5px;font-weight:500;line-height:1.42;color:#6b4e38;margin:0 0 6px;padding:0;letter-spacing:-0.01em}' +
    '.cat-trow + .scripture-category-description{margin-top:-2px}' +
    '.unified-bc-sec .scripture-category-info{font-size:9px}' +
    '.unified-bc-sec + .scripture-category-description{margin:-4px 0 6px}' +
    '@media(min-width:400px){.scripture-category-description{font-size:12px;line-height:1.38}}' +
    '@media(min-width:768px){.scripture-category-description{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}' +
    '.cat-section--scripture-guide .cat-tagrow,.cat-section--scripture-guide .cat-replay,.cat-section--scripture-guide .cat-desc-box,.cat-section--scripture-guide .scripture-category-description{display:none!important}' +
    '.cat-section--scripture-guide .section-title{display:inline-flex;align-items:center;gap:10px;flex-wrap:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;font-size:18px;font-weight:800;line-height:1.3;color:var(--primary)}' +
    '.scripture-guide-info-btn{display:inline-flex;align-items:center;justify-content:center;height:36px;min-height:36px;margin-left:0;padding:0 12px;border:1px solid rgba(184,134,11,0.42);border-radius:999px;background:rgba(255,250,244,0.95);color:#5a3818;font-size:15px;font-weight:700;line-height:1;cursor:pointer;flex-shrink:0;font-family:inherit;vertical-align:middle;-webkit-tap-highlight-color:transparent;box-sizing:border-box}' +
    '.scripture-guide-info-btn:active{transform:scale(0.97);opacity:0.88;background:rgba(255,245,225,1)}' +
    '.scripture-guide-overlay{position:fixed;inset:0;z-index:320;display:none;align-items:flex-end;justify-content:center;background:rgba(26,15,10,0.38);box-sizing:border-box;padding:0}' +
    '.scripture-guide-overlay.is-open{display:flex}' +
    '.scripture-guide-sheet{width:100%;max-width:420px;max-height:min(85vh,760px);background:linear-gradient(180deg,#F7F0E4 0%,#F3EBDD 100%);border-radius:18px 18px 0 0;box-shadow:0 -4px 24px rgba(74,37,17,0.12);display:flex;flex-direction:column;overflow:hidden;transform:translateY(100%);transition:transform 0.28s ease;box-sizing:border-box;min-height:0}' +
    '.scripture-guide-overlay.is-open .scripture-guide-sheet{transform:translateY(0)}' +
    '.scripture-guide-handle{width:36px;height:4px;border-radius:999px;background:rgba(139,94,44,0.35);margin:10px auto 6px;flex:0 0 auto}' +
    '.scripture-guide-panel{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden}' +
    '.scripture-guide-panel[hidden]{display:none!important}' +
    '.scripture-guide-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:4px 18px calc(24px + env(safe-area-inset-bottom,0))}' +
    '.scripture-guide-eyebrow{font-size:13px;font-weight:700;color:#9a7209;margin:0 0 8px;letter-spacing:0.02em}' +
    '.scripture-guide-cat{font-size:20px;font-weight:800;color:#4a2511;margin:0 0 4px}' +
    '.scripture-guide-alt{font-size:13px;font-weight:600;color:#7a5a3a;margin:0 0 14px}' +
    '.scripture-guide-p{font-size:14px;line-height:1.55;font-weight:500;color:#3d2818;margin:0 0 10px}' +
    '.scripture-guide-divider{height:1px;background:rgba(139,94,44,0.16);margin:14px 0;border:none}' +
    '.scripture-guide-label{font-size:12px;font-weight:700;color:#8b5e2c;margin:0 0 6px;letter-spacing:0.02em}' +
    '.scripture-guide-books{font-size:13px;line-height:1.5;font-weight:500;color:#4a3728;margin:0 0 16px}' +
    '.scripture-guide-more-btn{width:100%;padding:14px 16px;border-radius:12px;border:1px solid rgba(184,134,11,0.45);background:rgba(255,250,244,0.92);color:#7a4b17;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}' +
    '.scripture-guide-more-btn:active{opacity:0.88}' +
    '.scripture-guide-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px 6px;flex:0 0 auto;border-bottom:1px solid rgba(139,94,44,0.12)}' +
    '.scripture-guide-head-spacer{width:36px;min-width:36px;height:36px;flex:0 0 36px;display:block}' +
    '.scripture-guide-head-btn{min-width:44px;min-height:36px;padding:6px 8px;border:none;background:transparent;color:#5a3818;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}' +
    '.scripture-guide-head-title{flex:1;text-align:center;font-size:14px;font-weight:700;color:#9a7209}' +
    '.scripture-guide-head-close{width:36px;height:36px;min-width:36px;padding:0;border:none;background:rgba(139,94,44,0.1);border-radius:50%;color:#5a3818;font-size:16px;cursor:pointer;font-family:inherit;line-height:1}' +
    '.scripture-guide-detail-h{font-size:17px;font-weight:800;color:#4a2511;margin:0 0 14px}' +
    '.scripture-guide-q{font-size:14px;font-weight:700;color:#5a3818;margin:16px 0 6px}' +
    '.scripture-guide-a{font-size:13px;line-height:1.6;font-weight:500;color:#3d2818;margin:0 0 4px}' +
    '.scripture-guide-book-item{margin:10px 0 0}' +
    '.scripture-guide-book-name{font-size:14px;font-weight:700;color:#4a2511;margin:0 0 2px}' +
    '.scripture-guide-book-desc{font-size:13px;line-height:1.5;font-weight:500;color:#5a4638;margin:0}' +
    '.scripture-guide-tags{font-size:13px;line-height:1.55;font-weight:600;color:#6b4e38;margin:8px 0 0}' +
    '.scripture-guide-read-btn{width:100%;margin-top:18px;padding:14px 16px;border-radius:12px;border:none;background:#c89849;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}' +
    '.scripture-guide-read-btn:active{opacity:0.9}' +
    '.scripture-guide-detail-body{flex:1 1 auto;min-height:0}' +
    '.scripture-guide-verse-list{display:flex;flex-direction:column;gap:8px;margin:4px 0 0}' +
    '.scripture-guide-verse-link{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:48px;padding:12px 14px;border:1px solid rgba(184,134,11,0.38);border-radius:12px;background:rgba(255,250,244,0.95);color:#5a3818;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;text-align:left;-webkit-tap-highlight-color:transparent;transition:transform 0.15s ease,opacity 0.15s ease,background 0.15s ease}' +
    '.scripture-guide-verse-link:active{transform:scale(0.98);opacity:0.9;background:rgba(255,245,225,1)}' +
    '.scripture-guide-verse-link-label{display:flex;align-items:center;gap:6px;flex:1;min-width:0}' +
    '.scripture-guide-verse-link-icon{flex-shrink:0;font-size:13px;color:#9a7209;line-height:1}' +
    '.scripture-guide-verse-link-arrow{flex-shrink:0;font-size:15px;color:#9a7209;font-weight:700;line-height:1}' +
    '.verse-item.gomna-guide-verse-highlight{background:rgba(200,152,73,0.18)!important;box-shadow:inset 0 0 0 1px rgba(184,134,11,0.35);border-radius:8px;transition:background 0.9s ease,box-shadow 0.9s ease}' +
    '.verse-item.gomna-guide-verse-highlight.gomna-guide-verse-has-return{border-radius:8px 8px 0 0;margin-bottom:0}' +
    '.verse-item.gomna-guide-verse-highlight.gomna-guide-verse-highlight-fade{background:transparent!important;box-shadow:none!important}' +
    '.scripture-guide-return-tag{display:block;width:calc(100% - 4px);max-width:100%;margin:-1px auto 10px;padding:10px 14px;min-height:44px;border:0.5px solid rgba(184,134,11,0.42);border-top:0.5px solid rgba(184,134,11,0.2);border-radius:0 0 10px 10px;background:rgba(255,250,244,0.96);color:#5a3818;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;text-align:center;box-sizing:border-box;-webkit-tap-highlight-color:transparent;transition:transform 0.15s ease,opacity 0.15s ease,background 0.15s ease}' +
    '.scripture-guide-return-tag:active{transform:scale(0.99);opacity:0.9;background:rgba(255,245,225,1)}' +
    '@media(min-width:769px){.scripture-guide-overlay{align-items:flex-end;padding-bottom:24px}.scripture-guide-sheet{border-radius:18px;max-height:min(85vh,760px)}}';
  document.head.appendChild(styleEl);

  // === 2. 카테고리 정보 ===
  var otInfo = {
    "모세오경": {tags:["율법서","언약서"], desc:"창조와 구원, 그리고 하나님 백성의 법과 언약이 시작되는 말씀입니다.", shortDesc:"창세기부터 신명기까지, 하나님의 율법과 언약을 담은 다섯 권"},
    "역사서":   {tags:["구속사서","신정사서","사서(史書)"], desc:"순종과 불순종의 역사 속에서도 신실하게 일하시는 하나님의 이야기입니다.", shortDesc:"여호수아부터 에스더까지, 이스라엘의 역사와 믿음의 여정을 기록한 책"},
    "시가서":   {tags:["지혜서","찬양서"], desc:"고난과 삶의 자리에서 하나님께 올려드린 기도와 찬양, 그리고 지혜의 말씀입니다.", shortDesc:"욥기부터 아가까지, 지혜와 찬양, 기도와 사랑을 담은 말씀"},
    "대선지서": {tags:["대예언서","예언서"], desc:"이스라엘과 열방을 향한 심판의 경고와 회복의 약속을 담은 말씀입니다.", shortDesc:"이사야부터 다니엘까지, 심판과 회복을 선포한 예언의 말씀"},
    "소선지서": {tags:["열두예언서","소예언서"], desc:"타락한 시대를 향해 돌아오라 부르시는 하나님의 사랑과 공의의 말씀입니다.", shortDesc:"호세아부터 말라기까지, 열두 선지자가 전한 회개와 소망의 말씀"}
  };
  var ntInfo = {
    "복음서":   {tags:["복음서","복음기록서"], desc:"예수 그리스도의 생애와 십자가 죽음, 그리고 부활의 기쁜 소식입니다.", shortDesc:"마태복음부터 요한복음까지, 예수님의 삶과 가르침, 십자가와 부활을 기록한 네 권"},
    "역사서":   {tags:["초대교회사","사도행전사"], desc:"성령의 임재로 세워진 교회가 땅끝까지 복음을 전해 가는 이야기입니다.", shortDesc:"사도행전, 초대교회의 시작과 복음이 전해진 역사를 기록한 책"},
    "바울서신": {tags:["바울서신","교리서신","목회서신"], desc:"교회의 질서를 세우고 복음의 진리를 가르치는 목회 편지입니다.", shortDesc:"로마서부터 빌레몬서까지, 사도 바울이 교회와 성도들에게 보낸 편지"},
    "공동서신": {tags:["공동서신","보편서신","권면서신"], desc:"고난과 박해 속에서도 성도들이 믿음을 지키도록 격려하는 권면의 말씀입니다.", shortDesc:"히브리서부터 유다서까지, 교회와 성도들에게 믿음의 삶을 권면하는 편지"},
    "예언서":   {tags:["묵시문학서","예언서","계시서"], desc:"다시 오실 예수님과 함께 완성될 영원한 하나님 나라의 승리의 약속입니다.", shortDesc:"요한계시록, 마지막 승리와 하나님 나라의 완성을 전하는 말씀"}
  };

  function parseCategoryName(raw) {
    var text = String(raw || '').trim();
    var spaceIdx = text.indexOf(' ');
    return (spaceIdx > -1) ? text.substring(spaceIdx + 1).trim() : text;
  }

  function appendScriptureCategoryInfo(titleEl) {
    if (!titleEl || titleEl.querySelector('.scripture-category-info')) return;
    var infoSpan = document.createElement('span');
    infoSpan.className = 'scripture-category-info';
    infoSpan.setAttribute('aria-hidden', 'true');
    infoSpan.textContent = ' ⓘ';
    titleEl.appendChild(infoSpan);
  }

  function appendScriptureCategoryDescription(container, catName, info, insertBeforeEl, testament) {
    if (!container) return;
    if (isScriptureGuideCategory(testament, catName)) return;
    var data = info[catName];
    if (!data || !data.shortDesc) return;
    if (container.querySelector('.scripture-category-description[data-cat="' + catName + '"]')) return;
    var desc = document.createElement('p');
    desc.className = 'scripture-category-description';
    desc.setAttribute('data-cat', catName);
    desc.textContent = data.shortDesc;
    if (insertBeforeEl) container.insertBefore(desc, insertBeforeEl);
    else container.appendChild(desc);
  }

  var scriptureGuideState = { open: false, step: 'summary', triggerEl: null, scrollY: 0, bound: false, verseNavigating: false, activeTestament: null, activeCat: null };
  var scriptureGuideOverlay = null;
  var guideVersePending = null;
  var guideVerseFocusBound = false;
  var guideReturnState = null;
  var guideReturnTag = null;
  var guideVerseHighlightTimers = { hold: null, fade: null, item: null };
  var GUIDE_VERSE_HIGHLIGHT_HOLD_MS = 8000;
  var GUIDE_VERSE_HIGHLIGHT_FADE_MS = 900;

  function isScriptureGuideCategory(testament, catName) {
    var bucket = SCRIPTURE_GUIDES[testament];
    return !!(bucket && bucket[catName]);
  }

  function getScriptureGuide(testament, catName) {
    var bucket = SCRIPTURE_GUIDES[testament];
    return bucket ? bucket[catName] || null : null;
  }

  function getGuideReturnLabelText(testament, catName) {
    var guide = getScriptureGuide(testament, catName);
    return (guide && guide.returnLabel) ? guide.returnLabel : catName;
  }

  function escGuideHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var SCRIPTURE_GUIDES = {
    old: {
      "모세오경": {
        testament: "old", categoryName: "모세오경", returnLabel: "모세오경",
        altNames: "율법서 · 언약서",
        summaryLine1: "모세오경은 창세기부터 신명기까지의 다섯 권을 말합니다.",
        summaryLine2: "창조와 구원, 그리고 하나님 백성의 법과 언약이 시작되는 말씀입니다.",
        books: "창세기 · 출애굽기 · 레위기 · 민수기 · 신명기",
        detailTitle: "모세오경 깊이 알아보기", bookListTitle: "다섯 권은 무엇을 말하나요?",
        sections: [
          { q: "왜 모세오경이라고 부르나요?", a: "성경의 첫 다섯 권은 전통적으로 모세와 깊이 관련된 책으로 이해되어 왔기 때문에 '모세오경'이라고 부릅니다." },
          { q: "왜 율법서라고도 하나요?", a: "십계명을 비롯해 하나님 백성이 어떻게 예배하고 살아가야 하는지를 알려주는 율법이 기록되어 있기 때문입니다." },
          { q: "왜 언약서라고도 하나요?", a: "하나님께서 아브라함과 이스라엘 백성에게 주신 약속과 언약이 다섯 권 전체를 이어주는 중요한 중심 내용이기 때문입니다." }
        ],
        bookSummaries: [
          { name: "창세기", desc: "천지창조와 인류의 시작, 아브라함·이삭·야곱·요셉의 이야기" },
          { name: "출애굽기", desc: "애굽에서의 구원과 십계명, 하나님 백성의 시작" },
          { name: "레위기", desc: "제사와 예배, 거룩한 백성으로 살아가는 법" },
          { name: "민수기", desc: "광야를 지나며 경험한 불순종과 하나님의 인도" },
          { name: "신명기", desc: "약속의 땅을 앞두고 다시 전한 율법과 언약의 말씀" }
        ],
        themes: "창조 · 타락 · 언약 · 구원 · 출애굽 · 율법 · 예배 · 거룩",
        jesusLink: "모세오경의 제사와 희생, 구원과 언약의 말씀은 예수 그리스도를 이해하는 중요한 기초가 됩니다.",
        relatedVerses: [
          { book: "마태복음", chapter: 5, verse: 17, label: "마태복음 5장 17절", testament: "new" }
        ],
        readButtonLabel: "모세오경 읽기 →"
      },
      "역사서": {
        testament: "old", categoryName: "역사서", returnLabel: "역사서",
        altNames: "구속사서 · 신정사서 · 사서(史書)",
        summaryLine1: "여호수아부터 에스더까지, 이스라엘의 역사와 믿음의 여정을 기록한 열두 권입니다.",
        summaryLine2: "순종과 불순종의 역사 속에서도 신실하게 일하시는 하나님의 이야기입니다.",
        books: "여호수아 · 사사기 · 룻기 · 사무엘상 · 사무엘하 · 열왕기상 · 열왕기하 · 역대상 · 역대하 · 에스라 · 느헤미야 · 에스더",
        detailTitle: "구약 역사서 깊이 알아보기", bookListTitle: "열두 권은 무엇을 말하나요?",
        sections: [
          { q: "왜 역사서라고 부르나요?", a: "이스라엘 백성이 약속의 땅에 들어간 때부터 왕국 시대, 포로 생활과 귀환에 이르는 실제 역사를 기록하고 있기 때문입니다." },
          { q: "왜 구속사서라고도 하나요?", a: "단순한 국가의 역사가 아니라, 하나님께서 실패한 백성을 포기하지 않고 구원의 약속을 이어 가시는 역사를 보여주기 때문입니다." },
          { q: "역사서를 읽을 때 무엇을 보아야 하나요?", a: "사건의 승패만 보는 것이 아니라, 하나님의 말씀에 대한 순종과 불순종이 개인과 공동체에 어떤 결과를 가져오는지 살펴보아야 합니다." }
        ],
        bookSummaries: [
          { name: "여호수아", desc: "약속의 땅에 들어가 정복하고 분배한 이야기" },
          { name: "사사기", desc: "반복되는 불순종과 구원, 사사들의 시대" },
          { name: "룻기", desc: "평범한 가정 안에서 이어진 하나님의 구원 계획" },
          { name: "사무엘상", desc: "사사 시대의 끝과 이스라엘 왕정의 시작" },
          { name: "사무엘하", desc: "다윗 왕국의 성장과 다윗의 성공과 실패" },
          { name: "열왕기상", desc: "솔로몬의 통치와 왕국의 분열" },
          { name: "열왕기하", desc: "남북 왕국의 쇠퇴와 멸망" },
          { name: "역대상", desc: "다윗 왕조와 성전 예배의 기초" },
          { name: "역대하", desc: "유다 왕국과 성전 중심의 역사" },
          { name: "에스라", desc: "포로에서 돌아와 성전과 말씀을 회복한 이야기" },
          { name: "느헤미야", desc: "무너진 성벽과 공동체의 회복" },
          { name: "에스더", desc: "보이지 않는 곳에서도 백성을 지키신 하나님" }
        ],
        themes: "순종 · 불순종 · 약속의 땅 · 왕국 · 포로 · 회복 · 하나님의 신실하심",
        jesusLink: "이스라엘의 왕들과 지도자들은 모두 불완전했지만, 역사서는 하나님의 백성을 완전하게 다스리실 참된 왕 예수 그리스도를 기다리게 합니다.",
        relatedVerses: [
          { book: "여호수아", chapter: 1, verse: 9, label: "여호수아 1장 9절", testament: "old" },
          { book: "사무엘상", chapter: 16, verse: 7, label: "사무엘상 16장 7절", testament: "old" },
          { book: "느헤미야", chapter: 8, verse: 10, label: "느헤미야 8장 10절", testament: "old" }
        ],
        readButtonLabel: "역사서 읽기 →"
      },
      "시가서": {
        testament: "old", categoryName: "시가서", returnLabel: "시가서",
        altNames: "지혜서 · 찬양서",
        summaryLine1: "욥기부터 아가까지, 지혜와 찬양, 기도와 사랑을 담은 다섯 권입니다.",
        summaryLine2: "고난과 삶의 자리에서 하나님께 올려드린 기도와 찬양, 그리고 지혜의 말씀입니다.",
        books: "욥기 · 시편 · 잠언 · 전도서 · 아가",
        detailTitle: "시가서 깊이 알아보기", bookListTitle: "다섯 권은 무엇을 말하나요?",
        sections: [
          { q: "왜 시가서라고 부르나요?", a: "시와 노래, 기도와 지혜의 문장으로 하나님과 인간의 삶을 표현하고 있기 때문입니다." },
          { q: "왜 지혜서라고도 하나요?", a: "삶의 고난과 기쁨, 말과 행동, 사랑과 죽음 속에서 하나님을 경외하며 살아가는 지혜를 가르치기 때문입니다." },
          { q: "시가서는 어떻게 읽으면 좋은가요?", a: "정보만 찾기보다 글쓴이의 감정과 고백을 따라가며, 자신의 기도와 묵상으로 읽는 것이 좋습니다." }
        ],
        bookSummaries: [
          { name: "욥기", desc: "이해할 수 없는 고난 속에서도 하나님을 신뢰하는 믿음" },
          { name: "시편", desc: "기쁨과 슬픔, 감사와 탄식을 하나님께 드리는 기도와 찬양" },
          { name: "잠언", desc: "하나님을 경외하며 일상에서 지혜롭게 살아가는 길" },
          { name: "전도서", desc: "세상의 헛됨 속에서 하나님을 기억하는 삶" },
          { name: "아가", desc: "사랑의 아름다움과 신실함을 노래한 말씀" }
        ],
        themes: "고난 · 기도 · 찬양 · 지혜 · 경외 · 사랑 · 위로",
        jesusLink: "시가서가 보여주는 참된 지혜와 의로운 고난, 목자와 신랑의 모습은 예수 그리스도를 더 깊이 이해하도록 돕습니다.",
        relatedVerses: [
          { book: "시편", chapter: 23, verse: 1, label: "시편 23편 1절", testament: "old" },
          { book: "잠언", chapter: 1, verse: 7, label: "잠언 1장 7절", testament: "old" },
          { book: "전도서", chapter: 12, verse: 13, label: "전도서 12장 13절", testament: "old" }
        ],
        readButtonLabel: "시가서 읽기 →"
      },
      "대선지서": {
        testament: "old", categoryName: "대선지서", returnLabel: "대선지서",
        altNames: "대예언서 · 큰 예언서",
        summaryLine1: "이사야부터 다니엘까지, 심판과 회복을 선포한 다섯 권의 예언서입니다.",
        summaryLine2: "이스라엘과 열방을 향한 심판의 경고와 회복의 약속을 담은 말씀입니다.",
        books: "이사야 · 예레미야 · 예레미야애가 · 에스겔 · 다니엘",
        detailTitle: "대선지서 깊이 알아보기", bookListTitle: "다섯 권은 무엇을 말하나요?",
        sections: [
          { q: "왜 대선지서라고 부르나요?", a: "다른 선지서보다 더 중요해서가 아니라, 기록된 내용의 분량이 비교적 많기 때문에 대선지서라고 부릅니다." },
          { q: "선지자들은 무엇을 전했나요?", a: "죄와 우상숭배를 책망하고 회개를 촉구했으며, 심판 뒤에도 하나님께서 백성을 회복하실 것을 선포했습니다." },
          { q: "왜 메시아의 약속이 중요한가요?", a: "사람의 힘으로 해결할 수 없는 죄와 실패를 넘어, 하나님께서 보내실 구원자와 새로운 나라를 바라보게 하기 때문입니다." }
        ],
        bookSummaries: [
          { name: "이사야", desc: "심판과 위로, 고난받는 종과 메시아의 약속" },
          { name: "예레미야", desc: "무너지는 나라를 향한 눈물의 경고와 새 언약" },
          { name: "예레미야애가", desc: "예루살렘의 멸망을 슬퍼하며 드린 탄식" },
          { name: "에스겔", desc: "포로지에서 전한 하나님의 영광과 새 마음의 약속" },
          { name: "다니엘", desc: "제국의 시대 속에서도 다스리시는 하나님의 주권" }
        ],
        themes: "회개 · 심판 · 회복 · 새 언약 · 메시아 · 하나님의 나라",
        jesusLink: "대선지서는 고난받는 종, 새 언약, 인자와 영원한 왕국에 대한 약속을 통해 예수 그리스도를 바라보게 합니다.",
        relatedVerses: [
          { book: "이사야", chapter: 53, verse: 5, label: "이사야 53장 5절", testament: "old" },
          { book: "예레미야", chapter: 31, verse: 33, label: "예레미야 31장 33절", testament: "old" },
          { book: "다니엘", chapter: 7, verse: 14, label: "다니엘 7장 14절", testament: "old" }
        ],
        readButtonLabel: "대선지서 읽기 →"
      },
      "소선지서": {
        testament: "old", categoryName: "소선지서", returnLabel: "소선지서",
        altNames: "열두 선지서 · 소예언서",
        summaryLine1: "호세아부터 말라기까지, 열두 선지자가 전한 회개와 소망의 말씀입니다.",
        summaryLine2: "타락한 시대를 향해 돌아오라 부르시는 하나님의 사랑과 공의의 말씀입니다.",
        books: "호세아 · 요엘 · 아모스 · 오바댜 · 요나 · 미가 · 나훔 · 하박국 · 스바냐 · 학개 · 스가랴 · 말라기",
        detailTitle: "소선지서 깊이 알아보기", bookListTitle: "열두 권은 무엇을 말하나요?",
        sections: [
          { q: "왜 소선지서라고 부르나요?", a: "내용이 덜 중요해서가 아니라 각 책의 분량이 비교적 짧기 때문에 소선지서라고 부릅니다." },
          { q: "열두 선지자는 무엇을 외쳤나요?", a: "죄와 불의를 책망하고 하나님께 돌아오라고 촉구했으며, 심판 중에도 회복과 구원의 소망을 전했습니다." },
          { q: "소선지서에서 무엇을 발견할 수 있나요?", a: "하나님의 거룩한 공의와 함께 죄인을 끝까지 기다리시고 돌이키기를 원하시는 사랑을 발견할 수 있습니다." }
        ],
        bookSummaries: [
          { name: "호세아", desc: "배신한 백성을 끝까지 사랑하시는 하나님" },
          { name: "요엘", desc: "재앙 속에서 회개를 촉구하며 성령의 약속을 선포" },
          { name: "아모스", desc: "예배와 삶이 분리된 사회의 불의를 책망" },
          { name: "오바댜", desc: "교만한 에돔에 대한 심판" },
          { name: "요나", desc: "원수의 도시까지 품으시는 하나님의 긍휼" },
          { name: "미가", desc: "정의와 인애와 겸손한 삶" },
          { name: "나훔", desc: "잔인한 니느웨를 심판하시는 하나님" },
          { name: "하박국", desc: "이해할 수 없는 현실 속에서 믿음으로 사는 길" },
          { name: "스바냐", desc: "여호와의 날과 남은 백성의 회복" },
          { name: "학개", desc: "무너진 성전을 다시 세우라는 촉구" },
          { name: "스가랴", desc: "회복될 예루살렘과 오실 왕의 약속" },
          { name: "말라기", desc: "식어진 믿음을 책망하며 주의 길을 준비할 사자를 예고" }
        ],
        themes: "회개 · 사랑 · 공의 · 여호와의 날 · 남은 자 · 회복 · 소망",
        jesusLink: "소선지서는 베들레헴에서 오실 통치자, 겸손한 왕, 주의 길을 준비할 사자 등 예수 그리스도와 연결되는 약속을 전합니다.",
        relatedVerses: [
          { book: "호세아", chapter: 6, verse: 6, label: "호세아 6장 6절", testament: "old" },
          { book: "미가", chapter: 6, verse: 8, label: "미가 6장 8절", testament: "old" },
          { book: "하박국", chapter: 2, verse: 4, label: "하박국 2장 4절", testament: "old" }
        ],
        readButtonLabel: "소선지서 읽기 →"
      }
    },
    new: {
      "복음서": {
        testament: "new", categoryName: "복음서", returnLabel: "복음서",
        altNames: "복음기록서 · 예수님의 생애",
        summaryLine1: "마태복음부터 요한복음까지, 예수님의 삶과 가르침, 십자가와 부활을 기록한 네 권입니다.",
        summaryLine2: "예수 그리스도의 생애와 십자가 죽음, 그리고 부활의 기쁜 소식입니다.",
        books: "마태복음 · 마가복음 · 누가복음 · 요한복음",
        detailTitle: "복음서 깊이 알아보기", bookListTitle: "네 권은 무엇을 말하나요?",
        sections: [
          { q: "왜 복음서라고 부르나요?", a: "예수 그리스도를 통해 이루어진 구원의 기쁜 소식을 기록하고 있기 때문입니다." },
          { q: "왜 네 권의 복음서가 있나요?", a: "각 복음서는 같은 예수님을 증언하면서도 서로 다른 독자와 관점에서 예수님의 삶과 사역을 보여줍니다." },
          { q: "복음서를 어떻게 읽으면 좋은가요?", a: "예수님이 누구신지, 무엇을 가르치셨는지, 십자가와 부활이 나에게 어떤 의미인지 살보며 읽는 것이 좋습니다." }
        ],
        bookSummaries: [
          { name: "마태복음", desc: "약속된 메시아이자 왕으로 오신 예수님" },
          { name: "마가복음", desc: "섬기고 고난받는 하나님의 아들 예수님" },
          { name: "누가복음", desc: "잃어버린 사람을 찾아 구원하시는 예수님" },
          { name: "요한복음", desc: "믿는 자에게 생명을 주시는 하나님의 아들 예수님" }
        ],
        themes: "예수님 · 하나님 나라 · 사랑 · 십자가 · 부활 · 구원 · 제자도",
        jesusLink: "복음서는 예수 그리스도의 말씀과 행동, 죽음과 부활을 직접 증언하는 신약성경의 중심입니다.",
        relatedVerses: [
          { book: "마태복음", chapter: 4, verse: 17, label: "마태복음 4장 17절", testament: "new" },
          { book: "마가복음", chapter: 10, verse: 45, label: "마가복음 10장 45절", testament: "new" },
          { book: "요한복음", chapter: 3, verse: 16, label: "요한복음 3장 16절", testament: "new" }
        ],
        readButtonLabel: "복음서 읽기 →"
      },
      "역사서": {
        testament: "new", categoryName: "역사서", returnLabel: "사도행전",
        altNames: "초대교회사 · 사도행전사 · 성령의 역사",
        summaryLine1: "사도행전 한 권으로, 초대교회의 시작과 복음이 전해진 역사를 기록한 책입니다.",
        summaryLine2: "성령의 임재로 세워진 교회가 땅끝까지 복음을 전해 가는 이야기입니다.",
        books: "사도행전",
        detailTitle: "신약 역사서 깊이 알아보기", bookListTitle: "포함된 성경",
        sections: [
          { q: "왜 사도행전이 역사서인가요?", a: "예수님의 승천 이후 성령께서 임하시고, 사도들을 통해 교회가 시작되어 복음이 확장된 역사를 기록하기 때문입니다." },
          { q: "왜 성령의 역사라고도 하나요?", a: "사도행전의 중심에서 교회를 세우고 선교를 이끄시는 분이 성령님이시기 때문입니다." },
          { q: "사도행전은 무엇을 이어주나요?", a: "예수님의 삶을 기록한 복음서와 교회에 보낸 서신서 사이를 이어주며, 복음이 예루살렘에서 로마까지 전해지는 과정을 보여줍니다." }
        ],
        bookSummaries: [
          { name: "사도행전", desc: "성령의 임재, 초대교회의 탄생, 베드로와 바울을 통한 복음의 확장" }
        ],
        themes: "성령 · 교회 · 선교 · 증인 · 복음 · 공동체",
        jesusLink: "부활하신 예수님은 성령을 보내시고, 교회가 땅끝까지 복음을 전하도록 이끄십니다.",
        relatedVerses: [
          { book: "사도행전", chapter: 1, verse: 8, label: "사도행전 1장 8절", testament: "new" },
          { book: "사도행전", chapter: 2, verse: 38, label: "사도행전 2장 38절", testament: "new" },
          { book: "사도행전", chapter: 4, verse: 12, label: "사도행전 4장 12절", testament: "new" }
        ],
        readButtonLabel: "사도행전 읽기 →"
      },
      "바울서신": {
        testament: "new", categoryName: "바울서신", returnLabel: "바울서신",
        altNames: "바울의 편지 · 교회를 향한 편지 · 사도의 서신",
        summaryLine1: "로마서부터 빌레몬서까지, 사도 바울이 교회와 성도들에게 보낸 열세 권의 편지입니다.",
        summaryLine2: "교회의 질서를 세우고 복음의 진리를 가르치는 목회 편지입니다.",
        books: "로마서 · 고린도전서 · 고린도후서 · 갈라디아서 · 에베소서 · 빌립보서 · 골로새서 · 데살로니가전서 · 데살로니가후서 · 디모데전서 · 디모데후서 · 디도서 · 빌레몬서",
        detailTitle: "바울서신 깊이 알아보기", bookListTitle: "열세 권은 무엇을 말하나요?",
        sections: [
          { q: "왜 바울서신이라고 부르나요?", a: "예수 그리스도의 사도 바울이 여러 교회와 동역자들에게 보낸 편지들이기 때문입니다." },
          { q: "바울서신은 무엇을 가르치나요?", a: "복음과 구원, 교회의 정체성, 성도의 생활, 고난과 재림, 지도자의 책임과 성도의 관계를 가르칩니다." },
          { q: "왜 여러 종류로 나누나요?", a: "각 편지가 쓰인 목적과 상황이 다르기 때문에 교리서신, 옥중서신, 재림서신, 목회서신, 개인서신으로 이해할 수 있습니다." }
        ],
        bookGroups: [
          { title: "교리서신", books: "로마서 · 고린도전서 · 고린도후서 · 갈라디아서" },
          { title: "옥중서신", books: "에베소서 · 빌립보서 · 골로새서" },
          { title: "재림서신", books: "데살로니가전서 · 데살로니가후서" },
          { title: "목회서신", books: "디모데전서 · 디모데후서 · 디도서" },
          { title: "개인서신", books: "빌레몬서" }
        ],
        bookSummaries: [
          { name: "로마서", desc: "구원은 오직 믿음으로" },
          { name: "고린도전서", desc: "교회 문제를 바로잡다" },
          { name: "고린도후서", desc: "약함 속에 나타나는 하나님의 능력" },
          { name: "갈라디아서", desc: "복음 안에서 누리는 자유" },
          { name: "에베소서", desc: "교회는 그리스도의 몸" },
          { name: "빌립보서", desc: "환경을 넘어서는 기쁨" },
          { name: "골로새서", desc: "만물 위에 계신 그리스도" },
          { name: "데살로니가전서", desc: "다시 오실 주님을 기다리는 소망" },
          { name: "데살로니가후서", desc: "재림을 기다리는 바른 태도" },
          { name: "디모데전서", desc: "교회 질서와 지도자의 책임" },
          { name: "디모데후서", desc: "복음과 사명을 다음 세대에 전하라" },
          { name: "디도서", desc: "바른 교훈을 바른 삶으로 나타내라" },
          { name: "빌레몬서", desc: "복음은 관계를 용서와 화해로 바꾼다" }
        ],
        themes: "복음 · 믿음 · 은혜 · 구원 · 교회 · 성도의 삶 · 재림 · 화해",
        jesusLink: "바울서신은 예수 그리스도의 십자가와 부활이 개인의 구원과 교회 공동체의 삶을 어떻게 변화시키는지 설명합니다.",
        relatedVerses: [
          { book: "로마서", chapter: 1, verse: 16, label: "로마서 1장 16절", testament: "new" },
          { book: "갈라디아서", chapter: 2, verse: 20, label: "갈라디아서 2장 20절", testament: "new" },
          { book: "에베소서", chapter: 2, verse: 8, label: "에베소서 2장 8절", testament: "new" }
        ],
        readButtonLabel: "바울서신 읽기 →"
      },
      "공동서신": {
        testament: "new", categoryName: "공동서신", returnLabel: "공동서신",
        altNames: "보편서신 · 권면서신 · 신앙의 편지",
        summaryLine1: "히브리서부터 유다서까지, 교회와 성도들에게 믿음의 삶을 권면하는 여덟 권의 편지입니다.",
        summaryLine2: "고난과 박해 속에서도 성도들이 믿음을 지키도록 격려하는 권면의 말씀입니다.",
        books: "히브리서 · 야고보서 · 베드로전서 · 베드로후서 · 요한일서 · 요한이서 · 요한삼서 · 유다서",
        detailTitle: "공동서신 깊이 알아보기", bookListTitle: "여덟 권은 무엇을 말하나요?",
        sections: [
          { q: "왜 공동서신이라고 부르나요?", a: "특정한 한 교회만이 아니라 여러 교회와 넓은 성도 공동체를 향한 권면으로 읽혀 왔기 때문입니다." },
          { q: "왜 보편서신이라고도 하나요?", a: "시대와 지역을 넘어 모든 성도에게 적용되는 믿음과 생활의 가르침을 담고 있기 때문입니다." },
          { q: "공동서신은 무엇을 강조하나요?", a: "고난 속의 인내, 믿음과 행함의 일치, 사랑과 진리, 거짓 가르침에 대한 분별을 강조합니다." }
        ],
        bookSummaries: [
          { name: "히브리서", desc: "예수 그리스도는 더 나은 대제사장이시며 새 언약의 중보자" },
          { name: "야고보서", desc: "참된 믿음은 삶과 행함으로 드러난다" },
          { name: "베드로전서", desc: "고난 중에도 소망과 거룩함을 지키라" },
          { name: "베드로후서", desc: "거짓 가르침을 경계하고 믿음 안에서 자라가라" },
          { name: "요한일서", desc: "빛과 사랑 안에서 하나님과 교제하라" },
          { name: "요한이서", desc: "진리와 사랑 안에 거하며 미혹을 경계하라" },
          { name: "요한삼서", desc: "진리를 위해 수고하는 이들을 환대하라" },
          { name: "유다서", desc: "믿음을 지키며 거짓 교사와 싸우라" }
        ],
        themes: "믿음 · 행함 · 인내 · 거룩 · 사랑 · 진리 · 분별",
        jesusLink: "공동서신은 예수 그리스도를 믿는 믿음이 고난과 일상, 사랑과 순종 속에서 실제로 드러나야 함을 가르칩니다.",
        relatedVerses: [
          { book: "야고보서", chapter: 1, verse: 22, label: "야고보서 1장 22절", testament: "new" },
          { book: "베드로전서", chapter: 1, verse: 7, label: "베드로전서 1장 7절", testament: "new" },
          { book: "요한일서", chapter: 4, verse: 7, label: "요한일서 4장 7절", testament: "new" }
        ],
        readButtonLabel: "공동서신 읽기 →"
      },
      "예언서": {
        testament: "new", categoryName: "예언서", returnLabel: "요한계시록",
        altNames: "묵시문학서 · 계시서 · 소망의 계시",
        summaryLine1: "요한계시록 한 권으로, 마지막 승리와 하나님 나라의 완성을 전하는 말씀입니다.",
        summaryLine2: "다시 오실 예수님과 함께 완성될 영원한 하나님 나라의 승리의 약속입니다.",
        books: "요한계시록",
        detailTitle: "신약 예언서 깊이 알아보기", bookListTitle: "포함된 성경",
        sections: [
          { q: "왜 예언서라고 부르나요?", a: "현재의 교회를 향한 말씀과 장차 이루어질 하나님의 심판과 구원, 하나님 나라의 완성을 계시하기 때문입니다." },
          { q: "왜 묵시문학이라고도 하나요?", a: "상징과 환상, 숫자와 이미지로 보이지 않는 영적 현실과 하나님의 승리를 보여주기 때문입니다." },
          { q: "요한계시록은 두려움을 주는 책인가요?", a: "공포를 위한 책이 아니라 박해받는 교회가 끝까지 믿음을 지키도록 위로하며, 예수 그리스도의 최종 승리를 선포하는 소망의 말씀입니다." }
        ],
        bookSummaries: [
          { name: "요한계시록", desc: "다시 오실 예수 그리스도와 악의 최종 심판, 새 하늘과 새 땅의 완성" }
        ],
        themes: "예수님의 재림 · 심판 · 인내 · 승리 · 새 하늘과 새 땅 · 영원한 소망",
        jesusLink: "요한계시록의 중심은 사건의 날짜를 계산하는 것이 아니라, 죽임당하셨으나 다시 살아나 승리하신 어린양 예수 그리스도입니다.",
        relatedVerses: [
          { book: "요한계시록", chapter: 1, verse: 8, label: "요한계시록 1장 8절", testament: "new" },
          { book: "요한계시록", chapter: 21, verse: 4, label: "요한계시록 21장 4절", testament: "new" },
          { book: "요한계시록", chapter: 22, verse: 20, label: "요한계시록 22장 20절", testament: "new" }
        ],
        readButtonLabel: "요한계시록 읽기 →"
      }
    }
  };

  function buildGuideDetailHtml(guide) {
    var c = guide;
    var html = '<h3 class="scripture-guide-detail-h">' + escGuideHtml(c.detailTitle) + '</h3>';
    var sections = c.sections || [];
    for (var i = 0; i < sections.length; i++) {
      html += '<p class="scripture-guide-q">' + escGuideHtml(sections[i].q) + '</p>';
      html += '<p class="scripture-guide-a">' + escGuideHtml(sections[i].a) + '</p>';
    }
    if (c.bookGroups && c.bookGroups.length) {
      html += '<p class="scripture-guide-q">바울서신 내부 분류</p>';
      for (var g = 0; g < c.bookGroups.length; g++) {
        html += '<p class="scripture-guide-a"><strong>' + escGuideHtml(c.bookGroups[g].title) + '</strong><br>' + escGuideHtml(c.bookGroups[g].books) + '</p>';
      }
    }
    var bookListTitle = c.bookListTitle || '포함된 성경';
    var books = c.bookSummaries || [];
    if (books.length) {
      html += '<p class="scripture-guide-q">' + escGuideHtml(bookListTitle) + '</p>';
      for (var b = 0; b < books.length; b++) {
        html += '<div class="scripture-guide-book-item"><p class="scripture-guide-book-name">' + escGuideHtml(books[b].name) + '</p>';
        html += '<p class="scripture-guide-book-desc">' + escGuideHtml(books[b].desc) + '</p></div>';
      }
    }
    html += '<p class="scripture-guide-q">핵심 주제</p>';
    html += '<p class="scripture-guide-tags">' + escGuideHtml(c.themes) + '</p>';
    html += '<p class="scripture-guide-q">예수님과의 연결</p>';
    html += '<p class="scripture-guide-a">' + escGuideHtml(c.jesusLink) + '</p>';
    html += '<p class="scripture-guide-q" data-guide-related-verses>관련 말씀</p>';
    html += '<div class="scripture-guide-verse-list">';
    var verses = c.relatedVerses || [];
    for (var rv = 0; rv < verses.length; rv++) {
      var v = verses[rv];
      var vLabel = v.label || (v.book + ' ' + v.chapter + '장 ' + v.verse + '절');
      html += '<button type="button" class="scripture-guide-verse-link" data-guide-verse data-book="' + escGuideHtml(v.book) + '" data-chapter="' + v.chapter + '" data-verse="' + v.verse + '" data-testament="' + escGuideHtml(v.testament) + '">';
      html += '<span class="scripture-guide-verse-link-label"><span class="scripture-guide-verse-link-icon" aria-hidden="true">📖</span><span>' + escGuideHtml(vLabel) + '</span></span>';
      html += '<span class="scripture-guide-verse-link-arrow" aria-hidden="true">→</span>';
      html += '</button>';
    }
    html += '</div>';
    html += '<button type="button" class="scripture-guide-read-btn" data-guide-read-testament="' + escGuideHtml(c.testament) + '" data-guide-read-cat="' + escGuideHtml(c.categoryName) + '">' + escGuideHtml(c.readButtonLabel) + '</button>';
    return html;
  }

  function populateGuideSummary(overlay, guide) {
    var body = overlay.querySelector('[data-guide-panel="summary"] .scripture-guide-body');
    if (!body) return;
    body.innerHTML =
      '<p class="scripture-guide-eyebrow" id="scriptureGuideDialogTitle">📖 성경 길잡이</p>' +
      '<h2 class="scripture-guide-cat">' + escGuideHtml(guide.categoryName) + '</h2>' +
      '<p class="scripture-guide-alt">' + escGuideHtml(guide.altNames) + '</p>' +
      '<p class="scripture-guide-p">' + escGuideHtml(guide.summaryLine1) + '</p>' +
      '<p class="scripture-guide-p">' + escGuideHtml(guide.summaryLine2) + '</p>' +
      '<hr class="scripture-guide-divider">' +
      '<p class="scripture-guide-label">포함된 성경</p>' +
      '<p class="scripture-guide-books">' + escGuideHtml(guide.books) + '</p>' +
      '<button type="button" class="scripture-guide-more-btn">📖 성경 길잡이 더 알아보기 →</button>';
    var moreBtn = body.querySelector('.scripture-guide-more-btn');
    if (moreBtn) moreBtn.addEventListener('click', showScriptureGuideDetail);
  }

  function populateGuideDetail(overlay, guide) {
    var detailBody = overlay.querySelector('.scripture-guide-detail-body');
    if (!detailBody) return;
    detailBody.innerHTML = buildGuideDetailHtml(guide);
  }

  function ensureScriptureGuideOverlay() {
    if (scriptureGuideOverlay) return scriptureGuideOverlay;
    var overlay = document.createElement('div');
    overlay.id = 'scriptureGuideOverlay';
    overlay.className = 'scripture-guide-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="scripture-guide-sheet" role="dialog" aria-modal="true" aria-labelledby="scriptureGuideDialogTitle">' +
        '<div class="scripture-guide-handle" aria-hidden="true"></div>' +
        '<div class="scripture-guide-panel scripture-guide-panel--summary" data-guide-panel="summary">' +
          '<div class="scripture-guide-head">' +
            '<span class="scripture-guide-head-spacer" aria-hidden="true"></span>' +
            '<span class="scripture-guide-head-title">📖 성경 길잡이</span>' +
            '<button type="button" class="scripture-guide-head-close" data-guide-close aria-label="닫기">✕</button>' +
          '</div>' +
          '<div class="scripture-guide-body"></div>' +
        '</div>' +
        '<div class="scripture-guide-panel scripture-guide-panel--detail" data-guide-panel="detail" hidden>' +
          '<div class="scripture-guide-head">' +
            '<span class="scripture-guide-head-spacer" aria-hidden="true"></span>' +
            '<span class="scripture-guide-head-title">📖 성경 길잡이</span>' +
            '<button type="button" class="scripture-guide-head-close" data-guide-close aria-label="닫기">✕</button>' +
          '</div>' +
          '<div class="scripture-guide-body scripture-guide-detail-body"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeScriptureGuide();
    });
    var sheet = overlay.querySelector('.scripture-guide-sheet');
    if (sheet) sheet.addEventListener('click', function(e) { e.stopPropagation(); });

    overlay.querySelectorAll('[data-guide-close]').forEach(function(btn) {
      btn.addEventListener('click', closeScriptureGuide);
    });

    var detailBody = overlay.querySelector('.scripture-guide-detail-body');
    if (detailBody) {
      detailBody.addEventListener('touchmove', function(e) {
        e.stopPropagation();
      }, { passive: true });
      detailBody.addEventListener('click', function(e) {
        var verseBtn = e.target.closest('[data-guide-verse]');
        if (verseBtn) {
          e.preventDefault();
          navigateToGuideRelatedVerse({
            book: verseBtn.getAttribute('data-book'),
            chapter: parseInt(verseBtn.getAttribute('data-chapter'), 10),
            verse: parseInt(verseBtn.getAttribute('data-verse'), 10),
            testament: verseBtn.getAttribute('data-testament') || undefined
          });
          return;
        }
        var readBtn = e.target.closest('[data-guide-read-testament]');
        if (readBtn) {
          e.preventDefault();
          navigateToGuideCategory(
            readBtn.getAttribute('data-guide-read-testament'),
            readBtn.getAttribute('data-guide-read-cat')
          );
        }
      });
    }

    if (!scriptureGuideState.bound) {
      document.addEventListener('keydown', onScriptureGuideKeydown);
      ensureGuideVerseNavListeners();
      scriptureGuideState.bound = true;
    }

    scriptureGuideOverlay = overlay;
    return overlay;
  }

  function onScriptureGuideKeydown(e) {
    if (!scriptureGuideState.open || e.key !== 'Escape') return;
    e.preventDefault();
    closeScriptureGuide();
  }

  function lockGuideScroll() {
    scriptureGuideState.scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + scriptureGuideState.scrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlockGuideScroll() {
    var y = scriptureGuideState.scrollY || 0;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, y);
  }

  function showScriptureGuideSummary() {
    var overlay = ensureScriptureGuideOverlay();
    var summary = overlay.querySelector('[data-guide-panel="summary"]');
    var detail = overlay.querySelector('[data-guide-panel="detail"]');
    if (summary) summary.hidden = false;
    if (detail) detail.hidden = true;
    scriptureGuideState.step = 'summary';
    var focusEl = overlay.querySelector('.scripture-guide-more-btn');
    if (focusEl) focusEl.focus();
  }

  function showScriptureGuideDetail() {
    var overlay = ensureScriptureGuideOverlay();
    var summary = overlay.querySelector('[data-guide-panel="summary"]');
    var detail = overlay.querySelector('[data-guide-panel="detail"]');
    if (summary) summary.hidden = true;
    if (detail) detail.hidden = false;
    scriptureGuideState.step = 'detail';
    var focusEl = overlay.querySelector('[data-guide-panel="detail"] [data-guide-close]');
    if (focusEl) focusEl.focus();
  }

  function openScriptureGuide(testament, catName, triggerEl) {
    var guide = getScriptureGuide(testament, catName);
    if (!guide) return;
    var overlay = ensureScriptureGuideOverlay();
    populateGuideSummary(overlay, guide);
    populateGuideDetail(overlay, guide);
    scriptureGuideState.triggerEl = triggerEl || null;
    scriptureGuideState.activeTestament = testament;
    scriptureGuideState.activeCat = catName;
    scriptureGuideState.open = true;
    showScriptureGuideSummary();
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    lockGuideScroll();
    var focusEl = overlay.querySelector('.scripture-guide-more-btn');
    if (focusEl) {
      try { focusEl.focus(); } catch (err) {}
    }
  }

  function closeScriptureGuide() {
    if (!scriptureGuideOverlay || !scriptureGuideState.open) return;
    scriptureGuideOverlay.classList.remove('is-open');
    scriptureGuideOverlay.setAttribute('aria-hidden', 'true');
    scriptureGuideState.open = false;
    showScriptureGuideSummary();
    unlockGuideScroll();
    var trigger = scriptureGuideState.triggerEl;
    scriptureGuideState.triggerEl = null;
    if (trigger && typeof trigger.focus === 'function') {
      try { trigger.focus(); } catch (err) {}
    }
  }

  var GUIDE_RETURN_TAG_LABEL = '← 관련 말씀으로 돌아가기';

  function getGuideReturnLabel() {
    return GUIDE_RETURN_TAG_LABEL;
  }

  function removeGuideReturnTag() {
    if (guideReturnTag && guideReturnTag.parentNode) {
      guideReturnTag.parentNode.removeChild(guideReturnTag);
    }
    guideReturnTag = null;
    if (guideVerseHighlightTimers.item) {
      guideVerseHighlightTimers.item.classList.remove('gomna-guide-verse-has-return');
    }
    var legacyBar = document.getElementById('scriptureGuideReturnBar');
    if (legacyBar && legacyBar.parentNode) legacyBar.parentNode.removeChild(legacyBar);
  }

  function attachGuideReturnTag(afterItem, testament, catName) {
    if (!afterItem || !catName || !guideReturnState) return;
    removeGuideReturnTag();
    var tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'scripture-guide-return-tag';
    tag.setAttribute('data-guide-return-tag', '1');
    tag.textContent = getGuideReturnLabel();
    tag.setAttribute('aria-label', '관련 말씀으로 돌아가기');
    tag.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      restoreGuideDetailReturn();
    });
    afterItem.classList.add('gomna-guide-verse-has-return');
    afterItem.insertAdjacentElement('afterend', tag);
    guideReturnTag = tag;
  }

  function saveGuideReturnState(ref) {
    var testament = scriptureGuideState.activeTestament || 'old';
    var catName = scriptureGuideState.activeCat || '모세오경';
    var detailBody = scriptureGuideOverlay && scriptureGuideOverlay.querySelector('.scripture-guide-detail-body');
    guideReturnState = {
      testament: testament,
      catName: catName,
      returnLabel: getGuideReturnLabelText(testament, catName),
      step: 'detail',
      detailScrollTop: detailBody ? detailBody.scrollTop : 0,
      relatedVerse: ref ? {
        book: ref.book,
        chapter: ref.chapter,
        verse: ref.verse,
        testament: ref.testament
      } : null,
      triggerEl: scriptureGuideState.triggerEl || null
    };
  }

  function scrollToGuideCategoryHeading(testament, catName) {
    var section = document.querySelector('.cat-section[data-testament="' + testament + '"][data-cat="' + catName + '"]');
    if (!section) return false;
    var titleEl = section.querySelector('.section-title');
    var target = titleEl || section;
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      target.scrollIntoView();
    }
    return true;
  }

  function scheduleScrollToGuideCategory(testament, catName) {
    var delays = [0, 80, 200, 500, 1000];
    for (var i = 0; i < delays.length; i++) {
      (function(ms) {
        setTimeout(function() {
          scrollToGuideCategoryHeading(testament, catName);
        }, ms);
      })(delays[i]);
    }
  }

  function returnToGuideCategoryList(testament, catName) {
    var tab = testament === 'new' ? 'new' : 'old';
    if (typeof switchTab === 'function') switchTab(tab);
    if (typeof syncReaderNavActive === 'function') syncReaderNavActive();
    scheduleScrollToGuideCategory(testament, catName);
  }

  function scrollToGuideRelatedVerses(overlay) {
    var detailBody = overlay && overlay.querySelector('.scripture-guide-detail-body');
    var marker = detailBody && detailBody.querySelector('[data-guide-related-verses]');
    if (!detailBody || !marker) return;
    var delays = [0, 50, 150, 300];
    for (var i = 0; i < delays.length; i++) {
      (function(ms) {
        setTimeout(function() {
          try {
            detailBody.scrollTop = Math.max(0, marker.offsetTop - 12);
          } catch (err) {}
        }, ms);
      })(delays[i]);
    }
  }

  function restoreGuideDetailReturn() {
    if (!guideReturnState) return;
    var testament = guideReturnState.testament;
    var catName = guideReturnState.catName;
    var triggerEl = guideReturnState.triggerEl;
    clearGuideVerseReturnUI();
    guideReturnState = null;

    var guide = getScriptureGuide(testament, catName);
    if (!guide) return;

    var overlay = ensureScriptureGuideOverlay();
    populateGuideSummary(overlay, guide);
    populateGuideDetail(overlay, guide);
    scriptureGuideState.triggerEl = triggerEl || null;
    scriptureGuideState.activeTestament = testament;
    scriptureGuideState.activeCat = catName;
    scriptureGuideState.open = true;
    showScriptureGuideDetail();
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    lockGuideScroll();
    scrollToGuideRelatedVerses(overlay);
  }

  function clearGuideVerseReturnUI() {
    if (guideVerseHighlightTimers.hold) {
      clearTimeout(guideVerseHighlightTimers.hold);
      guideVerseHighlightTimers.hold = null;
    }
    if (guideVerseHighlightTimers.fade) {
      clearTimeout(guideVerseHighlightTimers.fade);
      guideVerseHighlightTimers.fade = null;
    }
    if (guideVerseHighlightTimers.item) {
      guideVerseHighlightTimers.item.classList.remove('gomna-guide-verse-highlight');
      guideVerseHighlightTimers.item.classList.remove('gomna-guide-verse-highlight-fade');
      guideVerseHighlightTimers.item.classList.remove('gomna-guide-verse-has-return');
      guideVerseHighlightTimers.item = null;
    }
    removeGuideReturnTag();
  }

  function applyGuideVerseHighlight(item, persistent) {
    if (!item) return;
    clearGuideVerseReturnUI();
    guideVerseHighlightTimers.item = item;
    item.classList.remove('gomna-guide-verse-highlight-fade');
    void item.offsetWidth;
    item.classList.add('gomna-guide-verse-highlight');
    if (persistent) return;
    guideVerseHighlightTimers.hold = setTimeout(function() {
      guideVerseHighlightTimers.hold = null;
      if (!guideVerseHighlightTimers.item || guideVerseHighlightTimers.item !== item) return;
      item.classList.add('gomna-guide-verse-highlight-fade');
      guideVerseHighlightTimers.fade = setTimeout(function() {
        guideVerseHighlightTimers.fade = null;
        item.classList.remove('gomna-guide-verse-highlight');
        item.classList.remove('gomna-guide-verse-highlight-fade');
        if (guideVerseHighlightTimers.item === item) guideVerseHighlightTimers.item = null;
      }, GUIDE_VERSE_HIGHLIGHT_FADE_MS);
    }, GUIDE_VERSE_HIGHLIGHT_HOLD_MS);
  }

  function resolveGuideVerseTestament(bookName) {
    if (typeof findBook === 'function' && typeof newTestamentData !== 'undefined' && findBook(newTestamentData, bookName)) {
      return 'new';
    }
    return 'old';
  }

  function tryFocusGuideVerse() {
    if (!guideVersePending) return false;
    var pending = guideVersePending;
    if (!window.currentBook || window.currentBook.name !== pending.book) return false;
    if (Number(window.currentChapter) !== pending.chapter) return false;
    var item = document.querySelector('.verse-item[data-verse="' + pending.verse + '"]');
    if (!item) return false;

    try { item.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) { item.scrollIntoView(); }

    applyGuideVerseHighlight(item, true);
    if (guideReturnState) attachGuideReturnTag(item, guideReturnState.testament, guideReturnState.catName);

    guideVersePending = null;
    scriptureGuideState.verseNavigating = false;
    return true;
  }

  function scheduleGuideVerseFocus() {
    var delays = [0, 80, 200, 500, 1000, 2500];
    for (var i = 0; i < delays.length; i++) {
      (function(ms) {
        setTimeout(function() {
          if (guideVersePending) tryFocusGuideVerse();
        }, ms);
      })(delays[i]);
    }
  }

  function ensureGuideVerseNavListeners() {
    if (!guideVerseFocusBound) {
      guideVerseFocusBound = true;
      window.addEventListener('gomna:verse_list_rendered', function() {
        if (guideVersePending) {
          tryFocusGuideVerse();
        } else if (
          (guideVerseHighlightTimers.item && !document.contains(guideVerseHighlightTimers.item)) ||
          (guideReturnTag && !document.contains(guideReturnTag))
        ) {
          clearGuideVerseReturnUI();
        }
      });
      document.addEventListener('click', function(e) {
        if (!guideReturnTag && !guideVerseHighlightTimers.item) return;
        var homeBtn = e.target.closest('.reader-home, [data-reader-tab="home"], a[href="/"], button[onclick*="location.href=\'/\'"]');
        if (homeBtn) clearGuideVerseReturnUI();
      }, true);
      document.addEventListener('click', function(e) {
        if (!guideVerseHighlightTimers.item) return;
        if (e.target.closest('[data-guide-return-tag]')) return;
        var verseItem = e.target.closest('.verse-item[data-verse]');
        if (verseItem && verseItem !== guideVerseHighlightTimers.item) clearGuideVerseReturnUI();
      }, true);
    }
  }

  function navigateToGuideRelatedVerse(ref) {
    if (!ref || !ref.book) return;
    if (scriptureGuideState.verseNavigating) return;

    clearGuideVerseReturnUI();
    var chapter = Number(ref.chapter);
    var verse = Number(ref.verse);
    if (isNaN(chapter) || isNaN(verse) || chapter < 1 || verse < 1) return;
    if (typeof goToVerse !== 'function') return;

    var testament = ref.testament || resolveGuideVerseTestament(ref.book);
    scriptureGuideState.verseNavigating = true;

    saveGuideReturnState(ref);
    closeScriptureGuide();

    guideVersePending = { book: ref.book, chapter: chapter, verse: verse, testament: testament };

    ensureGuideVerseNavListeners();
    goToVerse(ref.book, chapter, verse, testament);
    scheduleGuideVerseFocus();
  }

  function navigateToGuideCategory(testament, catName) {
    closeScriptureGuide();
    returnToGuideCategoryList(testament, catName);
  }

  function attachScriptureGuideTriggers(section, titleEl, testament, catName) {
    if (!titleEl || titleEl.querySelector('.scripture-guide-info-btn')) return;
    var infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'scripture-guide-info-btn';
    infoBtn.setAttribute('aria-label', catName + ' 길잡이 열기');
    infoBtn.textContent = 'Guide';

    function openGuide(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      openScriptureGuide(testament, catName, infoBtn);
    }

    infoBtn.addEventListener('click', openGuide);
    titleEl.appendChild(infoBtn);
    titleEl.setAttribute('tabindex', '0');
    titleEl.setAttribute('role', 'button');
    titleEl.setAttribute('aria-label', catName + ' 성경 길잡이 열기');
    titleEl.addEventListener('click', function(e) {
      if (e.target.closest('.scripture-guide-info-btn')) return;
      openGuide(e);
    });
    titleEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.scripture-guide-info-btn')) return;
        openGuide(e);
      }
    });
  }

  function enhanceView(viewId, info, testament){
    var view = document.getElementById(viewId);
    if (!view) return;
    var titles = view.querySelectorAll('.section-title');
    for (var i = 0; i < titles.length; i++) enhanceTitle(titles[i], info, testament);
  }

  function enhanceTitle(titleEl, info, testament){
    if (titleEl.parentElement && titleEl.parentElement.classList.contains('cat-trow')) return;
    var catName = parseCategoryName(titleEl.textContent);
    var data = info[catName];
    if (!data) return;

    var section = document.createElement('div');
    section.className = 'cat-section scripture-category-heading';
    section.setAttribute('data-cat', catName);
    section.setAttribute('data-testament', testament);
    var isGuideCat = isScriptureGuideCategory(testament, catName);
    if (isGuideCat) section.classList.add('cat-section--scripture-guide');

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
    if (!isGuideCat) appendScriptureCategoryInfo(titleEl);
    trow.appendChild(titleEl);
    trow.appendChild(btn);
    section.appendChild(trow);
    section.appendChild(tagrow);
    section.appendChild(box);
    if (!isGuideCat) appendScriptureCategoryDescription(section, catName, info, tagrow, testament);

    if (nextSib && nextSib.classList && nextSib.classList.contains('book-grid')) {
      section.appendChild(nextSib);
    }

    if (isGuideCat) {
      if (tagrow) tagrow.classList.add('cat-collapsed');
      if (box) box.classList.add('cat-collapsed');
      attachScriptureGuideTriggers(section, titleEl, testament, catName);
    } else {
      setupAnimation(section, btn);
    }
  }

  function enhanceUnifiedSections(testament) {
    var body = document.getElementById('unifiedBcBody');
    if (!body) return;
    var info = testament === 'new' ? ntInfo : otInfo;
    var secs = body.querySelectorAll('.unified-bc-sec');
    for (var i = 0; i < secs.length; i++) {
      var secEl = secs[i];
      var catName = parseCategoryName(secEl.textContent);
      var data = info[catName];
      if (!data || !data.shortDesc || isScriptureGuideCategory(testament, catName)) continue;
      appendScriptureCategoryInfo(secEl);
      if (secEl.nextElementSibling && secEl.nextElementSibling.classList.contains('scripture-category-description')) continue;
      var desc = document.createElement('p');
      desc.className = 'scripture-category-description';
      desc.setAttribute('data-cat', catName);
      desc.textContent = data.shortDesc;
      secEl.parentNode.insertBefore(desc, secEl.nextElementSibling);
    }
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
      timer = setTimeout(hide, 6000);
    }

    timer = setTimeout(hide, 6000);
    btn.addEventListener('click', showAgain);
  }

  function wrapRender(fnName, viewId, info, testament){
    if (typeof window[fnName] !== 'function') return false;
    if (window[fnName].__catWrapped) return true;
    var original = window[fnName];
    var wrapped = function(){
      var result = original.apply(this, arguments);
      enhanceView(viewId, info, testament);
      return result;
    };
    wrapped.__catWrapped = true;
    window[fnName] = wrapped;
    return true;
  }

  function wrapUnifiedModalRender(){
    if (typeof window.renderUnifiedModalBody !== 'function') return false;
    if (window.renderUnifiedModalBody.__catWrapped) return true;
    var original = window.renderUnifiedModalBody;
    var wrapped = function(){
      var result = original.apply(this, arguments);
      var testament = (window.unifiedBcState && window.unifiedBcState.testament) || 'old';
      enhanceUnifiedSections(testament);
      return result;
    };
    wrapped.__catWrapped = true;
    window.renderUnifiedModalBody = wrapped;
    return true;
  }

  var attempts = 0;
  function init(){
    var hasOld = wrapRender('renderOldTestament', 'oldView', otInfo, 'old');
    var hasNew = wrapRender('renderNewTestament', 'newView', ntInfo, 'new');
    var hasUnified = wrapUnifiedModalRender();
    if ((!hasOld || !hasNew || !hasUnified) && attempts < 30) {
      attempts++;
      setTimeout(init, 200);
      return;
    }
    enhanceView('oldView', otInfo, 'old');
    enhanceView('newView', ntInfo, 'new');
    if (window.unifiedBcState) enhanceUnifiedSections(window.unifiedBcState.testament || 'old');
    console.log('[은혜의말씀] 카테고리 3단 안내 기능 로드 완료');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
