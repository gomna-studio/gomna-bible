#!/usr/bin/env node
/**
 * Convert public-domain WEBP (VPL), Japanese Kougo (OSIS), and
 * Chinese Union Version Simplified (USFX) into compact JSON keyed
 * by Protestant book number 1–66.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'js', 'bible');
const SRC = '/tmp/gomna-bible-src';

const USFM_TO_NR = {
  GEN: 1, EXO: 2, LEV: 3, NUM: 4, DEU: 5, JOS: 6, JDG: 7, RUT: 8,
  '1SA': 9, '2SA': 10, '1KI': 11, '2KI': 12, '1CH': 13, '2CH': 14,
  EZR: 15, NEH: 16, EST: 17, JOB: 18, PSA: 19, PRO: 20, ECC: 21, SOL: 22,
  ISA: 23, JER: 24, LAM: 25, EZE: 26, DAN: 27, HOS: 28, JOE: 29, AMO: 30,
  OBA: 31, JON: 32, MIC: 33, NAH: 34, HAB: 35, ZEP: 36, HAG: 37, ZEC: 38, MAL: 39,
  MAT: 40, MAR: 41, LUK: 42, JOH: 43, ACT: 44, ROM: 45, '1CO': 46, '2CO': 47,
  GAL: 48, EPH: 49, PHI: 50, COL: 51, '1TH': 52, '2TH': 53, '1TI': 54, '2TI': 55,
  TIT: 56, PHM: 57, HEB: 58, JAM: 59, '1PE': 60, '2PE': 61, '1JO': 62, '2JO': 63,
  '3JO': 64, JUD: 65, REV: 66
};

const USFX_TO_NR = {
  GEN: 1, EXO: 2, LEV: 3, NUM: 4, DEU: 5, JOS: 6, JDG: 7, RUT: 8,
  '1SA': 9, '2SA': 10, '1KI': 11, '2KI': 12, '1CH': 13, '2CH': 14,
  EZR: 15, NEH: 16, EST: 17, JOB: 18, PSA: 19, PRO: 20, ECC: 21, SNG: 22,
  ISA: 23, JER: 24, LAM: 25, EZK: 26, DAN: 27, HOS: 28, JOL: 29, AMO: 30,
  OBA: 31, JON: 32, MIC: 33, NAM: 34, HAB: 35, ZEP: 36, HAG: 37, ZEC: 38, MAL: 39,
  MAT: 40, MRK: 41, LUK: 42, JHN: 43, ACT: 44, ROM: 45, '1CO': 46, '2CO': 47,
  GAL: 48, EPH: 49, PHP: 50, COL: 51, '1TH': 52, '2TH': 53, '1TI': 54, '2TI': 55,
  TIT: 56, PHM: 57, HEB: 58, JAS: 59, '1PE': 60, '2PE': 61, '1JN': 62, '2JN': 63,
  '3JN': 64, JUD: 65, REV: 66
};

const OSIS_TO_NR = {
  Gen: 1, Exod: 2, Lev: 3, Num: 4, Deut: 5, Josh: 6, Judg: 7, Ruth: 8,
  '1Sam': 9, '2Sam': 10, '1Kgs': 11, '2Kgs': 12, '1Chr': 13, '2Chr': 14,
  Ezra: 15, Neh: 16, Esth: 17, Job: 18, Ps: 19, Prov: 20, Eccl: 21, Song: 22,
  Isa: 23, Jer: 24, Lam: 25, Ezek: 26, Dan: 27, Hos: 28, Joel: 29, Amos: 30,
  Obad: 31, Jonah: 32, Mic: 33, Nah: 34, Hab: 35, Zeph: 36, Hag: 37, Zech: 38, Mal: 39,
  Matt: 40, Mark: 41, Luke: 42, John: 43, Acts: 44, Rom: 45, '1Cor': 46, '2Cor': 47,
  Gal: 48, Eph: 49, Phil: 50, Col: 51, '1Thess': 52, '2Thess': 53, '1Tim': 54, '2Tim': 55,
  Titus: 56, Phlm: 57, Heb: 58, Jas: 59, '1Pet': 60, '2Pet': 61, '1John': 62, '2John': 63,
  '3John': 64, Jude: 65, Rev: 66
};

function putVerse(books, nr, ch, vs, text) {
  if (!nr || !ch || !vs || !text) return;
  const b = String(nr);
  const c = String(ch);
  const v = String(vs);
  if (!books[b]) books[b] = {};
  if (!books[b][c]) books[b][c] = {};
  books[b][c][v] = text;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripXml(s) {
  return decodeEntities(
    s.replace(/<w\b[^>]*>([\s\S]*?)<\/w>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function parseRef(osisID) {
  const first = String(osisID || '').trim().split(/\s+/)[0];
  const m = first.match(/^([A-Za-z0-9]+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const nr = OSIS_TO_NR[m[1]];
  if (!nr) return null;
  return { nr, ch: Number(m[2]), vs: Number(m[3]) };
}

function countVerses(books) {
  let n = 0;
  Object.keys(books).forEach((b) => {
    Object.keys(books[b]).forEach((c) => {
      n += Object.keys(books[b][c]).length;
    });
  });
  return n;
}

function parseWebp(txt) {
  const books = {};
  const lines = txt.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9]{3})\s+(\d+):(\d+)\s+(.*)$/);
    if (!m) continue;
    const nr = USFM_TO_NR[m[1]];
    if (!nr) {
      throw new Error('Unknown USFM code: ' + m[1]);
    }
    putVerse(books, nr, Number(m[2]), Number(m[3]), m[4].trim());
  }
  return books;
}

function parseCuvUsfx(xml) {
  const books = {};
  const bookRe = /<book\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/book>/g;
  let bookMatch;
  while ((bookMatch = bookRe.exec(xml))) {
    const nr = USFX_TO_NR[bookMatch[1]];
    if (!nr) continue;
    const body = bookMatch[2];
    let chapter = 0;
    const tokenRe = /<c\b[^>]*\bid="(\d+)"[^>]*\/?>|<v\b[^>]*\bid="(\d+)"[^>]*\/?>([\s\S]*?)<ve\s*\/>/g;
    let token;
    while ((token = tokenRe.exec(body))) {
      if (token[1]) {
        chapter = Number(token[1]);
        continue;
      }
      const vs = Number(token[2]);
      const text = stripXml(token[3] || '');
      if (text) putVerse(books, nr, chapter, vs, text);
    }
  }
  return books;
}

function parseKougo(xml) {
  const books = {};
  const containerRe = /<verse\b([^>/]*)>([\s\S]*?)<\/verse>/g;
  let m;
  while ((m = containerRe.exec(xml))) {
    const attrs = m[1];
    if (/\bsID=/.test(attrs) || /\beID=/.test(attrs)) continue;
    const idm = attrs.match(/\bosisID="([^"]+)"/);
    if (!idm) continue;
    const ref = parseRef(idm[1]);
    if (!ref) continue;
    const text = stripXml(m[2]);
    if (text) putVerse(books, ref.nr, ref.ch, ref.vs, text);
  }

  const sidRe = /<verse\b[^>]*\bsID="([^"]+)"[^>]*\/?>/g;
  while ((m = sidRe.exec(xml))) {
    const sid = m[1];
    const after = xml.slice(m.index + m[0].length);
    const endRe = new RegExp('<verse\\b[^>]*\\beID="' + sid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*\\/?>');
    const end = after.match(endRe);
    const chunk = end ? after.slice(0, end.index) : after.slice(0, 8000);
    const osisAttr = m[0].match(/\bosisID="([^"]+)"/);
    const ref = parseRef((osisAttr && osisAttr[1]) || sid);
    if (!ref) continue;
    const text = stripXml(chunk);
    if (text) putVerse(books, ref.nr, ref.ch, ref.vs, text);
  }
  return books;
}

function writeJson(file, payload) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dest = path.join(OUT_DIR, file);
  fs.writeFileSync(dest, JSON.stringify(payload));
  const bytes = fs.statSync(dest).size;
  console.log(file, 'books', Object.keys(payload.books).length, 'verses', countVerses(payload.books), 'bytes', bytes);
}

const webpTxt = execSync('unzip -p ' + JSON.stringify(path.join(SRC, 'engwebp_vpl.zip')) + ' engwebp_vpl.txt', {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024
});
const webpBooks = parseWebp(webpTxt);
if (Object.keys(webpBooks).length !== 66) {
  throw new Error('WEBP book count ' + Object.keys(webpBooks).length);
}
if (!webpBooks['45'] || !webpBooks['45']['8'] || !webpBooks['45']['8']['38']) {
  throw new Error('WEBP missing Romans 8:38');
}
writeJson('webp.json', { v: 'WEBP', source: 'World English Bible, Protestant Edition', books: webpBooks });

const kougoXml = fs.readFileSync(path.join(SRC, 'jpn-kougo.osis.xml'), 'utf8');
const kougoBooks = parseKougo(kougoXml);
if (Object.keys(kougoBooks).length !== 66) {
  throw new Error('Kougo book count ' + Object.keys(kougoBooks).length + ' keys=' + Object.keys(kougoBooks).join(','));
}
if (!kougoBooks['45'] || !kougoBooks['45']['8'] || !kougoBooks['45']['8']['38']) {
  throw new Error('Kougo missing Romans 8:38');
}
writeJson('kougo.json', { v: 'Kougo', source: 'Japanese Kougo-yaku 1954/1955', books: kougoBooks });

const cuvXml = fs.readFileSync(path.join(SRC, 'chi-cuv-simp.usfx.xml'), 'utf8');
const cuvBooks = parseCuvUsfx(cuvXml);
if (Object.keys(cuvBooks).length !== 66) {
  throw new Error('CUV book count ' + Object.keys(cuvBooks).length + ' keys=' + Object.keys(cuvBooks).join(','));
}
if (!cuvBooks['45'] || !cuvBooks['45']['8'] || !cuvBooks['45']['8']['38']) {
  throw new Error('CUV missing Romans 8:38');
}
writeJson('cuv.json', {
  v: 'CUV',
  source: 'Chinese Union Version, Simplified (public domain USFX)',
  books: cuvBooks
});

const DAILY = [
  [18, 8, 7],
  [19, 23, 1],
  [60, 5, 7],
  [50, 4, 6],
  [19, 46, 1],
  [43, 3, 16],
  [62, 4, 7],
  [46, 13, 13],
  [45, 8, [38, 39]],
  [50, 4, 13],
  [58, 11, 1],
  [41, 9, 23],
  [59, 1, 5],
  [24, 29, 11],
  [45, 8, 28],
  [23, 40, 31],
  [20, 3, 5],
  [19, 119, 105],
  [20, 16, 9],
  [6, 1, 9],
  [23, 41, 10],
  [5, 31, 6],
  [55, 1, 7],
  [40, 7, 7],
  [59, 5, 16],
  [52, 5, 17],
  [19, 100, 4],
  [50, 4, 4],
  [52, 5, 18],
  [40, 11, 28]
];

function verseAt(books, nr, ch, vs) {
  const book = books[String(nr)] || {};
  const chapter = book[String(ch)] || {};
  return chapter[String(vs)] || '';
}

const dailyZh = DAILY.map((row) => {
  const [nr, ch, vs] = row;
  if (Array.isArray(vs)) {
    return vs.map((n) => verseAt(cuvBooks, nr, ch, n)).filter(Boolean).join('');
  }
  return verseAt(cuvBooks, nr, ch, vs);
});
fs.writeFileSync('/tmp/gomna-daily-zh.json', JSON.stringify(dailyZh, null, 2));
console.log('daily zh', dailyZh.length, 'missing', dailyZh.filter((s) => !s).length);

console.log('ROM 8:38 WEBP', webpBooks['45']['8']['38']);
console.log('ROM 8:38 Kougo', kougoBooks['45']['8']['38']);
console.log('ROM 8:38 CUV', cuvBooks['45']['8']['38']);
