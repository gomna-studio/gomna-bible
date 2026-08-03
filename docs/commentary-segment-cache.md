# Commentary TTS Segment Cache

Permanent reuse layer for OpenAI speech segments used by
`scripts/build-commentary-highlight-cues.mjs`.

## Durable assets

- `audio/highlight-segments/**` stores generated segment MP3s.
- These files are **not** temporary build junk.
- Deleting them requires explicit
  `--confirm-delete-commentary-segment-cache`.
- Default cleanup / ordinary script runs must not remove this tree.

## Cache key

SHA-256 over a stable JSON signature of the **complete TTS request**:

- `formatVersion`
- `locale`
- `model`
- `voice`
- `presetId` (`commentary-highlight-default` — actual OpenAI request preset;
  per-type final-MP3 voicePreset names are not part of the speech request)
- `instructionsHash`
- `responseFormat`
- `sampleRate` / `channels` / `bitrate` (expected output constraints)
- normalized input `text`
- optional `speed` / `contextHash`

Text normalization is conservative: Unicode NFC, CRLF→LF, trim, collapse
ordinary runs of spaces. Punctuation, digits, particles, and case are kept.

## Index layout

```
audio/commentary-segment-cache/ko-KR/
  meta.json
  index/{00..ff}.jsonl
audio/commentary-segment-cache/locks/{key}.lock
```

Index entries point at existing `audio/highlight-segments/...` paths.
Files are not bulk-copied or moved. Duplicate request sources are retained
on disk and recorded via `sourceCount`.

## Commands

Plan / build index (no OpenAI):

```bash
node scripts/build-commentary-segment-cache-index.mjs \
  --locale ko-KR --book genesis --from-chapter 4 --to-chapter 50

node scripts/build-commentary-segment-cache-index.mjs \
  --locale ko-KR --book genesis --from-chapter 4 --to-chapter 50 --write
```

Audit all planned Genesis segments against the index:

```bash
node scripts/build-commentary-segment-cache-index.mjs \
  --locale ko-KR --book genesis --from-chapter 4 --to-chapter 50 --audit
```

Next-book preflight (scripts must exist; OpenAI not called):

```bash
node scripts/build-commentary-segment-cache-index.mjs \
  --locale ko-KR --book <bookId> --from-chapter 1 --to-chapter N --preflight
```

## Production write guards

Book-unit production audio write requires:

1. Valid segment cache index (or emergency `--allow-no-segment-cache`)
2. `--confirm-production-audio-write`
3. `--max-new-tts-calls N`
4. `--confirm-new-tts-calls N` exactly equal to planned cache misses

On each segment:

1. Build request signature / cache key
2. Lookup index + validate file (exists, non-zero, ffprobe OK)
3. Cache hit → hardlink/symlink into the verse segment dir, no OpenAI
4. Cache miss → key lock → re-check → OpenAI only if still missing
5. Successful new TTS is appended to the index; failures are not
