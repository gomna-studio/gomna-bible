const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'old_testament.js'), 'utf8'), context);
let checked = 0;
for (const slug of ['comfort', 'anxiety', 'dawn-prayer']) {
  const html = fs.readFileSync(path.join(root, 'topics', slug, 'index.html'), 'utf8');
  assert.match(html, /analytics-control\.js/);
  assert.match(html, /gomna-entry-analytics\.js/);
  assert.match(html, /gomna-ux-telemetry\.js/);
  assert.match(html, /data-gomna-exposure="topic_content"/);
  assert.match(html, /data-topic-cookie="reject"/);
  const cards = [...html.matchAll(/<article class="verse-card"[^>]*>([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length, 5);
  for (const [, card] of cards) {
    const links = [...card.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)];
    assert.equal(links.length, 2);
    const urls = links.map(match => new URL(match[1].replace(/&amp;/g, '&'), 'https://gomnastudio.com'));
    for (const url of urls) {
      assert.equal(url.pathname, '/reader.html');
      assert.equal(url.searchParams.get('source'), 'topic-' + slug);
    }
    assert.equal(urls[0].searchParams.has('listen'), false);
    assert.equal(urls[1].searchParams.get('listen'), '1');
    const q = urls[0].searchParams;
    const book = context.oldTestamentData.books.find(b => b.name === q.get('book'));
    assert.ok(book, q.get('book'));
    const chapter = book.chapters.find(c => c.chapter === Number(q.get('chapter')));
    const verse = chapter.verses.find(v => v.verse === Number(q.get('verse')));
    const quote = /<blockquote class="topic-scripture"><p>(.*?)<\/p>/.exec(card)[1];
    assert.equal(quote, verse.text.trim(), `${slug}: ${verse.name}`);
    assert.equal(urls[1].searchParams.get('startVerse'), q.get('verse'));
    assert.equal(urls[1].searchParams.get('endVerse'), q.get('verse'));
    assert.match(card, /data-gomna-action="topic_read"/);
    assert.match(card, /data-gomna-action="topic_listen"/);
    assert.match(card, /묵상 안내/);
    checked++;
  }
  for (const match of html.matchAll(/href="(\/topics\/[^"#?]*)"/g)) {
    assert.ok(fs.existsSync(path.join(root, match[1], 'index.html')), match[1]);
  }
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
}
console.log(`PASS: ${checked} KRV quotations, 30 read/listen routes, consent hooks, topic links and structured data`);
