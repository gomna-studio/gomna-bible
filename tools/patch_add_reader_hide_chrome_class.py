#!/usr/bin/env python3
from pathlib import Path

p = Path('reader.html')
text = p.read_text(encoding='utf-8')
old = '<html lang="ko">'
new = '<html lang="ko" class="reader-hide-chrome">'
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected 1 match, found {count}')
text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8')
print('OK: html class updated')
