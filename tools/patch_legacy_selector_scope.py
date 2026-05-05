#!/usr/bin/env python3
from pathlib import Path

p = Path('reader.html')
text = p.read_text(encoding='utf-8')
old = '.header,.tabs{display:none!important}'
new = 'header.header,\nnav.tabs {\n  display: none !important;\n}'
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected 1 match, found {count}')
text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8')
print('OK: selector updated')
