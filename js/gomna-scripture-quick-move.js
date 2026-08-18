/* Shared scripture quick-move card. Reader and Home use the same overlay, renderers, and data. */
(function(){
  'use strict';
  if (window.__GOMNA_SCRIPTURE_QUICK_MOVE__) return;
  window.__GOMNA_SCRIPTURE_QUICK_MOVE__ = true;

  var OVERLAY_HTML = ''
    + '<div class="scripture-quick-move-sheet" id="scriptureQuickMoveSheet" tabindex="-1">'
    +   '<div class="scripture-quick-move-head">'
    +     '<h2 class="scripture-quick-move-title" id="scriptureQuickMoveTitle">성경 빠른 이동</h2>'
    +     '<button type="button" class="scripture-quick-move-close" id="scriptureQuickMoveClose" aria-label="닫기">'
    +       '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14"/></svg>'
    +     '</button>'
    +   '</div>'
    +   '<div class="scripture-quick-move-seg" id="scriptureQuickMoveSeg" role="tablist" aria-label="구약 신약 선택">'
    +     '<button type="button" class="scripture-quick-move-seg-btn" role="tab" data-qm-testament="old" aria-selected="true">구약</button>'
    +     '<button type="button" class="scripture-quick-move-seg-btn" role="tab" data-qm-testament="new" aria-selected="false">신약</button>'
    +   '</div>'
    +   '<div class="scripture-quick-move-address" id="scriptureQuickMoveAddress">'
    +     '<div class="scripture-quick-move-addr-book-wrap" id="scriptureQuickMoveAddrBookWrap">'
    +       '<button type="button" class="scripture-quick-move-addr-btn" id="scriptureQuickMoveAddrBook" data-qm-stage="book" aria-haspopup="true" aria-expanded="false"><span class="scripture-quick-move-addr-text" id="scriptureQuickMoveAddrBookText">책 선택</span></button>'
    +     '</div>'
    +     '<span class="scripture-quick-move-addr-sep" aria-hidden="true">›</span>'
    +     '<button type="button" class="scripture-quick-move-addr-btn" id="scriptureQuickMoveAddrChapter" data-qm-stage="chapter"><span class="scripture-quick-move-addr-text" id="scriptureQuickMoveAddrChapterText">장 선택</span></button>'
    +     '<span class="scripture-quick-move-addr-sep" aria-hidden="true">›</span>'
    +     '<button type="button" class="scripture-quick-move-addr-btn" id="scriptureQuickMoveAddrVerse" data-qm-stage="verse"><span class="scripture-quick-move-addr-text" id="scriptureQuickMoveAddrVerseText">절 선택</span></button>'
    +   '</div>'
    +   '<div class="scripture-quick-move-tst-pop" id="scriptureQuickMoveTstPop" hidden role="group" aria-label="구약 신약 선택">'
    +     '<button type="button" class="scripture-quick-move-tst-pop-btn" data-qm-testament-pick="old">구약</button>'
    +     '<button type="button" class="scripture-quick-move-tst-pop-btn" data-qm-testament-pick="new">신약</button>'
    +   '</div>'
    +   '<div class="scripture-quick-move-body" id="scriptureQuickMoveBody"></div>'
    + '</div>';

  var staged = { testament: 'old', bookName: '', chapter: 0 };
  var stage = 'book';
  var lastFocusEl = null;
  var closeTimer = null;
  var bodyBound = false;
  var moveTag = null;
  var chromeBound = false;
  var moveBusy = false;

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function ensureOverlay(){
    var overlay = document.getElementById('scriptureQuickMoveOverlay');
    if (overlay) {
      if (!document.getElementById('scriptureQuickMoveTstPop') || !document.getElementById('scriptureQuickMoveAddrBookWrap')) {
        overlay.innerHTML = OVERLAY_HTML;
      }
      return overlay;
    }
    overlay = document.createElement('div');
    overlay.id = 'scriptureQuickMoveOverlay';
    overlay.className = 'scripture-quick-move-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'scriptureQuickMoveTitle');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    overlay.innerHTML = OVERLAY_HTML;
    document.body.appendChild(overlay);
    return overlay;
  }

  function langCode(){
    try { return typeof getReaderUiLangCode === 'function' ? getReaderUiLangCode() : 'ko'; }
    catch (e) { return 'ko'; }
  }
  function nativeUi(lang){
    try { return typeof isReaderNativeUiLang === 'function' ? isReaderNativeUiLang(lang) : (lang === 'ko'); }
    catch (e) { return lang === 'ko'; }
  }
  function labels(lang){
    if (lang === 'en') return {
      title: 'Quick Move', old: 'Old Testament', neo: 'New Testament',
      find: 'Find Bible', close: 'Close', open: 'Open quick move',
      bookSlot: 'Book', chapterSlot: 'Chapter', verseSlot: 'Verse',
      againBook: 'choose book again', againChapter: 'choose chapter again',
      openRange: 'open verse range picker',
      chapterAddr: function(ch){ return 'Ch. ' + ch; }
    };
    if (lang === 'ja') return {
      title: '聖書クイック移動', old: '旧約', neo: '新約',
      find: '聖書を探す', close: '閉じる', open: 'クイック移動を開く',
      bookSlot: '書を選択', chapterSlot: '章を選択', verseSlot: '節を選択',
      againBook: '書を選び直す', againChapter: '章を選び直す',
      openRange: '節の範囲を選択',
      chapterAddr: function(ch){ return ch + '章'; }
    };
    return {
      title: '성경 빠른 이동', old: '구약', neo: '신약',
      find: '성경 찾기', close: '닫기', open: '성경 빠른 이동 열기',
      bookSlot: '책 선택', chapterSlot: '장 선택', verseSlot: '절 선택',
      againBook: '책 다시 선택', againChapter: '장 다시 선택',
      openRange: '구절 범위 선택 열기',
      chapterAddr: function(ch, unit){ return ch + (unit || '장'); }
    };
  }
  function chapterUnit(bookName){
    try { return typeof getChapterUnit === 'function' ? getChapterUnit(bookName) : '장'; }
    catch (e) { return '장'; }
  }
  function bookDisplay(bookName, lang){
    if ((lang === 'en' || lang === 'ja') && window.GomnaTranslateBookName) {
      try { return window.GomnaTranslateBookName(bookName, lang) || bookName; } catch (e) { /* ignore */ }
    }
    return bookName;
  }
  function chapterDisplay(bookName, chapter, lang){
    var label = bookDisplay(bookName, lang);
    if (lang === 'en') return label + ' ' + chapter;
    if (lang === 'ja') return label + chapter + '章';
    return bookName + ' ' + chapter + chapterUnit(bookName);
  }
  function testamentData(testament){
    return testament === 'old' ? window.oldTestamentData : window.newTestamentData;
  }
  function catalogBooks(){
    var all = [];
    try { all = typeof getAllBooks === 'function' ? getAllBooks() : []; } catch (e) { all = []; }
    return all || [];
  }
  function booksOf(testament){
    return catalogBooks().filter(function(b){ return b && b.testament === testament; });
  }
  function chapterCountOf(bookName, testament){
    if (!bookName) return 0;
    try {
      var bd = typeof findBook === 'function' ? findBook(testamentData(testament), bookName) : null;
      if (bd && typeof getDisplayedChapterCount === 'function') return getDisplayedChapterCount(bd);
    } catch (e) { /* fall through to catalog */ }
    var all = catalogBooks();
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].name === bookName) return Number(all[i].chapters) || 0;
    }
    return 0;
  }
  function esc(v){ return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function testamentOf(bookName){
    var all = catalogBooks();
    if (!bookName) return '';
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].name === bookName) return all[i].testament;
    }
    return '';
  }

  function recentReadPlace(){
    var api = window.GOMNA_HOME_RESUME;
    var entry = null;
    if (!api || typeof api.getRead !== 'function') return null;
    try { entry = api.getRead(); } catch (e) { entry = null; }
    if (!entry || !entry.bookName || !entry.chapter) return null;
    return { bookName: String(entry.bookName), chapter: Number(entry.chapter), testament: '' };
  }

  function toolbarPlace(){
    var book = window.currentBook;
    if (book && book.name && window.currentChapter) {
      return { bookName: book.name, chapter: Number(window.currentChapter),
               testament: book.testament === 'new' ? 'new' : 'old' };
    }
    return recentReadPlace() || { bookName: '창세기', chapter: 1, testament: 'old' };
  }

  function syncLocationButton(){
    var btn = document.getElementById('verseToolbarLocationButton');
    var txt = document.getElementById('verseToolbarLocationText');
    if (!btn || !txt) return;
    var lang = langCode();
    var t = labels(nativeUi(lang) ? lang : 'ko');
    var label = t.find;
    var hasPlace = !!(window.currentBook && window.currentBook.name && window.currentChapter);
    if (hasPlace) label = chapterDisplay(window.currentBook.name, window.currentChapter, nativeUi(lang) ? lang : 'ko');
    else if (document.documentElement.classList.contains('reader-books-toolbar')) {
      var listPlace = toolbarPlace();
      label = chapterDisplay(listPlace.bookName, listPlace.chapter, nativeUi(lang) ? lang : 'ko');
    }
    txt.textContent = label;
    btn.setAttribute('aria-label', label + ' · ' + t.open);
    if (typeof markReaderOwnedTranslate === 'function') markReaderOwnedTranslate(btn, nativeUi(lang));
  }
  window.__gomnaSyncScriptureLocationButton = syncLocationButton;

  function syncSheetChrome(){
    var lang = nativeUi(langCode()) ? langCode() : 'ko';
    var t = labels(lang);
    var title = document.getElementById('scriptureQuickMoveTitle');
    var closeBtn = document.getElementById('scriptureQuickMoveClose');
    if (title) title.textContent = t.title;
    if (closeBtn) closeBtn.setAttribute('aria-label', t.close);
    document.querySelectorAll('#scriptureQuickMoveSeg .scripture-quick-move-seg-btn').forEach(function(btn){
      var tst = btn.getAttribute('data-qm-testament');
      btn.textContent = tst === 'old' ? t.old : t.neo;
      var on = tst === staged.testament;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    syncHomeTstPopChrome(t);
  }

  function chapterAddrLabel(t, lang){
    return lang === 'ko' ? t.chapterAddr(staged.chapter, chapterUnit(staged.bookName)) : t.chapterAddr(staged.chapter);
  }

  function renderAddress(lang, t){
    var slots = [
      { id: 'Book', stage: 'book', filled: !!staged.bookName,
        text: staged.bookName ? bookDisplay(staged.bookName, lang) : t.bookSlot },
      { id: 'Chapter', stage: 'chapter', filled: !!(staged.bookName && staged.chapter),
        text: (staged.bookName && staged.chapter) ? chapterAddrLabel(t, lang) : t.chapterSlot },
      { id: 'Verse', stage: 'verse', filled: !!(staged.bookName && staged.chapter), text: t.verseSlot }
    ];
    slots.forEach(function(slot){
      var btn = document.getElementById('scriptureQuickMoveAddr' + slot.id);
      var txt = document.getElementById('scriptureQuickMoveAddr' + slot.id + 'Text');
      if (!btn || !txt) return;
      txt.textContent = usesSharedPickerChrome()
        ? (slot.stage === 'chapter' ? t.chapterSlot : slot.stage === 'verse' ? t.verseSlot : t.bookSlot)
        : slot.text;
      btn.classList.toggle('is-current', stage === slot.stage);
      btn.classList.toggle('is-empty', !slot.filled && stage !== slot.stage);
      btn.setAttribute('aria-current', stage === slot.stage ? 'step' : 'false');
      var aria = slot.text;
      if (slot.stage === 'book' && staged.bookName) aria = slot.text + ', ' + t.againBook;
      else if (slot.stage === 'chapter' && slot.filled) aria = slot.text + ', ' + t.againChapter;
      else if (slot.stage === 'verse' && slot.filled) aria = slot.text + ', ' + t.openRange;
      btn.setAttribute('aria-label', aria);
      if (typeof markReaderOwnedTranslate === 'function') markReaderOwnedTranslate(btn, nativeUi(langCode()));
    });
  }

  function renderBookStage(lang, t){
    var html = (usesSharedPickerChrome() ? '' : '<p class="scripture-quick-move-stage-title">' + esc(t.bookSlot) + '</p>')
      + '<div class="scripture-quick-move-books">';
    booksOf(staged.testament).forEach(function(b){
      var sel = b.name === staged.bookName ? ' is-selected' : '';
      html += '<button type="button" class="scripture-quick-move-item' + sel + '" data-qm-book="' + esc(b.name) + '"'
        + (sel ? ' aria-current="true"' : '') + '>' + esc(bookDisplay(b.name, lang)) + '</button>';
    });
    return html + '</div>';
  }

  function renderChapterStage(lang, t){
    var chCount = chapterCountOf(staged.bookName, staged.testament);
    var html = (usesSharedPickerChrome() ? '' : '<p class="scripture-quick-move-stage-title">' + esc(t.chapterSlot) + '</p>')
      + '<div class="scripture-quick-move-nums">';
    for (var c = 1; c <= chCount; c++) {
      var sel = c === staged.chapter ? ' is-selected' : '';
      html += '<button type="button" class="scripture-quick-move-item' + sel + '" data-qm-chapter="' + c + '"'
        + (sel ? ' aria-current="true"' : '') + '>' + c + '</button>';
    }
    return html + '</div>';
  }

  var VERSE_COUNT_MAP = {"창세기":[31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],"출애굽기":[22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],"레위기":[17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],"민수기":[54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],"신명기":[46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],"여호수아":[18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],"사사기":[36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],"룻기":[22,23,18,22],"사무엘상":[28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],"사무엘하":[27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],"열왕기상":[53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],"열왕기하":[18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],"역대상":[54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],"역대하":[17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],"에스라":[11,70,13,24,17,22,28,36,15,44],"느헤미야":[11,20,32,23,19,19,73,18,38,39,36,47,31],"에스더":[22,23,15,17,14,14,10,17,32,3],"욥기":[22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],"시편":[6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,0,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],"잠언":[33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31],"전도서":[18,26,22,16,20,12,29,17,18,20,10,14],"아가":[17,17,11,16,16,13,13,14],"이사야":[31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],"예레미야":[19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],"예레미야애가":[22,22,66,22,22],"에스겔":[28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],"다니엘":[21,49,30,37,31,28,28,27,27,21,45,13],"호세아":[11,23,5,19,15,11,16,14,17,15,12,14,16,9],"요엘":[20,32,21],"아모스":[15,16,15,13,27,14,17,14,15],"오바댜":[21],"요나":[17,10,10,11],"미가":[16,13,12,13,15,16,20],"나훔":[15,13,19],"하박국":[17,20,19],"스바냐":[18,15,20],"학개":[15,23],"스가랴":[21,13,10,14,11,15,14,23,17,12,17,14,9,21],"말라기":[14,17,18,6],"마태복음":[25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,36,30,34,46,46,39,51,46,75,66,20],"마가복음":[45,28,35,41,43,56,37,38,50,52,34,44,37,72,48,20],"누가복음":[80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,57,53],"요한복음":[51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],"사도행전":[26,47,26,37,42,15,60,40,43,48,30,25,52,28,43,40,34,28,41,38,40,30,35,27,27,32,44,32],"로마서":[32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,28],"고린도전서":[31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],"고린도후서":[24,17,18,18,21,18,16,24,15,18,33,21,13],"갈라디아서":[24,21,29,31,26,18],"에베소서":[23,22,21,32,33,24],"빌립보서":[30,30,21,23],"골로새서":[29,23,25,18],"데살로니가전서":[10,20,13,18,28],"데살로니가후서":[12,17,18],"디모데전서":[20,15,16,16,25,21],"디모데후서":[18,26,17,22],"디도서":[16,15,15],"빌레몬서":[25],"히브리서":[14,18,19,16,14,20,28,13,28,39,40,29,25],"야고보서":[27,26,18,17,20],"베드로전서":[25,25,22,19,14],"베드로후서":[21,22,18],"요한일서":[10,29,24,21,21],"요한이서":[13],"요한삼서":[15],"유다서":[25],"요한계시록":[20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21]};
  var QM_RANGE_START_HINT = '시작 절을 선택하세요';
  var QM_RANGE_END_HINT = '끝 절을 선택하세요';
  var qmRange = { max: 0, start: 0, end: 0 };

  function verseCountOf(bookName, chapter, testament){
    if (!bookName || !chapter) return 0;
    try {
      if (typeof currentVerseCount === 'number' && currentVerseCount > 0
        && window.currentBook && window.currentBook.name === bookName
        && Number(window.currentChapter) === Number(chapter)) {
        return currentVerseCount;
      }
    } catch (eCur) { /* ignore */ }
    try {
      var bd = typeof findBook === 'function' ? findBook(testamentData(testament), bookName) : null;
      if (bd && bd.chapters) {
        for (var i = 0; i < bd.chapters.length; i++) {
          if (bd.chapters[i] && Number(bd.chapters[i].chapter) === Number(chapter) && bd.chapters[i].verses) {
            return bd.chapters[i].verses.length;
          }
        }
      }
    } catch (eBook) { /* use catalog map */ }
    var row = VERSE_COUNT_MAP[bookName];
    if (!row) return 0;
    return Number(row[chapter - 1]) || 0;
  }

  function qmRangeRoot(from){
    if (from && from.querySelector) return from;
    return document.getElementById('scriptureQuickMoveBody');
  }
  function qmRangeEl(id, from){
    var root = qmRangeRoot(from);
    return root ? root.querySelector('#' + id) : null;
  }

  function qmRangeClass(v){
    var s = qmRange.start, e = qmRange.end;
    if (s <= 0) return '';
    if (e > 0 && e >= s) {
      if (v < s || v > e) return '';
      return (v === s || v === e) ? ' verse-cell--range-end' : ' verse-cell--range-mid';
    }
    return (v === s) ? ' verse-cell--range-end' : '';
  }

  function qmRangeFillGrids(root){
    var startHost = qmRangeEl('verseRangeStartGrid', root);
    var endHost = qmRangeEl('verseRangeEndGrid', root);
    if (!startHost || !endHost) return false;
    var startHtml = '';
    var endHtml = '';
    var v;
    for (v = 1; v <= qmRange.max; v++) {
      startHtml += '<button type="button" class="verse-cell' + qmRangeClass(v) + '" data-v="' + v + '">' + v + '</button>';
    }
    for (v = 1; v <= qmRange.max; v++) {
      var isDis = qmRange.start <= 0 || v < qmRange.start;
      var dis = isDis ? ' disabled' : '';
      var rc = (!isDis && qmRange.end > 0) ? qmRangeClass(v) : '';
      var disAttr = isDis ? ' disabled' : '';
      endHtml += '<div class="verse-range-end-cell-wrap" data-v="' + v + '"><button type="button" class="verse-cell' + dis + rc + '"' + disAttr + ' data-v="' + v + '">' + v + '</button></div>';
    }
    startHost.innerHTML = startHtml;
    endHost.innerHTML = endHtml;
    return startHost.querySelectorAll('.verse-cell').length === qmRange.max
      && endHost.querySelectorAll('.verse-cell').length === qmRange.max;
  }

  function qmRangeSetHint(el, text, visible){
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-hint-hidden', !visible);
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function qmRangeSyncHints(root, startVisible, endVisible){
    qmRangeSetHint(qmRangeEl('verseRangeStartHint', root), QM_RANGE_START_HINT, !!startVisible);
    qmRangeSetHint(qmRangeEl('verseRangeEndHint', root), QM_RANGE_END_HINT, !!endVisible);
  }

  function qmRangeSyncClasses(root){
    var startHost = qmRangeEl('verseRangeStartGrid', root);
    var endHost = qmRangeEl('verseRangeEndGrid', root);
    var cells, i, cell, v, rc, isEnd, isMid, isDis;
    if (startHost) {
      cells = startHost.querySelectorAll('.verse-cell');
      for (i = 0; i < cells.length; i++) {
        cell = cells[i];
        v = parseInt(cell.getAttribute('data-v'), 10);
        rc = qmRangeClass(v);
        isEnd = rc.indexOf('range-end') !== -1;
        isMid = rc.indexOf('range-mid') !== -1;
        cell.classList.toggle('verse-cell--range-end', isEnd);
        cell.classList.toggle('verse-cell--range-mid', isMid);
        cell.setAttribute('aria-selected', (isEnd || isMid) ? 'true' : 'false');
      }
    }
    if (endHost) {
      cells = endHost.querySelectorAll('.verse-cell');
      for (i = 0; i < cells.length; i++) {
        cell = cells[i];
        v = parseInt(cell.getAttribute('data-v'), 10);
        isDis = qmRange.start <= 0 || v < qmRange.start;
        cell.disabled = isDis;
        cell.classList.toggle('disabled', isDis);
        rc = (!isDis && qmRange.end > 0) ? qmRangeClass(v) : '';
        isEnd = rc.indexOf('range-end') !== -1;
        isMid = rc.indexOf('range-mid') !== -1;
        cell.classList.toggle('verse-cell--range-end', isEnd);
        cell.classList.toggle('verse-cell--range-mid', isMid);
        cell.setAttribute('aria-selected', (isEnd || isMid) ? 'true' : 'false');
      }
    }
  }

  function parkRangeMoveTag(button, root){
    var area = qmRangeEl('verseRangeEndArea', root);
    if (!button || !area || button.parentNode === area) return;
    area.appendChild(button);
  }

  function qmRangeSyncMove(root){
    var button = qmRangeEl('rangeEndMoveAction', root);
    var endArea = qmRangeEl('verseRangeEndArea', root);
    if (!button || !endArea) return;
    var ready = qmRange.start > 0 && qmRange.end > 0 && qmRange.end >= qmRange.start;
    if (!ready) {
      button.hidden = true;
      button.disabled = true;
      button.setAttribute('aria-hidden', 'true');
      parkRangeMoveTag(button, root);
      return;
    }
    var wrapper = (qmRangeRoot(root) || document).querySelector('#verseRangeEndGrid .verse-range-end-cell-wrap[data-v="' + qmRange.end + '"]');
    var grid = wrapper && wrapper.parentNode;
    if (!wrapper || !grid) return;
    button.hidden = false;
    button.disabled = false;
    button.setAttribute('aria-hidden', 'false');
    placeMoveTagBelowSelected(grid, wrapper, button);
  }

  function isHomeDocument(){
    try {
      if (document.body && document.body.getAttribute('data-gomna-page') === 'home') return true;
    } catch (eHome) {}
    return typeof goToVerse !== 'function';
  }

  function usesSharedPickerChrome(){
    try {
      var page = document.body && document.body.getAttribute('data-gomna-page');
      if (page === 'home' || page === 'reader') return true;
    } catch (eChrome) {}
    return typeof goToVerse !== 'function';
  }

  function homeTstPopEl(){
    return document.getElementById('scriptureQuickMoveTstPop');
  }

  function isHomeTstPopOpen(){
    var pop = homeTstPopEl();
    return !!(pop && !pop.hidden && pop.classList.contains('is-open'));
  }

  function syncHomeTstPopChrome(t){
    var pop = homeTstPopEl();
    if (!pop) return;
    pop.querySelectorAll('[data-qm-testament-pick]').forEach(function(btn){
      var tst = btn.getAttribute('data-qm-testament-pick');
      btn.textContent = tst === 'old' ? t.old : t.neo;
      btn.classList.toggle('is-active', tst === staged.testament);
    });
  }

  function setHomeTstPopSheetOpen(on){
    var sheet = document.getElementById('scriptureQuickMoveSheet');
    if (sheet) sheet.classList.toggle('is-home-tst-pop-open', !!on);
  }

  function closeHomeTstPop(){
    var pop = homeTstPopEl();
    if (!pop) return;
    pop.hidden = true;
    pop.classList.remove('is-open');
    setHomeTstPopSheetOpen(false);
    var bookBtn = document.getElementById('scriptureQuickMoveAddrBook');
    if (bookBtn) bookBtn.setAttribute('aria-expanded', 'false');
  }

  function openHomeTstPop(){
    if (!usesSharedPickerChrome()) return;
    var pop = homeTstPopEl();
    var bookBtn = document.getElementById('scriptureQuickMoveAddrBook');
    if (!pop) return;
    var lang = nativeUi(langCode()) ? langCode() : 'ko';
    syncHomeTstPopChrome(labels(lang));
    pop.hidden = false;
    pop.classList.add('is-open');
    setHomeTstPopSheetOpen(true);
    if (bookBtn) bookBtn.setAttribute('aria-expanded', 'true');
  }

  function hideHomeTestamentRow(){
    var seg = document.getElementById('scriptureQuickMoveSeg');
    if (!seg) return;
    seg.hidden = usesSharedPickerChrome();
  }

  function syncHomeTstPopForStage(){
    if (usesSharedPickerChrome() && stage === 'book') openHomeTstPop();
    else closeHomeTstPop();
  }

  function unlockMoveBusy(){
    moveBusy = false;
    var moveTagEl = qmRangeEl('rangeEndMoveAction');
    if (moveTagEl && !moveTagEl.hidden && qmRange.start > 0 && qmRange.end >= qmRange.start) {
      moveTagEl.disabled = false;
    }
  }

  function keepHomeRangeVisible(){
    var overlay = document.getElementById('scriptureQuickMoveOverlay');
    if (!overlay) return;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    overlay.hidden = false;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('scripture-quick-move-lock');
  }

  function verseBodyReady(bookName, chapter){
    if (!window.currentBook || window.currentBook.name !== bookName) return false;
    if (Number(window.currentChapter) !== Number(chapter)) return false;
    return !!document.querySelector('#verseView.active #verseList .verse-item');
  }

  function qmRangeConfirmMove(){
    if (moveBusy) return;
    if (qmRange.start <= 0 || qmRange.end <= 0 || qmRange.end < qmRange.start) return;
    var bookName = staged.bookName;
    var chapter = staged.chapter;
    var testament = staged.testament;
    var start = qmRange.start;
    var end = qmRange.end;
    moveBusy = true;
    var moveTagEl = qmRangeEl('rangeEndMoveAction');
    if (moveTagEl) moveTagEl.disabled = true;
    if (typeof goToVerse === 'function') {
      try {
        goToVerse(bookName, chapter, start, testament);
        if (typeof resetVerseViewScroll === 'function') resetVerseViewScroll();
        if (typeof applyVerseRangeSelection === 'function') applyVerseRangeSelection(start, end);
      } catch (eMove) {
        unlockMoveBusy();
        return;
      }
      if (!verseBodyReady(bookName, chapter)) {
        unlockMoveBusy();
        return;
      }
      close();
      moveBusy = false;
      return;
    }
    keepHomeRangeVisible();
    window.location.href = readerHref(bookName, chapter, start);
  }

  function bindQmRangeEvents(root){
    var startHost = qmRangeEl('verseRangeStartGrid', root);
    var endHost = qmRangeEl('verseRangeEndGrid', root);
    var moveButton = qmRangeEl('rangeEndMoveAction', root);
    var backBtn = root.querySelector('.verse-range-back-to-text');
    if (startHost && startHost.getAttribute('data-range-bound') !== '1') {
      startHost.setAttribute('data-range-bound', '1');
      startHost.addEventListener('click', function(ev){
        var t = ev.target && ev.target.closest ? ev.target.closest('.verse-cell') : null;
        if (!t || t.disabled) return;
        var v = parseInt(t.getAttribute('data-v'), 10);
        if (v === qmRange.start) return;
        qmRangeSyncHints(null, false, true);
        qmRange.start = v;
        qmRange.end = 0;
        qmRangeSyncClasses(null);
        qmRangeSyncMove(null);
      });
    }
    if (endHost && endHost.getAttribute('data-range-bound') !== '1') {
      endHost.setAttribute('data-range-bound', '1');
      endHost.addEventListener('click', function(ev){
        var t = ev.target && ev.target.closest ? ev.target.closest('.verse-cell') : null;
        if (!t || t.disabled) return;
        var v = parseInt(t.getAttribute('data-v'), 10);
        if (qmRange.start <= 0 || v < qmRange.start) return;
        if (v === qmRange.end) return;
        qmRangeSyncHints(null, false, false);
        qmRange.end = v;
        qmRangeSyncClasses(null);
        qmRangeSyncMove(null);
      });
    }
    if (moveButton && moveButton.getAttribute('data-move-bound') !== '1') {
      moveButton.setAttribute('data-move-bound', '1');
      var onMoveTap = function(ev){
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        }
        qmRangeConfirmMove();
      };
      moveButton.addEventListener('click', onMoveTap);
      moveButton.addEventListener('touchend', onMoveTap, { passive: false });
    }
    if (backBtn && backBtn.getAttribute('data-qm-back-bound') !== '1') {
      backBtn.setAttribute('data-qm-back-bound', '1');
      backBtn.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        setStage('chapter');
      });
    }
  }

  function buildQmRangeFragment(){
    var moveText = typeof VERSE_MOVE_ACTION_TEXT === 'string' ? VERSE_MOVE_ACTION_TEXT : '이동 →';
    var hold = document.createElement('div');
    hold.innerHTML = ''
      + '<div class="reader-verse-range-actions">'
      +   '<div class="verse-range-split">'
      +     '<div class="verse-range-column">'
      +       '<p class="verse-range-column-label">시작 절</p>'
      +       '<p class="verse-range-column-hint" id="verseRangeStartHint">시작 절을 선택하세요</p>'
      +       '<div class="verse-range-column-scroll">'
      +         '<div class="verse-grid" id="verseRangeStartGrid"></div>'
      +       '</div>'
      +     '</div>'
      +     '<div class="verse-range-column" id="verseRangeEndArea">'
      +       '<p class="verse-range-column-label">끝 절</p>'
      +       '<p class="verse-range-column-hint" id="verseRangeEndHint">끝 절을 선택하세요</p>'
      +       '<div class="verse-range-column-scroll">'
      +         '<div class="verse-grid" id="verseRangeEndGrid"></div>'
      +       '</div>'
      +       '<button type="button" id="rangeEndMoveAction" class="verse-range-move-action" data-range-move-action hidden disabled aria-hidden="true">' + moveText + '</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="verse-range-back-wrap">'
      +     '<button type="button" class="verse-range-back-to-text" aria-label="← 이전" title="← 이전">← 이전</button>'
      +   '</div>'
      + '</div>';
    if (!qmRangeFillGrids(hold)) return null;
    qmRangeSyncHints(hold, true, false);
    bindQmRangeEvents(hold);
    var startHint = qmRangeEl('verseRangeStartHint', hold);
    var endHint = qmRangeEl('verseRangeEndHint', hold);
    var startN = hold.querySelectorAll('#verseRangeStartGrid .verse-cell').length;
    var endN = hold.querySelectorAll('#verseRangeEndGrid .verse-cell').length;
    if (!startHint || startHint.textContent !== QM_RANGE_START_HINT) return null;
    if (!endHint || endHint.textContent !== QM_RANGE_END_HINT) return null;
    if (startN !== qmRange.max || endN !== qmRange.max || startN < 1) return null;
    var frag = document.createDocumentFragment();
    while (hold.firstChild) frag.appendChild(hold.firstChild);
    return frag;
  }

  function swapQuickMoveBody(frag){
    var body = document.getElementById('scriptureQuickMoveBody');
    if (!body || !frag) return null;
    if (typeof body.replaceChildren === 'function') {
      body.replaceChildren(frag);
      return body;
    }
    var wrap = document.createElement('div');
    wrap.setAttribute('data-qm-swap', '1');
    wrap.appendChild(frag);
    body.appendChild(wrap);
    var n = body.firstChild;
    while (n && n !== wrap) {
      var rm = n;
      n = n.nextSibling;
      body.removeChild(rm);
    }
    while (wrap.firstChild) body.insertBefore(wrap.firstChild, wrap);
    body.removeChild(wrap);
    return body;
  }

  function showStagedVerseRange(){
    if (!staged.bookName || !staged.chapter) return;
    var max = verseCountOf(staged.bookName, staged.chapter, staged.testament);
    if (max < 1) return;
    qmRange.max = max;
    qmRange.start = 0;
    qmRange.end = 0;
    var frag = buildQmRangeFragment();
    if (!frag) return;
    var lang = nativeUi(langCode()) ? langCode() : 'ko';
    var t = labels(lang);
    stage = 'verse';
    syncSheetChrome();
    renderAddress(lang, t);
    hideHomeTestamentRow();
    syncHomeTstPopForStage();
    var body = swapQuickMoveBody(frag);
    if (body) body.scrollTop = 0;
    if (body && !bodyBound) {
      body.addEventListener('click', onBodyClick);
      bodyBound = true;
    }
  }

  function placeMoveTagBelowSelected(grid, selected, tag){
    if (!grid || !selected || !tag) return;
    tag.style.position = '';
    tag.style.top = '';
    tag.style.left = '';
    tag.style.right = '';
    tag.style.bottom = '';
    tag.style.transform = '';
    var rowLast = selected;
    var next = selected.nextElementSibling;
    while (next && next !== tag && next.offsetTop === selected.offsetTop) {
      rowLast = next;
      next = next.nextElementSibling;
    }
    if (rowLast.nextSibling !== tag) grid.insertBefore(tag, rowLast.nextSibling);
    var gridRect = grid.getBoundingClientRect();
    var selRect = selected.getBoundingClientRect();
    var tagW = tag.offsetWidth;
    var max = Math.max(0, gridRect.width - tagW);
    var left = selRect.left - gridRect.left + (selRect.width - tagW) / 2;
    tag.style.marginLeft = Math.round(Math.min(Math.max(left, 0), max)) + 'px';
  }

  function ensureMoveTag(){
    if (moveTag) return moveTag;
    moveTag = document.createElement('button');
    moveTag.type = 'button';
    moveTag.id = 'quickMoveChapterMoveAction';
    moveTag.className = 'verse-range-move-action';
    moveTag.textContent = typeof VERSE_MOVE_ACTION_TEXT === 'string' ? VERSE_MOVE_ACTION_TEXT : '이동 →';
    moveTag.setAttribute('data-move-bound', '1');
    moveTag.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      goToStagedChapterStart();
    });
    return moveTag;
  }

  function syncMoveTag(){
    var grid = document.querySelector('#scriptureQuickMoveBody .scripture-quick-move-nums');
    var selected = grid ? grid.querySelector('.scripture-quick-move-item.is-selected') : null;
    if (!grid || !selected) {
      if (moveTag && moveTag.parentNode) moveTag.parentNode.removeChild(moveTag);
      return;
    }
    placeMoveTagBelowSelected(grid, selected, ensureMoveTag());
  }

  function revealMoveTag(){
    var scroller = document.getElementById('scriptureQuickMoveBody');
    if (!scroller || !moveTag || !moveTag.parentNode) return;
    var over = moveTag.getBoundingClientRect().bottom - (scroller.getBoundingClientRect().bottom - 4);
    if (over > 0) scroller.scrollTop += over;
  }

  function readerHref(bookName, chapter, verse){
    return 'reader.html?book=' + encodeURIComponent(bookName)
      + '&chapter=' + encodeURIComponent(chapter)
      + '&verse=' + encodeURIComponent(verse || 1);
  }

  function goToSelectedPlace(bookName, chapter, verse, testament){
    if (typeof goToVerse === 'function') {
      goToVerse(bookName, chapter, verse || 1, testament);
      if (typeof resetVerseViewScroll === 'function') resetVerseViewScroll();
      return;
    }
    window.location.href = readerHref(bookName, chapter, verse || 1);
  }

  function goToStagedChapterStart(){
    if (!staged.bookName || !staged.chapter) return;
    var bookName = staged.bookName;
    var chapter = staged.chapter;
    var testament = staged.testament;
    close();
    goToSelectedPlace(bookName, chapter, 1, testament);
  }

  function render(){
    var body = document.getElementById('scriptureQuickMoveBody');
    if (!body) return;
    if (stage === 'verse') {
      showStagedVerseRange();
      return;
    }
    var lang = nativeUi(langCode()) ? langCode() : 'ko';
    var t = labels(lang);
    if (!staged.bookName) stage = 'book';
    syncSheetChrome();
    renderAddress(lang, t);
    hideHomeTestamentRow();
    syncHomeTstPopForStage();
    if (stage === 'chapter') body.innerHTML = renderChapterStage(lang, t);
    else body.innerHTML = renderBookStage(lang, t);
    syncMoveTag();
    if (!bodyBound) {
      body.addEventListener('click', onBodyClick);
      bodyBound = true;
    }
  }

  function setStage(next){
    stage = next;
    render();
    var body = document.getElementById('scriptureQuickMoveBody');
    if (body) body.scrollTop = 0;
  }

  function onBodyClick(e){
    var target = e.target && e.target.closest ? e.target.closest('[data-qm-book],[data-qm-chapter]') : null;
    if (!target) return;
    var bookName = target.getAttribute('data-qm-book');
    if (bookName) {
      closeHomeTstPop();
      if (bookName !== staged.bookName) staged.chapter = 0;
      staged.bookName = bookName;
      setStage('chapter');
      return;
    }
    var ch = target.getAttribute('data-qm-chapter');
    if (ch) {
      var body = document.getElementById('scriptureQuickMoveBody');
      var keep = body ? body.scrollTop : 0;
      staged.chapter = parseInt(ch, 10) || 0;
      render();
      if (body) body.scrollTop = keep;
      revealMoveTag();
    }
  }

  function onAddressClick(e){
    var btn = e.target && e.target.closest ? e.target.closest('[data-qm-stage]') : null;
    if (!btn) return;
    var want = btn.getAttribute('data-qm-stage');
    if (want === 'verse') {
      if (staged.bookName && staged.chapter) { closeHomeTstPop(); openStagedVerseRange(); return; }
      want = staged.bookName ? 'chapter' : 'book';
    } else if (want === 'chapter' && !staged.bookName) {
      want = 'book';
    }
    if (usesSharedPickerChrome() && want === 'book') {
      setStage('book');
      return;
    }
    closeHomeTstPop();
    setStage(want);
  }

  function openStagedVerseRange(){
    showStagedVerseRange();
  }

  function goToToolbarPlace(){
    var place = toolbarPlace();
    var vv = document.getElementById('verseView');
    var tst;
    if (typeof goToVerse !== 'function') return;
    if (window.currentBook && window.currentBook.name === place.bookName
      && Number(window.currentChapter) === place.chapter
      && vv && vv.classList.contains('active')) return;
    tst = place.testament || testamentOf(place.bookName);
    if (!tst) { place = { bookName: '창세기', chapter: 1 }; tst = testamentOf('창세기') || 'old'; }
    goToVerse(place.bookName, place.chapter, 1, tst);
    if (typeof resetVerseViewScroll === 'function') resetVerseViewScroll();
  }

  function hasRenderedVerseContext(){
    return !!(window.currentBook && window.currentChapter
      && document.querySelector('#verseView #verseList .verse-item'));
  }

  function onBooksToolbarClick(e){
    if (!document.documentElement.classList.contains('reader-books-toolbar')) return;
    var btn = e.target && e.target.closest
      ? e.target.closest('#opt4VerseListen,#opt4VerseCommentary,#opt4VerseMore')
      : null;
    if (!btn) return;
    if (btn.id === 'opt4VerseMore' && hasRenderedVerseContext()) return;
    goToToolbarPlace();
  }

  function focusables(){
    var sheet = document.getElementById('scriptureQuickMoveSheet');
    if (!sheet) return [];
    return Array.prototype.filter.call(
      sheet.querySelectorAll('button:not([disabled]):not([hidden])'),
      function(el){ return el.offsetParent !== null || el === document.activeElement; }
    );
  }

  function onKeydown(e){
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      if (usesSharedPickerChrome() && isHomeTstPopOpen() && stage !== 'book') {
        closeHomeTstPop();
        return;
      }
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    var list = focusables();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    var sheet = document.getElementById('scriptureQuickMoveSheet');
    if (e.shiftKey && (active === first || !sheet || !sheet.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function isOpen(){
    var overlay = document.getElementById('scriptureQuickMoveOverlay');
    return !!(overlay && overlay.classList.contains('is-open'));
  }

  function clearStagedPick(){
    staged.bookName = '';
    staged.chapter = 0;
    qmRange.max = 0;
    qmRange.start = 0;
    qmRange.end = 0;
    if (moveTag && moveTag.parentNode) moveTag.parentNode.removeChild(moveTag);
  }

  function pickerTestament(opts){
    if (opts.testament === 'old' || opts.testament === 'new') return opts.testament;
    var book = window.currentBook;
    if (book && book.name) return book.testament === 'new' ? 'new' : 'old';
    if (typeof currentTab === 'string' && currentTab === 'new') return 'new';
    return 'old';
  }

  function open(opts){
    if (!opts || typeof opts !== 'object' || typeof opts.preventDefault === 'function') opts = {};
    var overlay = ensureOverlay();
    bindChrome();
    if (!overlay || isOpen()) return;
    if (typeof closeUnifiedBookChapterModal === 'function') closeUnifiedBookChapterModal();
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    lastFocusEl = document.activeElement;
    closeHomeTstPop();
    staged.testament = pickerTestament(opts);
    clearStagedPick();
    stage = 'book';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    render();
    document.documentElement.classList.add('scripture-quick-move-lock');
    var locBtn = document.getElementById('verseReadTitleBtn');
    if (locBtn) locBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKeydown, true);
    var body = document.getElementById('scriptureQuickMoveBody');
    if (body) body.scrollTop = 0;
    requestAnimationFrame(function(){
      overlay.classList.add('is-open');
      var sheet = document.getElementById('scriptureQuickMoveSheet');
      if (sheet) sheet.focus({ preventScroll: true });
      if (body) body.scrollTop = 0;
    });
  }

  function close(){
    if (moveBusy && isHomeDocument()) return;
    var overlay = document.getElementById('scriptureQuickMoveOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    closeHomeTstPop();
    clearStagedPick();
    stage = 'book';
    document.documentElement.classList.remove('scripture-quick-move-lock');
    document.removeEventListener('keydown', onKeydown, true);
    var locBtn = document.getElementById('verseReadTitleBtn');
    if (locBtn) locBtn.setAttribute('aria-expanded', 'false');
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function(){
      closeTimer = null;
      if (!overlay.classList.contains('is-open')) overlay.hidden = true;
    }, 280);
    if (lastFocusEl && document.contains(lastFocusEl) && lastFocusEl.offsetParent !== null) {
      try { lastFocusEl.focus(); } catch (e) { /* ignore */ }
    }
    lastFocusEl = null;
  }

  function bindChrome(){
    if (chromeBound) return;
    var overlay = ensureOverlay();
    if (!overlay) return;
    chromeBound = true;
    overlay.addEventListener('click', function(e){
      if (moveBusy) return;
      if (e.target === overlay) close();
      else if (usesSharedPickerChrome() && isHomeTstPopOpen() && stage !== 'book') {
        if (e.target.closest && e.target.closest('#scriptureQuickMoveTstPop')) return;
        if (e.target.closest && e.target.closest('#scriptureQuickMoveAddrBook')) return;
        closeHomeTstPop();
      }
    });
    var closeBtn = document.getElementById('scriptureQuickMoveClose');
    if (closeBtn) closeBtn.addEventListener('click', close);
    var seg = document.getElementById('scriptureQuickMoveSeg');
    if (seg) {
      seg.addEventListener('click', function(e){
        var btn = e.target && e.target.closest ? e.target.closest('[data-qm-testament]') : null;
        if (!btn) return;
        var tst = btn.getAttribute('data-qm-testament');
        if (tst === staged.testament) return;
        staged.testament = tst;
        staged.bookName = '';
        staged.chapter = 0;
        setStage('book');
      });
    }
    var pop = homeTstPopEl();
    if (pop) {
      pop.addEventListener('click', function(e){
        var pick = e.target && e.target.closest ? e.target.closest('[data-qm-testament-pick]') : null;
        if (!pick) return;
        e.preventDefault();
        e.stopPropagation();
        var tst = pick.getAttribute('data-qm-testament-pick');
        var hiddenBtn = document.querySelector('#scriptureQuickMoveSeg [data-qm-testament="' + tst + '"]');
        if (hiddenBtn && tst !== staged.testament) hiddenBtn.click();
      });
    }
    var address = document.getElementById('scriptureQuickMoveAddress');
    if (address) address.addEventListener('click', onAddressClick);
    window.addEventListener('resize', function(){
      if (!isOpen()) return;
      if (stage === 'verse') qmRangeSyncMove(null);
      else if (stage === 'chapter') syncMoveTag();
    });
    var bottomBar = document.getElementById('opt4BottomBar');
    if (bottomBar) bottomBar.addEventListener('click', onBooksToolbarClick, true);
    window.addEventListener('pageshow', unlockMoveBusy);
    syncLocationButton();
  }

  onReady(bindChrome);

  window.openScriptureQuickMove = open;
  window.closeScriptureQuickMove = close;
})();
