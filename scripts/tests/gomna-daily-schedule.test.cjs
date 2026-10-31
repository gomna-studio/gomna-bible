const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const daily=require(path.join(root,'js/gomna-daily-verses.js'));
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'old_testament.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'new_testament.js'),'utf8'),ctx);
const books=[...ctx.oldTestamentData.books,...ctx.newTestamentData.books];
test('every daily quote exactly matches its complete KRV passage',()=>{
  assert.equal(daily.verses.length,92);
  assert.equal(new Set(daily.verses.map(v=>v.r)).size,92);
  for(const entry of daily.verses){
    const p=daily.parseRef(entry.r);
    const chapter=books.find(b=>b.name===p.book).chapters.find(c=>c.chapter===p.chapter);
    const texts=[];for(let n=p.startVerse;n<=p.endVerse;n++)texts.push(chapter.verses.find(v=>v.verse===n).text.trim());
    assert.equal(entry.t,texts.join(' '),entry.r);
  }
});
test('92 dates have distinct passages and non-default reflection content',()=>{
  const refs=new Set(),meanings=new Set(),practices=new Set();
  for(let i=0;i<92;i++){
    const date=new Date(Date.UTC(2026,9,1+i));
    const v=daily.getVerseForDate(date);
    refs.add(v.r);meanings.add(v.reflection.meaning);practices.add(v.reflection.practice);
    assert.equal(daily.getReflection(v.r),v.reflection);
  }
  assert.equal(refs.size,92);assert.equal(meanings.size,92);assert.equal(practices.size,92);
});
test('month end and year end do not reset the schedule',()=>{
  assert.notEqual(daily.getVerseForDate('2026-10-31').r,daily.getVerseForDate('2026-11-01').r);
  assert.equal(daily.dayIndex('2026-11-01')-daily.dayIndex('2026-10-31'),1);
  assert.equal(daily.dayIndex('2027-01-01')-daily.dayIndex('2026-12-31'),1);
  assert.equal(daily.dayIndex('2028-03-01')-daily.dayIndex('2028-02-28'),2);
});
test('Korean midnight consistently changes both verse and push payload',()=>{
  const before=new Date('2026-10-30T14:59:59.999Z'),after=new Date('2026-10-30T15:00:00Z');
  assert.equal(daily.kstDateKey(before),'2026-10-30');assert.equal(daily.kstDateKey(after),'2026-10-31');
  assert.equal(daily.millisecondsUntilNextDay(before),1);assert.equal(daily.millisecondsUntilNextDay(after),86400000);
  assert.notEqual(daily.getVerseForDate(before).r,daily.getVerseForDate(after).r);
  const date=daily.kstDateKey(after),ref=daily.getVerseForDate(after).r;
  assert.equal(daily.buildPayload({date}).verseId,date+'|'+ref);
});
test('invalid dates reject, earlier dates wrap, unsupported translations stay labeled KRV',()=>{
  assert.throws(()=>daily.getVerseForDate('2026-02-30'),TypeError);
  assert.ok(daily.getVerseForDate('2026-01-01'));
  const r=daily.resolveVerse({date:'2026-10-31',locale:'en'});
  assert.equal(r.bibleVersion,'KRV');assert.equal(r.contentLocale,'ko');
  assert.equal(daily.resolveVerse({date:'2026-10-30',locale:'en'}).bibleVersion,'WEBP');
});
