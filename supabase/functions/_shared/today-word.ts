import verses from './daily-verses.json' with { type: 'json' };

type Verse = { t: string; r: string; i18n?: Record<string, string> };

const VERSES = verses as Verse[];
const TITLES: Record<string, string> = {
  ko: '오늘의 말씀',
  en: "Today's Word",
  ja: '今日のみことば',
  zh: '今日的话语'
};
const SECOND_TITLES: Record<string, string> = {
  ko: '오늘의 말씀을 다시 묵상해보세요',
  en: 'Meditate on today’s Word again',
  ja: '今日のみことばをもう一度黙想してみましょう',
  zh: '再默想一次今日的话语'
};
const BOOK_NAMES: Record<string, Record<string, string>> = {
  '욥기': { en: 'Job', ja: 'ヨブ記', zh: '约伯记' },
  '시편': { en: 'Psalm', ja: '詩篇', zh: '诗篇' },
  '베드로전서': { en: '1 Peter', ja: 'ペテロの第一の手紙', zh: '彼得前书' },
  '빌립보서': { en: 'Philippians', ja: 'ピリピ人への手紙', zh: '腓立比书' },
  '요한복음': { en: 'John', ja: 'ヨハネによる福音書', zh: '约翰福音' },
  '요한일서': { en: '1 John', ja: 'ヨハネの第一の手紙', zh: '约翰一书' },
  '고린도전서': { en: '1 Corinthians', ja: 'コリント人への第一の手紙', zh: '哥林多前书' },
  '로마서': { en: 'Romans', ja: 'ローマ人への手紙', zh: '罗马书' },
  '히브리서': { en: 'Hebrews', ja: 'ヘブル人への手紙', zh: '希伯来书' },
  '마가복음': { en: 'Mark', ja: 'マルコによる福音書', zh: '马可福音' },
  '야고보서': { en: 'James', ja: 'ヤコブの手紙', zh: '雅各书' },
  '예레미야': { en: 'Jeremiah', ja: 'エレミヤ書', zh: '耶利米书' },
  '이사야': { en: 'Isaiah', ja: 'イザヤ書', zh: '以赛亚书' },
  '잠언': { en: 'Proverbs', ja: '箴言', zh: '箴言' },
  '여호수아': { en: 'Joshua', ja: 'ヨシュア記', zh: '约书亚记' },
  '신명기': { en: 'Deuteronomy', ja: '申命記', zh: '申命记' },
  '디모데후서': { en: '2 Timothy', ja: 'テモテへの第二の手紙', zh: '提摩太后书' },
  '마태복음': { en: 'Matthew', ja: 'マタイによる福音書', zh: '马太福音' },
  '데살로니가전서': { en: '1 Thessalonians', ja: 'テサロニケ人への第一の手紙', zh: '帖撒罗尼迦前书' }
};

function pad2(n: number) { return (n < 10 ? '0' : '') + String(n); }

export function nativeLocale(raw: unknown): 'ko' | 'en' | 'ja' | 'zh' {
  const s = String(raw || 'ko').toLowerCase();
  if (s === 'en' || s === 'ja' || s === 'zh' || s === 'ko') return s;
  return 'ko';
}

export function kstDateKey(d = new Date()): string {
  const s = d.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
  const x = new Date(s);
  return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
}

export function getVerseForDate(dateKey: string): Verse {
  const day = Number(String(dateKey).slice(-2));
  const idx = ((day - 1) % 30 + 30) % 30;
  return VERSES[idx];
}

function parseRef(ref: string) {
  const m = String(ref || '').trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return { book: String(ref || '').trim(), chapter: 1, startVerse: 1, endVerse: 1 };
  const start = parseInt(m[3], 10);
  const end = m[4] ? parseInt(m[4], 10) : start;
  return { book: m[1].trim(), chapter: parseInt(m[2], 10), startVerse: start, endVerse: end };
}

function localizeRef(refKo: string, locale: string) {
  if (locale === 'ko') return refKo;
  const parsed = parseRef(refKo);
  const book = (BOOK_NAMES[parsed.book] && BOOK_NAMES[parsed.book][locale]) || parsed.book;
  const range = parsed.chapter + ':' + parsed.startVerse + (parsed.endVerse > parsed.startVerse ? '-' + parsed.endVerse : '');
  return book + ' ' + range;
}

function truncateBody(text: string, max = 90) {
  const t = String(text || '').replace(/^["“]+|["”]+$/g, '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

export function buildPayload(opts: { date?: string; locale?: string; slot?: string }) {
  const date = opts.date || kstDateKey();
  const locale = nativeLocale(opts.locale);
  const slot = opts.slot === 'second' ? 'second' : 'first';
  const v = getVerseForDate(date);
  const body = (locale !== 'ko' && v.i18n && v.i18n[locale]) ? v.i18n[locale] : v.t;
  const parsed = parseRef(v.r);
  const refText = localizeRef(v.r, locale);
  return {
    title: slot === 'second' ? (SECOND_TITLES[locale] || SECOND_TITLES.ko) : (TITLES[locale] || TITLES.ko),
    body: refText + '\n' + truncateBody(body),
    lang: locale,
    tag: 'gomna-today-' + date + '-' + slot,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    verseId: date + '|' + v.r,
    data: {
      source: 'home-today',
      date,
      slot,
      book: parsed.book,
      chapter: parsed.chapter,
      startVerse: parsed.startVerse,
      endVerse: parsed.endVerse,
      locale,
      url: '/?source=home-today&date=' + encodeURIComponent(date)
    }
  };
}
