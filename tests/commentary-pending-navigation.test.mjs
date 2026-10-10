import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
function section(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `shipped commentary section exists: ${start}`);
  return html.slice(from, to);
}
// Run the complete shipped renderer, including the actual popup writes. The
// fixture supplies data and peripheral helpers, without replacing its branches.
const source = [
  section('function notifyCommentaryShown(verseNum)', '\nvar _gomnaCommentaryRequest'),
  section('var _gomnaCommentaryRequest =', '\nvar currentCommentaryTab ='),
  section('function closeCommentary()', '\n// 전체보기 기능')
].join('\n');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(locale = 'ko-KR') {
  function element(...classes) {
    const names = new Set(classes);
    let markup = '';
    let writes = 0;
    return {
      classList: {
        add(...items) { items.forEach(item => names.add(item)); },
        remove(...items) { items.forEach(item => names.delete(item)); },
        contains(item) { return names.has(item); }
      },
      style: { removeProperty() {} },
      get innerHTML() { return markup; },
      set innerHTML(value) { markup = value; writes++; },
      get writes() { return writes; },
      querySelector(selector) {
        return selector === '.commentary-tabs' && markup.includes('class="commentary-tabs"') ? {} : null;
      }
    };
  }
  const popup = element('show');
  const content = element();
  content.innerHTML = '<div class="commentary-tabs">previous commentary</div>';
  const title = element();
  title.innerHTML = 'previous verse';
  const verseView = element('active');
  const box = element();
  const nodes = new Map([
    ['commentaryPopup', popup], ['commentaryContent', content],
    ['commentaryTitle', title], ['verseView', verseView], ['commentaryPopupBox', box]
  ]);
  const loads = new Map();
  const localeEntries = new Map();
  const shown = [];
  const rendered = [];
  const hooks = [];
  let cardLocale = locale;
  const context = {
    console,
    document: {
      getElementById: id => nodes.get(id) || null,
      querySelectorAll: () => []
    },
    currentBook: { name: '창세기', testament: 'old' },
    currentChapter: 1,
    currentCommentaryTab: 'tab-원어분석',
    currentCommentaryVerseForRelated: null,
    relatedCommentaryReturnState: null,
    multiCommentaryList: null,
    multiCommentaryIndex: -1,
    _commentaryRenderKey: 'previous|1|9|tab-원어분석|0|ko',
    _commentaryLoaded: {},
    _commentaryFailed: {},
    BOOK_FILE_MAP: { '창세기': 'genesis', '출애굽기': 'exodus' },
    commentaryCache: {},
    getCommentaryCardLocale: () => cardLocale,
    getReaderUiLangCode: () => cardLocale.slice(0, 2),
    getTotalVersesInChapter: () => 31,
    getChapterUnit: () => '장',
    commentaryI18nT: key => key,
    commentaryI18nLeafAttrs: () => '',
    commentaryNativeBodyAttr: () => '',
    commentaryNativeBodyClassSuffix: () => '',
    buildCommentaryTabButton: (tab, key) => `<button>${key}</button>`,
    buildCommentarySectionHead: (icon, key) => `<h2>${key}</h2>`,
    buildCommentaryTh: key => `<th>${key}</th>`,
    resolvePastorCommentaryVerseData: dataKey => ({
      ok: true,
      data: { '표1_원어분석': [{ '원어': `current card ${dataKey}` }] }
    }),
    updateCompactCommentaryHeader: (book, chapter, verse) => {
      rendered.push({ book, chapter, verse, locale: cardLocale });
      title.innerHTML = `${book} ${chapter}:${verse}`;
    },
    // The actual renderer schedules scroll/audio work after opening. It does
    // not affect whether an async request may replace the current page.
    setTimeout() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent: event => shown.push(event.detail.verse),
    __gomnaCommentaryGestureTeardown: () => hooks.push('gesture'),
    __gomnaResetCommentaryHeaderPullSpace: () => hooks.push('pull'),
    GOMNA_COMMENTARY_AUTO_CENTER: { cancelAll: () => hooks.push('center') },
    GOMNA_AUDIO_COMMENTARY_BUTTONS: { stopIfCommentaryAudio: () => hooks.push('audio') }
  };
  function pending(key) {
    if (!loads.has(key)) loads.set(key, deferred());
    return loads.get(key).promise;
  }
  context.loadPastorCommentary = book => pending(`ko-KR|${context.BOOK_FILE_MAP[book]}`);
  context.peekLocaleCommentaryCards = (lang, bookId) => localeEntries.get(`${lang}|${bookId}`);
  context.loadLocaleCommentaryCards = (lang, bookId) => {
    const key = `${lang}|${bookId}`;
    localeEntries.set(key, { status: 'loading' });
    return pending(key);
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'reader-commentary-functions.js' });
  async function complete(lang = locale, book = '창세기') {
    const key = `${lang}|${context.BOOK_FILE_MAP[book]}`;
    assert.ok(loads.has(key), `a real lazy-load branch requested ${key}`);
    if (lang === 'ko-KR') context._commentaryLoaded[book] = true;
    else localeEntries.set(key, { status: 'loaded' });
    loads.get(key).resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  return {
    context, popup, content, title, verseView, loads, shown, rendered, hooks, complete,
    setLocale(value) { cardLocale = value; }
  };
}

for (const locale of ['ko-KR', 'en-US', 'ja-JP']) {
  {
    const f = fixture(locale);
    const previousContent = f.content.innerHTML;
    const previousWrites = f.content.writes;
    f.context.showCommentary(3);
    assert.equal(f.popup.classList.contains('show'), false, `${locale}: pending hides the previous popup`);
    assert.equal(f.verseView.classList.contains('active'), true, `${locale}: the reader remains active`);
    assert.equal(f.content.writes, previousWrites, `${locale}: pending never writes an intermediate card`);
    assert.equal(f.content.innerHTML, previousContent, `${locale}: hidden previous markup is untouched`);
    assert.equal(f.title.innerHTML, 'previous verse', `${locale}: pending does not expose a mixed old/new title`);
    assert.equal(f.context._commentaryRenderKey, null);
    assert.deepEqual(f.shown, []);
    await f.complete();
    assert.equal(f.popup.classList.contains('show'), true, `${locale}: ready data opens the actual card`);
    assert.match(f.content.innerHTML, /current card 창세기_1_3/);
    assert.doesNotMatch(f.content.innerHTML, /previous commentary|commentary\.loading/);
    assert.deepEqual(f.shown, [3]);
  }

  {
    const f = fixture(locale);
    f.context.showCommentary(1);
    f.context.showCommentary(2);
    assert.equal(f.loads.size, 1, `${locale}: repeated taps share the pending data request`);
    await f.complete();
    assert.deepEqual(f.shown, [2], `${locale}: only the latest tap opens a popup`);
    assert.deepEqual(f.rendered.map(item => item.verse), [2], `${locale}: stale data never renders`);
    assert.match(f.content.innerHTML, /current card 창세기_1_2/);
  }

  {
    const f = fixture(locale);
    f.context.showCommentary(5);
    f.context.closeCommentary();
    await f.complete();
    assert.equal(f.popup.classList.contains('show'), false, `${locale}: close cancels late popup reopening`);
    assert.deepEqual(f.rendered, []);
    assert.deepEqual(f.hooks, ['gesture', 'audio', 'pull', 'center'], `${locale}: close also runs existing teardown`);
  }

  const changes = [
    ['book', f => { f.context.currentBook = { name: '출애굽기' }; }],
    ['chapter', f => { f.context.currentChapter = 2; }],
    ['card locale', f => { f.setLocale(locale === 'ja-JP' ? 'en-US' : 'ja-JP'); }],
    ['active page', f => { f.verseView.classList.remove('active'); }]
  ];
  for (const [name, change] of changes) {
    const f = fixture(locale);
    f.context.showCommentary(4);
    change(f);
    await f.complete();
    assert.equal(f.popup.classList.contains('show'), false, `${locale}: changed ${name} rejects the old response`);
    assert.deepEqual(f.rendered, [], `${locale}: changed ${name} never reaches the renderer`);
    assert.deepEqual(f.shown, []);
  }

  {
    const f = fixture(locale);
    f.context.showCommentary(1);
    f.context.closeCommentary();
    f.context.showCommentary(8);
    await f.complete();
    assert.deepEqual(f.shown, [8], `${locale}: a fresh request after close can use the shared load`);
  }
}

{
  const f = fixture();
  f.context.showCommentary(1);
  f.context.__gomnaCommentaryLoadAborted = true;
  await f.complete();
  assert.deepEqual(f.shown, [], 'an explicitly aborted KO load never reopens the popup');
}

{
  const f = fixture();
  f.context._commentaryFailed['창세기'] = true;
  f.context.resolvePastorCommentaryVerseData = () => ({ ok: false });
  f.context.bookNumbers = { '창세기': '01' };
  f.context.commentaryData = {
    '01_창세기_001장': { verses: [{ verse: 6, pastor_comment: 'available memory commentary' }] }
  };
  f.context.showCommentary(6);
  assert.match(f.content.innerHTML, /available memory commentary/, 'the synchronous memory fallback renders immediately');
  assert.doesNotMatch(f.content.innerHTML, /commentary\.loading|previous commentary/);
  assert.equal(f.loads.size, 0, 'a failed pastor load is not retried by the memory fallback');
  assert.deepEqual(f.shown, [6]);
}

{
  const f = fixture();
  f.context._commentaryFailed['창세기'] = true;
  f.context.resolvePastorCommentaryVerseData = () => ({ ok: false });
  f.context.showCommentary(6);
  assert.match(f.content.innerHTML, /commentary\.empty/, 'missing KO data renders its completed empty state');
  assert.doesNotMatch(f.content.innerHTML, /commentary\.loading|previous commentary/);
  assert.equal(f.loads.size, 0, 'missing data never leaves another pending preparation card');
}

console.log('commentary pending navigation checks passed');
