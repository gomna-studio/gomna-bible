#!/usr/bin/env python3
"""절 범위 모달: 끝절 미선택 시 끝그리드 무색칠 + 중앙 구분선 강화."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_DIVIDER = ".verse-range-column:first-child{padding-right:8px;border-right:1px solid #e0d8cc}"
NEW_DIVIDER = ".verse-range-column:first-child{padding-right:8px;border-right:2px solid #c89849}"

OLD_END_GRID = """function verseRangeRenderEndGrid() {
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

NEW_END_GRID = """function verseRangeRenderEndGrid() {
  var host = document.getElementById('verseRangeEndGrid');
  if (!host) return;
  var start = verseRangeSelStart;
  var html = '';
  for (var v = 1; v <= verseRangeModalMax; v++) {
    var isDis = start <= 0 || v < start;
    var dis = isDis ? ' disabled' : '';
    var rc = (!isDis && verseRangeSelEnd > 0) ? verseRangeRangeClass(v) : '';
    var disAttr = isDis ? ' disabled' : '';
    html += '<button type="button" class="verse-cell' + dis + rc + '"' + disAttr + ' data-v="' + v + '">' + v + '</button>';
  }
  host.innerHTML = html;
}"""


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def one(label: str, old: str, new: str) -> None:
        nonlocal text
        n = text.count(old)
        if n != 1:
            raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
        text = text.replace(old, new, 1)

    one("divider style", OLD_DIVIDER, NEW_DIVIDER)
    one("end grid render", OLD_END_GRID, NEW_END_GRID)

    PATH.write_text(text, encoding="utf-8")
    print("OK: patch_verse_range_endgrid_fix_and_divider applied")


if __name__ == "__main__":
    main()
