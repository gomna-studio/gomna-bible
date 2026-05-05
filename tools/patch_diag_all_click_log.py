#!/usr/bin/env python3
from pathlib import Path

p = Path('reader.html')
text = p.read_text(encoding='utf-8')
old = """  if (allBtn) {
    allBtn.addEventListener('click', function() {
      opt4RangeStart = 1;
      opt4RangeEnd = currentVerseCount;
      applyRange(1, currentVerseCount);
      updateVerseRangeBoxLabel();
      closeVerseRangeModal();
    });
  }"""
new = """  if (allBtn) {
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
  }"""

cnt = text.count(old)
if cnt != 1:
    raise SystemExit(f'expected 1 target block, found {cnt}')
text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8')
print('OK: diagnostic logs inserted')
