const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const reader = fs.readFileSync(new URL('../reader.html', `file://${__filename}`), 'utf8');
const shared = fs.readFileSync(new URL('../js/gomna-ga4.js', `file://${__filename}`), 'utf8');
const control = fs.readFileSync(new URL('../analytics-control.js', `file://${__filename}`), 'utf8');
const auth = fs.readFileSync(new URL('../js/gomna-auth.js', `file://${__filename}`), 'utf8');
function productionFunction(name) {
  const start = reader.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const end = reader.indexOf('\n}\n', start);
  assert.notEqual(end, -1, name);
  return reader.slice(start, end + 2);
}
function classList(initial = []) {
  const values = new Set(initial);
  return { contains: value => values.has(value), add: (...items) => items.forEach(x => values.add(x)),
    remove: (...items) => items.forEach(x => values.delete(x)),
    toggle: (item, on) => on ? values.add(item) : values.delete(item) };
}
function setup() {
  const nodes = {};
  for (const id of ['verseView', 'easyView', 'favView', 'searchView', 'oldView', 'newView', 'chapterView']) {
    nodes[id] = { id, classList:classList(id === 'verseView' ? ['active'] : []),
      innerHTML:id === 'verseView' ? '<div class="verse-item">말씀</div>' : '', scrollIntoView() {} };
  }
  const calls = [], root = { classList:classList() };
  const active = () => Object.values(nodes).find(n => n.classList.contains('active') && /View$/.test(n.id));
  const document = {
    documentElement:root, visibilityState:'visible',
    getElementById:id => nodes[id] || null,
    querySelector(selector) {
      if (selector === 'main.content .view.active') return active();
      if (selector === '#verseList .verse-item') return nodes.verseView.innerHTML.includes('verse-item') ? {} : null;
      return null;
    },
    querySelectorAll(selector) { return selector === '.view' ? Object.values(nodes).filter(n => /View$/.test(n.id)) : []; }
  };
  const window = { dispatchEvent() {}, GomnaGa4:{ screenView(screen, options) {
    calls.push({screen, initial:options.initial, active:active()?.id}); return true;
  } } };
  const book = {name:'시편', chapters:[{chapter:23, verses:[{verse:1,text:'여호와는 나의 목자시니'}]}]};
  const context = { window, document, console, URLSearchParams, location:{search:'?book=시편&chapter=23'},
    currentBook:{name:'시편',testament:'old',chapters:150}, currentChapter:23, currentTab:'old',
    lastReaderReturn:null, _gomnaPendingEasyAction:null, oldTestamentData:{books:[book]}, newTestamentData:{books:[]},
    setTimeout:fn => fn(), requestAnimationFrame:fn => fn(), CustomEvent:class { constructor(type, options) { this.type=type;this.detail=options?.detail; } },
    isHomeBiblePickerFrame:() => false, findBook:(_data,name) => name === '시편' ? book : null,
    getDisplayedChapterCount:() => 150, getReaderScriptureLang:() => 'ko', readerCanonicalBookNr:() => 19,
    readerUiFmt:(_key,_params,fallback) => fallback, isPsalmsBook:() => true, getChapterUnit:() => '편',
    buildReaderChapterButtonHtml:n => `<button>${n}</button>` };
  for (const name of ['closeReaderLocationMenus','updateHeaderBtns','syncReaderNavActive','updateOpt4BottomBar',
    'syncReaderChapterLayout','refreshTestamentListIfNeeded','resetBibleListScroll','renderEasyRecentBooks',
    'renderEasyFind','syncScriptureDockActive','loadCommentaryData','rememberEasyRecentBook','syncReaderNativeUiLangClass',
    'applyReaderChapterLabels','connectReaderChapterLabelObserver','closeVerseToolbarMoreMenu','closeVerseToolbarTargetMenu',
    'closeVerseListenModeMenu','applyRange','updateVerseRangeBoxLabel']) context[name] = () => {};
  const names = ['getActiveReaderViewId','syncReaderAnalyticsScreen','switchTab','handleScriptureDock',
    'selectBook','selectChapter','renderVerses','goToVerse'];
  vm.createContext(context);
  vm.runInContext(names.map(productionFunction).join('\n'), context);
  return {context, window, document, root, nodes, calls, active};
}

function installCollector(p, {consent = true, internal = false, iframe = false} = {}) {
  const storage = () => {
    const map = new Map();
    return {getItem:key => map.get(key) ?? null, setItem:(key,value) => map.set(key,String(value)), removeItem:key => map.delete(key)};
  };
  const local = storage(), session = storage(), documentEvents = {}, windowEvents = {}, scripts = [];
  if (consent !== null) local.setItem('cookieChoice', JSON.stringify({analytics:consent}));
  if (internal) local.setItem('gomna:analytics:internal','1');
  const on = (events,name,fn) => (events[name] ||= []).push(fn);
  const emit = (events,name,event = {}) => (events[name] || []).forEach(fn => fn(event));
  const originalQuery = p.document.querySelector;
  Object.assign(p.document, {
    readyState:'loading', referrer:'https://www.google.com/', title:'성경 읽기·듣기·말씀풀이 | 은혜의말씀', cookie:'',
    head:{appendChild:script => scripts.push(script)}, body:{appendChild() {}},
    addEventListener:(name,fn) => on(documentEvents,name,fn),
    querySelector:selector => selector.includes('script[src') ? scripts.find(x => x.src?.includes('googletagmanager.com')) : originalQuery(selector),
    getElementsByTagName:() => [{parentNode:{insertBefore:script => scripts.push(script)}}],
    createElement:() => ({style:{},setAttribute(){},remove(){}})
  });
  p.nodes['cookie-banner'] = {hidden:true};
  p.root.setAttribute = () => {};
  delete p.window.GomnaGa4;
  Object.assign(p.window, {addEventListener:(name,fn) => on(windowEvents,name,fn), dispatchEvent:e => emit(windowEvents,e.type,e)});
  p.window.self = p.window;
  p.window.top = iframe ? {} : p.window;
  Object.assign(p.context, {location:new URL('https://gomnastudio.com/reader.html?' +
    (iframe ? 'source=home-bible-picker' : 'book=시편&chapter=23')),
    URL, localStorage:local, sessionStorage:session, navigator:{webdriver:false,userAgent:'test'},
    history:{replaceState(){}}, Date});
  vm.runInContext(reader.match(/^window\.addEventListener\('gomna:analytics-ready'.+$/m)[0], p.context);
  vm.runInContext(control, p.context);
  vm.runInContext(shared, p.context);
  emit(documentEvents,'DOMContentLoaded');
  const commands = () => Array.from(p.window.dataLayer || [], command => Array.from(command));
  return {
    commands, scripts, show:visible => {p.document.visibilityState=visible?'visible':'hidden';emit(documentEvents,'visibilitychange');},
    pageViews:() => commands().filter(x => x[0] === 'event' && x[1] === 'page_view'),
    initialViews:() => commands().filter(x => x[0] === 'config' && x[2]?.send_page_view !== false),
    phViews:() => Array.from(p.window.posthog || []).filter(x => x[0] === 'capture' && x[1] === '$pageview'),
    screenEvents:() => commands().filter(x => x[0] === 'event' && x[1] === 'app_screen_view')
  };
}

test('actual Reader dock actions report the displayed Find and Archive, and returning to scripture reports Reader', () => {
  const p = setup();
  p.context.syncReaderAnalyticsScreen(true);
  p.context.handleScriptureDock('find');
  p.context.handleScriptureDock('archive');
  p.context.goToVerse('시편', 23, 1, 'old');
  assert.deepEqual(p.calls.map(x => [x.screen,x.active]), [
    ['reader','verseView'],['find','easyView'],['archive','favView'],['reader','verseView']
  ]);
  assert.equal(p.calls[0].initial, true);
  assert.ok(p.calls.slice(1).every(x => x.initial === false));
});

test('book and chapter choices report only after the destination content is rendered', () => {
  const p = setup();
  p.context.switchTab('old');
  p.context.selectBook('시편', 150, 'old');
  assert.ok(p.nodes.chapterView.innerHTML.includes('<button>150</button>'));
  p.context.selectChapter(23);
  assert.deepEqual(p.calls.map(x => x.screen), ['bible-old','chapter','reader']);
  assert.ok(p.nodes.verseView.innerHTML.includes('여호와는 나의 목자시니'));
});

test('preparing, background and embedded picker views do not announce a visible screen', () => {
  const p = setup();
  p.root.classList.add('reader-panel-entry-pending');
  p.context.switchTab('easy');
  assert.equal(p.calls.length, 0);
  p.root.classList.remove('reader-panel-entry-pending');
  p.context.syncReaderAnalyticsScreen(true);
  assert.equal(p.calls.length, 1);
  p.document.visibilityState = 'hidden';
  p.context.switchTab('fav');
  assert.equal(p.calls.length, 1);
  p.document.visibilityState = 'visible';
  p.context.isHomeBiblePickerFrame = () => true;
  p.context.syncReaderAnalyticsScreen();
  assert.equal(p.calls.length, 1);
});

test('a pending scripture download is not presented as a visible scripture screen', () => {
  const p = setup();
  p.nodes.verseView.innerHTML = '<p>본문을 준비하고 있습니다.</p>';
  p.context.syncReaderAnalyticsScreen();
  assert.equal(p.calls.length, 0);
});

test('a full Bible picker is counted, while an uncommitted edge peek is not', () => {
  const p = setup();
  p.nodes.unifiedBookChapterModal = { id:'unifiedBookChapterModal', classList:classList(['active','unified-bc-overlay--peek']) };
  p.context.syncReaderAnalyticsScreen();
  assert.equal(p.calls.at(-1).screen, 'reader');
  p.nodes.unifiedBookChapterModal.classList.remove('unified-bc-overlay--peek');
  p.context.syncReaderAnalyticsScreen();
  assert.equal(p.calls.at(-1).screen, 'bible_picker');
});

test('a missing or failing collector never prevents normal navigation', () => {
  const p = setup();
  delete p.window.GomnaGa4;
  assert.doesNotThrow(() => p.context.handleScriptureDock('find'));
  assert.equal(p.active().id, 'easyView');
  p.window.GomnaGa4 = {screenView() { throw Error('blocked collector'); }};
  assert.doesNotThrow(() => p.context.handleScriptureDock('archive'));
  assert.equal(p.active().id, 'favView');
});

test('actual Reader handlers and shared collectors record one entry plus each visible tab change once', () => {
  const p = setup(), collector = installCollector(p);
  p.context.syncReaderAnalyticsScreen(true);
  p.context.handleScriptureDock('find');
  p.context.handleScriptureDock('find'); // repeated tap is not another view
  p.context.handleScriptureDock('archive');
  p.context.handleScriptureDock('find');
  assert.equal(collector.initialViews().length, 1);
  assert.deepEqual(collector.pageViews().map(x => x[2].screen_name), ['find','archive','find']);
  assert.equal(collector.phViews().length, 4);
  assert.deepEqual(collector.screenEvents().map(x => x[2].screen), ['reader','find','archive','find']);
  assert.ok(collector.pageViews().every(x => !x[2].page_location.includes('book=')));
});

test('accepting after unmeasured navigation starts at the currently visible screen without replaying prior screens', () => {
  const p = setup(), collector = installCollector(p, {consent:null});
  p.context.syncReaderAnalyticsScreen(true);
  p.context.handleScriptureDock('find');
  p.context.handleScriptureDock('archive');
  assert.equal(collector.commands().length, 0);
  p.window.GomnaGa4.consentChanged(true);
  assert.equal(collector.initialViews().length, 1);
  assert.equal(collector.initialViews()[0][2].screen_name, 'archive');
  assert.equal(collector.pageViews().length, 0);
  assert.equal(collector.phViews().length, 1);
  assert.deepEqual(collector.screenEvents().map(x => x[2].screen), ['archive']);
  p.context.handleScriptureDock('find');
  assert.deepEqual(collector.pageViews().map(x => x[2].screen_name), ['find']);
});

test('refusal, internal test devices and embedded preload never transmit Reader tab views', () => {
  for (const options of [{consent:false}, {internal:true}, {iframe:true}]) {
    const p = setup(), collector = installCollector(p, options);
    p.context.syncReaderAnalyticsScreen(true);
    p.context.handleScriptureDock('find');
    p.context.handleScriptureDock('archive');
    assert.equal(collector.commands().length, 0, JSON.stringify(options));
    assert.equal(collector.phViews().length, 0, JSON.stringify(options));
    assert.equal(collector.scripts.length, 0, JSON.stringify(options));
  }
});

test('revocation stops tab tracking, and renewed consent does not manufacture an extra page view', () => {
  const p = setup(), collector = installCollector(p);
  p.context.syncReaderAnalyticsScreen(true);
  p.context.handleScriptureDock('find');
  const before = collector.pageViews().length;
  p.window.GomnaGa4.consentChanged(false);
  p.context.handleScriptureDock('archive');
  p.context.goToVerse('시편', 23, 1, 'old');
  assert.equal(collector.pageViews().length, before);
  p.window.GomnaGa4.consentChanged(true);
  assert.equal(collector.pageViews().length, before);
  p.context.handleScriptureDock('archive');
  assert.equal(collector.pageViews().length, before + 1);
});

test('shared account UI reports only its final visible state and never includes profile details', () => {
  const p = setup(), collector = installCollector(p), frames = [];
  p.context.syncReaderAnalyticsScreen(true);
  p.nodes.gomnaProfileSheet = {id:'gomnaProfileSheet',hidden:true,classList:classList(),querySelector:() => null};
  p.root.style = {};
  p.window.requestAnimationFrame = fn => frames.push(fn);
  p.window.syncReaderAnalyticsScreen = p.context.syncReaderAnalyticsScreen;
  Object.assign(p.context, {
    accountAnalyticsQueued:false, currentUser:{email:'private@example.test'},
    injectShared(){}, fillProfile(){}, profileStatus(){}, probeCapabilities:() => ({then(){}})
  });
  for (const name of ['queueAccountAnalyticsScreen','openProfile','closeProfile']) {
    const start = auth.indexOf(`  function ${name}(`);
    assert.notEqual(start, -1);
    vm.runInContext(auth.slice(start, auth.indexOf('\n  }\n', start) + 4), p.context);
  }
  const paint = () => { while (frames.length) frames.shift()(); };
  p.context.openProfile();
  assert.equal(collector.pageViews().length, 0);
  paint();
  assert.equal(collector.pageViews().at(-1)[2].screen_name, 'account');
  // Profile-to-profile operations within one paint must not show a false Reader detour.
  p.context.closeProfile();
  p.context.openProfile();
  paint();
  assert.equal(collector.pageViews().length, 1);
  p.context.closeProfile();
  paint();
  assert.deepEqual(collector.pageViews().map(x => x[2].screen_name), ['account','reader']);
  assert.ok(!JSON.stringify(collector.commands()).includes('private@example.test'));
});

test('foreground recovery reports the screen that settled in the background, not stale intermediate tabs', () => {
  const p = setup(), collector = installCollector(p);
  p.context.syncReaderAnalyticsScreen(true);
  collector.show(false);
  p.context.handleScriptureDock('find');
  p.context.handleScriptureDock('archive');
  assert.equal(collector.pageViews().length, 0);
  collector.show(true);
  assert.deepEqual(collector.pageViews().map(x => x[2].screen_name), ['archive']);
  assert.deepEqual(collector.screenEvents().map(x => x[2].screen), ['reader','archive']);
});

test('closing a picker into a book list does not count an unpainted Reader detour', () => {
  const p = setup(), collector = installCollector(p), frames = [];
  p.context.syncReaderAnalyticsScreen(true);
  p.nodes.unifiedBookChapterModal = {id:'unifiedBookChapterModal',classList:classList(['active']),setAttribute(){}};
  p.context.syncReaderAnalyticsScreen();
  Object.assign(p.context, {readerAnalyticsScreenQueued:false,requestAnimationFrame:fn => frames.push(fn),isHomeBiblePickerMode:() => false});
  for (const name of ['disconnectReaderChapterLabelObserver','ubcDialResetMotionState','unifiedBcRememberDrawerStep',
    'unifiedBcResetDrawerTransform','unifiedBcCloseCatSheet','unifiedBcSyncRailState']) p.context[name] = () => {};
  for (const name of ['queueReaderAnalyticsScreen','closeUnifiedBookChapterModal','unifiedBcGoBookList']) {
    vm.runInContext(productionFunction(name), p.context);
  }
  p.context.unifiedBcGoBookList();
  while (frames.length) frames.shift()();
  assert.deepEqual(collector.pageViews().map(x => x[2].screen_name), ['bible_picker','bible-old']);
  assert.equal(p.active().id, 'oldView');
});

test('library rendering and closing notify the Home bridge only after the final visible state', () => {
  const source = fs.readFileSync(new URL('../js/gomna-bible-library.js', `file://${__filename}`), 'utf8');
  const observations = [], feed = {inert:false}, body = {classList:classList()};
  const title = {textContent:'',focus(){}}, back = {setAttribute(){}};
  const panel = {hidden:true,querySelector:selector => selector === '#gblTitle' ? title : back};
  const context = {
    window:{syncHomeAnalyticsScreen() {observations.push({hidden:panel.hidden,inert:feed.inert,open:body.classList.contains('gbl-open')});}},
    document:{body,documentElement:{classList:classList()},getElementById:() => feed},
    panel, current:null, route:() => ({kind:'people',id:''}), items:[], layout(){}, list(){}, detail(){}
  };
  vm.createContext(context);
  for (const name of ['syncLibraryAnalytics','closeView','render']) {
    const start = source.indexOf(`  function ${name}(`);
    assert.notEqual(start, -1);
    vm.runInContext(source.slice(start, source.indexOf('\n  }\n', start) + 4), context);
  }
  context.render();
  context.closeView();
  assert.deepEqual(observations, [{hidden:false,inert:true,open:true},{hidden:true,inert:false,open:false}]);
});
