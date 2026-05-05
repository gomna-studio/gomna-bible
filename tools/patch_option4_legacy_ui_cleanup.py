#!/usr/bin/env python3
"""옵션4 하이브리드: 옛 상단 헤더/3카드/검색바 비노출 + searchInput null-safe."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'reader.html'

MARKER = '/* option-4-hybrid */'
INSERT_BLOCK = '/* option4-legacy-ui-cleanup */\n.header,.tabs{display:none!important}\n'

OLD_LISTENER = "document.getElementById('searchInput').addEventListener('keypress', function(e) { if(e.key === 'Enter') doSearch(); });"
NEW_LISTENER = "var _si=document.getElementById('searchInput');if(_si)_si.addEventListener('keypress', function(e) { if(e.key === 'Enter') doSearch(); });"


def main() -> None:
    text = PATH.read_text(encoding='utf-8')

    if INSERT_BLOCK in text:
        raise SystemExit('cleanup block already exists')

    n = text.count(MARKER)
    if n != 1:
        raise SystemExit(f'marker count != 1: {n}')
    text = text.replace(MARKER, INSERT_BLOCK + MARKER, 1)

    n2 = text.count(OLD_LISTENER)
    if n2 != 1:
        raise SystemExit(f'search listener anchor count != 1: {n2}')
    text = text.replace(OLD_LISTENER, NEW_LISTENER, 1)

    PATH.write_text(text, encoding='utf-8')
    print('OK: patch_option4_legacy_ui_cleanup applied')


if __name__ == '__main__':
    main()
