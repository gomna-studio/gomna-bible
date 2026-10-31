import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as backend from '../../supabase/functions/_shared/today-word.ts';
const require=createRequire(import.meta.url);
const web=require('../../js/gomna-daily-verses.js');
const data=JSON.parse(readFileSync(new URL('../../supabase/functions/_shared/daily-verses.json',import.meta.url),'utf8'));

test('server has exactly the same 92 canonical quotations and available translations as Home',()=>{
  assert.deepEqual(data,web.verses.map(({t,r,i18n})=>i18n?{t,r,i18n}:{t,r}));
  assert.equal(data.length,92);
});
test('server and Home select identical passages for two cycles, earlier dates and calendar boundaries',()=>{
  const dates=Array.from({length:216},(_,i)=>new Date(Date.UTC(2026,9,1+i-31)).toISOString().slice(0,10));
  dates.push('2027-01-01','2028-02-28','2028-02-29','2028-03-01');
  for(const date of dates){
    const actual=backend.getVerseForDate(date),expected=web.getVerseForDate(date);
    assert.equal(actual.r,expected.r,date);assert.equal(actual.t,expected.t,date);
    for(const locale of ['ko','en','ja','zh']){
      const a=backend.buildPayload({date,locale}),b=web.buildPayload({date,locale});
      assert.equal(a.verseId,b.verseId,date);assert.deepEqual(a.data,b.data,date);
    }
  }
  assert.equal(backend.getVerseForDate('2026-10-31').r,'시편 4:8');
  assert.equal(backend.getVerseForDate('2026-11-01').r,'시편 5:3');
});
test('server uses Korean midnight and rejects malformed calendar dates',()=>{
  for(const value of ['2026-10-30T14:59:59.999Z','2026-10-30T15:00:00Z','2026-12-31T15:00:00Z']){
    assert.equal(backend.kstDateKey(new Date(value)),web.kstDateKey(new Date(value)));
  }
  for(const date of ['2026-02-30','2026-13-01','bad'])assert.throws(()=>backend.getVerseForDate(date),TypeError);
});
