# Commentary multilingual quality & containment

## Operational containment (2026-07-25)

Until re-approval, **English / Japanese Genesis 1:11–1:31** commentary is **not** treated as a completed multilingual range.

| Scope | Reader behavior |
|-------|-----------------|
| Korean (all verses) | Unchanged |
| EN/JA Genesis 1:1–1:10 | Verified range — keep showing cards/audio |
| EN/JA Genesis 1:11–1:31 | Contained — show preparing message only; no cards/audio UI |
| Existing data / MP3 / Cue / R2 | **Not deleted** |

Code: `scripts/lib/commentary-multilang-quality-policy.mjs`, `js/gomna-commentary-multilang-policy.js`.

UI copy key: `commentary.multilang.preparing`  
(“말씀풀이 번역을 준비하고 있습니다.” / EN / JA equivalents)

## Quality criteria before expanding again

1. Korean card count must match EN/JA card count.
2. No loss of meaning from any Korean field.
3. No arbitrary abbreviation of content.
4. No Korean/English/Japanese mixing (Hebrew/Greek original-language terms allowed).
5. Card content and TTS narration must match in meaning and order.
6. Narration must be natural prose, not a bare dump of table cells.
7. No TTS generation before translation review approval.
8. No R2 publish before audio review approval.
9. Cross-references must store structured `bookId` / `chapter` / `verse` (not display-only strings).

## Related-verse navigation

Display labels (e.g. `詩 1:3`, `Psalm 1:3`, `ガラ 5:22-23`) are resolved through `scripts/lib/gomna-bible-ref.mjs` / `js/gomna-bible-ref.js` into internal `bookId` + chapter + verse. Ranges navigate to the **first** verse while keeping the range label.

EN/JA Genesis chapter 1 card rows now also store structured fields on each cross-ref row:

- `displayReference`, `bookId`, `chapter`, `verseStart`, `verseEnd`
- multi-ref cells also store `relatedReferences[]`

Reader click path prefers stored ids (`buildVerseLinksFromCardRow`); display-string parsing is legacy fallback only.

## Approval gates (wired)

| Stage | Entry | Requires |
|-------|--------|----------|
| TTS / OpenAI speech | `requestCommentaryMp3`, `requestTtsWithBudget`, `scripts/commentary-multilang-audio-stage.mjs --execute-network` | `translationApproved` / `--translation-approved` / `GOMNA_COMMENTARY_TRANSLATION_APPROVED=1` |
| R2 / shards | `uploadOneTarget`, `executeRealR2Uploads`, `scripts/commentary-multilang-publish-apply.mjs --execute` | `audioApproved` / `--audio-approved` / `GOMNA_COMMENTARY_AUDIO_APPROVED=1` |

Missing or false approval aborts **before** network calls.
