import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCommentaryMultilangRangeTargets,
} from '../lib/commentary-multilang-targets.mjs';
import {
  buildTranslationJob,
  buildTranslationJobs,
  countHangulChars,
  evaluateTranslationResultQa,
  flattenCardText,
  formatJsonl,
  readJsonlFile,
  validateTranslationResults,
  writeJsonlFile,
} from '../lib/commentary-multilang-translation-io.mjs';
import {
  parseNarrationStructure,
} from '../lib/commentary-multilang-translation.mjs';

function synthesizeResult(job, overrides = {}) {
  const sourceParagraphs = parseNarrationStructure(job.sourceNarrationText);
  const paragraphs =
    overrides.paragraphs ||
    sourceParagraphs.map((lines, pIndex) =>
      lines.map(
        (_line, lineIndex) =>
          `Translated ${job.locale} p${pIndex + 1}l${lineIndex + 1} for ${job.type}.`,
      ),
    );

  const cards =
    overrides.cards ||
    job.sourceCards.map((card, cardIndex) => ({
      itemIndex: card.itemIndex,
      identity: `translated-identity-${card.itemIndex}`,
      fields: Object.fromEntries(
        Object.keys(card.fields || {}).map((key, fieldIndex) => {
          const sourceValue = String(card.fields[key] ?? '');
          const hebrew = (sourceValue.match(/\p{Script=Hebrew}+/gu) || []).join(
            ' ',
          );
          const base = `Translated value ${cardIndex}-${fieldIndex}`;
          return [key, hebrew ? `${hebrew} ${base}` : base];
        }),
      ),
    }));

  return {
    targetId: job.targetId,
    sourceHash: overrides.sourceHash === undefined ? job.sourceHash : overrides.sourceHash,
    locale: job.locale,
    model: 'fixture',
    translatedAt: '2026-07-24T00:00:00Z',
    translatedCards: cards,
    translatedNarrationParagraphs: paragraphs,
    ...overrides.extra,
  };
}

test('genesis 1:11-1:31 exports 378 jobs with EN189 JA189 and stable hash', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:31',
    locales: 'en-US,ja-JP',
    types: 'all',
  });
  const first = buildTranslationJobs(plan.targets);
  const second = buildTranslationJobs(plan.targets);

  assert.equal(first.jobCount, 378);
  assert.equal(first.countsByLocale['en-US'], 189);
  assert.equal(first.countsByLocale['ja-JP'], 189);
  assert.equal(first.duplicateTargetIds.length, 0);
  assert.equal(first.missingSourceHashCount, 0);
  assert.equal(
    new Set(first.jobs.map((job) => job.targetId)).size,
    378,
  );
  assert.ok(first.jobs.every((job) => job.sourceHash));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomna-jobs-'));
  const a = path.join(dir, 'a.jsonl');
  const b = path.join(dir, 'b.jsonl');
  const writtenA = writeJsonlFile(a, first.jobs, { requireTmp: true });
  const writtenB = writeJsonlFile(b, second.jobs, { requireTmp: true });
  assert.equal(writtenA.sha256, writtenB.sha256);
  assert.equal(writtenA.lineCount, 378);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('validateTranslationResults catches missing duplicate order hangul and hash errors', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:11',
    locales: 'en-US',
    types: 'history',
  });
  const { jobs } = buildTranslationJobs(plan.targets);
  assert.equal(jobs.length, 1);
  const job = jobs[0];

  const ok = synthesizeResult(job);
  assert.equal(evaluateTranslationResultQa(job, ok).ok, true);

  const missing = validateTranslationResults(jobs, [], { expectJobOrder: false });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missingIds, [job.targetId]);

  const duplicate = validateTranslationResults(
    jobs,
    [ok, { ...ok }],
    { expectJobOrder: false },
  );
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.duplicateIds.includes(job.targetId));

  const orderJobs = buildTranslationJobs(
    buildCommentaryMultilangRangeTargets({
      bookId: 'genesis',
      from: '1:11',
      to: '1:12',
      locales: 'en-US',
      types: 'history',
    }).targets,
  ).jobs;
  const swapped = [
    synthesizeResult(orderJobs[1]),
    synthesizeResult(orderJobs[0]),
  ];
  const order = validateTranslationResults(orderJobs, swapped, {
    expectJobOrder: true,
  });
  assert.equal(order.ok, false);
  assert.ok(order.orderErrors.length >= 1);

  const hangulResult = synthesizeResult(job, {
    paragraphs: parseNarrationStructure(job.sourceNarrationText).map((lines) =>
      lines.map(() => '이것은 한글이 많이 남은 번역 실패 사례입니다. 한글 잔존 검사.'),
    ),
  });
  const hangul = evaluateTranslationResultQa(job, hangulResult);
  assert.equal(hangul.ok, false);
  assert.ok(hangul.codes.includes('hangul_residual'));
  assert.ok(countHangulChars(hangulResult.translatedNarrationParagraphs.flat().join('\n')) > 0);

  const hash = evaluateTranslationResultQa(
    job,
    synthesizeResult(job, { sourceHash: 'deadbeef' }),
  );
  assert.equal(hash.ok, false);
  assert.ok(hash.codes.includes('source_hash_mismatch'));
});

test('soft-allow does not bypass hangul empty html or missing hebrew terms', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:11',
    locales: 'en-US',
    types: 'original-language',
  });
  const { jobs } = buildTranslationJobs(plan.targets);
  const job = jobs[0];
  assert.equal(job.type, 'original-language');

  const hangulOl = evaluateTranslationResultQa(
    job,
    synthesizeResult(job, {
      paragraphs: parseNarrationStructure(job.sourceNarrationText).map((lines) =>
        lines.map(() => '한글이 많이 남은 원어 번역 실패 문장입니다. 검사.'),
      ),
    }),
  );
  assert.equal(hangulOl.ok, false);
  assert.ok(hangulOl.codes.includes('hangul_residual'));

  const emptyCard = evaluateTranslationResultQa(
    job,
    synthesizeResult(job, {
      cards: job.sourceCards.map((card, index) => ({
        itemIndex: index,
        identity: `id-${index}`,
        fields: Object.fromEntries(
          Object.keys(card.fields || {}).map((key) => [key, '']),
        ),
      })),
    }),
  );
  assert.equal(emptyCard.ok, false);
  assert.ok(emptyCard.codes.includes('empty_card'));

  const html = evaluateTranslationResultQa(
    job,
    synthesizeResult(job, {
      paragraphs: parseNarrationStructure(job.sourceNarrationText).map((lines) =>
        lines.map(() => '<script>alert(1)</script> translated line'),
      ),
    }),
  );
  assert.equal(html.ok, false);
  assert.ok(html.codes.includes('dangerous_html'));

  const missingHebrew = evaluateTranslationResultQa(
    job,
    synthesizeResult(job, {
      cards: job.sourceCards.map((card, cardIndex) => ({
        itemIndex: card.itemIndex,
        identity: `translated-identity-${card.itemIndex}`,
        fields: Object.fromEntries(
          Object.keys(card.fields || {}).map((key, fieldIndex) => [
            key,
            `Translated value ${cardIndex}-${fieldIndex}`,
          ]),
        ),
      })),
    }),
  );
  assert.equal(missingHebrew.ok, false);
  assert.ok(missingHebrew.codes.includes('missing_original_language_terms'));

  const okOl = evaluateTranslationResultQa(job, synthesizeResult(job));
  assert.equal(okOl.ok, true, okOl.reasons.join('; '));
});

test('buildTranslationJob requires existing Korean source', () => {
  assert.throws(
    () =>
      buildTranslationJob({
        bookId: 'genesis',
        chapter: 1,
        verse: 11,
        type: 'history',
        locale: 'en-US',
        cardCount: 3,
        cards: [],
      }, { sourcePath: 'tts-scripts/ko-KR/missing.txt' }),
    /Korean source missing/,
  );
});

test('formatJsonl round-trips through readJsonlFile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomna-jsonl-'));
  const file = path.join(dir, 'x.jsonl');
  const body = formatJsonl([{ a: 1 }, { b: 2 }]);
  fs.writeFileSync(file, body);
  const loaded = readJsonlFile(file);
  assert.equal(loaded.records.length, 2);
  assert.equal(loaded.parseErrors.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hangul residual ignores Korean field keys and checks values only', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:11',
    locales: 'ja-JP',
    types: 'counseling',
  });
  const job = buildTranslationJobs(plan.targets).jobs[0];
  const result = synthesizeResult(job);
  // Ensure field keys remain Korean while values stay Japanese/Latin.
  for (const card of result.translatedCards) {
    assert.ok(
      Object.keys(card.fields || {}).some((key) => countHangulChars(key) > 0),
      'fixture must keep Korean field keys',
    );
    for (const value of Object.values(card.fields || {})) {
      assert.equal(countHangulChars(String(value)), 0);
    }
  }
  const flat = flattenCardText(result.translatedCards);
  assert.equal(countHangulChars(flat), 0);
  const qa = evaluateTranslationResultQa(job, result);
  assert.equal(qa.ok, true);
  assert.equal(qa.translationGrade, 'PASS');
  assert.equal(qa.codes.includes('hangul_residual'), false);
});

test('evaluateTranslationResultQa quote checks match completeness module', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:16',
    to: '1:16',
    locales: 'en-US',
    types: 'counseling',
  });
  const job = buildTranslationJobs(plan.targets).jobs[0];
  const ok = synthesizeResult(job, {
    paragraphs: parseNarrationStructure(job.sourceNarrationText).map((lines, pIndex) =>
      lines.map(
        (_line, lineIndex) =>
          pIndex === 0 && lineIndex === 0
            ? "Genesis 1:16 counseling. The text is 'God made two great lights.' A practical application is to practice 'severance prayer'."
            : `Translated en-US p${pIndex + 1}l${lineIndex + 1}.`,
      ),
    ),
  });
  const okQa = evaluateTranslationResultQa(job, ok);
  assert.equal(okQa.codes.includes('unclosed_delimiter'), false);

  const bad = synthesizeResult(job, {
    paragraphs: parseNarrationStructure(job.sourceNarrationText).map((lines, pIndex) =>
      lines.map(
        (_line, lineIndex) =>
          pIndex === 0 && lineIndex === 0
            ? 'Broken quote: "unclosed double quote remains'
            : `Translated en-US p${pIndex + 1}l${lineIndex + 1}.`,
      ),
    ),
  });
  const badQa = evaluateTranslationResultQa(job, bad);
  assert.equal(badQa.ok, false);
  assert.ok(
    badQa.codes.includes('unclosed_delimiter') ||
      (badQa.incompleteFindings || []).some((item) => item.code === 'unclosed_delimiter'),
  );
});
