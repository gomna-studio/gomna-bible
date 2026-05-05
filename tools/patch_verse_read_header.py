#!/usr/bin/env python3
"""Option-4 hybrid: verse read header row (← title ⋯), remove back-bar + in-body title."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"
MARKER = "/* verse-read-header */"


def main():
    text = PATH.read_text(encoding="utf-8")
    if MARKER in text:
        print("Already patched. Skipping.")
        return

    css_insert = r"""
/* verse-read-header */
.verse-read-header{display:none;align-items:center;gap:8px;background:#faf6ed;padding:12px 14px;border-bottom:0.5px solid rgba(180,140,90,.35);box-sizing:border-box;width:100%}
.verse-read-back,.verse-read-more{width:32px;height:32px;min-width:32px;padding:0;border:none;background:transparent;font-size:18px;color:#3d2818;cursor:pointer;font-family:inherit;line-height:1;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}
.verse-read-title{flex:1;min-width:0;border:none;background:transparent;text-align:center;font-size:16px;font-weight:600;color:#3d2818;cursor:pointer;font-family:inherit;padding:6px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.verse-read-more-overlay{display:none;position:fixed;inset:0;z-index:210;background:rgba(0,0,0,.4);align-items:flex-end;justify-content:center;box-sizing:border-box}
.verse-read-more-overlay.active{display:flex}
.verse-read-more-sheet{background:#faf6ed;border-radius:16px 16px 0 0;width:100%;max-width:480px;margin:0 auto;box-shadow:0 -4px 24px rgba(0,0,0,.12);overflow:hidden}
.verse-read-more-sheet-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(180,140,90,.25);font-weight:700;font-size:16px;color:#3d2818}
.verse-read-more-item{display:block;width:100%;padding:16px;border:none;border-bottom:1px solid #eee;background:transparent;text-align:left;font-size:15px;font-weight:600;color:#3d2818;cursor:pointer;font-family:inherit}
.verse-read-more-item:last-of-type{border-bottom:none}
"""

    old_css_tail = """.verse-range-apply{padding:14px;border-radius:12px;background:#3d2818;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:4px}


</style>"""

    new_css_tail = (
        """.verse-range-apply{padding:14px;border-radius:12px;background:#3d2818;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:4px}"""
        + css_insert
        + "\n\n</style>"
    )

    old_html = """    <div class="reader-nav-end">
      <button type="button" class="reader-tab reader-home" onclick="location.href='/'">← 홈으로</button>
      <button type="button" class="reader-close" onclick="location.href='/'" aria-label="닫기">✕</button>
    </div>
  </nav>
  <main class="content">"""

    new_html = """    <div class="reader-nav-end">
      <button type="button" class="reader-tab reader-home" onclick="location.href='/'">← 홈으로</button>
      <button type="button" class="reader-close" onclick="location.href='/'" aria-label="닫기">✕</button>
    </div>
  </nav>
  <nav id="verseReadHeader" class="verse-read-header" style="display:none" aria-label="읽기 헤더">
    <button type="button" class="verse-read-back" onclick="goBack('chapter')" aria-label="장 선택">←</button>
    <button type="button" class="verse-read-title" id="verseReadTitleBtn" aria-label="현재 위치">&nbsp;</button>
    <button type="button" class="verse-read-more" onclick="openVerseReadMoreMenu()" aria-label="더보기">⋯</button>
  </nav>
  <div id="verseReadMoreOverlay" class="verse-read-more-overlay" aria-hidden="true" onclick="if(event.target===this)closeVerseReadMoreMenu()">
    <div class="verse-read-more-sheet" onclick="event.stopPropagation()">
      <div class="verse-read-more-sheet-head"><span>더보기</span><button type="button" class="verse-range-modal-close" onclick="closeVerseReadMoreMenu()" aria-label="닫기">✕</button></div>
      <button type="button" class="verse-read-more-item" onclick="closeVerseReadMoreMenu();switchTab('search');var si=document.getElementById('searchInput');if(si)si.focus();">검색</button>
      <button type="button" class="verse-read-more-item" onclick="closeVerseReadMoreMenu();switchTab('easy');">쉬운찾기</button>
      <button type="button" class="verse-read-more-item" onclick="closeVerseReadMoreMenu();switchTab('fav');">내 보관함</button>
      <button type="button" class="verse-read-more-item" onclick="closeVerseReadMoreMenu();openSettings();">글자 크기 설정</button>
    </div>
  </div>
  <main class="content">"""

    old_render = """  var chapterUnit = getChapterUnit(currentBook.name);
  var html = '<div class="verse-header"><span class="verse-title">' + currentBook.name + ' ' + currentChapter + chapterUnit + '</span></div>';
  html += '<div class="back-bar"><button class="list-btn" onclick="goBack(\\'chapter\\')">← ' + chapterUnit + ' 선택으로</button></div>';
  html += '<button type="button" class="verse-range-box" id="verseRangeBoxBtn" onclick="openVerseRangeModal()" aria-label="절 범위 변경"><span class="verse-range-box-inner"><span class="verse-range-label">절 범위</span><span class="verse-range-main" id="verseRangeMainText"></span></span><span class="verse-range-change">변경 ▼</span></button>';"""

    new_render = """  var chapterUnit = getChapterUnit(currentBook.name);
  var html = '<button type="button" class="verse-range-box" id="verseRangeBoxBtn" onclick="openVerseRangeModal()" aria-label="절 범위 변경"><span class="verse-range-box-inner"><span class="verse-range-label">절 범위</span><span class="verse-range-main" id="verseRangeMainText"></span></span><span class="verse-range-change">변경 ▼</span></button>';"""

    old_opt = """function updateOpt4BottomBar() {
  var bar = document.getElementById('opt4BottomBar');
  var vv = document.getElementById('verseView');
  if (!bar) return;
  if (!vv || !vv.classList.contains('active') || !currentBook || !currentChapter) {
    document.documentElement.classList.remove('reader-verse-active');
    bar.style.display = 'none';
    return;
  }
  document.documentElement.classList.add('reader-verse-active');
  bar.style.display = 'flex';
  var prev = document.getElementById('opt4BottomPrev');
  var next = document.getElementById('opt4BottomNext');
  var data = currentBook.testament === 'old' ? oldTestamentData : newTestamentData;
  var bookData = findBook(data, currentBook.name);
  var chCount = bookData ? getDisplayedChapterCount(bookData) : (currentBook.chapters || 999);
  if (prev) prev.disabled = currentChapter <= 1;
  if (next) next.disabled = currentChapter >= chCount;
}"""

    new_opt = """function closeVerseReadMoreMenu() {
  var o = document.getElementById('verseReadMoreOverlay');
  if (o) {
    o.classList.remove('active');
    o.setAttribute('aria-hidden', 'true');
  }
}

function openVerseReadMoreMenu() {
  var o = document.getElementById('verseReadMoreOverlay');
  if (o) {
    o.classList.add('active');
    o.setAttribute('aria-hidden', 'false');
  }
}

function updateOpt4BottomBar() {
  var bar = document.getElementById('opt4BottomBar');
  var hr = document.getElementById('verseReadHeader');
  var vv = document.getElementById('verseView');
  if (!bar) return;
  if (!vv || !vv.classList.contains('active') || !currentBook || !currentChapter) {
    document.documentElement.classList.remove('reader-verse-active');
    bar.style.display = 'none';
    if (hr) hr.style.display = 'none';
    closeVerseReadMoreMenu();
    return;
  }
  document.documentElement.classList.add('reader-verse-active');
  bar.style.display = 'flex';
  if (hr) {
    hr.style.display = 'flex';
    var tb = document.getElementById('verseReadTitleBtn');
    if (tb) {
      var u = getChapterUnit(currentBook.name);
      tb.textContent = currentBook.name + ' ' + currentChapter + u;
    }
  }
  var prev = document.getElementById('opt4BottomPrev');
  var next = document.getElementById('opt4BottomNext');
  var data = currentBook.testament === 'old' ? oldTestamentData : newTestamentData;
  var bookData = findBook(data, currentBook.name);
  var chCount = bookData ? getDisplayedChapterCount(bookData) : (currentBook.chapters || 999);
  if (prev) prev.disabled = currentChapter <= 1;
  if (next) next.disabled = currentChapter >= chCount;
}"""

    def rep(old, new, label):
        nonlocal text
        if old not in text:
            raise SystemExit("MISSING: " + label)
        text = text.replace(old, new, 1)
        print("ok:", label)

    rep(old_css_tail, new_css_tail, "css")
    rep(old_html, new_html, "html")
    rep(old_render, new_render, "renderVerses")
    rep(old_opt, new_opt, "updateOpt4BottomBar")

    PATH.write_text(text, encoding="utf-8")
    print("Wrote", PATH)


if __name__ == "__main__":
    main()
