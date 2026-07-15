import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
