import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../../js/gomna-audio-telemetry.js',import.meta.url),'utf8');
function setup(){
 let now=0,consent=true;const events=[],listeners={},timers=[];
 const state={queueEpoch:1};
 const window={GOMNA_AUDIO_ENGINE:{_state:state},GomnaGa4:{allowed:()=>consent,track:(n,p)=>{events.push({n,p});return true;}},addEventListener:(n,f)=>(listeners[n]??=[]).push(f)};
 vm.runInNewContext(code,{window,document:{addEventListener(){}},performance:{now:()=>now},setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){},Object,Number,String,Math});
 function media(){const h={};return {currentTime:0,paused:false,seeking:false,readyState:4,volume:1,playbackRate:1,addEventListener:(n,f)=>(h[n]??=new Set()).add(f),removeEventListener:(n,f)=>h[n]?.delete(f),emit:n=>[...(h[n]||[])].forEach(f=>f())};}
 const emit=(n,d={})=>(listeners[n]||[]).forEach(f=>f({detail:d}));
 const start=(audio=media(),id='genesis-1-1',continuous=false)=>{state.currentAudio=audio;state.currentAudioId=id;emit('audio:start',{audioId:id,entry:{bookId:'genesis',chapter:1,verse:1,type:'bible'},continuous});return audio;};
 return {events,emit,start,advance:(ms)=>now+=ms,consent:v=>consent=v,timers,state};
}
test('successful play, pause, resume: only progressing seconds are sent',()=>{
 const p=setup(),a=p.start();p.advance(300);a.emit('playing');
 p.advance(4000);a.currentTime=4;a.emit('timeupdate');a.emit('pause');
 p.advance(60000);a.emit('playing');p.advance(2000);a.currentTime=6;p.emit('audio:end');
 assert.equal(p.events.filter(e=>e.n==='audio_play').length,1);
 assert.equal(p.events.find(e=>e.n==='audio_play').p.startup_ms,300);
 assert.equal(p.events.filter(e=>e.n==='audio_listen').reduce((s,e)=>s+e.p.listen_seconds,0),6);
});
test('seek, buffering and muted time are not listening',()=>{
 const p=setup(),a=p.start();a.emit('playing');p.advance(1000);a.currentTime=1;a.emit('timeupdate');
 a.seeking=true;a.emit('seeking');a.currentTime=50;a.seeking=false;a.emit('seeked');
 a.emit('waiting');p.advance(20000);a.emit('playing');a.muted=true;p.advance(3000);a.currentTime=53;a.emit('timeupdate');
 a.muted=false;p.advance(1000);a.currentTime=54;p.emit('audio:end');
 assert.equal(p.events.filter(e=>e.n==='audio_listen').reduce((s,e)=>s+e.p.listen_seconds,0),2);
});
test('no consent or revoked consent sends no listening data',()=>{
 const p=setup();p.consent(false);const a=p.start();a.emit('playing');p.advance(5000);a.currentTime=5;p.emit('audio:end');assert.equal(p.events.length,0);
 p.consent(true);const b=p.start();b.emit('playing');p.advance(3000);b.currentTime=3;p.consent(false);p.emit('audio:end');assert.equal(p.events.filter(e=>e.n==='audio_listen').length,0);
});
test('continuous verse changes count success even without another native playing',()=>{
 const p=setup(),a=p.start();a.emit('playing');p.advance(3000);a.currentTime=3;p.start(a,'genesis-1-2',true);
 assert.equal(p.events.filter(e=>e.n==='audio_play').length,2);
 assert.equal(p.events.find(e=>e.n==='audio_listen').p.listen_seconds,3);
});
test('stale media cannot create successful plays; failure before start is visible',()=>{
 const p=setup(),a=p.start();const b=p.start(undefined,'genesis-1-2');a.emit('playing');assert.equal(p.events.filter(e=>e.n==='audio_play').length,0);
 p.emit('audio:error',{audioId:'missing',reason:'not_found'});assert.equal(p.events.filter(e=>e.n==='audio_failure').length,1);
 b.emit('playing');assert.equal(p.events.filter(e=>e.n==='audio_play').length,1);
});
test('2x speed reports elapsed listening time, not content duration',()=>{
 const p=setup(),a=p.start();a.playbackRate=2;a.emit('playing');p.advance(5000);a.currentTime=10;p.emit('audio:end');assert.equal(p.events.find(e=>e.n==='audio_listen').p.listen_seconds,5);
});

test('early engine attempts and preparation blocks are counted separately from playback',()=>{
 const p=setup();p.emit('audio:attempt',{audioId:'john-1-1',source:'chapter',fromQueue:true});
 p.emit('audio:blocked',{audioId:'john-1-1',reason:'manifest_loading'});
 assert.equal(p.events.filter(e=>e.n==='audio_attempt').length,1);
 assert.equal(p.events.find(e=>e.n==='audio_blocked').p.reason,'manifest_loading');
 assert.equal(p.events.filter(e=>e.n==='audio_play').length,0);
 p.consent(false);p.emit('audio:attempt',{audioId:'john-1-2'});p.emit('audio:blocked',{reason:'manifest_loading'});
 assert.equal(p.events.length,2);
});
test('startup latency includes time from engine attempt until actual playing',()=>{
 const p=setup();p.emit('audio:attempt',{audioId:'genesis-1-1'});p.advance(500);
 const a=p.start();p.advance(300);a.emit('playing');
 assert.equal(p.events.find(e=>e.n==='audio_play').p.startup_ms,800);
});
