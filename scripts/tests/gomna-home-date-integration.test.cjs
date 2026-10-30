const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const cp=require('node:child_process');
if(process.env.GOMNA_DATE_PROBE){
 const api=require('../../js/gomna-daily-verses.js');const html=fs.readFileSync('index.html','utf8');
 const src=html.slice(html.indexOf('function getVerseForDate(d)'),html.indexOf('let _selectedDate;'));
 const ctx={window:{GomnaDailyVerses:api},Date};vm.createContext(ctx);vm.runInContext(src,ctx);
 for(const instant of ['2026-10-29T14:59:59Z','2026-10-29T15:00:00Z','2026-12-31T15:00:00Z']){
 const now=new Date(instant),selected=ctx._localDay(now);
 assert.equal(ctx.getVerseForDate(selected).r,api.getVerseForDate(now).r);
 assert.equal(ctx.getVerseForDate(ctx._localDay(selected)).r,api.getVerseForDate(now).r);
 assert.equal(ctx._isSameDate(selected,now),true);
 }
}else{
 test('actual home date helpers agree with Korean schedule across browser timezones and repeated rendering',()=>{
  for(const TZ of ['UTC','Asia/Seoul','America/Los_Angeles','Pacific/Auckland'])cp.execFileSync(process.execPath,[__filename],{env:{...process.env,TZ,GOMNA_DATE_PROBE:'1'}});
 });
}
