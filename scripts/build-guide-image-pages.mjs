import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/gomna-bible-library-data.js'), 'utf8'), context);
const people = context.window.GOMNA_BIBLE_LIBRARY_DATA;
const origin = 'https://gomnastudio.com';
const guide = (id, name, file, book, chapter, verse=1) => ({id, name,
  image: `assets/guide-thumbnails/${file}-large.webp`, book, chapter, start: verse, end: verse});
const selected = [
  guide('mount-sinai', '모세의 산', 'guide-tablets-fire-v20', '출애굽기', 19),
  guide('israel-kingdom', '이스라엘 왕국', 'guide-2-symbol-v16', '사무엘하', 5),
  ...['esther','hannah','samuel','mary-magdalene','zacchaeus','ruth','joseph'].map(id => {
    const item = people.find(p => p.id === id && p.kind === 'people');
    if (!item) throw new Error(`Missing person ${id}`);
    return item;
  })
];
const searchable = [...selected, ...people.filter(item => !selected.some(chosen => chosen.id === item.id)),
  guide('prayer-and-praise','기도와 찬양','guide-poetry-v15','시편',23),
  guide('prophecy-and-restoration','예언과 회복','guide-4-symbol-v16','이사야',40),
  guide('repentance-and-hope','회개와 소망','guide-5-symbol-v16','호세아',14),
  guide('resurrection-and-gospel','부활과 복음','guide-6-symbol-v16','마태복음',28),
  guide('journey-of-gospel','복음의 여정','guide-7-symbol-v16','사도행전',1),
  guide('gospel-and-letters','복음과 편지','guide-8-symbol-v16','로마서',1),
  guide('community-of-faith','믿음의 공동체','guide-9-symbol-v16','야고보서',1),
  guide('revelation-and-hope','계시와 소망','guide-10-symbol-v16','요한계시록',21)
];
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reader = item => '/reader.html?' + new URLSearchParams({book:item.book,chapter:item.chapter,
  verse:item.start,verseStart:item.start,verseEnd:item.end,source:'guide-related'});
const guideCategories = {
  'mount-sinai':['old','모세오경'], 'israel-kingdom':['old','역사서'],
  'prayer-and-praise':['old','시가서'], 'prophecy-and-restoration':['old','대선지서'],
  'repentance-and-hope':['old','소선지서'], 'resurrection-and-gospel':['new','복음서'],
  'journey-of-gospel':['new','역사서'], 'gospel-and-letters':['new','바울서신'],
  'community-of-faith':['new','공동서신'], 'revelation-and-hope':['new','예언서']
};
const destination = item => {
  if (item.kind) return '/index.html#bible-library/'+item.kind+'/'+item.id;
  const [testament, category] = guideCategories[item.id];
  return '/reader.html?' + new URLSearchParams({guideDetail:'1',guideTestament:testament,guideCategory:category});
};
const description = item => `${item.name}${item.title ? ' — '+item.title : ''}. ${item.kind ? '인물과 이야기의 시대와 배경을 읽는 성경 이미지.' : item.book+' '+item.chapter+'장 관련 성경 이미지.'}`;
const image = (item, index) => `<a class="scripture-image" href="${escape(destination(item))}" aria-label="${escape(item.name+(item.kind ? ' — 시대와 배경 열기' : ' — 성경길잡이 설명 열기'))}"><img src="/${item.image}" alt="${escape(description(item))}" width="${item.imageWidth||1024}" height="${item.imageHeight||1024}" ${index===0?'fetchpriority="high"':'loading="lazy"'} decoding="async"></a>`;
function page(items, item) {
  const title = item ? `${item.name} 성경 이미지 | 은혜의말씀` : '성경길잡이 이미지 | 은혜의말씀';
  const canonical = `${origin}/bible-images/${item ? item.id+'/' : ''}`;
  const desc = item ? description(item) : '모세의 산, 이스라엘 왕국과 성경 속 인물의 이미지를 눌러 관련 이야기와 말씀을 읽습니다.';
  const schema = item ? {'@context':'https://schema.org','@type':'ImageObject',name:item.name,
    description:desc,contentUrl:`${origin}/${item.image}`,url:canonical} : null;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><meta name="description" content="${escape(desc)}">
<link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(desc)}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta property="og:image" content="${origin}/${items[0].image}">
<link rel="stylesheet" href="/bible-images/images.css">
${schema?'<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>':''}
<script src="/analytics-control.js?v=20260826-internal-exclusion-v1"></script>
<script defer src="/js/gomna-ga4.js?v=20261001-analytics-v1"></script>
<script defer src="/js/gomna-usage-diagnostics.js?v=20261023-usage-v1"></script>
</head><body><main aria-label="${escape(title)}">${items.map(image).join('\n')}</main></body></html>\n`;
}
const output = path.join(root, 'bible-images');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'index.html'),page(selected));
for (const item of searchable) {
  if (!fs.existsSync(path.join(root,item.image))) throw new Error(`Missing image ${item.image}`);
  fs.mkdirSync(path.join(output,item.id),{recursive:true});
  fs.writeFileSync(path.join(output,item.id,'index.html'),page([item],item));
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<url><loc>${origin}/bible-images/</loc></url>
${searchable.map(item=>`<url><loc>${origin}/bible-images/${item.id}/</loc><image:image><image:loc>${origin}/${item.image}</image:loc></image:image></url>`).join('\n')}
</urlset>\n`;
fs.writeFileSync(path.join(root,'sitemap-images.xml'),xml);
console.log(`Built ${selected.length} guide images, ${searchable.length} individual image pages and image sitemap.`);
