#!/usr/bin/env python3
"""통합 책/장 적용 시 말씀풀이 모달이 열려 있으면 새 장 1절로 갱신."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD = """  closeUnifiedBookChapterModal();
  renderVerses();
  loadCommentaryData();
}"""

NEW = """  closeUnifiedBookChapterModal();
  renderVerses();
  loadCommentaryData();
  var commentaryPopupEl = document.getElementById('commentaryPopup');
  if (commentaryPopupEl && commentaryPopupEl.classList.contains('show')) {
    showCommentary(1);
  }
}"""


def main() -> None:
    text = PATH.read_text(encoding="utf-8")
    n = text.count(OLD)
    if n != 1:
        raise SystemExit(f"expected 1 occurrence of unifiedBcApplyChapter tail, found {n}")
    text = text.replace(OLD, NEW, 1)
    PATH.write_text(text, encoding="utf-8")
    print("OK: patch_unified_bc_refresh_commentary applied")


if __name__ == "__main__":
    main()
