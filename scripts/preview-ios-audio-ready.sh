#!/usr/bin/env bash
# Only creates a new detached local worktree; never edits the source checkout.
set -euo pipefail
REPO="${1:?Pass the existing clone path}"
REF="${2:?Pass the fetched trial commit}"
PORT=8799
command -v python3 >/dev/null
GIT=/opt/homebrew/bin/git
[ -x "$GIT" ] || GIT=/usr/bin/git
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "8799 포트가 사용 중입니다. 기존 프로세스는 종료하지 않았습니다. 결과를 보내주세요."
  exit 1
fi
COMMIT="$("$GIT" -C "$REPO" rev-parse --verify "${REF}^{commit}")"
ROOT="$(mktemp -d /private/tmp/gomna-audio-ready.XXXXXX)"
"$GIT" -C "$REPO" worktree add --detach "$ROOT/site" "$COMMIT"
grep -q 'start-ready-20260926' "$ROOT/site/reader.html"
grep -q 'prepareBibleAudio: function' "$ROOT/site/js/audio-engine.js"
if grep -q 'id="gomna-ios-audio-diag-panel"' "$ROOT/site/reader.html"; then
  echo '진단 패널이 남아 있어 중단했습니다.'
  exit 1
fi
nohup python3 "$ROOT/site/scripts/serve-audio-preview.py" \
  --directory "$ROOT/site" --port "$PORT" >"$ROOT/server.log" 2>&1 </dev/null &
PID=$!
printf '%s\n' "$PID" >"$ROOT/server.pid"
READY=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --max-time 2 -fsS "http://127.0.0.1:$PORT/reader.html" \
      -o "$ROOT/served-reader.html" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ] || ! kill -0 "$PID" 2>/dev/null; then
  cat "$ROOT/server.log"
  echo '미리보기 서버 확인 실패. 결과를 보내주세요.'
  exit 1
fi
cmp "$ROOT/site/reader.html" "$ROOT/served-reader.html"
curl --max-time 5 -fsS "http://127.0.0.1:$PORT/js/audio-engine.js" -o "$ROOT/served-engine.js"
cmp "$ROOT/site/js/audio-engine.js" "$ROOT/served-engine.js"
for name in gomna-audio-ui.js gomna-bible-listen-controls.js; do
  curl --max-time 5 -fsS "http://127.0.0.1:$PORT/js/$name" -o "$ROOT/served-$name"
  cmp "$ROOT/site/js/$name" "$ROOT/served-$name"
done
grep -q 'gomna-bible-listen-controls.js?v=20260926-controls-1' "$ROOT/served-reader.html"
curl --max-time 10 --compressed -fsS "http://127.0.0.1:$PORT/audio/audio-manifest.json" \
  -D "$ROOT/manifest-headers.txt" -o "$ROOT/served-manifest.json"
grep -qi '^Content-Encoding: gzip' "$ROOT/manifest-headers.txt"
cmp "$ROOT/site/audio/audio-manifest.json" "$ROOT/served-manifest.json"
IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -n "$IP" ] || IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
printf '\n시험본: %s\n파일 일치: O / 음원 목록 압축·내용 일치: O / 진단 패널: 없음\n' "$COMMIT"
printf '\nMac 홈 URL:\nhttp://127.0.0.1:%s/?v=audio-ready-2\n' "$PORT"
if [ -n "$IP" ]; then
  printf '\niPhone 홈 URL:\nhttp://%s:%s/?v=audio-ready-2\n' "$IP" "$PORT"
  printf '\niPhone 본문 URL:\nhttp://%s:%s/reader.html?v=audio-ready-2\n' "$IP" "$PORT"
else
  echo 'iPhone용 Mac IP 확인이 필요합니다.'
fi
