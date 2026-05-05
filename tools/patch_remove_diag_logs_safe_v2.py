#!/usr/bin/env python3
from pathlib import Path

p = Path('reader.html')
text = p.read_text(encoding='utf-8')

blocks = [
    "<script>document.addEventListener('click', function(e) { console.log('[CAPTURE]', e.target.tagName, e.target.id, e.target.className, 'at', e.clientX, e.clientY); }, true);</script>\n",
    """  console.log('[DIAG] handleVerseRangeAllApply:', typeof window.handleVerseRangeAllApply);\n  var b = document.getElementById('verseRangeApplyBtn');\n  if (b) {\n    var r = b.getBoundingClientRect();\n    console.log('[DIAG] apply btn rect:', r.left, r.top, r.width, r.height);\n    var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);\n    console.log('[DIAG] hit at apply center:', hit ? (hit.tagName + '#' + hit.id + '.' + hit.className) : 'null');\n  }\n""",
    "  console.log('[ALL CLICK] before:', { opt4RangeStart: opt4RangeStart, opt4RangeEnd: opt4RangeEnd, currentVerseCount: currentVerseCount });\n",
    """  var _allItems = document.querySelectorAll('.verse-item');\n  var _blockCount = 0;\n  var _noneCount = 0;\n  _allItems.forEach(function(item) {\n    var d = item.style.display;\n    if (d === 'none') _noneCount++;\n    else if (d === 'block' || d === '') _blockCount++;\n  });\n""",
    "  console.log('[ALL CLICK] after:', { opt4RangeStart: opt4RangeStart, opt4RangeEnd: opt4RangeEnd, blockCount: _blockCount, noneCount: _noneCount });\n",
    "    console.log('[verseRange] switch mode -> all');\n",
    "  console.log('[verseRange] switch mode -> range');\n",
]

for i, b in enumerate(blocks, 1):
    c = text.count(b)
    if c != 1:
        raise SystemExit(f'block{i} expected 1 found {c}')
    text = text.replace(b, '', 1)

# guard: ensure 핵심 5줄 존재
required = [
    'opt4RangeStart = 1;',
    'opt4RangeEnd = currentVerseCount;',
    'applyRange(1, currentVerseCount);',
    'updateVerseRangeBoxLabel();',
    'closeVerseRangeModal();',
]
for r in required:
    if r not in text:
        raise SystemExit(f'missing required line: {r}')

p.write_text(text, encoding='utf-8')
print('OK: safe diagnostic log removal applied')
