#!/usr/bin/env python3
"""Apply option-4 hybrid UI to reader.html (main baseline). Single-file Python replace only."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

MARKER = "/* option-4-hybrid */"

CSS_BLOCK = r"""
/* option-4-hybrid */
.verse-range-box{width:100%;text-align:left;background:#fff;border:0.5px solid rgba(180,140,90,.55);border-radius:10px;padding:11px 14px;margin:0 -16px 16px;display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
.verse-range-box:active{opacity:0.92}
.verse-range-box-inner{display:flex;flex-direction:column;align-items:flex-start;gap:2px;flex:1;min-width:0}
.verse-range-label{font-size:11px;color:#999;font-weight:500}
.verse-range-main{font-size:15px;font-weight:600;color:#3d2818}
.verse-range-change{font-size:14px;font-weight:600;color:#B8860B;flex-shrink:0;margin-left:8px}
.opt4-bottom-bar{display:none;position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;width:100%;background:#faf6ed;border-top:0.5px solid rgba(180,140,90,.35);padding:10px 12px;box-sizing:border-box;z-index:95;gap:10px;align-items:stretch}
html.reader-verse-active .opt4-bottom-bar{display:flex}
html.reader-verse-active main.content{padding-bottom:70px}
.opt4-bottom-prev,.opt4-bottom-next{flex:1;background:#fff;border:1px solid #E8E0D8;border-radius:12px;padding:12px 6px;font-size:13px;font-weight:600;color:#3d2818;cursor:pointer;font-family:inherit}
.opt4-bottom-prev:disabled,.opt4-bottom-next:disabled{opacity:0.38;cursor:not-allowed}
.opt4-bottom-commentary{flex:1.4;background:#8b5e2c;color:#fff;border:none;border-radius:12px;padding:12px 6px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
.verse-range-modal-overlay{display:none;position:fixed;inset:0;z-index:220;background:rgba(0,0,0,.4);align-items:flex-end;justify-content:center;box-sizing:border-box}
.verse-range-modal-overlay.active{display:flex}
.verse-range-modal-box{background:#faf6ed;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;margin:0 auto;box-shadow:0 -4px 24px rgba(0,0,0,.12)}
.verse-range-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(180,140,90,.25);font-weight:700;font-size:16px;color:#3d2818}
.verse-range-modal-close{background:rgba(0,0,0,.06);border:none;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:16px;color:#3d2818;font-family:inherit}
.verse-range-modal-body{padding:12px 16px calc(20px + env(safe-area-inset-bottom,0));overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0}
.verse-range-mode-tabs{display:flex;gap:8px;margin-bottom:12px}
.verse-range-mode-tabs button{flex:1;padding:12px;border-radius:12px;border:1px solid #E8E0D8;background:#fff;font-weight:600;cursor:pointer;font-family:inherit;color:#5C4A3A;font-size:14px}
.verse-range-mode-tabs button.active{background:var(--gold);color:#fff;border-color:var(--gold)}
.verse-range-range-label{margin:0 0 6px;font-size:14px;font-weight:600;color:#5C4A3A}
.verse-range-preview{margin:4px 0 14px;text-align:center;font-size:14px;font-weight:600;color:#5a3818;min-height:22px}
.verse-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:12px 0 20px}
.verse-cell{aspect-ratio:1;min-height:44px;background:#fff;border:0.5px solid rgba(180,140,90,.25);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;color:#5a3818;cursor:pointer;font-family:inherit;padding:0;box-sizing:border-box}
.verse-cell:active{transform:scale(0.92);transition:all 0.15s}
.verse-cell.selected{background:#c89849;color:#fff;border-color:#a87a35}
.verse-cell.disabled{opacity:0.3;pointer-events:none}
.verse-range-btn-all{padding:14px;border-radius:12px;border:none;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#B8860B,#9a7018);color:#fff;width:100%}
.verse-range-apply{padding:14px;border-radius:12px;background:#3d2818;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:4px}
"""

STYLE_ANCHOR = """.reader-sheet-tabs .reader-close{background:rgba(0,0,0,.07);border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1;color:#3d2818;padding:0;flex-shrink:0}

</style>"""

STYLE_REPLACEMENT = (
    """.reader-sheet-tabs .reader-close{background:rgba(0,0,0,.07);border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1;color:#3d2818;padding:0;flex-shrink:0}"""
    + "\n" + CSS_BLOCK + "\n\n</style>"
)

MAIN_ANCHOR = """  </main>
</div>
<div class="popup-overlay" id="settingsPopup">"""

MAIN_REPLACEMENT = """  </main>
  <nav id="opt4BottomBar" class="opt4-bottom-bar" aria-label="장 이동 및 말씀풀이">
    <button type="button" class="opt4-bottom-prev" id="opt4BottomPrev" onclick="prevChapter()">◀ 이전장</button>
    <button type="button" class="opt4-bottom-commentary" id="opt4BottomCommentary" onclick="opt4OpenBarCommentary()">📖 말씀풀이</button>
    <button type="button" class="opt4-bottom-next" id="opt4BottomNext" onclick="nextChapter()">다음장 ▶</button>
  </nav>
  <div id="verseRangeModal" class="verse-range-modal-overlay" role="dialog" aria-modal="true" aria-hidden="true" onclick="if(event.target===this)closeVerseRangeModal()">
    <div class="verse-range-modal-box" onclick="event.stopPropagation()">
      <div class="verse-range-modal-head"><span id="verseRangeModalTitle">절 범위</span><button type="button" class="verse-range-modal-close" onclick="closeVerseRangeModal()">✕</button></div>
      <div id="verseRangeModalBody" class="verse-range-modal-body"></div>
    </div>
  </div>
</div>
<div class="popup-overlay" id="settingsPopup">"""

OLD_RENDER_START = """  var chapterUnit = getChapterUnit(currentBook.name);
  var html = '<div class="verse-header"><span class="verse-title">' + currentBook.name + ' ' + currentChapter + chapterUnit + '</span><div class="verse-nav"><button class="nav-btn" onclick="prevChapter()"' + (currentChapter <= 1 ? ' disabled' : '') + '>◀ 이전' + chapterUnit + '</button><button class="nav-btn" onclick="nextChapter()"' + (currentChapter >= currentBook.chapters ? ' disabled' : '') + '>다음' + chapterUnit + ' ▶</button></div></div>';
  html += '<div class="back-bar"><button class="list-btn" onclick="goBack(\\'chapter\\')">← ' + chapterUnit + ' 선택으로</button></div>';
  html += '<div class="range-selector"><select id="startVerse" onchange="updateEndVerse()">';
  for(var i = 1; i <= verses.length; i++) html += '<option value="' + i + '">' + i + '절부터</option>';
  html += '</select><span>~</span><select id="endVerse">';
  for(var i = 1; i <= verses.length; i++) html += '<option value="' + i + '"' + (i === verses.length ? ' selected' : '') + '>' + i + '절까지</option>';
  html += '</select><button class="range-btn" onclick="applyRange()">말씀보기</button></div>';
  html += '<div class="verse-list" id="verseList">';"""

NEW_RENDER_START = """  var chapterUnit = getChapterUnit(currentBook.name);
  var html = '<div class="verse-header"><span class="verse-title">' + currentBook.name + ' ' + currentChapter + chapterUnit + '</span></div>';
  html += '<div class="back-bar"><button class="list-btn" onclick="goBack(\\'chapter\\')">← ' + chapterUnit + ' 선택으로</button></div>';
  html += '<button type="button" class="verse-range-box" id="verseRangeBoxBtn" onclick="openVerseRangeModal()" aria-label="절 범위 변경"><span class="verse-range-box-inner"><span class="verse-range-label">절 범위</span><span class="verse-range-main" id="verseRangeMainText"></span></span><span class="verse-range-change">변경 ▼</span></button>';
  html += '<div class="verse-list" id="verseList">';"""

OLD_RENDER_END = """  html += '</div>';
  document.getElementById('verseView').innerHTML = html;
}"""

NEW_RENDER_END = """  html += '</div>';
  document.getElementById('verseView').innerHTML = html;
  opt4RangeStart = 1;
  opt4RangeEnd = verses.length;
  applyRange(1, verses.length);
  updateVerseRangeBoxLabel();
  updateOpt4BottomBar();
}"""

OLD_UPDATE_END = """function updateEndVerse() {
  var start = parseInt(document.getElementById('startVerse').value);
  var sel = document.getElementById('endVerse');
  var cur = parseInt(sel.value);
  sel.innerHTML = '';
  for(var i = start; i <= currentVerseCount; i++) {
    sel.innerHTML += '<option value="' + i + '"' + (i === Math.max(start, cur) ? ' selected' : '') + '>' + i + '절</option>';
  }
}"""

NEW_UPDATE_END = """function updateEndVerse() {
  var startEl = document.getElementById('startVerse');
  var sel = document.getElementById('endVerse');
  if (!startEl || !sel) return;
  var start = parseInt(startEl.value, 10);
  var cur = parseInt(sel.value, 10);
  sel.innerHTML = '';
  for(var i = start; i <= currentVerseCount; i++) {
    sel.innerHTML += '<option value="' + i + '"' + (i === Math.max(start, cur) ? ' selected' : '') + '>' + i + '절</option>';
  }
}"""

OLD_APPLY_RANGE = """function applyRange() {
  var start = parseInt(document.getElementById('startVerse').value);
  var end = parseInt(document.getElementById('endVerse').value);
  document.querySelectorAll('.verse-item').forEach(function(item) {
    var vn = parseInt(item.getAttribute('data-verse'));
    item.style.display = (vn >= start && vn <= end) ? 'block' : 'none';
  });
}"""

NEW_APPLY_RANGE = """function applyRange(startOpt, endOpt) {
  var start, end;
  if (startOpt != null && endOpt != null) {
    start = parseInt(startOpt, 10);
    end = parseInt(endOpt, 10);
  } else {
    var s = document.getElementById('startVerse');
    var e = document.getElementById('endVerse');
    if (!s || !e) return;
    start = parseInt(s.value, 10);
    end = parseInt(e.value, 10);
  }
  if (isNaN(start) || isNaN(end)) return;
  document.querySelectorAll('.verse-item').forEach(function(item) {
    var vn = parseInt(item.getAttribute('data-verse'), 10);
    item.style.display = (vn >= start && vn <= end) ? 'block' : 'none';
  });
}"""

OLD_SWITCH_TAB_END = """  updateHeaderBtns(tab);
  syncReaderNavActive();
}"""

NEW_SWITCH_TAB_END = """  updateHeaderBtns(tab);
  syncReaderNavActive();
  updateOpt4BottomBar();
}"""

OLD_SELECT_BOOK_TAIL = """  document.getElementById('chapterView').innerHTML = html;
}"""

NEW_SELECT_BOOK_TAIL = """  document.getElementById('chapterView').innerHTML = html;
  updateOpt4BottomBar();
}"""

JS_GLOBALS = """var opt4RangeStart = 1;
var opt4RangeEnd = 1;
var verseRangeModalMax = 0;
var verseRangeSelStart = 0;
var verseRangeSelEnd = 0;

"""

JS_BLOCK = r"""
function updateVerseRangeBoxLabel() {
  var el = document.getElementById('verseRangeMainText');
  if (!el) return;
  if (opt4RangeStart <= 0 || opt4RangeEnd <= 0) return;
  var n = opt4RangeEnd - opt4RangeStart + 1;
  var full = opt4RangeStart === 1 && opt4RangeEnd >= currentVerseCount;
  el.textContent = opt4RangeStart + '절 ~ ' + opt4RangeEnd + '절' + (full ? ' (전체)' : ' (' + n + '개 절)');
}

function updateOpt4BottomBar() {
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
}

function opt4OpenBarCommentary() {
  var items = document.querySelectorAll('#verseList .verse-item');
  if (!items.length) return;
  var target = 1;
  for (var i = 0; i < items.length; i++) {
    if (items[i].style.display !== 'none') {
      target = parseInt(items[i].getAttribute('data-verse'), 10) || 1;
      break;
    }
  }
  showCommentary(target);
}

function getVerseRangeModalHtml() {
  verseRangeModalMax = currentVerseCount;
  verseRangeSelStart = opt4RangeStart;
  verseRangeSelEnd = opt4RangeEnd;
  return '<div class="reader-verse-range-actions" style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="verse-range-mode-tabs">' +
    '<button type="button" class="active" id="verseRangeModeAllBtn">전체 보기</button>' +
    '<button type="button" id="verseRangeModeRangeBtn">절 범위 선택</button></div>' +
    '<div id="verseRangePanelAll">' +
    '<button type="button" class="verse-range-btn-all" id="verseRangeModalAllBtn">전체 보기</button></div>' +
    '<div id="verseRangePanelRange" style="display:none">' +
    '<p class="verse-range-range-label">시작 절을 선택하세요</p>' +
    '<div class="verse-grid" id="verseRangeStartGrid"></div>' +
    '<p class="verse-range-range-label">끝 절을 선택하세요</p>' +
    '<div class="verse-grid" id="verseRangeEndGrid"></div>' +
    '<p class="verse-range-preview" id="verseRangePreviewText"></p>' +
    '<button type="button" class="verse-range-apply" id="verseRangeApplyBtn">📖 말씀 보기</button></div></div>';
}

function verseRangeRefreshPreview() {
  var el = document.getElementById('verseRangePreviewText');
  if (!el) return;
  if (verseRangeSelStart > 0 && verseRangeSelEnd > 0 && verseRangeSelEnd >= verseRangeSelStart) {
    var n = verseRangeSelEnd - verseRangeSelStart + 1;
    el.textContent = verseRangeSelStart + '절 ~ ' + verseRangeSelEnd + '절 (' + n + '개 절)';
  } else if (verseRangeSelStart > 0) {
    el.textContent = '끝 절을 선택해 주세요';
  } else {
    el.textContent = '시작 절을 선택해 주세요';
  }
}

function verseRangeRenderStartGrid() {
  var host = document.getElementById('verseRangeStartGrid');
  if (!host) return;
  var html = '';
  for (var v = 1; v <= verseRangeModalMax; v++) {
    var sel = (v === verseRangeSelStart) ? ' selected' : '';
    html += '<button type="button" class="verse-cell' + sel + '" data-v="' + v + '">' + v + '</button>';
  }
  host.innerHTML = html;
}

function verseRangeRenderEndGrid() {
  var host = document.getElementById('verseRangeEndGrid');
  if (!host) return;
  var start = verseRangeSelStart;
  var html = '';
  for (var v = 1; v <= verseRangeModalMax; v++) {
    var isDis = start <= 0 || v < start;
    var dis = isDis ? ' disabled' : '';
    var sel = (!isDis && v === verseRangeSelEnd && start > 0) ? ' selected' : '';
    var disAttr = isDis ? ' disabled' : '';
    html += '<button type="button" class="verse-cell' + dis + sel + '"' + disAttr + ' data-v="' + v + '">' + v + '</button>';
  }
  host.innerHTML = html;
}

function attachVerseRangeModalListeners() {
  var allBtn = document.getElementById('verseRangeModalAllBtn');
  if (allBtn) {
    allBtn.addEventListener('click', function() {
      opt4RangeStart = 1;
      opt4RangeEnd = currentVerseCount;
      applyRange(1, currentVerseCount);
      updateVerseRangeBoxLabel();
      closeVerseRangeModal();
    });
  }
  var modeAll = document.getElementById('verseRangeModeAllBtn');
  var modeRange = document.getElementById('verseRangeModeRangeBtn');
  var panelAll = document.getElementById('verseRangePanelAll');
  var panelRange = document.getElementById('verseRangePanelRange');
  if (modeAll && modeRange && panelAll && panelRange) {
    modeAll.addEventListener('click', function() {
      modeAll.classList.add('active');
      modeRange.classList.remove('active');
      panelAll.style.display = 'block';
      panelRange.style.display = 'none';
    });
    modeRange.addEventListener('click', function() {
      modeRange.classList.add('active');
      modeAll.classList.remove('active');
      panelRange.style.display = 'block';
      panelAll.style.display = 'none';
    });
  }
  verseRangeRenderStartGrid();
  verseRangeRenderEndGrid();
  verseRangeRefreshPreview();
  var startHost = document.getElementById('verseRangeStartGrid');
  if (startHost) {
    startHost.addEventListener('click', function(ev) {
      var t = ev.target.closest('.verse-cell');
      if (!t || t.disabled) return;
      verseRangeSelStart = parseInt(t.getAttribute('data-v'), 10);
      if (verseRangeSelEnd > 0 && verseRangeSelEnd < verseRangeSelStart) verseRangeSelEnd = 0;
      verseRangeRenderStartGrid();
      verseRangeRenderEndGrid();
      verseRangeRefreshPreview();
    });
  }
  var endHost = document.getElementById('verseRangeEndGrid');
  if (endHost) {
    endHost.addEventListener('click', function(ev) {
      var t = ev.target.closest('.verse-cell');
      if (!t || t.disabled) return;
      var v = parseInt(t.getAttribute('data-v'), 10);
      if (verseRangeSelStart <= 0 || v < verseRangeSelStart) return;
      verseRangeSelEnd = v;
      verseRangeRenderEndGrid();
      verseRangeRefreshPreview();
    });
  }
  var applyBtn = document.getElementById('verseRangeApplyBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', function() {
      if (verseRangeSelStart <= 0 || verseRangeSelEnd <= 0 || verseRangeSelEnd < verseRangeSelStart) {
        alert('시작 절과 끝 절을 선택해 주세요.');
        return;
      }
      opt4RangeStart = verseRangeSelStart;
      opt4RangeEnd = verseRangeSelEnd;
      applyRange(opt4RangeStart, opt4RangeEnd);
      updateVerseRangeBoxLabel();
      closeVerseRangeModal();
    });
  }
}

function openVerseRangeModal() {
  var modal = document.getElementById('verseRangeModal');
  var body = document.getElementById('verseRangeModalBody');
  if (!modal || !body) return;
  body.innerHTML = getVerseRangeModalHtml();
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  attachVerseRangeModalListeners();
}

function closeVerseRangeModal() {
  var modal = document.getElementById('verseRangeModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

"""

ANCHOR_GLOBALS = """var readerModalPickChapters = 0;
"""

# Wrong - main doesn't have readerModal. Find anchor on main.

ANCHOR_GLOBALS_MAIN = """var currentVerseCount = 0;
"""


def main():
    text = PATH.read_text(encoding="utf-8")
    if MARKER in text:
        print("Already patched. Skipping.")
        return

    def rep(old, new, label):
        nonlocal text
        if old not in text:
            raise SystemExit(f"MISSING: {label}")
        text = text.replace(old, new, 1)
        print("ok:", label)

    rep(STYLE_ANCHOR, STYLE_REPLACEMENT, "css")
    rep(MAIN_ANCHOR, MAIN_REPLACEMENT, "main+modal")
    rep(OLD_RENDER_START, NEW_RENDER_START, "renderVerses start")
    rep(OLD_RENDER_END, NEW_RENDER_END, "renderVerses end")
    rep(OLD_UPDATE_END, NEW_UPDATE_END, "updateEndVerse")
    rep(OLD_APPLY_RANGE, NEW_APPLY_RANGE, "applyRange")
    rep(OLD_SWITCH_TAB_END, NEW_SWITCH_TAB_END, "switchTab")
    rep(OLD_SELECT_BOOK_TAIL, NEW_SELECT_BOOK_TAIL, "selectBook")

    if ANCHOR_GLOBALS_MAIN not in text:
        raise SystemExit("MISSING currentVerseCount anchor")
    text = text.replace(ANCHOR_GLOBALS_MAIN, ANCHOR_GLOBALS_MAIN + JS_GLOBALS, 1)
    print("ok: globals")

    anchor_fn = "function shareVerse(vn) {"
    if anchor_fn not in text:
        raise SystemExit("MISSING shareVerse")
    text = text.replace(anchor_fn, JS_BLOCK + "\n" + anchor_fn, 1)
    print("ok: js block")

    PATH.write_text(text, encoding="utf-8")
    print("Wrote", PATH)


if __name__ == "__main__":
    main()
