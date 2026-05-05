#!/usr/bin/env python3
"""Unify verse-range-apply and opt4-bottom-commentary to site gold #c89849."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_BOTTOM = ".opt4-bottom-commentary{flex:1.4;background:#8b5e2c;color:#fff;border:none;border-radius:12px;padding:12px 6px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}"
NEW_BOTTOM = ".opt4-bottom-commentary{flex:1.4;background:#c89849;color:#fff;border:none;border-radius:12px;padding:12px 6px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}.opt4-bottom-commentary:active{background:#a87a35}"

OLD_APPLY = ".verse-range-apply{padding:14px;border-radius:12px;background:#3d2818;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:4px}"
NEW_APPLY = ".verse-range-apply{padding:14px;border-radius:12px;background:#c89849;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:4px;-webkit-tap-highlight-color:transparent}.verse-range-apply:active{background:#a87a35}"


def main():
    text = PATH.read_text(encoding="utf-8")
    if ".opt4-bottom-commentary:active{background:#a87a35}" in text:
        print("Already patched. Skipping.")
        return
    if OLD_BOTTOM not in text or OLD_APPLY not in text:
        raise SystemExit("MISSING: expected CSS rules")
    text = text.replace(OLD_BOTTOM, NEW_BOTTOM, 1)
    text = text.replace(OLD_APPLY, NEW_APPLY, 1)
    PATH.write_text(text, encoding="utf-8")
    print("Wrote", PATH)


if __name__ == "__main__":
    main()
