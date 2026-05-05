#!/usr/bin/env python3
from pathlib import Path

p = Path('reader.html')
text = p.read_text(encoding='utf-8')

old_btn = """    '<button type=\"button\" class=\"verse-range-btn-all\" id=\"verseRangeModalAllBtn\">📖 말씀 보기</button>' +"""
new_btn = """    '<button type=\"button\" class=\"verse-range-btn-all\" id=\"verseRangeModalAllBtn\" onclick=\"handleVerseRangeAllApply()\">📖 말씀 보기</button>' +"""

old_insert_anchor = """function attachVerseRangeModalListeners() {
  var allBtn = document.getElementById('verseRangeModalAllBtn');
  if (allBtn) {
    allBtn.addEventListener('click', function() {
      console.log('[ALL CLICK] before:', { opt4RangeStart: opt4RangeStart, opt4RangeEnd: opt4RangeEnd, currentVerseCount: currentVerseCount });
      opt4RangeStart = 1;
      opt4RangeEnd = currentVerseCount;
      applyRange(1, currentVerseCount);
      var _allItems = document.querySelectorAll('.verse-item');
      var _blockCount = 0;
      var _noneCount = 0;
      _allItems.forEach(function(item) {
        var d = item.style.display;
        if (d === 'none') _noneCount++;
        else if (d === 'block' || d === '') _blockCount++;
      });
      console.log('[ALL CLICK] after:', { opt4RangeStart: opt4RangeStart, opt4RangeEnd: opt4RangeEnd, blockCount: _blockCount, noneCount: _noneCount });
      updateVerseRangeBoxLabel();
      closeVerseRangeModal();
    });
  }
  var modeAll = document.getElementById('verseRangeModeAllBtn');
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

new_insert_anchor = """function handleVerseRangeAllApply() {
  console.log('[ALL CLICK] before:', { opt4RangeStart: opt4RangeStart, opt4RangeEnd: opt4RangeEnd, currentVerseCount: currentVerseCount });
  opt4RangeStart = 1;
  opt4RangeEnd = currentVerseCount;
  applyRange(1, currentVerseCount);
  var _allItems = document.querySelectorAll('.verse-item');
  var _blockCount = 0;
  var _noneCount = 0;
  _allItems.forEach(function(item) {
    var d = item.style.display;
    if (d === 'none') _noneCount++;
    else if (d === 'block' || d === '') _blockCount++;
  });
  console.log('[ALL CLICK] after:', { opt4RangeStart: opt4RangeStart, opt4RangeEnd: opt4RangeEnd, blockCount: _blockCount, noneCount: _noneCount });
  updateVerseRangeBoxLabel();
  closeVerseRangeModal();
}

function attachVerseRangeModalListeners() {
  // mode 탭은 inline onclick(setVerseRangeModeExternal)만 사용
  // 초기 상태를 전체 보기로 명시
  setVerseRangeModeExternal('all');"""


def one_replace(label, old, new):
    global text
    c = text.count(old)
    if c != 1:
        raise SystemExit(f"{label}: expected 1, found {c}")
    text = text.replace(old, new, 1)

one_replace('all button html', old_btn, new_btn)
one_replace('attach block', old_insert_anchor, new_insert_anchor)

p.write_text(text, encoding='utf-8')
print('OK: all button path unified')
