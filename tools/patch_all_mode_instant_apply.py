#!/usr/bin/env python3
from pathlib import Path

p = Path('reader.html')
text = p.read_text(encoding='utf-8')

old_tabs = """    '<button type=\"button\" class=\"active\" id=\"verseRangeModeAllBtn\" onclick=\"setVerseRangeModeExternal(\\'all\\')\">전체 보기</button>' +
    '<button type=\"button\" id=\"verseRangeModeRangeBtn\" onclick=\"setVerseRangeModeExternal(\\'range\\')\">절 범위 선택</button></div>' +"""
new_tabs = """    '<button type=\"button\" class=\"active\" id=\"verseRangeModeAllBtn\" onclick=\"setVerseRangeModeExternal(\\'all\\', true)\">전체 보기</button>' +
    '<button type=\"button\" id=\"verseRangeModeRangeBtn\" onclick=\"setVerseRangeModeExternal(\\'range\\', true)\">절 범위 선택</button></div>' +"""

old_footer = """    '<div class=\"verse-range-modal-footer\">' +
    '<button type=\"button\" class=\"verse-range-btn-all\" id=\"verseRangeModalAllBtn\" onclick=\"handleVerseRangeAllApply()\">📖 말씀 보기</button>' +
    '<button type=\"button\" class=\"verse-range-apply\" id=\"verseRangeApplyBtn\" style=\"display:none\">📖 말씀 보기</button></div></div>';"""
new_footer = """    '<div class=\"verse-range-modal-footer\">' +
    '<button type=\"button\" class=\"verse-range-apply\" id=\"verseRangeApplyBtn\" style=\"display:none\">📖 말씀 보기</button></div></div>';"""

old_mode_fn = """function setVerseRangeModeExternal(mode) {
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
}"""

new_mode_fn = """function setVerseRangeModeExternal(mode, fromUser) {
  var modeAll = document.getElementById('verseRangeModeAllBtn');
  var modeRange = document.getElementById('verseRangeModeRangeBtn');
  var panelAll = document.getElementById('verseRangePanelAll');
  var panelRange = document.getElementById('verseRangePanelRange');
  var bAp = document.getElementById('verseRangeApplyBtn');

  if (!modeAll || !modeRange || !panelAll || !panelRange) return;

  if (mode === 'all') {
    console.log('[verseRange] switch mode -> all');
    modeAll.classList.add('active');
    modeRange.classList.remove('active');
    panelAll.style.display = 'block';
    panelRange.style.display = 'none';
    if (bAp) bAp.style.display = 'none';
    if (fromUser) {
      handleVerseRangeAllApply();
    }
    return;
  }

  console.log('[verseRange] switch mode -> range');
  modeRange.classList.add('active');
  modeAll.classList.remove('active');
  panelRange.style.display = 'block';
  panelAll.style.display = 'none';
  if (bAp) bAp.style.display = '';
  verseRangeSelStart = 0;
  verseRangeSelEnd = 0;
  verseRangeRenderStartGrid();
  verseRangeRenderEndGrid();
  verseRangeRefreshPreview();
  verseRangeUpdateApplyBtnState();
}"""

old_initial = "setVerseRangeModeExternal('all');"
new_initial = "setVerseRangeModeExternal('all', false);"

old_diag = """  var b = document.getElementById('verseRangeModalAllBtn');
  if (b) {
    var r = b.getBoundingClientRect();
    console.log('[DIAG] btn rect:', r.left, r.top, r.width, r.height);
    var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    console.log('[DIAG] hit at center:', hit ? (hit.tagName + '#' + hit.id + '.' + hit.className) : 'null');
  }"""
new_diag = """  var b = document.getElementById('verseRangeApplyBtn');
  if (b) {
    var r = b.getBoundingClientRect();
    console.log('[DIAG] apply btn rect:', r.left, r.top, r.width, r.height);
    var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    console.log('[DIAG] hit at apply center:', hit ? (hit.tagName + '#' + hit.id + '.' + hit.className) : 'null');
  }"""


def rep(label, old, new):
    global text
    c = text.count(old)
    if c != 1:
      raise SystemExit(f"{label}: expected 1, found {c}")
    text = text.replace(old, new, 1)

rep('tabs inline', old_tabs, new_tabs)
rep('footer button', old_footer, new_footer)
rep('mode function', old_mode_fn, new_mode_fn)
rep('initial all call', old_initial, new_initial)
rep('open modal diag target', old_diag, new_diag)

p.write_text(text, encoding='utf-8')
print('OK: all-mode instant apply UX patch applied')
