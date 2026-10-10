'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const context = { window: {}, URLSearchParams };
vm.runInNewContext(read('js/gomna-bible-library-data.js'), context);
const init = "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();";
const librarySource = read('js/gomna-bible-library.js');
assert.ok(librarySource.includes(init), 'library init hook is present');
vm.runInNewContext(librarySource.replace(init, 'window.readerUrlForTest=readerUrl;'), context);
const items = context.window.GOMNA_BIBLE_LIBRARY_DATA;
let urls = 0, readLinks = 0, listenLinks = 0;
for (const item of items) {
  for (const listen of [false, true]) {
    const url = new URL(context.window.readerUrlForTest(item), 'https://example.test/');
    if (listen) url.searchParams.set('listen', '1');
    for (const [param, expected] of Object.entries({ libraryKind: item.kind, libraryId: item.id, libraryName: item.name,
      book: item.book, chapter: item.chapter, verseStart: item.start, verseEnd: item.end,
      startVerse: item.start, endVerse: item.end })) {
      assert.equal(url.searchParams.get(param), String(expected), item.id + ': ' + param);
    }
    assert.equal(url.searchParams.get('listen'), listen ? '1' : null);
    const nodes = {};
    function node() { return { style: {}, children: [], setAttribute() {}, appendChild(n) { this.children.push(n); },
      insertAdjacentElement(where, n) { assert.equal(where, 'afterend'); nodes[n.id] = n; this.after = n; } }; }
    nodes.verseView = node(); nodes.anchor = node();
    const returnContext = {
      window: { addEventListener() {} }, location: { search: url.search }, URLSearchParams,
      currentBook: { name: item.book }, currentChapter: item.chapter,
      document: { getElementById: id => nodes[id], createElement: node,
        querySelector(selector) { assert.equal(selector, '#verseList .verse-item[data-verse="' + item.end + '"]'); return nodes.anchor; } }
    };
    vm.runInNewContext(read('js/gomna-library-return.js'), returnContext);
    const box = nodes.gomnaLibraryReturn, link = box.children[0];
    assert.equal(nodes.anchor.after, box);
    assert.equal(box.hidden, listen);
    assert.equal(link.className, 'daily-word-return-btn');
    const target = item.name + (item.kind === 'stories' ? ' 이야기' : '');
    const last = target.charCodeAt(target.length - 1) - 0xAC00;
    const josa = last % 28 !== 0 && last % 28 !== 8 ? '으로' : '로';
    assert.equal(link.textContent, '← ' + target + josa + ' 돌아가기');
    assert.equal(new URL(link.href, 'https://example.test/').hash, '#bible-library/' + item.kind + '/' + item.id);
    if (listen) listenLinks++; else readLinks++;
    urls++;
  }
}
assert.equal(items.length, 39, 'preview contains all 27 people and 12 stories');
const esther = items.find(i => i.id === 'esther');
assert.ok(esther);
assert.equal(esther.chapter, 4); assert.equal(esther.start, 13); assert.equal(esther.end, 17);
console.log(`PASS ${urls} actual library links: ${readLinks} immediate read returns and ${listenLinks} hidden-until-completion listen returns`);
const integration = spawnSync(process.execPath, [path.join(__dirname, 'gomna-library-audio.integration.cjs')], { encoding: 'utf8', cwd: root });
process.stdout.write(integration.stdout || '');
process.stderr.write(integration.stderr || '');
assert.equal(integration.status, 0, 'full-engine library integration scenarios must pass');
