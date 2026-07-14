export const COMMENTARY_TYPES = [
  { type: 'original-language', voicePreset: 'study', tableKey: '표1_원어분석' },
  { type: 'history', voicePreset: 'warm', tableKey: '표2_역사적배경' },
  { type: 'theology', voicePreset: 'warm', tableKey: '표3_신학적의미' },
  { type: 'typology', voicePreset: 'study', tableKey: '표4_예표론' },
  { type: 'matthew-henry', voicePreset: 'calm', tableKey: '표5_매튜헨리', paragraphsPerItem: 3 },
  { type: 'sermon', voicePreset: 'strong', tableKey: '표6_설교자료' },
  { type: 'hymn', voicePreset: 'soft', tableKey: '표7_찬송가' },
  { type: 'counseling', voicePreset: 'warm', tableKey: '표8_상담적용' },
  { type: 'cross-reference', voicePreset: 'calm', tableKey: '표9_교차참조' },
];

const VERIFIED_SPECIAL_PLANS = {
  'genesis.001.001.hymn': [
    { kind: 'intro', paragraphIndices: [0] },
    { kind: 'bridge', paragraphIndices: [1] },
    { kind: 'item', paragraphIndices: [2], itemIndex: 0 },
    { kind: 'item', paragraphIndices: [3], itemIndex: 1 },
    { kind: 'item', paragraphIndices: [4], itemIndex: 2 },
    { kind: 'item', paragraphIndices: [5], itemIndex: 3 },
    { kind: 'closing', paragraphIndices: [6] },
  ],
  'genesis.001.001.sermon': [
    { kind: 'intro', paragraphIndices: [0] },
    { kind: 'item', paragraphIndices: [1], itemIndex: 0 },
    { kind: 'item', paragraphIndices: [2], itemIndex: 2 },
    { kind: 'item', paragraphIndices: [3], itemIndex: 3 },
    { kind: 'item', paragraphIndices: [4], itemIndex: 4 },
    { kind: 'item', paragraphIndices: [5], itemIndex: 5 },
  ],
};

export const CROSS_REF_BOOK_NAMES = {
  시: '시편',
  사: '이사야',
  렘: '예레미야',
  욥: '욥기',
  말: '말라기',
  요: '요한복음',
  고전: '고린도전서',
  고후: '고린도후서',
  엡: '에베소서',
  계: '요한계시록',
  히: '히브리서',
  골: '골로새서',
  창: '창세기',
  출: '출애굽기',
  전: '전도서',
  잠: '잠언',
  단: '다니엘',
  마: '마태복음',
  막: '마가복음',
  눅: '누가복음',
  행: '사도행전',
  롬: '로마서',
  벧전: '베드로전서',
  벧후: '베드로후서',
  요일: '요한일서',
  빌: '빌립보서',
  갈: '갈라디아서',
  약: '야고보서',
  유: '유다서',
  삿: '사사기',
  수: '여호수아',
  민: '민수기',
  레: '레위기',
  신: '신명기',
  룻: '룻기',
  삼하: '사무엘하',
  삼상: '사무엘상',
  왕상: '열왕기상',
  왕하: '열왕기하',
  대상: '역대상',
  대하: '역대하',
  스: '에스라',
  느: '느헤미야',
  에: '에스더',
  욘: '요나',
  겔: '에스겔',
  호: '호세아',
  암: '아모스',
  옵: '오바댜',
  욜: '요엘',
  나: '나훔',
  합: '하박국',
  습: '스바냐',
  학: '학개',
  슥: '스가랴',
  미: '미가',
  애: '예레미야애가',
  살전: '데살로니가전서',
  살후: '데살로니가후서',
  딤전: '디모데전서',
  딤후: '디모데후서',
  딛: '디도서',
  몬: '빌레몬서',
  요삼: '요한삼서',
};

export function splitParagraphs(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseScriptureRef(value) {
  const text = String(value || '').trim();
  const spaced = text.match(/^([가-힣]+)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (spaced) {
    return {
      book: spaced[1],
      chapter: spaced[2],
      verseStart: spaced[3],
      verseEnd: spaced[4] || null,
    };
  }

  const compact = text.match(/^([가-힣]+)(\d+):(\d+)(?:-(\d+))?$/);
  if (compact) {
    return {
      book: compact[1],
      chapter: compact[2],
      verseStart: compact[3],
      verseEnd: compact[4] || null,
    };
  }

  return null;
}

export function scriptureRefForSpeech(value) {
  const parsed = parseScriptureRef(value);
  if (!parsed) return String(value || '').trim();

  const bookName = CROSS_REF_BOOK_NAMES[parsed.book] || parsed.book;
  const chapterUnit = bookName === '시편' ? '편' : '장';
  const verseText = parsed.verseEnd
    ? `${parsed.verseStart}절부터 ${parsed.verseEnd}절`
    : `${parsed.verseStart}절`;
  return `${bookName} ${parsed.chapter}${chapterUnit} ${verseText}`;
}

function refNumbersPresent(ref, text) {
  const nums = String(ref || '').match(/\d+/g);
  if (!nums || !nums.length) return false;
  for (const num of nums) {
    if (text.indexOf(num) < 0) return false;
  }
  return true;
}

function paragraphContainsCardRef(paragraph, 구절) {
  const speech = scriptureRefForSpeech(구절);
  const bookMatch = speech.match(/^([가-힣]+)\s/);
  if (bookMatch && paragraph.includes(bookMatch[1]) && refNumbersPresent(구절, paragraph)) {
    return true;
  }

  const parsed = parseScriptureRef(구절);
  if (parsed && paragraph.includes(parsed.book) && refNumbersPresent(구절, paragraph)) {
    return true;
  }

  return paragraph.includes(speech);
}

function findCardRefStart(paragraph, 구절) {
  const speech = scriptureRefForSpeech(구절);
  const speechStart = paragraph.indexOf(speech);
  if (speechStart >= 0 && refNumbersPresent(구절, paragraph)) return speechStart;

  const parsed = parseScriptureRef(구절);
  if (parsed) {
    const abbrevStart = paragraph.indexOf(parsed.book);
    if (abbrevStart >= 0 && refNumbersPresent(구절, paragraph)) return abbrevStart;
  }

  const bookMatch = speech.match(/^([가-힣]+)\s/);
  if (!bookMatch || !refNumbersPresent(구절, paragraph)) return -1;
  return paragraph.indexOf(bookMatch[1]);
}

function extractCardTextFromParagraph(paragraph, 구절, cardRefsInParagraph, includeLeadIn) {
  const start = findCardRefStart(paragraph, 구절);
  if (start < 0) return null;

  const ordered = cardRefsInParagraph
    .map((ref) => ({ ref, start: findCardRefStart(paragraph, ref) }))
    .filter((entry) => entry.start >= 0)
    .sort((a, b) => a.start - b.start);

  const currentIndex = ordered.findIndex((entry) => entry.ref === 구절);
  if (currentIndex < 0) return null;

  const sliceStart = includeLeadIn ? 0 : start;
  const nextStart = ordered[currentIndex + 1]?.start ?? paragraph.length;
  const slice = paragraph.slice(sliceStart, nextStart).trim();
  return slice || null;
}

function isIntroParagraph(paragraph) {
  return /교차참조입니다/.test(paragraph);
}

function isClosingParagraph(paragraph, rows) {
  if (rows.some((row) => paragraphContainsCardRef(paragraph, row.구절))) return false;
  return /^(이처럼|마지막으로|정리하면|요약하면)/.test(paragraph);
}

function isBridgeParagraph(paragraph, rows) {
  if (isIntroParagraph(paragraph) || isClosingParagraph(paragraph, rows)) return false;
  return !rows.some((row) => paragraphContainsCardRef(paragraph, row.구절));
}

function buildPerCardParagraphPlan(paragraphs, rows) {
  if (paragraphs.length < rows.length + 1) return null;

  const introIndex = 0;
  if (!isIntroParagraph(paragraphs[introIndex])) return null;

  let closingIndex = -1;
  const lastIndex = paragraphs.length - 1;
  if (isClosingParagraph(paragraphs[lastIndex], rows)) {
    closingIndex = lastIndex;
  }

  const bodyStart = introIndex + 1;
  const bodyEnd = closingIndex >= 0 ? closingIndex : paragraphs.length;
  const bodyParagraphs = paragraphs.slice(bodyStart, bodyEnd);

  if (bodyParagraphs.length !== rows.length) return null;

  const units = [{ kind: 'intro', paragraphIndices: [introIndex] }];
  for (let i = 0; i < rows.length; i++) {
    const paragraphIndex = bodyStart + i;
    const paragraph = paragraphs[paragraphIndex];
    if (!paragraphContainsCardRef(paragraph, rows[i].구절)) return null;
    units.push({
      kind: 'item',
      itemIndex: i,
      paragraphIndices: [paragraphIndex],
      ttsTexts: [paragraph],
    });
  }

  if (closingIndex >= 0) {
    units.push({ kind: 'closing', paragraphIndices: [closingIndex] });
  }

  return units;
}

export function buildCrossReferencePlan(paragraphs, rows) {
  const perCardPlan = buildPerCardParagraphPlan(paragraphs, rows);
  if (perCardPlan) return perCardPlan;

  if (!paragraphs.length || !rows.length) return null;

  const introIndex = paragraphs.findIndex((paragraph) => isIntroParagraph(paragraph));
  if (introIndex < 0) return null;

  let closingIndex = -1;
  for (let i = paragraphs.length - 1; i > introIndex; i--) {
    if (isClosingParagraph(paragraphs[i], rows)) {
      closingIndex = i;
      break;
    }
  }

  const cardAssignments = rows.map(() => ({
    paragraphIndices: [],
    ttsTexts: [],
  }));

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    if (paragraphIndex === introIndex || paragraphIndex === closingIndex) continue;

    const paragraph = paragraphs[paragraphIndex];
    const matchedCards = rows
      .map((row, itemIndex) => ({ itemIndex, 구절: row.구절 }))
      .filter((entry) => paragraphContainsCardRef(paragraph, entry.구절));

    if (!matchedCards.length) continue;

    const matchedRefs = matchedCards.map((entry) => entry.구절);
    for (let i = 0; i < matchedCards.length; i++) {
      const { itemIndex, 구절 } = matchedCards[i];
      const includeLeadIn = i === 0;
      const text = extractCardTextFromParagraph(paragraph, 구절, matchedRefs, includeLeadIn);
      if (!text) return null;

      cardAssignments[itemIndex].paragraphIndices.push(paragraphIndex);
      cardAssignments[itemIndex].ttsTexts.push(text);
    }
  }

  const unmappedCards = [];
  for (let itemIndex = 0; itemIndex < rows.length; itemIndex++) {
    if (!cardAssignments[itemIndex].ttsTexts.length) {
      unmappedCards.push({ itemIndex, 구절: rows[itemIndex].구절 });
    }
  }

  const units = [{ kind: 'intro', paragraphIndices: [introIndex] }];

  const bridgeIndices = [];
  for (let paragraphIndex = introIndex + 1; paragraphIndex < paragraphs.length; paragraphIndex++) {
    if (paragraphIndex === closingIndex) continue;
    if (isBridgeParagraph(paragraphs[paragraphIndex], rows)) {
      bridgeIndices.push(paragraphIndex);
    }
  }

  for (const bridgeIndex of bridgeIndices) {
    units.push({ kind: 'bridge', paragraphIndices: [bridgeIndex] });
  }

  for (let itemIndex = 0; itemIndex < rows.length; itemIndex++) {
    const assignment = cardAssignments[itemIndex];
    if (!assignment.ttsTexts.length) continue;
    units.push({
      kind: 'item',
      itemIndex,
      paragraphIndices: [...new Set(assignment.paragraphIndices)],
      ttsTexts: assignment.ttsTexts,
    });
  }

  if (closingIndex >= 0) {
    units.push({ kind: 'closing', paragraphIndices: [closingIndex] });
  }

  if (!units.some((unit) => unit.kind === 'item')) return null;

  if (unmappedCards.length) {
    units.unmappedCards = unmappedCards;
  }

  return units;
}

export function describeCrossReferenceMapping(paragraphs, rows) {
  const plan = buildCrossReferencePlan(paragraphs, rows);
  if (!plan) {
    const mapping = rows.map((row, itemIndex) => {
      const paragraphIndices = [];
      for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
        if (paragraphContainsCardRef(paragraphs[paragraphIndex], row.구절)) {
          paragraphIndices.push(paragraphIndex);
        }
      }
      return {
        itemIndex,
        구절: row.구절,
        paragraphIndices,
        mapped: paragraphIndices.length > 0,
      };
    });
    return { ok: false, mapping, plan: null };
  }

  const mapping = plan
    .filter((unit) => unit.kind === 'item')
    .map((unit) => ({
      itemIndex: unit.itemIndex,
      구절: rows[unit.itemIndex]?.구절 || '',
      paragraphIndices: unit.paragraphIndices,
      ttsTexts: unit.ttsTexts,
      mapped: true,
    }));

  return { ok: true, mapping, plan };
}

export function buildStandardPlan(paragraphs, rowCount, paragraphsPerItem) {
  const units = [];

  if (!paragraphs.length) return null;

  units.push({ kind: 'intro', paragraphIndices: [0] });

  if (paragraphsPerItem && paragraphsPerItem > 1) {
    const body = paragraphs.slice(1);
    const block = rowCount * paragraphsPerItem;
    let closing = null;

    if (body.length === block + 1) {
      closing = body[body.length - 1];
      body.splice(block);
    } else if (body.length !== block) {
      return null;
    }

    for (let i = 0; i < rowCount; i++) {
      const indices = [];
      for (let p = 0; p < paragraphsPerItem; p++) {
        indices.push(1 + i * paragraphsPerItem + p);
      }
      units.push({ kind: 'item', paragraphIndices: indices, itemIndex: i });
    }

    if (closing) {
      units.push({ kind: 'closing', paragraphIndices: [paragraphs.length - 1] });
    }

    return units;
  }

  if (paragraphs.length >= rowCount + 2) {
    for (let i = 0; i < rowCount; i++) {
      units.push({ kind: 'item', paragraphIndices: [1 + i], itemIndex: i });
    }
    units.push({ kind: 'closing', paragraphIndices: [paragraphs.length - 1] });
    return units;
  }

  if (paragraphs.length === rowCount + 1) {
    for (let i = 0; i < rowCount; i++) {
      units.push({ kind: 'item', paragraphIndices: [1 + i], itemIndex: i });
    }
    return units;
  }

  return null;
}

function buildIntroItemsPlan(paragraphs, rowCount) {
  if (paragraphs.length !== rowCount + 1) return null;

  const units = [{ kind: 'intro', paragraphIndices: [0] }];
  for (let i = 0; i < rowCount; i++) {
    units.push({ kind: 'item', paragraphIndices: [1 + i], itemIndex: i });
  }
  return units;
}

function buildHymnSectionalPlan(paragraphs, rowCount) {
  if (paragraphs.length !== rowCount + 3) return null;

  const units = [
    { kind: 'intro', paragraphIndices: [0] },
    { kind: 'bridge', paragraphIndices: [1] },
  ];

  for (let i = 0; i < rowCount; i++) {
    units.push({ kind: 'item', paragraphIndices: [2 + i], itemIndex: i });
  }

  units.push({ kind: 'closing', paragraphIndices: [paragraphs.length - 1] });
  return units;
}

function buildHymnPlan(paragraphs, rowCount) {
  return (
    buildIntroItemsPlan(paragraphs, rowCount)
    || buildHymnSectionalPlan(paragraphs, rowCount)
    || buildStandardPlan(paragraphs, rowCount, 0)
  );
}

function buildSermonPlan(paragraphs, rowCount) {
  return (
    buildStandardPlan(paragraphs, rowCount, 0)
    || buildIntroItemsPlan(paragraphs, rowCount)
  );
}

export function buildGenerationPlan({
  typeConfig,
  paragraphs,
  rowCount,
  rows,
  bookId,
  chapter,
  verse,
}) {
  const chapter3 = String(chapter).padStart(3, '0');
  const verse3 = String(verse).padStart(3, '0');
  const specialKey = `${bookId}.${chapter3}.${verse3}.${typeConfig.type}`;
  const verified = VERIFIED_SPECIAL_PLANS[specialKey];
  if (verified) return verified;

  switch (typeConfig.type) {
    case 'matthew-henry':
      return buildStandardPlan(paragraphs, rowCount, typeConfig.paragraphsPerItem || 3);
    case 'hymn':
      return buildHymnPlan(paragraphs, rowCount);
    case 'sermon':
      return buildSermonPlan(paragraphs, rowCount);
    case 'cross-reference':
      return buildCrossReferencePlan(paragraphs, rows || []);
    default:
      return buildStandardPlan(paragraphs, rowCount, 0);
  }
}

export function countPlannedSegments(units) {
  if (!units) return 0;
  return units.reduce((sum, unit) => {
    if (Array.isArray(unit.ttsTexts) && unit.ttsTexts.length) {
      return sum + unit.ttsTexts.length;
    }
    return sum + unit.paragraphIndices.length;
  }, 0);
}

export function countPlannedItems(units) {
  if (!units) return 0;
  return units.filter((unit) => unit.kind === 'item').length;
}

export function expectedItemCount(type, rowCount, units) {
  if (!units) return null;
  if (type === 'sermon') {
    return countPlannedItems(units);
  }
  if (type === 'cross-reference') {
    return rowCount;
  }
  return rowCount;
}
