#!/usr/bin/env python3
"""절 범위 모달: 양열 구분선 + 선택 범위 골드 색칠(끝점 진한색)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_CSS = """.verse-range-split{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 12px;align-items:start}
.verse-range-column{display:flex;flex-direction:column;min-width:0}
.verse-range-column-label{font-size:12px;font-weight:500;color:#5a3818;margin-bottom:6px;text-align:center;margin-top:0}
.verse-range-column-scroll{max-height:none;overflow:visible;min-height:0}
.verse-range-split .verse-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:0}
.verse-range-split .verse-cell{min-height:38px;font-size:12px}"""

NEW_CSS = """.verse-range-split{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:12px 0 12px;align-items:stretch}
.verse-range-column{display:flex;flex-direction:column;min-width:0}
.verse-range-column:first-child{padding-right:8px;border-right:1px solid #e0d8cc}
.verse-range-column:last-child{padding-left:8px}
.verse-range-column-label{font-size:12px;font-weight:500;color:#5a3818;margin-bottom:6px;text-align:center;margin-top:0}
.verse-range-column-scroll{max-height:none;overflow:visible;min-height:0}
.verse-range-split .verse-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:0}
.verse-range-split .verse-cell{min-height:38px;font-size:12px}
.verse-range-split .verse-cell.verse-cell--range-mid{background:#c89849;color:#fff;border-color:#a87a35;font-weight:600}
.verse-range-split .verse-cell.verse-cell--range-end{background:#a87a35;color:#fff;border-color:#8f6b2c;font-weight:700}"""

OLD_RENDER_START = """function verseRangeRenderStartGrid() {
  var host = document.getElementById('verseRangeStartGrid');
  if (!host) return;
  var html = '';
  for (var v = 1; v <= verseRangeModalMax; v++) {
    var sel = (v === verseRangeSelStart) ? ' selected' : '';
    html += '<button type="button" class="verse-cell' + sel + '" data-v="' + v + '">' + v + '</button>';
  }
  host.innerHTML = html;
}"""

NEW_RENDER_START = """function verseRangeRangeClass(v) {
  var s = verseRangeSelStart, e = verseRangeSelEnd;
  if (s <= 0) return '';
  if (e > 0 && e >= s) {
    if (v < s || v > e) return '';
    return (v === s || v === e) ? ' verse-cell--range-end' : ' verse-cell--range-mid';
  }
  return (v === s) ? ' verse-cell--range-end' : '';
}

function verseRangeRenderStartGrid() {
  var host = document.getElementById('verseRangeStartGrid');
  if (!host) return;
  var html = '';
  for (var v = 1; v <= verseRangeModalMax; v++) {
    var rc = verseRangeRangeClass(v);
    html += '<button type="button" class="verse-cell' + rc + '" data-v="' + v + '">' + v + '</button>';
  }
  host.innerHTML = html;
}"""

OLD_RENDER_END = """function verseRangeRenderEndGrid() {
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
}"""

NEW_RENDER_END = """function verseRangeRenderEndGrid() {
  var host = document.getElementById('verseRangeEndGrid');
  if (!host) return;
  var start = verseRangeSelStart;
  var html = '';
  for (var v = 1; v <= verseRangeModalMax; v++) {
    var isDis = start <= 0 || v < start;
    var dis = isDis ? ' disabled' : '';
    var rc = (!isDis) ? verseRangeRangeClass(v) : '';
    var disAttr = isDis ? ' disabled' : '';
    html += '<button type="button" class="verse-cell' + dis + rc + '"' + disAttr + ' data-v="' + v + '">' + v + '</button>';
  }
  host.innerHTML = html;
}"""

OLD_END_CLICK = """      verseRangeSelEnd = v;
      verseRangeRenderEndGrid();
      verseRangeRefreshPreview();
    });
  }
  var applyBtn = document.getElementById('verseRangeApplyBtn');"""

NEW_END_CLICK = """      verseRangeSelEnd = v;
      verseRangeRenderEndGrid();
      verseRangeRenderStartGrid();
      verseRangeRefreshPreview();
    });
  }
  var applyBtn = document.getElementById('verseRangeApplyBtn');"""


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def one(label: str, old: str, new: str) -> None:
        nonlocal text
        n = text.count(old)
        if n != 1:
            raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
        text = text.replace(old, new, 1)

    one("verse-range-split css", OLD_CSS, NEW_CSS)
    one("verseRangeRenderStartGrid block", OLD_RENDER_START, NEW_RENDER_START)
    one("verseRangeRenderEndGrid block", OLD_RENDER_END, NEW_RENDER_END)
    one("end grid click refresh", OLD_END_CLICK, NEW_END_CLICK)

    PATH.write_text(text, encoding="utf-8")
    print("OK: patch_verse_range_split_highlight applied")


if __name__ == "__main__":
    main()
