#!/usr/bin/env node
/**
 * Build a small, curated set of Korean situation-based Bible entry pages.
 * Verse text always comes from old_testament.js. Topic copy and references are
 * intentionally explicit so this cannot turn into unreviewed mass SEO output.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { BOOKS } from './bible-book-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://gomnastudio.com';
const LASTMOD = '2026-08-27';
const SITEMAP_BEGIN = '  <!-- BEGIN topic-pages-20260827 -->';
const SITEMAP_END = '  <!-- END topic-pages-20260827 -->';

const TOPICS = [
  {
    slug: 'anxiety',
    shortTitle: '불안과 두려움',
    title: '불안하고 두려울 때 듣는 성경말씀',
    description: '불안과 두려움이 밀려올 때 마음을 붙들어 주는 개역한글 성경말씀을 읽고 들으며 묵상해 보세요.',
    intro: '불안은 아직 일어나지 않은 일까지 마음속에 크게 보이게 합니다. 두려움이 밀려올 때 하나님의 동행과 보호를 말하는 말씀부터 천천히 읽고 들어 보세요.',
    refs: [['psalms', 23, 4], ['psalms', 56, 3], ['psalms', 91, 2], ['isaiah', 41, 10], ['joshua', 1, 9]],
    related: ['sleep', 'comfort', 'wisdom'],
  },
  {
    slug: 'sleep',
    shortTitle: '잠들기 전 평안',
    title: '잠이 오지 않을 때 듣는 평안의 말씀',
    description: '잠이 오지 않는 밤, 걱정을 내려놓고 평안히 쉬도록 돕는 개역한글 성경말씀을 읽고 들어 보세요.',
    intro: '생각이 멈추지 않는 밤에는 문제를 억지로 해결하려 하기보다, 하나님께서 지키시고 쉬게 하신다는 말씀에 마음을 머물러 보세요.',
    refs: [['psalms', 4, 8], ['psalms', 23, 2], ['psalms', 91, 1], ['proverbs', 3, 24], ['isaiah', 26, 3]],
    related: ['anxiety', 'comfort', 'dawn-prayer'],
  },
  {
    slug: 'comfort',
    shortTitle: '지친 마음의 위로',
    title: '힘들고 지쳤을 때 위로가 되는 말씀',
    description: '마음과 몸이 지쳤을 때 다시 힘을 얻도록 돕는 개역한글 위로의 성경말씀을 읽고 들어 보세요.',
    intro: '견디는 것만으로도 벅찬 날에는 많은 말씀을 서둘러 읽지 않아도 됩니다. 하나님이 가까이 계시고 새 힘을 주신다는 한 구절부터 붙들어 보세요.',
    refs: [['psalms', 34, 18], ['psalms', 46, 1], ['psalms', 121, 2], ['isaiah', 40, 31], ['isaiah', 43, 2]],
    related: ['anxiety', 'healing', 'grief'],
  },
  {
    slug: 'dawn-prayer',
    shortTitle: '새벽기도',
    title: '새벽기도를 위한 성경말씀',
    description: '하루를 하나님께 맡기며 기도할 때 읽고 듣기 좋은 개역한글 새벽기도 성경말씀을 모았습니다.',
    intro: '하루가 시작되기 전 말씀으로 마음의 방향을 세워 보세요. 간구와 기다림, 인도하심과 새 은혜를 고백하는 말씀을 차례로 묵상할 수 있습니다.',
    refs: [['psalms', 5, 3], ['psalms', 63, 1], ['psalms', 90, 14], ['psalms', 143, 8], ['lamentations', 3, 23]],
    related: ['gratitude', 'wisdom', 'new-beginnings'],
  },
  {
    slug: 'gratitude',
    shortTitle: '감사',
    title: '감사할 때 읽고 듣는 성경말씀',
    description: '일상의 은혜를 기억하고 하나님께 감사하도록 돕는 개역한글 성경말씀을 읽고 들어 보세요.',
    intro: '감사는 좋은 일이 있을 때만 드리는 반응이 아니라, 받은 은혜를 다시 바라보는 믿음의 고백입니다. 오늘 주어진 선하심을 말씀으로 기억해 보세요.',
    refs: [['psalms', 100, 4], ['psalms', 103, 2], ['psalms', 107, 1], ['psalms', 136, 1], ['1chronicles', 16, 34]],
    related: ['dawn-prayer', 'family', 'new-beginnings'],
  },
  {
    slug: 'wisdom',
    shortTitle: '결정과 지혜',
    title: '중요한 결정을 앞두고 읽는 지혜의 말씀',
    description: '진로와 선택 앞에서 하나님의 인도하심을 구할 때 읽고 듣는 개역한글 지혜의 성경말씀입니다.',
    intro: '결정해야 할 일이 클수록 모든 답을 혼자 계산하려는 마음이 앞섭니다. 길을 맡기고 말씀을 등불로 삼으라는 권면부터 차분히 묵상해 보세요.',
    refs: [['proverbs', 3, 5], ['proverbs', 3, 6], ['proverbs', 16, 3], ['proverbs', 16, 9], ['psalms', 119, 105]],
    related: ['anxiety', 'dawn-prayer', 'new-beginnings'],
  },
  {
    slug: 'family',
    shortTitle: '자녀와 가정',
    title: '자녀와 가정을 위한 기도 말씀',
    description: '자녀의 믿음과 가정의 평안을 위해 기도할 때 읽고 듣는 개역한글 성경말씀을 모았습니다.',
    intro: '가정을 위한 기도는 결과를 통제하는 일이 아니라, 가족을 말씀 안에서 사랑하고 하나님께 맡기는 일입니다. 오늘 가정에 심고 싶은 말씀을 골라 기도해 보세요.',
    refs: [['deuteronomy', 6, 6], ['deuteronomy', 6, 7], ['joshua', 24, 15], ['psalms', 127, 3], ['proverbs', 22, 6]],
    related: ['gratitude', 'wisdom', 'comfort'],
  },
  {
    slug: 'healing',
    shortTitle: '아픔과 회복',
    title: '아프고 회복이 필요할 때 듣는 말씀',
    description: '몸과 마음이 아플 때 하나님의 돌보심과 회복을 바라보며 읽고 듣는 개역한글 성경말씀입니다.',
    intro: '아픔 가운데서는 긴 설명보다 곁에 머무는 말씀이 필요할 때가 있습니다. 상한 마음을 고치시고 약한 자에게 힘을 주시는 하나님을 바라보세요.',
    refs: [['psalms', 41, 3], ['psalms', 103, 3], ['psalms', 147, 3], ['isaiah', 40, 29], ['isaiah', 53, 5]],
    related: ['comfort', 'grief', 'anxiety'],
  },
  {
    slug: 'new-beginnings',
    shortTitle: '새로운 시작',
    title: '새로운 시작을 앞두고 힘을 얻는 말씀',
    description: '새로운 일과 변화 앞에서 용기와 소망을 얻도록 돕는 개역한글 성경말씀을 읽고 들어 보세요.',
    intro: '새로운 시작에는 기대와 두려움이 함께 찾아옵니다. 앞길을 맡기고 하나님이 행하실 새 일을 바라보게 하는 말씀으로 첫걸음을 준비해 보세요.',
    refs: [['joshua', 1, 9], ['isaiah', 43, 19], ['psalms', 37, 5], ['proverbs', 16, 3], ['lamentations', 3, 23]],
    related: ['wisdom', 'dawn-prayer', 'gratitude'],
  },
  {
    slug: 'grief',
    shortTitle: '슬픔과 상실',
    title: '슬픔과 상실 가운데 위로가 되는 말씀',
    description: '이별과 상실로 마음이 무너질 때 곁을 지켜 주는 개역한글 위로의 성경말씀을 읽고 들어 보세요.',
    intro: '슬픔을 빨리 끝내야 할 숙제로 여기지 않아도 됩니다. 상한 마음 가까이에 계시며 품어 주시는 하나님의 말씀 안에서 잠시 쉬어 가세요.',
    refs: [['psalms', 34, 18], ['psalms', 42, 11], ['psalms', 147, 3], ['isaiah', 40, 1], ['isaiah', 66, 13]],
    related: ['comfort', 'healing', 'sleep'],
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadBibleData() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'old_testament.js'), 'utf8'), ctx);
  if (!ctx.oldTestamentData) throw new Error('Failed to load old_testament.js');
  const byName = new Map(ctx.oldTestamentData.books.map((book) => [book.name, book]));
  return { byName };
}

function resolveVerse(byName, [bookId, chapter, verse]) {
  const meta = BOOKS[bookId];
  if (!meta) throw new Error(`Unknown book: ${bookId}`);
  const book = byName.get(meta.book);
  const chapterData = book?.chapters.find((item) => item.chapter === chapter);
  const verseData = chapterData?.verses.find((item) => item.verse === verse);
  if (!verseData || !String(verseData.text || '').trim()) {
    throw new Error(`Missing verse: ${meta.book} ${chapter}:${verse}`);
  }
  return { bookId, bookName: meta.book, chapter, verse, text: String(verseData.text) };
}

function readerHref(item, slug) {
  const params = new URLSearchParams({
    book: item.bookName,
    chapter: String(item.chapter),
    verse: String(item.verse),
    source: `topic-${slug}`,
  });
  return `/reader.html?${params.toString()}`;
}

function jsonLd(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function shell({ depth, title, description, canonicalPath, h1, body, breadcrumbs, topicSlug }) {
  const prefix = '../'.repeat(depth);
  const canonical = `${SITE}${canonicalPath}`;
  const breadcrumbJson = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE}${item.href}`,
    })),
  };
  const pageJson = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonical,
    inLanguage: 'ko-KR',
    isPartOf: { '@type': 'WebSite', name: '은혜의말씀', url: `${SITE}/` },
  };
  const crumbHtml = breadcrumbs.map((item, index) => {
    const last = index === breadcrumbs.length - 1;
    return last
      ? `<li aria-current="page">${escapeHtml(item.name)}</li>`
      : `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a></li>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} | 은혜의말씀</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="은혜의말씀">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="${prefix}css/topic-pages.css">
<script src="/analytics-control.js?v=20260826-internal-exclusion-v1"></script>
<script src="/js/gomna-entry-analytics.js?v=20260827-topic-v1" defer></script>
<script type="application/ld+json">${jsonLd(breadcrumbJson)}</script>
<script type="application/ld+json">${jsonLd(pageJson)}</script>
</head>
<body data-topic-slug="${escapeHtml(topicSlug)}">
<main class="topic-page">
  <a class="topic-brand" href="/"><img src="${prefix}logo-home.png" alt="" width="38" height="38"><span>은혜의말씀</span></a>
  <nav aria-label="현재 위치"><ol class="topic-breadcrumb">${crumbHtml}</ol></nav>
  <h1>${escapeHtml(h1)}</h1>${body}
</main>
<div id="topic-cookie-banner" class="topic-cookie-banner" role="dialog" aria-label="분석 쿠키 동의 안내" hidden>
  <p>서비스 개선을 위한 방문 통계 수집에 동의하시겠습니까? 거부해도 이용 제한은 없습니다.</p>
  <div><button type="button" data-topic-cookie="reject">거부</button><button type="button" class="accept" data-topic-cookie="accept">동의</button></div>
</div>
</body>
</html>
`;
}

function renderHub() {
  const cards = TOPICS.map((topic) => `
    <li><a class="topic-link-card" href="/topics/${topic.slug}/">
      <strong>${escapeHtml(topic.title)}</strong>
      <span>${escapeHtml(topic.description)}</span>
    </a></li>`).join('');
  const body = `
  <p class="topic-lead">지금 마음과 삶의 상황에 맞는 말씀을 골라 읽고 들어 보세요. 각 페이지는 은혜의말씀 Reader의 정확한 장과 절로 연결됩니다.</p>
  <ul class="topic-grid">${cards}</ul>
  <footer class="topic-footer"><a href="/">은혜의말씀 홈</a><a href="/reader.html">성경 전체 열기</a></footer>`;
  return shell({
    depth: 1,
    title: '상황별 성경말씀 읽기·듣기',
    description: '불안, 잠, 위로, 감사, 기도, 가정과 회복 등 지금의 상황에 맞는 개역한글 성경말씀을 읽고 들어 보세요.',
    canonicalPath: '/topics/',
    h1: '지금 필요한 말씀을 찾아보세요',
    body,
    topicSlug: 'all',
    breadcrumbs: [{ name: '은혜의말씀', href: '/' }, { name: '상황별 말씀', href: '/topics/' }],
  });
}

function renderTopic(topic, byName, topicMap) {
  const verses = topic.refs.map((ref) => resolveVerse(byName, ref));
  const cards = verses.map((item) => {
    const label = `${item.bookName} ${item.chapter}:${item.verse}`;
    return `
    <article class="verse-card">
      <h2>${escapeHtml(label)}</h2>
      <p>${escapeHtml(item.text.trim())}</p>
      <a class="topic-cta" href="${escapeHtml(readerHref(item, topic.slug))}">${escapeHtml(label)} 읽고 듣기</a>
    </article>`;
  }).join('');
  const related = topic.related.map((slug) => {
    const item = topicMap.get(slug);
    if (!item) throw new Error(`Missing related topic: ${slug}`);
    return `<li><a href="/topics/${item.slug}/">${escapeHtml(item.shortTitle)}</a></li>`;
  }).join('');
  const body = `
  <p class="topic-lead">${escapeHtml(topic.intro)}</p>
  <div class="topic-note">아래 말씀은 모두 개역한글 본문이며, 버튼을 누르면 해당 절에서 읽기·듣기·말씀풀이를 이어갈 수 있습니다.</div>
  <section class="verse-list" aria-label="${escapeHtml(topic.shortTitle)} 성경말씀">${cards}</section>
  <section class="related-topics"><h2>함께 찾는 상황별 말씀</h2><ul>${related}</ul></section>
  <footer class="topic-footer"><a href="/topics/">상황별 말씀 전체</a><a href="/">은혜의말씀 홈</a></footer>`;
  return shell({
    depth: 2,
    title: topic.title,
    description: topic.description,
    canonicalPath: `/topics/${topic.slug}/`,
    h1: topic.title,
    body,
    topicSlug: topic.slug,
    breadcrumbs: [
      { name: '은혜의말씀', href: '/' },
      { name: '상황별 말씀', href: '/topics/' },
      { name: topic.shortTitle, href: `/topics/${topic.slug}/` },
    ],
  });
}

function updateSitemap(urls) {
  const file = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(file, 'utf8');
  const blockRe = new RegExp(
    `${SITEMAP_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${SITEMAP_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
    'g'
  );
  xml = xml.replace(blockRe, '');
  const entries = urls.map((url) => `  <url>\n    <loc>${url}</loc>\n    <lastmod>${LASTMOD}</lastmod>\n    <priority>0.8</priority>\n  </url>`).join('\n');
  const block = `${SITEMAP_BEGIN}\n${entries}\n${SITEMAP_END}\n`;
  if (!xml.includes('</urlset>')) throw new Error('sitemap.xml missing </urlset>');
  fs.writeFileSync(file, xml.replace('</urlset>', `${block}</urlset>`), 'utf8');
}

function main() {
  if (TOPICS.length !== 10) throw new Error(`Expected 10 topics, got ${TOPICS.length}`);
  const topicMap = new Map(TOPICS.map((topic) => [topic.slug, topic]));
  if (topicMap.size !== TOPICS.length) throw new Error('Duplicate topic slug');
  const { byName } = loadBibleData();
  fs.mkdirSync(path.join(ROOT, 'topics'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'topics', 'index.html'), renderHub(), 'utf8');
  for (const topic of TOPICS) {
    const dir = path.join(ROOT, 'topics', topic.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderTopic(topic, byName, topicMap), 'utf8');
  }
  const urls = [`${SITE}/topics/`, ...TOPICS.map((topic) => `${SITE}/topics/${topic.slug}/`)];
  updateSitemap(urls);
  console.log(`○ 상황별 허브: 1`);
  console.log(`○ 상황별 페이지: ${TOPICS.length}`);
  console.log(`○ 연결된 성경 구절: ${TOPICS.reduce((sum, topic) => sum + topic.refs.length, 0)}`);
}

main();
