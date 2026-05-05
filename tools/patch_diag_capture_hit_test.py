#!/usr/bin/env python3
from pathlib import Path

p = Path('reader.html')
text = p.read_text(encoding='utf-8')

insert_after = "<script>(function(){try{var p=new URLSearchParams(location.search);var q=(p.get('q')||'').trim();if(p.get('book')||p.get('testament')==='old'||p.get('testament')==='new'||p.has('easy')||p.has('favorites')||q||p.get('focus')==='search')document.documentElement.classList.add('reader-hide-chrome');}catch(e){}})();</script>"
cap_script = "<script>document.addEventListener('click', function(e) { console.log('[CAPTURE]', e.target.tagName, e.target.id, e.target.className, 'at', e.clientX, e.clientY); }, true);</script>"

if cap_script in text:
    raise SystemExit('capture script already exists')

c = text.count(insert_after)
if c != 1:
    raise SystemExit(f'insert anchor count != 1: {c}')
text = text.replace(insert_after, insert_after + "\n" + cap_script, 1)

old_open_tail = """  body.innerHTML = getVerseRangeModalHtml();
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  attachVerseRangeModalListeners();
}"""

new_open_tail = """  body.innerHTML = getVerseRangeModalHtml();
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  attachVerseRangeModalListeners();
  console.log('[DIAG] handleVerseRangeAllApply:', typeof window.handleVerseRangeAllApply);
  var b = document.getElementById('verseRangeModalAllBtn');
  if (b) {
    var r = b.getBoundingClientRect();
    console.log('[DIAG] btn rect:', r.left, r.top, r.width, r.height);
    var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    console.log('[DIAG] hit at center:', hit ? (hit.tagName + '#' + hit.id + '.' + hit.className) : 'null');
  }
}"""

c2 = text.count(old_open_tail)
if c2 != 1:
    raise SystemExit(f'open tail count != 1: {c2}')
text = text.replace(old_open_tail, new_open_tail, 1)

p.write_text(text, encoding='utf-8')
print('OK: capture + hit-test diagnostics added')
