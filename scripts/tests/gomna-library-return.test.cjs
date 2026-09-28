const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/gomna-library-return.js','utf8');
function setup(listen=true,query='') {
 const events={},nodes={};
 function node(){return {style:{},children:[],setAttribute(k,v){this[k]=v;},insertAdjacentElement(where,n){assert.equal(where,'afterend');nodes[n.id]=n;this.after=n;},appendChild(n){this.children.push(n);if(n.id)nodes[n.id]=n;}};}
 nodes.verseView=node();nodes.anchor=node();
 const context={URLSearchParams,location:{search:query||'?libraryKind=people&libraryId=abraham&libraryName=아브라함&book=창세기&chapter=12&verseStart=1&verseEnd=2'+(listen?'&listen=1':'')},document:{getElementById:id=>nodes[id],createElement:node,querySelector:()=>nodes.anchor},currentBook:{name:'창세기'},currentChapter:12,getChapterAudioIds:()=>['a.bible','b.bible']};
 context.window={addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
 const state={queueAudioIds:['a.bible','b.bible'],queueEpoch:1};
 context.window.GOMNA_AUDIO_ENGINE={_state:state,getState:()=>state};
 vm.runInNewContext(source,context);
 const emit=(name,detail={})=>(events[name]||[]).forEach(fn=>fn({detail}));
 const listeners={};const media={paused:true,readyState:0,ended:false,error:null,addEventListener:(n,fn)=>(listeners[n]??=[]).push(fn)};
 function track(index,natural=true){media.ended=false;Object.assign(state,{queueIndex:index,currentAudio:media,currentAudioId:state.queueAudioIds[index]});emit('audio:start',{audioId:state.currentAudioId});if(natural){media.ended=true;const calls=(listeners.ended||[]).splice(0);calls.forEach(fn=>fn());}return media;}
 function finish(reason='queue_completed'){state.currentAudioId=null;emit('audio:end',{reason,audioId:'b.bible'});}
 return {nodes,state,emit,track,finish,context};
}
let t=setup(false);assert.equal(t.nodes.gomnaLibraryReturn.hidden,false);assert.equal(t.nodes.anchor.after,t.nodes.gomnaLibraryReturn);assert.equal(t.nodes.gomnaLibraryReturn.children[0].className,'daily-word-return-btn');assert.match(t.nodes.gomnaLibraryReturn.children[0].href,/#bible-library\/people\/abraham$/);
t=setup();assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);t.track(0);assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);t.track(1);t.finish();assert.equal(t.nodes.gomnaLibraryReturn.hidden,false);
for(const action of ['skip','error','closed','cancel','wrong-epoch']){t=setup();if(action!=='skip')t.track(0);t.track(1);if(action==='error')t.emit('audio:error');if(action==='closed')t.emit('gomna:bible-listen-closed');if(action==='cancel')t.state.playbackCancelled=true;if(action==='wrong-epoch')t.state.queueEpoch++;t.finish();assert.equal(t.nodes.gomnaLibraryReturn.hidden,true,action);}
t=setup();t.track(0);t.track(1,false);t.finish();assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);
t=setup();t.track(0,false);t.track(1);t.finish();assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);
t=setup(false);t.context.currentChapter=13;t.emit('gomna:verse_list_rendered');assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);
t=setup(false,'?book=창세기');assert.equal(t.nodes.gomnaLibraryReturn,undefined);
const ctx={window:{},URLSearchParams};vm.runInNewContext(fs.readFileSync('js/gomna-bible-library-data.js','utf8'),ctx);
const init="  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();";
vm.runInNewContext(fs.readFileSync('js/gomna-bible-library.js','utf8').replace(init,'window.url=readerUrl;'),ctx);
for(const item of ctx.window.GOMNA_BIBLE_LIBRARY_DATA)for(const listen of [true,false]){const u=new URL(ctx.window.url(item,listen),'https://example.test/');assert.equal(u.searchParams.get('libraryId'),item.id);assert.equal(u.searchParams.get('libraryKind'),item.kind);assert.equal(u.searchParams.get('libraryName'),item.name);assert.equal(u.searchParams.get('listen'),listen?'1':null);}
const esther=ctx.window.GOMNA_BIBLE_LIBRARY_DATA.find(i=>i.id==='esther');
assert.ok(esther);
const estherListen=new URL(ctx.window.url(esther,true),'https://example.test/');
assert.equal(estherListen.searchParams.get('startVerse'),'13');
assert.equal(estherListen.searchParams.get('endVerse'),'17');
const engineSource=fs.readFileSync('js/audio-engine.js','utf8');
const method=engineSource.match(/playAudioRange: function\(bookId, chapter, startVerse, endVerse\) \{[\s\S]*?\n    \},/);
assert.ok(method);
const playRange=vm.runInNewContext('('+method[0].replace(/^playAudioRange:\s*/,'').replace(/,$/,'')+')',{
 document:{querySelectorAll:()=>Array.from({length:20},(_,i)=>({getAttribute:k=>k==='data-verse'?String(i+1):null}))},
 window:{GOMNA_AUDIO_ENGINE:{playAudioQueue:ids=>{assert.equal(ids.length,5);assert.deepEqual(Array.from(ids),[13,14,15,16,17].map(n=>'17.004.'+String(n).padStart(3,'0')+'.bible'));return true;}}}
});
assert.equal(playRange('17',4,13,17),true);
console.log('PASS: 78 links and Esther 4:13–17 exact five-track queue, read return, full playback return with reused Audio and capture before source reset, partial/error/close/cancel/stale completion guards, chapter navigation, ordinary Reader isolation.');
