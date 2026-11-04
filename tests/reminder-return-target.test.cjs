const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const daily=require('../js/gomna-daily-verses.js');
const feed=fs.readFileSync('js/gomna-home-feed.js','utf8'),home=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('sw.js','utf8');
const bookData=home.split('\n').filter(line=>/^const (oldData|newData)=/.test(line)).join('\n');
const website='https://gomnastudio.com';
function app(search=''){
 const calls=[], location={search,href:website+'/'+search,assign:x=>calls.push(['assign',x]),replace:x=>calls.push(['replace',x])};
 const ctx=vm.createContext({window:{GomnaDailyVerses:{...daily,kstDateKey:()=> '2026-11-04'}},URL,URLSearchParams,location,root:{querySelector:()=>({})},closeSheets(){},resetHomeToFirstCard(){},openCard:()=>calls.push(['today'])});
 vm.runInContext(bookData+'\n'+feed.slice(feed.indexOf('  function reminderReaderUrl('),feed.indexOf('  function postPushProbe(')),ctx);
 return {ctx,calls};
}
async function delivered(d,client){
 const opened=[], ctx=vm.createContext({URL,self:{location:{origin:website},clients:{matchAll:async()=>client?[client]:[],openWindow:async url=>opened.push(url)}}});
 vm.runInContext(worker.slice(worker.indexOf('function openTodayWordFromPush(')),ctx);
 await ctx.openTodayWordFromPush(d.url,d);return opened;
}
function params(url){const dest=new URL(url,website);assert.equal(dest.pathname,'/reader.html');return dest.searchParams;}
function matchRef(url,book,ch,start,end){const p=params(url);assert.equal(p.get('book'),book);assert.equal(p.get('chapter'),String(ch));assert.equal(p.get('verseStart'),String(start));assert.equal(p.get('verse'),String(start));assert.equal(p.get('verseEnd'),end?String(end):null);}
test('cold dated reminder exits to Reader before home initializes; original email reference overrides the current schedule',()=>{
 const old='?source=home-today&date=2026-11-03&book=로마서&chapter=8&start=38&end=39&utm_medium=email';
 const {ctx,calls}=app(old);ctx.document={documentElement:{getAttribute:()=>"1"},addEventListener(){},getElementById:()=>({getAttribute:()=>null})};ctx.window.setTimeout=()=>0;
 // Boot the real feed; an accidental fall-through will hit missing normal-home DOM.
 vm.runInContext(feed,ctx);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'replace');
 matchRef(calls[0][1],'로마서',8,38,39);assert.equal(params(calls[0][1]).get('utm_medium'),'email');
 assert.equal(daily.getVerseForDate('2026-11-03').r,'시편 19:14');assert.equal(daily.getVerseForDate('2026-11-04').r,'시편 27:1');
});
test('date-only past, today, ordinary home, invalid date, future and bad passage follow their intended routes',()=>{
 const {ctx}=app();const resolve=q=>ctx.reminderReaderUrl(q,null);
 matchRef(resolve('?source=home-today&date=2026-11-03'),'시편',19,14);
 matchRef(resolve('?source=home-today&date=2026-11-03&book=bogus&chapter=12&start=2'),'시편',19,14);
 for(const q of ['','?source=home-today','?source=home-life&date=2026-11-03','?source=home-today&date=2026-02-30','?source=home-today&date=2026-11-05','?source=home-today&date=2026-11-04&book=시편&chapter=27&start=1'])assert.equal(resolve(q),'',q);
 matchRef(resolve('?source=home-today&date=2026-11-04&book=로마서&chapter=8&start=38&end=39'),'로마서',8,38,39);
});
test('worker keeps original passage when opening a closed app or replacing a Reader client',async()=>{
 const d={...daily.buildPayload({date:'2026-11-03'}).data,book:'로마서',chapter:8,startVerse:38,endVerse:39};
 const {ctx}=app();
 const check=url=>matchRef(ctx.reminderReaderUrl(new URL(url).search,null),'로마서',8,38,39);
 const [cold]=await delivered(d);check(cold);
 const nav=[];await delivered(d,{url:website+'/reader.html',focus:async()=>{},postMessage(){},navigate:async url=>nav.push(url)});check(nav[0]);
});
test('already open Home handles original notification; current and undated probe retain normal card',async()=>{
 const {ctx,calls}=app();const receive=data=>ctx.openTodayFromPush(data.data);
 const d=daily.buildPayload({date:'2026-11-03'}).data;
 await delivered(d,{url:website+'/',focus:async()=>{},postMessage:receive});matchRef(calls[0][1],'시편',19,14);assert.equal(calls[0][0],'assign');
 ctx.openTodayFromPush(daily.buildPayload({date:'2026-11-04'}).data);ctx.openTodayFromPush({source:'home-today',probe:true});assert.deepEqual(calls.slice(1),[['today'],['today']]);
 assert.match(feed,/openTodayFromPush\(ev\.data\.data\)/);
});
