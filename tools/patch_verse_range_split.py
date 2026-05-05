#!/usr/bin/env python3
"""Verse range modal: side-by-side split grids + column scroll + 3-col cells."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"
MARKER = "verse-range-column-scroll"


def main():
    text = PATH.read_text(encoding="utf-8")
    if MARKER in text:
        print("Already patched. Skipping.")
        return

    css_block = r"""
.verse-range-split{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 16px;align-items:start}
.verse-range-column{display:flex;flex-direction:column;min-width:0}
.verse-range-column-label{font-size:12px;font-weight:500;color:#5a3818;margin-bottom:6px;text-align:center;margin-top:0}
.verse-range-column-scroll{max-height:280px;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0}
.verse-range-split .verse-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:0}
.verse-range-split .verse-cell{min-height:38px;font-size:12px}
"""

    anchor = """.verse-range-apply{padding:14px;border-radius:12px;background:#3d2818;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:4px}
/* verse-read-header */"""

    replacement = (
        """.verse-range-apply{padding:14px;border-radius:12px;background:#3d2818;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:4px}"""
        + css_block
        + "\n/* verse-read-header */"
    )

    old_js = """    '<div id="verseRangePanelRange" style="display:none">' +
    '<p class="verse-range-range-label">시작 절을 선택하세요</p>' +
    '<div class="verse-grid" id="verseRangeStartGrid"></div>' +
    '<p class="verse-range-range-label">끝 절을 선택하세요</p>' +
    '<div class="verse-grid" id="verseRangeEndGrid"></div>' +"""

    new_js = """    '<div id="verseRangePanelRange" style="display:none">' +
    '<div class="verse-range-split">' +
    '<div class="verse-range-column">' +
    '<p class="verse-range-column-label">시작 절</p>' +
    '<div class="verse-range-column-scroll">' +
    '<div class="verse-grid" id="verseRangeStartGrid"></div></div></div>' +
    '<div class="verse-range-column">' +
    '<p class="verse-range-column-label">끝 절</p>' +
    '<div class="verse-range-column-scroll">' +
    '<div class="verse-grid" id="verseRangeEndGrid"></div></div></div></div>' +"""

    if anchor not in text:
        raise SystemExit("MISSING css anchor")
    if old_js not in text:
        raise SystemExit("MISSING getVerseRangeModalHtml fragment")

    text = text.replace(anchor, replacement, 1)
    text = text.replace(old_js, new_js, 1)
    PATH.write_text(text, encoding="utf-8")
    print("ok: css + getVerseRangeModalHtml")
    print("Wrote", PATH)


if __name__ == "__main__":
    main()
