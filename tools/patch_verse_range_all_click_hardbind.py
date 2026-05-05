#!/usr/bin/env python3
from pathlib import Path

p = Path('reader.html')
text = p.read_text(encoding='utf-8')

old_css = ".verse-range-modal-footer{flex-shrink:0;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0));margin:0 -16px 0;background:#faf6ed;border-top:1px solid rgba(180,140,90,.22);box-sizing:content-box}"
new_css = ".verse-range-modal-footer{flex-shrink:0;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0));margin:0 -16px 0;background:#faf6ed;border-top:1px solid rgba(180,140,90,.22);box-sizing:content-box;position:relative;z-index:2;pointer-events:auto}"

old_btn_css = ".verse-range-btn-all{padding:14px;border-radius:12px;border:none;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#B8860B,#9a7018);color:#fff;width:100%}"
new_btn_css = ".verse-range-btn-all{padding:14px;border-radius:12px;border:none;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#B8860B,#9a7018);color:#fff;width:100%;position:relative;z-index:3;pointer-events:auto}"

old_fn_tail = """function handleVerseRangeAllApply() {
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

function attachVerseRangeModalListeners() {"""

new_fn_tail = """function handleVerseRangeAllApply() {
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
window.handleVerseRangeAllApply = handleVerseRangeAllApply;

function attachVerseRangeModalListeners() {"""

old_attach_head = """function attachVerseRangeModalListeners() {
  // mode 탭은 inline onclick(setVerseRangeModeExternal)만 사용
  // 초기 상태를 전체 보기로 명시
  setVerseRangeModeExternal('all');"""

new_attach_head = """function attachVerseRangeModalListeners() {
  var allBtn = document.getElementById('verseRangeModalAllBtn');
  if (allBtn) allBtn.onclick = handleVerseRangeAllApply;
  // mode 탭은 inline onclick(setVerseRangeModeExternal)만 사용
  // 초기 상태를 전체 보기로 명시
  setVerseRangeModeExternal('all');"""


def rep(label, old, new):
    global text
    c = text.count(old)
    if c != 1:
        raise SystemExit(f"{label}: expected 1, found {c}")
    text = text.replace(old, new, 1)

rep('footer css', old_css, new_css)
rep('all btn css', old_btn_css, new_btn_css)
rep('all fn window bind', old_fn_tail, new_fn_tail)
rep('attach head', old_attach_head, new_attach_head)

p.write_text(text, encoding='utf-8')
print('OK: hard bind + hit test guard applied')
