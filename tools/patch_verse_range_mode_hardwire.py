#!/usr/bin/env python3
"""절 범위 모달 탭 전환 하드와이어: inline onclick + 전역 전환 함수로 안정화."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_HTML_BTNS = """    '<button type=\"button\" class=\"active\" id=\"verseRangeModeAllBtn\">전체 보기</button>' +
    '<button type=\"button\" id=\"verseRangeModeRangeBtn\">절 범위 선택</button></div>' +"""

NEW_HTML_BTNS = """    '<button type=\"button\" class=\"active\" id=\"verseRangeModeAllBtn\" onclick=\"setVerseRangeModeExternal(\\'all\\')\">전체 보기</button>' +
    '<button type=\"button\" id=\"verseRangeModeRangeBtn\" onclick=\"setVerseRangeModeExternal(\\'range\\')\">절 범위 선택</button></div>' +"""

INSERT_POINT = """function attachVerseRangeModalListeners() {
  var allBtn = document.getElementById('verseRangeModalAllBtn');"""

INSERT_BLOCK = """function setVerseRangeModeExternal(mode) {
  var modeAll = document.getElementById('verseRangeModeAllBtn');
  var modeRange = document.getElementById('verseRangeModeRangeBtn');
  var panelAll = document.getElementById('verseRangePanelAll');
  var panelRange = document.getElementById('verseRangePanelRange');
  var bAll = document.getElementById('verseRangeModalAllBtn');
  var bAp = document.getElementById('verseRangeApplyBtn');

  if (!modeAll || !modeRange || !panelAll || !panelRange) return;

  if (mode === 'all') {
    console.log('[verseRange] switch mode -> all');
    modeAll.classList.add('active');
    modeRange.classList.remove('active');
    panelAll.style.display = 'block';
    panelRange.style.display = 'none';
    if (bAll) bAll.style.display = '';
    if (bAp) bAp.style.display = 'none';
    return;
  }

  console.log('[verseRange] switch mode -> range');
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

function attachVerseRangeModalListeners() {
  var allBtn = document.getElementById('verseRangeModalAllBtn');"""

OLD_ATTACH_BLOCK = """  var modeAll = document.getElementById('verseRangeModeAllBtn');
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

NEW_ATTACH_BLOCK = """  var modeAll = document.getElementById('verseRangeModeAllBtn');
  var modeRange = document.getElementById('verseRangeModeRangeBtn');
  if (modeAll) {
    modeAll.addEventListener('click', function() {
      setVerseRangeModeExternal('all');
    });
  }
  if (modeRange) {
    modeRange.addEventListener('click', function() {
      setVerseRangeModeExternal('range');
    });
  }
  // 초기 상태를 전체 보기로 명시
  setVerseRangeModeExternal('all');"""


def main() -> None:
    text = PATH.read_text(encoding='utf-8')

    def one(label: str, old: str, new: str) -> None:
        nonlocal text
        n = text.count(old)
        if n != 1:
            raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
        text = text.replace(old, new, 1)

    one('mode buttons html', OLD_HTML_BTNS, NEW_HTML_BTNS)
    one('insert external mode function', INSERT_POINT, INSERT_BLOCK)
    one('replace attach mode block', OLD_ATTACH_BLOCK, NEW_ATTACH_BLOCK)

    PATH.write_text(text, encoding='utf-8')
    print('OK: patch_verse_range_mode_hardwire applied')

if __name__ == '__main__':
    main()
