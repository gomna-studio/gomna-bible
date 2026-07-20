import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadJsObject(filePath, varName) {
  const src = readFileSync(filePath, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox[varName];
}

const oldData = loadJsObject(join(root, 'old_testament.js'), 'oldTestamentData');
const newData = loadJsObject(join(root, 'new_testament.js'), 'newTestamentData');

const searchSrc = readFileSync(join(root, 'js/gomna-bible-search.js'), 'utf8');
const searchSandbox = { window: {}, globalThis: {} };
searchSandbox.window = searchSandbox.globalThis;
vm.createContext(searchSandbox);
vm.runInContext(searchSrc, searchSandbox);
const GomnaBibleSearch = searchSandbox.window.GomnaBibleSearch;

GomnaBibleSearch.buildIndex(oldData, newData);

function topicSearch(query) {
  const results = [];
  [oldData, newData].forEach((data) => {
    data.books.forEach((book) => {
      book.chapters.forEach((chapter) => {
        if (!chapter.verses) return;
        chapter.verses.forEach((verse) => {
          if (verse.text.indexOf(query) >= 0) {
            results.push(`${book.name} ${chapter.chapter}:${verse.verse}`);
          }
        });
      });
    });
  });
  return results;
}

function bodySearch(query) {
  return GomnaBibleSearch.shouldUseLordPrayerBodyResults(query)
    ? GomnaBibleSearch.getLordPrayerBodyResults()
    : GomnaBibleSearch.searchBody(query);
}

function verseRefExists(ref) {
  const [bookPart, rest] = ref.split(/\s+/);
  const m = rest.match(/^(\d+):(\d+)$/);
  if (!m) return false;
  const chapter = Number(m[1]);
  const verse = Number(m[2]);
  const data = [...oldData.books, ...newData.books].find((b) => b.name === bookPart);
  if (!data) return false;
  const ch = data.chapters.find((c) => c.chapter === chapter);
  return !!(ch && ch.verses && ch.verses.some((v) => v.verse === verse));
}

function verseHasGodTerm(text) {
  const n = GomnaBibleSearch.normalizeText(text);
  if (n.includes('하나님') || n.includes('여호와') || n.includes('하느님')) return true;
  return /주님|주께|주가|주는|주를|주의/.test(n);
}

function verseHasTogetherTerm(text) {
  const n = GomnaBibleSearch.normalizeText(text);
  const c = GomnaBibleSearch.compactSearchText(text);
  if (n.includes('함께') || n.includes('같이')) return true;
  return c.includes('함께') || c.includes('함께하');
}

function verseHasFearTerm(text) {
  const n = GomnaBibleSearch.normalizeText(text);
  return /두려워|두려움|무서워|무서움/.test(n);
}

function verseHasWorryTerm(text) {
  const n = GomnaBibleSearch.normalizeText(text);
  return /염려|근심|걱정/.test(n);
}

function verseHasCompanionshipPromiseText(text) {
  const n = GomnaBibleSearch.normalizeText(text);
  if (/떠나지\s*아니|버리지\s*아니|함께\s*하리라|고아와\s*같이\s*버려두지/.test(n)) return true;
  if ((n.includes('너와') || n.includes('너희와')) && n.includes('함께')) return true;
  if (n.includes('함께하리라') || n.includes('함께 하리라')) return true;
  return false;
}

function verseIsLonelinessNarrativeOnly(text) {
  const n = GomnaBibleSearch.normalizeText(text);
  if (verseHasCompanionshipPromiseText(text)) return false;
  if (/혼자\s*남았|홀로\s*갔|홀로\s*앉았|다\s*떠나갔|홀로\s*두었/.test(n)) return true;
  if (n.includes('함께') && /더라|하였|하매|하여/.test(n)) return true;
  return false;
}

function bodyHasNaturalMatch(body) {
  return body.some((r) => r.matchType === 'natural-concept' || r.matchType === 'natural-single-concept');
}

function countCompanionshipInTop(body, topN) {
  return body.slice(0, topN).filter((r) => verseHasCompanionshipPromiseText(r.text)).length;
}

function rankOfRef(body, ref) {
  const idx = body.findIndex((r) => r.ref === ref);
  return idx >= 0 ? idx + 1 : 0;
}

function expectIncludes(query, expectedRef, label) {
  const body = bodySearch(query);
  const hit = body.find((r) => r.ref === expectedRef);
  const ok = !!hit;
  const rank = hit ? body.indexOf(hit) + 1 : 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${label}] "${query}" -> ${expectedRef} (rank:${rank || 'none'}, matchType:${hit?.matchType || 'n/a'}, score:${hit?.score ?? 'n/a'})`);
  if (!ok) console.log(`       total results: ${body.length}, first: ${body[0]?.ref || 'none'}`);
  return ok;
}

let pass = 0;
let fail = 0;
function check(ok) {
  if (ok) pass += 1;
  else fail += 1;
}

console.log('=== A. 빌립보서 4:13 ===');
[
  '내게 능력 주시는',
  '능력 주시는 자 안에서',
  '내가 모든 것을',
  '할 수 있느니라',
  '능력 모든 것을',
  '내게 모든 할 수',
].forEach((q) => check(expectIncludes(q, '빌립보서 4:13', 'Phil 4:13')));

console.log('\n=== B. 다른 부분 검색 ===');
check(expectIncludes('여호와는 나의 목자', '시편 23:1', 'Ps 23:1'));
check(expectIncludes('하나님이 세상을 이처럼', '요한복음 3:16', 'Jn 3:16'));
check(expectIncludes('쉬지 말고', '데살로니가전서 5:17', '1Th 5:17'));
check(expectIncludes('항상 기뻐하라', '데살로니가전서 5:16', '1Th 5:16'));

console.log('\n=== C. 주제 검색 우선순위 ===');
['사랑', '기도', '믿음'].forEach((q) => {
  const topic = topicSearch(q);
  const body = bodySearch(q);
  const topicFirst = topic.length > 0;
  const bodyAfter = body.length > 0;
  console.log(`"${q}" -> topic:${topic.length} (first:${topic[0] || 'none'}), body:${body.length} (first:${body[0]?.ref || 'none'})`);
  check(topicFirst);
});

console.log('\n=== D. 주기도문 ===');
['주기도문', '하늘에 계신 우리 아버지'].forEach((q) => {
  const faith = GomnaBibleSearch.searchFaithResources(q);
  const body = bodySearch(q);
  const faithOk = faith.some((f) => f.id === 'lords-prayer');
  const bodyOk = body.length === 5 && body[0]?.ref === '마태복음 6:9';
  console.log(`"${q}" -> faith:${faithOk ? 'lords-prayer' : 'none'}, body:${body.length}, first:${body[0]?.ref || 'none'}`);
  check(faithOk && bodyOk);
});

console.log('\n=== E. 결과 없음 ===');
const empty = bodySearch('존재하지않는성경문장테스트');
console.log(`존재하지않는성경문장테스트 -> body:${empty.length}`);
check(empty.length === 0);

console.log('\n=== F. 공백 없는 검색 ===');
[
  ['내게능력주시는', '빌립보서 4:13'],
  ['능력주시는자안에서', '빌립보서 4:13'],
  ['여호와는나의목자시니', '시편 23:1'],
  ['하나님이세상을이처럼사랑하사', '요한복음 3:16'],
  ['쉬지말고기도하라', '데살로니가전서 5:17'],
].forEach(([q, ref]) => check(expectIncludes(q, ref, 'compact')));

console.log('\n=== G. 공백 있는 기존 검색 회귀 ===');
[
  '내게 능력 주시는',
  '여호와는 나의 목자시니',
  '하나님이 세상을 이처럼 사랑하사',
].forEach((q) => check(expectIncludes(q, q.includes('목자') ? '시편 23:1' : q.includes('하나님') ? '요한복음 3:16' : '빌립보서 4:13', 'spaced')));

console.log('\n=== H. 짧은 검색 (compact 비활성) ===');
['내게', '능력', '사랑'].forEach((q) => {
  const body = bodySearch(q);
  const compactHits = body.filter((r) => r.matchType === 'compact-phrase');
  const ok = compactHits.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} [short] "${q}" -> body:${body.length}, compact-phrase:${compactHits.length}`);
  check(ok);
});

console.log('\n=== 정규화 샘플 ===');
console.log(`"내게  능력 주시는," -> norm:"${GomnaBibleSearch.normalizeText('내게  능력 주시는,')}" compact:"${GomnaBibleSearch.compactSearchText('내게  능력 주시는,')}"`);

console.log('\n=== 기존 회귀 ===');
const queries = [
  '창세기 1:1',
  '로마서 8장 28절',
];
for (const q of queries) {
  const body = bodySearch(q);
  console.log(`${q} -> ${body[0]?.ref || 'none'} (score:${body[0]?.score}, type:${body[0]?.matchType})`);
  check(body.length === 1 && body[0].score === 1000);
}

console.log('\n=== I. 자연어 검색 1차 시험판 ===');

console.log('\n--- I-1. 하나님이 나랑 같이 있어 ---');
{
  const q = '하나님이 나랑 같이 있어';
  const body = bodySearch(q);
  const hasResults = body.length >= 1;
  const top10 = body.slice(0, 10);
  const topHasGodAndTogether = top10.some((r) => verseHasGodTerm(r.text) && verseHasTogetherTerm(r.text));
  const isaiahRank = verseRefExists('이사야 41:10') ? rankOfRef(body, '이사야 41:10') : 0;
  const isaiahOk = !verseRefExists('이사야 41:10') || (isaiahRank > 0 && isaiahRank <= 10);
  console.log(`body:${body.length}, top10 god+together:${topHasGodAndTogether}, 이사야41:10 rank:${isaiahRank || 'n/a'}`);
  console.log(`first5: ${body.slice(0, 5).map((r) => r.ref).join(', ') || 'none'}`);
  check(hasResults && topHasGodAndTogether && isaiahOk);
}

console.log('\n--- I-2. 너무 무서워 ---');
{
  const q = '너무 무서워';
  const body = bodySearch(q);
  const hasResults = body.length >= 1;
  const top5 = body.slice(0, 5);
  const topHasFear = top5.some((r) => verseHasFearTerm(r.text));
  console.log(`body:${body.length}, top5 fear-term:${topHasFear}`);
  console.log(`first5: ${body.slice(0, 5).map((r) => `${r.ref}(${r.matchType})`).join(', ') || 'none'}`);
  check(hasResults && topHasFear);
}

console.log('\n--- I-3. 걱정하지 말라는 말씀 ---');
{
  const q = '걱정하지 말라는 말씀';
  const body = bodySearch(q);
  const hasResults = body.length >= 1;
  const top10 = body.slice(0, 10);
  const topHasWorry = top10.some((r) => verseHasWorryTerm(r.text));
  const philRank = verseRefExists('빌립보서 4:6') ? rankOfRef(body, '빌립보서 4:6') : 0;
  const matt31Rank = verseRefExists('마태복음 6:31') ? rankOfRef(body, '마태복음 6:31') : 0;
  const matt34Rank = verseRefExists('마태복음 6:34') ? rankOfRef(body, '마태복음 6:34') : 0;
  const philOk = !verseRefExists('빌립보서 4:6') || (philRank > 0 && philRank <= 10);
  console.log(`body:${body.length}, top10 worry-term:${topHasWorry}`);
  console.log(`빌4:6 rank:${philRank || 'n/a'}, 마6:31 rank:${matt31Rank || 'n/a'}, 마6:34 rank:${matt34Rank || 'n/a'}`);
  console.log(`first5: ${body.slice(0, 5).map((r) => r.ref).join(', ') || 'none'}`);
  check(hasResults && topHasWorry && philOk);
}

console.log('\n=== J. 추가 회귀 (자연어 도입 후) ===');
check(expectIncludes('내가너와함께', '예레미야 1:8', 'compact-legacy-first'));
check(expectIncludes('두려워하지 말라', '마태복음 10:31', 'phrase-legacy-first'));
check(bodySearch('기도')[0]?.ref === '골로새서 4:2');

console.log('\n=== K. 자연어 걱정·불안 순위 v2 ===');

function countTargetsInTop(body, refs, topN) {
  let found = 0;
  refs.forEach((ref) => {
    if (!verseRefExists(ref)) return;
    const rank = rankOfRef(body, ref);
    if (rank > 0 && rank <= topN) found += 1;
  });
  return found;
}

const NARRATIVE_EVENT_REFS = [
  '마가복음 14:19',
  '창세기 26:35',
  '마태복음 26:22',
  '창세기 6:6',
];

console.log('\n--- K-A. 마음이 너무 불안해 ---');
{
  const q = '마음이 너무 불안해';
  const body = bodySearch(q);
  const targets = [
    '빌립보서 4:6',
    '빌립보서 4:7',
    '요한복음 14:1',
    '요한복음 14:27',
    '베드로전서 5:7',
    '이사야 41:10',
  ];
  const inTop10 = countTargetsInTop(body, targets, 10);
  const ok = body.length >= 1 && inTop10 >= 2;
  console.log(`body:${body.length}, comfort targets in top10:${inTop10}/6 (need>=2)`);
  console.log(`first5: ${body.slice(0, 5).map((r) => r.ref).join(', ') || 'none'}`);
  check(ok);
}

console.log('\n--- K-B. 돈 때문에 걱정돼 ---');
{
  const q = '돈 때문에 걱정돼';
  const body = bodySearch(q);
  const targets = [
    '마태복음 6:31',
    '마태복음 6:32',
    '마태복음 6:33',
    '마태복음 6:34',
    '빌립보서 4:19',
  ];
  const inTop10 = countTargetsInTop(body, targets, 10);
  const ok = body.length >= 1 && inTop10 >= 2;
  console.log(`body:${body.length}, provision targets in top10:${inTop10}/5 (need>=2)`);
  console.log(`first5: ${body.slice(0, 5).map((r) => r.ref).join(', ') || 'none'}`);
  check(ok);
}

console.log('\n--- K-C. 사건 묘사 독점 방지 ---');
['마음이 너무 불안해', '돈 때문에 걱정돼'].forEach((q) => {
  const body = bodySearch(q);
  const top5 = body.slice(0, 5);
  const eventCount = top5.filter((r) => NARRATIVE_EVENT_REFS.includes(r.ref)).length;
  const ok = eventCount <= 1;
  console.log(`"${q}" -> event-in-top5:${eventCount} (max 1)`);
  check(ok);
});

console.log('\n--- K-D. 기존 검색 회귀 (순위 유지) ---');
check(expectIncludes('로마서 8장 28절', '로마서 8:28', 'rom828'));
check(expectIncludes('내가너와함께', '예레미야 1:8', 'together-rank'));
check(expectIncludes('두려워하지 말라', '마태복음 10:31', 'fear-phrase'));
{
  const q = '주기도문';
  const faith = GomnaBibleSearch.searchFaithResources(q);
  const body = bodySearch(q);
  check(faith.some((f) => f.id === 'lords-prayer') && body[0]?.ref === '마태복음 6:9');
}
check(bodySearch('기도')[0]?.ref === '골로새서 4:2');
{
  const q = '걱정하지 말라는 말씀';
  const body = bodySearch(q);
  const topHasWorry = body.slice(0, 10).some((r) => verseHasWorryTerm(r.text));
  const philOk = !verseRefExists('빌립보서 4:6') || rankOfRef(body, '빌립보서 4:6') <= 10;
  check(body.length >= 1 && topHasWorry && philOk);
}
{
  const q = '하나님이 나랑 같이 있어';
  const body = bodySearch(q);
  const top10 = body.slice(0, 10);
  check(
    body.length >= 1
      && top10.some((r) => verseHasGodTerm(r.text) && verseHasTogetherTerm(r.text))
      && (!verseRefExists('이사야 41:10') || rankOfRef(body, '이사야 41:10') <= 10),
  );
}
{
  const q = '너무 무서워';
  const body = bodySearch(q);
  check(body.length >= 1 && body.slice(0, 5).some((r) => verseHasFearTerm(r.text)));
}

console.log('\n=== M. 외로움·반문형 오탐 v3 ===');

console.log('\n--- M-A. 욥기 30:25 오탐 방지 ---');
{
  const q = '마음이 너무 불안해';
  const body = bodySearch(q);
  const jobRank = verseRefExists('욥기 30:25') ? rankOfRef(body, '욥기 30:25') : 0;
  const jobTop5Ok = !verseRefExists('욥기 30:25') || jobRank === 0 || jobRank > 5;
  const comfortTargets = [
    '요한복음 14:1',
    '요한복음 14:27',
    '빌립보서 4:6',
    '빌립보서 4:7',
    '베드로전서 5:7',
  ];
  const comfortInTop10 = countTargetsInTop(body, comfortTargets, 10);
  const refBody = bodySearch('욥기 30장 25절');
  const refOk = refBody.length === 1 && refBody[0]?.ref === '욥기 30:25' && refBody[0]?.matchType === 'ref';
  console.log(`job rank:${jobRank || 'none'}, comfort in top10:${comfortInTop10}, ref search ok:${refOk}`);
  check(body.length >= 1 && jobTop5Ok && comfortInTop10 >= 2 && refOk);
}

console.log('\n--- M-B. 혼자인 것 같아 ---');
{
  const q = '혼자인 것 같아';
  const body = bodySearch(q);
  const targets = [
    '이사야 41:10',
    '여호수아 1:9',
    '신명기 31:6',
    '신명기 31:8',
    '마태복음 28:20',
    '요한복음 14:18',
    '히브리서 13:5',
  ];
  const inTop10 = countTargetsInTop(body, targets, 10);
  const ok = body.length >= 1 && bodyHasNaturalMatch(body) && inTop10 >= 2;
  console.log(`body:${body.length}, promise targets in top10:${inTop10}, first3:${body.slice(0, 3).map((r) => r.ref).join(', ')}`);
  check(ok);
}

console.log('\n--- M-C. 너무 외로워 ---');
{
  const q = '너무 외로워';
  const body = bodySearch(q);
  const promiseCount = countCompanionshipInTop(body, 10);
  console.log(`body:${body.length}, companionship promise in top10:${promiseCount}`);
  check(body.length >= 1 && promiseCount >= 2);
}

console.log('\n--- M-D. 내 곁에 아무도 없어 ---');
{
  const q = '내 곁에 아무도 없어';
  const body = bodySearch(q);
  const top10 = body.slice(0, 10);
  const hasGodNear = top10.some(
    (r) => verseHasCompanionshipPromiseText(r.text)
      && (verseHasGodTerm(r.text) || /주께|여호와|주님/.test(GomnaBibleSearch.normalizeText(r.text))),
  );
  const narrativeTop5 = body.slice(0, 5).filter((r) => verseIsLonelinessNarrativeOnly(r.text)).length;
  console.log(`god-near promise in top10:${hasGodNear}, narrative-only top5:${narrativeTop5}`);
  check(body.length >= 1 && hasGodNear && narrativeTop5 < 5);
}

console.log('\n--- M-E. 혼자 남겨진 것 같아 ---');
{
  const q = '혼자 남겨진 것 같아';
  const body = bodySearch(q);
  const promiseTop5 = countCompanionshipInTop(body, 5);
  console.log(`body:${body.length}, promise in top5:${promiseTop5}`);
  check(body.length >= 1 && promiseTop5 >= 1);
}

console.log('\n--- M-F. 하나님이 나를 버린 것 같아 ---');
{
  const q = '하나님이 나를 버린 것 같아';
  const concepts = GomnaBibleSearch.detectNaturalConcepts(q);
  const intents = GomnaBibleSearch.detectNaturalIntents(q);
  const body = bodySearch(q);
  const targets = [
    '히브리서 13:5',
    '요한복음 14:18',
    '마태복음 28:20',
    '신명기 31:6',
    '이사야 41:10',
  ];
  const inTop10 = countTargetsInTop(body, targets, 10);
  const topHasBareAbandon = body.slice(0, 10).some((r) => {
    const n = GomnaBibleSearch.normalizeText(r.text);
    return /버렸|버림|버려/.test(n) && !/버리지\s*아니|떠나지\s*아니/.test(n) && !verseHasCompanionshipPromiseText(r.text);
  });
  console.log(`concepts:${concepts.join('+')}, intents:${intents.join('+')}, targets top10:${inTop10}, bare abandon in top10:${topHasBareAbandon}`);
  check(
    concepts.includes('god')
      && concepts.includes('loneliness')
      && intents.includes('companionship')
      && body.length >= 1
      && inTop10 >= 2
      && !topHasBareAbandon,
  );
}

console.log('\n--- M-G. 외로움 사건 묘사 독점 방지 ---');
[
  '혼자인 것 같아',
  '너무 외로워',
  '내 곁에 아무도 없어',
  '혼자 남겨진 것 같아',
  '하나님이 나를 버린 것 같아',
].forEach((q) => {
  const body = bodySearch(q);
  const narrativeTop5 = body.slice(0, 5).filter((r) => verseIsLonelinessNarrativeOnly(r.text)).length;
  const ok = narrativeTop5 < 2;
  console.log(`"${q}" -> narrative-only top5:${narrativeTop5} (max 1)`);
  check(ok);
});

console.log('\n=== N. 외로움 absence-companionship v4 ===');

function verseHasDirectDivineCompanionshipText(text) {
  const n = GomnaBibleSearch.normalizeText(text);
  if (/너를\s*버리지\s*아니|떠나지\s*아니하시|버리지\s*아니하시|떠나지\s*아니하리|버리지\s*아니하리/.test(n)) {
    return true;
  }
  if (/고아와\s*같이\s*버려두지|결코\s*(버리|떠나)지\s*아니/.test(n)) return true;
  if (/여호와|하나님|주께|주님|여호와께/.test(n) && n.includes('함께') && !/함께\s*한\s*다른|함께한\s*자\s*없이|없었도다/.test(n)) {
    return true;
  }
  if (/곁에\s*서서|가까이\s*계시|붙들|도와주리라/.test(n) && /여호와|하나님|주/.test(n)) return true;
  return false;
}

function verseIsHumanCompanionshipNarrativeText(text) {
  const n = GomnaBibleSearch.normalizeText(text);
  if (verseHasDirectDivineCompanionshipText(text)) return false;
  if (/짐을?\s*담당|백성의?\s*짐|혼자\s*지지\s*아니|그들이?\s*너와\s*함께|함께\s*먹었|함께\s*모였|혼자\s*사는\s*것/.test(n)) {
    return true;
  }
  return verseIsLonelinessNarrativeOnly(text);
}

console.log('\n--- N-A. 내 곁에 아무도 없어 ---');
{
  const q = '내 곁에 아무도 없어';
  const concepts = GomnaBibleSearch.detectNaturalConcepts(q);
  const intents = GomnaBibleSearch.detectNaturalIntents(q);
  const body = bodySearch(q);
  const top5 = body.slice(0, 5);
  const divineTop5 = top5.filter((r) => verseHasDirectDivineCompanionshipText(r.text)).length;
  const humanTop5 = top5.filter((r) => verseIsHumanCompanionshipNarrativeText(r.text)).length;
  const numRank = verseRefExists('민수기 11:17') ? rankOfRef(body, '민수기 11:17') : 0;
  const numTop5Ok = !verseRefExists('민수기 11:17') || numRank === 0 || numRank > 5;
  const hardcodeOk = !readFileSync(join(root, 'js/gomna-bible-search.js'), 'utf8').includes('민수기 11:17');
  console.log(`concepts:${concepts.join('+')}, intents:${intents.join('+')}, divine top5:${divineTop5}, human top5:${humanTop5}, num rank:${numRank || 'none'}`);
  check(
    body.length >= 1
      && concepts.includes('loneliness')
      && (intents.includes('companionship') || intents.includes('absence-companionship'))
      && divineTop5 >= 3
      && humanTop5 <= 1
      && numTop5Ok
      && hardcodeOk,
  );
}

console.log('\n--- N-B. 직접 동행 약속 비율 ---');
{
  const body = bodySearch('내 곁에 아무도 없어').slice(0, 10);
  const directCount = body.filter((r) => verseHasDirectDivineCompanionshipText(r.text)).length;
  console.log(`direct divine in top10:${directCount}/10 (need>=5)`);
  check(directCount >= 5);
}

console.log('\n--- N-C. 다른 외로움 검색 회귀 ---');
['혼자인 것 같아', '너무 외로워', '혼자 남겨진 것 같아', '하나님이 나를 버린 것 같아'].forEach((q) => {
  const body = bodySearch(q);
  const ok = body.length >= 1 && countCompanionshipInTop(body, 10) >= 2;
  console.log(`"${q}" -> body:${body.length}, promise top10:${countCompanionshipInTop(body, 10)}`);
  check(ok);
});

console.log('\n--- N-D. 장절 검색 보호 ---');
{
  const n1 = bodySearch('민수기 11장 17절');
  const n2 = bodySearch('욥기 30장 25절');
  check(n1.length === 1 && n1[0]?.ref === '민수기 11:17' && n1[0]?.matchType === 'ref');
  check(n2.length === 1 && n2[0]?.ref === '욥기 30:25' && n2[0]?.matchType === 'ref');
}

console.log('\n=== L. 상위 10개 샘플 (외로움 v4) ===');
const RANK_SAMPLE_QUERIES = [
  '내 곁에 아무도 없어',
  '혼자인 것 같아',
  '너무 외로워',
  '혼자 남겨진 것 같아',
  '하나님이 나를 버린 것 같아',
  '마음이 너무 불안해',
  '돈 때문에 걱정돼',
];
RANK_SAMPLE_QUERIES.forEach((q) => {
  const concepts = GomnaBibleSearch.detectNaturalConcepts(q).join('+') || 'n/a';
  const intents = GomnaBibleSearch.detectNaturalIntents(q).join('+') || 'n/a';
  console.log(`\n[${q}] concepts:${concepts} intents:${intents}`);
  const body = bodySearch(q).slice(0, 10);
  body.forEach((r, idx) => {
    console.log(
      `${idx + 1}. ${r.ref} | score:${r.score} | ${r.matchType} | concept:${r.naturalConcepts || 'n/a'} | intent:${r.naturalIntents || intents} | divine+:${r.naturalDirectDivineBonus ?? 0} | abandon+:${r.naturalAbandonmentReassuranceBonus ?? 0} | human-:${r.naturalHumanNarrativePenalty ?? 0} | narr-:${r.naturalNarrativePenalty ?? 0}`,
    );
    console.log(`   ${r.text.replace(/\s+/g, ' ').slice(0, 72)}`);
  });
});

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
