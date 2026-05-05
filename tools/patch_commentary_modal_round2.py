#!/usr/bin/env python3
"""말씀풀이 모달 2차: 헤더 밝은 갈색, 탭 3줄 wrap, 장·절 네비 한 줄 슬림."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_HEADER_BG = "background:#5a3818; border-radius:20px 20px 0 0"
NEW_HEADER_BG = "background:#8b5e2c; border-radius:20px 20px 0 0"

OLD_TAB_BLOCK = """.commentary-tabs{display:flex;flex-wrap:nowrap;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #E8E0D8;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scrollbar-width:none;-ms-overflow-style:none}
.commentary-tabs::-webkit-scrollbar{display:none}
.commentary-tab{background:transparent;border:0.5px solid rgba(180,140,90,.3);padding:10px 16px;border-radius:18px;font-size:12px;font-weight:600;color:#5a3818;cursor:pointer;font-family:inherit;min-width:70px;min-height:44px;text-align:center;box-sizing:border-box;flex-shrink:0;scroll-snap-align:start;display:inline-flex;align-items:center;justify-content:center}"""

NEW_TAB_BLOCK = """.commentary-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #E8E0D8;overflow-x:visible;justify-content:center}
.commentary-tab{background:transparent;border:0.5px solid rgba(180,140,90,.3);padding:10px 16px;border-radius:18px;font-size:12px;font-weight:600;color:#5a3818;cursor:pointer;font-family:inherit;min-width:70px;min-height:44px;text-align:center;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center}"""

OLD_VERSE_CSS = """.commentary-verse-ref{background:#B8860B;padding:12px 16px;border-radius:8px;margin-bottom:12px;color:#fff;text-align:center}
.commentary-nav-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.commentary-nav-btn{background:transparent;border:none;color:#fff;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s;border-radius:4px;font-family:inherit}
.commentary-nav-btn:hover{background:rgba(255,255,255,0.2)}
.commentary-nav-btn:active{background:rgba(255,255,255,0.3)}
.commentary-nav-btn:disabled{opacity:0.4;cursor:not-allowed}
.commentary-nav-btn:disabled:hover{background:transparent}
.commentary-current-ref{font-size:17px;font-weight:700}"""

NEW_VERSE_CSS = """.commentary-verse-ref{background:#B8860B;padding:6px 10px;border-radius:8px;margin-bottom:10px;color:#fff;text-align:center}
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

OLD_NAV_JS = """  var chapterUnit = getChapterUnit(bookName);
  // 2줄 네비게이션 헤더 생성
  var content = '<div class="commentary-verse-ref">';
  
  // 하단 네비게이션 (각 탭에서 사용)
  var bottomNav = '<div class="commentary-bottom-nav" style="display:flex; justify-content:space-between; padding:10px 5px; margin-top:10px; border-top:1px solid #ddd;">';
  bottomNav += '<button class="commentary-nav-btn" onclick="goToVerseCommentary(' + prevVerse + ')"' + (prevVerse < 1 ? ' disabled' : '') + ' style="flex:1; margin-right:5px;">◀ 이전절</button>';
  bottomNav += '<button class="commentary-nav-btn" onclick="goToVerseCommentary(' + nextVerse + ')"' + (nextVerse > totalVerses ? ' disabled' : '') + ' style="flex:1; margin-left:5px;">다음절 ▶</button>';
  bottomNav += '</div>';
  // 1줄: 이전장/다음장
  content += '<div class="commentary-nav-row">';
  content += '<button class="commentary-nav-btn" onclick="goToChapterCommentary(' + prevChapter + ')"' + (prevChapter < 1 ? ' disabled' : '') + '>◀ ' + prevChapter + chapterUnit + '</button>';
  content += '<span style="font-size:12px;opacity:0.8;">' + bookName + '</span>';
  content += '<button class="commentary-nav-btn" onclick="goToChapterCommentary(' + nextChapter + ')"' + (nextChapter > currentBook.chapters ? ' disabled' : '') + '>' + nextChapter + chapterUnit + ' ▶</button>';
  content += '</div>';
  // 2줄: 이전절/현재절/다음절
  content += '<div class="commentary-nav-row">';
  content += '<button class="commentary-nav-btn" onclick="goToVerseCommentary(' + prevVerse + ')"' + (prevVerse < 1 ? ' disabled' : '') + '>◀ 이전절</button>';
  content += '<span class="commentary-current-ref">' + chapter + ':' + verseNum + '</span>';
  content += '<button class="commentary-nav-btn" onclick="goToVerseCommentary(' + nextVerse + ')"' + (nextVerse > totalVerses ? ' disabled' : '') + '>다음절 ▶</button>';
  content += '</div>';
  content += '</div>';"""

NEW_NAV_JS = """  var chapterUnit = getChapterUnit(bookName);
  // 한 줄 슬림 장·절 네비 (◀장 ‹절  책명 장:절  절› 장▶)
  var content = '<div class="commentary-verse-ref">';
  content += '<div class="commentary-nav-slim">';
  content += '<button type="button" class="commentary-nav-btn commentary-nav-btn--chapter" onclick="goToChapterCommentary(' + prevChapter + ')"' + (prevChapter < 1 ? ' disabled' : '') + ' title="이전 장">◀</button>';
  content += '<button type="button" class="commentary-nav-btn commentary-nav-btn--verse" onclick="goToVerseCommentary(' + prevVerse + ')"' + (prevVerse < 1 ? ' disabled' : '') + ' title="이전 절">‹</button>';
  content += '<span class="commentary-slim-center" title="' + bookName + ' ' + chapter + ':' + verseNum + '"><span class="commentary-slim-book">' + bookName + '</span> <span class="commentary-slim-ref">' + chapter + ':' + verseNum + '</span></span>';
  content += '<button type="button" class="commentary-nav-btn commentary-nav-btn--verse" onclick="goToVerseCommentary(' + nextVerse + ')"' + (nextVerse > totalVerses ? ' disabled' : '') + ' title="다음 절">›</button>';
  content += '<button type="button" class="commentary-nav-btn commentary-nav-btn--chapter" onclick="goToChapterCommentary(' + nextChapter + ')"' + (nextChapter > currentBook.chapters ? ' disabled' : '') + ' title="다음 장">▶</button>';
  content += '</div>';
  content += '</div>';
  
  // 하단 네비게이션 (각 탭에서 사용)
  var bottomNav = '<div class="commentary-bottom-nav" style="display:flex; justify-content:space-between; padding:10px 5px; margin-top:10px; border-top:1px solid #ddd;">';
  bottomNav += '<button class="commentary-nav-btn" onclick="goToVerseCommentary(' + prevVerse + ')"' + (prevVerse < 1 ? ' disabled' : '') + ' style="flex:1; margin-right:5px;">◀ 이전절</button>';
  bottomNav += '<button class="commentary-nav-btn" onclick="goToVerseCommentary(' + nextVerse + ')"' + (nextVerse > totalVerses ? ' disabled' : '') + ' style="flex:1; margin-left:5px;">다음절 ▶</button>';
  bottomNav += '</div>';"""


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def one(label: str, old: str, new: str) -> None:
        nonlocal text
        n = text.count(old)
        if n != 1:
            raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
        text = text.replace(old, new, 1)

    one("header bg", OLD_HEADER_BG, NEW_HEADER_BG)
    one("tab css", OLD_TAB_BLOCK, NEW_TAB_BLOCK)
    one("verse nav css", OLD_VERSE_CSS, NEW_VERSE_CSS)
    one("verse nav js", OLD_NAV_JS, NEW_NAV_JS)

    PATH.write_text(text, encoding="utf-8")
    print("OK: patch_commentary_modal_round2 applied")


if __name__ == "__main__":
    main()
