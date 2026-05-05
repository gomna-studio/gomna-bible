#!/usr/bin/env python3
"""절 범위 모달 탭 전환 안정화: 전체/범위 모드 강제 토글 함수 도입."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD = """  var modeAll = document.getElementById('verseRangeModeAllBtn');
  var modeRange = document.getElementById('verseRangeModeRangeBtn');
  var panelAll = document.getElementById('verseRangePanelAll');
  var panelRange = document.getElementById('verseRangePanelRange');
  if (modeAll && modeRange && panelAll && panelRange) {
    modeAll.addEventListener('click', function() {
      modeAll.classList.add('active');
      modeRange.classList.remove('active');
      panelAll.style.display = 'block';
      panelRange.style.display = 'none';
      var bAll = document.getElementById('verseRangeModalAllBtn');
      var bAp = document.getElementById('verseRangeApplyBtn');
      if (bAll) bAll.style.display = '';
      if (bAp) bAp.style.display = 'none';
    });
    modeRange.addEventListener('click', function() {
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
    });
  }"""

NEW = """  var modeAll = document.getElementById('verseRangeModeAllBtn');
  var modeRange = document.getElementById('verseRangeModeRangeBtn');
  var panelAll = document.getElementById('verseRangePanelAll');
  var panelRange = document.getElementById('verseRangePanelRange');

  function setVerseRangeMode(mode) {
    if (!modeAll || !modeRange || !panelAll || !panelRange) return;
    var bAll = document.getElementById('verseRangeModalAllBtn');
    var bAp = document.getElementById('verseRangeApplyBtn');

    if (mode === 'all') {
      modeAll.classList.add('active');
      modeRange.classList.remove('active');
      panelAll.style.display = 'block';
      panelRange.style.display = 'none';
      if (bAll) bAll.style.display = '';
      if (bAp) bAp.style.display = 'none';
      return;
    }

    modeRange.classList.add('active');
    modeAll.classList.remove('active');
    panelRange.style.display = 'block';
    panelAll.style.display = 'none';
    if (bAll) bAll.style.display = 'none';
    if (bAp) bAp.style.display = '';
    verseRangeSelStart = 0;
    verseRangeSelEnd = 0;
    verseRangeRenderStartGrid();
    verseRangeRenderEndGrid();
    verseRangeRefreshPreview();
    verseRangeUpdateApplyBtnState();
  }

  if (modeAll && modeRange && panelAll && panelRange) {
    modeAll.addEventListener('click', function() {
      setVerseRangeMode('all');
    });
    modeRange.addEventListener('click', function() {
      setVerseRangeMode('range');
    });
    // 초기 상태를 전체 보기로 명시
    setVerseRangeMode('all');
  }"""


def main() -> None:
    text = PATH.read_text(encoding='utf-8')
    n = text.count(OLD)
    if n != 1:
      raise SystemExit(f"expected 1 mode toggle block, found {n}")
    text = text.replace(OLD, NEW, 1)
    PATH.write_text(text, encoding='utf-8')
    print('OK: patch_verse_range_mode_toggle_fix applied')

if __name__ == '__main__':
    main()
