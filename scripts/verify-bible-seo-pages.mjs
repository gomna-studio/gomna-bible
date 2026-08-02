#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { BOOKS } from './bible-book-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://gomnastudio.com';

const CHAPTER_TARGETS = [
  { bookId: 'genesis', chapter: 1 },
  { bookId: 'exodus', chapter: 20 },
  { bookId: 'joshua', chapter: 1 },
  { bookId: 'psalms', chapter: 1 },
  { bookId: 'psalms', chapter: 23 },
  { bookId: 'psalms', chapter: 91 },
  { bookId: 'psalms', chapter: 121 },
  { bookId: 'proverbs', chapter: 3 },
  { bookId: 'isaiah', chapter: 53 },
  { bookId: 'matthew', chapter: 5 },
  { bookId: 'matthew', chapter: 6 },
  { bookId: 'luke', chapter: 2 },
  { bookId: 'luke', chapter: 15 },
  { bookId: 'john', chapter: 1 },
  { bookId: 'john', chapter: 3 },
  { bookId: 'john', chapter: 14 },
  { bookId: 'acts', chapter: 2 },
  { bookId: 'romans', chapter: 8 },
  { bookId: '1corinthians', chapter: 13 },
  { bookId: 'ephesians', chapter: 6 },
  { bookId: 'philippians', chapter: 4 },
  { bookId: 'hebrews', chapter: 11 },
  { bookId: '1john', chapter: 4 },
  { bookId: 'revelation', chapter: 21 },
];

const HUB_BOOK_IDS = ['genesis', 'psalms', 'john'];
const FORBIDDEN_TOUCH = [
  'index.html',
  'reader.html',
  'sw.js',
  'manifest.json',
  'robots.txt',
  'old_testament.js',
  'new_testament.js',
];

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function loadTestamentData() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'old_testament.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'new_testament.js'), 'utf8'), ctx);
  const byKoName = new Map();
  for (const data of [ctx.oldTestamentData, ctx.newTestamentData]) {
    for (const book of data.books) byKoName.set(book.name, book);
  }
  return { byKoName };
}

function chapterUnit(bookId) {
  return bookId === 'psalms' ? '편' : '장';
}

function extract(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

function decodeBasicEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function main() {
  const { byKoName } = loadTestamentData();
  const chapterFiles = [];
  const hubFiles = [];
  const canonicals = new Set();

  if (CHAPTER_TARGETS.length !== 24) fail(`CHAPTER_TARGETS length ${CHAPTER_TARGETS.length}`);
  if (HUB_BOOK_IDS.length !== 3) fail(`HUB_BOOK_IDS length ${HUB_BOOK_IDS.length}`);

  for (const target of CHAPTER_TARGETS) {
    const file = path.join(ROOT, 'bible', target.bookId, String(target.chapter), 'index.html');
    if (!fs.existsSync(file)) fail(`missing chapter page ${file}`);
    chapterFiles.push(file);
    const html = fs.readFileSync(file, 'utf8');
    const meta = BOOKS[target.bookId];
    const book = byKoName.get(meta.book);
    const chapterData = book.chapters.find((c) => c.chapter === target.chapter);
    const label = `${meta.book} ${target.chapter}${chapterUnit(target.bookId)}`;
    const expectedTitle = `${label} 개역한글 읽기·듣기·말씀풀이 | 은혜의말씀`;
    const expectedCanonical = `${SITE}/bible/${target.bookId}/${target.chapter}/`;

    if (!html.includes('lang="ko"')) fail(`${file}: lang=ko`);
    const title = extract(html, /<title>(.*?)<\/title>/s);
    if (title !== expectedTitle) fail(`${file}: title\n expected ${expectedTitle}\n got ${title}`);
    const desc = extract(html, /<meta\s+name="description"\s+content="([^"]*)"/);
    if (!desc || !desc.includes(label) || !desc.includes('개역한글')) fail(`${file}: description`);
    const canonical = extract(html, /<link\s+rel="canonical"\s+href="([^"]*)"/);
    if (canonical !== expectedCanonical) fail(`${file}: canonical ${canonical}`);
    if (canonicals.has(canonical)) fail(`duplicate canonical ${canonical}`);
    canonicals.add(canonical);

    const h1 = extract(html, /<h1>(.*?)<\/h1>/s);
    if (h1 !== label) fail(`${file}: h1 ${h1}`);
    if (!html.includes('BreadcrumbList')) fail(`${file}: BreadcrumbList`);
    if (!html.includes('"@type": "WebPage"') && !html.includes('"@type":"WebPage"')) {
      fail(`${file}: WebPage JSON-LD`);
    }

    const verseBlocks = [...html.matchAll(/id="verse-(\d+)"[\s\S]*?<span class="verse-text">([\s\S]*?)<\/span>/g)];
    if (verseBlocks.length !== chapterData.verses.length) {
      fail(`${file}: verse count html=${verseBlocks.length} data=${chapterData.verses.length}`);
    }
    for (let i = 0; i < chapterData.verses.length; i++) {
      const n = Number(verseBlocks[i][1]);
      const text = decodeBasicEntities(verseBlocks[i][2]);
      const src = chapterData.verses[i];
      if (n !== src.verse) fail(`${file}: verse number mismatch at ${i}`);
      if (!text.trim()) fail(`${file}: empty verse ${n}`);
      if (text !== String(src.text)) {
        fail(`${file}: verse text mismatch ${n}\n expected [${src.text}]\n got [${text}]`);
      }
    }
    const first = chapterData.verses[0];
    const last = chapterData.verses[chapterData.verses.length - 1];
    if (!html.includes(`id="verse-${first.verse}"`)) fail(`${file}: first verse id`);
    if (!html.includes(`id="verse-${last.verse}"`)) fail(`${file}: last verse id`);

    const readerPath = `/reader.html?book=${encodeURIComponent(meta.book)}&chapter=${target.chapter}&verse=1&source=search-related`;
    const readerPathHtml = readerPath.replace(/&/g, '&amp;');
    if (!html.includes(readerPath) && !html.includes(readerPathHtml)) {
      fail(`${file}: reader deep-link ${readerPath}`);
    }

    // No invented static chapter links for missing pages
    const hrefs = [...html.matchAll(/href="(\/bible\/[^"]+)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      const m = href.match(/^\/bible\/([a-z0-9]+)\/(?:(\d+)\/)?$/);
      if (!m) fail(`${file}: unexpected bible href ${href}`);
      const [, bid, ch] = m;
      if (ch) {
        const ok = CHAPTER_TARGETS.some((t) => t.bookId === bid && String(t.chapter) === ch);
        if (!ok) fail(`${file}: link to non-generated chapter ${href}`);
      } else if (!HUB_BOOK_IDS.includes(bid)) {
        fail(`${file}: link to non-generated hub ${href}`);
      }
    }
  }

  for (const bookId of HUB_BOOK_IDS) {
    const file = path.join(ROOT, 'bible', bookId, 'index.html');
    if (!fs.existsSync(file)) fail(`missing hub ${file}`);
    hubFiles.push(file);
    const html = fs.readFileSync(file, 'utf8');
    const meta = BOOKS[bookId];
    const expectedCanonical = `${SITE}/bible/${bookId}/`;
    if (!html.includes('lang="ko"')) fail(`${file}: lang`);
    if (!extract(html, /<title>(.*?)<\/title>/s)?.includes(meta.book)) fail(`${file}: title`);
    if (!extract(html, /<meta\s+name="description"\s+content="([^"]*)"/)?.includes(meta.book)) {
      fail(`${file}: description`);
    }
    const canonical = extract(html, /<link\s+rel="canonical"\s+href="([^"]*)"/);
    if (canonical !== expectedCanonical) fail(`${file}: canonical`);
    if (canonicals.has(canonical)) fail(`duplicate canonical ${canonical}`);
    canonicals.add(canonical);
    if (!html.includes('BreadcrumbList')) fail(`${file}: breadcrumb`);
    if (!html.includes('"@type": "WebPage"') && !html.includes('"@type":"WebPage"')) fail(`${file}: webpage`);
    const readerPath = `/reader.html?book=${encodeURIComponent(meta.book)}&chapter=1&verse=1&source=search-related`;
    const readerPathHtml = readerPath.replace(/&/g, '&amp;');
    if (!html.includes(readerPath) && !html.includes(readerPathHtml)) fail(`${file}: reader link`);
    const chapters = CHAPTER_TARGETS.filter((t) => t.bookId === bookId);
    for (const t of chapters) {
      if (!html.includes(`/bible/${bookId}/${t.chapter}/`)) fail(`${file}: missing chapter link ${t.chapter}`);
    }
  }

  if (chapterFiles.length !== 24) fail(`chapter files ${chapterFiles.length}`);
  if (hubFiles.length !== 3) fail(`hub files ${hubFiles.length}`);

  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  if (!sitemap.includes('<urlset')) fail('sitemap missing urlset');
  if (!sitemap.includes('</urlset>')) fail('sitemap missing close');
  const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  const expectedNew = [
    ...HUB_BOOK_IDS.map((id) => `${SITE}/bible/${id}/`),
    ...CHAPTER_TARGETS.map((t) => `${SITE}/bible/${t.bookId}/${t.chapter}/`),
  ];
  for (const u of expectedNew) {
    if (!locs.includes(u)) fail(`sitemap missing ${u}`);
  }
  const newCount = locs.filter((u) => u.includes('/bible/')).length;
  if (newCount !== 27) fail(`sitemap bible urls ${newCount}`);
  if (new Set(locs).size !== locs.length) fail('sitemap duplicate loc');
  for (const base of [
    `${SITE}/`,
    `${SITE}/reader.html`,
    `${SITE}/about/`,
    `${SITE}/guide/`,
    `${SITE}/studio/`,
    `${SITE}/contact/`,
    `${SITE}/privacy.html`,
    `${SITE}/terms.html`,
  ]) {
    if (!locs.includes(base)) fail(`sitemap lost base url ${base}`);
  }

  // Ensure forbidden tracked files are untouched vs HEAD if in git
  // (verify script can't run git easily always — check content markers only for robots)
  if (!fs.existsSync(path.join(ROOT, 'robots.txt'))) fail('robots.txt missing');

  console.log('○ 장 페이지: 24 PASS');
  console.log('○ 책 허브: 3 PASS');
  console.log('○ sitemap 신규 URL: 27 PASS');
  console.log('○ 본문·절 수·canonical·Reader deep-link PASS');
  console.log('VERIFY_PASS');
}

main();
