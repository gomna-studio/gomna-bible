#!/usr/bin/env python3
"""Remove verse header ←, add title + ▼ with goBack('chapter'); balance spacer."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"
MARKER = "verse-read-title-text"


def main():
    text = PATH.read_text(encoding="utf-8")
    if MARKER in text and "verse-read-spacer" in text:
        print("Already patched. Skipping.")
        return

    old_css = """/* verse-read-header */
.verse-read-header{display:none;align-items:center;gap:8px;background:#faf6ed;padding:12px 14px;border-bottom:0.5px solid rgba(180,140,90,.35);box-sizing:border-box;width:100%}
.verse-read-back,.verse-read-more{width:32px;height:32px;min-width:32px;padding:0;border:none;background:transparent;font-size:18px;color:#3d2818;cursor:pointer;font-family:inherit;line-height:1;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}
.verse-read-title{flex:1;min-width:0;border:none;background:transparent;text-align:center;font-size:16px;font-weight:600;color:#3d2818;cursor:pointer;font-family:inherit;padding:6px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"""

    new_css = """/* verse-read-header */
.verse-read-header{display:none;align-items:center;gap:8px;background:#faf6ed;padding:12px 14px;border-bottom:0.5px solid rgba(180,140,90,.35);box-sizing:border-box;width:100%}
.verse-read-spacer{width:32px;height:32px;min-width:32px;flex-shrink:0;pointer-events:none}
.verse-read-more{width:32px;height:32px;min-width:32px;padding:0;border:none;background:transparent;font-size:18px;color:#3d2818;cursor:pointer;font-family:inherit;line-height:1;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}
.verse-read-title{flex:1;min-width:0;border:none;background:transparent;font-size:16px;font-weight:600;color:#3d2818;cursor:pointer;font-family:inherit;padding:8px 12px;display:flex;align-items:center;justify-content:center;gap:0;border-radius:8px;-webkit-tap-highlight-color:transparent}
.verse-read-title:hover{background:rgba(200,152,73,.15)}
.verse-read-title:active{background:rgba(200,152,73,.22)}
.verse-read-title-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.verse-read-caret{font-size:11px;color:#8b5e2c;margin-left:6px;flex-shrink:0;font-weight:700}"""

    old_nav = """  <nav id="verseReadHeader" class="verse-read-header" style="display:none" aria-label="읽기 헤더">
    <button type="button" class="verse-read-back" onclick="goBack('chapter')" aria-label="장 선택">←</button>
    <button type="button" class="verse-read-title" id="verseReadTitleBtn" aria-label="현재 위치">&nbsp;</button>
    <button type="button" class="verse-read-more" onclick="openVerseReadMoreMenu()" aria-label="더보기">⋯</button>
  </nav>"""

    new_nav = """  <nav id="verseReadHeader" class="verse-read-header" style="display:none" aria-label="읽기 헤더">
    <span class="verse-read-spacer" aria-hidden="true"></span>
    <button type="button" class="verse-read-title" id="verseReadTitleBtn" onclick="goBack('chapter')" aria-label="책·장 선택">
      <span class="verse-read-title-text" id="verseReadTitleText"></span><span class="verse-read-caret" aria-hidden="true">▼</span>
    </button>
    <button type="button" class="verse-read-more" onclick="openVerseReadMoreMenu()" aria-label="더보기">⋯</button>
  </nav>"""

    old_js = """    var tb = document.getElementById('verseReadTitleBtn');
    if (tb) {
      var u = getChapterUnit(currentBook.name);
      tb.textContent = currentBook.name + ' ' + currentChapter + u;
    }"""

    new_js = """    var txt = document.getElementById('verseReadTitleText');
    if (txt) {
      var u = getChapterUnit(currentBook.name);
      txt.textContent = currentBook.name + ' ' + currentChapter + u;
    }"""

    def rep(old, new, label):
        nonlocal text
        if old not in text:
            raise SystemExit("MISSING: " + label)
        text = text.replace(old, new, 1)
        print("ok:", label)

    rep(old_css, new_css, "css")
    rep(old_nav, new_nav, "nav html")
    rep(old_js, new_js, "updateOpt4 title")

    PATH.write_text(text, encoding="utf-8")
    print("Wrote", PATH)


if __name__ == "__main__":
    main()
