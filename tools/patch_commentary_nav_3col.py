#!/usr/bin/env python3
"""말씀풀이 모달 골드 박스: 5칸 → 3칸 (◀ 이전절 | 책 장:절 ▼ | 다음절 ▶)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_CSS = """.commentary-verse-ref{background:#B8860B;padding:6px 10px;border-radius:8px;margin-bottom:10px;color:#fff;text-align:center}
.commentary-nav-slim{display:flex;align-items:center;justify-content:space-between;gap:4px;width:100%;box-sizing:border-box;min-height:36px}
.commentary-nav-btn{background:transparent;border:none;color:#fff;padding:6px 10px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s;border-radius:4px;font-family:inherit}
.commentary-nav-btn--chapter{padding:6px 10px;font-size:15px;font-weight:700;min-width:40px}
.commentary-nav-btn--verse{padding:6px 6px;font-size:20px;font-weight:700;min-width:34px;line-height:1}
.commentary-nav-btn:hover{background:rgba(255,255,255,0.2)}
.commentary-nav-btn:active{background:rgba(255,255,255,0.3)}
.commentary-nav-btn:disabled{opacity:0.4;cursor:not-allowed}
.commentary-nav-btn:disabled:hover{background:transparent}
.commentary-slim-center{flex:1;min-width:0;padding:0 4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.commentary-slim-book{font-size:12px;opacity:0.92;font-weight:500}
.commentary-slim-ref{font-size:14px;font-weight:700}"""

NEW_CSS = """.commentary-verse-ref{background:#c89849;padding:10px 16px;border-radius:12px;margin-bottom:10px;color:#fff;display:flex;align-items:center;gap:8px;box-sizing:border-box}
.commentary-nav-arrow{width:44px;height:44px;padding:0;border:none;background:transparent;color:#fff;font-size:18px;font-weight:700;cursor:pointer;border-radius:8px;font-family:inherit;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background 0.15s;-webkit-tap-highlight-color:transparent}
.commentary-nav-arrow:hover:not(:disabled){background:rgba(255,255,255,0.12)}
.commentary-nav-arrow:active:not(:disabled){background:rgba(255,255,255,0.2)}
.commentary-nav-arrow:disabled{opacity:0.4;pointer-events:none;cursor:not-allowed}
.commentary-nav-pick{flex:1;min-width:0;border:none;background:transparent;color:#fff;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit;border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:center;transition:background 0.15s;-webkit-tap-highlight-color:transparent}
.commentary-nav-pick:hover{background:rgba(255,255,255,0.15)}
.commentary-nav-pick:active{background:rgba(255,255,255,0.25)}
.commentary-nav-pick-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
.commentary-nav-pick-caret{color:rgba(255,255,255,.7);font-size:12px;margin-left:6px;flex-shrink:0;font-weight:600;line-height:1}
.commentary-nav-btn{background:transparent;border:none;color:#fff;padding:6px 10px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s;border-radius:4px;font-family:inherit}
.commentary-nav-btn:hover{background:rgba(255,255,255,0.2)}
.commentary-nav-btn:active{background:rgba(255,255,255,0.3)}
.commentary-nav-btn:disabled{opacity:0.4;cursor:not-allowed}
.commentary-nav-btn:disabled:hover{background:transparent}"""

OLD_JS = """  var chapterUnit = getChapterUnit(bookName);
  // 한 줄 슬림 장·절 네비 (◀장 ‹절  책명 장:절  절› 장▶)
  var content = '<div class="commentary-verse-ref">';
  content += '<div class="commentary-nav-slim">';
  content += '<button type="button" class="commentary-nav-btn commentary-nav-btn--chapter" onclick="goToChapterCommentary(' + prevChapter + ')"' + (prevChapter < 1 ? ' disabled' : '') + ' title="이전 장">◀</button>';
  content += '<button type="button" class="commentary-nav-btn commentary-nav-btn--verse" onclick="goToVerseCommentary(' + prevVerse + ')"' + (prevVerse < 1 ? ' disabled' : '') + ' title="이전 절">‹</button>';
  content += '<span class="commentary-slim-center" title="' + bookName + ' ' + chapter + ':' + verseNum + '"><span class="commentary-slim-book">' + bookName + '</span> <span class="commentary-slim-ref">' + chapter + ':' + verseNum + '</span></span>';
  content += '<button type="button" class="commentary-nav-btn commentary-nav-btn--verse" onclick="goToVerseCommentary(' + nextVerse + ')"' + (nextVerse > totalVerses ? ' disabled' : '') + ' title="다음 절">›</button>';
  content += '<button type="button" class="commentary-nav-btn commentary-nav-btn--chapter" onclick="goToChapterCommentary(' + nextChapter + ')"' + (nextChapter > currentBook.chapters ? ' disabled' : '') + ' title="다음 장">▶</button>';
  content += '</div>';
  content += '</div>';"""

NEW_JS = """  var chapterUnit = getChapterUnit(bookName);
  // 골드 박스 3칸: 이전절 ◀ | 책 장:절 ▼ | 다음절 ▶
  var content = '<div class="commentary-verse-ref">';
  content += '<button type="button" class="commentary-nav-arrow" onclick="goToVerseCommentary(' + prevVerse + ')"' + (prevVerse < 1 ? ' disabled' : '') + ' aria-label="이전 절">◀</button>';
  content += '<button type="button" class="commentary-nav-pick" onclick="openUnifiedBookChapterModal()" aria-label="책·장 선택"><span class="commentary-nav-pick-txt">' + bookName + ' ' + chapter + ':' + verseNum + '</span><span class="commentary-nav-pick-caret">▼</span></button>';
  content += '<button type="button" class="commentary-nav-arrow" onclick="goToVerseCommentary(' + nextVerse + ')"' + (nextVerse > totalVerses ? ' disabled' : '') + ' aria-label="다음 절">▶</button>';
  content += '</div>';"""


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def one(label: str, old: str, new: str) -> None:
        nonlocal text
        n = text.count(old)
        if n != 1:
            raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
        text = text.replace(old, new, 1)

    one("commentary nav css", OLD_CSS, NEW_CSS)
    one("commentary nav js", OLD_JS, NEW_JS)

    PATH.write_text(text, encoding="utf-8")
    print("OK: patch_commentary_nav_3col applied")


if __name__ == "__main__":
    main()
