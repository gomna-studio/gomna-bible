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
 function track(index,natural=true){const listeners={};const media={paused:false,readyState:4,ended:false,error:null,addEventListener:(n,fn)=>(listeners[n]??=[]).push(fn)};Object.assign(state,{queueIndex:index,currentAudio:media,currentAudioId:state.queueAudioIds[index]});emit('audio:start',{audioId:state.currentAudioId});if(natural){media.ended=true;(listeners.ended||[]).forEach(fn=>fn());}return media;}
 function finish(reason='queue_completed'){state.currentAudioId=null;emit('audio:end',{reason,audioId:'b.bible'});}
 return {nodes,state,emit,track,finish,context};
}
let t=setup(false);assert.equal(t.nodes.gomnaLibraryReturn.hidden,false);assert.equal(t.nodes.anchor.after,t.nodes.gomnaLibraryReturn);assert.equal(t.nodes.gomnaLibraryReturn.children[0].className,'daily-word-return-btn');assert.match(t.nodes.gomnaLibraryReturn.children[0].href,/#bible-library\/people\/abraham$/);
t=setup();assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);t.track(0);assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);t.track(1);t.finish();assert.equal(t.nodes.gomnaLibraryReturn.hidden,false);
for(const action of ['skip','error','closed','cancel','wrong-epoch']){t=setup();if(action!=='skip')t.track(0);t.track(1);if(action==='error')t.emit('audio:error');if(action==='closed')t.emit('gomna:bible-listen-closed');if(action==='cancel')t.state.playbackCancelled=true;if(action==='wrong-epoch')t.state.queueEpoch++;t.finish();assert.equal(t.nodes.gomnaLibraryReturn.hidden,true,action);}
t=setup();t.track(0);t.track(1,false);t.finish();assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);
t=setup(false);t.context.currentChapter=13;t.emit('gomna:verse_list_rendered');assert.equal(t.nodes.gomnaLibraryReturn.hidden,true);
t=setup(false,'?book=창세기');assert.equal(t.nodes.gomnaLibraryReturn,undefined);
const ctx={window:{},URLSearchParams};vm.runInNewContext(fs.readFileSync('js/gomna-bible-library-data.js','utf8'),ctx);
const init="  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();";
vm.runInNewContext(fs.readFileSync('js/gomna-bible-library.js','utf8').replace(init,'window.url=readerUrl;'),ctx);
for(const item of ctx.window.GOMNA_BIBLE_LIBRARY_DATA)for(const listen of [true,false]){const u=new URL(ctx.window.url(item,listen),'https://example.test/');assert.equal(u.searchParams.get('libraryId'),item.id);assert.equal(u.searchParams.get('libraryKind'),item.kind);assert.equal(u.searchParams.get('libraryName'),item.name);assert.equal(u.searchParams.get('listen'),listen?'1':null);}
console.log('PASS: 78 links, read return, full playback return, partial/error/close/cancel/stale completion guards, chapter navigation, ordinary Reader isolation.');
