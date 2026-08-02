#!/usr/bin/env node
/**
 * Build a fixed set of Korean SEO entry pages for representative Bible chapters.
 * Source of truth for verse text: old_testament.js / new_testament.js
 * Does NOT generate all chapters/verses. No --all option.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { BOOKS } from './bible-book-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://gomnastudio.com';
const LASTMOD = '2026-08-02';

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

const SITEMAP_BEGIN = '  <!-- BEGIN bible-seo-pages-20260802 -->';
const SITEMAP_END = '  <!-- END bible-seo-pages-20260802 -->';

function loadTestamentData() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'old_testament.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'new_testament.js'), 'utf8'), ctx);
  if (!ctx.oldTestamentData || !ctx.newTestamentData) {
    throw new Error('Failed to load testament globals');
  }
  const byKoName = new Map();
  for (const data of [ctx.oldTestamentData, ctx.newTestamentData]) {
    for (const book of data.books) {
      byKoName.set(book.name, book);
    }
  }
  return { byKoName };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chapterUnit(bookId) {
  return bookId === 'psalms' ? '편' : '장';
}

function chapterLabel(koName, bookId, chapter) {
  return `${koName} ${chapter}${chapterUnit(bookId)}`;
}

function cssHref(depth) {
  return '../'.repeat(depth) + 'css/bible-seo-pages.css';
}

function logoHref(depth) {
  return '../'.repeat(depth) + 'logo-home.png';
}

function readerHref(koName, chapter, verse = 1) {
  const params = new URLSearchParams({
    book: koName,
    chapter: String(chapter),
    verse: String(verse),
    source: 'search-related',
  });
  return `/reader.html?${params.toString()}`;
}

function pageKey(bookId, chapter) {
  return `${bookId}/${chapter}`;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function renderBreadcrumbNav(items) {
  const lis = items
    .map((item, i) => {
      const last = i === items.length - 1;
      if (last || !item.href) {
        return `<li aria-current="page">${escapeHtml(item.name)}</li>`;
      }
      return `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a></li>`;
    })
    .join('\n        ');
  return `<nav aria-label="빵 부스러기">
      <ol class="breadcrumb">
        ${lis}
      </ol>
    </nav>`;
}

function renderBreadcrumbJsonLd(items) {
  const list = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.href.startsWith('http') ? item.href : `${SITE}${item.href}`,
    })),
  };
  return JSON.stringify(list, null, 2);
}

function renderWebPageJsonLd({ name, description, url }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url,
    inLanguage: 'ko-KR',
    isPartOf: {
      '@type': 'WebSite',
      name: '은혜의말씀',
      url: `${SITE}/`,
    },
  };
  return JSON.stringify(data, null, 2);
}

function renderShell({
  depth,
  title,
  description,
  canonicalPath,
  h1,
  breadcrumbItems,
  bodyHtml,
}) {
  const canonical = `${SITE}${canonicalPath}`;
  const css = cssHref(depth);
  const logo = logoHref(depth);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="은혜의말씀">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="${escapeHtml(css)}">
<script type="application/ld+json">
${renderBreadcrumbJsonLd(breadcrumbItems)}
</script>
<script type="application/ld+json">
${renderWebPageJsonLd({ name: title, description, url: canonical })}
</script>
</head>
<body>
  <main class="page">
    <a class="site-brand" href="/">
      <img src="${escapeHtml(logo)}" alt="은혜의말씀" width="36" height="36">
      <span>은혜의말씀</span>
    </a>
    ${renderBreadcrumbNav(breadcrumbItems)}
    <h1>${escapeHtml(h1)}</h1>
    ${bodyHtml}
  </main>
</body>
</html>
`;
}

function renderChapterPage({ bookId, koName, chapter, verses, staticKeys, maxChapter }) {
  const label = chapterLabel(koName, bookId, chapter);
  const unit = chapterUnit(bookId);
  const title = `${label} 개역한글 읽기·듣기·말씀풀이 | 은혜의말씀`;
  const description = `${label} 개역한글 성경 본문을 절별로 읽고, 은혜의말씀 Reader에서 듣기와 9개 말씀풀이를 함께 살펴보세요.`;
  const canonicalPath = `/bible/${bookId}/${chapter}/`;
  const hubExists = HUB_BOOK_IDS.includes(bookId);
  const lead = `${label}의 개역한글 성경 본문입니다. 절별로 읽은 뒤 은혜의말씀 Reader에서 듣기와 9개 말씀풀이를 함께 살펴볼 수 있습니다.`;

  const verseHtml = verses
    .map((v) => {
      const n = v.verse;
      const text = v.text == null ? '' : String(v.text);
      if (!text.trim()) {
        throw new Error(`Empty verse ${koName} ${chapter}:${n}`);
      }
      return `  <p class="verse" id="verse-${n}">
    <span class="verse-number" aria-label="${n}절">${n}</span>
    <span class="verse-text">${escapeHtml(text)}</span>
  </p>`;
    })
    .join('\n');

  const prevChapter = chapter > 1 ? chapter - 1 : null;
  const nextChapter = chapter < maxChapter ? chapter + 1 : null;

  function chapterNavHref(targetChapter) {
    if (!targetChapter) return null;
    if (staticKeys.has(pageKey(bookId, targetChapter))) {
      return `/bible/${bookId}/${targetChapter}/`;
    }
    return readerHref(koName, targetChapter, 1);
  }

  const prevHref = chapterNavHref(prevChapter);
  const nextHref = chapterNavHref(nextChapter);

  const breadcrumbItems = [
    { name: '은혜의말씀', href: '/' },
    { name: '성경', href: '/' },
    { name: koName, href: hubExists ? `/bible/${bookId}/` : readerHref(koName, 1, 1) },
    { name: label, href: canonicalPath },
  ];

  const hubLink = hubExists
    ? `<a class="btn btn-secondary" href="/bible/${bookId}/">${escapeHtml(koName)} 대표 ${unit} 목록</a>`
    : '';

  const prevBtn = prevHref
    ? `<a class="btn btn-secondary" href="${escapeHtml(prevHref)}">이전 ${unit} (${prevChapter}${unit})</a>`
    : `<span class="btn btn-secondary" aria-disabled="true">이전 ${unit} 없음</span>`;
  const nextBtn = nextHref
    ? `<a class="btn btn-secondary" href="${escapeHtml(nextHref)}">다음 ${unit} (${nextChapter}${unit})</a>`
    : `<span class="btn btn-secondary" aria-disabled="true">다음 ${unit} 없음</span>`;

  const bodyHtml = `
    <p class="lead">${escapeHtml(lead)}</p>
    <div class="actions">
      <a class="btn btn-primary" href="${escapeHtml(readerHref(koName, chapter, 1))}">Reader에서 읽기·듣기·말씀풀이 열기</a>
      ${hubLink}
    </div>
    <div class="nav-links">
      ${prevBtn}
      ${nextBtn}
    </div>
    <section class="chapter-text" aria-labelledby="chapter-heading">
      <h2 id="chapter-heading">${escapeHtml(label)} 본문</h2>
${verseHtml}
    </section>
    <div class="footer-nav">
      <a href="/">홈페이지</a>
      ${hubExists ? `<a href="/bible/${bookId}/">${escapeHtml(koName)} 허브</a>` : ''}
      <a href="${escapeHtml(readerHref(koName, chapter, 1))}">Reader에서 열기</a>
    </div>
  `;

  return renderShell({
    depth: 3,
    title,
    description,
    canonicalPath,
    h1: label,
    breadcrumbItems,
    bodyHtml,
  });
}

function renderHubPage({ bookId, koName, chapters, maxChapter }) {
  const unit = chapterUnit(bookId);
  const title = `${koName} 개역한글 대표 ${unit} 읽기·듣기·말씀풀이 | 은혜의말씀`;
  const description = `${koName} 개역한글 대표 ${unit} 본문을 먼저 읽고, 은혜의말씀 Reader에서 해당 책의 듣기와 말씀풀이를 함께 살펴보세요.`;
  const canonicalPath = `/bible/${bookId}/`;
  const list = chapters
    .map((c) => {
      const label = chapterLabel(koName, bookId, c);
      return `<li><a href="/bible/${bookId}/${c}/">${escapeHtml(label)}</a></li>`;
    })
    .join('\n        ');

  const breadcrumbItems = [
    { name: '은혜의말씀', href: '/' },
    { name: '성경', href: '/' },
    { name: koName, href: canonicalPath },
  ];

  const bodyHtml = `
    <p class="lead">${escapeHtml(koName)}의 개역한글 대표 ${unit} 안내입니다. 아래 대표 ${unit}을 먼저 읽고, 책 전체는 Reader에서 열 수 있습니다.</p>
    <div class="actions">
      <a class="btn btn-primary" href="${escapeHtml(readerHref(koName, 1, 1))}">${escapeHtml(koName)} 전체를 Reader에서 열기</a>
    </div>
    <h2 style="font-size:1.05rem;margin:0 0 .75rem;">이번에 열린 대표 ${unit}</h2>
    <ul class="hub-list">
        ${list}
    </ul>
    <p class="lead" style="margin-top:0;">전체 ${maxChapter}${unit}은 Reader에서 이어서 읽을 수 있습니다.</p>
    <div class="footer-nav">
      <a href="/">홈페이지</a>
      <a href="${escapeHtml(readerHref(koName, 1, 1))}">Reader에서 ${escapeHtml(koName)} 열기</a>
    </div>
  `;

  return renderShell({
    depth: 2,
    title,
    description,
    canonicalPath,
    h1: `${koName} 대표 ${unit}`,
    breadcrumbItems,
    bodyHtml,
  });
}

function updateSitemap(urls) {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const blockRe = new RegExp(
    `${SITEMAP_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${SITEMAP_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
    'g'
  );
  xml = xml.replace(blockRe, '');

  const entries = urls
    .map(
      (loc) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <priority>0.8</priority>
  </url>`
    )
    .join('\n');

  const block = `${SITEMAP_BEGIN}\n${entries}\n${SITEMAP_END}\n`;
  if (!xml.includes('</urlset>')) {
    throw new Error('sitemap.xml missing </urlset>');
  }
  xml = xml.replace('</urlset>', `${block}</urlset>`);
  fs.writeFileSync(sitemapPath, xml, 'utf8');
}

function main() {
  if (process.argv.includes('--all')) {
    throw new Error('--all is not allowed for this builder');
  }

  const { byKoName } = loadTestamentData();
  const staticKeys = new Set(CHAPTER_TARGETS.map((t) => pageKey(t.bookId, t.chapter)));
  const createdChapters = [];
  const createdHubs = [];
  const sitemapUrls = [];

  for (const target of CHAPTER_TARGETS) {
    const meta = BOOKS[target.bookId];
    if (!meta) throw new Error(`Unknown bookId: ${target.bookId}`);
    const book = byKoName.get(meta.book);
    if (!book) throw new Error(`Book data missing: ${meta.book}`);
    const chapterData = book.chapters.find((c) => c.chapter === target.chapter);
    if (!chapterData) throw new Error(`Chapter missing: ${meta.book} ${target.chapter}`);
    if (!Array.isArray(chapterData.verses) || chapterData.verses.length === 0) {
      throw new Error(`No verses: ${meta.book} ${target.chapter}`);
    }

    const html = renderChapterPage({
      bookId: target.bookId,
      koName: meta.book,
      chapter: target.chapter,
      verses: chapterData.verses,
      staticKeys,
      maxChapter: book.chapters.length,
    });
    const outPath = path.join(ROOT, 'bible', target.bookId, String(target.chapter), 'index.html');
    writeFile(outPath, html);
    createdChapters.push(`/bible/${target.bookId}/${target.chapter}/`);
    sitemapUrls.push(`${SITE}/bible/${target.bookId}/${target.chapter}/`);
  }

  for (const bookId of HUB_BOOK_IDS) {
    const meta = BOOKS[bookId];
    const book = byKoName.get(meta.book);
    const chapters = CHAPTER_TARGETS.filter((t) => t.bookId === bookId)
      .map((t) => t.chapter)
      .sort((a, b) => a - b);
    const html = renderHubPage({
      bookId,
      koName: meta.book,
      chapters,
      maxChapter: book.chapters.length,
    });
    const outPath = path.join(ROOT, 'bible', bookId, 'index.html');
    writeFile(outPath, html);
    createdHubs.push(`/bible/${bookId}/`);
    sitemapUrls.push(`${SITE}/bible/${bookId}/`);
  }

  // Stable sitemap order: hubs then chapters (as generated)
  const orderedSitemap = [
    ...HUB_BOOK_IDS.map((id) => `${SITE}/bible/${id}/`),
    ...CHAPTER_TARGETS.map((t) => `${SITE}/bible/${t.bookId}/${t.chapter}/`),
  ];
  updateSitemap(orderedSitemap);

  console.log(`○ 생성한 장 페이지: ${createdChapters.length}`);
  console.log(`○ 생성한 책 허브: ${createdHubs.length}`);
  console.log(`○ sitemap 신규 URL: ${orderedSitemap.length}`);
  console.log('○ 본문 원본 수정: 없음');
  for (const u of [...createdHubs, ...createdChapters]) console.log('  -', u);
}

main();
