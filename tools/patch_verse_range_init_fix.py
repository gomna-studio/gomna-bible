#!/usr/bin/env python3
"""절 범위 모드 초기 색칠 버그 수정: 모드 진입 시 start/end 초기화 + 적용 버튼 상태 제어."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_BLOCK = """function verseRangeRefreshPreview() {
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

function verseRangeRangeClass(v) {"""

NEW_BLOCK = """function verseRangeRefreshPreview() {
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

function verseRangeUpdateApplyBtnState() {
  var applyBtn = document.getElementById('verseRangeApplyBtn');
  if (!applyBtn) return;
  var ok = verseRangeSelStart > 0 && verseRangeSelEnd > 0 && verseRangeSelEnd >= verseRangeSelStart;
  applyBtn.disabled = !ok;
  applyBtn.style.opacity = ok ? '1' : '0.45';
  applyBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
}

function verseRangeRangeClass(v) {"""

OLD_MODE_RANGE = """    modeRange.addEventListener('click', function() {
      modeRange.classList.add('active');
      modeAll.classList.remove('active');
      panelRange.style.display = 'block';
      panelAll.style.display = 'none';
      var bAll = document.getElementById('verseRangeModalAllBtn');
      var bAp = document.getElementById('verseRangeApplyBtn');
      if (bAll) bAll.style.display = 'none';
      if (bAp) bAp.style.display = '';
    });"""

NEW_MODE_RANGE = """    modeRange.addEventListener('click', function() {
      modeRange.classList.add('active');
      modeAll.classList.remove('active');
      panelRange.style.display = 'block';
      panelAll.style.display = 'none';
      var bAll = document.getElementById('verseRangeModalAllBtn');
      var bAp = document.getElementById('verseRangeApplyBtn');
      if (bAll) bAll.style.display = 'none';
      if (bAp) bAp.style.display = '';
      verseRangeSelStart = 0;
      verseRangeSelEnd = 0;
      verseRangeRenderStartGrid();
      verseRangeRenderEndGrid();
      verseRangeRefreshPreview();
      verseRangeUpdateApplyBtnState();
    });"""

OLD_AFTER_RENDER = """  verseRangeRenderStartGrid();
  verseRangeRenderEndGrid();
  verseRangeRefreshPreview();"""

NEW_AFTER_RENDER = """  verseRangeRenderStartGrid();
  verseRangeRenderEndGrid();
  verseRangeRefreshPreview();
  verseRangeUpdateApplyBtnState();"""

OLD_START_CLICK = """      verseRangeSelStart = parseInt(t.getAttribute('data-v'), 10);
      if (verseRangeSelEnd > 0 && verseRangeSelEnd < verseRangeSelStart) verseRangeSelEnd = 0;
      verseRangeRenderStartGrid();
      verseRangeRenderEndGrid();
      verseRangeRefreshPreview();"""

NEW_START_CLICK = """      verseRangeSelStart = parseInt(t.getAttribute('data-v'), 10);
      if (verseRangeSelEnd > 0 && verseRangeSelEnd < verseRangeSelStart) verseRangeSelEnd = 0;
      verseRangeRenderStartGrid();
      verseRangeRenderEndGrid();
      verseRangeRefreshPreview();
      verseRangeUpdateApplyBtnState();"""

OLD_END_CLICK = """      verseRangeSelEnd = v;
      verseRangeRenderEndGrid();
      verseRangeRenderStartGrid();
      verseRangeRefreshPreview();"""

NEW_END_CLICK = """      verseRangeSelEnd = v;
      verseRangeRenderEndGrid();
      verseRangeRenderStartGrid();
      verseRangeRefreshPreview();
      verseRangeUpdateApplyBtnState();"""


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def one(label: str, old: str, new: str) -> None:
      nonlocal text
      n = text.count(old)
      if n != 1:
          raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
      text = text.replace(old, new, 1)

    one("insert apply state helper", OLD_BLOCK, NEW_BLOCK)
    one("modeRange reset", OLD_MODE_RANGE, NEW_MODE_RANGE)
    one("initial apply state", OLD_AFTER_RENDER, NEW_AFTER_RENDER)
    one("start click apply state", OLD_START_CLICK, NEW_START_CLICK)
    one("end click apply state", OLD_END_CLICK, NEW_END_CLICK)

    PATH.write_text(text, encoding="utf-8")
    print("OK: patch_verse_range_init_fix applied")


if __name__ == "__main__":
    main()
