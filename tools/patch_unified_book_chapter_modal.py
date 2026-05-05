#!/usr/bin/env python3
"""Unified book+chapter picker modal from verse header title (option-4-hybrid)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"
MARKER = "unifiedBookChapterModal"

ANCHOR_HTML = """      <button type="button" class="verse-read-more-item" onclick="closeVerseReadMoreMenu();openSettings();">글자 크기 설정</button>
    </div>
  </div>
  <main class="content">"""

INSERT_HTML = """      <button type="button" class="verse-read-more-item" onclick="closeVerseReadMoreMenu();openSettings();">글자 크기 설정</button>
    </div>
  </div>
  <div id="unifiedBookChapterModal" class="unified-bc-overlay" aria-hidden="true" role="dialog" aria-modal="true" onclick="if(event.target===this)closeUnifiedBookChapterModal()">
    <div class="unified-bc-box" onclick="event.stopPropagation()">
      <div class="unified-bc-head">
        <button type="button" class="unified-bc-head-btn" onclick="closeUnifiedBookChapterModal()" aria-label="닫기">✕</button>
        <span class="unified-bc-head-title" id="unifiedBcHeadTitle"></span>
        <span class="unified-bc-head-spacer" aria-hidden="true"></span>
      </div>
      <div class="unified-bc-body" id="unifiedBcBody"></div>
    </div>
  </div>
  <main class="content">"""

ANCHOR_CSS = """/* verse-read-header */"""

INSERT_CSS = r""".unified-bc-overlay{display:none;position:fixed;inset:0;z-index:225;background:rgba(0,0,0,.45);align-items:flex-end;justify-content:center;box-sizing:border-box}
.unified-bc-overlay.active{display:flex}
.unified-bc-box{width:100%;max-width:480px;max-height:92vh;background:#faf6ed;border-radius:16px 16px 0 0;display:flex;flex-direction:column;overflow:hidden;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.32,0.72,0,1);box-shadow:0 -8px 32px rgba(0,0,0,.12);font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif}
.unified-bc-overlay.active .unified-bc-box{transform:translateY(0)}
.unified-bc-head{display:flex;align-items:center;justify-content:space-between;padding:12px 10px;border-bottom:0.5px solid rgba(180,140,90,.35);flex-shrink:0;background:#faf6ed}
.unified-bc-head-btn{width:32px;height:32px;min-width:32px;padding:0;border:none;background:transparent;font-size:18px;color:#3d2818;cursor:pointer;font-family:inherit;line-height:1;display:flex;align-items:center;justify-content:center}
.unified-bc-head-title{flex:1;min-width:0;text-align:center;font-size:15px;font-weight:600;color:#3d2818;padding:0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.unified-bc-head-spacer{width:32px;min-width:32px;flex-shrink:0}
.unified-bc-body{overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0;padding:12px 14px calc(16px + env(safe-area-inset-bottom,0))}
.unified-bc-cat-btn{width:100%;padding:14px;font-size:14px;font-weight:600;border-radius:12px;border:1px solid #c89849;background:#fff5e0;color:#8b5e2c;cursor:pointer;font-family:inherit;margin-bottom:12px;-webkit-tap-highlight-color:transparent}
.unified-bc-cat-btn:active{opacity:0.9}
.unified-bc-ttabs{display:flex;gap:8px;margin-bottom:12px}
.unified-bc-ttab{flex:1;padding:12px 8px;border-radius:12px;border:1px solid #E8E0D8;background:#fff;font-size:13px;font-weight:600;color:#888;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
.unified-bc-ttab.active{background:#c89849;color:#fff;border-color:#c89849}
.unified-bc-sec{font-size:13px;font-weight:700;color:#5a3818;margin:14px 0 8px}
.unified-bc-sec:first-of-type{margin-top:4px}
.unified-bc-book-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px}
.unified-bc-book{min-height:44px;padding:14px 10px;border-radius:10px;border:0.5px solid rgba(180,140,90,.35);background:#fff;font-size:13px;font-weight:600;color:#3d2818;cursor:pointer;font-family:inherit;text-align:center;-webkit-tap-highlight-color:transparent}
.unified-bc-book:active{transform:scale(0.98)}
.unified-bc-book--sel{background:#c89849;color:#fff;border-color:#a87a35}
.unified-bc-back-books{width:100%;padding:12px;margin-bottom:10px;border-radius:10px;border:1px solid #E8E0D8;background:#fff;font-size:14px;font-weight:600;color:#3d2818;cursor:pointer;font-family:inherit}
.unified-bc-chapter-hint{text-align:center;font-size:13px;font-weight:600;color:#5a3818;margin-bottom:10px}
.unified-bc-chapter-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.unified-bc-ch-btn{aspect-ratio:1;min-height:44px;min-width:0;padding:0;border-radius:10px;border:0.5px solid rgba(180,140,90,.35);background:#fff;font-size:13px;font-weight:600;color:#3d2818;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
.unified-bc-ch-btn:active{transform:scale(0.96)}
.unified-bc-ch--cur{background:#c89849;color:#fff;border-color:#a87a35}
/* verse-read-header */"""

OLD_ONCLICK = 'onclick="goBack(\'chapter\')" aria-label="책·장 선택"'
NEW_ONCLICK = 'onclick="openUnifiedBookChapterModal()" aria-label="책·장 선택"'

JS_BLOCK = r"""
var unifiedBcState = { step: 'books', testament: 'old', selectedBook: null, displayChapters: 0 };

function getUnifiedOldSections() {
  return [
    { title: '📜 모세오경', books: ['창세기','출애굽기','레위기','민수기','신명기'] },
    { title: '📜 역사서', books: ['여호수아','사사기','룻기','사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더'] },
    { title: '📜 시가서', books: ['욥기','시편','잠언','전도서','아가'] },
    { title: '📜 대선지서', books: ['이사야','예레미야','예레미야애가','에스겔','다니엘'] },
    { title: '📜 소선지서', books: ['호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기'] }
  ];
}

function getUnifiedNewSections() {
  return [
    { title: '📕 복음서', books: ['마태복음','마가복음','누가복음','요한복음'] },
    { title: '📕 역사서', books: ['사도행전'] },
    { title: '📕 바울서신', books: ['로마서','고린도전서','고린도후서','갈라디아서','에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서','디모데전서','디모데후서','디도서','빌레몬서'] },
    { title: '📕 공동서신', books: ['히브리서','야고보서','베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서'] },
    { title: '📕 예언서', books: ['요한계시록'] }
  ];
}

function buildUnifiedBooksHtml(testament) {
  var sections = testament === 'old' ? getUnifiedOldSections() : getUnifiedNewSections();
  var data = testament === 'old' ? oldTestamentData : newTestamentData;
  var html = '';
  for (var s = 0; s < sections.length; s++) {
    var sec = sections[s];
    html += '<div class="unified-bc-sec">' + sec.title + '</div><div class="unified-bc-book-grid">';
    for (var b = 0; b < sec.books.length; b++) {
      var bookName = sec.books[b];
      var bd = findBook(data, bookName);
      if (!bd) continue;
      var chc = getDisplayedChapterCount(bd);
      var sel = (currentBook && currentBook.name === bookName && currentBook.testament === testament) ? ' unified-bc-book--sel' : '';
      html += '<button type="button" class="unified-bc-book' + sel + '" onclick="unifiedBcPickBook(\'' + bookName + '\',' + chc + ',\'' + testament + '\')">' + bookName + '</button>';
    }
    html += '</div>';
  }
  return html;
}

function renderUnifiedModalBody() {
  var body = document.getElementById('unifiedBcBody');
  if (!body) return;
  var html = '';
  html += '<button type="button" class="unified-bc-cat-btn" onclick="unifiedBcGoCategoryList()">📚 카테고리 목록으로</button>';
  html += '<div class="unified-bc-ttabs">';
  html += '<button type="button" class="unified-bc-ttab' + (unifiedBcState.testament === 'old' ? ' active' : '') + '" data-t="old" type="button">구약 39권</button>';
  html += '<button type="button" class="unified-bc-ttab' + (unifiedBcState.testament === 'new' ? ' active' : '') + '" data-t="new" type="button">신약 27권</button>';
  html += '</div>';
  if (unifiedBcState.step === 'books') {
    html += buildUnifiedBooksHtml(unifiedBcState.testament);
  } else {
    html += '<button type="button" class="unified-bc-back-books" onclick="unifiedBcBackToBooks()">← 책 목록</button>';
    var unit = getChapterUnit(unifiedBcState.selectedBook);
    html += '<div class="unified-bc-chapter-hint">' + unifiedBcState.selectedBook + ' ' + unit + ' 선택</div>';
    html += '<div class="unified-bc-chapter-grid">';
    for (var i = 1; i <= unifiedBcState.displayChapters; i++) {
      var cur = (currentBook && currentBook.name === unifiedBcState.selectedBook && currentChapter === i) ? ' unified-bc-ch--cur' : '';
      html += '<button type="button" class="unified-bc-ch-btn' + cur + '" onclick="unifiedBcApplyChapter(' + i + ')">' + i + '</button>';
    }
    html += '</div>';
  }
  body.innerHTML = html;
  body.querySelectorAll('.unified-bc-ttab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      unifiedBcState.testament = btn.getAttribute('data-t');
      unifiedBcState.step = 'books';
      unifiedBcState.selectedBook = null;
      renderUnifiedModalBody();
    });
  });
}

function unifiedBcPickBook(name, chCount, testament) {
  var displayChapters = isPsalmsBook(name) ? Math.min(chCount, 150) : chCount;
  unifiedBcState.step = 'chapters';
  unifiedBcState.selectedBook = name;
  unifiedBcState.displayChapters = displayChapters;
  unifiedBcState.testament = testament;
  renderUnifiedModalBody();
}

function unifiedBcBackToBooks() {
  unifiedBcState.step = 'books';
  unifiedBcState.selectedBook = null;
  unifiedBcState.displayChapters = 0;
  renderUnifiedModalBody();
}

function unifiedBcGoCategoryList() {
  if (currentBook && currentBook.testament) {
    goBack('book');
  }
  closeUnifiedBookChapterModal();
}

function unifiedBcApplyChapter(ch) {
  if (!unifiedBcState.selectedBook) return;
  var name = unifiedBcState.selectedBook;
  var testament = unifiedBcState.testament;
  var displayChapters = unifiedBcState.displayChapters;
  currentBook = { name: name, chapters: displayChapters, testament: testament };
  currentChapter = ch;
  currentTab = testament;
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  var activeTab = document.querySelector('.tab[data-tab="' + testament + '"]');
  if (activeTab) activeTab.classList.add('active');
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
  document.getElementById('verseView').classList.add('active');
  updateHeaderBtns(testament);
  syncReaderNavActive();
  closeUnifiedBookChapterModal();
  renderVerses();
  loadCommentaryData();
}

function openUnifiedBookChapterModal() {
  if (!currentBook || !currentChapter) return;
  closeVerseReadMoreMenu();
  var head = document.getElementById('unifiedBcHeadTitle');
  if (head) {
    var u = getChapterUnit(currentBook.name);
    head.textContent = currentBook.name + ' ' + currentChapter + u;
  }
  unifiedBcState.step = 'books';
  unifiedBcState.testament = currentBook.testament;
  unifiedBcState.selectedBook = null;
  unifiedBcState.displayChapters = 0;
  var el = document.getElementById('unifiedBookChapterModal');
  if (!el) return;
  el.classList.add('active');
  el.setAttribute('aria-hidden', 'false');
  renderUnifiedModalBody();
}

function closeUnifiedBookChapterModal() {
  var el = document.getElementById('unifiedBookChapterModal');
  if (el) {
    el.classList.remove('active');
    el.setAttribute('aria-hidden', 'true');
  }
}

"""

ANCHOR_JS = "function closeVerseReadMoreMenu() {"


def main():
    text = PATH.read_text(encoding="utf-8")
    if MARKER in text:
        print("Already patched. Skipping.")
        return

    if ANCHOR_HTML not in text:
        raise SystemExit("MISSING: html anchor")
    if ANCHOR_CSS not in text:
        raise SystemExit("MISSING: css anchor")
    if OLD_ONCLICK not in text:
        raise SystemExit("MISSING: title onclick")
    if ANCHOR_JS not in text:
        raise SystemExit("MISSING: js anchor")

    text = text.replace(ANCHOR_HTML, INSERT_HTML, 1)
    text = text.replace(ANCHOR_CSS, INSERT_CSS, 1)
    text = text.replace(OLD_ONCLICK, NEW_ONCLICK, 1)
    text = text.replace(ANCHOR_JS, JS_BLOCK + "\n" + ANCHOR_JS, 1)

    PATH.write_text(text, encoding="utf-8")
    print("Wrote", PATH)


if __name__ == "__main__":
    main()
