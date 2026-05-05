#!/usr/bin/env python3
"""절 범위 모달: 모바일 잘림 방지(스크롤+하단 고정 버튼), 헤더 드래그+경계."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_CSS = """.verse-range-modal-overlay{display:none;position:fixed;inset:0;z-index:220;background:rgba(0,0,0,.4);align-items:flex-end;justify-content:center;box-sizing:border-box}
.verse-range-modal-overlay.active{display:flex}
.verse-range-modal-box{background:#faf6ed;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;margin:0 auto;box-shadow:0 -4px 24px rgba(0,0,0,.12)}
.verse-range-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(180,140,90,.25);font-weight:700;font-size:16px;color:#3d2818}
.verse-range-modal-close{background:rgba(0,0,0,.06);border:none;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:16px;color:#3d2818;font-family:inherit}
.verse-range-modal-body{padding:12px 16px calc(20px + env(safe-area-inset-bottom,0));overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0}
.verse-range-mode-tabs{display:flex;gap:8px;margin-bottom:12px}
.verse-range-mode-tabs button{flex:1;padding:12px;border-radius:12px;border:1px solid #E8E0D8;background:#fff;font-weight:600;cursor:pointer;font-family:inherit;color:#5C4A3A;font-size:14px}
.verse-range-mode-tabs button.active{background:var(--gold);color:#fff;border-color:var(--gold)}
.verse-range-range-label{margin:0 0 6px;font-size:14px;font-weight:600;color:#5C4A3A}
.verse-range-preview{margin:4px 0 14px;text-align:center;font-size:14px;font-weight:600;color:#5a3818;min-height:22px}
.verse-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:12px 0 20px}
.verse-cell{aspect-ratio:1;min-height:44px;background:#fff;border:0.5px solid rgba(180,140,90,.25);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;color:#5a3818;cursor:pointer;font-family:inherit;padding:0;box-sizing:border-box}
.verse-cell:active{transform:scale(0.92);transition:all 0.15s}
.verse-cell.selected{background:#c89849;color:#fff;border-color:#a87a35}
.verse-cell.disabled{opacity:0.3;pointer-events:none}
.verse-range-btn-all{padding:14px;border-radius:12px;border:none;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#B8860B,#9a7018);color:#fff;width:100%}
.verse-range-apply{padding:14px;border-radius:12px;background:#c89849;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:4px;-webkit-tap-highlight-color:transparent}.verse-range-apply:active{background:#a87a35}
.verse-range-split{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 16px;align-items:start}
.verse-range-column{display:flex;flex-direction:column;min-width:0}
.verse-range-column-label{font-size:12px;font-weight:500;color:#5a3818;margin-bottom:6px;text-align:center;margin-top:0}
.verse-range-column-scroll{max-height:280px;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0}
.verse-range-split .verse-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:0}
.verse-range-split .verse-cell{min-height:38px;font-size:12px}"""

NEW_CSS = """.verse-range-modal-overlay{display:none;position:fixed;inset:0;z-index:220;background:rgba(0,0,0,.4);align-items:flex-end;justify-content:center;box-sizing:border-box}
.verse-range-modal-overlay.active{display:flex}
.verse-range-modal-box{background:#faf6ed;border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:90vh;height:auto;overflow:hidden;display:flex;flex-direction:column;margin:0 auto;box-shadow:0 -4px 24px rgba(0,0,0,.12);position:relative}
.verse-range-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(180,140,90,.25);font-weight:700;font-size:16px;color:#3d2818;flex-shrink:0;cursor:grab;-webkit-user-select:none;user-select:none;touch-action:none}
.verse-range-modal-head:active{cursor:grabbing}
.verse-range-modal-head .verse-range-modal-close{cursor:pointer;touch-action:manipulation}
.verse-range-modal-close{background:rgba(0,0,0,.06);border:none;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:16px;color:#3d2818;font-family:inherit}
.verse-range-modal-body{padding:0;overflow:hidden;display:flex;flex-direction:column;flex:1;min-height:0;-webkit-overflow-scrolling:touch}
.reader-verse-range-actions{display:flex;flex-direction:column;gap:12px;padding:12px 16px;padding-bottom:0;flex:1;min-height:0;overflow:hidden;box-sizing:border-box}
.verse-range-modal-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;max-height:calc(90vh - 240px);touch-action:pan-y}
.verse-range-modal-footer{flex-shrink:0;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0));margin:0 -16px 0;background:#faf6ed;border-top:1px solid rgba(180,140,90,.22);box-sizing:content-box}
.verse-range-all-note{margin:0;font-size:13px;color:#5a3818;line-height:1.5;opacity:0.92}
.verse-range-mode-tabs{display:flex;gap:8px;margin-bottom:0;flex-shrink:0}
.verse-range-mode-tabs button{flex:1;padding:12px;border-radius:12px;border:1px solid #E8E0D8;background:#fff;font-weight:600;cursor:pointer;font-family:inherit;color:#5C4A3A;font-size:14px}
.verse-range-mode-tabs button.active{background:var(--gold);color:#fff;border-color:var(--gold)}
.verse-range-range-label{margin:0 0 6px;font-size:14px;font-weight:600;color:#5C4A3A}
.verse-range-preview{margin:4px 0 8px;text-align:center;font-size:14px;font-weight:600;color:#5a3818;min-height:22px}
.verse-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:12px 0 20px}
.verse-cell{aspect-ratio:1;min-height:44px;background:#fff;border:0.5px solid rgba(180,140,90,.25);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;color:#5a3818;cursor:pointer;font-family:inherit;padding:0;box-sizing:border-box}
.verse-cell:active{transform:scale(0.92);transition:all 0.15s}
.verse-cell.selected{background:#c89849;color:#fff;border-color:#a87a35}
.verse-cell.disabled{opacity:0.3;pointer-events:none}
.verse-range-btn-all{padding:14px;border-radius:12px;border:none;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#B8860B,#9a7018);color:#fff;width:100%}
.verse-range-apply{padding:14px;border-radius:12px;background:#c89849;color:#fff;border:none;font-weight:700;cursor:pointer;font-family:inherit;font-size:15px;width:100%;margin-top:0;-webkit-tap-highlight-color:transparent}.verse-range-apply:active{background:#a87a35}
.verse-range-split{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 12px;align-items:start}
.verse-range-column{display:flex;flex-direction:column;min-width:0}
.verse-range-column-label{font-size:12px;font-weight:500;color:#5a3818;margin-bottom:6px;text-align:center;margin-top:0}
.verse-range-column-scroll{max-height:none;overflow:visible;min-height:0}
.verse-range-split .verse-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:0}
.verse-range-split .verse-cell{min-height:38px;font-size:12px}"""

OLD_HTML = """    <div class="verse-range-modal-box" onclick="event.stopPropagation()">
      <div class="verse-range-modal-head"><span id="verseRangeModalTitle">절 범위</span><button type="button" class="verse-range-modal-close" onclick="closeVerseRangeModal()">✕</button></div>
      <div id="verseRangeModalBody" class="verse-range-modal-body"></div>
    </div>"""

NEW_HTML = """    <div id="verseRangeModalBox" class="verse-range-modal-box" onclick="event.stopPropagation()">
      <div class="verse-range-modal-head" id="verseRangeDragHeader"><span id="verseRangeModalTitle">절 범위</span><button type="button" class="verse-range-modal-close" onclick="closeVerseRangeModal()">✕</button></div>
      <div id="verseRangeModalBody" class="verse-range-modal-body"></div>
    </div>"""

OLD_GET_HTML = """function getVerseRangeModalHtml() {
  verseRangeModalMax = currentVerseCount;
  verseRangeSelStart = opt4RangeStart;
  verseRangeSelEnd = opt4RangeEnd;
  return '<div class="reader-verse-range-actions" style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="verse-range-mode-tabs">' +
    '<button type="button" class="active" id="verseRangeModeAllBtn">전체 보기</button>' +
    '<button type="button" id="verseRangeModeRangeBtn">절 범위 선택</button></div>' +
    '<div id="verseRangePanelAll">' +
    '<button type="button" class="verse-range-btn-all" id="verseRangeModalAllBtn">📖 말씀 보기</button></div>' +
    '<div id="verseRangePanelRange" style="display:none">' +
    '<div class="verse-range-split">' +
    '<div class="verse-range-column">' +
    '<p class="verse-range-column-label">시작 절</p>' +
    '<div class="verse-range-column-scroll">' +
    '<div class="verse-grid" id="verseRangeStartGrid"></div></div></div>' +
    '<div class="verse-range-column">' +
    '<p class="verse-range-column-label">끝 절</p>' +
    '<div class="verse-range-column-scroll">' +
    '<div class="verse-grid" id="verseRangeEndGrid"></div></div></div></div>' +
    '<p class="verse-range-preview" id="verseRangePreviewText"></p>' +
    '<button type="button" class="verse-range-apply" id="verseRangeApplyBtn">📖 말씀 보기</button></div></div>';
}"""

NEW_GET_HTML = """function getVerseRangeModalHtml() {
  verseRangeModalMax = currentVerseCount;
  verseRangeSelStart = opt4RangeStart;
  verseRangeSelEnd = opt4RangeEnd;
  return '<div class="reader-verse-range-actions">' +
    '<div class="verse-range-mode-tabs">' +
    '<button type="button" class="active" id="verseRangeModeAllBtn">전체 보기</button>' +
    '<button type="button" id="verseRangeModeRangeBtn">절 범위 선택</button></div>' +
    '<div class="verse-range-modal-scroll">' +
    '<div id="verseRangePanelAll">' +
    '<p class="verse-range-all-note">현재 장 전체 절이 표시됩니다.</p></div>' +
    '<div id="verseRangePanelRange" style="display:none">' +
    '<div class="verse-range-split">' +
    '<div class="verse-range-column">' +
    '<p class="verse-range-column-label">시작 절</p>' +
    '<div class="verse-range-column-scroll">' +
    '<div class="verse-grid" id="verseRangeStartGrid"></div></div></div>' +
    '<div class="verse-range-column">' +
    '<p class="verse-range-column-label">끝 절</p>' +
    '<div class="verse-range-column-scroll">' +
    '<div class="verse-grid" id="verseRangeEndGrid"></div></div></div></div>' +
    '<p class="verse-range-preview" id="verseRangePreviewText"></p></div></div>' +
    '<div class="verse-range-modal-footer">' +
    '<button type="button" class="verse-range-btn-all" id="verseRangeModalAllBtn">📖 말씀 보기</button>' +
    '<button type="button" class="verse-range-apply" id="verseRangeApplyBtn" style="display:none">📖 말씀 보기</button></div></div>';
}"""

OLD_LISTENERS = """  if (modeAll && modeRange && panelAll && panelRange) {
    modeAll.addEventListener('click', function() {
      modeAll.classList.add('active');
      modeRange.classList.remove('active');
      panelAll.style.display = 'block';
      panelRange.style.display = 'none';
    });
    modeRange.addEventListener('click', function() {
      modeRange.classList.add('active');
      modeAll.classList.remove('active');
      panelRange.style.display = 'block';
      panelAll.style.display = 'none';
    });
  }"""

NEW_LISTENERS = """  if (modeAll && modeRange && panelAll && panelRange) {
    modeAll.addEventListener('click', function() {
      modeAll.classList.add('active');
      modeRange.classList.remove('active');
      panelAll.style.display = 'block';
      panelRange.style.display = 'none';
      var bAll = document.getElementById('verseRangeModalAllBtn');
      var bAp = document.getElementById('verseRangeApplyBtn');
      if (bAll) bAll.style.display = '';
      if (bAp) bAp.style.display = 'none';
    });
    modeRange.addEventListener('click', function() {
      modeRange.classList.add('active');
      modeAll.classList.remove('active');
      panelRange.style.display = 'block';
      panelAll.style.display = 'none';
      var bAll = document.getElementById('verseRangeModalAllBtn');
      var bAp = document.getElementById('verseRangeApplyBtn');
      if (bAll) bAll.style.display = 'none';
      if (bAp) bAp.style.display = '';
    });
  }"""

OLD_OPEN = """function openVerseRangeModal() {
  var modal = document.getElementById('verseRangeModal');
  var body = document.getElementById('verseRangeModalBody');
  if (!modal || !body) return;
  body.innerHTML = getVerseRangeModalHtml();
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  attachVerseRangeModalListeners();
}"""

NEW_OPEN = """function openVerseRangeModal() {
  var modal = document.getElementById('verseRangeModal');
  var body = document.getElementById('verseRangeModalBody');
  var box = document.getElementById('verseRangeModalBox');
  if (!modal || !body) return;
  if (box) {
    box.style.position = '';
    box.style.left = '';
    box.style.top = '';
    box.style.margin = '';
    box.style.transform = '';
  }
  body.innerHTML = getVerseRangeModalHtml();
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  attachVerseRangeModalListeners();
}"""

OLD_CLOSE = """function closeVerseRangeModal() {
  var modal = document.getElementById('verseRangeModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}"""

NEW_CLOSE = """function closeVerseRangeModal() {
  var modal = document.getElementById('verseRangeModal');
  var box = document.getElementById('verseRangeModalBox');
  if (box) {
    box.style.position = '';
    box.style.left = '';
    box.style.top = '';
    box.style.margin = '';
    box.style.transform = '';
  }
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}"""

OLD_DRAG = """// 드래그 기능
(function() {
  var isDragging = false;
  var startX, startY, startLeft, startTop;
  
  document.addEventListener('mousedown', function(e) {
    var header = document.getElementById('popupDragHeader');
    if(header && header.contains(e.target) && e.target.tagName !== 'BUTTON') {
      isDragging = true;
      var box = document.getElementById('commentaryPopupBox');
      var rect = box.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      box.style.position = 'fixed';
      box.style.margin = '0';
      box.style.left = startLeft + 'px';
      box.style.top = startTop + 'px';
      box.style.transform = 'none';
      e.preventDefault();
    }
  });
  
  document.addEventListener('mousemove', function(e) {
    if(isDragging) {
      var box = document.getElementById('commentaryPopupBox');
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      box.style.left = (startLeft + dx) + 'px';
      box.style.top = (startTop + dy) + 'px';
    }
  });
  
  document.addEventListener('mouseup', function() {
    isDragging = false;
  });
  
  // 터치 지원 (모바일)
  document.addEventListener('touchstart', function(e) {
    var header = document.getElementById('popupDragHeader');
    if(header && header.contains(e.target) && e.target.tagName !== 'BUTTON') {
      isDragging = true;
      var box = document.getElementById('commentaryPopupBox');
      var rect = box.getBoundingClientRect();
      var touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      box.style.position = 'fixed';
      box.style.margin = '0';
      box.style.left = startLeft + 'px';
      box.style.top = startTop + 'px';
      box.style.transform = 'none';
    }
  });
  
  document.addEventListener('touchmove', function(e) {
    if(isDragging) {
      var box = document.getElementById('commentaryPopupBox');
      var touch = e.touches[0];
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      box.style.left = (startLeft + dx) + 'px';
      box.style.top = (startTop + dy) + 'px';
      e.preventDefault();
    }
  }, {passive: false});
  
  document.addEventListener('touchend', function() {
    isDragging = false;
  });
})();"""

NEW_DRAG = """// 드래그 기능 (말씀풀이 + 절 범위 모달, 최소 50px 화면 내 유지)
(function() {
  var dragState = null;

  function clampBox(box, left, top) {
    var w = box.offsetWidth;
    var h = box.offsetHeight;
    var minL = 50 - w;
    var maxL = window.innerWidth - 50;
    var minT = 50 - h;
    var maxT = window.innerHeight - 50;
    left = Math.max(minL, Math.min(maxL, left));
    top = Math.max(minT, Math.min(maxT, top));
    return { left: left, top: top };
  }

  function startDrag(boxId, clientX, clientY, ev) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var rect = box.getBoundingClientRect();
    dragState = {
      boxId: boxId,
      startX: clientX,
      startY: clientY,
      startLeft: rect.left,
      startTop: rect.top
    };
    box.style.position = 'fixed';
    box.style.margin = '0';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.transform = 'none';
    if (ev) ev.preventDefault();
  }

  function moveDrag(clientX, clientY, ev) {
    if (!dragState) return;
    var box = document.getElementById(dragState.boxId);
    if (!box) return;
    var dx = clientX - dragState.startX;
    var dy = clientY - dragState.startY;
    var c = clampBox(box, dragState.startLeft + dx, dragState.startTop + dy);
    box.style.left = c.left + 'px';
    box.style.top = c.top + 'px';
    if (ev) ev.preventDefault();
  }

  document.addEventListener('mousedown', function(e) {
    var hComment = document.getElementById('popupDragHeader');
    var hRange = document.getElementById('verseRangeDragHeader');
    if (hComment && hComment.contains(e.target) && e.target.tagName !== 'BUTTON') {
      startDrag('commentaryPopupBox', e.clientX, e.clientY, e);
    } else if (hRange && hRange.contains(e.target) && e.target.tagName !== 'BUTTON') {
      startDrag('verseRangeModalBox', e.clientX, e.clientY, e);
    }
  });

  document.addEventListener('mousemove', function(e) {
    if (dragState) moveDrag(e.clientX, e.clientY, null);
  });

  document.addEventListener('mouseup', function() {
    dragState = null;
  });

  document.addEventListener('touchstart', function(e) {
    var hComment = document.getElementById('popupDragHeader');
    var hRange = document.getElementById('verseRangeDragHeader');
    var t = e.touches[0];
    if (!t) return;
    if (hComment && hComment.contains(e.target) && e.target.tagName !== 'BUTTON') {
      startDrag('commentaryPopupBox', t.clientX, t.clientY);
    } else if (hRange && hRange.contains(e.target) && e.target.tagName !== 'BUTTON') {
      startDrag('verseRangeModalBox', t.clientX, t.clientY);
    }
  });

  document.addEventListener('touchmove', function(e) {
    if (!dragState) return;
    var t = e.touches[0];
    if (!t) return;
    moveDrag(t.clientX, t.clientY, e);
  }, { passive: false });

  document.addEventListener('touchend', function() {
    dragState = null;
  });
})();"""


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def one(label: str, old: str, new: str) -> None:
        nonlocal text
        n = text.count(old)
        if n != 1:
            raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
        text = text.replace(old, new, 1)

    one("verse range css", OLD_CSS, NEW_CSS)
    one("verse range html", OLD_HTML, NEW_HTML)
    one("getVerseRangeModalHtml", OLD_GET_HTML, NEW_GET_HTML)
    one("attachVerseRange listeners", OLD_LISTENERS, NEW_LISTENERS)
    one("openVerseRangeModal", OLD_OPEN, NEW_OPEN)
    one("closeVerseRangeModal", OLD_CLOSE, NEW_CLOSE)
    one("drag iife", OLD_DRAG, NEW_DRAG)

    PATH.write_text(text, encoding="utf-8")
    print("OK: patch_verse_range_modal_layout_drag applied")


if __name__ == "__main__":
    main()
