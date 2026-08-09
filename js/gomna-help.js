/* 은혜의말씀 — 앱 안 도움말(홈·Reader 공용)
   ────────────────────────────────────────────────────────────
   홈페이지의 /guide(서비스 전체 설명서)와는 별개다.
   여기에는 "지금 하려는 일"과 "문제가 생겼을 때"만 짧게 담는다.

   모양은 설정 시트(settings_guide.js)와 같은 언어를 쓴다.
     작은 구역 제목 · 한 줄 메뉴 · 오른쪽 › · 얇은 구분선 · 오른쪽 위 ×
   테마는 js/gomna-theme.js(data-gomna-theme), 글자 크기는
   js/gomna-text-scale.js를 그대로 따라간다(별도 체계를 만들지 않는다).

   내용은 모두 실제 화면 동작을 확인해 적었다. 없는 기능은 쓰지 않는다. */
(function () {
  var POPUP_ID = 'gomnaHelpPopup';
  var STYLE_ID = 'gomna-help-styles';
  /* 개인정보처리방침·이용약관·문의 페이지에서 쓰는 실제 공식 주소 */
  var CONTACT_MAIL = 'ceo@gomnastudio.com';

  /* 도움말 문구 유지 원칙
     ─ 사실 기준은 지금 실제로 동작하는 앱 기능과 화면에 보이는 버튼·메뉴 이름이다.
     ─ 홈페이지 /guide 문구를 가져오거나 자동으로 맞추지 않는다(목적과 문체가 다르다).
     ─ 홈페이지 문구·디자인만 바뀐 경우에는 여기를 고치지 않는다.
     ─ 버튼명·메뉴명·사용 순서·기능 동작이 바뀌면 관련 항목의 설명을 함께 확인한다.
     collapsed: true 인 구역은 첫 화면에서 한 줄(label)로 접히고, 눌렀을 때 하위 목록이 열린다. */
  var TOPICS = [
    {
      title: '말씀 이용하기',
      items: [
        {
          id: 'read-listen',
          icon: 'read',
          label: '성경 읽기와 듣기',
          body: [
            ['p', '홈에서 성경읽기를 누르고 책과 장을 선택하면 본문을 읽을 수 있습니다. 쉬운찾기에서 분류별이나 가나다순으로 책을 찾을 수도 있습니다.'],
            ['p', '본문 아래 도구모음에서 장 전체 듣기를 누르면 장을 처음부터 들을 수 있습니다.'],
            ['p', '구절을 선택한 뒤에는 절 듣기와 이어듣기 중에서 고를 수 있습니다. 절 듣기는 선택한 구절만, 이어듣기는 그 구절부터 계속 재생합니다.'],
            ['p', '재생 중에는 듣기 화면에서 속도와 목소리를 바꾸거나, 장 끝까지 자동 재생을 켤 수 있습니다.']
          ]
        },
        {
          id: 'verse-commentary',
          icon: 'verse',
          label: '구절 선택과 말씀풀이',
          body: [
            ['p', '본문에서 원하는 구절을 누르면 그 절이 선택됩니다. 한 번 더 누르면 선택이 풀리고, 여러 구절을 함께 선택할 수도 있습니다.'],
            ['p', '구절을 선택한 뒤 말씀풀이를 누르면 선택한 말씀을 더 깊이 살펴볼 수 있습니다.'],
            ['p', '여러 구절을 선택했다면 첫 번째 구절의 말씀풀이가 먼저 열리고, 위쪽 ‹ › 화살표로 선택한 구절을 차례로 볼 수 있습니다.'],
            ['note', '말씀풀이는 원어, 역사적 배경, 신학적 의미, 매튜헨리 주석, 교차참조 등 여러 관점의 자료를 탭으로 제공합니다.']
          ]
        },
        {
          id: 'search',
          icon: 'search',
          label: '말씀 찾기',
          body: [
            ['p', '홈의 검색창에 찾고 싶은 단어를 입력하면 성경 구절을 검색할 수 있습니다. 로마서 8장처럼 책과 장을 입력해 바로 이동할 수도 있습니다.'],
            ['p', '검색창 아래의 주제를 누르면 마음이나 상황에 맞는 말씀을 찾을 수 있습니다.'],
            ['note', '주제 예: 사랑, 믿음, 소망, 평안, 위로, 감사, 기도']
          ]
        },
        {
          id: 'archive-resume',
          icon: 'bookmark',
          label: '보관함과 이어보기',
          body: [
            ['p', '마음에 남는 말씀은 구절을 선택한 뒤 더보기에서 저장을 누르면 보관함에 담깁니다.'],
            ['p', '보관한 말씀은 내 정보 → 보관함에서 다시 볼 수 있습니다.'],
            ['p', '읽던 곳과 듣던 곳도 기록되어, 홈의 이어서 읽기와 이어서 듣기로 다음에 다시 이어서 볼 수 있습니다. 최근에 본 말씀도 홈에 함께 표시됩니다.']
          ]
        },
        {
          id: 'share',
          icon: 'share',
          label: '말씀 공유하기',
          body: [
            ['p', '구절을 선택한 뒤 더보기에서 공유를 누르면, 기기에서 지원하는 메시지나 앱을 골라 말씀을 보낼 수 있습니다.'],
            ['p', '기기가 공유 기능을 지원하지 않으면 말씀이 클립보드에 복사되어, 원하는 곳에 직접 붙여 전달할 수 있습니다.'],
            ['note', '더보기의 본문 복사를 쓰면 선택한 구절의 본문만 복사됩니다.']
          ]
        }
      ]
    },
    {
      title: '계정과 기록',
      items: [
        {
          id: 'login',
          icon: 'account',
          label: '로그인과 계정',
          body: [
            ['p', '로그인하면 같은 계정으로 다시 접속했을 때 저장한 기록을 이어서 사용할 수 있습니다.'],
            ['p', '카카오, Google, 이메일 중 사용할 로그인 방법을 선택해 로그인할 수 있습니다. 이메일은 회원가입과 비밀번호 재설정도 할 수 있습니다.'],
            ['p', '로그인한 뒤에는 화면 위쪽의 내 정보를 눌러 프로필과 계정 기능을 이용할 수 있습니다.']
          ]
        },
        {
          id: 'sync',
          icon: 'sync',
          label: '기록 동기화',
          body: [
            ['p', '로그인한 상태에서 내 정보 → 동기화를 누르면 은혜의말씀의 저장 기록을 계정과 동기화할 수 있습니다.'],
            ['p', '동기화되는 기록은 저장한 말씀, 읽던 곳, 듣던 곳, 최근 말씀입니다.'],
            ['p', '동기화가 끝나면 버튼에 동기화 완료가 표시됩니다.'],
            ['note', '동기화는 누를 때마다 실행됩니다. 이 기기의 기록은 동기화 과정에서 지워지지 않습니다.']
          ]
        }
      ]
    },
    {
      title: '설정과 사용환경',
      items: [
        {
          id: 'display',
          icon: 'display',
          label: '화면 설정',
          body: [
            ['h', '글자 크기'],
            ['p', '내 정보 → 설정 → 글자 크기에서 － / ＋ 버튼으로 글자를 조절할 수 있습니다. 18px부터 26px까지 고를 수 있고, 홈과 본문에 함께 적용됩니다.'],
            ['h', '테마'],
            ['p', '내 정보 → 설정 → 테마에서 라이트 모드, 다크 모드, 자동을 선택할 수 있습니다. 자동을 선택하면 사용하는 기기의 화면 모드를 따릅니다.'],
            ['h', '본문 줄 간격'],
            ['p', '내 정보 → 설정 → 본문 줄 간격에서 기본, 여유롭게, 넓게 중에서 읽기 편한 간격을 고를 수 있습니다.']
          ]
        },
        {
          id: 'language',
          icon: 'globe',
          label: '언어 변경',
          body: [
            ['p', '내 정보 → 설정 → 언어에서 은혜의말씀의 표시 언어를 변경할 수 있습니다.'],
            ['p', '선택한 언어는 메뉴와 안내 문구 등 화면 표시에 적용됩니다.'],
            ['note', '성경 본문의 번역본을 바꾸는 기능은 아닙니다.']
          ]
        },
        {
          id: 'install',
          icon: 'install',
          label: '홈 화면에 설치',
          body: [
            ['h', '아이폰'],
            ['p', 'Safari에서 gomnastudio.com을 연 뒤 공유 버튼 → 홈 화면에 추가 → 추가를 누르세요.'],
            ['h', '안드로이드'],
            ['p', 'Chrome에서 gomnastudio.com을 연 뒤 오른쪽 위 메뉴 → 홈 화면에 추가 또는 앱 설치를 선택하세요.']
          ]
        }
      ]
    },
    {
      id: 'trouble',
      title: '문제 해결',
      label: '문제 해결',
      icon: 'help',
      collapsed: true,
      items: [
        {
          id: 'trouble-login',
          icon: 'account',
          label: '로그인이 되지 않을 때',
          body: [
            ['p', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'],
            ['p', '로그인 화면을 닫았다가 다시 열어 사용할 로그인 방법을 선택해 주세요.'],
            ['p', '계속 로그인되지 않으면 잠시 후 다시 시도해 주세요. 저장한 기록은 이 기기에 그대로 남아 있습니다.']
          ]
        },
        {
          id: 'trouble-audio',
          icon: 'sound',
          label: '소리가 나오지 않을 때',
          body: [
            ['p', '기기의 음량과 무음 모드를 확인해 주세요.'],
            ['p', '인터넷 연결 상태를 확인한 뒤 말씀 듣기를 다시 실행해 주세요.'],
            ['p', '오디오 준비 중입니다라는 안내가 보이면 잠시 뒤 다시 눌러 주세요. 해당 목소리는 준비 중입니다라고 나오면 듣기 화면에서 다른 목소리를 선택해 주세요.'],
            ['p', '다른 장도 재생되지 않으면 페이지를 다시 열어 확인해 주세요.']
          ]
        },
        {
          id: 'trouble-records',
          icon: 'sync',
          label: '기록이 보이지 않을 때',
          body: [
            ['p', '다른 기기에서 기록이 보이지 않는다면 같은 계정으로 로그인했는지 먼저 확인해 주세요.'],
            ['p', '내 정보 → 동기화를 눌러 기록을 다시 동기화해 주세요.'],
            ['p', '로그인하지 않은 상태에서 저장한 일부 기록은 현재 기기에만 남아 있을 수 있습니다. 로그인한 뒤 동기화를 누르면 계정 기록과 합쳐집니다.']
          ]
        },
        {
          id: 'contact',
          icon: 'mail',
          label: '문의하기',
          body: [
            ['p', '도움말에서 해결되지 않는 점은 아래 주소로 알려 주세요. 사용 중인 기기와 화면을 함께 적어 주시면 확인이 빠릅니다.'],
            ['mail', CONTACT_MAIL]
          ]
        }
      ]
    }
  ];

  /* 선 굵기와 마감을 하나로 맞춘 선형 아이콘. 이모지·외부 라이브러리를 쓰지 않는다. */
  var ICONS = {
    /* 펼친 성경책 + 오른쪽에 작은 음성 표시 */
    read: '<path d="M3.8 5.4h5.4c1.1 0 2.1.5 2.8 1.3v11.9c-.7-.8-1.7-1.3-2.8-1.3H3.8V5.4Z"/>'
      + '<path d="M20.2 5.4h-5.4c-1.1 0-2.1.5-2.8 1.3v11.9c.7-.8 1.7-1.3 2.8-1.3h5.4V5.4Z"/>'
      + '<path d="M15.4 9.9v3.2"/><path d="M17.7 8.6v5.8"/>',
    /* 문서 + 선택 표시 */
    verse: '<path d="M14.1 3.7H7.5a1.9 1.9 0 0 0-1.9 1.9v12.8a1.9 1.9 0 0 0 1.9 1.9h9a1.9 1.9 0 0 0 1.9-1.9V8.1Z"/>'
      + '<path d="M14.1 3.7v4.4h4.3"/>'
      + '<path d="M8.6 12.3l1.4 1.4 2.5-2.7"/><path d="M8.6 16.6h6.6"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.2"/><path d="M15.4 15.4l4.3 4.3"/>',
    bookmark: '<path d="M6.5 4.4h11v15.4l-5.5-3.8-5.5 3.8V4.4Z"/>',
    share: '<circle cx="17.3" cy="6.1" r="2.5"/><circle cx="6.7" cy="12" r="2.5"/>'
      + '<circle cx="17.3" cy="17.9" r="2.5"/><path d="M9 10.8l6-3.5"/><path d="M9 13.2l6 3.5"/>',
    account: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5.5 19.7c.9-3.1 3.4-4.9 6.5-4.9s5.6 1.8 6.5 4.9"/>',
    sync: '<path d="M19.4 9.6A7.5 7.5 0 0 0 5.6 8.2"/><path d="M4.6 14.4a7.5 7.5 0 0 0 13.8 1.4"/>'
      + '<path d="M4.6 4.8v3.6h3.6"/><path d="M19.4 19.2v-3.6h-3.6"/>',
    /* 화면 + 조절 손잡이 */
    display: '<rect x="3.4" y="4.6" width="17.2" height="11.7" rx="2.2"/>'
      + '<path d="M7.5 10.5h9"/><path d="M13.1 8.7v3.6"/><path d="M9.2 19.6h5.6"/>',
    globe: '<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4"/>'
      + '<path d="M12 3.8c2.1 2.3 3.3 5.1 3.3 8.2S14.1 17.9 12 20.2c-2.1-2.3-3.3-5.1-3.3-8.2S9.9 6.1 12 3.8Z"/>',
    /* 기기 + 추가 */
    install: '<rect x="6.4" y="3.3" width="11.2" height="17.4" rx="2.4"/>'
      + '<path d="M12 8.7v6"/><path d="M9 11.7h6"/>',
    /* 소리 */
    sound: '<path d="M5 9.7h2.8L12 6.2v11.6L7.8 14.3H5V9.7Z"/>'
      + '<path d="M15.6 9.4a3.7 3.7 0 0 1 0 5.2"/><path d="M18 7a7.1 7.1 0 0 1 0 10"/>',
    mail: '<rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2.2"/><path d="M4.4 7.4l7.6 5.4 7.6-5.4"/>',
    help: '<circle cx="12" cy="12" r="9"/>'
      + '<path d="M9.6 9.3a2.4 2.4 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9"/><path d="M12 17.1h.01"/>'
  };

  function svgIcon(name) {
    var paths = ICONS[name] || ICONS.help;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' + paths + '</svg>';
  }

  var popup = null;
  var titleEl = null;
  var titleIcon = null;
  var headEl = null;
  var backBtn = null;
  var scrollEl = null;
  var mainView = null;
  var views = {};          /* key → { el, title, parent } */
  var currentView = 'main';
  var lastFocus = null;

  /* 다크 규칙 접두사. 공용 테마(js/gomna-theme.js)가 만드는 규칙과 같은 자리를 다투므로
     body를 한 단계 더 붙여 도움말 표면 색이 확실히 적용되게 한다. */
  var DARK = 'html[data-gomna-theme="dark"] body #gomnaHelpPopup ';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#gomnaHelpPopup{position:fixed;inset:0;z-index:12000;display:none;align-items:flex-end;justify-content:center;' +
      'padding:0;background:rgba(43,28,18,.5)}' +
      '#gomnaHelpPopup.is-open{display:flex}' +
      '#gomnaHelpPopup .gomna-help-box:focus{outline:none}' +
      /* 표면 3단계: 패널 바닥 → 머리글 → 메뉴 그룹. 아이보리 계열을 유지한 아주 미세한 차이. */
      '#gomnaHelpPopup .gomna-help-box{width:100%;max-width:420px;max-height:min(86dvh,780px);box-sizing:border-box;' +
      'border-radius:20px 20px 0 0;background:#F8F4EC;text-align:left;display:flex;flex-direction:column;' +
      'border:1px solid rgba(180,140,90,.16);border-bottom:none;' +
      'overflow:hidden;box-shadow:0 -8px 32px rgba(61,40,24,.16)}' +
      /* 머리글: 제목 + × (하위 화면에서는 ‹ 뒤로 + 화면 제목) */
      '#gomnaHelpPopup .gomna-help-head{flex:0 0 auto;display:flex;align-items:center;gap:6px;' +
      'background:#FFFDF8;' +
      'padding:14px 10px 12px 18px;border-bottom:1px solid rgba(180,140,90,.16)}' +
      '#gomnaHelpPopup .gomna-help-back{display:none;align-items:center;gap:4px;min-height:36px;padding:0 6px 0 0;' +
      'border:none;background:transparent;color:#8A6A45;font-family:inherit;font-size:14.5px;font-weight:600;cursor:pointer}' +
      '#gomnaHelpPopup .gomna-help-back[data-visible="1"]{display:inline-flex}' +
      '#gomnaHelpPopup .gomna-help-back:active{opacity:.7}' +
      '#gomnaHelpPopup .gomna-help-title{flex:1;min-width:0;font-size:17px;font-weight:800;color:#3D2818;line-height:1.3}' +
      /* 제목 앞 아이콘(inline SVG). 제목 색을 물려받되 조금 옅게 둬서 제목보다 튀지 않게 한다. */
      '#gomnaHelpPopup .gomna-help-title-icon{flex-shrink:0;display:inline-flex;align-items:center;' +
      'margin-right:5px;color:#3D2818;opacity:.78}' +
      '#gomnaHelpPopup .gomna-help-title-icon[hidden]{display:none}' +
      '#gomnaHelpPopup .gomna-help-title-icon svg{display:block;width:24px;height:24px}' +
      /* 하위 화면에서는 ‹ 뒤로와 나란히 서므로 조금 작게 */
      '#gomnaHelpPopup .gomna-help-head[data-sub="1"] .gomna-help-title-icon svg{width:20px;height:20px}' +
      '#gomnaHelpPopup .gomna-help-close{flex-shrink:0;width:38px;height:38px;padding:0;border:none;border-radius:12px;' +
      'background:transparent;color:#8A6A45;font-family:inherit;font-size:17px;cursor:pointer}' +
      '#gomnaHelpPopup .gomna-help-close:hover{background:#F7EEE0}' +
      '#gomnaHelpPopup .gomna-help-scroll{flex:1 1 auto;min-height:210px;overflow-y:auto;' +
      '-webkit-overflow-scrolling:touch;overscroll-behavior:contain;' +
      'scrollbar-width:thin;scrollbar-color:rgba(163,143,114,.32) transparent;' +
      'padding:0 0 calc(14px + env(safe-area-inset-bottom,0px))}' +
      /* 스크롤은 그대로 두고 막대만 얇고 옅게 */
      '#gomnaHelpPopup .gomna-help-scroll::-webkit-scrollbar{width:5px}' +
      '#gomnaHelpPopup .gomna-help-scroll::-webkit-scrollbar-track{background:transparent}' +
      '#gomnaHelpPopup .gomna-help-scroll::-webkit-scrollbar-thumb{border-radius:999px;' +
      'background:rgba(163,143,114,.3)}' +
      '#gomnaHelpPopup .gomna-help-scroll::-webkit-scrollbar-thumb:hover{background:rgba(163,143,114,.5)}' +
      'html[data-gomna-theme="dark"] #gomnaHelpPopup .gomna-help-scroll{scrollbar-color:rgba(233,220,200,.24) transparent}' +
      'html[data-gomna-theme="dark"] #gomnaHelpPopup .gomna-help-scroll::-webkit-scrollbar-thumb{background:rgba(233,220,200,.22)}' +
      'html[data-gomna-theme="dark"] #gomnaHelpPopup .gomna-help-scroll::-webkit-scrollbar-thumb:hover{background:rgba(233,220,200,.38)}' +
      /* 접힌 구역(문제 해결)은 위 묶음과 떨어진 자기 표면으로 보이게 한 줄 만큼 띄운다. */
      '#gomnaHelpPopup .gomna-help-gap{height:20px}' +
      /* 구역 제목은 메뉴보다 작고 옅게 (아이콘 없음) */
      '#gomnaHelpPopup .gomna-help-section-title{padding:18px 20px 7px;font-size:12.5px;font-weight:700;' +
      'color:#9B8061;letter-spacing:-.1px;line-height:1.3}' +
      /* 관련 메뉴를 하나의 부드러운 그룹 표면으로 묶는다(메뉴마다 카드로 쪼개지 않는다) */
      '#gomnaHelpPopup .gomna-help-group{margin:0 14px;border-radius:15px;background:#FFFCF7;' +
      'border:1px solid rgba(180,140,90,.1);overflow:hidden}' +
      '#gomnaHelpPopup .gomna-help-group--list{margin-top:16px}' +
      /* 메뉴 한 줄: 아이콘 + 이름 + › */
      '#gomnaHelpPopup .gomna-help-row{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;' +
      'min-height:56px;padding:8px 14px;border:none;' +
      'background:transparent;color:#3D2818;font-family:inherit;font-size:15.5px;font-weight:600;' +
      'text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '#gomnaHelpPopup .gomna-help-row + .gomna-help-row{border-top:1px solid rgba(180,140,90,.13)}' +
      '#gomnaHelpPopup .gomna-help-row:active{background:rgba(244,232,205,.4)}' +
      /* 아이콘은 배경 없이 그룹 표면 위에 바로 놓는다. 자리(31px)만 고정해 이름 시작점을 지킨다. */
      '#gomnaHelpPopup .gomna-help-row-icon{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;' +
      'width:31px;height:31px;color:#4A3423}' +
      '#gomnaHelpPopup .gomna-help-row-icon svg{display:block;width:19px;height:19px}' +
      '#gomnaHelpPopup .gomna-help-row-label{flex:1 1 auto;min-width:0}' +
      '#gomnaHelpPopup .gomna-help-row-arrow{flex-shrink:0;width:7px;height:7px;margin-left:2px;' +
      'border-right:2px solid #C3AB86;border-bottom:2px solid #C3AB86;transform:rotate(-45deg)}' +
      /* 상세: 그룹과 같은 계열 표면 위에 짧은 문단 */
      '#gomnaHelpPopup .gomna-help-detail{margin:16px 14px 0;padding:2px 16px 16px;border-radius:15px;' +
      'background:#FFFCF7;border:1px solid rgba(180,140,90,.1)}' +
      '#gomnaHelpPopup .gomna-help-detail p{margin:12px 0 0;font-size:15px;font-weight:500;line-height:1.72;' +
      'color:#4A3423;word-break:keep-all;overflow-wrap:anywhere}' +
      '#gomnaHelpPopup .gomna-help-detail h4{margin:18px 0 0;font-size:13px;font-weight:700;color:#A38F72;' +
      'letter-spacing:-.1px;line-height:1.3}' +
      /* 안내 상자는 불투명한 색으로 둔다. 공용 테마가 다크에서 알아서 어두운 면으로 바꿔 준다. */
      '#gomnaHelpPopup .gomna-help-detail .gomna-help-note{margin-top:14px;padding:11px 13px;border-radius:12px;' +
      'background:#F2E8D6;font-size:14px;color:#6E5536;line-height:1.65}' +
      'html[data-gomna-theme="dark"] #gomnaHelpPopup .gomna-help-detail .gomna-help-note{background:rgba(233,220,200,.07)}' +
      '#gomnaHelpPopup .gomna-help-mail{display:inline-block;margin-top:14px;font-size:15px;font-weight:700;' +
      'color:#2563EB;text-decoration:none;word-break:break-all}' +
      '#gomnaHelpPopup .gomna-help-mail:hover{color:#1D4ED8;text-decoration:underline}' +
      '#gomnaHelpPopup .gomna-help-mail:active{color:#1E40AF}' +
      /* 다크: 라이트와 같은 3단계 표면을 웜 다크(짙은 나무색)로 옮긴다.
         공용 테마가 만든 자동 변환보다 뒤에 와야 하므로 body를 한 단계 더 붙여 우선순위를 확보한다. */
      DARK + '.gomna-help-box{background:#211E1A;border-color:rgba(241,230,214,.09);' +
      'box-shadow:0 -8px 32px rgba(0,0,0,.45)}' +
      DARK + '.gomna-help-head{background:#29241F;border-bottom-color:rgba(241,230,214,.09)}' +
      DARK + '.gomna-help-title{color:#F2E7D7}' +
      DARK + '.gomna-help-title-icon{color:#F2E7D7}' +
      DARK + '.gomna-help-back{color:#C9B396}' +
      DARK + '.gomna-help-close{color:#C9B396}' +
      DARK + '.gomna-help-close:hover{background:rgba(241,230,214,.07)}' +
      DARK + '.gomna-help-section-title{color:#BCA68C}' +
      DARK + '.gomna-help-group{background:#2D2823;border-color:rgba(241,230,214,.07)}' +
      DARK + '.gomna-help-row{color:#F2E7D7}' +
      DARK + '.gomna-help-row + .gomna-help-row{border-top-color:rgba(241,230,214,.09)}' +
      DARK + '.gomna-help-row:active{background:rgba(241,230,214,.05)}' +
      DARK + '.gomna-help-row-icon{color:#E9DCC8}' +
      DARK + '.gomna-help-row-arrow{border-right-color:rgba(241,230,214,.42);' +
      'border-bottom-color:rgba(241,230,214,.42)}' +
      DARK + '.gomna-help-detail{background:#2D2823;border-color:rgba(241,230,214,.07)}' +
      DARK + '.gomna-help-detail p{color:#E4D8C4}' +
      DARK + '.gomna-help-detail h4{color:#BCA68C}' +
      DARK + '.gomna-help-detail .gomna-help-note{background:rgba(241,230,214,.06);color:#C9B79A}' +
      '@media(min-width:769px){#gomnaHelpPopup{align-items:center;padding:24px}' +
      '#gomnaHelpPopup .gomna-help-box{border-radius:20px;max-height:min(84vh,780px)}}';
    (document.head || document.documentElement).appendChild(style);
    /* 글자 크기·테마 공용 체계가 새 스타일도 바로 반영하게 한다. */
    try { if (window.GomnaTextScale) window.GomnaTextScale.refresh(); } catch (e) {}
    try { if (window.GomnaTheme) window.GomnaTheme.refresh(); } catch (e) {}
  }

  function addDetail(item) {
    var view = document.createElement('div');
    view.className = 'gomna-help-detail';
    view.hidden = true;
    for (var i = 0; i < item.body.length; i++) {
      var line = item.body[i];
      var kind = line[0];
      var text = line[1];
      var el;
      if (kind === 'h') {
        el = document.createElement('h4');
        el.textContent = text;
      } else if (kind === 'note') {
        el = document.createElement('p');
        el.className = 'gomna-help-note';
        el.textContent = text;
      } else if (kind === 'mail') {
        el = document.createElement('a');
        el.className = 'gomna-help-mail';
        el.href = 'mailto:' + text;
        el.textContent = text;
      } else {
        el = document.createElement('p');
        el.textContent = text;
      }
      view.appendChild(el);
    }
    scrollEl.appendChild(view);
    return view;
  }

  /* 화면 하나를 등록한다. parent가 있으면 ‹ 뒤로가 그 화면으로 돌아간다. */
  function addView(key, el, title, parent, icon) {
    views[key] = { el: el, title: title, parent: parent || null, icon: icon || 'help' };
    return views[key];
  }

  function showView(key) {
    var view = views[key];
    if (!view) return;
    for (var name in views) {
      if (views.hasOwnProperty(name)) views[name].el.hidden = (name !== key);
    }
    currentView = key;
    titleEl.textContent = view.title;
    /* 제목 앞 아이콘은 그 화면의 메뉴 아이콘을 그대로 다시 쓴다. */
    titleIcon.innerHTML = svgIcon(view.icon);
    if (view.parent) {
      backBtn.setAttribute('data-visible', '1');
      headEl.setAttribute('data-sub', '1');
    } else {
      backBtn.removeAttribute('data-visible');
      headEl.removeAttribute('data-sub');
    }
    scrollEl.scrollTop = 0;
  }

  function showMain() { showView('main'); }

  function goBack() {
    var view = views[currentView];
    showView(view && view.parent ? view.parent : 'main');
  }

  /* 첫 화면과 하위 목록이 같은 모양의 메뉴 행을 쓴다. */
  function makeRow(label, onClick, id, icon) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'gomna-help-row';
    if (id) row.setAttribute('data-help', id);
    var iconEl = document.createElement('span');
    iconEl.className = 'gomna-help-row-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.innerHTML = svgIcon(icon);
    row.appendChild(iconEl);
    var labelEl = document.createElement('span');
    labelEl.className = 'gomna-help-row-label';
    labelEl.textContent = label;
    var arrow = document.createElement('span');
    arrow.className = 'gomna-help-row-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    row.appendChild(labelEl);
    row.appendChild(arrow);
    row.addEventListener('click', onClick);
    return row;
  }

  /* 상세 도움말 하나를 만들고 그 화면으로 가는 메뉴 행을 돌려준다. */
  function addItem(item, parent) {
    var key = 'detail:' + item.id;
    addView(key, addDetail(item), item.label, parent, item.icon);
    return makeRow(item.label, function () { showView(key); }, item.id, item.icon);
  }

  function build() {
    if (popup) return;
    injectStyles();

    popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-label', '도움말');
    popup.addEventListener('click', function (event) {
      if (event.target === popup) close();
    });

    var box = document.createElement('div');
    box.className = 'gomna-help-box';
    box.tabIndex = -1;

    headEl = document.createElement('div');
    headEl.className = 'gomna-help-head';

    backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'gomna-help-back';
    backBtn.textContent = '‹ 뒤로';
    backBtn.addEventListener('click', goBack);

    /* 제목 앞 아이콘. 화면이 바뀔 때 그 화면의 메뉴 아이콘으로 교체된다. */
    titleIcon = document.createElement('span');
    titleIcon.className = 'gomna-help-title-icon';
    titleIcon.setAttribute('aria-hidden', 'true');
    titleIcon.innerHTML = svgIcon('help');

    titleEl = document.createElement('div');
    titleEl.className = 'gomna-help-title';
    titleEl.id = 'gomnaHelpTitle';
    titleEl.textContent = '도움말';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gomna-help-close';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);

    headEl.appendChild(backBtn);
    headEl.appendChild(titleIcon);
    headEl.appendChild(titleEl);
    headEl.appendChild(closeBtn);

    scrollEl = document.createElement('div');
    scrollEl.className = 'gomna-help-scroll';

    mainView = document.createElement('div');
    mainView.id = 'gomnaHelpMainView';
    scrollEl.appendChild(mainView);
    addView('main', mainView, '도움말', null, 'help');

    /* 관련 메뉴를 한 표면 안에 담는 그릇 */
    function makeGroupSurface(extra) {
      var surface = document.createElement('div');
      surface.className = 'gomna-help-group' + (extra ? ' ' + extra : '');
      return surface;
    }

    for (var s = 0; s < TOPICS.length; s++) {
      var group = TOPICS[s];
      var surface;
      var i;

      /* 접힌 구역: 첫 화면에는 한 줄만 두고 항목은 하위 목록에서 보여준다. */
      if (group.collapsed) {
        var groupKey = 'group:' + group.id;
        var listView = document.createElement('div');
        listView.id = 'gomnaHelpList-' + group.id;
        listView.hidden = true;
        scrollEl.appendChild(listView);
        addView(groupKey, listView, group.title, 'main', group.icon);

        surface = makeGroupSurface('gomna-help-group--list');
        for (i = 0; i < group.items.length; i++) {
          surface.appendChild(addItem(group.items[i], groupKey));
        }
        listView.appendChild(surface);

        var gap = document.createElement('div');
        gap.className = 'gomna-help-gap';
        gap.setAttribute('aria-hidden', 'true');
        mainView.appendChild(gap);
        var soloSurface = makeGroupSurface();
        soloSurface.appendChild(makeRow(group.label, (function (key) {
          return function () { showView(key); };
        })(groupKey), group.id, group.icon));
        mainView.appendChild(soloSurface);
        continue;
      }

      var heading = document.createElement('div');
      heading.className = 'gomna-help-section-title';
      heading.textContent = group.title;
      mainView.appendChild(heading);

      surface = makeGroupSurface();
      for (i = 0; i < group.items.length; i++) {
        surface.appendChild(addItem(group.items[i], 'main'));
      }
      mainView.appendChild(surface);
    }

    box.appendChild(headEl);
    box.appendChild(scrollEl);
    popup.appendChild(box);
    document.body.appendChild(popup);
  }

  function onKeydown(event) {
    if (event.key !== 'Escape' || !popup || !popup.classList.contains('is-open')) return;
    close();
  }

  function open() {
    build();
    showMain();
    popup.classList.add('is-open');
    lastFocus = document.activeElement;
    document.addEventListener('keydown', onKeydown);
    /* 시트 자체에 초점을 둔다(× 위에 초점 테두리가 먼저 보이지 않게). */
    try { popup.querySelector('.gomna-help-box').focus({ preventScroll: true }); } catch (e) {}
  }

  function close() {
    if (!popup) return;
    popup.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown);
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) {}
    lastFocus = null;
  }

  window.GomnaHelp = { open: open, close: close, isOpen: function () {
    return !!(popup && popup.classList.contains('is-open'));
  } };
  window.openGomnaHelp = open;
})();
