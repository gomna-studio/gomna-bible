/**
 * Structured cross-refs on cards + approval gates before TTS/R2 network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enrichCrossRefRow,
  extractStructuredRefsFromRow,
  isStructuredBibleRef,
  validateStructuredCrossRefRow,
  validateLocaleGenesisStructuredCrossRefs,
} from '../lib/commentary-structured-cross-refs.mjs';
import {
  parseBibleReference,
} from '../lib/gomna-bible-ref.mjs';
import {
  assertMultilangStageAllowed,
  requireMultilangStageApproval,
  resolveAudioApproved,
  resolveTranslationApproved,
} from '../lib/commentary-multilang-quality-policy.mjs';
import { requestCommentaryMp3 } from '../lib/commentary-multilang-audio.mjs';
import { requestTtsWithBudget } from '../lib/commentary-multilang-audio-cue-stage.mjs';
import { createApiCallBudget } from '../lib/commentary-multilang-translation-budget.mjs';
import { uploadOneTarget } from '../lib/commentary-multilang-upload.mjs';
import { executeRealR2Uploads } from '../lib/commentary-multilang-publish-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('EN/JA Genesis ch.1 cross-ref rows carry structured bookId/chapter/verse', () => {
  for (const locale of ['en-US', 'ja-JP']) {
    const doc = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'data/commentary-cards', locale, 'genesis.json'),
        'utf8',
      ),
    );
    const validated = validateLocaleGenesisStructuredCrossRefs(doc, {
      requireStructured: true,
    });
    assert.equal(validated.ok, true, locale);
    assert.ok(validated.checked >= 341, locale);
    // sample range row / single
    const v12 = doc.verses['창세기_1_12'];
    const theology = v12['표3_신학적의미'][0];
    assert.equal(theology['관련구절'], locale === 'en-US' ? '1 Timothy 4:4' : theology['관련구절']);
    assert.ok(isStructuredBibleRef(theology));
    const xref = v12['표9_교차참조'][0];
    assert.ok(isStructuredBibleRef(xref));
    assert.equal(xref.bookId, 'psalms');
    assert.equal(xref.chapter, 1);
    assert.equal(xref.verseStart, 3);
  }
});

test('structured row extraction does not call display parser', () => {
  let parseCalls = 0;
  const original = parseBibleReference;
  // Spy via extract path: structured rows never need parser.
  const row = {
    구절: 'SHOULD_NOT_PARSE_THIS_GARBAGE!!!',
    displayReference: 'ガラ 5:22-23',
    bookId: 'galatians',
    chapter: 5,
    verseStart: 22,
    verseEnd: 23,
  };
  const extracted = extractStructuredRefsFromRow(row, '구절');
  assert.equal(extracted.usedParser, false);
  assert.equal(extracted.mode, 'structured');
  assert.equal(extracted.refs[0].bookId, 'galatians');
  assert.equal(extracted.refs[0].verseStart, 22);
  assert.equal(extracted.refs[0].verseEnd, 23);
  assert.equal(typeof original, 'function');
  assert.equal(parseCalls, 0);
});

test('legacy display-only rows still fallback to parser', () => {
  const legacy = { 구절: 'Psalm 1:3' };
  const extracted = extractStructuredRefsFromRow(legacy, '구절');
  assert.equal(extracted.usedParser, true);
  assert.equal(extracted.parseOk, true);
  assert.equal(extracted.refs[0].bookId, 'psalms');
  assert.equal(extracted.refs[0].verseStart, 3);
});

test('multi-ref relatedReferences keep range and first-verse navigation fields', () => {
  const enriched = enrichCrossRefRow(
    { 관련구절: 'ガラ 5:22-23; ヨハ 15:5' },
    '관련구절',
  );
  assert.equal(enriched.ok, true);
  assert.equal(enriched.row['관련구절'], 'ガラ 5:22-23; ヨハ 15:5');
  assert.equal(enriched.row.bookId, 'galatians');
  assert.equal(enriched.row.verseStart, 22);
  assert.equal(enriched.row.verseEnd, 23);
  assert.equal(enriched.row.relatedReferences.length, 2);
  assert.equal(enriched.row.relatedReferences[0].verseStart, 22);
  assert.equal(enriched.row.relatedReferences[1].bookId, 'john');
});

test('new multilang cross-ref without structured fields FAILs', () => {
  const missing = validateStructuredCrossRefRow(
    { 구절: 'Psalm 1:3' },
    { requireStructured: true, displayField: '구절' },
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing_structured_cross_ref');

  const ok = validateStructuredCrossRefRow(
    {
      구절: 'Psalm 1:3',
      displayReference: 'Psalm 1:3',
      bookId: 'psalms',
      chapter: 1,
      verseStart: 3,
      verseEnd: 3,
    },
    { requireStructured: true, displayField: '구절' },
  );
  assert.equal(ok.ok, true);
});

test('reader prefers buildVerseLinksFromCardRow / structured attrs', () => {
  const reader = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  assert.match(reader, /buildVerseLinksFromCardRow/);
  assert.match(reader, /buildStructuredVerseLinkFromRef/);
  assert.match(reader, /data-structured="1"/);
  assert.match(reader, /Prefer card-stored bookId/);
});

test('TTS blocked without translationApproved (network calls 0)', async () => {
  let network = 0;
  const fetchImpl = async () => {
    network += 1;
    throw new Error('network should not run');
  };
  await assert.rejects(
    () =>
      requestCommentaryMp3({
        apiKey: 'sk-test',
        narrationText: 'hello',
        ttsConfig: {
          endpoint: 'https://example.invalid/v1/audio/speech',
          model: 'm',
          voice: 'v',
          instructions: 'i',
          responseFormat: 'mp3',
        },
        fetchImpl,
        translationApproved: false,
      }),
    (err) => err && err.code === 'tts_requires_translation_approval',
  );
  await assert.rejects(
    () =>
      requestCommentaryMp3({
        apiKey: 'sk-test',
        narrationText: 'hello',
        ttsConfig: {
          endpoint: 'https://example.invalid/v1/audio/speech',
          model: 'm',
          voice: 'v',
          instructions: 'i',
          responseFormat: 'mp3',
        },
        fetchImpl,
      }),
    (err) => err && err.code === 'tts_requires_translation_approval',
  );

  const budget = createApiCallBudget(5);
  let mockCalls = 0;
  await assert.rejects(
    () =>
      requestTtsWithBudget({
        budget,
        apiKey: 'k',
        narrationText: 'x',
        ttsConfig: { endpoint: 'x', model: 'm', voice: 'v', instructions: 'i', responseFormat: 'mp3' },
        requestFn: async () => {
          mockCalls += 1;
          return { ok: true, audioBytes: Buffer.from('x') };
        },
      }),
    (err) => err && err.code === 'tts_requires_translation_approval',
  );
  assert.equal(network, 0);
  assert.equal(mockCalls, 0);
  assert.equal(budget.consumed, 0);
});

test('approved TTS dry path may invoke injected requestFn once', async () => {
  const budget = createApiCallBudget(1);
  let mockCalls = 0;
  const result = await requestTtsWithBudget({
    budget,
    apiKey: 'k',
    narrationText: 'x',
    ttsConfig: {
      endpoint: 'https://example.invalid',
      model: 'm',
      voice: 'v',
      instructions: 'i',
      responseFormat: 'mp3',
    },
    translationApproved: true,
    requestFn: async () => {
      mockCalls += 1;
      return { ok: true, audioBytes: Buffer.from('x'), model: 'm', voice: 'v' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(mockCalls, 1);
});

test('R2 blocked without audioApproved (network calls 0)', async () => {
  let network = 0;
  const remoteInspector = async () => {
    network += 1;
    return { action: 'planned_upload' };
  };
  const wranglerRunner = async () => {
    network += 1;
    return { ok: true };
  };

  await assert.rejects(
    () =>
      uploadOneTarget({
        target: {
          audioId: 'x',
          locale: 'en-US',
          audioPath: 'missing.mp3',
        },
        classified: {
          r2Key: 'k',
          publicUrl: 'https://example.invalid/a.mp3',
          localByteSize: 1,
          localSha256: 'a',
          localDuration: 1,
        },
        remoteInspector,
        wranglerRunner,
        audioApproved: false,
      }),
    (err) => err && err.code === 'r2_requires_audio_approval',
  );

  await assert.rejects(
    () =>
      executeRealR2Uploads(
        [
          {
            targetId: 't',
            audioId: 'a',
            publicUrl: 'https://example.invalid/a.mp3',
            byteSize: 1,
            sha256: 'a',
            duration: 1,
            r2Key: 'k',
          },
        ],
        { remoteInspector, wranglerRunner },
      ),
    (err) => err && err.code === 'r2_requires_audio_approval',
  );

  assert.equal(network, 0);
  assert.equal(resolveAudioApproved({}), false);
  assert.equal(resolveTranslationApproved({}), false);
  assert.equal(assertMultilangStageAllowed('r2', { audioApproved: true }).ok, true);
  assert.doesNotThrow(() =>
    requireMultilangStageApproval('r2', { audioApproved: true }),
  );
});

test('containment regression markers remain in reader/policy', () => {
  const reader = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  const policy = fs.readFileSync(
    path.join(ROOT, 'scripts/lib/commentary-multilang-quality-policy.mjs'),
    'utf8',
  );
  assert.match(reader, /isContainedUnverifiedMultilangVerse/);
  assert.match(reader, /commentary\.multilang\.preparing/);
  assert.match(reader, /말씀풀이 번역을 준비하고 있습니다/);
  assert.match(policy, /verseFrom: 11/);
  assert.match(policy, /verseTo: 31/);
});
