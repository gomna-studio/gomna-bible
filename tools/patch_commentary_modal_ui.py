#!/usr/bin/env python3
"""말씀풀이 모달: 헤더 톤, 탭 가로 스크롤, 표 가독성 (reader.html만)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "reader.html"

OLD_HEADER = (
    '<div class="popup-drag-header" id="popupDragHeader" style="cursor:move; padding:18px 20px; '
    'background:linear-gradient(135deg,#1e3c72,#2a5298); border-radius:20px 20px 0 0; display:flex; '
    'justify-content:space-between; align-items:center;">\n'
    '      <div style="width:32px;"></div>\n'
    '      <div style="text-align:center; flex:1;">\n'
    '        <div class="popup-title" id="commentaryTitle" style="margin:0; color:#fff; font-size:18px; font-weight:bold;">📖 말씀풀이</div>\n'
    '        <div style="color:rgba(255,255,255,0.8); font-size:11px; margin-top:4px;">매튜헨리 및 심층 연구 포함</div>'
)

NEW_HEADER = (
    '<div class="popup-drag-header" id="popupDragHeader" style="cursor:move; padding:18px 20px; '
    'background:#5a3818; border-radius:20px 20px 0 0; display:flex; '
    'justify-content:space-between; align-items:center;">\n'
    '      <div style="width:32px;"></div>\n'
    '      <div style="text-align:center; flex:1;">\n'
    '        <div class="popup-title" id="commentaryTitle" style="margin:0; color:#fff; font-size:18px; font-weight:bold;">📖 말씀풀이</div>\n'
    '        <div style="color:rgba(255,255,255,.85); font-size:11px; margin-top:4px;">매튜헨리 및 심층 연구 포함</div>'
)

OLD_CSS = """.commentary-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #E8E0D8;justify-content:center}
.commentary-tab{background:#F8F4EF;border:1px solid #E0D6CC;padding:8px 12px;border-radius:18px;font-size:12px;font-weight:600;color:#5C4A3A;cursor:pointer;font-family:inherit;min-width:70px;text-align:center;box-sizing:border-box}
.commentary-tab:active{background:#EDE6DE}
.commentary-tab[onclick*="showAllTabs"]{transition:transform 0.15s ease}
.commentary-tab[onclick*="showAllTabs"]:active{transform:scale(0.9)}
.commentary-tab.active{background:var(--gold);color:#fff;border-color:var(--gold)}
.commentary-table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}
.commentary-table th{background:#B8860B;color:#fff;padding:10px 8px;text-align:left;font-weight:600;font-size:12px}
.commentary-table td{background:#fff;padding:10px 8px;border-bottom:1px solid #E8E0D8;vertical-align:top;line-height:1.6}
.commentary-table tr:nth-child(even) td{background:#FDFAF7}
.commentary-table .col1{width:25%;font-weight:600;color:#4A2511}
.commentary-table .col2{width:40%}
.commentary-table .col3{width:35%;color:#2D5016;font-weight:500}"""

NEW_CSS = """.commentary-tabs{display:flex;flex-wrap:nowrap;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #E8E0D8;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scrollbar-width:none;-ms-overflow-style:none}
.commentary-tabs::-webkit-scrollbar{display:none}
.commentary-tab{background:transparent;border:0.5px solid rgba(180,140,90,.3);padding:10px 16px;border-radius:18px;font-size:12px;font-weight:600;color:#5a3818;cursor:pointer;font-family:inherit;min-width:70px;min-height:44px;text-align:center;box-sizing:border-box;flex-shrink:0;scroll-snap-align:start;display:inline-flex;align-items:center;justify-content:center}
.commentary-tab:active{opacity:0.88}
.commentary-tab.active{background:#c89849;color:#fff;border-color:#c89849}
.commentary-table{width:100%;border-collapse:collapse;font-size:15px;margin-bottom:12px}
.commentary-table th{background:#faf6ed;color:#3d2818;padding:10px 8px;text-align:left;font-weight:600;font-size:14px}
.commentary-table td{background:#fff;color:#3d2818;padding:12px 8px;border-bottom:1px solid #e8e0d8;vertical-align:top;line-height:1.6;font-size:15px}
.commentary-table tr:nth-child(even) td{background:#fff}
.commentary-table tr:nth-child(odd) td{background:#fdfaf7}
#tab-원어분석 .commentary-table td.col1{font-size:16px}
.commentary-table .col1 .commentary-kor-pron{font-size:13px;color:#6b5344}
.commentary-table .col1{width:25%;font-weight:600;color:#3d2818}
.commentary-table .col2{width:40%}
.commentary-table .col3{width:35%;color:#3d2818;font-weight:500}"""

OLD_ALL_BTN = (
    "content += '<button class=\"commentary-tab\" onclick=\"showAllTabs()\" "
    "style=\"background:#2a5298; color:#fff; border-color:#2a5298;\">📋 전체보기</button>';"
)

NEW_ALL_BTN = "content += '<button class=\"commentary-tab\" onclick=\"showAllTabs()\">📋 전체보기</button>';"

OLD_MH_ROW = (
    "content += '<tr><td class=\"col1\" style=\"font-size:11px\">'+(row[\"영어원문\"]||'')+'</td><td class=\"col2\">'+(row[\"한국어번역\"]||'')+'</td><td class=\"col3\">'+(row[\"핵심통찰\"]||'')+'</td></tr>'; "
)

NEW_MH_ROW = (
    "content += '<tr><td class=\"col1\">'+(row[\"영어원문\"]||'')+'</td><td class=\"col2\">'+(row[\"한국어번역\"]||'')+'</td><td class=\"col3\">'+(row[\"핵심통찰\"]||'')+'</td></tr>'; "
)


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def one_replace(label: str, old: str, new: str) -> None:
        nonlocal text
        n = text.count(old)
        if n != 1:
            raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
        text = text.replace(old, new, 1)

    one_replace("header", OLD_HEADER, NEW_HEADER)
    one_replace("commentary css", OLD_CSS, NEW_CSS)
    one_replace("전체보기 btn", OLD_ALL_BTN, NEW_ALL_BTN)
    one_replace("매튜헨리 col1", OLD_MH_ROW, NEW_MH_ROW)

    PATH.write_text(text, encoding="utf-8")
    print("OK: patch_commentary_modal_ui applied")


if __name__ == "__main__":
    main()
