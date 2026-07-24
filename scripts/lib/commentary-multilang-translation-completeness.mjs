/**
 * Detect incomplete EN/JA translation output that should not auto-approve.
 * Avoids false positives on Bible references and original-language hyphenation.
 */

export const INCOMPLETE_SEVERITY = Object.freeze({
  FAIL: 'FAIL',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
});

const BIBLE_BOOK =
  '(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalm|Psalms|Proverbs|Ecclesiastes|Song(?:\\s+of\\s+Solomon)?|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation|[1-3]\\s?(?:Samuel|Kings|Chronicles|Corinthians|Thessalonians|Timothy|Peter|John)|創世記|出エジプト記|レビ記|民数記|申命記|ヨシュア記|士師記|ルツ記|サムエル記|列王記|歴代誌|エズラ記|ネヘミヤ記|エステル記|ヨブ記|詩篇|箴言|伝道の書|雅歌|イザヤ書|エレミヤ書|哀歌|エゼキエル書|ダニエル書|ホセア書|ヨエル書|アモス書|オバデヤ書|ヨナ書|ミカ書|ナホム書|ハバクク書|ゼパニヤ書|ハガイ書|ゼカリヤ書|マラキ書|マタイによる福音書|マルコによる福音書|ルカによる福音書|ヨハネによる福音書|使徒言行録|ローマの信徒への手紙|コリント|ガラテヤ|エフェソ|フィリピ|コロサイ|テサロニケ|テモテ|テトス|フィレモン|ヘブライ|ヤコブ|ペトロ|ユダ|ヨハネの黙示録)';

const INTRODUCTORY_PHRASE =
  '(?:' +
  [
    'for\\s+examples?',
    'e\\.g\\.',
    'eg\\.',
    'such\\s+as',
    'as\\s+follows',
    'application\\s+examples?',
    'examples?(?:\\s+include)?',
    'including',
    'namely',
    '例えば',
    'たとえば',
    '適用例(?:としては)?',
    '適用例は',
    '次の(?:とおり|通り)',
    '以下の(?:とおり|通り)',
    '次のとおり',
    '次の通り',
    '下記のとおり',
    '下記の通り',
  ].join('|') +
  ')';

const TEMPLATE_LEFTOVER =
  /(?:\[(?:TODO|TBD|FIXME|PLACEHOLDER|INSERT(?:\s+\w+)?)\]|\{\{[^}]+\}\}|__TRANSLATE(?:_ME)?__|\bTODO\b|\bTBD\b|\bFIXME\b|insert\s+(?:example|text|title|content)\s+here|translate\s+this|번역하세요|여기에\s*입력|例を入れてください|タイトルを入れてください)/iu;

const TRAILING_CONNECTIVE_EN =
  /(?:\b(?:and|or|but|because|which|that|with|to|of|for|as|if|when|while|although|though|unless|until|than|then)\b|[,:;])\s*$/i;

const TRAILING_CONNECTIVE_JA =
  /(?:そして|また|または|或いは|あるいは|しかし|だが|なので|なので、|だから|なので|ので|けれど|けれども|て|で|が|を|に|へ|と|も|は|の|から|まで|より|つつ|ながら)[、,]?\s*$/u;

function isSubstantiveToken(text) {
  const cleaned = String(text || '')
    .replace(/[\s\-–—:：.。,，、;；'"`「」『』()（）\[\]【】…·・]/g, '')
    .replace(/«[^»]+»/g, '');
  return cleaned.length >= 1;
}

/**
 * Mask verse refs and script spans that commonly use colon/hyphen legitimately.
 */
export function maskProtectedTranslationSpans(text) {
  let out = String(text || '');
  out = out.replace(new RegExp(`\\b${BIBLE_BOOK}\\s+\\d+:\\d+(?:-\\d+)?\\b`, 'giu'), ' «BREF» ');
  out = out.replace(/\b\d+:\d+(?:-\d+)?\b/g, ' «VREF» ');
  out = out.replace(/\p{Script=Hebrew}+/gu, ' «HEB» ');
  out = out.replace(/\p{Script=Greek}+/gu, ' «GRK» ');
  // Spaced title pairs only ("Left - Right"). Tight hyphens stay visible for incompleteness checks.
  out = out.replace(
    /([^\s\-–—:：。．.!?]{2,40})\s+[-–—]\s+([^\s\-–—:：。．.!?]{2,40})/gu,
    ' «HYPHENPAIR» ',
  );
  return out;
}

function pushFinding(findings, finding) {
  findings.push({
    severity: finding.severity,
    code: finding.code,
    message: finding.message,
    sample: finding.sample || null,
  });
}

function checkUnbalancedDelimiters(text, findings) {
  const pairs = [
    ['(', ')'],
    ['（', '）'],
    ['[', ']'],
    ['【', '】'],
    ['「', '」'],
    ['『', '』'],
  ];
  for (const [open, close] of pairs) {
    let depth = 0;
    for (const ch of text) {
      if (ch === open) depth += 1;
      if (ch === close) depth -= 1;
      if (depth < 0) {
        pushFinding(findings, {
          severity: INCOMPLETE_SEVERITY.FAIL,
          code: 'unclosed_delimiter',
          message: `Unbalanced delimiter ${open}${close}`,
          sample: text.slice(0, 80),
        });
        return;
      }
    }
    if (depth > 0) {
      pushFinding(findings, {
        severity: INCOMPLETE_SEVERITY.FAIL,
        code: 'unclosed_delimiter',
        message: `Unclosed delimiter ${open}`,
        sample: text.slice(0, 80),
      });
      return;
    }
  }

  // Straight / curly quotes: odd count is incomplete when quotes appear.
  for (const quote of ['"', '“', '”', "'", '‘', '’']) {
    const count = (text.match(new RegExp(quote, 'g')) || []).length;
    if (count % 2 === 1) {
      // Allow apostrophes inside English words: skip single quote check when mostly word-internal.
      if (quote === "'" || quote === '’') {
        const stripped = text.replace(/[A-Za-z]'[A-Za-z]/g, 'X').replace(/[A-Za-z]’[A-Za-z]/g, 'X');
        const remaining = (stripped.match(new RegExp(quote, 'g')) || []).length;
        if (remaining % 2 === 0) continue;
      }
      pushFinding(findings, {
        severity: INCOMPLETE_SEVERITY.REVIEW_REQUIRED,
        code: 'unclosed_delimiter',
        message: `Unclosed quote ${quote}`,
        sample: text.slice(0, 80),
      });
      return;
    }
  }
}

function checkEmptyPlaceholder(text, findings) {
  const trimmed = text.trim();
  if (!trimmed) {
    pushFinding(findings, {
      severity: INCOMPLETE_SEVERITY.FAIL,
      code: 'incomplete_empty_placeholder',
      message: 'Empty placeholder value',
      sample: trimmed,
    });
    return;
  }
  if (/^[-–—:：.…·・]+$/.test(trimmed)) {
    pushFinding(findings, {
      severity: INCOMPLETE_SEVERITY.FAIL,
      code: 'incomplete_empty_placeholder',
      message: `Placeholder-only value: ${trimmed}`,
      sample: trimmed,
    });
  }
}

function checkEmptyListItems(text, findings) {
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*(?:[-*•]|\d+[.)、．])\s*$/u.test(line)) {
      pushFinding(findings, {
        severity: INCOMPLETE_SEVERITY.FAIL,
        code: 'incomplete_empty_list_item',
        message: 'Empty bullet or numbered item',
        sample: line.trim() || line,
      });
      return;
    }
  }
}

function checkIntroductoryWithoutContent(text, findings) {
  const masked = maskProtectedTranslationSpans(text);
  const re = new RegExp(`${INTRODUCTORY_PHRASE}(\\s*[-–—:：]?\\s*)`, 'giu');
  let match;
  while ((match = re.exec(masked)) !== null) {
    const gap = match[1] || '';
    const after = masked.slice(match.index + match[0].length);
    const nextChunk = after.split(/[。．.!?\n]/)[0] || '';
    const trimmedNext = nextChunk.trim();

    // "適用例としては-を挙げる" / "for example: -" / empty after introducer+punct
    if (/[-–—:：]/.test(gap)) {
      if (
        !trimmedNext ||
        /^[-–—:：.…·・]+/.test(trimmedNext) ||
        /^(?:を|が|は|に|で|と|も|へ)/u.test(trimmedNext)
      ) {
        pushFinding(findings, {
          severity: INCOMPLETE_SEVERITY.FAIL,
          code: 'incomplete_after_introducer',
          message: `Incomplete content after introductory phrase (${match[0].slice(0, 40)})`,
          sample: `${match[0]}${trimmedNext}`.slice(0, 80),
        });
        return;
      }
      const withoutParticle = trimmedNext
        .replace(/^(?:を|が|は|に|で|と|も|へ)\s*/u, '')
        .trim();
      if (!isSubstantiveToken(withoutParticle)) {
        pushFinding(findings, {
          severity: INCOMPLETE_SEVERITY.FAIL,
          code: 'incomplete_after_introducer',
          message: `Incomplete content after introductory phrase (${match[0].slice(0, 40)})`,
          sample: `${match[0]}${trimmedNext}`.slice(0, 80),
        });
        return;
      }
    } else if (!trimmedNext || /^[-–—:：.…·・]+/.test(trimmedNext)) {
      if (
        /適用例|for\s+example|as\s+follows|例えば|たとえば|such\s+as|namely/i.test(
          match[0],
        )
      ) {
        pushFinding(findings, {
          severity: INCOMPLETE_SEVERITY.FAIL,
          code: 'incomplete_after_introducer',
          message: `Incomplete content after introductory phrase (${match[0].slice(0, 40)})`,
          sample: `${match[0]}${trimmedNext}`.slice(0, 80),
        });
        return;
      }
    }
  }
}

function checkTemplateLeftovers(text, findings) {
  const match = String(text || '').match(TEMPLATE_LEFTOVER);
  if (match) {
    pushFinding(findings, {
      severity: INCOMPLETE_SEVERITY.FAIL,
      code: 'template_leftover',
      message: `Template instruction leftover: ${match[0]}`,
      sample: match[0],
    });
  }
}

function checkTrailingConnective(text, findings, locale) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return;
  const last = lines[lines.length - 1];
  const masked = maskProtectedTranslationSpans(last);
  // Complete Japanese polite endings are fine.
  if (/(?:です|ます|でした|ました|でしょう|ましょう)[。．]?$/.test(masked)) return;
  if (/(?:[.!?。」』）)\]]$)/.test(masked) && !TRAILING_CONNECTIVE_EN.test(masked.replace(/[.!?。」』）)\]]+$/g, ''))) {
    // ends with terminal punctuation; only flag if connective immediately before it
  }

  const localeKey = String(locale || '');
  const isJa = localeKey.startsWith('ja');
  const isEn = localeKey.startsWith('en');
  if (isJa && TRAILING_CONNECTIVE_JA.test(masked)) {
    pushFinding(findings, {
      severity: INCOMPLETE_SEVERITY.REVIEW_REQUIRED,
      code: 'trailing_connective',
      message: 'Sentence appears to end with a connective',
      sample: last.slice(0, 80),
    });
    return;
  }
  if (isEn && TRAILING_CONNECTIVE_EN.test(masked)) {
    pushFinding(findings, {
      severity: INCOMPLETE_SEVERITY.REVIEW_REQUIRED,
      code: 'trailing_connective',
      message: 'Sentence appears to end with a connective',
      sample: last.slice(0, 80),
    });
  }
}

/**
 * Scan one text blob for incomplete translation markers.
 */
export function detectIncompleteTranslationText(text, options = {}) {
  const findings = [];
  const value = String(text ?? '');
  if (!value.trim()) {
    // Empty handled by caller for required fields; avoid double-counting here
    // when explicitly asked via checkEmpty.
    if (options.treatEmptyAsFail) {
      checkEmptyPlaceholder(value, findings);
    }
    return findings;
  }

  checkEmptyPlaceholder(value, findings);
  checkEmptyListItems(value, findings);
  checkTemplateLeftovers(value, findings);
  checkIntroductoryWithoutContent(value, findings);
  checkUnbalancedDelimiters(value, findings);
  if (options.checkTrailingConnective !== false) {
    checkTrailingConnective(value, findings, options.locale);
  }
  return findings;
}

/**
 * Scan narration + translated card fields.
 */
export function detectIncompleteTranslationOutput({
  narrationText = '',
  cards = [],
  locale = null,
} = {}) {
  const findings = [];

  for (const item of detectIncompleteTranslationText(narrationText, {
    locale,
    checkTrailingConnective: true,
  })) {
    findings.push({ ...item, where: 'narration' });
  }

  for (const card of cards || []) {
    const identity = String(card?.identity || '');
    for (const item of detectIncompleteTranslationText(identity, {
      locale,
      checkTrailingConnective: false,
    })) {
      findings.push({
        ...item,
        where: `card[${card.itemIndex}].identity`,
      });
    }
    const fields = card?.fields && typeof card.fields === 'object' ? card.fields : {};
    for (const [key, raw] of Object.entries(fields)) {
      const value = String(raw ?? '');
      // Card titles/labels are often short fragments; skip trailing-connective there.
      const fieldFindings = detectIncompleteTranslationText(value, {
        locale,
        treatEmptyAsFail: true,
        checkTrailingConnective: false,
      });
      for (const item of fieldFindings) {
        findings.push({
          ...item,
          where: `card[${card.itemIndex}].fields.${key}`,
        });
      }
    }
  }

  const fail = findings.filter(
    (item) => item.severity === INCOMPLETE_SEVERITY.FAIL,
  );
  const review = findings.filter(
    (item) => item.severity === INCOMPLETE_SEVERITY.REVIEW_REQUIRED,
  );

  let grade = null;
  if (fail.length) grade = INCOMPLETE_SEVERITY.FAIL;
  else if (review.length) grade = INCOMPLETE_SEVERITY.REVIEW_REQUIRED;

  return {
    ok: findings.length === 0,
    grade,
    findings,
    failCount: fail.length,
    reviewCount: review.length,
  };
}
