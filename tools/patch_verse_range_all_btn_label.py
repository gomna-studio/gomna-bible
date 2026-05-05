#!/usr/bin/env python3
"""Verse range modal: '전체 보기' panel big button label -> '📖 말씀 보기' (behavior unchanged)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD = """    '<button type="button" class="verse-range-btn-all" id="verseRangeModalAllBtn">전체 보기</button></div>' +"""
NEW = """    '<button type="button" class="verse-range-btn-all" id="verseRangeModalAllBtn">📖 말씀 보기</button></div>' +"""


def main():
    text = PATH.read_text(encoding="utf-8")
    if 'ModalAllBtn">\U0001f4d6 말씀 보기</button>' in text:
        print("Already patched. Skipping.")
        return
    if OLD not in text:
        raise SystemExit("MISSING: verseRangeModalAllBtn label")
    text = text.replace(OLD, NEW, 1)
    PATH.write_text(text, encoding="utf-8")
    print("Wrote", PATH)


if __name__ == "__main__":
    main()
