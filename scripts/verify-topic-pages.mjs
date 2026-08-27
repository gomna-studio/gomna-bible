#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://gomnastudio.com';
const SLUGS = ['anxiety', 'sleep', 'comfort', 'dawn-prayer', 'gratitude', 'wisdom', 'family', 'healing', 'new-beginnings', 'grief'];

function fail(message) { console.error(`FAIL: ${message}`); process.exit(1); }
function read(relative) { return fs.readFileSync(path.join(ROOT, relative), 'utf8'); }

const hub = read('topics/index.html');
if (!hub.includes('<html lang="ko">')) fail('hub lang');
if (!hub.includes('상황별 성경말씀 읽기·듣기')) fail('hub title');
for (const slug of SLUGS) {
  if (!hub.includes(`/topics/${slug}/`)) fail(`hub missing ${slug}`);
}

const canonicals = new Set();
for (const slug of SLUGS) {
  const html = read(`topics/${slug}/index.html`);
  const canonical = `${SITE}/topics/${slug}/`;
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) fail(`${slug} canonical`);
  if (canonicals.has(canonical)) fail(`${slug} duplicate canonical`);
  canonicals.add(canonical);
  if (!html.includes('BreadcrumbList')) fail(`${slug} breadcrumb`);
  if (!html.includes('"@type": "WebPage"')) fail(`${slug} WebPage schema`);
  if (!html.includes('/analytics-control.js?')) fail(`${slug} analytics exclusion control`);
  if (!html.includes('/js/gomna-entry-analytics.js?')) fail(`${slug} entry analytics`);
  const verseCards = (html.match(/class="verse-card"/g) || []).length;
  if (verseCards !== 5) fail(`${slug} verse cards ${verseCards}`);
  const readerLinks = (html.match(/source=topic-/g) || []).length;
  if (readerLinks !== 5) fail(`${slug} reader links ${readerLinks}`);
  const relatedSection = html.match(/<section class="related-topics">([\s\S]*?)<\/section>/)?.[1] || '';
  const relatedLinks = (relatedSection.match(/<li><a href="\/topics\//g) || []).length;
  if (relatedLinks !== 3) fail(`${slug} related links ${relatedLinks}`);
  if (/undefined|null/.test(html)) fail(`${slug} invalid placeholder`);
}

const sitemap = read('sitemap.xml');
const urls = [`${SITE}/topics/`, ...SLUGS.map((slug) => `${SITE}/topics/${slug}/`)];
for (const url of urls) {
  const occurrences = sitemap.split(`<loc>${url}</loc>`).length - 1;
  if (occurrences !== 1) fail(`sitemap ${url} occurrences ${occurrences}`);
}
if (!fs.existsSync(path.join(ROOT, 'css/topic-pages.css'))) fail('missing CSS');
if (!fs.existsSync(path.join(ROOT, 'js/gomna-entry-analytics.js'))) fail('missing analytics loader');

console.log('PASS: 상황별 허브 1개');
console.log('PASS: 상황별 페이지 10개');
console.log('PASS: 성경 구절·Reader 연결 50개');
console.log('PASS: canonical·구조화 데이터·sitemap');
