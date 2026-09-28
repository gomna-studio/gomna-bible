#!/usr/bin/env bash
# Only creates a new detached local worktree; never edits the source checkout.
set -euo pipefail
REPO="${1:?Pass the existing clone path}"
REF="${2:?Pass the fetched trial commit}"
PORT=8847
LAST_PORT=8867
command -v python3 >/dev/null
GIT=/opt/homebrew/bin/git
[ -x "$GIT" ] || GIT=/usr/bin/git
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt "$LAST_PORT" ]; then
    echo "8847–8867 포트가 모두 사용 중입니다. 결과를 보내주세요."
    exit 1
  fi
done
COMMIT="$("$GIT" -C "$REPO" rev-parse --verify "${REF}^{commit}")"
mkdir -p "$HOME/gomna-previews"
ROOT="$(mktemp -d "$HOME/gomna-previews/bible-stories-trial.XXXXXX")"
"$GIT" -C "$REPO" worktree add --detach "$ROOT/site" "$COMMIT"
grep -q 'gomna-library-return.js?v=20260928-34' "$ROOT/site/reader.html"
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
for name in assets/home/bible-discovery-journey-v5.webp index.html reader.html meditation.html js/gomna-nav-magnifier.js gomna_category_feature.js js/gomna-home-feed.js js/gomna-bible-library.js js/gomna-bible-library.css js/gomna-bible-library-data.js js/gomna-library-return.js; do
  curl --max-time 5 -fsS "http://127.0.0.1:$PORT/$name" -o "$ROOT/verify-file"
  cmp "$ROOT/site/$name" "$ROOT/verify-file"
done
for file in "$ROOT/site/assets/home/people/v1/"*.webp "$ROOT/site/assets/home/stories/v2/"*.webp; do
  name="${file#"$ROOT/site/"}"
  curl --max-time 5 -fsS "http://127.0.0.1:$PORT/$name" -o "$ROOT/verify-file"
  cmp "$file" "$ROOT/verify-file"
done
printf '\n홈·인물·이야기 코드와 서버 파일 일치: O\n'
IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -n "$IP" ] || IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
printf '\n시험본: %s\n파일 일치: O / 음원 목록 압축·내용 일치: O / 진단 패널: 없음\n' "$COMMIT"
printf '\nMac 홈 URL:\nhttp://127.0.0.1:%s/?v=bible-stories-34\n' "$PORT"
if [ -n "$IP" ]; then
  printf '\niPhone 홈 URL:\nhttp://%s:%s/?v=bible-stories-34\n' "$IP" "$PORT"
  printf '\niPhone 인물 목록 바로 보기:\nhttp://%s:%s/?v=bible-stories-34#bible-library/people\n' "$IP" "$PORT"
else
  echo 'iPhone용 Mac IP 확인이 필요합니다.'
fi


if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:$PORT/?v=bible-stories-34#bible-library/people/esther" || true
fi
