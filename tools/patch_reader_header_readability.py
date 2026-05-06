#!/usr/bin/env python3
"""reader.html: 헤더 탭/홈-X 간격/닫기/더보기 버튼 가독성 CSS 강화."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / "reader.html"
text = path.read_text(encoding="utf-8")

REPLACEMENTS = [
    (
        ".reader-sheet-tabs .reader-tab{font-size:14px;font-weight:500;color:#a89890;padding:6px 0 12px;background:none;border:none;font-family:inherit;cursor:pointer;white-space:nowrap;position:relative;flex-shrink:0}",
        ".reader-sheet-tabs .reader-tab{font-size:17px;font-weight:600;color:#5a3818;padding:6px 0 12px;background:none;border:none;font-family:inherit;cursor:pointer;white-space:nowrap;position:relative;flex-shrink:0}",
        "reader-tab base",
    ),
    (
        ".reader-sheet-tabs .reader-nav-end{margin-left:auto;display:flex;align-items:flex-end;gap:8px;flex-shrink:0}",
        ".reader-sheet-tabs .reader-nav-end{margin-left:auto;display:flex;align-items:flex-end;gap:16px;flex-shrink:0}",
        "reader-nav-end gap",
    ),
    (
        ".reader-sheet-tabs .reader-close{background:rgba(0,0,0,.07);border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1;color:#3d2818;padding:0;flex-shrink:0}",
        ".reader-sheet-tabs .reader-close{background:rgba(139, 94, 44, 0.18);border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;color:#3d2818;padding:0;flex-shrink:0}",
        "reader-close",
    ),
    (
        ".verse-read-more{width:32px;height:32px;min-width:32px;padding:0;border:none;background:transparent;font-size:18px;color:#3d2818;cursor:pointer;font-family:inherit;line-height:1;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}",
        ".verse-read-more{width:44px;height:44px;min-width:44px;padding:0;border:none;background:rgba(139, 94, 44, 0.18);font-size:24px;color:#3d2818;cursor:pointer;font-family:inherit;line-height:1;border-radius:50%;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}",
        "verse-read-more",
    ),
]

for old, new, label in REPLACEMENTS:
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("patched reader.html OK")
