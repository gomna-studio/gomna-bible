/* 은혜의말씀 — Supabase Google·카카오 로그인 연결
   홈(index.html)·Reader(reader.html)·콜백(auth/callback.html)이 이 파일 하나만 사용한다.
   Supabase 클라이언트는 여기서 한 번만 만들고, 세션은 Supabase 기본 저장소를 그대로 쓴다.
   기존 계정 UI 함수만 호출하며 새 UI·새 저장 키를 만들지 않는다.
   저장한 말씀·읽던 곳·듣던 곳 동기화는 이 단계에 포함하지 않는다. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://noogfnsgvewpbjpafnxc.supabase.co';

  /* 대표님이 이 한 줄에만 sb_publishable_... 값을 붙여넣는다.
     공개용 키만 쓴다. 비밀 키·서버 전용 관리자 키는 어떤 경우에도 넣지 않는다. */
  var SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_XWXOFlU4rLS-oqTB0uOlYw_NB1Qbeiz';

  var KEY_PLACEHOLDER = '__PASTE_SUPABASE_PUBLISHABLE_KEY_HERE__';
  var ALLOWED_PROVIDERS = ['google', 'kakao'];
  var CALLBACK_PATH = '/auth/callback.html';
  var ALLOWED_RETURN_PATHS = ['/', '/index.html', '/reader.html'];
  var RETURN_TO_KEY = 'gomna.auth.returnTo';
  var MESSAGE_KEY = 'gomna.auth.message';
  var CODE_USED_KEY = 'gomna.auth.codeUsed';
  var BOUND_FLAG = 'data-gomna-auth-bound';
  var DEBUG_KEY = 'gomna.auth.debug'; /* [임시 진단] 원인 확정 후 제거 */

  /* 사용자에게 보여줄 문구는 쉬운 한국어만 쓴다. 원시 오류·토큰은 절대 노출하지 않는다. */
  var MSG = {
    notConfigured: '로그인 연결 설정이 아직 완료되지 않았습니다.',
    libMissing: '로그인 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
    startFailed: '로그인을 시작하지 못했습니다. 다시 시도해 주세요.',
    failed: '로그인을 완료하지 못했습니다. 다시 시도해 주세요.',
    network: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
    cancelled: '로그인이 취소되었습니다.',
    logoutFailed: '로그아웃을 완료하지 못했습니다. 다시 시도해 주세요.'
  };

  var client = null;
  var clientTried = false;
  var signInBusy = false;
  var logoutBusy = false;

  /* ── 기본 도구 ───────────────────────────────────────────── */

  function isConfigured() {
    return typeof SUPABASE_PUBLISHABLE_KEY === 'string'
      && SUPABASE_PUBLISHABLE_KEY !== ''
      && SUPABASE_PUBLISHABLE_KEY !== KEY_PLACEHOLDER;
  }

  function libReady() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  function getClient() {
    if (client) return client;
    if (clientTried) return null;
    clientTried = true;
    if (!isConfigured() || !libReady()) return null;
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
    } catch (e) {
      client = null;
    }
    return client;
  }

  /* 기존 알림이 있으면 그것을 쓰고, 없을 때만 기본 alert를 쓴다. */
  function notify(message) {
    if (!message) return;
    try {
      if (typeof window.toast === 'function') { window.toast(message); return; }
    } catch (e) {}
    try { window.alert(message); } catch (e) {}
  }

  function readStore(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function writeStore(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) {}
  }

  function dropStore(key) {
    try { window.sessionStorage.removeItem(key); } catch (e) {}
  }

  /* 콜백에서 넘긴 안내를 한 번만 보여주고 즉시 지운다. */
  function flushPendingMessage() {
    var message = readStore(MESSAGE_KEY);
    dropStore(MESSAGE_KEY);
    if (typeof message === 'string' && message) notify(message);
  }

  function text(value) {
    return (typeof value === 'string' && value) ? value : '';
  }

  /* ── 로그인 사용자 표시값 ────────────────────────────────── */

  function pickProvider(user) {
    try { return text(user && user.app_metadata && user.app_metadata.provider); } catch (e) { return ''; }
  }

  function pickName(user) {
    var meta = (user && user.user_metadata) ? user.user_metadata : {};
    var candidates = [
      meta.name, meta.full_name, meta.preferred_username,
      meta.user_name, meta.nickname
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (text(candidates[i])) return text(candidates[i]);
    }
    var email = pickEmail(user);
    if (email && email.indexOf('@') > 0) return email.split('@')[0];
    /* 카카오는 이메일 없이 로그인될 수 있어 이름 후보가 모두 비면 여기까지 온다. */
    return pickProvider(user) === 'kakao' ? '카카오 사용자' : '사용자';
  }

  function pickEmail(user) {
    var meta = (user && user.user_metadata) ? user.user_metadata : {};
    return text(user && user.email) || text(meta.email);
  }

  /* 이메일 칸에 넣을 문구. 이메일이 없으면 빈칸·undefined를 넣지 않고,
     가짜 이메일도 만들지 않고 로그인 수단만 알려 준다. */
  function pickAccountLine(user) {
    var email = pickEmail(user);
    if (email) return email;
    return pickProvider(user) === 'kakao' ? '카카오 계정으로 로그인' : '';
  }

  function pickAvatar(user) {
    var meta = (user && user.user_metadata) ? user.user_metadata : {};
    var candidates = [
      meta.avatar_url, meta.picture, meta.profile_image, meta.profile_image_url
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (text(candidates[i])) return text(candidates[i]);
    }
    return null;
  }

  /* ── 기존 계정 UI 연결 ──────────────────────────────────────
     새 계정 UI를 만들지 않고, 각 페이지가 이미 공개한 연결점만 호출한다.
     홈: window.GomnaHomeAccount.setState
     Reader: window.GomnaReaderAccount.setState (기존 DOM 문구만 갱신하는 얇은 연결) */
  function bridges() {
    var list = [];
    if (window.GomnaHomeAccount && typeof window.GomnaHomeAccount.setState === 'function') {
      list.push(window.GomnaHomeAccount);
    }
    if (window.GomnaReaderAccount && typeof window.GomnaReaderAccount.setState === 'function') {
      list.push(window.GomnaReaderAccount);
    }
    return list;
  }

  /* Supabase가 이미 저장해 둔 세션을 읽기만 해서 먼저 화면에 반영한다.
     getSession() 응답을 기다리는 사이 로그인한 사용자에게 "로그인" 버튼이 잠깐 보이는 깜빡임을 막는다.
     저장값은 지우거나 바꾸지 않고, 최종 판단은 getSession 결과가 한다. */
  function decodeStored(raw) {
    if (typeof raw !== 'string' || !raw) return '';
    if (raw.indexOf('base64-') !== 0) return raw;
    try {
      var binary = window.atob(raw.slice(7));
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) { return ''; }
  }

  function storedSession() {
    try {
      var store = window.localStorage;
      for (var i = 0; i < store.length; i++) {
        var key = store.key(i);
        if (!key || key.indexOf('sb-') !== 0 || !/-auth-token$/.test(key)) continue;
        var raw = decodeStored(store.getItem(key));
        if (!raw) continue;
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { continue; }
        if (parsed && parsed.user && text(parsed.user.id)) return parsed;
      }
    } catch (e) {}
    return null;
  }

  /* onAuthStateChange 안에서도 안전하도록 전달받은 session만 쓰는 동기 함수로 유지한다. */
  function applySession(session) {
    /* 로그인 여부는 이메일이 아니라 user.id로 판단한다.
       카카오는 이메일 없이도 정상 로그인 사용자다. */
    var candidate = (session && session.user) ? session.user : null;
    var user = (candidate && text(candidate.id)) ? candidate : null;
    var wasSignedIn = !!currentUser;
    currentUser = user;
    /* 다른 사용자로 바뀌면 앞 사용자의 표시 이름·사진을 쓰지 않는다. */
    if (user && profileRowFor && profileRowFor !== user.id) {
      profileRow = null;
      profileRowFor = '';
    }
    if (!user) {
      caps.checked = false;
      caps.records = 'unknown';
      caps.profiles = 'unknown';
      profileRow = null;
      profileRowFor = '';
      if (wasSignedIn) closeProfile();
    }
    refreshAccountViews();
    var list = bridges();
    for (var i = 0; i < list.length; i++) {
      try {
        if (user) {
          list[i].setState('signed-in', {
            name: displayName(user),
            email: pickAccountLine(user),
            avatar: displayAvatar(user)
          });
        } else {
          list[i].setState('signed-out');
        }
      } catch (e) {}
    }
    /* 저장해 둔 표시 이름·사진 읽기는 이 콜백 밖에서 시작한다(콜백 안 비동기 호출 금지). */
    if (user && profileRowFor !== user.id) {
      setTimeout(function () { loadProfileRow(); }, 0);
    }
  }

  /* ── 로그인 시작 ────────────────────────────────────────── */

  function currentLocation() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function setButtonBusy(button, busy) {
    if (!button) return;
    try {
      button.disabled = !!busy;
      if (busy) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    } catch (e) {}
  }

  /* 이번 로그인에 필요 없는 우리 쪽 오래된 표시만 지운다.
     Supabase가 관리하는 세션·PKCE 키(sb-...)는 건드리지 않고,
     localStorage.clear()·sessionStorage.clear()도 쓰지 않는다.
     favorites·읽던 곳·듣던 곳 데이터는 읽지도 지우지도 않는다. */
  function clearOwnStaleState() {
    dropStore(CODE_USED_KEY); /* 지난 콜백의 완료 표시가 새 흐름을 막지 않게 한다 */
    dropStore(MESSAGE_KEY);   /* 지난 실패 안내가 새 로그인 뒤에 뒤늦게 뜨지 않게 한다 */
    dropStore(DEBUG_KEY);
    try { window.localStorage.removeItem(DEBUG_KEY); } catch (e) {} /* [임시 진단] 기록도 이번 시도부터 새로 */
  }

  /* 공급자 화면에서 뒤로 돌아온 경우를 대비해 버튼 잠김을 되돌린다.
     Safari·iOS는 페이지를 그대로 되살리므로 signInBusy가 남아 다음 클릭이 무시될 수 있다. */
  function resetSignInBusy() {
    signInBusy = false;
    try {
      var list = document.querySelectorAll('[data-auth-provider]');
      for (var i = 0; i < list.length; i++) setButtonBusy(list[i], false);
    } catch (e) {}
  }

  function startOAuth(provider, button) {
    if (ALLOWED_PROVIDERS.indexOf(provider) === -1) return;
    if (signInBusy) return;
    clearOwnStaleState();
    if (!isConfigured()) { notify(MSG.notConfigured); return; }
    var supabaseClient = getClient();
    if (!supabaseClient) { notify(MSG.libMissing); return; }

    signInBusy = true;
    setButtonBusy(button, true);
    writeStore(RETURN_TO_KEY, currentLocation());

    function recover(message) {
      dropStore(RETURN_TO_KEY);
      signInBusy = false;
      setButtonBusy(button, false);
      notify(message);
    }

    var options = { redirectTo: window.location.origin + CALLBACK_PATH };
    /* 카카오만: Supabase 기본 scope에 account_email이 들어가 KOE205(설정하지 않은 동의 항목)가 난다.
       options.scopes는 기본 scope에 더해지기만 해서 제거가 안 되므로,
       단수형 queryParams.scope로 최종 인가 요청의 scope를 덮어쓴다. Google 요청은 그대로 둔다. */
    if (provider === 'kakao') {
      options.queryParams = { scope: 'profile_nickname,profile_image' };
    }

    try {
      supabaseClient.auth.signInWithOAuth({
        provider: provider,
        options: options
      }).then(function (result) {
        /* 정상일 때는 브라우저가 공급자 화면으로 이동한다. */
        if (result && result.error) recover(MSG.startFailed);
      })['catch'](function () {
        recover(MSG.startFailed);
      });
    } catch (e) {
      recover(MSG.startFailed);
    }
  }

  function closestMatch(node, selector) {
    var el = node;
    while (el && el.nodeType === 1) {
      if (typeof el.matches === 'function' && el.matches(selector)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function markBound(el) {
    try { el.setAttribute(BOUND_FLAG, '1'); } catch (e) {}
  }

  function alreadyBound(el) {
    return !!(el && typeof el.getAttribute === 'function' && el.getAttribute(BOUND_FLAG) === '1');
  }

  /* 카카오·Google 버튼만 실제 로그인으로 연결한다. 네이버·이메일 버튼은 손대지 않는다.
     로그인창 상자에 onclick="event.stopPropagation()"이 있어 클릭이 document까지 올라오지 않는다.
     그래서 위임에만 의존하지 않고 버튼 자신에 처리기를 직접 붙인다.
     버튼에 붙인 처리기는 상자의 stopPropagation보다 먼저 실행된다. */
  function bindProviderButton(button) {
    if (!button || alreadyBound(button)) return;
    var provider = button.getAttribute('data-auth-provider');
    if (ALLOWED_PROVIDERS.indexOf(provider) === -1) return;
    markBound(button);
    button.addEventListener('click', function (event) {
      event.preventDefault();
      startOAuth(provider, button);
    });
  }

  function bindProviderButtons() {
    var list = document.querySelectorAll('[data-auth-provider]');
    for (var i = 0; i < list.length; i++) bindProviderButton(list[i]);

    /* 나중에 DOM에 추가되는 버튼용 보조 위임. 이미 직접 연결된 버튼은 건너뛰어 중복 실행을 막는다. */
    document.addEventListener('click', function (event) {
      var button = closestMatch(event.target, '[data-auth-provider]');
      if (!button || alreadyBound(button)) return;
      var provider = button.getAttribute('data-auth-provider');
      if (ALLOWED_PROVIDERS.indexOf(provider) === -1) return;
      event.preventDefault();
      startOAuth(provider, button);
    });
  }

  /* ── 현재 기기 로그아웃 ─────────────────────────────────── */

  function runLogout(button) {
    if (logoutBusy) return;
    var supabaseClient = getClient();
    if (!supabaseClient) { notify(isConfigured() ? MSG.libMissing : MSG.notConfigured); return; }

    logoutBusy = true;
    setButtonBusy(button, true);

    function done() {
      logoutBusy = false;
      setButtonBusy(button, false);
    }

    try {
      /* scope:'local' — 다른 기기 세션은 그대로 두고 이 브라우저만 로그아웃한다.
         저장한 말씀·읽던 곳·듣던 곳·언어·앱 설정은 건드리지 않는다. */
      supabaseClient.auth.signOut({ scope: 'local' }).then(function (result) {
        done();
        if (result && result.error) { notify(MSG.logoutFailed); return; }
        applySession(null);
        try {
          if (typeof window.closeHomeAccountPanel === 'function') window.closeHomeAccountPanel();
        } catch (e) {}
      })['catch'](function () {
        done();
        notify(MSG.logoutFailed);
      });
    } catch (e) {
      done();
      notify(MSG.logoutFailed);
    }
  }

  /* 로그아웃 버튼도 같은 이유로 버튼에 직접 연결한다(패널 구조가 바뀌어도 동작하도록). */
  function bindLogoutButton(button) {
    if (!button || alreadyBound(button)) return;
    markBound(button);
    button.addEventListener('click', function (event) {
      event.preventDefault();
      runLogout(button);
    });
  }

  function bindLogout() {
    var list = document.querySelectorAll('[data-account-action="logout"]');
    for (var i = 0; i < list.length; i++) bindLogoutButton(list[i]);

    document.addEventListener('click', function (event) {
      var button = closestMatch(event.target, '[data-account-action="logout"]');
      if (!button || alreadyBound(button)) return;
      event.preventDefault();
      runLogout(button);
    });
  }

  /* ══ 계정 기능 ═══════════════════════════════════════════
     아래는 로그인한 사용자의 계정 화면·기록 동기화·이메일 로그인을 담당한다.
     홈과 Reader가 같은 코드를 쓰도록 이 파일에서 한 번만 만든다. */

  var RECORDS_TABLE = 'gomna_user_records';
  var PROFILES_TABLE = 'gomna_profiles';
  var AVATAR_BUCKET = 'gomna-avatars';

  var PROVIDER_LABEL = { kakao: '카카오', google: 'Google', email: '이메일', naver: '네이버' };

  /* 기록 종류와 기존 로컬 저장 키. 기존 키 이름을 바꾸지 않고 그대로 쓴다. */
  var RECORD_KINDS = [
    { kind: 'favorites', key: 'favorites', type: 'favorites', label: '저장한 말씀' },
    { kind: 'resume_read', key: 'gomna_resume_read_v1', legacy: 'gomna_last_read', type: 'raw', label: '읽던 곳' },
    { kind: 'resume_listen', key: 'gomna_resume_listen_v1', legacy: 'gomna_audio_bible_resume_v1', type: 'raw', label: '듣던 곳' },
    { kind: 'recent_books', key: 'gomna_reader_recent_books_v1', type: 'strings', label: '최근 말씀' }
  ];

  var currentUser = null;
  var caps = { checked: false, pending: null, records: 'unknown', profiles: 'unknown' };
  var syncBusy = false;

  /* 로컬 저장값은 읽고 더하기만 한다. 어떤 경우에도 지우지 않는다. */
  function lsGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function parseArray(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    return (parsed instanceof Array) ? parsed : null;
  }

  /* 프로필 표(gomna_profiles)에 저장한 값이 있으면 그것을 먼저 보여준다.
     없으면 기존처럼 OAuth 제공자가 준 이름·사진을 쓴다. */
  var profileRow = null;
  var profileRowFor = '';

  function displayName(user) {
    if (profileRow && text(profileRow.display_name)) return text(profileRow.display_name);
    return pickName(user);
  }

  function displayAvatar(user) {
    if (profileRow && text(profileRow.avatar_url)) return text(profileRow.avatar_url);
    return pickAvatar(user);
  }

  function accountInfo() {
    if (!currentUser) return null;
    var provider = pickProvider(currentUser);
    return {
      name: displayName(currentUser),
      email: pickEmail(currentUser),
      accountLine: pickAccountLine(currentUser),
      avatar: displayAvatar(currentUser),
      provider: provider,
      providerLabel: PROVIDER_LABEL[provider] || (provider || '계정')
    };
  }

  /* 응답을 종류별로 나눈다. 행이 0개인 것과 표가 없는 것을 절대 섞지 않는다.
     ready  : 요청 성공(빈 배열도 성공이다. RLS 때문에 남의 기록이 안 보이는 것도 정상이다)
     missing: 표가 실제로 없음(42P01 · PGRST205 · 스키마 캐시에 없음)
     denied : 표는 있으나 권한(GRANT)이나 인증이 막힘(42501 · 401 · 42P17 등)
     unknown: 네트워크 등 일시적인 문제. 영구 상태로 기억하지 않는다. */
  function classifyResult(error) {
    if (!error) return 'ready';
    var code = String(error.code || '');
    var text = String(error.message || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202'
      || text.indexOf('does not exist') !== -1 || text.indexOf('schema cache') !== -1) return 'missing';
    if (code === '42501' || code === 'PGRST301' || code === '42P17'
      || text.indexOf('permission denied') !== -1 || text.indexOf('not authorized') !== -1
      || text.indexOf('jwt') !== -1) return 'denied';
    if (code === '' && (text.indexOf('failed to fetch') !== -1 || text.indexOf('network') !== -1)) return 'unknown';
    return 'unknown';
  }

  /* 계정 기록 저장 구조가 실제로 쓸 수 있는 상태인지 확인한다.
     결과는 메모리에만 두고 저장소에는 남기지 않는다. 새로고침하면 다시 확인한다.
     force가 true면 이전 결과를 무시하고 다시 확인한다. */
  function probeCapabilities(force) {
    if (!force && caps.checked) return Promise.resolve(caps);
    if (caps.pending) return caps.pending;
    var client = getClient();
    if (!client || !currentUser) return Promise.resolve(caps);
    function probe(table, column) {
      try {
        return client.from(table).select(column).limit(1).then(function (res) {
          return classifyResult(res && res.error);
        })['catch'](function (e) { return classifyResult(e); });
      } catch (e) { return Promise.resolve('unknown'); }
    }
    caps.pending = Promise.all([probe(RECORDS_TABLE, 'kind'), probe(PROFILES_TABLE, 'user_id')])
      .then(function (found) {
        caps.records = found[0];
        caps.profiles = found[1];
        /* 일시적인 문제였다면 다음 기회에 다시 확인한다. */
        caps.checked = (found[0] !== 'unknown');
        caps.pending = null;
        if (found[0] !== 'ready') reportStorageState(found[0]);
        return caps;
      })['catch'](function () {
        caps.pending = null;
        return caps;
      });
    return caps.pending;
  }

  /* 왜 저장이 안 되는지 개발자 도구에서 한 줄로 알 수 있게 남긴다.
     토큰·공개키·사용자 정보는 남기지 않는다. */
  function reportStorageState(state) {
    var note = {
      missing: '계정 기록 표가 아직 없습니다(마이그레이션 SQL 실행 필요).',
      denied: '계정 기록 표는 있으나 접근 권한이 없습니다(authenticated 역할 GRANT 필요).',
      unknown: '계정 기록 표 확인에 실패했습니다(일시적인 연결 문제일 수 있습니다).'
    }[state];
    if (!note) return;
    try { console.error('[gomna-auth] ' + note); } catch (e) {}
  }

  /* 실패 원인은 console.error(reportStorageState)에만 남기고,
     사용자 화면에는 언제나 같은 한 문장만 보여준다. */
  var SYNC_FAIL_TEXT = '동기화할 수 없습니다.\n잠시 후 다시 시도해 주세요.';

  function storageStateMessage(state) {
    reportStorageState(state);
    return SYNC_FAIL_TEXT;
  }

  /* ── 기록 병합: 어떤 경우에도 기존 항목을 지우지 않는다 ── */

  function mergeFavorites(localList, remoteList) {
    var byRef = {}, order = [], added = 0;
    function add(item, fromRemote) {
      if (!item || typeof item !== 'object' || item instanceof Array) return;
      var ref = (typeof item.ref === 'string') ? item.ref : '';
      if (!ref) return;
      var prev = byRef[ref];
      if (!prev) {
        byRef[ref] = item;
        order.push(ref);
        if (fromRemote) added++;
        return;
      }
      var a = String(prev.updatedAt || prev.createdAt || '');
      var b = String(item.updatedAt || item.createdAt || '');
      if (b > a) byRef[ref] = item; /* 더 최근에 고친 쪽을 남긴다 */
    }
    for (var i = 0; i < localList.length; i++) add(localList[i], false);
    for (var j = 0; j < remoteList.length; j++) add(remoteList[j], true);
    var out = [];
    for (var k = 0; k < order.length; k++) out.push(byRef[order[k]]);
    return { items: out, added: added };
  }

  function mergeStrings(localList, remoteList, limit) {
    var seen = {}, out = [], added = 0;
    function add(value, fromRemote) {
      if (typeof value !== 'string' || !value || seen[value]) return;
      seen[value] = true;
      out.push(value);
      if (fromRemote) added++;
    }
    for (var i = 0; i < localList.length; i++) add(localList[i], false);
    for (var j = 0; j < remoteList.length; j++) add(remoteList[j], true);
    if (limit && out.length > limit) out = out.slice(0, limit);
    return { items: out, added: added };
  }

  function syncRecords() {
    if (syncBusy) return Promise.resolve({ ok: false, message: '동기화가 진행 중입니다.' });
    var client = getClient();
    if (!client || !currentUser) return Promise.resolve({ ok: false, message: '로그인이 필요합니다.' });

    /* 같은 순간에 두 번 눌려도 한 번만 실행되도록 먼저 잠근다. */
    syncBusy = true;
    /* 이전에 기억한 판단을 믿지 않고 실제 요청을 보낸다.
       요청이 성공하면(빈 배열이어도) 저장 구조가 있는 것으로 확정한다. */
    return Promise.resolve().then(function () {
      return client.from(RECORDS_TABLE).select('kind,payload').then(function (res) {
        if (res && res.error) {
          var state = classifyResult(res.error);
          caps.records = state;
          caps.checked = (state !== 'unknown');
          syncBusy = false;
          return { ok: false, notReady: true, reason: state, message: storageStateMessage(state) };
        }
        caps.records = 'ready';
        caps.checked = true;
        var rows = (res && res.data) ? res.data : [];
        var remote = {};
        for (var i = 0; i < rows.length; i++) remote[rows[i].kind] = rows[i].payload || {};

        var writes = [];
        var pulled = 0, pushed = 0, skipped = [];
        var stamp = new Date().toISOString();

        for (var k = 0; k < RECORD_KINDS.length; k++) {
          var spec = RECORD_KINDS[k];
          var remotePayload = remote[spec.kind] || null;

          if (spec.type === 'favorites' || spec.type === 'strings') {
            var localList = parseArray(lsGet(spec.key));
            if (localList === null && lsGet(spec.key) !== null) { skipped.push(spec.label); continue; }
            if (localList === null) localList = [];
            var remoteList = (remotePayload && remotePayload.items instanceof Array) ? remotePayload.items : [];
            var merged = (spec.type === 'favorites')
              ? mergeFavorites(localList, remoteList)
              : mergeStrings(localList, remoteList, 12);
            if (merged.added > 0) {
              if (lsSet(spec.key, JSON.stringify(merged.items))) pulled += merged.added;
            }
            if (merged.items.length) {
              writes.push({ user_id: currentUser.id, kind: spec.kind, payload: { items: merged.items }, updated_at: stamp });
              pushed++;
            }
            continue;
          }

          /* 읽던 곳·듣던 곳은 값을 해석하지 않고 원문 그대로 주고받는다. */
          var localMain = lsGet(spec.key);
          var localLegacy = spec.legacy ? lsGet(spec.legacy) : null;
          var remoteMain = (remotePayload && typeof remotePayload.main === 'string') ? remotePayload.main : null;
          var remoteLegacy = (remotePayload && typeof remotePayload.legacy === 'string') ? remotePayload.legacy : null;
          if (localMain === null && remoteMain !== null) {
            if (lsSet(spec.key, remoteMain)) pulled++;
            localMain = remoteMain;
          }
          if (spec.legacy && localLegacy === null && remoteLegacy !== null) {
            if (lsSet(spec.legacy, remoteLegacy)) pulled++;
            localLegacy = remoteLegacy;
          }
          if (localMain !== null || localLegacy !== null) {
            writes.push({
              user_id: currentUser.id, kind: spec.kind,
              payload: { main: localMain, legacy: localLegacy }, updated_at: stamp
            });
            pushed++;
          }
        }

        if (!writes.length) {
          syncBusy = false;
          return { ok: true, message: '계정에 저장할 기록이 아직 없습니다.' };
        }

        return client.from(RECORDS_TABLE).upsert(writes, { onConflict: 'user_id,kind' }).then(function (up) {
          syncBusy = false;
          if (up && up.error) {
            var upState = classifyResult(up.error);
            if (upState !== 'ready') { caps.records = upState; }
            return { ok: false, reason: upState, message: storageStateMessage(upState) };
          }
          if (skipped.length) {
            try { console.error('[gomna-auth] 형식 확인이 필요해 건너뛴 기록: ' + skipped.join(',')); } catch (e2) {}
          }
          var parts = ['계정에 기록을 저장했습니다.'];
          if (pulled > 0) parts.push('다른 기기 기록 ' + pulled + '개를 가져왔습니다.');
          return { ok: true, message: parts.join(' ') };
        });
      })['catch'](function (e) {
        syncBusy = false;
        return { ok: false, reason: classifyResult(e), message: storageStateMessage('unknown') };
      });
    })['catch'](function (e) {
      syncBusy = false;
      return { ok: false, reason: classifyResult(e), message: storageStateMessage('unknown') };
    });
  }

  /* ── 공용 화면: 내 정보 시트와 이메일 로그인 ─────────────
     홈과 Reader가 똑같이 보이도록 스타일과 마크업을 여기서 한 번만 만든다.
     기존 은혜의말씀 색(아이보리 바탕·진한 갈색 글자·옅은 베이지 테두리)을 그대로 쓴다. */

  var SHARED_CSS = ''
    + '.gomna-acc-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;'
    + 'padding:20px;background:rgba(45,28,12,.42);-webkit-tap-highlight-color:transparent}'
    + '.gomna-acc-overlay[hidden]{display:none}'
    + '.gomna-acc-box:focus{outline:none}'
    + '.gomna-acc-box{position:relative;width:100%;max-width:360px;max-height:86vh;overflow-y:auto;box-sizing:border-box;'
    + 'padding:22px 18px 18px;border-radius:20px;background:#FFFDF8;border:1px solid rgba(184,134,11,.22);'
    + 'box-shadow:0 18px 44px rgba(61,40,24,.22);color:#3D2818;'
    + "font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif}"
    + '.gomna-acc-close{position:absolute;top:10px;right:10px;width:40px;height:40px;border:none;background:transparent;'
    + 'font-size:19px;color:#8A6A45;cursor:pointer;border-radius:10px}'
    + '.gomna-acc-close:hover{background:#F7EEE0}'
    + '.gomna-acc-title{margin:0 34px 14px 2px;font-size:17px;font-weight:800}'
    + '.gomna-acc-id{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:12px;min-height:62px;'
    + 'padding:0 4px 14px;margin:0 0 10px;border:none;border-bottom:1px solid rgba(184,134,11,.18);'
    + 'background:transparent;font-family:inherit;text-align:left;cursor:pointer}'
    + '.gomna-acc-id-text{flex:1;min-width:0}'
    + '.gomna-acc-arrow{flex-shrink:0;width:8px;height:8px;margin-left:auto;border-right:2px solid #B08A55;'
    + 'border-bottom:2px solid #B08A55;transform:rotate(-45deg)}'
    + '.gomna-acc-menu{display:block;margin:0 -4px}'
    + '.gomna-acc-logout{margin-top:12px;padding-top:10px;border-top:1px solid rgba(184,134,11,.18)}'
    + '.gomna-acc-logout .gomna-acc-item{margin-top:0;color:#6B5335}'
    + '.gomna-acc-avatar{position:relative;width:44px;height:44px;flex-shrink:0;display:flex;align-items:center;justify-content:center;'
    + 'border-radius:50%;overflow:hidden;background:#FBF3E4;border:1px solid rgba(184,134,11,.3)}'
    + '.gomna-acc-avatar img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.gomna-acc-avatar img[hidden]{display:none}'
    + '.gomna-acc-avatar svg{width:24px;height:24px;fill:none;stroke:#8A6A45;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}'
    + '.gomna-acc-name{display:block;font-size:16px;font-weight:800;line-height:1.35;word-break:break-all}'
    + '.gomna-acc-line{display:block;margin-top:2px;font-size:13px;color:#765B3D;line-height:1.45;word-break:break-all}'
    + '.gomna-acc-item{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:10px;min-height:50px;'
    + 'padding:0 8px;margin-top:2px;border-radius:12px;background:transparent;border:none;'
    + 'font-family:inherit;font-size:15.5px;font-weight:600;color:#3D2818;text-align:left;cursor:pointer}'
    + '.gomna-acc-item:hover{background:rgba(151,105,53,.07)}'
    + '.gomna-acc-item:disabled{opacity:.6;cursor:default}'
    + '.gomna-acc-item svg{width:20px;height:20px;flex-shrink:0;fill:none;stroke:#8A6A45;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}'
    + '.gomna-acc-note{margin-left:auto;font-size:12.5px;font-weight:700;color:#96795A}'
    /* 동기화 중 표시 — 기존 화살표 아이콘을 시계 방향으로 돌린다 */
    + '@keyframes gomnaSyncSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'
    + '.gomna-sync-busy svg{animation:gomnaSyncSpin 900ms linear infinite;transform-origin:50% 50%}'
    + '@media(prefers-reduced-motion:reduce){.gomna-sync-busy svg{animation-duration:2400ms}}'
    + '.gomna-acc-status{margin:12px 2px 0;font-size:13.5px;line-height:1.6;color:#5C4423;white-space:pre-line}'
    + '.gomna-acc-status[hidden]{display:none}'
    /* 프로필 편집 — 기존 시트(.gomna-acc-box) 안에서 쓰는 큰 사진·입력칸 */
    + '.gomna-pe-photo{position:relative;width:112px;height:112px;margin:4px auto 18px}'
    + '.gomna-pe-avatar{display:flex;align-items:center;justify-content:center;width:112px;height:112px;'
    + 'border-radius:50%;overflow:hidden;background:#FBF3E4;border:1px solid rgba(184,134,11,.3)}'
    + '.gomna-pe-avatar img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.gomna-pe-avatar img[hidden]{display:none}'
    + '.gomna-pe-initial{font-size:42px;font-weight:800;color:#8A6A45;line-height:1}'
    + '.gomna-pe-initial[hidden]{display:none}'
    + '.gomna-pe-camera{position:absolute;right:-2px;bottom:-2px;width:40px;height:40px;padding:0;display:flex;'
    + 'align-items:center;justify-content:center;border-radius:50%;background:#FFFDF8;'
    + 'border:1px solid rgba(184,134,11,.32);box-shadow:0 4px 12px rgba(92,64,32,.18);cursor:pointer}'
    + '.gomna-pe-camera:hover{background:#FFF4E2}'
    + '.gomna-pe-camera:disabled{opacity:.6;cursor:default}'
    + '.gomna-pe-camera svg{width:20px;height:20px;fill:none;stroke:#8A6A45;stroke-width:1.7;'
    + 'stroke-linecap:round;stroke-linejoin:round}'
    + '.gomna-pe-field{display:block;margin-bottom:12px;font-size:13.5px;font-weight:700;color:#6B5335}'
    + '.gomna-pe-field input{display:block;width:100%;box-sizing:border-box;margin-top:5px;min-height:50px;padding:0 12px;'
    + 'border-radius:12px;border:1px solid rgba(184,134,11,.34);background:#fff;font-family:inherit;font-size:16px;color:#3D2818}'
    + '.gomna-pe-field input:focus{outline:2px solid #B8751F;outline-offset:1px}'
    + '.gomna-pe-field input[readonly]{background:#F7F1E6;color:#6B5335}'
    + '.gomna-pe-actions{display:flex;gap:8px;margin-top:16px}'
    + '.gomna-pe-btn{flex:1;min-height:52px;border-radius:14px;border:1px solid rgba(184,134,11,.3);'
    + 'background:#fff;font-family:inherit;font-size:16px;font-weight:700;color:#6B5335;cursor:pointer}'
    + '.gomna-pe-btn:hover{background:#FFF6E6}'
    + '.gomna-pe-save{background:#2563EB;border-color:#2563EB;color:#FFFFFF}'
    + '.gomna-pe-save:hover{background:#1D4ED8;border-color:#1D4ED8}'
    + '.gomna-pe-save:active{background:#1E40AF;border-color:#1E40AF}'
    + '.gomna-pe-btn:disabled{opacity:.62;cursor:default}'
    + '.gomna-email-auth[hidden]{display:none}'
    + '.gomna-email-back{display:inline-flex;align-items:center;min-height:40px;padding:0 4px;border:none;background:transparent;'
    + 'font-family:inherit;font-size:14.5px;font-weight:600;color:#7A5A2E;cursor:pointer}'
    + '.gomna-email-title{margin:4px 0 10px;font-size:16.5px;font-weight:800;color:#3D2818}'
    + '.gomna-email-field{display:block;margin-bottom:10px;font-size:13.5px;font-weight:700;color:#6B5335}'
    + '.gomna-email-field input{display:block;width:100%;box-sizing:border-box;margin-top:5px;min-height:50px;padding:0 12px;'
    + 'border-radius:12px;border:1px solid rgba(184,134,11,.34);background:#fff;font-family:inherit;font-size:16px;color:#3D2818}'
    + '.gomna-email-field input:focus{outline:2px solid #B8751F;outline-offset:1px}'
    + '.gomna-email-submit{width:100%;min-height:54px;margin-top:4px;border:none;border-radius:14px;background:#2F67C7;'
    + 'color:#fff;font-family:inherit;font-size:16.5px;font-weight:800;cursor:pointer}'
    + '.gomna-email-submit:hover{background:#285DB8}.gomna-email-submit:active{background:#2455AA}'
    + '.gomna-email-submit:disabled{opacity:.62;cursor:default}'
    + '.gomna-email-links{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:10px}'
    + '.gomna-email-links button{border:none;background:transparent;padding:8px 0;font-family:inherit;font-size:14px;'
    + 'font-weight:600;color:#2F67C7;cursor:pointer}'
    + '.gomna-email-links button[hidden]{display:none}'
    + '.gomna-email-status{margin:10px 0 0;font-size:13.5px;line-height:1.6;color:#5C4423}'
    + '.gomna-email-status[hidden]{display:none}'
    + '.login-box.gomna-email-open .login-providers,.login-box.gomna-email-open .login-brand-visual,'
    + '.login-box.gomna-email-open .login-desc,.login-box.gomna-email-open .login-skip{display:none}';

  var ACCOUNT_SHEET_HTML = ''
    + '<div class="gomna-acc-box" role="document" tabindex="-1">'
    + '<button type="button" class="gomna-acc-close" data-gomna-acc="close" aria-label="닫기">✕</button>'
    + '<div class="gomna-acc-title" id="gomnaProfileTitle">내 정보</div>'
    + '<button type="button" class="gomna-acc-id" data-gomna-acc="profile-edit">'
    + '<span class="gomna-acc-avatar"><img id="gomnaProfileAvatarImg" alt="" hidden>'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/>'
    + '<path d="M4.8 20c.7-3.7 3.6-5.9 7.2-5.9s6.5 2.2 7.2 5.9"/></svg></span>'
    + '<span class="gomna-acc-id-text">'
    + '<span class="gomna-acc-name" id="gomnaProfileName"></span>'
    + '<span class="gomna-acc-line" id="gomnaProfileLine"></span></span>'
    + '<span class="gomna-acc-arrow" aria-hidden="true"></span></button>'
    + '<div class="gomna-acc-menu">'
    + '<button type="button" class="gomna-acc-item" data-gomna-acc="profile-edit">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/>'
    + '<path d="M4.8 20c.7-3.7 3.6-5.9 7.2-5.9s6.5 2.2 7.2 5.9"/></svg>'
    + '<span class="gomna-acc-label">프로필</span><span class="gomna-acc-arrow" aria-hidden="true"></span></button>'
    + '<button type="button" class="gomna-acc-item" data-gomna-acc="subscription">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.4" y="6" width="17.2" height="12" rx="2.6"/>'
    + '<path d="M3.4 10.2h17.2"/></svg>'
    + '<span class="gomna-acc-label">구독 관리</span><span class="gomna-acc-arrow" aria-hidden="true"></span></button>'
    + '<button type="button" class="gomna-acc-item" data-gomna-acc="favorites">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6h10v15l-5-3.4-5 3.4z"/></svg>'
    + '<span class="gomna-acc-label">보관함</span><span class="gomna-acc-arrow" aria-hidden="true"></span></button>'
    + '<button type="button" class="gomna-acc-item" data-gomna-acc="sync">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 9.6A7.5 7.5 0 0 0 5.6 8.2"/>'
    + '<path d="M4.6 14.4a7.5 7.5 0 0 0 13.8 1.4"/><path d="M4.6 4.8v3.6h3.6M19.4 19.2v-3.6h-3.6"/></svg>'
    + '<span class="gomna-acc-label">동기화</span><span class="gomna-acc-arrow" aria-hidden="true"></span></button>'
    + '<button type="button" class="gomna-acc-item" data-gomna-acc="settings">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/>'
    + '<path d="M19.3 14.1a1.5 1.5 0 0 0 .3 1.6l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.5 1.5 0 0 0-2.5 1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.6-1l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.5 1.5 0 0 0-1-2.5h-.3a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1-2.6l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.5 1.5 0 0 0 1.6.3h.1a1.5 1.5 0 0 0 .9-1.4v-.3a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.5 1l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.5 1.5 0 0 0 1 2.5h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.3.9z"/></svg>'
    + '<span class="gomna-acc-label">설정</span><span class="gomna-acc-arrow" aria-hidden="true"></span></button>'
    + '<button type="button" class="gomna-acc-item" data-gomna-acc="help">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/>'
    + '<path d="M9.9 9.4a2.2 2.2 0 1 1 3.4 2.2c-.8.5-1.3 1-1.3 1.9"/><path d="M12 16.9h.01"/></svg>'
    + '<span class="gomna-acc-label">도움말</span><span class="gomna-acc-arrow" aria-hidden="true"></span></button>'
    + '</div>'
    + '<div class="gomna-acc-logout">'
    + '<button type="button" class="gomna-acc-item" data-account-action="logout">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 6.4V5.2a1.8 1.8 0 0 0-1.8-1.8H6.2a1.8 1.8 0 0 0-1.8 1.8v13.6a1.8 1.8 0 0 0 1.8 1.8h6.2a1.8 1.8 0 0 0 1.8-1.8v-1.2"/>'
    + '<path d="M9.6 12h10.2m-2.8-3 2.8 3-2.8 3"/></svg>'
    + '<span class="gomna-acc-label">로그아웃</span></button></div>'
    + '<p class="gomna-acc-status" id="gomnaProfileStatus" role="status" aria-live="polite" hidden></p>'
    + '</div>';

  /* 프로필 편집 화면. 내 정보 시트와 같은 껍데기를 써서 홈·Reader가 똑같이 보인다. */
  var PROFILE_EDIT_HTML = ''
    + '<div class="gomna-acc-box" role="document" tabindex="-1">'
    + '<button type="button" class="gomna-acc-close" data-gomna-pe="cancel" aria-label="닫기">✕</button>'
    + '<div class="gomna-acc-title" id="gomnaPeTitle">프로필 편집</div>'
    + '<div class="gomna-pe-photo">'
    + '<span class="gomna-pe-avatar">'
    + '<img id="gomnaPeAvatarImg" alt="" hidden>'
    + '<span class="gomna-pe-initial" id="gomnaPeInitial" aria-hidden="true"></span></span>'
    + '<button type="button" class="gomna-pe-camera" id="gomnaPeCamera" data-gomna-pe="pick" aria-label="프로필 사진 선택">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.8h3.4L9 6.4h6l1.6 2.4H20v9.8H4z"/>'
    + '<circle cx="12" cy="13.4" r="3.1"/></svg></button>'
    + '<input type="file" id="gomnaPeFile" accept="image/jpeg,image/png,image/webp" hidden>'
    + '</div>'
    + '<label class="gomna-pe-field" for="gomnaPeName">표시 이름'
    + '<input type="text" id="gomnaPeName" maxlength="20" autocomplete="nickname" spellcheck="false"></label>'
    + '<label class="gomna-pe-field" for="gomnaPeAccount">로그인 계정'
    + '<input type="text" id="gomnaPeAccount" readonly aria-readonly="true" tabindex="-1"></label>'
    + '<p class="gomna-acc-status" id="gomnaPeStatus" role="status" aria-live="polite" hidden></p>'
    + '<div class="gomna-pe-actions">'
    + '<button type="button" class="gomna-pe-btn" data-gomna-pe="cancel">취소</button>'
    + '<button type="button" class="gomna-pe-btn gomna-pe-save" id="gomnaPeSave" data-gomna-pe="save">저장</button>'
    + '</div></div>';

  var EMAIL_AUTH_HTML = ''
    + '<button type="button" class="gomna-email-back" data-gomna-email="back">← 다른 방법으로 로그인</button>'
    + '<div class="gomna-email-title" id="gomnaEmailTitle">이메일로 로그인</div>'
    + '<form id="gomnaEmailForm" novalidate>'
    + '<label class="gomna-email-field" id="gomnaEmailField">이메일'
    + '<input type="email" id="gomnaEmailInput" autocomplete="email" inputmode="email" placeholder="name@example.com"></label>'
    + '<label class="gomna-email-field" id="gomnaEmailPwField">비밀번호'
    + '<input type="password" id="gomnaEmailPw" autocomplete="current-password" placeholder="6자 이상"></label>'
    + '<button type="submit" class="gomna-email-submit" id="gomnaEmailSubmit">로그인</button>'
    + '</form>'
    + '<div class="gomna-email-links">'
    + '<button type="button" data-gomna-email="signup" id="gomnaEmailToSignup">이메일로 회원가입</button>'
    + '<button type="button" data-gomna-email="reset" id="gomnaEmailToReset">비밀번호를 잊으셨나요?</button>'
    + '<button type="button" data-gomna-email="signin" id="gomnaEmailToSignin" hidden>이미 계정이 있습니다</button>'
    + '</div>'
    + '<p class="gomna-email-status" id="gomnaEmailStatus" role="status" aria-live="polite" hidden></p>';

  var sharedReady = false;
  var emailMode = 'signin';

  function injectShared() {
    if (sharedReady) return;
    sharedReady = true;
    try {
      var style = document.createElement('style');
      style.id = 'gomnaAuthSharedStyle';
      style.textContent = SHARED_CSS;
      document.head.appendChild(style);

      var sheet = document.createElement('div');
      sheet.className = 'gomna-acc-overlay';
      sheet.id = 'gomnaProfileSheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-labelledby', 'gomnaProfileTitle');
      sheet.hidden = true;
      sheet.innerHTML = ACCOUNT_SHEET_HTML;
      sheet.addEventListener('click', function (event) {
        if (event.target === sheet) closeProfile();
      });
      document.body.appendChild(sheet);
      bindDirect(sheet, '[data-gomna-acc]', function (button) {
        handleAccountAction(button.getAttribute('data-gomna-acc'), button);
      });

      var edit = document.createElement('div');
      edit.className = 'gomna-acc-overlay';
      edit.id = 'gomnaProfileEditSheet';
      edit.setAttribute('role', 'dialog');
      edit.setAttribute('aria-modal', 'true');
      edit.setAttribute('aria-labelledby', 'gomnaPeTitle');
      edit.hidden = true;
      edit.innerHTML = PROFILE_EDIT_HTML;
      edit.addEventListener('click', function (event) {
        if (event.target === edit) closeProfileEdit(true);
      });
      document.body.appendChild(edit);
      bindDirect(edit, '[data-gomna-pe]', function (button) {
        handleProfileEditAction(button.getAttribute('data-gomna-pe'), button);
      });
      var picker = document.getElementById('gomnaPeFile');
      if (picker) picker.addEventListener('change', function () { onAvatarChosen(picker); });

      var box = document.querySelector('.login-box');
      if (box) {
        var email = document.createElement('div');
        email.className = 'gomna-email-auth';
        email.id = 'gomnaEmailAuth';
        email.hidden = true;
        email.innerHTML = EMAIL_AUTH_HTML;
        var skip = box.querySelector('.login-skip');
        if (skip) box.insertBefore(email, skip);
        else box.appendChild(email);
        var form = document.getElementById('gomnaEmailForm');
        if (form) form.addEventListener('submit', function (e) { e.preventDefault(); submitEmailForm(); });
        /* 로그인 상자에 onclick="event.stopPropagation()"이 있어 클릭이 document까지 오지 않는다.
           그래서 상자 안 버튼은 버튼 자신에 처리기를 붙인다. */
        bindDirect(email, '[data-gomna-email]', function (button) {
          var next = button.getAttribute('data-gomna-email');
          if (next === 'back') resetEmailPanel();
          else setEmailMode(next);
        });
      }

      document.addEventListener('click', onSharedClick);
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        var edit = document.getElementById('gomnaProfileEditSheet');
        if (edit && !edit.hidden) { closeProfileEdit(true); return; }
        var open = document.getElementById('gomnaProfileSheet');
        if (open && !open.hidden) closeProfile();
      });

      /* 기존 함수는 그대로 두고 감싸서, 창을 열고 닫을 때 안내 문구만 정리한다. */
      wrapWindowFn('closeLoginModal', resetEmailPanel);
      wrapWindowFn('openLoginModal', resetEmailPanel);
      wrapWindowFn('openHomeAccountPanel', onHomePanelClose);
      wrapWindowFn('closeHomeAccountPanel', onHomePanelClose);

      /* 계정 선택창 바깥을 누르면 닫는다(계정 줄과 선택창 안은 제외). */
      document.addEventListener('click', function (event) {
        if (!isSwitchOpen()) return;
        if (closestMatch(event.target, '#homeAccountSwitch')) return;
        if (closestMatch(event.target, '#homeAccountPanelId')) return;
        closeAccountSwitch(false);
      });
      /* Escape는 선택창을 먼저 닫는다. 계정 패널까지 함께 닫히지 않게 캡처 단계에서 처리한다. */
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !isSwitchOpen()) return;
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        closeAccountSwitch();
      }, true);
      /* Reader 설정창은 열릴 때마다 다시 만들어지므로 그때 계정 줄을 확인한다. */
      wrapWindowFn('openSettings', ensureSettingsAccountRow);
      ensureSettingsAccountRow();
    } catch (e) {}
  }

  /* 위임에만 기대지 않고 버튼 자신에 연결한다. 이미 연결한 버튼은 표시해 두어 두 번 실행되지 않게 한다. */
  function bindDirect(root, selector, handler) {
    if (!root) return;
    var list = root.querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) {
      var button = list[i];
      if (alreadyBound(button)) continue;
      markBound(button);
      (function (target) {
        target.addEventListener('click', function (event) {
          event.preventDefault();
          handler(target);
        });
      })(button);
    }
  }

  function wrapWindowFn(name, before) {
    var original = window[name];
    if (typeof original !== 'function' || original.__gomnaWrapped) return;
    var wrapped = function () {
      try { before(); } catch (e) {}
      return original.apply(this, arguments);
    };
    wrapped.__gomnaWrapped = true;
    window[name] = wrapped;
  }

  /* Reader 설정창의 계정 입구.
     설정창 내용은 settings_guide.js가 다시 만들기 때문에, 만들어진 목록 맨 위에 줄을 넣는다. */
  function ensureSettingsAccountRow() {
    var main = document.getElementById('settingsMainView');
    if (!main || document.getElementById('homeAccountPanel')) return;
    var row = document.getElementById('gomnaSettingsAccountRow');
    if (!row) {
      var section = document.createElement('div');
      section.className = 'settings-section';
      var heading = document.createElement('div');
      heading.className = 'settings-section-title';
      heading.textContent = '내 계정';
      section.appendChild(heading);
      row = document.createElement('button');
      row.type = 'button';
      row.className = 'settings-menu-row';
      row.id = 'gomnaSettingsAccountRow';
      row.addEventListener('click', function () {
        try { if (typeof window.closeSettings === 'function') window.closeSettings(); } catch (e) {}
        if (currentUser) openProfile();
        else openLoginChooser();
      });
      section.appendChild(row);
      main.insertBefore(section, main.firstChild);
    }
    row.textContent = currentUser ? '내 정보' : '로그인';
  }

  function clearPanelStatus() {
    var el = document.getElementById('homeAccountPanelStatus');
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
  }

  /* ── 홈의 계정 확인창 ──────────────────────────────────
     지금 로그인한 계정만 보여주고, 누르면 창을 닫는다.
     여러 계정을 저장하거나 전환하는 구조는 만들지 않는다. */

  function switchPopup() {
    return document.getElementById('homeAccountSwitch');
  }

  function switchTrigger() {
    return document.getElementById('homeAccountPanelId');
  }

  function isSwitchOpen() {
    var popup = switchPopup();
    return !!(popup && !popup.hidden);
  }

  /* 화면에 보이는 값은 모두 지금 세션에서 가져온다. */
  function fillAccountSwitch() {
    var info = accountInfo();
    if (!info) return false;
    var label = document.getElementById('homeAccountSwitchLabel');
    if (label) {
      /* 이메일이 없는 카카오 계정에는 가짜 주소나 빈칸을 넣지 않는다. */
      label.textContent = info.email || (info.providerLabel + ' 계정');
    }
    var name = document.getElementById('homeAccountSwitchName');
    if (name) name.textContent = info.name;
    var line = document.getElementById('homeAccountSwitchLine');
    if (line) {
      /* 위 식별 줄과 겹치지 않게, 이름 아래에는 로그인 방식만 둔다. */
      var how = info.providerLabel ? (info.providerLabel + ' 계정으로 로그인') : '';
      line.textContent = how;
      line.hidden = !how;
    }
    /* 프로필 사진은 홈이 이미 쓰는 처리기를 그대로 쓴다(같은 아바타 규칙). */
    try {
      if (window.GomnaHomeAccount && typeof window.GomnaHomeAccount.setAvatar === 'function') {
        window.GomnaHomeAccount.setAvatar(info.avatar || '');
      }
    } catch (e) {}
    return true;
  }

  function closeAccountSwitch(returnFocus) {
    var popup = switchPopup();
    var trigger = switchTrigger();
    if (popup && !popup.hidden) {
      var hadFocus = popup.contains(document.activeElement);
      popup.hidden = true;
      if (returnFocus !== false && hadFocus && trigger) {
        try { trigger.focus(); } catch (e) {}
      }
    }
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function openAccountSwitch() {
    var popup = switchPopup();
    if (!popup) return;
    if (!fillAccountSwitch()) return;
    clearPanelStatus();
    popup.hidden = false;
    var trigger = switchTrigger();
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    var first = popup.querySelector('[data-account-action="account-current"]');
    if (first) { try { first.focus(); } catch (e) {} }
  }

  function toggleAccountSwitch() {
    if (isSwitchOpen()) closeAccountSwitch();
    else openAccountSwitch();
  }

  /* 계정 패널이 닫힐 때는 안내 문구와 계정 선택창을 함께 정리한다. */
  function onHomePanelClose() {
    clearPanelStatus();
    closeAccountSwitch(false);
  }

  /* 새 안내를 보여주기 전에 이전 안내를 지운다. */
  function clearActionMessage() {
    profileStatus('');
    clearPanelStatus();
  }

  /* 안내는 지금 열려 있는 화면 안에서 보여준다. 브라우저 경고창은 마지막 수단으로만 쓴다. */
  function showActionMessage(message) {
    if (!message) return;
    var sheet = document.getElementById('gomnaProfileSheet');
    if (sheet && !sheet.hidden) { profileStatus(message); return; }
    var status = document.getElementById('homeAccountPanelStatus');
    var panel = document.getElementById('homeAccountPanel');
    if (status && panel && !panel.hidden) {
      status.textContent = message;
      status.hidden = false;
      return;
    }
    var notice = document.getElementById('loginNextStepNotice');
    var modal = document.getElementById('loginModal');
    if (notice && modal && modal.classList.contains('show')) {
      notice.textContent = message;
      notice.hidden = false;
      return;
    }
    notify(message);
  }

  /* 버튼에 직접 연결하지 못한 경우(나중에 만들어진 버튼)를 위한 보조 위임.
     이미 직접 연결된 버튼은 건너뛰어 한 번 클릭에 두 번 실행되지 않게 한다. */
  function onSharedClick(event) {
    var acc = closestMatch(event.target, '[data-gomna-acc]');
    if (acc) {
      if (alreadyBound(acc)) return;
      event.preventDefault();
      handleAccountAction(acc.getAttribute('data-gomna-acc'), acc);
      return;
    }
    var mode = closestMatch(event.target, '[data-gomna-email]');
    if (mode) {
      if (alreadyBound(mode)) return;
      event.preventDefault();
      var next = mode.getAttribute('data-gomna-email');
      if (next === 'back') resetEmailPanel();
      else setEmailMode(next);
      return;
    }
    /* 홈 계정 패널의 항목들. 로그아웃은 별도 처리기가 담당한다. */
    var item = closestMatch(event.target, '[data-account-action]');
    if (!item) return;
    var action = item.getAttribute('data-account-action');
    if (action === 'logout') return;
    event.preventDefault();
    handleAccountAction(action === 'profile' ? 'profile' : action, item);
  }

  /* ── 내 정보 시트 ──────────────────────────────────────── */

  function profileStatus(message) {
    var el = document.getElementById('gomnaProfileStatus');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function fillProfile() {
    var info = accountInfo();
    if (!info) return;
    var name = document.getElementById('gomnaProfileName');
    if (name) name.textContent = info.name;
    var line = document.getElementById('gomnaProfileLine');
    if (line) {
      line.textContent = info.accountLine || '';
      line.hidden = !info.accountLine;
    }
    var provider = document.getElementById('gomnaProfileProvider');
    if (provider) provider.textContent = info.providerLabel;
    var img = document.getElementById('gomnaProfileAvatarImg');
    if (img) {
      if (info.avatar) {
        img.onerror = function () { img.hidden = true; };
        img.src = info.avatar;
        img.hidden = false;
      } else {
        img.onerror = null;
        img.removeAttribute('src');
        img.hidden = true;
      }
    }
  }

  function refreshAccountViews() {
    var sheet = document.getElementById('gomnaProfileSheet');
    if (sheet && !sheet.hidden) {
      if (currentUser) fillProfile();
      else closeProfile();
    }
    ensureSettingsAccountRow();
    if (!currentUser) closeAccountSwitch(false);
    else if (isSwitchOpen()) fillAccountSwitch();
  }

  function openProfile() {
    injectShared();
    if (!currentUser) { openLoginChooser(); return; }
    var sheet = document.getElementById('gomnaProfileSheet');
    if (!sheet) return;
    try { if (typeof window.closeHomeAccountPanel === 'function') window.closeHomeAccountPanel(); } catch (e) {}
    fillProfile();
    profileStatus('');
    sheet.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    probeCapabilities().then(fillProfile);
    /* 첫 버튼에 초점을 주면 파란 초점 테두리가 눌린 것처럼 보이므로 창 자체에 초점을 준다. */
    var box = sheet.querySelector('.gomna-acc-box');
    if (box) { try { box.focus(); } catch (e) {} }
  }

  function closeProfile() {
    var sheet = document.getElementById('gomnaProfileSheet');
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.documentElement.style.overflow = '';
  }

  /* ── 프로필 편집 ────────────────────────────────────────
     이름은 기존 gomna_profiles.display_name, 사진은 기존 gomna_profiles.avatar_url에 저장한다.
     사진 파일은 기존 gomna-avatars 버킷의 "내 UUID/" 폴더에만 올린다(기존 Storage 정책과 같은 규칙).
     새 표·버킷·정책을 만들지 않고, 홈과 Reader가 이 화면 하나를 함께 쓴다. */

  var AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  var AVATAR_MAX_BYTES = 5 * 1024 * 1024;
  var NAME_MAX = 20;
  var PROFILE_SAVE_FAIL = '프로필을 저장할 수 없습니다.\n잠시 후 다시 시도해 주세요.';

  var pendingAvatarFile = null;
  var pendingAvatarUrl = '';
  var profileSaving = false;
  var profileEditFrom = '';

  /* 저장 실패 이유는 개발자 도구에만 남긴다(토큰·개인정보는 남기지 않는다). */
  function reportProfileError(stage, error) {
    var code = String((error && (error.code || error.statusCode || error.status)) || '');
    var note = String((error && error.message) || '');
    try { console.error('[gomna-auth] 프로필 ' + stage + ' 실패' + (code ? ' (' + code + ')' : '') + (note ? ': ' + note : '')); } catch (e) {}
  }

  /* 저장해 둔 표시 이름·사진을 읽어 온다. 같은 사용자에 대해 한 번만 읽는다. */
  function loadProfileRow(force) {
    var client = getClient();
    if (!client || !currentUser) return Promise.resolve(null);
    var uid = currentUser.id;
    if (!force && profileRowFor === uid) return Promise.resolve(profileRow);
    profileRowFor = uid;
    try {
      return client.from(PROFILES_TABLE).select('display_name,avatar_url').eq('user_id', uid).limit(1)
        .then(function (res) {
          if (res && res.error) {
            caps.profiles = classifyResult(res.error);
            reportProfileError('불러오기', res.error);
            return null;
          }
          caps.profiles = 'ready';
          var row = (res && res.data && res.data.length) ? res.data[0] : null;
          profileRow = row ? { display_name: text(row.display_name), avatar_url: text(row.avatar_url) } : null;
          applyAccountDisplay();
          return profileRow;
        })['catch'](function (e) { reportProfileError('불러오기', e); return null; });
    } catch (e) {
      reportProfileError('불러오기', e);
      return Promise.resolve(null);
    }
  }

  /* 이름·사진이 바뀌면 홈 상단·홈 계정 패널·계정 확인창·Reader 내 정보를 한 번에 갱신한다.
     각 화면이 이미 공개한 연결점만 부른다(새 UI를 만들지 않는다). */
  function applyAccountDisplay() {
    if (!currentUser) return;
    refreshAccountViews();
    var list = bridges();
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].setState('signed-in', {
          name: displayName(currentUser),
          email: pickAccountLine(currentUser),
          avatar: displayAvatar(currentUser)
        });
      } catch (e) {}
    }
  }

  function peStatus(message) {
    var el = document.getElementById('gomnaPeStatus');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function setProfileSaveBusy(busy) {
    var save = document.getElementById('gomnaPeSave');
    var camera = document.getElementById('gomnaPeCamera');
    var name = document.getElementById('gomnaPeName');
    if (save) {
      save.textContent = busy ? '저장 중…' : '저장';
      try {
        save.disabled = !!busy;
        if (busy) save.setAttribute('aria-busy', 'true');
        else save.removeAttribute('aria-busy');
      } catch (e) {}
    }
    try {
      if (camera) camera.disabled = !!busy;
      if (name) name.readOnly = !!busy;
    } catch (e) {}
  }

  /* 미리보기용 임시 주소를 정리한다. 서버에 올린 사진은 건드리지 않는다. */
  function clearPendingAvatar() {
    if (pendingAvatarUrl) {
      try { URL.revokeObjectURL(pendingAvatarUrl); } catch (e) {}
    }
    pendingAvatarUrl = '';
    pendingAvatarFile = null;
    var picker = document.getElementById('gomnaPeFile');
    if (picker) { try { picker.value = ''; } catch (e) {} }
  }

  /* 사진이 없으면 이름 첫 글자로 기본 프로필을 보여준다. */
  function showEditAvatar(url, name) {
    var img = document.getElementById('gomnaPeAvatarImg');
    var initial = document.getElementById('gomnaPeInitial');
    var letter = text(name).slice(0, 1) || '·';
    if (initial) initial.textContent = letter;
    if (!img) return;
    if (url) {
      img.onerror = function () {
        img.hidden = true;
        if (initial) initial.hidden = false;
      };
      img.src = url;
      img.hidden = false;
      if (initial) initial.hidden = true;
    } else {
      img.onerror = null;
      img.removeAttribute('src');
      img.hidden = true;
      if (initial) initial.hidden = false;
    }
  }

  function fillProfileEdit(keepPreview) {
    var info = accountInfo();
    if (!info) return;
    var name = document.getElementById('gomnaPeName');
    if (name && document.activeElement !== name) name.value = info.name;
    var account = document.getElementById('gomnaPeAccount');
    if (account) {
      /* 읽기 전용. 여기서 로그인 종류를 바꿀 수는 없다. */
      account.value = info.accountLine
        ? (info.email ? info.email : info.accountLine)
        : (info.providerLabel + ' 계정으로 로그인');
    }
    if (keepPreview && pendingAvatarUrl) showEditAvatar(pendingAvatarUrl, name ? name.value : info.name);
    else showEditAvatar(info.avatar, info.name);
  }

  function openProfileEdit() {
    injectShared();
    if (!currentUser) { openLoginChooser(); return; }
    var sheet = document.getElementById('gomnaProfileEditSheet');
    if (!sheet) return;
    /* 어디에서 왔는지 기억해 두고, 취소·저장 뒤에 그 화면으로 돌아간다. */
    var accSheet = document.getElementById('gomnaProfileSheet');
    var homePanel = document.getElementById('homeAccountPanel');
    if (accSheet && !accSheet.hidden) profileEditFrom = 'sheet';
    else if (homePanel && !homePanel.hidden) profileEditFrom = 'home';
    else profileEditFrom = '';
    closeProfile();
    try { if (typeof window.closeHomeAccountPanel === 'function') window.closeHomeAccountPanel(); } catch (e) {}

    clearPendingAvatar();
    profileSaving = false;
    setProfileSaveBusy(false);
    peStatus('');
    fillProfileEdit(false);
    sheet.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    /* 저장해 둔 값이 아직 안 왔으면 도착한 뒤 입력칸을 채운다. */
    loadProfileRow().then(function () {
      var open = document.getElementById('gomnaProfileEditSheet');
      if (open && !open.hidden) fillProfileEdit(true);
    });
    var box = sheet.querySelector('.gomna-acc-box');
    if (box) { try { box.focus(); } catch (e) {} }
  }

  function closeProfileEdit(back) {
    var sheet = document.getElementById('gomnaProfileEditSheet');
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.documentElement.style.overflow = '';
    clearPendingAvatar();
    peStatus('');
    var from = profileEditFrom;
    profileEditFrom = '';
    if (!back || !currentUser) return;
    /* 홈은 바깥 클릭으로 계정 패널을 닫는 처리기가 있어, 그 처리기가 끝난 뒤에 다시 연다. */
    setTimeout(function () {
      if (!currentUser) return;
      if (from === 'sheet') openProfile();
      else if (from === 'home') {
        try { if (typeof window.openHomeAccountPanel === 'function') window.openHomeAccountPanel(); } catch (e) {}
      }
    }, 0);
  }

  function onAvatarChosen(picker) {
    var file = (picker && picker.files && picker.files.length) ? picker.files[0] : null;
    if (!file) return;
    if (!AVATAR_TYPES[file.type]) {
      clearPendingAvatar();
      peStatus('JPG·PNG·WebP 사진만 올릴 수 있습니다.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      clearPendingAvatar();
      peStatus('사진 크기는 5MB까지 올릴 수 있습니다.');
      return;
    }
    /* 고른 사진은 아직 서버에 올리지 않는다. "저장"을 눌러야 올린다. */
    if (pendingAvatarUrl) { try { URL.revokeObjectURL(pendingAvatarUrl); } catch (e) {} }
    pendingAvatarFile = file;
    try { pendingAvatarUrl = URL.createObjectURL(file); } catch (e) { pendingAvatarUrl = ''; }
    peStatus('');
    var nameEl = document.getElementById('gomnaPeName');
    showEditAvatar(pendingAvatarUrl, nameEl ? nameEl.value : '');
  }

  /* 반드시 지금 로그인한 사용자의 UUID 폴더 안에만 올린다. */
  function uploadAvatar(uid, file) {
    var client = getClient();
    var ext = AVATAR_TYPES[file.type] || 'jpg';
    var path = uid + '/avatar-' + Date.now() + '.' + ext;
    try {
      return client.storage.from(AVATAR_BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: true })
        .then(function (res) {
          if (res && res.error) { reportProfileError('사진 올리기', res.error); return { ok: false }; }
          var pub = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
          var url = (pub && pub.data) ? text(pub.data.publicUrl) : '';
          if (!url) { reportProfileError('사진 주소 만들기', { message: 'publicUrl 없음' }); return { ok: false }; }
          return { ok: true, url: url };
        })['catch'](function (e) { reportProfileError('사진 올리기', e); return { ok: false }; });
    } catch (e) {
      reportProfileError('사진 올리기', e);
      return Promise.resolve({ ok: false });
    }
  }

  function saveProfileEdit() {
    if (profileSaving) return;
    var client = getClient();
    var nameEl = document.getElementById('gomnaPeName');
    var name = nameEl ? String(nameEl.value || '').trim() : '';
    if (!name) {
      peStatus('표시 이름을 입력해 주세요.');
      if (nameEl) { try { nameEl.focus(); } catch (e) {} }
      return;
    }
    if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX);
    if (nameEl) nameEl.value = name;
    if (!client || !currentUser) { peStatus(PROFILE_SAVE_FAIL); return; }

    var uid = currentUser.id;
    var file = pendingAvatarFile;
    profileSaving = true;
    setProfileSaveBusy(true);
    peStatus('');

    var step = file ? uploadAvatar(uid, file) : Promise.resolve({ ok: true, url: '' });
    step.then(function (up) {
      if (!up || !up.ok) throw new Error('avatar');
      var row = { user_id: uid, display_name: name, updated_at: new Date().toISOString() };
      if (up.url) row.avatar_url = up.url;
      return client.from(PROFILES_TABLE).upsert(row, { onConflict: 'user_id' }).then(function (res) {
        if (res && res.error) {
          caps.profiles = classifyResult(res.error);
          reportProfileError('저장', res.error);
          throw new Error('upsert');
        }
        caps.profiles = 'ready';
        var kept = (profileRow && text(profileRow.avatar_url)) || '';
        profileRow = { display_name: name, avatar_url: up.url || kept };
        profileRowFor = uid;
        return true;
      });
    }).then(function () {
      profileSaving = false;
      setProfileSaveBusy(false);
      clearPendingAvatar();
      applyAccountDisplay();  /* 홈·Reader·계정 확인창 즉시 갱신 */
      fillProfileEdit(false);
      peStatus('프로필이 저장되었습니다.');
      setTimeout(function () {
        if (!profileSaving) closeProfileEdit(true);
      }, 1100);
    })['catch'](function () {
      /* 실패해도 버튼은 다시 눌릴 수 있게 되돌린다. */
      profileSaving = false;
      setProfileSaveBusy(false);
      peStatus(PROFILE_SAVE_FAIL);
    });
  }

  function handleProfileEditAction(action, button) {
    if (action === 'pick') {
      if (profileSaving) return;
      var picker = document.getElementById('gomnaPeFile');
      if (picker) { try { picker.click(); } catch (e) {} }
      return;
    }
    if (action === 'cancel') {
      /* 입력한 이름과 고른 사진을 버리고 내 정보 화면으로 돌아간다. */
      if (profileSaving) return;
      closeProfileEdit(true);
      return;
    }
    if (action === 'save') { saveProfileEdit(); return; }
  }

  function openLoginChooser() {
    try {
      if (typeof window.openLoginModal === 'function') { window.openLoginModal('gomna-auth'); return; }
    } catch (e) {}
    notify('로그인 화면을 열 수 없습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.');
  }

  function openFavorites() {
    closeProfile();
    try { if (typeof window.closeHomeAccountPanel === 'function') window.closeHomeAccountPanel(); } catch (e) {}
    /* Reader에서는 기존 보관함을 그대로 열고, 홈에서는 보관함 주소로 이동한다. */
    if (typeof window.GomnaReaderFavorites === 'function') { window.GomnaReaderFavorites(); return; }
    try { window.location.href = 'reader.html?favorites'; } catch (e) {}
  }

  function handleAccountAction(action, button) {
    if (action === 'close') { closeProfile(); return; }
    if (action === 'profile') { openProfile(); return; }
    if (action === 'favorites') { openFavorites(); return; }
    if (action === 'account-switch') {
      if (!currentUser) { openLoginChooser(); return; }
      toggleAccountSwitch();
      return;
    }
    /* 현재 계정을 다시 누르면 선택창만 닫는다(로그아웃·동기화·새로고침 없음). */
    if (action === 'account-current') { closeAccountSwitch(); return; }
    if (action === 'profile-edit') {
      /* 로그인 전에는 계정 줄이 로그인 입구 역할을 한다. */
      if (!currentUser) { openLoginChooser(); return; }
      openProfileEdit();
      return;
    }
    if (action === 'subscription') {
      showActionMessage('구독 기능을 준비하고 있습니다.');
      return;
    }
    /* 설정은 이미 있는 설정 화면을 그대로 쓴다. */
    if (action === 'settings') {
      closeProfile();
      try { if (typeof window.closeHomeAccountPanel === 'function') window.closeHomeAccountPanel(); } catch (e) {}
      if (typeof window.openSettings === 'function') { window.openSettings(); return; }
      showActionMessage('설정을 열 수 없습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    /* 도움말은 홈페이지 가이드로 나가지 않고 앱 안 도움말(js/gomna-help.js)을 연다. */
    if (action === 'help') {
      closeProfile();
      try { if (typeof window.closeHomeAccountPanel === 'function') window.closeHomeAccountPanel(); } catch (e) {}
      if (window.GomnaHelp && typeof window.GomnaHelp.open === 'function') { window.GomnaHelp.open(); return; }
      showActionMessage('도움말을 열 수 없습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.');
      return;
    }
    if (action === 'sync') {
      if (syncBusy) return; /* 이미 도는 중이면 두 번 실행하지 않는다 */
      runSync(button);
      return;
    }
  }

  /* ── 기록 동기화 버튼 상태 ─────────────────────────────── */

  var SYNC_LABEL = { idle: '동기화', busy: '동기화 중…', done: '동기화 완료', fail: '동기화' };

  function syncLabelEl(button) {
    if (!button) return null;
    return button.querySelector('.gomna-acc-label, .home-account-menu-item-label');
  }

  function setSyncButtonState(button, state) {
    if (!button) return;
    var label = syncLabelEl(button);
    if (label) label.textContent = SYNC_LABEL[state] || SYNC_LABEL.idle;
    var busy = (state === 'busy');
    try {
      button.classList[busy ? 'add' : 'remove']('gomna-sync-busy');
      button.disabled = busy;
      if (busy) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    } catch (e) {}
  }

  /* 너무 빨리 끝나도 회전이 보이도록 최소 500ms는 로딩 상태를 유지한다.
     실제 네트워크 작업을 늦추지는 않는다. */
  function runSync(button) {
    var started = Date.now();
    setSyncButtonState(button, 'busy');
    clearActionMessage();

    function finish(result) {
      var wait = Math.max(0, 500 - (Date.now() - started));
      setTimeout(function () {
        var ok = !!(result && result.ok);
        setSyncButtonState(button, ok ? 'done' : 'fail');
        showActionMessage((result && result.message) || SYNC_FAIL_TEXT);
        /* 잠시 결과를 보여준 뒤 기본 문구로 돌아간다. */
        setTimeout(function () {
          if (!syncBusy) setSyncButtonState(button, 'idle');
        }, ok ? 1500 : 2500);
      }, wait);
    }

    syncRecords().then(finish)['catch'](function () {
      finish({ ok: false, message: storageStateMessage('unknown') });
    });
  }

  /* ── 이메일 로그인 ─────────────────────────────────────── */

  var EMAIL_MODES = {
    signin: { title: '이메일로 로그인', submit: '로그인', pw: true, pwLabel: '비밀번호', autocomplete: 'current-password' },
    signup: { title: '이메일로 회원가입', submit: '회원가입', pw: true, pwLabel: '비밀번호(6자 이상)', autocomplete: 'new-password' },
    reset: { title: '비밀번호 찾기', submit: '재설정 메일 받기', pw: false },
    newpw: { title: '새 비밀번호 설정', submit: '비밀번호 변경', pw: true, pwLabel: '새 비밀번호(6자 이상)', autocomplete: 'new-password', hideEmail: true }
  };

  function emailStatus(message) {
    var el = document.getElementById('gomnaEmailStatus');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function setEmailMode(mode) {
    injectShared();
    var conf = EMAIL_MODES[mode] || EMAIL_MODES.signin;
    emailMode = EMAIL_MODES[mode] ? mode : 'signin';
    var panel = document.getElementById('gomnaEmailAuth');
    var box = document.querySelector('.login-box');
    if (!panel || !box) return;
    panel.hidden = false;
    box.classList.add('gomna-email-open');

    var title = document.getElementById('gomnaEmailTitle');
    if (title) title.textContent = conf.title;
    var submit = document.getElementById('gomnaEmailSubmit');
    if (submit) { submit.textContent = conf.submit; submit.disabled = false; }
    var emailField = document.getElementById('gomnaEmailField');
    if (emailField) emailField.hidden = !!conf.hideEmail;
    var pwField = document.getElementById('gomnaEmailPwField');
    if (pwField) {
      pwField.hidden = !conf.pw;
      pwField.childNodes[0].nodeValue = conf.pwLabel || '비밀번호';
    }
    var pw = document.getElementById('gomnaEmailPw');
    if (pw) {
      pw.value = '';
      pw.setAttribute('autocomplete', conf.autocomplete || 'current-password');
    }
    var toSignup = document.getElementById('gomnaEmailToSignup');
    var toReset = document.getElementById('gomnaEmailToReset');
    var toSignin = document.getElementById('gomnaEmailToSignin');
    if (toSignup) toSignup.hidden = (emailMode !== 'signin');
    if (toReset) toReset.hidden = (emailMode !== 'signin');
    if (toSignin) toSignin.hidden = (emailMode === 'signin' || emailMode === 'newpw');
    emailStatus('');
    var focusTarget = conf.hideEmail ? document.getElementById('gomnaEmailPw') : document.getElementById('gomnaEmailInput');
    if (focusTarget) { try { focusTarget.focus(); } catch (e) {} }
  }

  function resetEmailPanel() {
    var panel = document.getElementById('gomnaEmailAuth');
    var box = document.querySelector('.login-box');
    if (panel) panel.hidden = true;
    if (box) box.classList.remove('gomna-email-open');
    emailStatus('');
    var pw = document.getElementById('gomnaEmailPw');
    if (pw) pw.value = '';
  }

  function openEmailLogin() {
    injectShared();
    setEmailMode('signin');
  }

  /* Supabase가 돌려주는 오류를 쉬운 한국어로 바꾼다. 원문은 화면에 내보내지 않는다. */
  function emailErrorText(error) {
    var raw = String((error && (error.message || error.code)) || '').toLowerCase();
    if (raw.indexOf('invalid login') !== -1 || raw.indexOf('invalid credentials') !== -1) {
      return '이메일 또는 비밀번호가 맞지 않습니다.';
    }
    if (raw.indexOf('already registered') !== -1 || raw.indexOf('already been registered') !== -1 || raw.indexOf('user already') !== -1) {
      return '이미 가입된 이메일입니다. 로그인해 주세요.';
    }
    if (raw.indexOf('email not confirmed') !== -1) return '이메일 확인이 아직 끝나지 않았습니다. 받은 메일의 확인 링크를 눌러 주세요.';
    if (raw.indexOf('password') !== -1 && raw.indexOf('least') !== -1) return '비밀번호를 6자 이상으로 입력해 주세요.';
    if (raw.indexOf('rate limit') !== -1 || raw.indexOf('too many') !== -1) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    if (raw.indexOf('invalid email') !== -1) return '이메일 주소 형식을 확인해 주세요.';
    if (raw.indexOf('signups not allowed') !== -1 || raw.indexOf('signup is disabled') !== -1) {
      return '이메일 가입이 아직 열려 있지 않습니다.';
    }
    return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  function submitEmailForm() {
    var client = getClient();
    if (!isConfigured()) { emailStatus(MSG.notConfigured); return; }
    if (!client) { emailStatus(MSG.libMissing); return; }
    var emailEl = document.getElementById('gomnaEmailInput');
    var pwEl = document.getElementById('gomnaEmailPw');
    var submit = document.getElementById('gomnaEmailSubmit');
    var email = emailEl ? String(emailEl.value || '').trim() : '';
    var password = pwEl ? String(pwEl.value || '') : '';
    var conf = EMAIL_MODES[emailMode] || EMAIL_MODES.signin;

    if (!conf.hideEmail && (!email || email.indexOf('@') < 1)) { emailStatus('이메일 주소를 확인해 주세요.'); return; }
    if (conf.pw && password.length < 6) { emailStatus('비밀번호를 6자 이상으로 입력해 주세요.'); return; }

    setButtonBusy(submit, true);
    emailStatus('처리하고 있습니다…');

    function done(message) {
      setButtonBusy(submit, false);
      emailStatus(message);
    }

    var redirectTo = window.location.origin + CALLBACK_PATH;
    var request;
    try {
      if (emailMode === 'signin') {
        request = client.auth.signInWithPassword({ email: email, password: password });
      } else if (emailMode === 'signup') {
        request = client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: redirectTo } });
      } else if (emailMode === 'reset') {
        request = client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
      } else {
        request = client.auth.updateUser({ password: password });
      }
    } catch (e) {
      done('요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    request.then(function (res) {
      if (res && res.error) { done(emailErrorText(res.error)); return; }
      if (emailMode === 'signin') {
        var session = (res && res.data) ? res.data.session : null;
        if (!session) { done('로그인을 완료하지 못했습니다. 다시 시도해 주세요.'); return; }
        setButtonBusy(submit, false);
        emailStatus('');
        applySession(session);
        try { if (typeof window.closeLoginModal === 'function') window.closeLoginModal(); } catch (e) {}
        return;
      }
      if (emailMode === 'signup') {
        var signedUp = (res && res.data) ? res.data.session : null;
        if (signedUp) {
          setButtonBusy(submit, false);
          emailStatus('');
          applySession(signedUp);
          try { if (typeof window.closeLoginModal === 'function') window.closeLoginModal(); } catch (e) {}
          return;
        }
        done('확인 메일을 보냈습니다. 받은 메일의 링크를 누르면 가입이 끝납니다.');
        return;
      }
      if (emailMode === 'reset') {
        done('비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 정해 주세요.');
        return;
      }
      done('비밀번호를 변경했습니다.');
    })['catch'](function () {
      done('요청을 처리하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    });
  }

  /* ── 네이버: 안전한 서버 구조가 없으므로 준비 중만 알린다 ── */
  function showNaverNotice() {
    var notice = document.getElementById('loginNextStepNotice');
    var text = '네이버 로그인을 준비하고 있습니다.';
    if (notice) {
      notice.textContent = text;
      notice.hidden = false;
      return;
    }
    notify(text);
  }

  /* ── 콜백: PKCE 코드 교환 ───────────────────────────────── */

  function isCallbackPage() {
    var path = window.location.pathname || '';
    return path === CALLBACK_PATH || /\/auth\/callback\.html$/.test(path);
  }

  function setCallbackStatus(message) {
    var el = document.getElementById('authCallbackStatus');
    if (el) el.textContent = message;
  }

  /* 주소창에 인증 코드가 남지 않게 정리한다. */
  function cleanCallbackUrl() {
    try {
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {}
  }

  /* 저장된 복귀 주소는 같은 출처의 허용된 내부 경로만 통과시킨다(Open Redirect 방어). */
  function safeReturnTo() {
    var raw = readStore(RETURN_TO_KEY);
    if (typeof raw !== 'string' || !raw) return '/';
    if (raw.charAt(0) !== '/') return '/';
    if (raw.slice(0, 2) === '//') return '/';
    var url;
    try { url = new URL(raw, window.location.origin); } catch (e) { return '/'; }
    if (url.origin !== window.location.origin) return '/';
    if (url.pathname === CALLBACK_PATH) return '/';
    if (ALLOWED_RETURN_PATHS.indexOf(url.pathname) === -1) return '/';
    return url.pathname + url.search + url.hash;
  }

  function leaveCallback(target) {
    dropStore(RETURN_TO_KEY);
    try { window.location.replace(target); } catch (e) {}
  }

  function callbackFailed(message, detail) {
    cleanCallbackUrl();
    setCallbackStatus(message);
    debugNote('callback-failed', detail || { stage: 'unknown' });
    /* [임시 진단] 로컬에서는 자동 이동을 멈추고 실패 단계와 오류 code/message를 화면에 남긴다.
       운영 주소에서는 기존 동작(안내 후 홈 복귀)을 그대로 유지한다. */
    if (isLocalHost()) {
      showCallbackDetail(detail || { stage: 'unknown' });
      return;
    }
    writeStore(MESSAGE_KEY, message);
    leaveCallback('/');
  }

  function callbackSucceeded(session) {
    cleanCallbackUrl();
    /* 카카오는 이메일을 아예 요청하지 않으므로(동의 항목 미설정 오류 방지) 이메일이 없는 것이 정상이다.
       따라서 이메일 관련 안내를 띄우지 않고, 이메일 없는 계정도 그대로 로그인 상태로 둔다. */
    leaveCallback(safeReturnTo());
  }

  /* ── [임시 조사용] 원인 확인 후 제거한다. 키·토큰 값은 절대 담지 않는다. ── */
  function safeErr(error) {
    if (!error) return null;
    return {
      name: text(error.name),
      code: text(error.code),
      status: (typeof error.status === 'number') ? error.status : null,
      message: text(error.message)
    };
  }
  function storageKeyNames() {
    var names = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf('sb-') === 0) names.push(k); /* 이름만. 값은 담지 않는다. */
      }
    } catch (e) { names.push('(localStorage 접근 실패)'); }
    return names;
  }
  function isLocalHost() {
    var h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  }

  function paramNames(raw) {
    var names = [];
    try {
      var s = String(raw || '').replace(/^[?#]/, '');
      if (!s) return names;
      var parts = s.split('&');
      for (var i = 0; i < parts.length; i++) {
        var n = parts[i].split('=')[0];
        if (n) names.push(n); /* 이름만. 값은 담지 않는다. */
      }
    } catch (e) {}
    return names;
  }
  /* 안전한 오류 정보를 로컬 서버 접속 기록에 남긴다(GET 한 번. 404여도 기록은 남는다).
     같은 출처와 조사용 포트 두 곳에 보내므로 별도 프로세스가 없어도 최소 한 곳에는 남는다. */
  function pingDiag(stage, info) {
    if (!isLocalHost()) return;
    try {
      var q = 'stage=' + encodeURIComponent(stage);
      var flat = info || {};
      for (var k in flat) {
        if (!Object.prototype.hasOwnProperty.call(flat, k)) continue;
        var v = flat[k];
        if (v && typeof v === 'object') v = JSON.stringify(v);
        q += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(String(v).slice(0, 160));
      }
      new window.Image().src = '/__gomna-auth-diag?' + q;
      new window.Image().src = 'http://127.0.0.1:8798/log?' + q;
    } catch (e) {}
  }

  function debugNote(stage, info) {
    var box = { stage: stage, info: info || null, at: new Date().toISOString() };
    try {
      var prev = [];
      try { prev = JSON.parse(window.localStorage.getItem(DEBUG_KEY) || '[]') || []; } catch (e) { prev = []; }
      if (!(prev instanceof Array)) prev = [];
      prev.push(box);
      while (prev.length > 12) prev.shift();
      window.__gomnaAuthDebug = prev;
      var json = JSON.stringify(prev);
      /* 탭을 닫거나 홈으로 이동해도 남도록 localStorage에 둔다. 원인 확정 후 이 코드와 함께 제거한다. */
      window.localStorage.setItem(DEBUG_KEY, json);
      window.sessionStorage.setItem(DEBUG_KEY, json);
    } catch (e) {}
    pingDiag(stage, info);
  }

  /* 실패한 단계와 Supabase가 준 code/message/status만 콜백 화면에 보여준다(로컬에서만). */
  function showCallbackDetail(detail) {
    var el = document.getElementById('authCallbackDetail');
    if (!el || !detail) return;
    var bits = [];
    if (detail.stage) bits.push('단계: ' + detail.stage);
    if (detail.name) bits.push('name: ' + detail.name);
    if (detail.code) bits.push('code: ' + detail.code);
    if (detail.status !== null && detail.status !== undefined && detail.status !== '') bits.push('status: ' + detail.status);
    if (detail.message) bits.push('message: ' + detail.message);
    if (detail.note) bits.push(detail.note);
    el.textContent = bits.join('\n');
    el.hidden = false;
    var back = document.getElementById('authCallbackBack');
    if (back) back.hidden = false;
  }
  /* ── [임시 조사용] 끝 ── */

  function handleCallback() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
    var code = params ? params.get('code') : null;
    var errorCode = params ? params.get('error') : null;
    var errorDetail = params ? (params.get('error_description') || '') : '';

    var searchKeys = paramNames(window.location.search);
    var hashKeys = paramNames(window.location.hash);
    var sbKeys = storageKeyNames();
    /* 2.112.0의 exchangeCodeForSession은 주소의 sb_flow_id로 PKCE 검증값을 찾는다.
       그래서 sb_flow_id 유무와 검증값 키 개수를 실패 화면에 함께 남긴다. */
    var note = 'params: ' + (searchKeys.join(',') || '없음')
      + ' / hash: ' + (hashKeys.join(',') || '없음')
      + ' / sb_flow_id: ' + (searchKeys.indexOf('sb_flow_id') === -1 ? '없음' : '있음')
      + ' / 검증값키: ' + sbKeys.length + '개';

    debugNote('callback-start', {
      origin: window.location.origin,
      pathname: window.location.pathname,
      searchKeys: searchKeys,
      hashKeys: hashKeys,
      hasCode: !!text(code),
      codeLength: text(code).length,
      errorParam: errorCode || null,
      errorDetail: String(errorDetail).slice(0, 120),
      sbKeys: sbKeys,
      codeAlreadyUsed: readStore(CODE_USED_KEY) === code,
      returnToPresent: !!readStore(RETURN_TO_KEY),
      configured: isConfigured(),
      libReady: libReady()
    });

    if (errorCode) {
      var cancelled = /access_denied|user_cancel|cancel/i.test(String(errorCode) + ' ' + String(errorDetail));
      callbackFailed(cancelled ? MSG.cancelled : MSG.failed,
        { stage: '주소에 error 파라미터', code: String(errorCode), message: String(errorDetail).slice(0, 160), note: note });
      return;
    }
    if (!text(code)) { callbackFailed(MSG.failed, { stage: 'code 파라미터 없음', note: note }); return; }

    if (!isConfigured()) { callbackFailed(MSG.notConfigured, { stage: '키 설정 미완료', note: note }); return; }
    var supabaseClient = getClient();
    if (!supabaseClient) { callbackFailed(MSG.libMissing, { stage: 'Supabase 라이브러리 없음', note: note }); return; }

    /* 새로고침으로 같은 코드를 두 번 교환하지 않는다. 이미 쓴 코드면 세션만 확인한다. */
    if (readStore(CODE_USED_KEY) === code) {
      supabaseClient.auth.getSession().then(function (result) {
        var session = (result && result.data) ? result.data.session : null;
        if (session) callbackSucceeded(session);
        else callbackFailed(MSG.failed, { stage: '이미 사용한 code, 세션 없음', note: note });
      })['catch'](function () {
        callbackFailed(MSG.failed, { stage: '이미 사용한 code, 세션 조회 실패', note: note });
      });
      return;
    }
    writeStore(CODE_USED_KEY, code);

    function withNote(stage, error) {
      var d = safeErr(error) || {};
      d.stage = stage;
      d.note = note;
      return d;
    }

    try {
      supabaseClient.auth.exchangeCodeForSession(code).then(function (result) {
        var session = (result && result.data) ? result.data.session : null;
        debugNote('exchange-result', { error: safeErr(result && result.error), hasSession: !!session });
        if (result && result.error) { callbackFailed(MSG.failed, withNote('코드 교환 응답 오류', result.error)); return; }
        if (!session) { callbackFailed(MSG.failed, withNote('코드 교환 성공했으나 세션 없음', null)); return; }
        callbackSucceeded(session);
      })['catch'](function (e) {
        callbackFailed(navigator.onLine === false ? MSG.network : MSG.failed, withNote('코드 교환 중 예외', e));
      });
    } catch (e) {
      callbackFailed(MSG.failed, withNote('코드 교환 호출 실패', e));
    }
  }

  /* ── 시작 ───────────────────────────────────────────────── */

  function initCallbackPage() {
    if (!libReady()) {
      callbackFailed(MSG.libMissing, { stage: 'Supabase 라이브러리 로드 실패', note: 'CDN 차단·오프라인 여부 확인' });
      return;
    }
    handleCallback();
  }

  function initAppPage() {
    /* 설정이 아직 끝나지 않아도 페이지의 다른 기능은 그대로 동작해야 한다. */
    bindProviderButtons();
    bindLogout();
    injectShared();
    flushPendingMessage();

    /* 되살아난 페이지(뒤로 가기)에서도 로그인 버튼이 다시 눌리게 한다. */
    window.addEventListener('pageshow', resetSignInBusy);

    /* 화면이 다시 보일 때, 아직 확정되지 않았다면 저장 구조를 한 번 더 확인한다.
       (대표님이 Supabase에 권한·표를 적용한 직후에도 새로고침 없이 반영되도록) */
    window.addEventListener('pageshow', function () {
      if (currentUser && caps.records !== 'ready') probeCapabilities(true);
    });

    var supabaseClient = getClient();
    if (!supabaseClient) return;

    /* 깜빡임 방지: 저장된 세션이 있으면 먼저 반영한다. */
    var early = storedSession();
    if (early) applySession(early);

    supabaseClient.auth.getSession().then(function (result) {
      applySession((result && result.data) ? result.data.session : null);
      if (currentUser) { probeCapabilities(); loadProfileRow(); }
    })['catch'](function () {
      applySession(null);
    });

    /* 콜백 안에서는 전달받은 session으로 동기 UI 갱신만 한다(비동기 재호출 금지). */
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      applySession(session);
      if (event === 'PASSWORD_RECOVERY') {
        /* 재설정 메일로 들어온 경우에만 새 비밀번호 화면을 연다. */
        try {
          if (typeof window.openLoginModal === 'function') window.openLoginModal('password-recovery');
          setEmailMode('newpw');
        } catch (e) {}
      }
    });
  }

  /* 페이지에서 쓰는 공개 연결점. 새 인증 체계가 아니라 위 함수들을 그대로 부른다. */
  window.GomnaAuth = {
    isSignedIn: function () { return !!currentUser; },
    getAccount: accountInfo,
    openLogin: openLoginChooser,
    openProfile: openProfile,
    closeProfile: closeProfile,
    openProfileEdit: openProfileEdit,
    openEmailLogin: openEmailLogin,
    showNaverNotice: showNaverNotice,
    openFavorites: openFavorites,
    runAction: handleAccountAction,
    syncRecords: syncRecords,
    checkCapabilities: probeCapabilities
  };

  function init() {
    if (isCallbackPage()) initCallbackPage();
    else initAppPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
